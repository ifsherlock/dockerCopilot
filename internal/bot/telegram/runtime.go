package telegram

import (
	"context"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/mymmrac/telego"
	ta "github.com/mymmrac/telego/telegoapi"
	tu "github.com/mymmrac/telego/telegoutil"
	containerlogic "github.com/onlyLTY/dockerCopilot/internal/logic/container"
	imagelogic "github.com/onlyLTY/dockerCopilot/internal/logic/image"
	versionlogic "github.com/onlyLTY/dockerCopilot/internal/logic/version"
	"github.com/onlyLTY/dockerCopilot/internal/svc"
	"github.com/robfig/cron/v3"
	"github.com/zeromicro/go-zero/core/logx"
)

type Runtime struct {
	svcCtx       *svc.ServiceContext
	bot          *telego.Bot
	mu           sync.Mutex
	chatInstance map[int64]string
	chatState    map[int64]userState
}

type userState struct {
	Action    string
	Extra     string
	MessageID int
	Selected  string
}

func Start(ctx context.Context, svcCtx *svc.ServiceContext) error {
	cfg, err := svc.LoadRuntimeConfigForRead()
	if err != nil {
		return err
	}
	botToken := strings.TrimSpace(svc.AsString(cfg.Telegram["bot_token"], ""))
	if botToken == "" {
		logx.Infof("Telegram bot token 未配置，跳过 telego bot 启动")
		return nil
	}

	apiCaller, err := newAPICaller(cfg)
	if err != nil {
		return fmt.Errorf("初始化 Telegram API caller 失败: %w", err)
	}

	bot, err := telego.NewBot(botToken, telego.WithAPICaller(apiCaller))
	if err != nil {
		return fmt.Errorf("创建 telego bot 失败: %w", err)
	}

	r := &Runtime{
		svcCtx:       svcCtx,
		bot:          bot,
		chatInstance: map[int64]string{},
		chatState:    map[int64]userState{},
	}
	go r.run(ctx, cfg)
	return nil
}

func newAPICaller(cfg svc.BackupRuntimeConfig) (ta.Caller, error) {
	client, err := svc.TelegramHTTPClient(cfg)
	if err != nil {
		return nil, err
	}
	return &ta.HTTPCaller{Client: client}, nil
}

func (r *Runtime) run(ctx context.Context, cfg svc.BackupRuntimeConfig) {
	if err := r.bot.DeleteWebhook(ctx, (&telego.DeleteWebhookParams{}).WithDropPendingUpdates()); err != nil {
		logx.Errorf("删除 Telegram webhook 失败: %v", err)
	}
	if err := r.setupCommands(ctx); err != nil {
		logx.Errorf("设置 Telegram bot commands 失败: %v", err)
	}
	if err := r.sendStartupNotification(ctx, cfg); err != nil {
		logx.Errorf("发送 Telegram 启动通知失败: %v", err)
	}
	r.startUpdateBackgroundJobs(ctx)

	updates, err := r.bot.UpdatesViaLongPolling(
		ctx,
		&telego.GetUpdatesParams{AllowedUpdates: []string{"message", "callback_query"}},
		telego.WithLongPollingUpdateInterval(0),
		telego.WithLongPollingRetryTimeout(8*time.Second),
	)
	if err != nil {
		logx.Errorf("启动 Telegram long polling 失败: %v", err)
		return
	}

	logx.Infof("telego bot long polling 已启动")
	for update := range updates {
		r.handleUpdate(ctx, update)
	}
	logx.Infof("telego bot long polling 已停止")
}

func (r *Runtime) setupCommands(ctx context.Context) error {
	return r.bot.SetMyCommands(ctx, (&telego.SetMyCommandsParams{}).WithCommands(
		telego.BotCommand{Command: "start", Description: "开始使用Bot"},
		telego.BotCommand{Command: "help", Description: "查看帮助信息"},
		telego.BotCommand{Command: "containers", Description: "查看容器列表"},
		telego.BotCommand{Command: "updates", Description: "查看可更新容器"},
		telego.BotCommand{Command: "images", Description: "查看镜像列表"},
		telego.BotCommand{Command: "clean_images", Description: "清理无用镜像"},
		telego.BotCommand{Command: "backup", Description: "创建容器备份"},
		telego.BotCommand{Command: "backups", Description: "查看备份列表"},
		telego.BotCommand{Command: "status", Description: "查看系统状态"},
		telego.BotCommand{Command: "instances", Description: "切换实例"},
		telego.BotCommand{Command: "manage_instances", Description: "管理实例配置"},
		telego.BotCommand{Command: "settings", Description: "Bot配置管理"},
		telego.BotCommand{Command: "version", Description: "查看版本信息"},
		telego.BotCommand{Command: "update_program", Description: "更新程序"},
	))
}

func (r *Runtime) sendStartupNotification(ctx context.Context, cfg svc.BackupRuntimeConfig) error {
	chatIDs := svc.StringList(cfg.Telegram["chat_ids"])
	if len(chatIDs) == 0 {
		return nil
	}
	instances := []instanceConfig{{Name: "local", APIURL: "http://127.0.0.1:12712", SecretKey: "", Timeout: 30, Local: true}}
	if runtimeCfg, err := r.getConfig(ctx); err == nil {
		loaded := parseInstances(runtimeCfg.Dockercopilot["instances"])
		if len(loaded) > 0 {
			instances = loaded
		}
	}
	var b strings.Builder
	b.WriteString("🎉 <b>Docker Copilot Bot 启动成功</b>\n\n")
	b.WriteString(fmt.Sprintf("⏰ 启动时间: %s\n", time.Now().Format("2006-01-02 15:04:05")))
	b.WriteString(fmt.Sprintf("🖥 实例数量: %d 个\n\n", len(instances)))
	if len(instances) > 0 {
		b.WriteString("📋 <b>可用实例:</b>\n")
		for i, inst := range instances {
			b.WriteString(fmt.Sprintf("  %d. %s\n", i+1, escapeHTML(inst.Name)))
		}
	}
	b.WriteString("\n✅ Bot已就绪,可以开始使用!\n")
	b.WriteString(fmt.Sprintf("🌐代理: %s", escapeHTML(r.proxySummary(cfg))))
	b.WriteString("\n\n💡 发送 /help 查看可用命令")
	msg := b.String()
	for _, chatID := range chatIDs {
		id, err := strconv.ParseInt(strings.TrimSpace(chatID), 10, 64)
		if err != nil {
			continue
		}
		_, err = r.bot.SendMessage(ctx, tu.Message(tu.ID(id), msg).WithParseMode(telego.ModeHTML))
		if err != nil {
			logx.Errorf("发送启动通知失败 [%s]: %v", chatID, err)
		}
	}
	return nil
}

func (r *Runtime) proxySummary(cfg svc.BackupRuntimeConfig) string {
	proxyCfg := svc.ProxyMap(cfg.Telegram["proxy"])
	proxyType := strings.ToLower(strings.TrimSpace(svc.AsString(proxyCfg["type"], "none")))
	if proxyType == "" || proxyType == "none" {
		return "none"
	}
	host := strings.TrimSpace(svc.AsString(proxyCfg["host"], ""))
	port := svc.AsInt(proxyCfg["port"], 0)
	if host == "" || port <= 0 {
		return proxyType
	}
	return fmt.Sprintf("%s://%s:%d", proxyType, host, port)
}

func (r *Runtime) startUpdateBackgroundJobs(ctx context.Context) {
	go func() {
		cfg, err := svc.LoadRuntimeConfigForRead()
		if err != nil {
			logx.Errorf("加载 Telegram 定时任务配置失败: %v", err)
			return
		}
		warmSpec := strings.ToLower(strings.TrimSpace(svc.AsString(cfg.Telegram["update_check_cron"], "0 18 * * *")))
		if warmSpec == "off" || warmSpec == "false" || warmSpec == "0" || warmSpec == "no" {
			return
		}
		warmCtx, cancel := context.WithTimeout(ctx, 5*time.Minute)
		defer cancel()
		if err := r.runUpdateDetectionOnce(warmCtx, true); err != nil {
			logx.Errorf("Telegram 启动预热更新检测失败: %v", err)
		}
	}()

	go func() {
		var lastTick string
		for {
			cfg, err := svc.LoadRuntimeConfigForRead()
			if err != nil {
				logx.Errorf("加载 Telegram 定时任务配置失败: %v", err)
				select {
				case <-ctx.Done():
					return
				case <-time.After(30 * time.Second):
				}
				continue
			}
			spec := strings.TrimSpace(svc.AsString(cfg.Telegram["update_check_cron"], "0 18 * * *"))
			if spec == "" {
				spec = "0 18 * * *"
			}
			lowerSpec := strings.ToLower(spec)
			if lowerSpec == "off" || lowerSpec == "false" || lowerSpec == "0" || lowerSpec == "no" {
				select {
				case <-ctx.Done():
					return
				case <-time.After(30 * time.Second):
				}
				continue
			}
			schedule, err := cron.ParseStandard(spec)
			if err != nil {
				logx.Errorf("解析 Telegram 更新检测 cron 失败 [%s]: %v", spec, err)
				select {
				case <-ctx.Done():
					return
				case <-time.After(30 * time.Second):
				}
				continue
			}
			now := time.Now()
			next := schedule.Next(now)
			wait := time.Until(next)
			if wait < 0 {
				wait = time.Second
			}
			select {
			case <-ctx.Done():
				return
			case <-time.After(wait):
			}
			tickKey := next.Format(time.RFC3339)
			if tickKey == lastTick {
				continue
			}
			lastTick = tickKey
			checkCtx, cancel := context.WithTimeout(ctx, 10*time.Minute)
			if err := r.runUpdateDetectionOnce(checkCtx, false); err != nil {
				logx.Errorf("Telegram 定时更新检测失败: %v", err)
			}
			cancel()
		}
	}()
}

func (r *Runtime) runUpdateDetectionOnce(ctx context.Context, silent bool) error {
	cfg, err := svc.LoadRuntimeConfigForRead()
	if err != nil {
		return err
	}
	instances := []instanceConfig{{Name: "local", APIURL: "http://127.0.0.1:12712", SecretKey: "", Timeout: 30, Local: true}}
	if runtimeCfg, err := r.getConfig(ctx); err == nil {
		if loaded := parseInstances(runtimeCfg.Dockercopilot["instances"]); len(loaded) > 0 {
			instances = loaded
		}
	}
	chatIDs := svc.StringList(cfg.Telegram["chat_ids"])
	notifyEnabled := svc.AsBool(cfg.Telegram["notify_on_update"])
	startedAt := time.Now()
	logx.Infof("开始后台更新检测: instances=%d silent=%v", len(instances), silent)
	for _, inst := range instances {
		instStart := time.Now()
		updates, err := r.refreshUpdatableContainersForInstance(ctx, inst)
		if err != nil {
			logx.Errorf("实例 %s 更新检测失败: %v", inst.Name, err)
			continue
		}
		logx.Infof("实例 %s 更新检测完成: updates=%d duration=%s", inst.Name, len(updates), time.Since(instStart).Round(time.Millisecond))
		if notifyEnabled && !silent && len(updates) > 0 {
			r.broadcastUpdateNotification(ctx, chatIDs, inst.Name, updates)
		}
	}
	logx.Infof("后台更新检测结束: duration=%s", time.Since(startedAt).Round(time.Millisecond))
	return nil
}

