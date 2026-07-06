package telegram

import (
	"context"
	"fmt"
	"sort"
	"strings"

	"github.com/mymmrac/telego"
	tu "github.com/mymmrac/telego/telegoutil"
	botlogic "github.com/onlyLTY/dockerCopilot/internal/logic/bot"
	"github.com/onlyLTY/dockerCopilot/internal/svc"
	apptypes "github.com/onlyLTY/dockerCopilot/internal/types"
)

type runtimeConfigView struct {
	Telegram      map[string]interface{} `json:"telegram"`
	Dockercopilot map[string]interface{} `json:"dockercopilot"`
}

func (r *Runtime) getConfig(ctx context.Context) (runtimeConfigView, error) {
	logic := botlogic.NewConfigLogic(ctx, r.svcCtx)
	resp, err := logic.GetConfig()
	if err != nil {
		return runtimeConfigView{}, err
	}
	if resp == nil || resp.Code != 200 {
		return runtimeConfigView{}, fmt.Errorf(firstNonEmpty(resp.Msg, "获取配置失败"))
	}
	var cfg runtimeConfigView
	if err := decodeRespData(resp.Data, &cfg); err != nil {
		return runtimeConfigView{}, err
	}
	if cfg.Telegram == nil {
		cfg.Telegram = map[string]interface{}{}
	}
	if cfg.Dockercopilot == nil {
		cfg.Dockercopilot = map[string]interface{}{}
	}
	return cfg, nil
}

func (r *Runtime) sendInstancesList(ctx context.Context, chatID int64, messageID int) {
	instances, current, enabled, err := r.loadInstances(ctx, chatID)
	if err != nil {
		r.replyText(ctx, chatID, "❌ 获取实例列表失败: "+err.Error())
		return
	}
	if len(instances) <= 1 {
		r.replyText(ctx, chatID, "💡 只配置了一个实例，无需切换")
		return
	}
	var b strings.Builder
	b.WriteString("🖥 <b>Docker Copilot 实例列表</b>\n\n")
	b.WriteString(fmt.Sprintf("当前实例: <b>%s</b>\n", escapeHTML(current)))
	b.WriteString(fmt.Sprintf("多实例: %s\n\n", boolText(enabled)))
	b.WriteString("点击下方按钮切换实例。")
	rows := make([][]telego.InlineKeyboardButton, 0, len(instances)+1)
	for _, inst := range instances {
		icon := "⚪"
		if inst.Name == current {
			icon = "✅"
		}
		rows = append(rows, tu.InlineKeyboardRow(
			tu.InlineKeyboardButton(icon+" "+trimButtonLabel(inst.Name)).WithCallbackData("switch_instance:"+inst.Name),
		))
	}
	rows = append(rows, tu.InlineKeyboardRow(
		tu.InlineKeyboardButton("🔧 实例管理").WithCallbackData("manage_instances:"),
		tu.InlineKeyboardButton("⚙️ 设置").WithCallbackData("settings_menu:"),
	))
	markup := tu.InlineKeyboard(rows...)
	if messageID > 0 {
		r.editOrReplyText(ctx, chatID, messageID, b.String(), markup)
		return
	}
	_, _ = r.bot.SendMessage(ctx, tu.Message(tu.ID(chatID), b.String()).WithParseMode(telego.ModeHTML).WithReplyMarkup(markup))
}

func (r *Runtime) switchInstance(ctx context.Context, chatID int64, messageID int, instanceName string) {
	instances, current, _, err := r.loadInstances(ctx, chatID)
	if err != nil {
		r.replyText(ctx, chatID, "❌ 切换实例失败: "+err.Error())
		return
	}
	if instanceName == "" {
		r.replyText(ctx, chatID, "❌ 实例名不能为空")
		return
	}
	found := false
	for _, inst := range instances {
		if inst.Name == instanceName {
			found = true
			break
		}
	}
	if !found {
		r.replyText(ctx, chatID, "❌ 实例不存在")
		return
	}
	if instanceName == current {
		r.replyText(ctx, chatID, fmt.Sprintf("💡 当前已经是实例: <b>%s</b>", escapeHTML(instanceName)))
		return
	}
	r.setCurrentInstance(chatID, instanceName)
	r.clearChatState(chatID)
	r.sendInstancesList(ctx, chatID, messageID)
	r.replyText(ctx, chatID, fmt.Sprintf("✅ 已切换到实例: <b>%s</b>", escapeHTML(instanceName)))
}

