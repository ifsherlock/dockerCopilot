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
			"multi_instance_enabled": false,
			"default_instance":       "local",
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
			"interactive_enabled":       true,
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
			"theme_mode":                "light",
			"theme_appearance":          "aurora",
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
	if cfg.Dockercopilot == nil {
		cfg.Dockercopilot = map[string]interface{}{}
	}
	if _, ok := cfg.Dockercopilot["host_lan_ip"]; !ok {
		cfg.Dockercopilot["host_lan_ip"] = ""
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

func isDisabledCronExpr(expr string) bool {
	s := strings.ToLower(normalizeCronExpr(expr))
	return s == "off" || s == "false" || s == "0" || s == "no"
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

func requestBoolOrExisting(req *types.BotConfigReq, field string, submitted bool, m map[string]interface{}, key string, fallback bool) bool {
	if req.HasField(field) {
		return submitted
	}
	if value, ok := m[key]; ok {
		return toBool(value, fallback)
	}
	return fallback
}

func hasAnyConfigPayload(req *types.BotConfigReq) bool {
	if req != nil && req.PresentFields != nil && len(req.PresentFields) > 0 {
		return true
	}
	return strings.TrimSpace(req.BotToken) != "" ||
		strings.TrimSpace(req.ChatIds) != "" ||
		strings.TrimSpace(req.UpdateCheckCron) != "" ||
		strings.TrimSpace(req.UpdateBlacklist) != "" ||
		strings.TrimSpace(req.CleanImagesCron) != "" ||
		strings.TrimSpace(req.UpdateContainersCron) != "" ||
		strings.TrimSpace(req.BackupJsonCron) != "" ||
		strings.TrimSpace(req.BackupComposeCron) != "" ||
		req.BackupMaxFiles > 0 ||
		strings.TrimSpace(req.ImageAccelerators) != "" ||
		strings.TrimSpace(req.DefaultImageAccelerator) != "" ||
		strings.TrimSpace(req.ProxyType) != "" ||
		strings.TrimSpace(req.ProxyHost) != "" ||
		req.ProxyPort > 0 ||
		strings.TrimSpace(req.ProxyUsername) != "" ||
		strings.TrimSpace(req.ProxyPassword) != "" ||
		strings.TrimSpace(req.HostLanIP) != "" ||
		strings.TrimSpace(req.DefaultInstance) != "" ||
		strings.TrimSpace(req.Instances) != "" ||
		strings.TrimSpace(req.ThemeMode) != "" ||
		strings.TrimSpace(req.ThemeAppearance) != "" ||
		req.NotifyOnUpdate || req.InteractiveEnabled || req.AutoCleanImages || req.AutoUpdateContainers || req.AutoBackupJson || req.AutoBackupCompose || req.MultiInstanceEnabled
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
	// so missing fields must be merged from the current runtime config instead of
	// being treated as empty values or overwriting existing config.
	preserveExisting := hasAnyConfigPayload(req)
	updateCheckCronReq := requestOrExisting(req.UpdateCheckCron, cfg.Telegram, "update_check_cron", "0 18 * * *")
	cleanImagesCronReq := requestOrExisting(req.CleanImagesCron, cfg.Telegram, "clean_images_cron", "3 2 * * *")
	updateContainersCronReq := requestOrExisting(req.UpdateContainersCron, cfg.Telegram, "update_containers_cron", "0 */6 * * *")
	backupJSONCronReq := requestOrExisting(req.BackupJsonCron, cfg.Telegram, "backup_json_cron", "0 1 * * *")
	backupComposeCronReq := requestOrExisting(req.BackupComposeCron, cfg.Telegram, "backup_compose_cron", "30 1 * * *")

	updateCheckCron := normalizeCronExpr(updateCheckCronReq)
	if isDisabledCronExpr(updateCheckCron) {
		updateCheckCron = "off"
	} else {
		var cronErr error
		updateCheckCron, cronErr = validateCronExpr("更新检测 Cron", updateCheckCronReq)
		if cronErr != nil {
			resp.Code = 400
			resp.Msg = cronErr.Error()
			resp.Data = map[string]interface{}{}
			return resp, nil
		}
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
	if len(chatIDs) == 0 {
		if raw, ok := cfg.Telegram["chat_ids"]; ok {
			b, _ := json.Marshal(raw)
			_ = json.Unmarshal(b, &chatIDs)
		}
	}
	cfg.Telegram["bot_token"] = requestOrExisting(req.BotToken, cfg.Telegram, "bot_token", "")
	cfg.Telegram["chat_ids"] = chatIDs
	cfg.Telegram["update_check_cron"] = updateCheckCron
	cfg.Telegram["notify_on_update"] = requestBoolOrExisting(req, "notifyOnUpdate", req.NotifyOnUpdate, cfg.Telegram, "notify_on_update", true)
	cfg.Telegram["interactive_enabled"] = requestBoolOrExisting(req, "interactiveEnabled", req.InteractiveEnabled, cfg.Telegram, "interactive_enabled", true)
	if strings.TrimSpace(req.UpdateBlacklist) != "" {
		cfg.Telegram["update_blacklist"] = normalizeList(splitLinesOrComma(req.UpdateBlacklist))
	} else if _, ok := cfg.Telegram["update_blacklist"]; !ok {
		cfg.Telegram["update_blacklist"] = []string{}
	}
	cfg.Telegram["auto_clean_images"] = requestBoolOrExisting(req, "autoCleanImages", req.AutoCleanImages, cfg.Telegram, "auto_clean_images", false)
	cfg.Telegram["clean_images_cron"] = cleanImagesCron
	cfg.Telegram["auto_update_containers"] = requestBoolOrExisting(req, "autoUpdateContainers", req.AutoUpdateContainers, cfg.Telegram, "auto_update_containers", false)
	cfg.Telegram["update_containers_cron"] = updateContainersCron
	cfg.Telegram["auto_backup_json"] = requestBoolOrExisting(req, "autoBackupJson", req.AutoBackupJson, cfg.Telegram, "auto_backup_json", false)
	cfg.Telegram["auto_backup_compose"] = requestBoolOrExisting(req, "autoBackupCompose", req.AutoBackupCompose, cfg.Telegram, "auto_backup_compose", false)
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
		"type":     requestOrExisting(req.ProxyType, existingMap(cfg.Telegram, "proxy"), "type", "http"),
		"host":     requestOrExisting(req.ProxyHost, existingMap(cfg.Telegram, "proxy"), "host", ""),
		"port":     requestIntOrExisting(req.ProxyPort, existingMap(cfg.Telegram, "proxy"), "port", 0),
		"username": requestOrExisting(req.ProxyUsername, existingMap(cfg.Telegram, "proxy"), "username", ""),
		"password": requestOrExisting(req.ProxyPassword, existingMap(cfg.Telegram, "proxy"), "password", ""),
	}
	if cfg.Dockercopilot == nil {
		cfg.Dockercopilot = map[string]interface{}{}
	}
	if strings.TrimSpace(req.HostLanIP) != "" || !preserveExisting {
		cfg.Dockercopilot["host_lan_ip"] = strings.TrimSpace(req.HostLanIP)
	} else if _, ok := cfg.Dockercopilot["host_lan_ip"]; !ok {
		cfg.Dockercopilot["host_lan_ip"] = ""
	}
	themeMode := strings.TrimSpace(req.ThemeMode)
	if themeMode == "" {
		themeMode = existingString(cfg.Telegram, "theme_mode", "light")
	}
	if themeMode != "light" && themeMode != "dark" && themeMode != "system" {
		themeMode = "light"
	}
	themeAppearance := strings.TrimSpace(req.ThemeAppearance)
	if themeAppearance == "" {
		themeAppearance = existingString(cfg.Telegram, "theme_appearance", "aurora")
	}
	switch themeAppearance {
	case "aurora", "night_sail", "mist":
	default:
		themeAppearance = "aurora"
	}
	cfg.Telegram["theme_mode"] = themeMode
	cfg.Telegram["theme_appearance"] = themeAppearance
	if strings.TrimSpace(req.DefaultInstance) != "" {
		cfg.Dockercopilot["default_instance"] = strings.TrimSpace(req.DefaultInstance)
	}
	cfg.Dockercopilot["multi_instance_enabled"] = requestBoolOrExisting(req, "multiInstanceEnabled", req.MultiInstanceEnabled, cfg.Dockercopilot, "multi_instance_enabled", false)
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
			if timeout <= 0 {
				timeout = 30
			}
			if strings.EqualFold(name, "local") {
				name = "local"
				apiURL = "http://127.0.0.1:12712"
			}
			cleaned = append(cleaned, map[string]interface{}{
				"name":       name,
				"api_url":    apiURL,
				"secret_key": secretKey,
				"timeout":    timeout,
			})
		}
		if len(cleaned) == 0 {
			cleaned = []map[string]interface{}{
				{
					"name":       "local",
					"api_url":    "http://127.0.0.1:12712",
					"secret_key": l.svcCtx.Config.Auth.AccessSecret,
					"timeout":    30,
				},
			}
		}
		hasLocal := false
		for _, inst := range cleaned {
			if strings.EqualFold(strings.TrimSpace(toString(inst["name"])), "local") {
				hasLocal = true
				break
			}
		}
		if !hasLocal {
			cleaned = append([]map[string]interface{}{
				{
					"name":       "local",
					"api_url":    "http://127.0.0.1:12712",
					"secret_key": l.svcCtx.Config.Auth.AccessSecret,
					"timeout":    30,
				},
			}, cleaned...)
		}
		cfg.Dockercopilot["instances"] = cleaned
		defaultName := strings.TrimSpace(req.DefaultInstance)
		if defaultName == "" {
			defaultName = toString(cfg.Dockercopilot["default_instance"])
		}
		if defaultName == "" {
			defaultName = "local"
		}
		defaultExists := false
		for _, inst := range cleaned {
			if toString(inst["name"]) == defaultName {
				defaultExists = true
				break
			}
		}
		if !defaultExists {
			defaultName = "local"
		}
		cfg.Dockercopilot["default_instance"] = defaultName
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

func existingMap(m map[string]interface{}, key string) map[string]interface{} {
	if value, ok := m[key]; ok {
		if mm, ok := value.(map[string]interface{}); ok && mm != nil {
			return mm
		}
	}
	return map[string]interface{}{}
}

func requestIntOrExisting(value int, m map[string]interface{}, key string, fallback int) int {
	if value > 0 {
		return value
	}
	if raw, ok := m[key]; ok {
		return toInt(raw, fallback)
	}
	return fallback
}

func toBool(v interface{}, fallback bool) bool {
	switch t := v.(type) {
	case bool:
		return t
	case string:
		s := strings.TrimSpace(strings.ToLower(t))
		if s == "true" || s == "1" || s == "yes" || s == "on" {
			return true
		}
		if s == "false" || s == "0" || s == "no" || s == "off" {
			return false
		}
	case float64:
		return t != 0
	case int:
		return t != 0
	case json.Number:
		if n, err := t.Int64(); err == nil {
			return n != 0
		}
	}
	return fallback
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
