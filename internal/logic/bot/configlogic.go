package bot

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"

	"github.com/onlyLTY/dockerCopilot/internal/domain/blacklist"
	"github.com/onlyLTY/dockerCopilot/internal/domain/runtimeconfig"
	"github.com/onlyLTY/dockerCopilot/internal/svc"
	"github.com/onlyLTY/dockerCopilot/internal/types"
	"github.com/zeromicro/go-zero/core/logx"
)

type ConfigLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

const maskedSecretPlaceholder = "******"

func NewConfigLogic(ctx context.Context, svcCtx *svc.ServiceContext) *ConfigLogic {
	return &ConfigLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *ConfigLogic) configStore() *runtimeconfig.Store {
	secretKey := ""
	if l != nil && l.svcCtx != nil {
		secretKey = l.svcCtx.Config.Auth.AccessSecret
	}
	return runtimeconfig.NewStore("", secretKey)
}

func (l *ConfigLogic) readConfig() (runtimeconfig.Config, error) {
	return l.configStore().Read()
}

func (l *ConfigLogic) GetConfig() (resp *types.Resp, err error) {
	resp = &types.Resp{}
	cfg, err := l.readConfig()
	if err != nil {
		resp.Code = 500
		resp.Msg = err.Error()
		resp.Data = map[string]interface{}{}
		return resp, nil
	}
	if cfg.Dockercopilot == nil {
		cfg.Dockercopilot = map[string]interface{}{}
	}
	if cfg.QQBot == nil {
		cfg.QQBot = map[string]interface{}{}
	}
	if _, ok := cfg.Dockercopilot["host_lan_ip"]; !ok {
		cfg.Dockercopilot["host_lan_ip"] = ""
	}
	if _, ok := cfg.Dockercopilot["service_log_dir"]; !ok {
		cfg.Dockercopilot["service_log_dir"] = ""
	}
	resp.Code = 200
	resp.Msg = "success"
	if secret := strings.TrimSpace(toString(cfg.QQBot["app_secret"])); secret != "" {
		cfg.QQBot["app_secret"] = maskedSecretPlaceholder
	}
	resp.Data = cfg
	return resp, nil
}

func stringSliceFromInterface(v interface{}) []string {
	return blacklist.LegacyStringsFromInterface(v)
}