func (r *Runtime) sendManageInstances(ctx context.Context, chatID int64, messageID int) {
	instances, current, enabled, err := r.loadInstances(ctx, chatID)
	if err != nil {
		r.replyText(ctx, chatID, "❌ 获取实例管理信息失败: "+err.Error())
		return
	}
	var b strings.Builder
	b.WriteString("🔧 <b>实例管理</b>\n\n")
	b.WriteString(fmt.Sprintf("当前实例: <b>%s</b>\n", escapeHTML(current)))
	b.WriteString(fmt.Sprintf("多实例: %s\n", boolText(enabled)))
	b.WriteString(fmt.Sprintf("总计: <b>%d</b> 个实例\n\n", len(instances)))
	b.WriteString("<b>实例列表:</b>\n")
	rows := make([][]telego.InlineKeyboardButton, 0, len(instances)+2)
	for idx, inst := range instances {
		icon := "⚪"
		if inst.Name == current {
			icon = "✅"
		}
		statusLine := "🔴 离线"
		if info, err := r.instanceSummary(ctx, inst); err == nil {
			statusLine = fmt.Sprintf("🟢 在线 · 容器 %d 个（%d 运行中）", info.total, info.running)
		}
		b.WriteString(fmt.Sprintf("\n%d. %s <b>%s</b>\n   📍 %s\n   %s\n", idx+1, icon, escapeHTML(inst.Name), escapeHTML(inst.APIURL), statusLine))
		rows = append(rows, tu.InlineKeyboardRow(
			tu.InlineKeyboardButton(icon+" "+trimButtonLabel(inst.Name)).WithCallbackData("manage_inst_detail:"+inst.Name),
		))
	}
	rows = append(rows, tu.InlineKeyboardRow(
		tu.InlineKeyboardButton("🔄 刷新状态").WithCallbackData("manage_instances:"),
		tu.InlineKeyboardButton("🖥 切换实例").WithCallbackData("instances_menu:"),
	))
	rows = append(rows, tu.InlineKeyboardRow(
		tu.InlineKeyboardButton("⚙️ 设置").WithCallbackData("settings_menu:"),
		tu.InlineKeyboardButton("❌ 关闭").WithCallbackData("cancel:"),
	))
	markup := tu.InlineKeyboard(rows...)
	if messageID > 0 {
		r.editOrReplyText(ctx, chatID, messageID, b.String(), markup)
		return
	}
	_, _ = r.bot.SendMessage(ctx, tu.Message(tu.ID(chatID), b.String()).WithParseMode(telego.ModeHTML).WithReplyMarkup(markup))
}

type instanceSummaryInfo struct {
	total   int
	running int
}

func (r *Runtime) instanceSummary(ctx context.Context, inst instanceConfig) (instanceSummaryInfo, error) {
	containers, err := r.listContainersForInstance(ctx, inst)
	if err != nil {
		return instanceSummaryInfo{}, err
	}
	running := 0
	for _, item := range containers {
		status := strings.ToLower(containerStatus(item))
		if strings.Contains(status, "running") {
			running++
		}
	}
	return instanceSummaryInfo{total: len(containers), running: running}, nil
}