func (r *Runtime) refreshUpdatableContainersSnapshot(ctx context.Context, inst instanceConfig) ([]containerView, bool, bool, time.Duration, error) {
	startedAt := time.Now()
	logx.Infof("开始刷新可更新容器: instance=%s local=%v", inst.Name, inst.Local)
	if inst.Local {
		running, last := r.svcCtx.UpdateCheckStatus()
		freshWithin := 60 * time.Second
		cacheAge := time.Duration(0)
		if !last.IsZero() {
			cacheAge = time.Since(last)
		}
		shouldTriggerCheck := !running && (last.IsZero() || cacheAge > freshWithin)
		if shouldTriggerCheck {
			logic := containerlogic.NewCheckUpdateLogic(ctx, r.svcCtx)
			if _, err := logic.CheckUpdate(); err != nil {
				logx.Errorf("触发更新检查失败: instance=%s err=%v", inst.Name, err)
			} else {
				logx.Infof("已在后台触发新的更新检查: instance=%s freshWithin=%s", inst.Name, freshWithin)
			}
		} else {
			logx.Infof("复用近期更新检测结果: instance=%s running=%v age=%s", inst.Name, running, cacheAge.Round(time.Millisecond))
		}

		items, _, err := r.listCurrentContainersForInstance(ctx, inst)
		if err != nil {
			logx.Errorf("刷新可更新容器失败: instance=%s err=%v", inst.Name, err)
			return nil, shouldTriggerCheck, running, cacheAge, err
		}
		updates := filterUpdatableContainers(items)
		runningAfter, _ := r.svcCtx.UpdateCheckStatus()
		logx.Infof("刷新可更新容器完成(即时返回): instance=%s updates=%d triggered=%v running=%v duration=%s", inst.Name, len(updates), shouldTriggerCheck, runningAfter, time.Since(startedAt).Round(time.Millisecond))
		return updates, shouldTriggerCheck, runningAfter, cacheAge, nil
	}
	items, _, err := r.listCurrentContainersForInstance(ctx, inst)
	if err != nil {
		logx.Errorf("远端实例刷新可更新容器失败: instance=%s err=%v", inst.Name, err)
		return nil, false, false, 0, err
	}
	updates := filterUpdatableContainers(items)
	logx.Infof("远端实例刷新可更新容器完成: instance=%s updates=%d duration=%s", inst.Name, len(updates), time.Since(startedAt).Round(time.Millisecond))
	return updates, false, false, 0, nil
}

func (r *Runtime) refreshUpdatableContainersForInstance(ctx context.Context, inst instanceConfig) ([]containerView, error) {
	updates, _, _, _, err := r.refreshUpdatableContainersSnapshot(ctx, inst)
	return updates, err
}

func filterUpdatableContainers(items []containerView) []containerView {
	updates := make([]containerView, 0)
	for _, item := range items {
		if item.HaveUpdate && !item.UpdateBlocked {
			updates = append(updates, item)
		}
	}
	sort.Slice(updates, func(i, j int) bool { return strings.ToLower(updates[i].Name) < strings.ToLower(updates[j].Name) })
	return updates
}

func (r *Runtime) broadcastUpdateNotification(ctx context.Context, chatIDs []string, instanceName string, updates []containerView) {
	if len(chatIDs) == 0 || len(updates) == 0 {
		return
	}
	var b strings.Builder
	b.WriteString("🆕 <b>检测到可更新容器</b>\n\n")
	b.WriteString(fmt.Sprintf("🖥 实例: <b>%s</b>\n", escapeHTML(instanceName)))
	b.WriteString(fmt.Sprintf("数量: <b>%d</b>\n\n", len(updates)))
	limit := len(updates)
	if limit > 8 {
		limit = 8
	}
	for i := 0; i < limit; i++ {
		item := updates[i]
		b.WriteString(fmt.Sprintf("%d. <b>%s</b>\n", i+1, escapeHTML(item.Name)))
		if ref := strings.TrimSpace(oneLineImageRef(item.UsingImage)); ref != "" {
			b.WriteString(fmt.Sprintf("   📦 %s\n", escapeHTML(shorten(ref, 48))))
		}
	}
	if len(updates) > limit {
		b.WriteString(fmt.Sprintf("\n… 还有 <b>%d</b> 个\n", len(updates)-limit))
	}
	b.WriteString("\n💡 发送 /updates 查看详情")
	msg := b.String()
	for _, chatID := range chatIDs {
		id, err := strconv.ParseInt(strings.TrimSpace(chatID), 10, 64)
		if err != nil {
			continue
		}
		if _, err := r.bot.SendMessage(ctx, tu.Message(tu.ID(id), msg).WithParseMode(telego.ModeHTML)); err != nil {
			logx.Errorf("发送更新通知失败 [%s]: %v", chatID, err)
		}
	}
}

func (r *Runtime) handleUpdate(ctx context.Context, update telego.Update) {
	if update.Message != nil {
		r.handleMessage(ctx, update.Message)
		return
	}
	if update.CallbackQuery != nil {
		r.handleCallback(ctx, update.CallbackQuery)
		return
	}
}

func (r *Runtime) handleMessage(ctx context.Context, msg *telego.Message) {
	text := strings.TrimSpace(msg.Text)
	if text == "" {
		return
	}
	if r.handleStatefulInput(ctx, msg) {
		return
	}
	logx.Infof("telegram inbound message: chat=%d text=%q", msg.Chat.ID, text)
	switch strings.Fields(strings.ToLower(text))[0] {
	case "/start":
		r.replyText(ctx, msg.Chat.ID, r.helpText())
	case "/help":
		r.replyText(ctx, msg.Chat.ID, r.helpText())
	case "/cancel":
		if state, ok := r.getChatState(msg.Chat.ID); ok {
			logx.Infof("telegram command /cancel: chat=%d old_state_action=%q old_state_extra=%q old_state_message_id=%d old_state_selected=%q branch=clear_and_reply", msg.Chat.ID, state.Action, state.Extra, state.MessageID, state.Selected)
			r.clearChatState(msg.Chat.ID)
			r.replyText(ctx, msg.Chat.ID, "已取消。\n\n发送 /help 唤出菜单")
			return
		}
		logx.Infof("telegram command /cancel: chat=%d old_state_action=%q old_state_extra=%q old_state_message_id=%d old_state_selected=%q branch=reply_without_state", msg.Chat.ID, "", "", 0, "")
		r.replyText(ctx, msg.Chat.ID, "已取消。\n\n发送 /help 唤出菜单")
	case "/containers":
		logx.Infof("telegram command /containers chat=%d", msg.Chat.ID)
		r.sendContainers(ctx, msg.Chat.ID)
	case "/updates":
		logx.Infof("telegram command /updates chat=%d", msg.Chat.ID)
		r.sendUpdates(ctx, msg.Chat.ID)
	case "/images":
		logx.Infof("telegram command /images chat=%d", msg.Chat.ID)
		r.sendImages(ctx, msg.Chat.ID)
	case "/clean_images", "/cleanup":
		logx.Infof("telegram command /clean_images chat=%d", msg.Chat.ID)
		r.confirmCleanupImages(ctx, msg.Chat.ID, false)
	case "/backup":
		logx.Infof("telegram command /backup chat=%d", msg.Chat.ID)
		r.confirmBackup(ctx, msg.Chat.ID)
	case "/backups":
		logx.Infof("telegram command /backups chat=%d", msg.Chat.ID)
		r.sendBackups(ctx, msg.Chat.ID)
	case "/instances":
		r.sendInstancesList(ctx, msg.Chat.ID, 0)
	case "/manage_instances", "/manage":
		r.sendManageInstances(ctx, msg.Chat.ID, 0)
	case "/settings":
		r.sendSettingsMenu(ctx, msg.Chat.ID, 0)
	case "/program_update", "/update_program":
		r.confirmProgramUpdate(ctx, msg.Chat.ID)
	case "/status":
		r.sendStatus(ctx, msg.Chat.ID)
	case "/version":
		r.sendVersion(ctx, msg.Chat.ID)
	default:
		r.replyText(ctx, msg.Chat.ID, "暂不支持这个命令，发 /help 看可用命令。")
	}
}

