package svc

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
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
	CreatedAt  string   `json:"createdAt,omitempty"`
	UpdatedAt  string   `json:"updatedAt,omitempty"`
}

type ProgressStoreType map[string]TaskProgress

type backupRuntimeConfig struct {
	Dockercopilot map[string]interface{} `json:"dockercopilot"`
	Telegram      map[string]interface{} `json:"telegram"`
}

func NewServiceContext(c config.Config) *ServiceContext {
	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		logx.Errorf("Unable to create docker client: %s", err)
	}
	ctx := &ServiceContext{
		Config:        c,
		HubImageInfo:  module.NewImageCheck(),
		ProgressStore: make(ProgressStoreType),
		DockerClient:  cli,
		BackupCron: cron.New(cron.WithParser(cron.NewParser(
			cron.Minute | cron.Hour | cron.Dom | cron.Month | cron.Dow,
		))),
	}
	if err := ctx.loadPersistentRuntimeLogs(); err != nil {
		logx.Errorf("加载运行日志失败: %v", err)
	}
	return ctx
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

func (ctx *ServiceContext) ClearHubImageUpdate(imageID string) {
	ctx.mu.Lock()
	defer ctx.mu.Unlock()
	delete(ctx.HubImageInfo.Data, imageID)
}

func (ctx *ServiceContext) ClearHubImageUpdates(imageIDs ...string) {
	ctx.mu.Lock()
	defer ctx.mu.Unlock()
	for _, imageID := range imageIDs {
		if imageID == "" {
			continue
		}
		delete(ctx.HubImageInfo.Data, imageID)
	}
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

func (ctx *ServiceContext) IsUpdateCheckRunning() bool {
	ctx.mu.Lock()
	defer ctx.mu.Unlock()
	return ctx.UpdateCheckRunning
}

func (ctx *ServiceContext) UpdateCheckStatus() (running bool, last time.Time) {
	ctx.mu.Lock()
	defer ctx.mu.Unlock()
	return ctx.UpdateCheckRunning, ctx.UpdateCheckLast
}

func (ctx *ServiceContext) UpdateProgress(taskID string, progress TaskProgress) {
	ctx.mu.Lock()
	defer ctx.mu.Unlock()
	now := time.Now().Format("2006-01-02 15:04:05")
	if progress.TaskID == "" {
		progress.TaskID = taskID
	}
	if existing, ok := ctx.ProgressStore[taskID]; ok && existing.CreatedAt != "" {
		progress.CreatedAt = existing.CreatedAt
	}
	if progress.CreatedAt == "" {
		progress.CreatedAt = now
	}
	progress.UpdatedAt = now
	ctx.ProgressStore[taskID] = progress
	ctx.persistProgressLocked()
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
	progress.UpdatedAt = time.Now().Format("2006-01-02 15:04:05")
	ctx.ProgressStore[taskID] = progress
	ctx.persistProgressLocked()
}

func (ctx *ServiceContext) AddOperationLog(kind string, title string, message string) {
	ctx.mu.Lock()
	defer ctx.mu.Unlock()
	entry := OperationLog{
		Time:    time.Now().Format("2006-01-02 15:04:05"),
		Type:    kind,
		Title:   title,
		Message: message,
	}
	ctx.OperationLogs = append(ctx.OperationLogs, entry)
	if len(ctx.OperationLogs) > 500 {
		ctx.OperationLogs = ctx.OperationLogs[len(ctx.OperationLogs)-500:]
	}
	ctx.persistOperationLogLocked(entry)
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

func (ctx *ServiceContext) ListProgress(limit int) []TaskProgress {
	ctx.mu.Lock()
	defer ctx.mu.Unlock()
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	items := make([]TaskProgress, 0, len(ctx.ProgressStore))
	for _, progress := range ctx.ProgressStore {
		items = append(items, progress)
	}
	sort.Slice(items, func(i, j int) bool {
		return items[i].UpdatedAt > items[j].UpdatedAt
	})
	if len(items) > limit {
		items = items[:limit]
	}
	return items
}

func (ctx *ServiceContext) loadPersistentRuntimeLogs() error {
	ctx.mu.Lock()
	defer ctx.mu.Unlock()
	if err := ctx.loadOperationLogsLocked(); err != nil {
		return err
	}
	if err := ctx.loadProgressStoreLocked(); err != nil {
		return err
	}
	return nil
}

func (ctx *ServiceContext) loadOperationLogsLocked() error {
	path := runtimeLogFile("operation.jsonl")
	file, err := os.Open(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	defer file.Close()

	logs := []OperationLog{}
	scanner := bufio.NewScanner(file)
	scanner.Buffer(make([]byte, 1024), 1024*1024)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		var item OperationLog
		if err := json.Unmarshal([]byte(line), &item); err != nil {
			continue
		}
		logs = append(logs, item)
	}
	if err := scanner.Err(); err != nil {
		return err
	}
	if len(logs) > 500 {
		logs = logs[len(logs)-500:]
	}
	ctx.OperationLogs = logs
	return nil
}

func (ctx *ServiceContext) loadProgressStoreLocked() error {
	path := runtimeLogFile("tasks.json")
	b, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	var items []TaskProgress
	if err := json.Unmarshal(b, &items); err != nil {
		return err
	}
	sort.Slice(items, func(i, j int) bool {
		return items[i].UpdatedAt > items[j].UpdatedAt
	})
	if len(items) > 200 {
		items = items[:200]
	}
	ctx.ProgressStore = make(ProgressStoreType)
	for _, item := range items {
		if strings.TrimSpace(item.TaskID) == "" {
			continue
		}
		ctx.ProgressStore[item.TaskID] = item
	}
	return nil
}

func (ctx *ServiceContext) persistOperationLogLocked(entry OperationLog) {
	path := runtimeLogFile("operation.jsonl")
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		logx.Errorf("创建操作日志目录失败: %v", err)
		return
	}
	file, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if err != nil {
		logx.Errorf("写入操作日志失败: %v", err)
		return
	}
	defer file.Close()
	b, err := json.Marshal(entry)
	if err != nil {
		logx.Errorf("序列化操作日志失败: %v", err)
		return
	}
	if _, err := file.Write(append(b, '\n')); err != nil {
		logx.Errorf("写入操作日志失败: %v", err)
	}
}

func (ctx *ServiceContext) persistProgressLocked() {
	path := runtimeLogFile("tasks.json")
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		logx.Errorf("创建任务日志目录失败: %v", err)
		return
	}
	items := make([]TaskProgress, 0, len(ctx.ProgressStore))
	for _, progress := range ctx.ProgressStore {
		items = append(items, progress)
	}
	sort.Slice(items, func(i, j int) bool {
		return items[i].UpdatedAt > items[j].UpdatedAt
	})
	if len(items) > 200 {
		items = items[:200]
	}
	b, err := json.MarshalIndent(items, "", "  ")
	if err != nil {
		logx.Errorf("序列化任务日志失败: %v", err)
		return
	}
	if err := os.WriteFile(path, b, 0644); err != nil {
		logx.Errorf("写入任务日志失败: %v", err)
	}
}