func (r *Runtime) sendInstanceDetail(ctx context.Context, chatID int64, messageID int, name string) {
	instances, current, _, err := r.loadInstances(ctx, chatID)
	if err != nil {
		r.replyText(ctx, chatID, "❌ 获取实例详情失败: "+err.Error())
		return
	}
	var target *instanceConfig
	for _, inst := range instances {
		if inst.Name == name {
			copyInst := inst
			target = &copyInst
			break
		}
	}
	if target == nil {
		r.replyText(ctx, chatID, "❌ 实例不存在")
		return
	}
	var b strings.Builder
	b.WriteString("📋 <b>实例详情</b>\n\n")
	b.WriteString(fmt.Sprintf("名称: <b>%s</b>\n", escapeHTML(target.Name)))
	b.WriteString(fmt.Sprintf("地址: <code>%s</code>\n", escapeHTML(target.APIURL)))
	b.WriteString(fmt.Sprintf("超时: <b>%d</b> 秒\n", target.Timeout))
	if target.Name == current {
		b.WriteString("当前状态: ✅ 当前实例\n")
	} else {
		b.WriteString("当前状态: ⚪ 非当前实例\n")
	}
	if info, err := r.instanceSummary(ctx, *target); err == nil {
		b.WriteString(fmt.Sprintf("连接状态: 🟢 在线\n容器: <b>%d</b> 个（%d 运行中）\n", info.total, info.running))
	} else {
		b.WriteString(fmt.Sprintf("连接状态: 🔴 异常\n错误: <code>%s</code>\n", escapeHTML(shorten(err.Error(), 120))))
	}
	rows := [][]telego.InlineKeyboardButton{}
	if target.Name != current {
		rows = append(rows, tu.InlineKeyboardRow(
			tu.InlineKeyboardButton("✅ 切换到此实例").WithCallbackData("switch_instance:"+target.Name),
		))
	}
	rows = append(rows,
		tu.InlineKeyboardRow(
			tu.InlineKeyboardButton("🔄 刷新").WithCallbackData("manage_inst_detail:"+target.Name),
			tu.InlineKeyboardButton("⬅️ 返回实例管理").WithCallbackData("manage_instances:"),
		),
	)
	r.editOrReplyText(ctx, chatID, messageID, b.String(), tu.InlineKeyboard(rows...))
}

