package bot

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
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
			"backup_max_files":          20,
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

func normalizeImageName(value string) string {
	v := strings.ToLower(strings.TrimSpace(value))
	v = strings.TrimPrefix(v, "http://")
	v = strings.TrimPrefix(v, "https://")
	for _, prefix := range []string{"registry-1.docker.io/", "docker.io/", "library/"} {
		v = strings.TrimPrefix(v, prefix)
	}
	if v == "" {
		return ""
	}
	slash := strings.LastIndex(v, "/")
	colon := strings.LastIndex(v, ":")
	if colon <= slash && !strings.Contains(v, "@") {
		v += ":latest"
	}
	return v
}

func normalizeList(items []string) []string {
	seen := make(map[string]struct{}, len(items))
	out := make([]string, 0, len(items))
	for _, item := range items {
		v := normalizeImageName(item)
		if v == "" {
			continue
		}
		if _, ok := seen[v]; ok {
			continue
		}
		seen[v] = struct{}{}
		out = append(out, v)
	}
	return out
}

func stringSliceFromInterface(v interface{}) []string {
	switch t := v.(type) {
	case []string:
		return normalizeList(t)
	case []interface{}:
		out := make([]string, 0, len(t))
		for _, item := range t {
			out = append(out, toString(item))
		}
		return normalizeList(out)
	case string:
		return splitLinesOrComma(t)
	default:
		return []string{}
	}
}

func (l *ConfigLogic) GetUpdateBlacklist() (resp *types.Resp, err error) {
	resp = &types.Resp{}
	cfg, err := readConfig(l.svcCtx.Config.Auth.AccessSecret)
	if err != nil {
		resp.Code = 500
		resp.Msg = err.Error()
		resp.Data = []string{}
		return resp, nil
	}
	resp.Code = 200
	resp.Msg = "success"
	resp.Data = stringSliceFromInterface(cfg.Telegram["update_blacklist"])
	return resp, nil
}

func (l *ConfigLogic) SaveUpdateBlacklist(req *types.UpdateBlacklistReq) (resp *types.Resp, err error) {
	resp = &types.Resp{}
	cfg, err := readConfig(l.svcCtx.Config.Auth.AccessSecret)
	if err != nil {
		resp.Code = 500
		resp.Msg = err.Error()
		resp.Data = []string{}
		return resp, nil
	}
	list := normalizeList(req.Items)
	cfg.Telegram["update_blacklist"] = list
	path := configPath()
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		resp.Code = 500
		resp.Msg = err.Error()
		resp.Data = []string{}
		return resp, nil
	}
	b, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		resp.Code = 500
		resp.Msg = err.Error()
		resp.Data = []string{}
		return resp, nil
	}
	if err := os.WriteFile(path, b, 0600); err != nil {
		resp.Code = 500
		resp.Msg = err.Error()
		resp.Data = []string{}
		return resp, nil
	}
	resp.Code = 200
	resp.Msg = "success"
	resp.Data = list
	return resp, nil
}

func normalizeCronExpr(expr string) string {
	return strings.Join(strings.Fields(strings.TrimSpace(expr)), " ")
}

func validateCronField(field string, min int, max int) error {
	if field == "" {
		return fmt.Errorf("不能为空")
	}
	for _, part := range strings.Split(field, ",") {
		if part == "" {
			return fmt.Errorf("列表里有空项")
		}
		pieces := strings.Split(part, "/")
		if len(pieces) > 2 {
			return fmt.Errorf("字段 %q 的 / 只能出现一次", field)
		}
		rangePart := pieces[0]
		if len(pieces) == 2 {
			step, err := strconv.Atoi(pieces[1])
			if err != nil || step <= 0 {
				return fmt.Errorf("步长 %q 无效", pieces[1])
			}
		}
		if rangePart == "*" {
			continue
		}
		if strings.Contains(rangePart, "-") {
			bounds := strings.Split(rangePart, "-")
			if len(bounds) != 2 {
				return fmt.Errorf("范围 %q 无效", rangePart)
			}
			start, err1 := strconv.Atoi(bounds[0])
			end, err2 := strconv.Atoi(bounds[1])
			if err1 != nil || err2 != nil || start > end || start < min || end > max {
				return fmt.Errorf("范围 %q 应在 %d-%d", rangePart, min, max)
			}
			continue
		}
		num, err := strconv.Atoi(rangePart)
		if err != nil || num < min || num > max {
			return fmt.Errorf("数值 %q 应在 %d-%d", rangePart, min, max)
		}
	}
	return nil
}

func validateCronExpr(label string, expr string) (string, error) {
	normalized := normalizeCronExpr(expr)
	fields := strings.Fields(normalized)
	if len(fields) != 5 {
		return normalized, fmt.Errorf("%s 必须是 5 段：分钟 小时 日期 月份 星期；当前是 %d 段。例：40 13 * * *", label, len(fields))
	}
	ranges := [][2]int{{0, 59}, {0, 23}, {1, 31}, {1, 12}, {0, 7}}
	for i, field := range fields {
		if err := validateCronField(field, ranges[i][0], ranges[i][1]); err != nil {
			return normalized, fmt.Errorf("%s 第 %d 段无效：%w", label, i+1, err)
		}
	}
	return normalized, nil
}

func existingString(m map[string]interface{}, key string, fallback string) string {
	if value, ok := m[key]; ok {
		if s := strings.TrimSpace(toString(value)); s != "" {
			return s
		}
	}
	return fallback
}