func runtimeLogFile(name string) string {
	return filepath.Join(runtimeLogDir(), "runtime", name)
}

func runtimeLogDir() string {
	if logDir := strings.TrimSpace(os.Getenv("DOCKERCOPILOT_LOG_DIR")); logDir != "" {
		return logDir
	}
	if cfg, err := LoadRuntimeConfigForRead(); err == nil && cfg.Dockercopilot != nil {
		if logDir := strings.TrimSpace(fmt.Sprint(cfg.Dockercopilot["service_log_dir"])); logDir != "" {
			return logDir
		}
	}
	return "./logs"
}

func (ctx *ServiceContext) BackupMaxFiles() int {
	cfg, err := LoadRuntimeConfigForRead()
	if err != nil {
		return 20
	}
	maxFiles := asInt(cfg.Telegram["backup_max_files"], 20)
	if maxFiles <= 0 {
		return 20
	}
	if maxFiles > 200 {
		return 200
	}
	return maxFiles
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

	cfg, err := LoadRuntimeConfigForRead()
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

	if tasks, ok := telegram["scheduled_container_tasks"].([]interface{}); ok {
		for _, raw := range tasks {
			task, ok := raw.(map[string]interface{})
			if !ok {
				continue
			}
			if !asBoolWithDefault(task["enabled"], true) {
				continue
			}
			spec := strings.TrimSpace(asString(task["cron"], ""))
			containerID := strings.TrimSpace(asString(task["containerID"], ""))
			action := strings.TrimSpace(asString(task["action"], ""))
			name := strings.TrimSpace(asString(task["containerName"], containerID))
			if spec == "" || containerID == "" || action == "" {
				continue
			}
			if _, err := ctx.BackupCron.AddFunc(spec, func() {
				if err := ctx.runScheduledContainerTask(containerID, action, name); err != nil {
					logx.Errorf("定时容器任务失败: container=%s action=%s err=%v", name, action, err)
				}
			}); err != nil {
				return err
			}
		}
	}

	ctx.BackupCron.Start()
	return nil
}