func (r *Runtime) sendSettingsMenu(ctx context.Context, chatID int64, messageID int) {
	cfg, err := r.getConfig(ctx)
	if err != nil {
		r.replyText(ctx, chatID, "❌ 读取配置失败: "+err.Error())
		return
	}
	telegram := cfg.Telegram
	blacklist := svc.StringList(telegram["update_blacklist"])
	updateCheckCron := svc.AsString(telegram["update_check_cron"], "0 18 * * *")
	updateCheckEnabled := !isDisabledTelegramCron(updateCheckCron)
	var b strings.Builder
	b.WriteString("⚙️ <b>定时任务配置</b>\n\n")
	b.WriteString("🔄 <b>容器更新检测</b>\n")
	b.WriteString(fmt.Sprintf("  • 检测: %s\n", boolText(updateCheckEnabled)))
	b.WriteString(fmt.Sprintf("  • 时间: <code>%s</code>\n", escapeHTML(updateCheckCron)))
	b.WriteString(fmt.Sprintf("  • 通知: %s\n\n", boolText(svc.AsBool(telegram["notify_on_update"]))))
	b.WriteString("🧹 <b>镜像自动清理</b>\n")
	b.WriteString(fmt.Sprintf("  • 时间: <code>%s</code>\n", escapeHTML(svc.AsString(telegram["clean_images_cron"], "3 2 * * *"))))
	b.WriteString(fmt.Sprintf("  • 状态: %s\n\n", boolText(svc.AsBool(telegram["auto_clean_images"]))))
	b.WriteString("⚡ <b>容器自动更新</b>\n")
	b.WriteString(fmt.Sprintf("  • 时间: <code>%s</code>\n", escapeHTML(svc.AsString(telegram["update_containers_cron"], "0 */6 * * *"))))
	b.WriteString(fmt.Sprintf("  • 状态: %s\n\n", boolText(svc.AsBool(telegram["auto_update_containers"]))))
	b.WriteString("💾 <b>自动备份</b>\n")
	b.WriteString(fmt.Sprintf("  • JSON: %s · <code>%s</code>\n", boolText(svc.AsBool(telegram["auto_backup_json"])), escapeHTML(svc.AsString(telegram["backup_json_cron"], "0 1 * * *"))))
	b.WriteString(fmt.Sprintf("  • Compose: %s · <code>%s</code>\n", boolText(svc.AsBool(telegram["auto_backup_compose"])), escapeHTML(svc.AsString(telegram["backup_compose_cron"], "30 1 * * *"))))
	b.WriteString(fmt.Sprintf("  • 最大备份份数: <code>%d</code>\n", svc.AsInt(telegram["backup_max_files"], 20)))
	proxyCfg := svc.ProxyMap(telegram["proxy"])
	b.WriteString(fmt.Sprintf("  • Telegram代理: <code>%s</code>\n\n", escapeHTML(proxySummaryFromMap(proxyCfg))))
	b.WriteString("📋 <b>更新黑名单</b>\n")
	if len(blacklist) == 0 {
		b.WriteString("  • 当前: <i>无</i>\n\n")
	} else {
		preview := strings.Join(blacklist, ", ")
		b.WriteString(fmt.Sprintf("  • 当前: <code>%s</code>\n\n", escapeHTML(shorten(preview, 100))))
	}
	rows := [][]telego.InlineKeyboardButton{
		tu.InlineKeyboardRow(
			tu.InlineKeyboardButton(toggleLabel(updateCheckEnabled, "检测")).WithCallbackData("settings_toggle:update_check_enabled"),
			tu.InlineKeyboardButton(toggleLabel(svc.AsBool(telegram["notify_on_update"]), "通知")).WithCallbackData("settings_toggle:notify_on_update"),
		),
		tu.InlineKeyboardRow(
			tu.InlineKeyboardButton("📝 编辑检测时间").WithCallbackData("settings_edit_cron:update_check"),
		),
		tu.InlineKeyboardRow(
			tu.InlineKeyboardButton(toggleLabel(svc.AsBool(telegram["auto_clean_images"]), "自动清理")).WithCallbackData("settings_toggle:auto_clean_images"),
			tu.InlineKeyboardButton("📝 编辑清理时间").WithCallbackData("settings_edit_cron:clean_images"),
		),
		tu.InlineKeyboardRow(
			tu.InlineKeyboardButton(toggleLabel(svc.AsBool(telegram["auto_update_containers"]), "自动更新")).WithCallbackData("settings_toggle:auto_update_containers"),
			tu.InlineKeyboardButton("📝 编辑更新时间").WithCallbackData("settings_edit_cron:auto_update"),
		),
		tu.InlineKeyboardRow(
			tu.InlineKeyboardButton(toggleLabel(svc.AsBool(telegram["auto_backup_json"]), "JSON备份")).WithCallbackData("settings_toggle:auto_backup_json"),
			tu.InlineKeyboardButton("📝 编辑JSON时间").WithCallbackData("settings_edit_cron:backup_json"),
		),
		tu.InlineKeyboardRow(
			tu.InlineKeyboardButton(toggleLabel(svc.AsBool(telegram["auto_backup_compose"]), "Compose备份")).WithCallbackData("settings_toggle:auto_backup_compose"),
			tu.InlineKeyboardButton("📝 编辑Compose时间").WithCallbackData("settings_edit_cron:backup_compose"),
		),
		tu.InlineKeyboardRow(
			tu.InlineKeyboardButton("📝 编辑默认加速器").WithCallbackData("settings_edit_text:default_image_accelerator"),
		),
		tu.InlineKeyboardRow(
			tu.InlineKeyboardButton("📝 编辑备份份数").WithCallbackData("settings_edit_text:backup_max_files"),
			tu.InlineKeyboardButton("📝 编辑代理").WithCallbackData("settings_edit_text:proxy_config"),
		),
		tu.InlineKeyboardRow(
			tu.InlineKeyboardButton("📝 编辑实例配置").WithCallbackData("settings_edit_text:instances_json"),
		),
		tu.InlineKeyboardRow(
			tu.InlineKeyboardButton("🧩 实例配置管理").WithCallbackData("instcfg_menu:"),
		),
		tu.InlineKeyboardRow(
			tu.InlineKeyboardButton("📋 编辑黑名单").WithCallbackData("settings_edit_blacklist:"),
		),
		tu.InlineKeyboardRow(
			tu.InlineKeyboardButton("🔄 重新加载").WithCallbackData("settings_reload:"),
			tu.InlineKeyboardButton("🖥 实例管理").WithCallbackData("manage_instances:"),
		),
		tu.InlineKeyboardRow(
			tu.InlineKeyboardButton("❌ 取消").WithCallbackData("cancel:"),
		),
	}
	r.editOrReplyText(ctx, chatID, messageID, b.String(), tu.InlineKeyboard(rows...))
}

