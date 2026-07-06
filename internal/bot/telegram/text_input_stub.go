package telegram

import (
	"context"
	"fmt"
	"net/url"
	"strconv"
	"strings"

	"github.com/mymmrac/telego"
	botlogic "github.com/onlyLTY/dockerCopilot/internal/logic/bot"
	"github.com/onlyLTY/dockerCopilot/internal/svc"
	apptypes "github.com/onlyLTY/dockerCopilot/internal/types"
)

func (r *Runtime) startEditText(ctx context.Context, chatID int64, messageID int, field string) {
	cfg, err := r.getConfig(ctx)
	if err != nil {
		r.replyText(ctx, chatID, "❌ 读取配置失败: "+err.Error())
		return
	}
	current := map[string]string{
		"default_image_accelerator": svc.AsString(cfg.Telegram["default_image_accelerator"], ""),
		"backup_max_files":          strconv.Itoa(svc.AsInt(cfg.Telegram["backup_max_files"], 20)),
		"proxy_config":              proxySummaryFromMap(svc.ProxyMap(cfg.Telegram["proxy"])),
		"instances_json":            maskedJSON(cfg.Dockercopilot["instances"]),
	}[field]
	fieldName := map[string]string{
		"default_image_accelerator": "默认镜像加速器",
		"backup_max_files":          "最大备份份数",
		"proxy_config":              "Telegram 代理",
		"instances_json":            "实例配置 JSON",
	}[field]
	if fieldName == "" {
		r.replyText(ctx, chatID, "❌ 不支持的文本配置项")
		return
	}
	if current == "" {
		current = "(空)"
	}
	hint := map[string]string{
		"default_image_accelerator": "请直接发送新的默认加速器，例如 docker.1ms.run。发送空格可清空。",
		"backup_max_files":          "请输入 1-200 之间的整数。",
		"proxy_config":              "格式: none 或 http://host:port 或 socks5://user:pass@host:port",
		"instances_json":            "请发送实例数组 JSON，例如 [{\"name\":\"local\",\"api_url\":\"http://127.0.0.1:12712\",\"secret_key\":\"xxx\",\"timeout\":30}]",
	}[field]
	text := "✏️ <b>编辑" + escapeHTML(fieldName) + "</b>\n\n当前值: <code>" + escapeHTML(shorten(current, 1200)) + "</code>\n\n" + hint + "\n发送 /cancel 可取消。"
	r.setChatState(chatID, userState{Action: "edit_text", Extra: field, MessageID: messageID})
	r.editOrReplyText(ctx, chatID, messageID, text, telegoInlineCancelMarkup())
}