func (r *Runtime) handleCallback(ctx context.Context, q *telego.CallbackQuery) {
	if q.Message == nil {
		return
	}
	chatID := q.Message.GetChat().ID
	messageID := q.Message.GetMessageID()
	_ = r.bot.AnswerCallbackQuery(ctx, tu.CallbackQuery(q.ID).WithText("处理中"))

	data := strings.TrimSpace(q.Data)
	parts := strings.Split(data, ":")
	if len(parts) == 0 {
		return
	}
	action := parts[0]
	arg := ""
	if len(parts) > 1 {
		arg = strings.Join(parts[1:], ":")
	}

	switch action {
	case "update":
		r.updateContainer(ctx, chatID, arg)
	case "switch_instance":
		r.switchInstance(ctx, chatID, messageID, arg)
	case "manage_instances":
		r.sendManageInstances(ctx, chatID, messageID)
	case "instances_menu":
		r.sendInstancesList(ctx, chatID, messageID)
	case "manage_inst_detail":
		r.sendInstanceDetail(ctx, chatID, messageID, arg)
	case "settings_menu":
		if state, ok := r.getChatState(chatID); ok {
			logx.Infof("telegram callback settings_menu: chat=%d data=%q old_state_action=%q old_state_extra=%q old_state_message_id=%d old_state_selected=%q branch=send_settings_menu", chatID, data, state.Action, state.Extra, state.MessageID, state.Selected)
		} else {
			logx.Infof("telegram callback settings_menu: chat=%d data=%q old_state_action=%q old_state_extra=%q old_state_message_id=%d old_state_selected=%q branch=send_settings_menu", chatID, data, "", "", 0, "")
		}
		r.sendSettingsMenu(ctx, chatID, messageID)
	case "settings_toggle":
		r.toggleSetting(ctx, chatID, messageID, arg)
	case "settings_reload":
		r.reloadSettings(ctx, chatID, messageID)
	case "settings_edit_blacklist":
		r.startEditBlacklist(ctx, chatID, messageID)
	case "settings_edit_cron":
		r.startEditCron(ctx, chatID, messageID, arg)
	case "settings_edit_text":
		r.startEditText(ctx, chatID, messageID, arg)
	case "instcfg_menu":
		r.sendInstancesConfigMenu(ctx, chatID, messageID)
	case "instcfg_detail":
		r.sendInstanceConfigDetail(ctx, chatID, messageID, arg)
	case "instcfg_add":
		r.startAddInstanceConfig(ctx, chatID, messageID)
	case "instcfg_edit":
		r.startEditInstanceConfig(ctx, chatID, messageID, arg)
	case "instcfg_test":
		r.testInstanceConfig(ctx, chatID, arg)
	case "instcfg_delete_confirm":
		r.confirmDeleteInstanceConfig(ctx, chatID, messageID, arg)
	case "instcfg_delete":
		if err := r.deleteInstanceConfig(ctx, chatID, arg); err != nil {
			r.replyText(ctx, chatID, "❌ 删除实例失败: "+err.Error())
			return
		}
		r.replyText(ctx, chatID, "✅ 实例已删除")
		r.sendInstancesConfigMenu(ctx, chatID, messageID)
	case "containers_pick":
		r.selectContainerAndRefresh(ctx, chatID, messageID, arg)
	case "containers_update_all":
		r.updateAllContainersOnPage(ctx, chatID, messageID, parsePage(arg))
	case "containers_close":
		r.editOrReplyText(ctx, chatID, messageID, "✅ 已退出容器菜单\n\n发送 /help 唤出菜单", nil)
	case "container_back_list":
		r.sendContainersPage(ctx, chatID, messageID, parsePage(arg))
	case "container_start":
		page := parsePage(arg)
		if err := r.startSelectedContainer(ctx, chatID); err != nil {
			r.replyText(ctx, chatID, "❌ 启动失败: "+err.Error())
			return
		}
		r.replyText(ctx, chatID, "✅ 容器已启动")
		r.sendSelectedContainerDetail(ctx, chatID, messageID, page)
	case "container_stop":
		page := parsePage(arg)
		if err := r.stopSelectedContainer(ctx, chatID); err != nil {
			r.replyText(ctx, chatID, "❌ 停止失败: "+err.Error())
			return
		}
		r.replyText(ctx, chatID, "✅ 容器已停止")
		r.sendSelectedContainerDetail(ctx, chatID, messageID, page)
	case "container_restart":
		page := parsePage(arg)
		if err := r.restartSelectedContainer(ctx, chatID); err != nil {
			r.replyText(ctx, chatID, "❌ 重启失败: "+err.Error())
			return
		}
		r.replyText(ctx, chatID, "✅ 容器已重启")
		r.sendSelectedContainerDetail(ctx, chatID, messageID, page)
	case "container_update":
		r.updateSelectedContainer(ctx, chatID)
	case "show_backup_menu":
		r.confirmBackup(ctx, chatID)
	case "backup_json":
		r.doJSONBackup(ctx, chatID)
	case "confirm_backup":
		r.doJSONBackupWithMessage(ctx, chatID, messageID)
	case "confirm_backup_compose":
		r.doComposeBackupWithMessage(ctx, chatID, messageID)
	case "backup_compose":
		r.doComposeBackup(ctx, chatID)
	case "backups_refresh":
		r.sendBackups(ctx, chatID)
	case "backup_detail":
		r.sendBackupDetail(ctx, chatID, messageID, arg)
	case "confirm_delete_backup":
		r.confirmDeleteBackup(ctx, chatID, messageID, arg)
	case "do_delete_backup":
		r.doDeleteBackup(ctx, chatID, messageID, arg)
	case "back_backups":
		r.sendBackupsPage(ctx, chatID, messageID, parsePage(arg))
	case "restore":
		r.restoreBackup(ctx, chatID, arg)
	case "delete_backup":
		r.deleteBackup(ctx, chatID, arg)
	case "confirm_clean_images":
		r.confirmCleanupImages(ctx, chatID, false)
	case "confirm_clean_images_force":
		r.confirmCleanupImages(ctx, chatID, true)
	case "do_clean_images":
		r.doCleanUnusedImages(ctx, chatID, false)
	case "do_clean_images_force":
		r.doCleanUnusedImages(ctx, chatID, true)
	case "cancel":
		if state, ok := r.getChatState(chatID); ok {
			logx.Infof("telegram callback cancel: chat=%d data=%q old_state_action=%q old_state_extra=%q old_state_message_id=%d old_state_selected=%q branch=reply_cancel_only", chatID, data, state.Action, state.Extra, state.MessageID, state.Selected)
		} else {
			logx.Infof("telegram callback cancel: chat=%d data=%q old_state_action=%q old_state_extra=%q old_state_message_id=%d old_state_selected=%q branch=reply_cancel_only", chatID, data, "", "", 0, "")
		}
		r.replyText(ctx, chatID, "已取消。\n\n发送 /help 唤出菜单")
	case "confirm_program_update":
		r.doProgramUpdate(ctx, chatID)
	case "remove_image":
		r.removeImage(ctx, chatID, arg)
	case "image":
		r.sendImageDetail(ctx, chatID, messageID, arg)
	case "confirm_del_image":
		r.confirmDeleteImage(ctx, chatID, messageID, arg)
	case "do_del_image":
		r.doDeleteImage(ctx, chatID, messageID, arg)
	case "update_pick":
		r.updateContainerByPageIndex(ctx, chatID, arg)
	case "updates_update_all":
		r.updateAllUpdatableContainers(ctx, chatID)
	case "images_refresh_updates":
		r.sendUpdates(ctx, chatID)
	case "updates_refresh":
		statusText := "⏳ 正在后台刷新可更新容器，请稍候..."
		r.editOrReplyText(ctx, chatID, messageID, statusText, nil)
		go func(mid int) {
			checkCtx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
			defer cancel()
			r.sendUpdatesProgressively(checkCtx, chatID, mid, 0)
		}(messageID)
	case "back_images":
		r.sendImagesPage(ctx, chatID, messageID, parsePage(arg))
	case "images_refresh":
		r.sendImages(ctx, chatID)
	case "backups_page":
		r.sendBackupsPage(ctx, chatID, messageID, parsePage(arg))
	case "images_page":
		r.sendImagesPage(ctx, chatID, messageID, parsePage(arg))
	case "containers_page":
		r.sendContainersPage(ctx, chatID, messageID, parsePage(arg))
	case "updates_page":
		r.sendUpdatesPage(ctx, chatID, messageID, parsePage(arg))
	}
}

func (r *Runtime) helpText() string {
	return strings.Join([]string{
		"📖 <b>Docker Copilot Bot 帮助</b>",
		"",
		"📦 容器管理:",
		"/containers - 查看容器列表(支持分页)",
		"/updates - 查看可更新容器",
		"/status - 查看系统状态",
		"",
		"🖼 镜像管理:",
		"/images - 查看镜像列表",
		"/clean_images - 清理无用镜像(手动清理)",
		"",
		"💾 备份管理:",
		"/backup - 创建容器备份",
		"/backups - 查看备份列表",
		"",
		"i️ 其他命令:",
		"/start - 查看欢迎信息",
		"/help - 显示本帮助信息",
		"/version - 查看版本信息",
		"/program_update - 更新DockerCopilot服务",
		"",
		"💡 提示:",
		"点击列表项可查看详情并进行操作",
		"",
		"🔧 配置方式:",
		"config.json(通过 /settings 修改)或环境变量",
	}, "\n")
}

func (r *Runtime) handleStatefulInput(ctx context.Context, msg *telego.Message) bool {
	state, ok := r.getChatState(msg.Chat.ID)
	if !ok {
		logx.Infof("telegram stateful input miss: chat=%d text=%q branch=no_state", msg.Chat.ID, strings.TrimSpace(msg.Text))
		return false
	}
	logx.Infof("telegram stateful input hit: chat=%d text=%q old_state_action=%q old_state_extra=%q old_state_message_id=%d old_state_selected=%q", msg.Chat.ID, strings.TrimSpace(msg.Text), state.Action, state.Extra, state.MessageID, state.Selected)
	switch state.Action {
	case "edit_blacklist":
		logx.Infof("telegram stateful input dispatch: chat=%d text=%q branch=edit_blacklist", msg.Chat.ID, strings.TrimSpace(msg.Text))
		r.processBlacklistInput(ctx, msg)
		return true
	case "edit_cron":
		logx.Infof("telegram stateful input dispatch: chat=%d text=%q branch=edit_cron", msg.Chat.ID, strings.TrimSpace(msg.Text))
		r.processCronInput(ctx, msg, state)
		return true
	case "edit_text":
		logx.Infof("telegram stateful input dispatch: chat=%d text=%q branch=edit_text", msg.Chat.ID, strings.TrimSpace(msg.Text))
		r.processTextInput(ctx, msg, state)
		return true
	case "instance_add", "instance_edit":
		logx.Infof("telegram stateful input dispatch: chat=%d text=%q branch=%s", msg.Chat.ID, strings.TrimSpace(msg.Text), state.Action)
		r.processInstanceConfigInput(ctx, msg, state)
		return true
	default:
		logx.Infof("telegram stateful input bypass: chat=%d text=%q old_state_action=%q branch=unknown_state", msg.Chat.ID, strings.TrimSpace(msg.Text), state.Action)
		return false
	}
}

func isRetryableTelegramError(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	for _, key := range []string{
		"eof",
		"connection reset by peer",
		"broken pipe",
		"client.timeout exceeded",
		"timeout awaiting response headers",
		"use of closed network connection",
		"http2: client connection lost",
		"stream error",
		"tls handshake timeout",
		"i/o timeout",
		"temporary failure",
	} {
		if strings.Contains(msg, key) {
			return true
		}
	}
	return false
}

func (r *Runtime) sendTelegramMessageWithRetry(ctx context.Context, chatID int64, text string, markup *telego.InlineKeyboardMarkup) (*telego.Message, error) {
	var lastErr error
	for attempt := 1; attempt <= 3; attempt++ {
		msg := tu.Message(tu.ID(chatID), text).WithParseMode(telego.ModeHTML)
		if markup != nil {
			msg = msg.WithReplyMarkup(markup)
		}
		sent, err := r.bot.SendMessage(ctx, msg)
		if err == nil {
			if attempt > 1 {
				logx.Infof("Telegram SendMessage 重试成功: chat=%d attempt=%d", chatID, attempt)
			}
			return sent, nil
		}
		lastErr = err
		if !isRetryableTelegramError(err) || attempt == 3 {
			break
		}
		backoff := time.Duration(attempt*300) * time.Millisecond
		logx.Errorf("Telegram SendMessage 失败，准备重试: chat=%d attempt=%d err=%v backoff=%s", chatID, attempt, err, backoff)
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(backoff):
		}
	}
	return nil, lastErr
}

func (r *Runtime) editTelegramMessageWithRetry(ctx context.Context, chatID int64, messageID int, text string, markup *telego.InlineKeyboardMarkup) error {
	var lastErr error
	for attempt := 1; attempt <= 3; attempt++ {
		params := tu.EditMessageText(tu.ID(chatID), messageID, text).WithParseMode(telego.ModeHTML)
		if markup != nil {
			params = params.WithReplyMarkup(markup)
		}
		_, err := r.bot.EditMessageText(ctx, params)
		if err == nil {
			if attempt > 1 {
				logx.Infof("Telegram EditMessageText 重试成功: chat=%d message=%d attempt=%d", chatID, messageID, attempt)
			}
			return nil
		}
		lastErr = err
		if !isRetryableTelegramError(err) || attempt == 3 {
			break
		}
		backoff := time.Duration(attempt*300) * time.Millisecond
		logx.Errorf("Telegram EditMessageText 失败，准备重试: chat=%d message=%d attempt=%d err=%v backoff=%s", chatID, messageID, attempt, err, backoff)
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(backoff):
		}
	}
	return lastErr
}

