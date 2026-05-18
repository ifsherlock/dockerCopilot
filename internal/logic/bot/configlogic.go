package bot

import (
	"context"
	"encoding/json"
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
			"bot_token":              "",
			"chat_ids":               []string{},
			"polling_interval":       1,
			"update_check_cron":      "0 18 * * *",
			"notify_on_update":       true,
			"update_blacklist":       []string{},
			"auto_clean_images":      false,
			"clean_images_cron":      "3 2 * * *",
			"auto_update_containers": false,
			"update_containers_cron": "0 */6 * * *",
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
	cfg.Telegram["proxy"] = map[string]interface{}{
		"type":     req.ProxyType,
		"host":     req.ProxyHost,
		"port":     req.ProxyPort,
		"username": req.ProxyUsername,
		"password": req.ProxyPassword,
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