func (r *Runtime) processTextInput(ctx context.Context, msg *telego.Message, state userState) {
	input := strings.TrimSpace(msg.Text)
	if input == "/cancel" {
		r.cancelStatefulInput(ctx, msg.Chat.ID, state)
		return
	}
	cfg, err := r.getConfig(ctx)
	if err != nil {
		r.replyText(ctx, msg.Chat.ID, "❌ 读取配置失败: "+err.Error())
		return
	}
	instancesJSON, _ := svc.MustJSON(cfg.Dockercopilot["instances"])
	defaultImageAccelerator := svc.AsString(cfg.Telegram["default_image_accelerator"], "")
	backupMaxFiles := svc.AsInt(cfg.Telegram["backup_max_files"], 20)
	proxyType := svc.AsString(svc.ProxyMap(cfg.Telegram["proxy"])["type"], "none")
	proxyHost := svc.AsString(svc.ProxyMap(cfg.Telegram["proxy"])["host"], "")
	proxyPort := svc.AsInt(svc.ProxyMap(cfg.Telegram["proxy"])["port"], 0)
	proxyUsername := svc.AsString(svc.ProxyMap(cfg.Telegram["proxy"])["username"], "")
	proxyPassword := svc.AsString(svc.ProxyMap(cfg.Telegram["proxy"])["password"], "")

	switch state.Extra {
	case "default_image_accelerator":
		defaultImageAccelerator = input
	case "backup_max_files":
		n, err := strconv.Atoi(input)
		if err != nil || n < 1 || n > 200 {
			r.replyText(ctx, msg.Chat.ID, "❌ 备份份数必须是 1-200 之间的整数")
			return
		}
		backupMaxFiles = n
	case "proxy_config":
		pt, ph, pp, pu, pw, err := parseProxyInput(input)
		if err != nil {
			r.replyText(ctx, msg.Chat.ID, "❌ 代理配置格式错误: "+err.Error())
			return
		}
		proxyType, proxyHost, proxyPort, proxyUsername, proxyPassword = pt, ph, pp, pu, pw
	case "instances_json":
		merged, err := preserveMaskedInstanceSecretsJSON(input, cfg.Dockercopilot["instances"])
		if err != nil {
			r.replyText(ctx, msg.Chat.ID, "❌ 实例 JSON 格式错误: "+err.Error())
			return
		}
		instancesJSON = merged
	default:
		r.replyText(ctx, msg.Chat.ID, "❌ 不支持的文本配置项")
		return
	}

	logic := botlogic.NewConfigLogic(ctx, r.svcCtx)
	resp, err := logic.SaveConfig(&apptypes.BotConfigReq{
		BotToken:                svc.AsString(cfg.Telegram["bot_token"], ""),
		ChatIds:                 strings.Join(svc.StringList(cfg.Telegram["chat_ids"]), ","),
		UpdateCheckCron:         svc.AsString(cfg.Telegram["update_check_cron"], "0 18 * * *"),
		NotifyOnUpdate:          svc.AsBool(cfg.Telegram["notify_on_update"]),
		InteractiveEnabled:      svc.AsBool(cfg.Telegram["interactive_enabled"]),
		RichInteractionsEnabled: svc.AsBool(cfg.Telegram["rich_interactions_enabled"]),
		ParseMode:               svc.AsString(cfg.Telegram["parse_mode"], "HTML"),
		UpdateBlacklist:         strings.Join(svc.StringList(cfg.Telegram["update_blacklist"]), ","),
		AutoCleanImages:         svc.AsBool(cfg.Telegram["auto_clean_images"]),
		CleanImagesCron:         svc.AsString(cfg.Telegram["clean_images_cron"], "3 2 * * *"),
		AutoUpdateContainers:    svc.AsBool(cfg.Telegram["auto_update_containers"]),
		UpdateContainersCron:    svc.AsString(cfg.Telegram["update_containers_cron"], "0 */6 * * *"),
		AutoBackupJson:          svc.AsBool(cfg.Telegram["auto_backup_json"]),
		BackupJsonCron:          svc.AsString(cfg.Telegram["backup_json_cron"], "0 1 * * *"),
		AutoBackupCompose:       svc.AsBool(cfg.Telegram["auto_backup_compose"]),
		BackupComposeCron:       svc.AsString(cfg.Telegram["backup_compose_cron"], "30 1 * * *"),
		BackupMaxFiles:          backupMaxFiles,
		ImageAccelerators:       strings.Join(svc.StringList(cfg.Telegram["image_accelerators"]), ","),
		DefaultImageAccelerator: defaultImageAccelerator,
		ProxyType:               proxyType,
		ProxyHost:               proxyHost,
		ProxyPort:               proxyPort,
		ProxyUsername:           proxyUsername,
		ProxyPassword:           proxyPassword,
		DefaultInstance:         svc.AsString(cfg.Dockercopilot["default_instance"], "local"),
		MultiInstanceEnabled:    svc.AsBool(cfg.Dockercopilot["multi_instance_enabled"]),
		Instances:               string(instancesJSON),
	})
	if err != nil || resp == nil || resp.Code != 200 {
		msgText := "❌ 保存文本配置失败"
		if resp != nil && resp.Msg != "" {
			msgText += ": " + resp.Msg
		}
		r.replyText(ctx, msg.Chat.ID, msgText)
		return
	}
	r.clearChatState(msg.Chat.ID)
	r.replyText(ctx, msg.Chat.ID, "✅ 配置已更新")
	r.sendSettingsMenu(ctx, msg.Chat.ID, 0)
}

func proxySummaryFromMap(proxyCfg map[string]interface{}) string {
	proxyType := strings.ToLower(strings.TrimSpace(svc.AsString(proxyCfg["type"], "none")))
	if proxyType == "" || proxyType == "none" {
		return "none"
	}
	host := strings.TrimSpace(svc.AsString(proxyCfg["host"], ""))
	port := svc.AsInt(proxyCfg["port"], 0)
	user := strings.TrimSpace(svc.AsString(proxyCfg["username"], ""))
	if host == "" || port <= 0 {
		return proxyType
	}
	if user != "" {
		return fmt.Sprintf("%s://%s:***@%s:%d", proxyType, user, host, port)
	}
	return fmt.Sprintf("%s://%s:%d", proxyType, host, port)
}

func parseProxyInput(input string) (proxyType, host string, port int, username, password string, err error) {
	input = strings.TrimSpace(input)
	if input == "" || strings.EqualFold(input, "none") {
		return "none", "", 0, "", "", nil
	}
	if !strings.Contains(input, "://") {
		err = fmt.Errorf("需要带协议，例如 http://host:port 或 socks5://host:port")
		return
	}
	u, parseErr := url.Parse(input)
	if parseErr != nil {
		err = parseErr
		return
	}
	proxyType = strings.ToLower(strings.TrimSpace(u.Scheme))
	if proxyType != "http" && proxyType != "https" && proxyType != "socks5" {
		err = fmt.Errorf("仅支持 http / https / socks5")
		return
	}
	host = u.Hostname()
	p, convErr := strconv.Atoi(u.Port())
	if convErr != nil || p <= 0 {
		err = fmt.Errorf("端口无效")
		return
	}
	port = p
	if u.User != nil {
		username = u.User.Username()
		password, _ = u.User.Password()
	}
	return
}