func (r *Runtime) replyText(ctx context.Context, chatID int64, text string) {
	if _, err := r.sendTelegramMessageWithRetry(ctx, chatID, text, nil); err != nil {
		logx.Errorf("发送 Telegram 消息失败 chat=%d: %v | text=%q", chatID, err, shorten(text, 200))
	}
}

func (r *Runtime) sendText(ctx context.Context, chatID int64, text string, markup *telego.InlineKeyboardMarkup) (*telego.Message, error) {
	sent, err := r.sendTelegramMessageWithRetry(ctx, chatID, text, markup)
	if err != nil {
		logx.Errorf("发送 Telegram 消息失败 chat=%d: %v | text=%q", chatID, err, shorten(text, 200))
		return nil, err
	}
	return sent, nil
}

func (r *Runtime) editOrReplyText(ctx context.Context, chatID int64, messageID int, text string, markup *telego.InlineKeyboardMarkup) {
	if messageID <= 0 {
		if _, err := r.sendTelegramMessageWithRetry(ctx, chatID, text, markup); err != nil {
			logx.Errorf("发送 Telegram 消息失败 chat=%d: %v | text=%q", chatID, err, shorten(text, 200))
		}
		return
	}
	if err := r.editTelegramMessageWithRetry(ctx, chatID, messageID, text, markup); err != nil {
		logx.Errorf("编辑 Telegram 消息失败 chat=%d message=%d: %v | fallback-send", chatID, messageID, err)
		if _, sendErr := r.sendTelegramMessageWithRetry(ctx, chatID, text, markup); sendErr != nil {
			logx.Errorf("回退发送 Telegram 消息失败 chat=%d: %v | text=%q", chatID, sendErr, shorten(text, 200))
		}
	}
}

func (r *Runtime) sendContainers(ctx context.Context, chatID int64) {
	r.sendContainersPage(ctx, chatID, 0, 0)
}

func (r *Runtime) sendContainersPage(ctx context.Context, chatID int64, messageID int, page int) {
	items, inst, err := r.listCurrentContainers(ctx, chatID)
	if err != nil {
		r.replyText(ctx, chatID, "❌ 获取容器列表失败: "+err.Error())
		return
	}
	if len(items) == 0 {
		r.replyText(ctx, chatID, fmt.Sprintf("📦 实例 <b>%s</b> 当前没有容器", escapeHTML(inst.Name)))
		return
	}
	text, markup := r.renderContainersPage(chatID, items, inst.Name, page)
	r.editOrReplyText(ctx, chatID, messageID, text, markup)
}

func (r *Runtime) renderContainersPage(chatID int64, items []containerView, instanceName string, page int) (string, *telego.InlineKeyboardMarkup) {
	const pageSize = 8
	page, totalPages, start, end := paginate(len(items), page, pageSize)
	var b strings.Builder
	b.WriteString(fmt.Sprintf("📦 <b>容器列表</b> · <b>%s</b>（第 %d/%d 页）\n", escapeHTML(instanceName), page+1, totalPages))
	b.WriteString("点击一个容器，进入这个容器的操作菜单。\n\n")
	rows := make([][]telego.InlineKeyboardButton, 0)
	selectedID := r.selectedContainerID(chatID)
	pageItems := items[start:end]
	for i := 0; i < len(pageItems); i += 2 {
		row := make([]telego.InlineKeyboardButton, 0, 2)
		for j := i; j < i+2 && j < len(pageItems); j++ {
			item := pageItems[j]
			absoluteIdx := start + j
			prefix := "⚪"
			if strings.Contains(strings.ToLower(item.Status), "running") {
				prefix = "🟢"
			}
			if item.ID == selectedID {
				prefix = "✅"
			}
			label := prefix + " " + leftAlignPairLabel(trimButtonLabel(item.Name))
			if item.UpdateBlocked {
				label += " 🚫"
			} else if item.HaveUpdate {
				label += " 🆙"
			}
			row = append(row, tu.InlineKeyboardButton(label).WithCallbackData(fmt.Sprintf("containers_pick:%d:%d", page, absoluteIdx)))
		}
		rows = append(rows, row)
	}
	rows = append(rows, paginationRow("containers_page", page, totalPages)...)
	rows = append(rows, tu.InlineKeyboardRow(
		tu.InlineKeyboardButton("❌ 退出").WithCallbackData("containers_close:"),
	))
	return b.String(), tu.InlineKeyboard(rows...)
}

func (r *Runtime) sendSelectedContainerDetail(ctx context.Context, chatID int64, messageID int, page int) {
	items, inst, err := r.listCurrentContainers(ctx, chatID)
	if err != nil {
		r.replyText(ctx, chatID, "❌ 获取容器列表失败: "+err.Error())
		return
	}
	selectedID := r.selectedContainerID(chatID)
	selected := findSelectedContainer(items, selectedID)
	if selected == nil {
		r.replyText(ctx, chatID, "❌ 当前选中的容器不存在")
		return
	}
	text, markup := r.renderSelectedContainerDetail(*selected, inst.Name, page)
	r.editOrReplyText(ctx, chatID, messageID, text, markup)
}

func (r *Runtime) renderSelectedContainerDetail(selected containerView, instanceName string, page int) (string, *telego.InlineKeyboardMarkup) {
	var b strings.Builder
	b.WriteString(fmt.Sprintf("📦 <b>容器菜单</b> · <b>%s</b>\n\n", escapeHTML(instanceName)))
	b.WriteString(fmt.Sprintf("容器: <b>%s</b>\n", escapeHTML(selected.Name)))
	b.WriteString(fmt.Sprintf("状态: <code>%s</code>\n", escapeHTML(selected.Status)))
	b.WriteString(fmt.Sprintf("镜像: <code>%s</code>\n", escapeHTML(shorten(selected.UsingImage, 90))))
	b.WriteString(fmt.Sprintf("ID: <code>%s</code>\n", escapeHTML(shorten(selected.ID, 24))))
	if selected.UpdateBlocked {
		b.WriteString("更新状态: <code>黑名单中，已禁止更新</code>\n")
	} else if selected.HaveUpdate {
		b.WriteString("更新状态: <code>可更新</code>\n")
	}
	b.WriteString("\n请选择操作：")
	rows := [][]telego.InlineKeyboardButton{
		tu.InlineKeyboardRow(
			tu.InlineKeyboardButton("▶️ 启动").WithCallbackData("container_start:"+strconv.Itoa(page)),
			tu.InlineKeyboardButton("⏹ 停止").WithCallbackData("container_stop:"+strconv.Itoa(page)),
			tu.InlineKeyboardButton("🔄 重启").WithCallbackData("container_restart:"+strconv.Itoa(page)),
		),
	}
	if selected.HaveUpdate && !selected.UpdateBlocked {
		rows = append(rows, tu.InlineKeyboardRow(
			tu.InlineKeyboardButton("🆙 更新当前").WithCallbackData("container_update:"),
		))
	}
	rows = append(rows, tu.InlineKeyboardRow(
		tu.InlineKeyboardButton("↩️ 返回列表").WithCallbackData("container_back_list:"+strconv.Itoa(page)),
		tu.InlineKeyboardButton("❌ 退出").WithCallbackData("containers_close:"),
	))
	return b.String(), tu.InlineKeyboard(rows...)
}

func (r *Runtime) sendUpdates(ctx context.Context, chatID int64) {
	statusText := "⏳ 正在后台检查可更新容器，请稍候..."
	sent, err := r.sendText(ctx, chatID, statusText, nil)
	if err != nil {
		return
	}
	messageID := 0
	if sent != nil {
		messageID = sent.MessageID
	}
	go func(mid int) {
		checkCtx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
		defer cancel()
		r.sendUpdatesProgressively(checkCtx, chatID, mid, 0)
	}(messageID)
}

func (r *Runtime) sendUpdatesProgressively(ctx context.Context, chatID int64, messageID int, page int) {
	inst, err := r.currentInstance(ctx, chatID)
	if err != nil {
		logx.Errorf("sendUpdatesProgressively 获取实例失败: chat=%d err=%v", chatID, err)
		r.replyText(ctx, chatID, "❌ 获取可更新容器失败: "+err.Error())
		return
	}

	type result struct {
		updates   []containerView
		triggered bool
		running   bool
		cacheAge  time.Duration
		err       error
	}
	resultCh := make(chan result, 1)
	go func() {
		updates, triggered, running, cacheAge, err := r.refreshUpdatableContainersSnapshot(ctx, inst)
		resultCh <- result{updates: updates, triggered: triggered, running: running, cacheAge: cacheAge, err: err}
	}()

	select {
	case res := <-resultCh:
		if res.err != nil {
			logx.Errorf("sendUpdatesProgressively 刷新失败: chat=%d instance=%s err=%v", chatID, inst.Name, res.err)
			r.editOrReplyText(ctx, chatID, messageID, "❌ 获取可更新容器失败: "+res.err.Error(), nil)
			return
		}
		rendered := r.renderUpdatesResult(ctx, chatID, messageID, inst.Name, res.updates, page)
		if rendered && (res.triggered || res.running) {
			go r.finalizeUpdatesAfterBackgroundCheck(context.Background(), chatID, messageID, inst, page)
		}
		return
	case <-time.After(3 * time.Second):
		cacheText := "⏳ 实时检查超过 3 秒，先展示缓存结果…"
		r.editOrReplyText(ctx, chatID, messageID, cacheText, nil)
	}

	res := <-resultCh
	if res.err != nil {
		logx.Errorf("sendUpdatesProgressively 超时后刷新失败: chat=%d instance=%s err=%v", chatID, inst.Name, res.err)
		r.editOrReplyText(ctx, chatID, messageID, "❌ 获取可更新容器失败: "+res.err.Error(), nil)
		return
	}

	progressPrefix := fmt.Sprintf("🕒 先展示缓存结果（缓存年龄：<b>%s</b>）\n实时检查仍在后台继续，稍后会自动刷新。\n\n", formatCacheAge(res.cacheAge))
	if len(res.updates) == 0 {
		r.editOrReplyText(ctx, chatID, messageID, progressPrefix+fmt.Sprintf("实例 <b>%s</b> 当前缓存结果显示没有可更新容器", escapeHTML(inst.Name)), nil)
	} else {
		text, markup := r.renderUpdatesPage(res.updates, inst.Name, page)
		r.editOrReplyText(ctx, chatID, messageID, progressPrefix+text, markup)
	}
	if res.triggered || res.running {
		go r.finalizeUpdatesAfterBackgroundCheck(context.Background(), chatID, messageID, inst, page)
	}
}

func formatCacheAge(age time.Duration) string {
	if age <= 0 {
		return "刚刚"
	}
	if age < time.Second {
		return age.Round(100 * time.Millisecond).String()
	}
	return age.Round(time.Second).String()
}