func requestOrExisting(value string, m map[string]interface{}, key string, fallback string) string {
	if strings.TrimSpace(value) != "" {
		return value
	}
	return existingString(m, key, fallback)
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

	// SaveConfig is used by multiple pages. Some pages only submit their own fields,
	// so missing cron fields must be merged from the current runtime config instead of
	// being treated as empty values or overwriting existing config.
	updateCheckCronReq := requestOrExisting(req.UpdateCheckCron, cfg.Telegram, "update_check_cron", "0 18 * * *")
	cleanImagesCronReq := requestOrExisting(req.CleanImagesCron, cfg.Telegram, "clean_images_cron", "3 2 * * *")
	updateContainersCronReq := requestOrExisting(req.UpdateContainersCron, cfg.Telegram, "update_containers_cron", "0 */6 * * *")
	backupJSONCronReq := requestOrExisting(req.BackupJsonCron, cfg.Telegram, "backup_json_cron", "0 1 * * *")
	backupComposeCronReq := requestOrExisting(req.BackupComposeCron, cfg.Telegram, "backup_compose_cron", "30 1 * * *")

	updateCheckCron, cronErr := validateCronExpr("更新检测 Cron", updateCheckCronReq)
	if cronErr != nil {
		resp.Code = 400
		resp.Msg = cronErr.Error()
		resp.Data = map[string]interface{}{}
		return resp, nil
	}
	cleanImagesCron, cronErr := validateCronExpr("清理 Cron", cleanImagesCronReq)
	if cronErr != nil {
		resp.Code = 400
		resp.Msg = cronErr.Error()
		resp.Data = map[string]interface{}{}
		return resp, nil
	}
	updateContainersCron, cronErr := validateCronExpr("自动更新 Cron", updateContainersCronReq)
	if cronErr != nil {
		resp.Code = 400
		resp.Msg = cronErr.Error()
		resp.Data = map[string]interface{}{}
		return resp, nil
	}
	backupJSONCron, cronErr := validateCronExpr("JSON 备份 Cron", backupJSONCronReq)
	if cronErr != nil {
		resp.Code = 400
		resp.Msg = cronErr.Error()
		resp.Data = map[string]interface{}{}
		return resp, nil
	}
	backupComposeCron, cronErr := validateCronExpr("YAML 备份 Cron", backupComposeCronReq)
	if cronErr != nil {
		resp.Code = 400
		resp.Msg = cronErr.Error()
		resp.Data = map[string]interface{}{}
		return resp, nil
	}
	backupMaxFiles := req.BackupMaxFiles
	if backupMaxFiles <= 0 {
		backupMaxFiles = toInt(cfg.Telegram["backup_max_files"], 20)
	}
	if backupMaxFiles <= 0 {
		backupMaxFiles = 20
	}
	if backupMaxFiles > 200 {
		resp.Code = 400
		resp.Msg = "备份最大份数必须在 1-200 之间"
		resp.Data = map[string]interface{}{}
		return resp, nil
	}

	chatIDs := splitLinesOrComma(req.ChatIds)
	cfg.Telegram["bot_token"] = req.BotToken
	cfg.Telegram["chat_ids"] = chatIDs
	cfg.Telegram["update_check_cron"] = updateCheckCron
	cfg.Telegram["notify_on_update"] = req.NotifyOnUpdate
	if strings.TrimSpace(req.UpdateBlacklist) != "" {
		cfg.Telegram["update_blacklist"] = normalizeList(splitLinesOrComma(req.UpdateBlacklist))
	} else if _, ok := cfg.Telegram["update_blacklist"]; !ok {
		cfg.Telegram["update_blacklist"] = []string{}
	}
	cfg.Telegram["auto_clean_images"] = req.AutoCleanImages
	cfg.Telegram["clean_images_cron"] = cleanImagesCron
	cfg.Telegram["auto_update_containers"] = req.AutoUpdateContainers
	cfg.Telegram["update_containers_cron"] = updateContainersCron
	backupFieldsPresent := strings.TrimSpace(req.BackupJsonCron) != "" || strings.TrimSpace(req.BackupComposeCron) != "" || req.BackupMaxFiles > 0
	if backupFieldsPresent {
		cfg.Telegram["auto_backup_json"] = req.AutoBackupJson
		cfg.Telegram["auto_backup_compose"] = req.AutoBackupCompose
	} else {
		if _, ok := cfg.Telegram["auto_backup_json"]; !ok {
			cfg.Telegram["auto_backup_json"] = false
		}
		if _, ok := cfg.Telegram["auto_backup_compose"]; !ok {
			cfg.Telegram["auto_backup_compose"] = false
		}
	}
	cfg.Telegram["backup_json_cron"] = backupJSONCron
	cfg.Telegram["backup_compose_cron"] = backupComposeCron
	cfg.Telegram["backup_max_files"] = backupMaxFiles
	if strings.TrimSpace(req.ImageAccelerators) != "" {
		cfg.Telegram["image_accelerators"] = splitLinesOrComma(req.ImageAccelerators)
	} else if _, ok := cfg.Telegram["image_accelerators"]; !ok {
		cfg.Telegram["image_accelerators"] = []string{}
	}
	if strings.TrimSpace(req.DefaultImageAccelerator) != "" {
		cfg.Telegram["default_image_accelerator"] = strings.TrimSpace(req.DefaultImageAccelerator)
	} else if _, ok := cfg.Telegram["default_image_accelerator"]; !ok {
		cfg.Telegram["default_image_accelerator"] = ""
	}
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
