package bot

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/onlyLTY/dockerCopilot/internal/svc"
	"github.com/onlyLTY/dockerCopilot/internal/types"
	"github.com/zeromicro/go-zero/core/logx"
)

type ConfigLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

func NewConfigLogic(ctx context.Context, svcCtx *svc.ServiceContext) *ConfigLogic {
	return &ConfigLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

type runtimeConfig struct {
	Version       string                 `json:"version"`
	Dockercopilot map[string]interface{} `json:"dockercopilot"`
	Telegram      map[string]interface{} `json:"telegram"`
}

func configPath() string {
	if p := strings.TrimSpace(os.Getenv("DOCKERCOPILOT_BOT_CONFIG")); p != "" {
		return p
	}
	return "/app/config/config.json"
}

func defaultConfig(secretKey string) runtimeConfig {
	apiURL := os.Getenv("DOCKERCOPILOT_API_URL")
	if apiURL == "" {
		apiURL = "http://127.0.0.1:12712"
	}
	if secretKey == "" {
		secretKey = os.Getenv("secretKey")
	}
	return runtimeConfig{
		Version: "1.0",
		Dockercopilot: map[string]interface{}{
			"default_instance": "local",
			"instances": []map[string]interface{}{
				{
					"name":       "local",
					"api_url":    apiURL,
					"secret_key": secretKey,
					"timeout":    30,
				},
			},
		},
		Telegram: map[string]interface{}{
			"bot_token":                 "",
			"chat_ids":                  []string{},
			"polling_interval":          1,
			"update_check_cron":         "0 18 * * *",
			"notify_on_update":          true,
			"update_blacklist":          []string{},
			"auto_clean_images":         false,
			"clean_images_cron":         "3 2 * * *",
			"auto_update_containers":    false,
			"update_containers_cron":    "0 */6 * * *",
			"auto_backup_json":          false,
			"backup_json_cron":          "0 1 * * *",
			"auto_backup_compose":       false,
			"backup_compose_cron":       "30 1 * * *",
			"image_accelerators":        []string{"docker.1ms.run", "docker.xuanyuan.me", "dockerproxy.com"},
			"default_image_accelerator": "docker.1ms.run",
			"proxy": map[string]interface{}{
				"type":     "none",
				"host":     "",
				"port":     0,
				"username": "",
				"password": "",
			},
		},
	}
}

func readConfig(secretKey string) (runtimeConfig, error) {
	cfg := defaultConfig(secretKey)
	b, err := os.ReadFile(configPath())
	if err != nil {
		if os.IsNotExist(err) {
			return cfg, nil
		}
		return cfg, err
	}
	if err := json.Unmarshal(b, &cfg); err != nil {
		return cfg, err
	}
	if cfg.Dockercopilot == nil {
		cfg.Dockercopilot = defaultConfig(secretKey).Dockercopilot
	}
	if cfg.Telegram == nil {
		cfg.Telegram = defaultConfig(secretKey).Telegram
	}
	return cfg, nil
}

func (l *ConfigLogic) GetConfig() (resp *types.Resp, err error) {
	resp = &types.Resp{}
	cfg, err := readConfig(l.svcCtx.Config.Auth.AccessSecret)
	if err != nil {
		resp.Code = 500
		resp.Msg = err.Error()
		resp.Data = map[string]interface{}{}
		return resp, nil
	}
	resp.Code = 200
	resp.Msg = "success"
	resp.Data = cfg
	return resp, nil
}

func (l *ConfigLogic) SaveConfig(req *types.BotConfigReq) (resp *types.Resp, err error) {
	resp = &types.Resp{}
	cfg, err := readConfig(l.svcCtx.Config.Auth.AccessSecret)
	if err != nil {
		resp.Code = 500
		resp.Msg = err.Error()
		resp.Data = map[string]interface{}{}
		return resp, nil
	}

	chatIDs := splitLinesOrComma(req.ChatIds)
	blacklist := splitLinesOrComma(req.UpdateBlacklist)
	cfg.Telegram["bot_token"] = req.BotToken
	cfg.Telegram["chat_ids"] = chatIDs
	cfg.Telegram["update_check_cron"] = req.UpdateCheckCron
	cfg.Telegram["notify_on_update"] = req.NotifyOnUpdate
	cfg.Telegram["update_blacklist"] = blacklist
	cfg.Telegram["auto_clean_images"] = req.AutoCleanImages
	cfg.Telegram["clean_images_cron"] = req.CleanImagesCron
	cfg.Telegram["auto_update_containers"] = req.AutoUpdateContainers
	cfg.Telegram["update_containers_cron"] = req.UpdateContainersCron
	cfg.Telegram["auto_backup_json"] = req.AutoBackupJson
	cfg.Telegram["backup_json_cron"] = req.BackupJsonCron
	cfg.Telegram["auto_backup_compose"] = req.AutoBackupCompose
	cfg.Telegram["backup_compose_cron"] = req.BackupComposeCron
	cfg.Telegram["image_accelerators"] = splitLinesOrComma(req.ImageAccelerators)
	cfg.Telegram["default_image_accelerator"] = strings.TrimSpace(req.DefaultImageAccelerator)
	cfg.Telegram["proxy"] = map[string]interface{}{
		"type":     req.ProxyType,
		"host":     req.ProxyHost,
		"port":     req.ProxyPort,
		"username": req.ProxyUsername,
		"password": req.ProxyPassword,
	}
	if strings.TrimSpace(req.DefaultInstance) != "" {
		cfg.Dockercopilot["default_instance"] = strings.TrimSpace(req.DefaultInstance)
	}
	if strings.TrimSpace(req.Instances) != "" {
		var instances []map[string]interface{}
		if err := json.Unmarshal([]byte(req.Instances), &instances); err != nil {
			resp.Code = 400
			resp.Msg = "instances 配置格式错误: " + err.Error()
			resp.Data = map[string]interface{}{}
			return resp, nil
		}
		cleaned := make([]map[string]interface{}, 0, len(instances))
		for _, inst := range instances {
			name := strings.TrimSpace(toString(inst["name"]))
			apiURL := strings.TrimSpace(toString(inst["api_url"]))
			if name == "" || apiURL == "" {
				continue
			}
			secretKey := toString(inst["secret_key"])
			timeout := toInt(inst["timeout"], 30)
			cleaned = append(cleaned, map[string]interface{}{
				"name":       name,
				"api_url":    apiURL,
				"secret_key": secretKey,
				"timeout":    timeout,
			})
		}
		if len(cleaned) > 0 {
			cfg.Dockercopilot["instances"] = cleaned
			if strings.TrimSpace(req.DefaultInstance) == "" {
				cfg.Dockercopilot["default_instance"] = cleaned[0]["name"]
			}
		}
	}

	path := configPath()
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		resp.Code = 500
		resp.Msg = err.Error()
		resp.Data = map[string]interface{}{}
		return resp, nil
	}
	b, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		resp.Code = 500
		resp.Msg = err.Error()
		resp.Data = map[string]interface{}{}
		return resp, nil
	}
	if err := os.WriteFile(path, b, 0600); err != nil {
		resp.Code = 500
		resp.Msg = err.Error()
		resp.Data = map[string]interface{}{}
		return resp, nil
	}
	if err := l.svcCtx.ReloadBackupSchedulers(); err != nil {
		resp.Code = 500
		resp.Msg = "配置已保存，但重载定时备份失败: " + err.Error()
		resp.Data = cfg
		return resp, nil
	}
	resp.Code = 200
	resp.Msg = "success"
	resp.Data = cfg
	return resp, nil
}

func splitLinesOrComma(s string) []string {
	fields := strings.FieldsFunc(s, func(r rune) bool { return r == ',' || r == '\n' || r == '\r' || r == ';' })
	out := make([]string, 0, len(fields))
	for _, f := range fields {
		if v := strings.TrimSpace(f); v != "" {
			out = append(out, v)
		}
	}
	return out
}

func toString(v interface{}) string {
	switch t := v.(type) {
	case string:
		return t
	case nil:
		return ""
	default:
		return fmt.Sprint(t)
	}
}

func toInt(v interface{}, fallback int) int {
	switch t := v.(type) {
	case int:
		return t
	case float64:
		return int(t)
	case json.Number:
		if n, err := t.Int64(); err == nil {
			return int(n)
		}
	}
	return fallback
}