func (r *Runtime) finalizeUpdatesAfterBackgroundCheck(ctx context.Context, chatID int64, messageID int, inst instanceConfig, page int) {
	waitCtx, cancel := context.WithTimeout(ctx, 90*time.Second)
	defer cancel()
	for {
		running, _ := r.svcCtx.UpdateCheckStatus()
		if !running {
			break
		}
		select {
		case <-waitCtx.Done():
			logx.Errorf("finalizeUpdatesAfterBackgroundCheck 等待后台检查结束超时: chat=%d instance=%s", chatID, inst.Name)
			return
		case <-time.After(1500 * time.Millisecond):
		}
	}
	latest, err := r.refreshUpdatableContainersForInstance(waitCtx, inst)
	if err != nil {
		logx.Errorf("finalizeUpdatesAfterBackgroundCheck 最终刷新失败: chat=%d instance=%s err=%v", chatID, inst.Name, err)
		r.editOrReplyText(waitCtx, chatID, messageID, "❌ 获取实时更新结果失败: "+err.Error(), nil)
		return
	}
	if len(latest) == 0 {
		r.editOrReplyText(waitCtx, chatID, messageID, fmt.Sprintf("✅ 实时更新结果已返回\n\n实例 <b>%s</b> 当前没有可更新容器", escapeHTML(inst.Name)), nil)
		return
	}
	text, markup := r.renderUpdatesPage(latest, inst.Name, page)
	r.editOrReplyText(waitCtx, chatID, messageID, "✅ 实时更新结果已返回\n\n"+text, markup)
}

func (r *Runtime) renderUpdatesResult(ctx context.Context, chatID int64, messageID int, instanceName string, updates []containerView, page int) bool {
	if len(updates) == 0 {
		logx.Infof("sendUpdatesPage 准备回消息: chat=%d instance=%s updates=0", chatID, instanceName)
		r.editOrReplyText(ctx, chatID, messageID, fmt.Sprintf("✅ 实例 <b>%s</b> 当前没有可更新容器", escapeHTML(instanceName)), nil)
		return true
	}
	text, markup := r.renderUpdatesPage(updates, instanceName, page)
	logx.Infof("sendUpdatesPage 准备回消息: chat=%d instance=%s updates=%d page=%d", chatID, instanceName, len(updates), page)
	r.editOrReplyText(ctx, chatID, messageID, text, markup)
	return true
}

func (r *Runtime) sendUpdatesPage(ctx context.Context, chatID int64, messageID int, page int) {
	inst, err := r.currentInstance(ctx, chatID)
	if err != nil {
		logx.Errorf("sendUpdatesPage 获取实例失败: chat=%d err=%v", chatID, err)
		r.replyText(ctx, chatID, "❌ 获取可更新容器失败: "+err.Error())
		return
	}
	updates, err := r.refreshUpdatableContainersForInstance(ctx, inst)
	if err != nil {
		logx.Errorf("sendUpdatesPage 刷新失败: chat=%d instance=%s err=%v", chatID, inst.Name, err)
		r.replyText(ctx, chatID, "❌ 获取可更新容器失败: "+err.Error())
		return
	}
	r.renderUpdatesResult(ctx, chatID, messageID, inst.Name, updates, page)
}

func (r *Runtime) renderUpdatesPage(items []containerView, instanceName string, page int) (string, *telego.InlineKeyboardMarkup) {
	const pageSize = 8
	page, totalPages, start, end := paginate(len(items), page, pageSize)
	var b strings.Builder
	b.WriteString(fmt.Sprintf("🆙 <b>可更新容器列表</b>\n\n"))
	b.WriteString(fmt.Sprintf("🖥 实例: <b>%s</b>\n\n", escapeHTML(instanceName)))
	b.WriteString(fmt.Sprintf("找到 <b>%d</b> 个可更新的容器\n", len(items)))
	b.WriteString(fmt.Sprintf("第 %d/%d 页\n\n", page+1, totalPages))
	rows := make([][]telego.InlineKeyboardButton, 0)
	pageItems := items[start:end]
	for i, item := range pageItems {
		absoluteIdx := start + i
		statusIcon := "⚪"
		if strings.Contains(strings.ToLower(item.Status), "running") {
			statusIcon = "🟢"
		}
		imageLine := shorten(oneLineImageRef(item.UsingImage), 42)
		shortID := item.ID
		if strings.HasPrefix(shortID, "sha256:") && len(shortID) > 19 {
			shortID = shortID[7:19]
		} else if len(shortID) > 12 {
			shortID = shortID[:12]
		}
		b.WriteString(fmt.Sprintf("%d. %s <b>%s</b>\n", absoluteIdx+1, statusIcon, escapeHTML(item.Name)))
		b.WriteString(fmt.Sprintf("   📦 %s\n", escapeHTML(imageLine)))
		b.WriteString(fmt.Sprintf("   🆔 %s\n\n", escapeHTML(shortID)))
	}
	for i := 0; i < len(pageItems); i += 2 {
		row := make([]telego.InlineKeyboardButton, 0, 2)
		for j := i; j < i+2 && j < len(pageItems); j++ {
			item := pageItems[j]
			shortID := item.ID
			if strings.HasPrefix(shortID, "sha256:") && len(shortID) > 19 {
				shortID = shortID[7:19]
			} else if len(shortID) > 12 {
				shortID = shortID[:12]
			}
			label := "🆙 " + leftAlignPairLabel(trimButtonLabel(item.Name))
			row = append(row, tu.InlineKeyboardButton(label).WithCallbackData(fmt.Sprintf("update_pick:%s", shortID)))
		}
		rows = append(rows, row)
	}
	if totalPages > 1 {
		pageRow := []telego.InlineKeyboardButton{}
		if page > 0 {
			pageRow = append(pageRow, tu.InlineKeyboardButton("⬅️ 上一页").WithCallbackData(fmt.Sprintf("updates_page:%d", page-1)))
		}
		pageRow = append(pageRow, tu.InlineKeyboardButton(fmt.Sprintf("📄 %d/%d", page+1, totalPages)).WithCallbackData("noop:"))
		if page+1 < totalPages {
			pageRow = append(pageRow, tu.InlineKeyboardButton("➡️ 下一页").WithCallbackData(fmt.Sprintf("updates_page:%d", page+1)))
		}
		rows = append(rows, pageRow)
	}
	rows = append(rows, tu.InlineKeyboardRow(
		tu.InlineKeyboardButton(fmt.Sprintf("⚡ 一键更新所有 (%d个)", len(items))).WithCallbackData("updates_update_all:"),
	))
	rows = append(rows, tu.InlineKeyboardRow(
		tu.InlineKeyboardButton("🔄 刷新").WithCallbackData("updates_refresh:"),
		tu.InlineKeyboardButton("❌ 取消").WithCallbackData("cancel:"),
	))
	return b.String(), tu.InlineKeyboard(rows...)
}

func (r *Runtime) sendImages(ctx context.Context, chatID int64) {
	r.sendImagesPage(ctx, chatID, 0, 0)
}

func (r *Runtime) sendImagesPage(ctx context.Context, chatID int64, messageID int, page int) {
	items, inst, err := r.listCurrentImages(ctx, chatID)
	if err != nil {
		r.replyText(ctx, chatID, "❌ 获取镜像列表失败: "+err.Error())
		return
	}
	if len(items) == 0 {
		r.replyText(ctx, chatID, fmt.Sprintf("🖼 实例 <b>%s</b> 当前没有镜像", escapeHTML(inst.Name)))
		return
	}
	text, markup := r.renderImagesPage(items, inst.Name, page)
	r.editOrReplyText(ctx, chatID, messageID, text, markup)
}

func (r *Runtime) renderImagesPage(items []imageView, instanceName string, page int) (string, *telego.InlineKeyboardMarkup) {
	const pageSize = 8
	page, totalPages, start, end := paginate(len(items), page, pageSize)
	var b strings.Builder
	b.WriteString(fmt.Sprintf("🖼 <b>镜像列表</b> · <b>%s</b>（第 %d/%d 页）\n\n", escapeHTML(instanceName), page+1, totalPages))
	b.WriteString(fmt.Sprintf("总计: %d 个镜像\n\n", len(items)))
	rows := make([][]telego.InlineKeyboardButton, 0)
	for i, item := range items[start:end] {
		absoluteIdx := start + i
		fullName := item.Name
		if item.Tag != "" && strings.ToLower(item.Tag) != "none" {
			fullName += ":" + item.Tag
		}
		statusIcon := "✅"
		switch item.UsageState {
		case "running":
			statusIcon = "✅"
		case "stopped":
			statusIcon = "⏸"
		default:
			statusIcon = "🗑"
		}
		buttonText := fmt.Sprintf("%s %s (%s)", statusIcon, trimButtonLabel(fullName), item.Size)
		rows = append(rows, tu.InlineKeyboardRow(
			tu.InlineKeyboardButton(buttonText).WithCallbackData(fmt.Sprintf("image:%d:%d", page, absoluteIdx)),
		))
	}
	rows = append(rows, tu.InlineKeyboardRow(
		tu.InlineKeyboardButton("🧹 清理无用镜像").WithCallbackData("confirm_clean_images:"),
		tu.InlineKeyboardButton("⚠️ 强制删除无用").WithCallbackData("confirm_clean_images_force:"),
	))
	rows = append(rows, tu.InlineKeyboardRow(
		tu.InlineKeyboardButton("🔄 刷新").WithCallbackData("images_refresh:"),
	))
	rows = append(rows, paginationRow("images_page", page, totalPages)...)
	rows = append(rows, tu.InlineKeyboardRow(
		tu.InlineKeyboardButton("❌ 取消").WithCallbackData("cancel:"),
	))
	return b.String(), tu.InlineKeyboard(rows...)
}

func (r *Runtime) sendBackups(ctx context.Context, chatID int64) {
	r.sendBackupsPage(ctx, chatID, 0, 0)
}

func (r *Runtime) sendBackupsPage(ctx context.Context, chatID int64, messageID int, page int) {
	items, inst, err := r.listCurrentBackups(ctx, chatID)
	if err != nil {
		r.replyText(ctx, chatID, "❌ 获取备份列表失败: "+err.Error())
		return
	}
	text, markup := r.renderBackupsPage(items, inst.Name, page)
	if messageID > 0 {
		r.editOrReplyText(ctx, chatID, messageID, text, markup)
		return
	}
	_, _ = r.bot.SendMessage(ctx, tu.Message(tu.ID(chatID), text).WithParseMode(telego.ModeHTML).WithReplyMarkup(markup))
}

