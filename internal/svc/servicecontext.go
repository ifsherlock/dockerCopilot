package svc

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	dockerTypes "github.com/docker/docker/api/types"
	dockerBackend "github.com/docker/docker/api/types/backend"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/network"
	"github.com/docker/docker/client"
	"github.com/onlyLTY/dockerCopilot/internal/config"
	"github.com/onlyLTY/dockerCopilot/internal/module"
	backupCompose "github.com/onlyLTY/dockerCopilot/internal/utiles/backup_compose"
	"github.com/robfig/cron/v3"
	"github.com/zeromicro/go-zero/core/logx"
	"github.com/zeromicro/go-zero/rest"
)

type ServiceContext struct {
	Config                     config.Config
	CookieCheckMiddleware      rest.Middleware
	Jwtuuid                    string
	BearerTokenCheckMiddleware rest.Middleware
	JwtSecret                  string
	PortainerJwt               string
	HubImageInfo               *module.ImageUpdateData
	IndexCheckMiddleware       rest.Middleware
	ProgressStore              ProgressStoreType
	DockerClient               *client.Client
	BackupCron                 *cron.Cron
	OperationLogs              []OperationLog
	UpdateCheckRunning         bool
	UpdateCheckLast            time.Time
	mu                         sync.Mutex
}

type OperationLog struct {
	Time    string `json:"time"`
	Type    string `json:"type"`
	Title   string `json:"title"`
	Message string `json:"message"`
}

type TaskProgress struct {
	TaskID     string   `json:"taskID"`
	Percentage int      `json:"percentage"`
	Message    string   `json:"message"`
	Name       string   `json:"name"`
	DetailMsg  string   `json:"detailMsg"`
	IsDone     bool     `json:"isDone"`
	Logs       []string `json:"logs"`
}

type ProgressStoreType map[string]TaskProgress

type backupRuntimeConfig struct {
	Telegram map[string]interface{} `json:"telegram"`
}

func NewServiceContext(c config.Config) *ServiceContext {
	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		logx.Errorf("Unable to create docker client: %s", err)
	}
	return &ServiceContext{
		Config:        c,
		HubImageInfo:  module.NewImageCheck(),
		ProgressStore: make(ProgressStoreType),
		DockerClient:  cli,
		BackupCron: cron.New(cron.WithParser(cron.NewParser(
			cron.Minute | cron.Hour | cron.Dom | cron.Month | cron.Dow,
		))),
	}
}

func (ctx *ServiceContext) GetHubImageUpdate(imageID string) (bool, bool) {
	ctx.mu.Lock()
	defer ctx.mu.Unlock()
	cached, ok := ctx.HubImageInfo.Data[imageID]
	if !ok {
		return false, false
	}
	return cached.NeedUpdate, true
}

func (ctx *ServiceContext) SetHubImageUpdate(imageID string, needUpdate bool) {
	ctx.mu.Lock()
	defer ctx.mu.Unlock()
	ctx.HubImageInfo.Data[imageID] = module.ImageCheckList{NeedUpdate: needUpdate}
}

func (ctx *ServiceContext) TryStartUpdateCheck(cooldown time.Duration) bool {
	ctx.mu.Lock()
	defer ctx.mu.Unlock()
	if ctx.UpdateCheckRunning || time.Since(ctx.UpdateCheckLast) < cooldown {
		return false
	}
	ctx.UpdateCheckRunning = true
	ctx.UpdateCheckLast = time.Now()
	return true
}

func (ctx *ServiceContext) FinishUpdateCheck() {
	ctx.mu.Lock()
	defer ctx.mu.Unlock()
	ctx.UpdateCheckRunning = false
}

func (ctx *ServiceContext) UpdateProgress(taskID string, progress TaskProgress) {
	ctx.mu.Lock()
	defer ctx.mu.Unlock()
	ctx.ProgressStore[taskID] = progress
}

func (ctx *ServiceContext) AppendProgressLog(taskID string, line string) {
	ctx.mu.Lock()
	defer ctx.mu.Unlock()
	progress, ok := ctx.ProgressStore[taskID]
	if !ok {
		return
	}
	line = strings.TrimSpace(line)
	if line == "" {
		return
	}
	progress.Logs = append(progress.Logs, line)
	if len(progress.Logs) > 200 {
		progress.Logs = progress.Logs[len(progress.Logs)-200:]
	}
	progress.DetailMsg = strings.Join(progress.Logs, "\n")
	ctx.ProgressStore[taskID] = progress
}

func (ctx *ServiceContext) AddOperationLog(kind string, title string, message string) {
	ctx.mu.Lock()
	defer ctx.mu.Unlock()
	ctx.OperationLogs = append(ctx.OperationLogs, OperationLog{
		Time:    time.Now().Format("2006-01-02 15:04:05"),
		Type:    kind,
		Title:   title,
		Message: message,
	})
	if len(ctx.OperationLogs) > 500 {
		ctx.OperationLogs = ctx.OperationLogs[len(ctx.OperationLogs)-500:]
	}
}

func (ctx *ServiceContext) GetOperationLogs() []OperationLog {
	ctx.mu.Lock()
	defer ctx.mu.Unlock()
	logs := make([]OperationLog, len(ctx.OperationLogs))
	copy(logs, ctx.OperationLogs)
	return logs
}