func (r *Runtime) startEditBlacklist(ctx context.Context, chatID int64, messageID int) {
	cfg, err := r.getConfig(ctx)
	if err != nil {
		r.replyText(ctx, chatID, "❌ 读取黑名单失败: "+err.Error())
		return
	}
	current := strings.Join(svc.StringList(cfg.Telegram["update_blacklist"]), ", ")
	if strings.TrimSpace(current) == "" {
		current = "(空)"
	}
	text := strings.Join([]string{
		"📋 <b>编辑更新黑名单</b>",
		"",
		"当前黑名单: <code>" + escapeHTML(current) + "</code>",
		"",
		"说明:",
		"• 黑名单中的容器不会发送更新提醒",
		"• 也不会被自动更新",
		"• 多个条目请用逗号、换行或分号分隔",
		"• 发送空格可清空黑名单",
		"",
		"请直接发送新的黑名单内容。发送 /cancel 可取消。",
	}, "\n")
	r.setChatState(chatID, userState{Action: "edit_blacklist", MessageID: messageID})
	r.editOrReplyText(ctx, chatID, messageID, text, tu.InlineKeyboard(
		tu.InlineKeyboardRow(
			tu.InlineKeyboardButton("❌ 取消").WithCallbackData("cancel:"),
		),
	))
}

func (r *Runtime) processBlacklistInput(ctx context.Context, msg *telego.Message, state userState) {
	text := strings.TrimSpace(msg.Text)
	if text == "/cancel" {
		r.cancelStatefulInput(ctx, msg.Chat.ID, state)
		return
	}
	cfg, err := r.getConfig(ctx)
	if err != nil {
		r.replyText(ctx, msg.Chat.ID, "❌ 读取配置失败: "+err.Error())
		return
	}
	instancesJSON, _ := svc.MustJSON(cfg.Dockercopilot["instances"])
	blacklistValue := text
	if text == "" {
		blacklistValue = " "
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
		UpdateBlacklist:         blacklistValue,
		AutoCleanImages:         svc.AsBool(cfg.Telegram["auto_clean_images"]),
		CleanImagesCron:         svc.AsString(cfg.Telegram["clean_images_cron"], "3 2 * * *"),
		AutoUpdateContainers:    svc.AsBool(cfg.Telegram["auto_update_containers"]),
		UpdateContainersCron:    svc.AsString(cfg.Telegram["update_containers_cron"], "0 */6 * * *"),
		AutoBackupJson:          svc.AsBool(cfg.Telegram["auto_backup_json"]),
		BackupJsonCron:          svc.AsString(cfg.Telegram["backup_json_cron"], "0 1 * * *"),
		AutoBackupCompose:       svc.AsBool(cfg.Telegram["auto_backup_compose"]),
		BackupComposeCron:       svc.AsString(cfg.Telegram["backup_compose_cron"], "30 1 * * *"),
		BackupMaxFiles:          svc.AsInt(cfg.Telegram["backup_max_files"], 20),
		ImageAccelerators:       strings.Join(svc.StringList(cfg.Telegram["image_accelerators"]), ","),
		DefaultImageAccelerator: svc.AsString(cfg.Telegram["default_image_accelerator"], ""),
		ProxyType:               svc.AsString(svc.ProxyMap(cfg.Telegram["proxy"])["type"], "none"),
		ProxyHost:               svc.AsString(svc.ProxyMap(cfg.Telegram["proxy"])["host"], ""),
		ProxyPort:               svc.AsInt(svc.ProxyMap(cfg.Telegram["proxy"])["port"], 0),
		ProxyUsername:           svc.AsString(svc.ProxyMap(cfg.Telegram["proxy"])["username"], ""),
		ProxyPassword:           svc.AsString(svc.ProxyMap(cfg.Telegram["proxy"])["password"], ""),
		DefaultInstance:         svc.AsString(cfg.Dockercopilot["default_instance"], "local"),
		MultiInstanceEnabled:    svc.AsBool(cfg.Dockercopilot["multi_instance_enabled"]),
		Instances:               string(instancesJSON),
	})
	if err != nil || resp == nil || resp.Code != 200 {
		msgText := "❌ 保存黑名单失败"
		if resp != nil && resp.Msg != "" {
			msgText += ": " + resp.Msg
		}
		r.replyText(ctx, msg.Chat.ID, msgText)
		return
	}
	r.clearChatState(msg.Chat.ID)
	r.replyText(ctx, msg.Chat.ID, "✅ 黑名单已更新")
	r.sendSettingsMenu(ctx, msg.Chat.ID, 0)
}