func (r *Runtime) renderBackupsPage(items []string, instanceName string, page int) (string, *telego.InlineKeyboardMarkup) {
	if len(items) == 0 {
		text := strings.Join([]string{
			"📭 <b>没有备份文件</b>",
			"",
			fmt.Sprintf("🖥 实例: <b>%s</b>", escapeHTML(instanceName)),
			"",
			"暂无任何备份文件",
			"",
			"💡 使用 /backup 创建新备份",
		}, "\n")
		markup := tu.InlineKeyboard(
			tu.InlineKeyboardRow(
				tu.InlineKeyboardButton("🔄 刷新").WithCallbackData("backups_refresh:"),
				tu.InlineKeyboardButton("➕ 创建备份").WithCallbackData("show_backup_menu:"),
			),
			tu.InlineKeyboardRow(tu.InlineKeyboardButton("❌ 取消").WithCallbackData("cancel:")),
		)
		return text, markup
	}
	const pageSize = 8
	page, totalPages, start, end := paginate(len(items), page, pageSize)
	var b strings.Builder
	b.WriteString("📋 <b>备份文件列表</b>\n\n")
	b.WriteString(fmt.Sprintf("🖥 实例: <b>%s</b>\n\n", escapeHTML(instanceName)))
	b.WriteString(fmt.Sprintf("总计: <b>%d</b> 个备份文件\n", len(items)))
	b.WriteString(fmt.Sprintf("第 %d/%d 页\n\n", page+1, totalPages))
	rows := make([][]telego.InlineKeyboardButton, 0)
	for idx, name := range items[start:end] {
		fileDisplay := name
		if len([]rune(fileDisplay)) > 35 {
			fileDisplay = string([]rune(fileDisplay)[:32]) + "..."
		}
		b.WriteString(fmt.Sprintf("%d. 📁 <code>%s</code>\n", start+idx+1, escapeHTML(fileDisplay)))
		buttonText := name
		if len([]rune(buttonText)) > 30 {
			buttonText = string([]rune(buttonText)[:27]) + "..."
		}
		rows = append(rows, tu.InlineKeyboardRow(
			tu.InlineKeyboardButton("📁 "+buttonText).WithCallbackData("backup_detail:"+name),
		))
	}
	rows = append(rows, paginationRow("backups_page", page, totalPages)...)
	rows = append(rows, tu.InlineKeyboardRow(
		tu.InlineKeyboardButton("🔄 刷新").WithCallbackData("backups_refresh:"),
		tu.InlineKeyboardButton("➕ 创建备份").WithCallbackData("show_backup_menu:"),
	))
	rows = append(rows, tu.InlineKeyboardRow(
		tu.InlineKeyboardButton("❌ 取消").WithCallbackData("cancel:"),
	))
	return b.String(), tu.InlineKeyboard(rows...)
}

func (r *Runtime) sendStatus(ctx context.Context, chatID int64) {
	containers, inst, err := r.listCurrentContainers(ctx, chatID)
	if err != nil {
		r.replyText(ctx, chatID, "❌ 获取系统状态失败: "+err.Error())
		return
	}
	images, _, err := r.listCurrentImages(ctx, chatID)
	if err != nil {
		r.replyText(ctx, chatID, "❌ 获取系统状态失败: "+err.Error())
		return
	}

	running := 0
	updates := 0
	for _, item := range containers {
		if strings.Contains(strings.ToLower(item.Status), "running") {
			running++
		}
		if item.HaveUpdate && !item.UpdateBlocked {
			updates++
		}
	}
	unusedImages := 0
	for _, item := range images {
		if isCleanupCandidateView(item) {
			unusedImages++
		}
	}
	text := fmt.Sprintf("📊 <b>系统状态</b> · <b>%s</b>\n\n容器总数: <b>%d</b>\n运行中: <b>%d</b>\n可更新容器: <b>%d</b>\n镜像总数: <b>%d</b>\n可清理镜像: <b>%d</b>", escapeHTML(inst.Name), len(containers), running, updates, len(images), unusedImages)
	r.replyText(ctx, chatID, text)
}

func (r *Runtime) sendVersion(ctx context.Context, chatID int64) {
	localVersion, remoteVersion, status, inst, err := r.currentVersion(ctx, chatID)
	if err != nil {
		r.replyText(ctx, chatID, "❌ 获取版本信息失败: "+err.Error())
		return
	}
	text := fmt.Sprintf("🏷 <b>版本信息</b> · <b>%s</b>\n\n本地版本: <code>%s</code>\n构建时间: <code>%s</code>\n远端版本: <code>%s</code>\n状态: %s",
		escapeHTML(inst.Name),
		escapeHTML(localVersion["version"]),
		escapeHTML(localVersion["buildDate"]),
		escapeHTML(firstNonEmpty(remoteVersion["remoteVersion"], localVersion["version"])),
		escapeHTML(firstNonEmpty(status, "未知")),
	)
	r.replyText(ctx, chatID, text)
}

func (r *Runtime) confirmCleanupImages(ctx context.Context, chatID int64, force bool) {
	images, inst, err := r.listCurrentImages(ctx, chatID)
	if err != nil {
		r.replyText(ctx, chatID, "❌ 获取镜像列表失败: "+err.Error())
		return
	}
	candidates := make([]imageView, 0)
	for _, item := range images {
		if isCleanupCandidateView(item) {
			candidates = append(candidates, item)
		}
	}
	if len(candidates) == 0 {
		r.replyText(ctx, chatID, fmt.Sprintf("✅ <b>%s</b> 无可清理镜像", escapeHTML(inst.Name)))
		return
	}
	var b strings.Builder
	b.WriteString("🗑 <b>可清理镜像列表</b>\n\n")
	b.WriteString(fmt.Sprintf("🖥 实例: <b>%s</b>\n\n", escapeHTML(inst.Name)))
	b.WriteString(fmt.Sprintf("找到 <b>%d</b> 个可清理的镜像：\n\n", len(candidates)))
	for i, item := range candidates {
		fullName := item.Name
		tag := strings.TrimSpace(strings.ToLower(item.Tag))
		if item.Tag != "" && tag != "none" && tag != "<none>" {
			fullName += ":" + item.Tag
		}
		shortID := item.ID
		if strings.HasPrefix(shortID, "sha256:") && len(shortID) > 19 {
			shortID = shortID[7:19]
		} else if len(shortID) > 12 {
			shortID = shortID[:12]
		}
		b.WriteString(fmt.Sprintf("%d. <code>%s</code>\n", i+1, escapeHTML(shorten(fullName, 60))))
		b.WriteString(fmt.Sprintf("   🆔 %s\n", escapeHTML(shortID)))
		b.WriteString(fmt.Sprintf("   💾 %s\n", escapeHTML(item.Size)))
		if item.InUsed {
			b.WriteString("   ⚠️ 使用中，强制删除才会处理\n")
		}
		b.WriteString("\n")
		if i >= 11 && len(candidates) > 12 {
			b.WriteString(fmt.Sprintf("… 还有 %d 个\n\n", len(candidates)-i-1))
			break
		}
	}
	modeLabel := "普通清理"
	doCallback := "do_clean_images:"
	confirmButton := "🧹 确认全部清理"
	if force {
		modeLabel = "强制删除"
		doCallback = "do_clean_images_force:"
		confirmButton = "⚠️ 确认强制删除全部"
	}
	b.WriteString(fmt.Sprintf("⚠️ 即将执行：<b>%s</b>\n\n", modeLabel))
	b.WriteString("请确认是否继续：")
	markup := tu.InlineKeyboard(
		tu.InlineKeyboardRow(
			tu.InlineKeyboardButton(confirmButton).WithCallbackData(doCallback),
		),
		tu.InlineKeyboardRow(
			tu.InlineKeyboardButton("❌ 取消").WithCallbackData("cancel:"),
		),
	)
	_, _ = r.bot.SendMessage(ctx, tu.Message(tu.ID(chatID), b.String()).WithParseMode(telego.ModeHTML).WithReplyMarkup(markup))
}

func (r *Runtime) doCleanUnusedImages(ctx context.Context, chatID int64, force bool) {
	images, _, err := r.listCurrentImages(ctx, chatID)
	if err != nil {
		r.replyText(ctx, chatID, "❌ 获取镜像列表失败: "+err.Error())
		return
	}
	successLines := []string{}
	failed := []string{}
	for _, item := range images {
		if !isCleanupCandidateView(item) {
			continue
		}
		fullName := item.Name
		tag := strings.TrimSpace(strings.ToLower(item.Tag))
		if item.Tag != "" && tag != "none" && tag != "<none>" {
			fullName += ":" + item.Tag
		}
		if err := r.removeImageOnCurrent(ctx, chatID, item.ID, force); err != nil {
			failed = append(failed, fmt.Sprintf("%s | ID=%s | 大小=%s | %s", fullName, item.ID, item.Size, err.Error()))
			continue
		}
		successLines = append(successLines, fmt.Sprintf("%s | ID=%s | 大小=%s", fullName, item.ID, item.Size))
	}
	modeText := "普通清理"
	if force {
		modeText = "强制删除"
	}
	text := fmt.Sprintf("🧹 <b>%s完成</b>\n\n✅ 成功: %d\n❌ 失败: %d", modeText, len(successLines), len(failed))
	if len(successLines) > 0 {
		text += "\n\n已删除镜像："
		for i, line := range successLines {
			if i >= 10 {
				text += fmt.Sprintf("\n… 还有 %d 个", len(successLines)-i)
				break
			}
			text += "\n• " + escapeHTML(shorten(line, 160))
		}
	}
	if len(failed) > 0 {
		text += "\n\n失败详情："
		for i, line := range failed {
			if i >= 8 {
				text += fmt.Sprintf("\n… 还有 %d 条", len(failed)-i)
				break
			}
			text += "\n• " + escapeHTML(shorten(line, 160))
		}
	}
	r.replyText(ctx, chatID, text)
}

func (r *Runtime) confirmProgramUpdate(ctx context.Context, chatID int64) {
	inst, err := r.currentInstance(ctx, chatID)
	if err != nil {
		r.replyText(ctx, chatID, "❌ 获取当前实例失败: "+err.Error())
		return
	}
	markup := tu.InlineKeyboard(
		tu.InlineKeyboardRow(
			tu.InlineKeyboardButton("🆙 确认更新服务").WithCallbackData("confirm_program_update:"),
			tu.InlineKeyboardButton("❌ 取消").WithCallbackData("cancel:"),
		),
	)
	text := fmt.Sprintf("⚠️ <b>即将更新 DockerCopilot 服务</b>\n\n实例: <b>%s</b>\n\n这会更新当前实例上的 DockerCopilot 服务并可能触发服务重启，不再存在单独更新 Telegram Bot 子进程的逻辑。是否继续？", escapeHTML(inst.Name))
	_, _ = r.bot.SendMessage(ctx, tu.Message(tu.ID(chatID), text).WithParseMode(telego.ModeHTML).WithReplyMarkup(markup))
}

func (r *Runtime) doProgramUpdate(ctx context.Context, chatID int64) {
	inst, err := r.currentInstance(ctx, chatID)
	if err != nil {
		r.replyText(ctx, chatID, "❌ 获取当前实例失败: "+err.Error())
		return
	}
	if !inst.Local {
		data, err := newRemoteClient(inst).simpleAction(ctx, http.MethodPut, "/api/program", nil, nil)
		if err != nil {
			r.replyText(ctx, chatID, "❌ 提交远程更新任务失败: "+err.Error())
			return
		}
		taskID := svc.AsString(data["taskID"], "")
		if taskID == "" {
			r.replyText(ctx, chatID, "✅ 远程更新任务已提交")
			return
		}
		r.startTaskProgressWatcher(ctx, chatID, inst, "更新 dockerCopilot", taskID)
		return
	}
	logic := versionlogic.NewUpdateProgramLogic(ctx, r.svcCtx)
	resp, err := logic.UpdateProgram(false)
	if err != nil || resp == nil {
		r.replyText(ctx, chatID, "❌ 提交更新任务失败")
		return
	}
	if resp.Code != 200 {
		r.replyText(ctx, chatID, "❌ 更新失败: "+escapeHTML(resp.Msg))
		return
	}
	mapData := map[string]interface{}{}
	_ = decodeRespData(resp.Data, &mapData)
	taskID := svc.AsString(mapData["taskID"], "")
	if taskID == "" {
		r.replyText(ctx, chatID, "✅ 更新任务已提交")
		return
	}
	r.startTaskProgressWatcher(ctx, chatID, inst, "更新 dockerCopilot", taskID)
}