func (ctx *ServiceContext) GetProgress(taskID string) (TaskProgress, bool) {
	ctx.mu.Lock()
	defer ctx.mu.Unlock()
	progress, ok := ctx.ProgressStore[taskID]
	return progress, ok
}

func (ctx *ServiceContext) ReloadBackupSchedulers() error {
	ctx.mu.Lock()
	defer ctx.mu.Unlock()

	if ctx.BackupCron == nil {
		ctx.BackupCron = cron.New(cron.WithParser(cron.NewParser(
			cron.Minute | cron.Hour | cron.Dom | cron.Month | cron.Dow,
		)))
	}

	ctx.BackupCron.Stop()
	ctx.BackupCron = cron.New(cron.WithParser(cron.NewParser(
		cron.Minute | cron.Hour | cron.Dom | cron.Month | cron.Dow,
	)))

	cfg, err := loadBackupRuntimeConfig()
	if err != nil {
		return err
	}

	telegram := cfg.Telegram
	if asBool(telegram["auto_backup_json"]) {
		spec := strings.TrimSpace(asString(telegram["backup_json_cron"], "0 1 * * *"))
		if spec != "" {
			if _, err := ctx.BackupCron.AddFunc(spec, func() {
				if err := ctx.runJSONBackup(); err != nil {
					logx.Errorf("定时 JSON 备份失败: %v", err)
				} else {
					logx.Infof("定时 JSON 备份完成")
				}
			}); err != nil {
				return err
			}
		}
	}

	if asBool(telegram["auto_backup_compose"]) {
		spec := strings.TrimSpace(asString(telegram["backup_compose_cron"], "30 1 * * *"))
		if spec != "" {
			if _, err := ctx.BackupCron.AddFunc(spec, func() {
				if err := ctx.runComposeBackup(); err != nil {
					logx.Errorf("定时 Compose 备份失败: %v", err)
				} else {
					logx.Infof("定时 Compose 备份完成")
				}
			}); err != nil {
				return err
			}
		}
	}

	ctx.BackupCron.Start()
	return nil
}

func (ctx *ServiceContext) runJSONBackup() error {
	containerList, err := ctx.DockerClient.ContainerList(context.Background(), container.ListOptions{All: true})
	if err != nil {
		return err
	}

	var backupList []dockerBackend.ContainerCreateConfig
	for _, v := range containerList {
		inspectedContainer, err := ctx.DockerClient.ContainerInspect(context.TODO(), v.ID)
		if err != nil {
			return err
		}
		containerName := "get container name error"
		if len(v.Names) > 0 {
			containerName = strings.TrimPrefix(v.Names[0], "/")
		}
		inspectedContainer.Config.Hostname = ""
		inspectedContainer.Image = inspectedContainer.Config.Image
		backupList = append(backupList, dockerBackend.ContainerCreateConfig{
			Config:           inspectedContainer.Config,
			HostConfig:       inspectedContainer.HostConfig,
			NetworkingConfig: &network.NetworkingConfig{EndpointsConfig: inspectedContainer.NetworkSettings.Networks},
			Name:             containerName,
		})
	}

	jsonData, err := json.MarshalIndent(backupList, "", "  ")
	if err != nil {
		return err
	}
	backupDir := os.Getenv("BACKUP_DIR")
	if backupDir == "" {
		backupDir = "/data/backups"
	}
	if err := os.MkdirAll(backupDir, 0755); err != nil {
		return err
	}
	fileName := "backup-" + time.Now().Format("2006-01-02") + ".json"
	return os.WriteFile(filepath.Join(backupDir, fileName), jsonData, 0644)
}

func (ctx *ServiceContext) runComposeBackup() error {
	containerList, err := ctx.DockerClient.ContainerList(context.Background(), container.ListOptions{All: true})
	if err != nil {
		return err
	}
	var containerJSONs []dockerTypes.ContainerJSON
	for _, v := range containerList {
		inspectedContainer, err := ctx.DockerClient.ContainerInspect(context.TODO(), v.ID)
		if err != nil {
			return err
		}
		containerJSONs = append(containerJSONs, inspectedContainer)
	}
	return backupCompose.DockerConfig2ComposeYaml(containerJSONs)
}

func loadBackupRuntimeConfig() (backupRuntimeConfig, error) {
	path := strings.TrimSpace(os.Getenv("DOCKERCOPILOT_BOT_CONFIG"))
	if path == "" {
		path = "/app/config/config.json"
	}
	cfg := backupRuntimeConfig{Telegram: map[string]interface{}{}}
	b, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return cfg, nil
		}
		return cfg, err
	}
	if err := json.Unmarshal(b, &cfg); err != nil {
		return cfg, err
	}
	if cfg.Telegram == nil {
		cfg.Telegram = map[string]interface{}{}
	}
	return cfg, nil
}

func asBool(v interface{}) bool {
	switch t := v.(type) {
	case bool:
		return t
	case string:
		return strings.EqualFold(strings.TrimSpace(t), "true")
	default:
		return false
	}
}

func asString(v interface{}, fallback string) string {
	if s, ok := v.(string); ok && strings.TrimSpace(s) != "" {
		return s
	}
	return fallback
}