func (r *Runtime) startEditCron(ctx context.Context, chatID int64, messageID int, configType string) {
	cfg, err := r.getConfig(ctx)
	if err != nil {
		r.replyText(ctx, chatID, "❌ 读取配置失败: "+err.Error())
		return
	}
	current := map[string]string{
		"update_check":   svc.AsString(cfg.Telegram["update_check_cron"], "0 18 * * *"),
		"clean_images":   svc.AsString(cfg.Telegram["clean_images_cron"], "3 2 * * *"),
		"auto_update":    svc.AsString(cfg.Telegram["update_containers_cron"], "0 */6 * * *"),
		"backup_json":    svc.AsString(cfg.Telegram["backup_json_cron"], "0 1 * * *"),
		"backup_compose": svc.AsString(cfg.Telegram["backup_compose_cron"], "30 1 * * *"),
	}[configType]
	fieldName := map[string]string{
		"update_check":   "容器更新检测",
		"clean_images":   "镜像自动清理",
		"auto_update":    "容器自动更新",
		"backup_json":    "JSON 自动备份",
		"backup_compose": "Compose 自动备份",
	}[configType]
	if current == "" || fieldName == "" {
		r.replyText(ctx, chatID, "❌ 不支持的配置项")
		return
	}
	text := fmt.Sprintf("✏️ <b>编辑%s时间</b>\n\n当前值: <code>%s</code>\n\n请输入新的 cron 表达式。\n格式: <code>分 时 日 月 星期</code>\n例如: <code>0 2 * * *</code>\n\n发送 /cancel 可取消。", escapeHTML(fieldName), escapeHTML(current))
	r.setChatState(chatID, userState{Action: "edit_cron", Extra: configType, MessageID: messageID})
	r.editOrReplyText(ctx, chatID, messageID, text, tu.InlineKeyboard(
		tu.InlineKeyboardRow(
			tu.InlineKeyboardButton("❌ 取消").WithCallbackData("cancel:"),
		),
	))
}

func (r *Runtime) processCronInput(ctx context.Context, msg *telego.Message, state userState) {
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
	req := &apptypes.BotConfigReq{
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
		BackupMaxFiles:          svc.AsInt(cfg.Telegram["backup_max_files"], 20),
		ImageAccelerators:       strings.Join(svc.StringList(cfg.Telegram["image_accelerators"]), ","),
		DefaultImageAccelerator: svc.AsString(cfg.Telegram["default_image_accelerator"], ""),
		ProxyType:               svc.AsString(svc.ProxyMap(cfg.Telegram["proxy"])["type"], "none"),
		ProxyHost:               svc.AsString(svc.ProxyMap(cfg.Telegram["proxy"])["host"], ""),
		ProxyPort:               svc.AsInt(svc.ProxyMap(cfg.Telegram["proxy"])["port"], 0),
		ProxyUsername:           svc.AsString(svc.ProxyMap(cfg.Telegram["proxy"])["username"], ""),
		ProxyPassword:           svc.AsString(svc.ProxyMap(cfg.Telegram["proxy"])["password"], ""),
		DefaultInstance:         svc.AsString(cfg.Dockercopilot["default_instance"], "local"),
		MultiInstanceEnabled:    svc.AsBool(cfg.Dockercopilot["multi_instance_enabled"]),
		Instances:               string(instancesJSON),
	}
	switch state.Extra {
	case "update_check":
		req.UpdateCheckCron = input
	case "clean_images":
		req.CleanImagesCron = input
	case "auto_update":
		req.UpdateContainersCron = input
	case "backup_json":
		req.BackupJsonCron = input
	case "backup_compose":
		req.BackupComposeCron = input
	default:
		r.replyText(ctx, msg.Chat.ID, "❌ 状态丢失，请重新操作")
		return
	}
	logic := botlogic.NewConfigLogic(ctx, r.svcCtx)
	resp, err := logic.SaveConfig(req)
	if err != nil || resp == nil || resp.Code != 200 {
		msgText := "❌ 保存 cron 配置失败"
		if resp != nil && resp.Msg != "" {
			msgText += ": " + resp.Msg
		}
		r.replyText(ctx, msg.Chat.ID, msgText)
		return
	}
	r.clearChatState(msg.Chat.ID)
	r.replyText(ctx, msg.Chat.ID, "✅ cron 配置已更新")
	r.sendSettingsMenu(ctx, msg.Chat.ID, 0)
}