func asBoolWithDefault(v interface{}, fallback bool) bool {
	if v == nil {
		return fallback
	}
	return asBool(v)
}

func (ctx *ServiceContext) runScheduledContainerTask(containerID string, action string, name string) error {
	ctx.AddOperationLog("automation", "执行定时容器任务", name+" "+action)
	switch action {
	case "start":
		if err := ctx.DockerClient.ContainerStart(context.Background(), containerID, container.StartOptions{}); err != nil {
			ctx.AddOperationLog("automation", "定时启动失败", name+": "+err.Error())
			return err
		}
	case "stop":
		timeout := 10
		if err := ctx.DockerClient.ContainerStop(context.Background(), containerID, container.StopOptions{Signal: "SIGINT", Timeout: &timeout}); err != nil {
			ctx.AddOperationLog("automation", "定时停止失败", name+": "+err.Error())
			return err
		}
	case "restart":
		timeout := 10
		if err := ctx.DockerClient.ContainerRestart(context.Background(), containerID, container.StopOptions{Signal: "SIGINT", Timeout: &timeout}); err != nil {
			ctx.AddOperationLog("automation", "定时重启失败", name+": "+err.Error())
			return err
		}
	default:
		return fmt.Errorf("unsupported scheduled container action: %s", action)
	}
	ctx.AddOperationLog("automation", "定时容器任务完成", name+" "+action)
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
	if err := os.WriteFile(filepath.Join(backupDir, fileName), jsonData, 0644); err != nil {
		return err
	}
	return ctx.pruneBackups()
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
	if err := backupCompose.DockerConfig2ComposeYaml(containerJSONs); err != nil {
		return err
	}
	return ctx.pruneBackups()
}

func (ctx *ServiceContext) pruneBackups() error {
	backupDir := os.Getenv("BACKUP_DIR")
	if backupDir == "" {
		backupDir = "/data/backups"
	}
	entries, err := os.ReadDir(backupDir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	type backupFile struct {
		name    string
		path    string
		modTime int64
	}
	files := make([]backupFile, 0)
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		name := entry.Name()
		lower := strings.ToLower(name)
		if !strings.HasPrefix(name, "backup-") || !(strings.HasSuffix(lower, ".json") || strings.HasSuffix(lower, ".yaml") || strings.HasSuffix(lower, ".yml")) {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			continue
		}
		files = append(files, backupFile{name: name, path: filepath.Join(backupDir, name), modTime: info.ModTime().UnixNano()})
	}
	maxFiles := ctx.BackupMaxFiles()
	if len(files) <= maxFiles {
		return nil
	}
	sort.Slice(files, func(i, j int) bool {
		if files[i].modTime == files[j].modTime {
			return files[i].name > files[j].name
		}
		return files[i].modTime > files[j].modTime
	})
	for _, file := range files[maxFiles:] {
		if err := os.Remove(file.path); err != nil && !os.IsNotExist(err) {
			return err
		}
	}
	return nil
}

func (ctx *ServiceContext) RunJSONBackupNow() error {
	return ctx.runJSONBackup()
}

func (ctx *ServiceContext) RunComposeBackupNow() error {
	return ctx.runComposeBackup()
}

func LoadRuntimeConfigForRead() (backupRuntimeConfig, error) {
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
	if cfg.Dockercopilot == nil {
		cfg.Dockercopilot = map[string]interface{}{}
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

func asInt(v interface{}, fallback int) int {
	switch t := v.(type) {
	case int:
		return t
	case int64:
		return int(t)
	case float64:
		return int(t)
	case string:
		if n, err := strconv.Atoi(strings.TrimSpace(t)); err == nil {
			return n
		}
	}
	return fallback
}

func asString(v interface{}, fallback string) string {
	if s, ok := v.(string); ok && strings.TrimSpace(s) != "" {
		return s
	}
	return fallback
}

func StringList(v interface{}) []string {
	out := []string{}
	switch t := v.(type) {
	case []string:
		for _, item := range t {
			if s := strings.TrimSpace(item); s != "" {
				out = append(out, s)
			}
		}
	case []interface{}:
		for _, item := range t {
			if s := strings.TrimSpace(asString(item, "")); s != "" {
				out = append(out, s)
			}
		}
	case string:
		for _, item := range strings.FieldsFunc(t, func(r rune) bool { return r == ',' || r == '\n' || r == '\r' || r == ';' }) {
			if s := strings.TrimSpace(item); s != "" {
				out = append(out, s)
			}
		}
	}
	return out
}