func (l *ConfigLogic) GetUpdateBlacklist() (resp *types.Resp, err error) {
	resp = &types.Resp{}
	cfg, err := l.readConfig()
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
	cfg, err := l.readConfig()
	if err != nil {
		resp.Code = 500
		resp.Msg = err.Error()
		resp.Data = []string{}
		return resp, nil
	}
	list := blacklist.NormalizeLegacyStrings(req.Items)
	cfg.Telegram["update_blacklist"] = list
	if err := l.configStore().Write(cfg); err != nil {
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

func normalizeTelegramParseMode(value string, fallback string) string {
	mode := strings.TrimSpace(value)
	if mode == "" {
		mode = fallback
	}
	switch strings.ToUpper(mode) {
	case "HTML":
		return "HTML"
	case "MARKDOWNV2", "MARKDOWN_V2", "MARKDOWN-V2":
		return "MarkdownV2"
	default:
		return "HTML"
	}
}

func isMaskedSecretPlaceholder(value string) bool {
	trimmed := strings.TrimSpace(value)
	return trimmed == maskedSecretPlaceholder || trimmed == "********"
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
		strings.TrimSpace(req.ScheduledTasks) != "" ||
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
		strings.TrimSpace(req.ServiceLogDir) != "" ||
		strings.TrimSpace(req.ThemeMode) != "" ||
		strings.TrimSpace(req.ThemeAppearance) != "" ||
		strings.TrimSpace(req.ParseMode) != "" ||
		strings.TrimSpace(req.QQBotAppID) != "" ||
		strings.TrimSpace(req.QQBotAppSecret) != "" ||
		strings.TrimSpace(req.QQBotEventMode) != "" ||
		strings.TrimSpace(req.QQBotAllowedUserOpenIDs) != "" ||
		strings.TrimSpace(req.QQBotAllowedGroupOpenIDs) != "" ||
		strings.TrimSpace(req.QQBotNotifyTargets) != "" ||
		req.NotifyOnUpdate || req.InteractiveEnabled || req.RichInteractionsEnabled || req.AutoCleanImages || req.AutoUpdateContainers || req.AutoBackupJson || req.AutoBackupCompose || req.MultiInstanceEnabled
}

func (l *ConfigLogic) SaveConfig(req *types.BotConfigReq) (resp *types.Resp, err error) {
	resp = &types.Resp{}
	cfg, err := l.readConfig()
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
	cfg.Telegram["rich_interactions_enabled"] = requestBoolOrExisting(req, "richInteractionsEnabled", req.RichInteractionsEnabled, cfg.Telegram, "rich_interactions_enabled", false)
	cfg.Telegram["parse_mode"] = normalizeTelegramParseMode(requestOrExisting(req.ParseMode, cfg.Telegram, "parse_mode", "HTML"), "HTML")
	if strings.TrimSpace(req.UpdateBlacklist) != "" {
		cfg.Telegram["update_blacklist"] = blacklist.NormalizeLegacyStrings(splitLinesOrComma(req.UpdateBlacklist))
	} else if _, ok := cfg.Telegram["update_blacklist"]; !ok {
		cfg.Telegram["update_blacklist"] = []string{}
	}
	cfg.Telegram["auto_clean_images"] = requestBoolOrExisting(req, "autoCleanImages", req.AutoCleanImages, cfg.Telegram, "auto_clean_images", false)
	cfg.Telegram["clean_images_cron"] = cleanImagesCron
	cfg.Telegram["auto_update_containers"] = requestBoolOrExisting(req, "autoUpdateContainers", req.AutoUpdateContainers, cfg.Telegram, "auto_update_containers", false)
	cfg.Telegram["update_containers_cron"] = updateContainersCron
	if req.HasField("scheduledTasks") {
		var tasks []map[string]interface{}
		raw := strings.TrimSpace(req.ScheduledTasks)
		if raw == "" {
			raw = "[]"
		}
		if err := json.Unmarshal([]byte(raw), &tasks); err != nil {
			resp.Code = 400
			resp.Msg = "scheduledTasks 配置格式错误: " + err.Error()
			resp.Data = map[string]interface{}{}
			return resp, nil
		}
		cleaned := make([]map[string]interface{}, 0, len(tasks))
		for _, task := range tasks {
			containerID := strings.TrimSpace(toString(task["containerID"]))
			action := strings.TrimSpace(toString(task["action"]))
			cronExpr := strings.TrimSpace(toString(task["cron"]))
			if containerID == "" || action == "" || cronExpr == "" {
				continue
			}
			if action != "restart" && action != "stop" && action != "start" {
				resp.Code = 400
				resp.Msg = "任务动作只支持 start / stop / restart"
				resp.Data = map[string]interface{}{}
				return resp, nil
			}
			normalizedCron, cronErr := validateCronExpr("容器任务 Cron", cronExpr)
			if cronErr != nil {
				resp.Code = 400
				resp.Msg = cronErr.Error()
				resp.Data = map[string]interface{}{}
				return resp, nil
			}
			id := strings.TrimSpace(toString(task["id"]))
			if id == "" {
				id = fmt.Sprintf("%s-%s-%d", containerID, action, len(cleaned)+1)
			}
			cleaned = append(cleaned, map[string]interface{}{
				"id":            id,
				"containerID":   containerID,
				"containerName": strings.TrimSpace(toString(task["containerName"])),
				"action":        action,
				"cron":          normalizedCron,
				"enabled":       toBool(task["enabled"], true),
			})
		}
		cfg.Telegram["scheduled_container_tasks"] = cleaned
	} else if _, ok := cfg.Telegram["scheduled_container_tasks"]; !ok {
		cfg.Telegram["scheduled_container_tasks"] = []map[string]interface{}{}
	}
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
	if req.HasField("serviceLogDir") {
		cfg.Dockercopilot["service_log_dir"] = strings.TrimSpace(req.ServiceLogDir)
	} else if _, ok := cfg.Dockercopilot["service_log_dir"]; !ok {
		cfg.Dockercopilot["service_log_dir"] = ""
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
	if cfg.QQBot == nil {
		cfg.QQBot = map[string]interface{}{}
	}
	cfg.QQBot["enabled"] = requestBoolOrExisting(req, "qqbotEnabled", req.QQBotEnabled, cfg.QQBot, "enabled", false)
	cfg.QQBot["app_id"] = requestOrExisting(req.QQBotAppID, cfg.QQBot, "app_id", "")
	if req.HasField("qqbotAppSecret") {
		if !isMaskedSecretPlaceholder(req.QQBotAppSecret) {
			cfg.QQBot["app_secret"] = strings.TrimSpace(req.QQBotAppSecret)
		}
	} else if _, ok := cfg.QQBot["app_secret"]; !ok {
		cfg.QQBot["app_secret"] = ""
	}
	cfg.QQBot["sandbox"] = false
	cfg.QQBot["event_mode"] = "webhook"
	if req.HasField("qqbotAllowedUserOpenids") {
		cfg.QQBot["allowed_user_openids"] = splitLinesOrComma(req.QQBotAllowedUserOpenIDs)
	} else if _, ok := cfg.QQBot["allowed_user_openids"]; !ok {
		cfg.QQBot["allowed_user_openids"] = []string{}
	}
	if req.HasField("qqbotAllowedGroupOpenids") {
		cfg.QQBot["allowed_group_openids"] = splitLinesOrComma(req.QQBotAllowedGroupOpenIDs)
	} else if _, ok := cfg.QQBot["allowed_group_openids"]; !ok {
		cfg.QQBot["allowed_group_openids"] = []string{}
	}
	if req.HasField("qqbotNotifyTargets") {
		cfg.QQBot["notify_targets"] = splitLinesOrComma(req.QQBotNotifyTargets)
	} else if _, ok := cfg.QQBot["notify_targets"]; !ok {
		cfg.QQBot["notify_targets"] = []string{}
	}
	cfg.QQBot["markdown_enabled"] = requestBoolOrExisting(req, "qqbotMarkdownEnabled", req.QQBotMarkdownEnabled, cfg.QQBot, "markdown_enabled", false)
	cfg.QQBot["buttons_enabled"] = requestBoolOrExisting(req, "qqbotButtonsEnabled", req.QQBotButtonsEnabled, cfg.QQBot, "buttons_enabled", false)
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

	if err := l.configStore().Write(cfg); err != nil {
		resp.Code = 500
		resp.Msg = err.Error()
		resp.Data = map[string]interface{}{}
		return resp, nil
	}
	if err := l.svcCtx.ReloadBackupSchedulers(); err != nil {
		resp.Code = 500
		resp.Msg = "配置已保存，但重载定时任务失败: " + err.Error()
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