func (r *Runtime) toggleSetting(ctx context.Context, chatID int64, messageID int, settingName string) {
	cfg, err := r.getConfig(ctx)
	if err != nil {
		r.replyText(ctx, chatID, "❌ 读取配置失败: "+err.Error())
		return
	}
	instancesJSON, _ := svc.MustJSON(cfg.Dockercopilot["instances"])
	req := &apptypes.BotConfigReq{
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
		BackupMaxFiles:          svc.AsInt(cfg.Telegram["backup_max_files"], 20),
		ImageAccelerators:       strings.Join(svc.StringList(cfg.Telegram["image_accelerators"]), ","),
		DefaultImageAccelerator: svc.AsString(cfg.Telegram["default_image_accelerator"], ""),
		ProxyType:               svc.AsString(svc.ProxyMap(cfg.Telegram["proxy"])["type"], "none"),
		ProxyHost:               svc.AsString(svc.ProxyMap(cfg.Telegram["proxy"])["host"], ""),
		ProxyPort:               svc.AsInt(svc.ProxyMap(cfg.Telegram["proxy"])["port"], 0),
		ProxyUsername:           svc.AsString(svc.ProxyMap(cfg.Telegram["proxy"])["username"], ""),
		ProxyPassword:           svc.AsString(svc.ProxyMap(cfg.Telegram["proxy"])["password"], ""),
		DefaultInstance:         svc.AsString(cfg.Dockercopilot["default_instance"], "local"),
		MultiInstanceEnabled:    svc.AsBool(cfg.Dockercopilot["multi_instance_enabled"]),
		Instances:               string(instancesJSON),
	}
	switch settingName {
	case "update_check_enabled":
		current := svc.AsString(cfg.Telegram["update_check_cron"], "0 18 * * *")
		if isDisabledTelegramCron(current) {
			req.UpdateCheckCron = "0 18 * * *"
		} else {
			req.UpdateCheckCron = "off"
		}
	case "notify_on_update":
		req.NotifyOnUpdate = !svc.AsBool(cfg.Telegram["notify_on_update"])
	case "auto_clean_images":
		req.AutoCleanImages = !svc.AsBool(cfg.Telegram["auto_clean_images"])
	case "auto_update_containers":
		req.AutoUpdateContainers = !svc.AsBool(cfg.Telegram["auto_update_containers"])
	case "auto_backup_json":
		req.AutoBackupJson = !svc.AsBool(cfg.Telegram["auto_backup_json"])
	case "auto_backup_compose":
		req.AutoBackupCompose = !svc.AsBool(cfg.Telegram["auto_backup_compose"])
	case "interactive_enabled":
		req.InteractiveEnabled = !svc.AsBool(cfg.Telegram["interactive_enabled"])
	default:
		r.replyText(ctx, chatID, "❌ 不支持的开关项")
		return
	}
	logic := botlogic.NewConfigLogic(ctx, r.svcCtx)
	resp, err := logic.SaveConfig(req)
	if err != nil || resp == nil || resp.Code != 200 {
		msgText := "❌ 更新配置失败"
		if resp != nil && resp.Msg != "" {
			msgText += ": " + resp.Msg
		}
		r.replyText(ctx, chatID, msgText)
		return
	}
	r.sendSettingsMenu(ctx, chatID, messageID)
}