func (r *Runtime) confirmBackup(ctx context.Context, chatID int64) {
	containers, inst, err := r.listCurrentContainers(ctx, chatID)
	if err != nil {
		r.replyText(ctx, chatID, "❌ 操作失败: "+err.Error())
		return
	}
	text := strings.Join([]string{
		"💾 <b>创建容器备份</b>",
		"",
		fmt.Sprintf("🖥 实例: <b>%s</b>", escapeHTML(inst.Name)),
		"",
		fmt.Sprintf("📦 将备份 <b>%d</b> 个容器的配置", len(containers)),
		"",
		"请选择备份格式:",
	}, "\n")
	markup := tu.InlineKeyboard(
		tu.InlineKeyboardRow(tu.InlineKeyboardButton("📋 Config格式 (完整配置)").WithCallbackData("confirm_backup:")),
		tu.InlineKeyboardRow(tu.InlineKeyboardButton("📄 Compose格式 (docker-compose.yml)").WithCallbackData("confirm_backup_compose:")),
		tu.InlineKeyboardRow(tu.InlineKeyboardButton("❌ 取消").WithCallbackData("cancel:")),
	)
	_, _ = r.bot.SendMessage(ctx, tu.Message(tu.ID(chatID), text).WithParseMode(telego.ModeHTML).WithReplyMarkup(markup))
}

func (r *Runtime) doJSONBackupWithMessage(ctx context.Context, chatID int64, messageID int) {
	inst, err := r.currentInstance(ctx, chatID)
	if err != nil {
		r.replyText(ctx, chatID, "❌ 获取当前实例失败: "+err.Error())
		return
	}
	progress := strings.Join([]string{
		"💾 <b>正在创建Config备份</b>",
		"",
		fmt.Sprintf("🖥 实例: <b>%s</b>", escapeHTML(inst.Name)),
		"📋 格式: Config (完整配置)",
		"",
		"⏳ 正在备份容器配置...",
	}, "\n")
	r.editOrReplyText(ctx, chatID, messageID, progress, nil)
	if err := r.triggerJSONBackupOnCurrent(ctx, chatID); err != nil {
		r.editOrReplyText(ctx, chatID, messageID, fmt.Sprintf("❌ <b>Config备份失败</b>\n\n🖥 实例: <b>%s</b>\n\n❗ 错误: %s", escapeHTML(inst.Name), escapeHTML(err.Error())), nil)
		return
	}
	success := strings.Join([]string{
		"✅ <b>Config备份成功</b>",
		"",
		fmt.Sprintf("🖥 实例: <b>%s</b>", escapeHTML(inst.Name)),
		"📋 格式: Config (完整配置)",
		"",
		"🎉 容器配置已成功备份!",
		"",
		"💡 备份内容包括:",
		"  • 容器配置信息",
		"  • 环境变量",
		"  • 卷挂载",
		"  • 端口映射",
		"  • 网络配置",
		"",
		"使用 /backups 查看所有备份",
	}, "\n")
	r.editOrReplyText(ctx, chatID, messageID, success, nil)
}

func (r *Runtime) doComposeBackupWithMessage(ctx context.Context, chatID int64, messageID int) {
	inst, err := r.currentInstance(ctx, chatID)
	if err != nil {
		r.replyText(ctx, chatID, "❌ 获取当前实例失败: "+err.Error())
		return
	}
	progress := strings.Join([]string{
		"📄 <b>正在创建Compose备份</b>",
		"",
		fmt.Sprintf("🖥 实例: <b>%s</b>", escapeHTML(inst.Name)),
		"📄 格式: Compose (docker-compose.yml)",
		"",
		"⏳ 正在生成docker-compose.yml配置...",
	}, "\n")
	r.editOrReplyText(ctx, chatID, messageID, progress, nil)
	if err := r.triggerComposeBackupOnCurrent(ctx, chatID); err != nil {
		r.editOrReplyText(ctx, chatID, messageID, fmt.Sprintf("❌ <b>Compose备份失败</b>\n\n🖥 实例: <b>%s</b>\n\n❗ 错误: %s", escapeHTML(inst.Name), escapeHTML(err.Error())), nil)
		return
	}
	success := strings.Join([]string{
		"✅ <b>Compose备份成功</b>",
		"",
		fmt.Sprintf("🖥 实例: <b>%s</b>", escapeHTML(inst.Name)),
		"📄 格式: Compose (docker-compose.yml)",
		"",
		"🎉 已成功导出为docker-compose格式!",
		"",
		"💡 此格式可用于:",
		"  • 快速迁移容器配置",
		"  • 版本控制管理",
		"  • 批量部署容器",
		"",
		"使用 /backups 查看所有备份",
	}, "\n")
	r.editOrReplyText(ctx, chatID, messageID, success, nil)
}

func (r *Runtime) sendBackupDetail(ctx context.Context, chatID int64, messageID int, filename string) {
	inst, err := r.currentInstance(ctx, chatID)
	if err != nil {
		r.replyText(ctx, chatID, "❌ 获取备份详情失败: "+err.Error())
		return
	}
	var b strings.Builder
	b.WriteString("📁 <b>备份文件详情</b>\n\n")
	b.WriteString(fmt.Sprintf("🖥 实例: <b>%s</b>\n\n", escapeHTML(inst.Name)))
	b.WriteString(fmt.Sprintf("📄 文件名: <code>%s</code>\n\n", escapeHTML(filename)))
	if strings.Contains(filename, "backup_") {
		parts := strings.Split(strings.TrimSuffix(strings.TrimPrefix(filename, "backup_"), ".json"), "_")
		if len(parts) >= 2 {
			b.WriteString(fmt.Sprintf("📅 创建时间: %s %s\n\n", escapeHTML(parts[0]), escapeHTML(strings.ReplaceAll(parts[1], "-", ":"))))
		}
	}
	b.WriteString("💡 选择操作:")
	markup := tu.InlineKeyboard(
		tu.InlineKeyboardRow(tu.InlineKeyboardButton("🗑 删除备份").WithCallbackData("confirm_delete_backup:"+filename)),
		tu.InlineKeyboardRow(
			tu.InlineKeyboardButton("◀️ 返回列表").WithCallbackData("back_backups:0"),
			tu.InlineKeyboardButton("❌ 取消").WithCallbackData("cancel:"),
		),
	)
	r.editOrReplyText(ctx, chatID, messageID, b.String(), markup)
}

func (r *Runtime) confirmDeleteBackup(ctx context.Context, chatID int64, messageID int, filename string) {
	inst, err := r.currentInstance(ctx, chatID)
	if err != nil {
		r.replyText(ctx, chatID, "❌ 操作失败: "+err.Error())
		return
	}
	var timeInfo string
	if strings.Contains(filename, "backup_") {
		parts := strings.Split(strings.TrimSuffix(strings.TrimPrefix(filename, "backup_"), ".json"), "_")
		if len(parts) >= 2 {
			timeInfo = fmt.Sprintf("\n📅 创建时间: %s %s\n", escapeHTML(parts[0]), escapeHTML(strings.ReplaceAll(parts[1], "-", ":")))
		}
	}
	text := fmt.Sprintf("⚠️ <b>确认删除备份</b>\n\n🖥 实例: <b>%s</b>\n📁 文件名: <code>%s</code>%s\n🚨 <b>此操作不可逆!</b>\n\n确定要删除这个备份文件吗?", escapeHTML(inst.Name), escapeHTML(filename), timeInfo)
	markup := tu.InlineKeyboard(
		tu.InlineKeyboardRow(
			tu.InlineKeyboardButton("✅ 确认删除").WithCallbackData("do_delete_backup:"+filename),
			tu.InlineKeyboardButton("❌ 取消").WithCallbackData("backup_detail:"+filename),
		),
	)
	r.editOrReplyText(ctx, chatID, messageID, text, markup)
}

func (r *Runtime) doDeleteBackup(ctx context.Context, chatID int64, messageID int, filename string) {
	inst, err := r.currentInstance(ctx, chatID)
	if err != nil {
		r.replyText(ctx, chatID, "❌ 删除备份失败: "+err.Error())
		return
	}
	progress := fmt.Sprintf("🗑 <b>正在删除备份</b>\n\n🖥 实例: <b>%s</b>\n📁 文件: <code>%s</code>\n\n⏳ 处理中...", escapeHTML(inst.Name), escapeHTML(filename))
	r.editOrReplyText(ctx, chatID, messageID, progress, nil)
	if err := r.deleteBackupOnCurrent(ctx, chatID, filename); err != nil {
		r.editOrReplyText(ctx, chatID, messageID, fmt.Sprintf("❌ <b>删除备份失败</b>\n\n❗ 错误: %s", escapeHTML(err.Error())), nil)
		return
	}
	r.editOrReplyText(ctx, chatID, messageID, fmt.Sprintf("✅ <b>删除成功</b>\n\n🖥 实例: <b>%s</b>\n📁 文件: <code>%s</code>\n\n🎉 备份文件已成功删除!\n\n💡 使用 /backups 查看剩余备份", escapeHTML(inst.Name), escapeHTML(filename)), nil)
}

func (r *Runtime) doJSONBackup(ctx context.Context, chatID int64) {
	r.doJSONBackupWithMessage(ctx, chatID, 0)
}

func (r *Runtime) doComposeBackup(ctx context.Context, chatID int64) {
	r.doComposeBackupWithMessage(ctx, chatID, 0)
}

func (r *Runtime) restoreBackup(ctx context.Context, chatID int64, filename string) {
	inst, err := r.currentInstance(ctx, chatID)
	if err != nil {
		r.replyText(ctx, chatID, "❌ 获取当前实例失败: "+err.Error())
		return
	}
	taskID, err := r.restoreBackupOnCurrent(ctx, chatID, filename)
	if err != nil {
		r.replyText(ctx, chatID, "❌ 恢复备份失败: "+err.Error())
		return
	}
	if taskID == "" {
		r.replyText(ctx, chatID, fmt.Sprintf("♻️ 已开始恢复备份\n文件: <code>%s</code>", escapeHTML(filename)))
		return
	}
	r.startTaskProgressWatcher(ctx, chatID, inst, "恢复备份: "+filename, taskID)
}

func (r *Runtime) deleteBackup(ctx context.Context, chatID int64, filename string) {
	if err := r.deleteBackupOnCurrent(ctx, chatID, filename); err != nil {
		r.replyText(ctx, chatID, "❌ 删除备份失败: "+err.Error())
		return
	}
	r.replyText(ctx, chatID, fmt.Sprintf("🗑 已删除备份 <code>%s</code>", escapeHTML(filename)))
}

func (r *Runtime) sendImageDetail(ctx context.Context, chatID int64, messageID int, arg string) {
	parts := strings.Split(arg, ":")
	page := 0
	idx := -1
	if len(parts) > 0 {
		page = parsePage(parts[0])
	}
	if len(parts) > 1 {
		idx, _ = strconv.Atoi(strings.TrimSpace(parts[1]))
	}
	items, _, err := r.listCurrentImages(ctx, chatID)
	if err != nil {
		r.replyText(ctx, chatID, "❌ 获取镜像详情失败: "+err.Error())
		return
	}
	const pageSize = 8
	_, _, start, end := paginate(len(items), page, pageSize)
	if idx < start || idx >= end || idx < 0 || idx >= len(items) {
		r.replyText(ctx, chatID, "❌ 未找到镜像")
		return
	}
	target := items[idx]
	fullName := target.Name
	if target.Tag != "" && strings.ToLower(target.Tag) != "none" {
		fullName += ":" + target.Tag
	}
	status := "使用中 ✅"
	switch target.UsageState {
	case "running":
		status = "使用中（运行中）✅"
	case "stopped":
		status = "使用中（已停止）⏸"
	default:
		status = "未使用 🗑"
	}
	text := strings.Join([]string{
		"🖼 <b>镜像详情</b>",
		"",
		fmt.Sprintf("📦 镜像: <code>%s</code>", escapeHTML(fullName)),
		fmt.Sprintf("🆔 ID: <code>%s</code>", escapeHTML(target.ID)),
		fmt.Sprintf("💾 大小: %s", escapeHTML(target.Size)),
		fmt.Sprintf("📅 创建时间: %s", escapeHTML(target.CreateTime)),
		fmt.Sprintf("🔖 状态: %s", status),
	}, "\n")
	deleteText := "🗑 删除镜像"
	if target.InUsed {
		deleteText = "⚠️ 强制删除(使用中)"
	}
	markup := tu.InlineKeyboard(
		tu.InlineKeyboardRow(
			tu.InlineKeyboardButton(deleteText).WithCallbackData(fmt.Sprintf("confirm_del_image:%d:%d", page, idx)),
		),
		tu.InlineKeyboardRow(
			tu.InlineKeyboardButton("◀️ 返回").WithCallbackData(fmt.Sprintf("back_images:%d", page)),
			tu.InlineKeyboardButton("❌ 取消").WithCallbackData("cancel:"),
		),
	)
	r.editOrReplyText(ctx, chatID, messageID, text, markup)
}

func (r *Runtime) confirmDeleteImage(ctx context.Context, chatID int64, messageID int, arg string) {
	parts := strings.Split(arg, ":")
	page := 0
	idx := -1
	if len(parts) > 0 {
		page = parsePage(parts[0])
	}
	if len(parts) > 1 {
		idx, _ = strconv.Atoi(strings.TrimSpace(parts[1]))
	}
	items, _, err := r.listCurrentImages(ctx, chatID)
	if err != nil {
		r.replyText(ctx, chatID, "❌ 操作失败: "+err.Error())
		return
	}
	const pageSize = 8
	_, _, start, end := paginate(len(items), page, pageSize)
	if idx < start || idx >= end || idx < 0 || idx >= len(items) {
		r.replyText(ctx, chatID, "❌ 未找到镜像")
		return
	}
	target := items[idx]
	fullName := target.Name
	if target.Tag != "" && strings.ToLower(target.Tag) != "none" {
		fullName += ":" + target.Tag
	}
	var b strings.Builder
	b.WriteString("⚠️ <b>确认删除镜像</b>\n\n")
	b.WriteString(fmt.Sprintf("📦 镜像: <code>%s</code>\n\n", escapeHTML(fullName)))
	if target.InUsed {
		b.WriteString("🚨 <b>警告: 此镜像正在使用中!</b>\n")
		b.WriteString("删除将使用 <code>force=true</code>\n\n")
	}
	b.WriteString("确定要删除吗?")
	force := "false"
	if target.InUsed {
		force = "true"
	}
	markup := tu.InlineKeyboard(
		tu.InlineKeyboardRow(
			tu.InlineKeyboardButton("✅ 确认删除").WithCallbackData(fmt.Sprintf("do_del_image:%d:%d:%s", page, idx, force)),
			tu.InlineKeyboardButton("❌ 取消").WithCallbackData(fmt.Sprintf("image:%d:%d", page, idx)),
		),
	)
	r.editOrReplyText(ctx, chatID, messageID, b.String(), markup)
}

func (r *Runtime) doDeleteImage(ctx context.Context, chatID int64, messageID int, arg string) {
	parts := strings.Split(arg, ":")
	if len(parts) < 3 {
		r.replyText(ctx, chatID, "❌ 删除镜像失败: 参数错误")
		return
	}
	page := parsePage(parts[0])
	idx, err := strconv.Atoi(strings.TrimSpace(parts[1]))
	if err != nil {
		r.replyText(ctx, chatID, "❌ 删除镜像失败: 参数错误")
		return
	}
	force := strings.EqualFold(parts[2], "true")
	items, _, err := r.listCurrentImages(ctx, chatID)
	if err != nil {
		r.replyText(ctx, chatID, "❌ 删除镜像失败: "+err.Error())
		return
	}
	const pageSize = 8
	_, _, start, end := paginate(len(items), page, pageSize)
	if idx < start || idx >= end || idx < 0 || idx >= len(items) {
		r.replyText(ctx, chatID, "❌ 未找到镜像")
		return
	}
	target := items[idx]
	fullName := target.Name
	tag := strings.TrimSpace(strings.ToLower(target.Tag))
	if target.Tag != "" && tag != "none" && tag != "<none>" {
		fullName += ":" + target.Tag
	}
	if err := r.removeImageOnCurrent(ctx, chatID, target.ID, force); err != nil {
		r.replyText(ctx, chatID, "❌ 删除镜像失败: "+err.Error())
		return
	}
	r.replyText(ctx, chatID, fmt.Sprintf("✅ 镜像删除成功\n\n📦 <code>%s</code>\n🆔 <code>%s</code>\n💾 %s", escapeHTML(fullName), escapeHTML(target.ID), escapeHTML(target.Size)))
	r.sendImagesPage(ctx, chatID, messageID, page)
}

func (r *Runtime) removeImage(ctx context.Context, chatID int64, imageID string) {
	items, _, err := r.listCurrentImages(ctx, chatID)
	if err != nil {
		r.replyText(ctx, chatID, "❌ 获取镜像列表失败: "+err.Error())
		return
	}
	var target *imageView
	for i := range items {
		if items[i].ID == imageID {
			target = &items[i]
			break
		}
	}
	if err := r.removeImageOnCurrent(ctx, chatID, imageID, true); err != nil {
		r.replyText(ctx, chatID, "❌ 删除镜像失败: "+err.Error())
		return
	}
	if target == nil {
		r.replyText(ctx, chatID, fmt.Sprintf("✅ 镜像已删除\n\n🆔 <code>%s</code>", escapeHTML(imageID)))
		return
	}
	fullName := target.Name
	tag := strings.TrimSpace(strings.ToLower(target.Tag))
	if target.Tag != "" && tag != "none" && tag != "<none>" {
		fullName += ":" + target.Tag
	}
	r.replyText(ctx, chatID, fmt.Sprintf("✅ 镜像已删除\n\n📦 <code>%s</code>\n🆔 <code>%s</code>\n💾 %s", escapeHTML(fullName), escapeHTML(target.ID), escapeHTML(target.Size)))
}

func (r *Runtime) updateContainer(ctx context.Context, chatID int64, id string) {
	inst, err := r.currentInstance(ctx, chatID)
	if err != nil {
		r.replyText(ctx, chatID, "❌ 获取当前实例失败: "+err.Error())
		return
	}
	name, taskID, err := r.updateContainerOnCurrent(ctx, chatID, id)
	if err != nil {
		if strings.HasPrefix(err.Error(), "SELF_UPDATE_REQUIRED:") {
			r.confirmProgramUpdate(ctx, chatID)
			return
		}
		r.replyText(ctx, chatID, "❌ 更新容器失败: "+err.Error())
		return
	}
	if taskID == "" {
		r.replyText(ctx, chatID, fmt.Sprintf("🆙 已提交更新任务\n容器: <b>%s</b>", escapeHTML(name)))
		return
	}
	r.startTaskProgressWatcher(ctx, chatID, inst, "更新容器: "+name, taskID)
}

func decodeRespData(data interface{}, out interface{}) error {
	bs, err := svc.MustJSON(data)
	if err != nil {
		return err
	}
	return svc.UnmarshalJSON(bs, out)
}

func isCleanupCandidate(item imagelogic.Info) bool {
	return item.CleanupCandidate
}

func isCleanupCandidateView(item imageView) bool {
	return item.CleanupCandidate
}

func oneLineImageRef(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return "unknown:latest"
	}
	if strings.HasPrefix(s, "sha256:") {
		if len(s) > 19 {
			return s[:19]
		}
		return s
	}
	if idx := strings.Index(s, "@sha256:"); idx > 0 {
		s = s[:idx]
	}
	parts := strings.SplitN(s, ":", 2)
	if len(parts) == 2 {
		return parts[0] + ":" + parts[1]
	}
	return s
}

func paginationRow(prefix string, page int, totalPages int) [][]telego.InlineKeyboardButton {
	if totalPages <= 1 {
		return nil
	}
	row := []telego.InlineKeyboardButton{}
	if page > 0 {
		row = append(row, tu.InlineKeyboardButton("⬅️ 上一页").WithCallbackData(fmt.Sprintf("%s:%d", prefix, page-1)))
	}
	if page+1 < totalPages {
		row = append(row, tu.InlineKeyboardButton("下一页 ➡️").WithCallbackData(fmt.Sprintf("%s:%d", prefix, page+1)))
	}
	if len(row) == 0 {
		return nil
	}
	return [][]telego.InlineKeyboardButton{row}
}

func paginate(total int, page int, pageSize int) (int, int, int, int) {
	if pageSize <= 0 {
		pageSize = 1
	}
	totalPages := (total + pageSize - 1) / pageSize
	if totalPages <= 0 {
		totalPages = 1
	}
	if page < 0 {
		page = 0
	}
	if page >= totalPages {
		page = totalPages - 1
	}
	start := page * pageSize
	end := start + pageSize
	if end > total {
		end = total
	}
	if start > end {
		start = end
	}
	return page, totalPages, start, end
}

func parsePage(s string) int {
	n, err := strconv.Atoi(strings.TrimSpace(s))
	if err != nil || n < 0 {
		return 0
	}
	return n
}

func trimButtonLabel(s string) string {
	s = strings.TrimSpace(s)
	if len([]rune(s)) > 18 {
		return string([]rune(s)[:18]) + "…"
	}
	return s
}

func leftAlignPairLabel(s string) string {
	runes := []rune(strings.TrimSpace(s))
	if len(runes) >= 18 {
		return string(runes[:18])
	}
	return string(runes) + strings.Repeat(" ", 18-len(runes))
}

func findSelectedContainer(items []containerView, selectedID string) *containerView {
	if selectedID == "" {
		return nil
	}
	for i := range items {
		if items[i].ID == selectedID {
			return &items[i]
		}
	}
	return nil
}

func shorten(s string, n int) string {
	runes := []rune(s)
	if len(runes) <= n || n <= 0 {
		return s
	}
	if n <= 1 {
		return string(runes[:n])
	}
	return string(runes[:n-1]) + "…"
}

func escapeHTML(s string) string {
	replacer := strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;")
	return replacer.Replace(s)
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