func (r *Runtime) reloadSettings(ctx context.Context, chatID int64, messageID int) {
	if err := r.svcCtx.ReloadBackupSchedulers(); err != nil {
		r.replyText(ctx, chatID, "❌ 重载备份任务失败: "+err.Error())
		return
	}
	r.sendSettingsMenu(ctx, chatID, messageID)
	r.replyText(ctx, chatID, "✅ 配置已重新加载")
}

func (r *Runtime) loadInstances(ctx context.Context, chatID int64) ([]instanceConfig, string, bool, error) {
	cfg, err := r.getConfig(ctx)
	if err != nil {
		return nil, "", false, err
	}
	instances := parseInstances(cfg.Dockercopilot["instances"])
	sort.Slice(instances, func(i, j int) bool { return strings.ToLower(instances[i].Name) < strings.ToLower(instances[j].Name) })
	defaultInstance := svc.AsString(cfg.Dockercopilot["default_instance"], "local")
	current := r.getCurrentInstance(chatID)
	if current == "" {
		current = defaultInstance
	}
	enabled := svc.AsBool(cfg.Dockercopilot["multi_instance_enabled"])
	return instances, current, enabled, nil
}

func parseInstances(v interface{}) []instanceConfig {
	items := []map[string]interface{}{}
	bs, _ := svc.MustJSON(v)
	_ = svc.UnmarshalJSON(bs, &items)
	result := make([]instanceConfig, 0, len(items))
	for _, item := range items {
		name := strings.TrimSpace(svc.AsString(item["name"], ""))
		apiURL := strings.TrimSpace(svc.AsString(item["api_url"], ""))
		if name == "" || apiURL == "" {
			continue
		}
		result = append(result, instanceConfig{
			Name:      name,
			APIURL:    apiURL,
			SecretKey: svc.AsString(item["secret_key"], ""),
			Timeout:   svc.AsInt(item["timeout"], 30),
			Local:     strings.EqualFold(name, "local"),
		})
	}
	if len(result) == 0 {
		result = append(result, instanceConfig{Name: "local", APIURL: "http://127.0.0.1:12712", SecretKey: "", Timeout: 30, Local: true})
	}
	return result
}

func (r *Runtime) getCurrentInstance(chatID int64) string {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.chatInstance[chatID]
}

func (r *Runtime) setCurrentInstance(chatID int64, name string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.chatInstance[chatID] = name
}

func (r *Runtime) getChatState(chatID int64) (userState, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	state, ok := r.chatState[chatID]
	return state, ok
}

func (r *Runtime) setChatState(chatID int64, state userState) {
	r.mu.Lock()
	defer r.mu.Unlock()
	current := r.chatState[chatID]
	if state.Selected == "" {
		state.Selected = current.Selected
	}
	r.chatState[chatID] = state
}

func (r *Runtime) setSelectedContainer(chatID int64, containerID string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	state := r.chatState[chatID]
	state.Selected = containerID
	r.chatState[chatID] = state
}

func (r *Runtime) selectedContainerID(chatID int64) string {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.chatState[chatID].Selected
}

func (r *Runtime) clearChatState(chatID int64) {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.chatState, chatID)
}

func telegoInlineCancelMarkup() *telego.InlineKeyboardMarkup {
	return tu.InlineKeyboard(
		tu.InlineKeyboardRow(
			tu.InlineKeyboardButton("❌ 取消").WithCallbackData("cancel:"),
		),
	)
}

func boolText(v bool) string {
	if v {
		return "✅ 开启"
	}
	return "❌ 关闭"
}

func isDisabledTelegramCron(value string) bool {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "off", "false", "0", "no":
		return true
	default:
		return false
	}
}

func toggleLabel(v bool, label string) string {
	if v {
		return "⏸️ " + label
	}
	return "▶️ " + label
}
