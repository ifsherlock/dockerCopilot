package qqbot

import (
	"context"
	"fmt"
	"strings"
	"time"
)

type messageSender interface {
	SendC2C(ctx context.Context, openID string, msg Message) error
	SendGroup(ctx context.Context, groupOpenID string, msg Message) error
}

type commandActions interface {
	Status(ctx context.Context) (StatusSummary, error)
	Containers(ctx context.Context) ([]ContainerInfoLite, error)
	ImageList(ctx context.Context) ([]ImageInfoLite, error)
	Backups(ctx context.Context) (BackupSummary, error)
	Version(ctx context.Context) (VersionSummary, error)
	Updates(ctx context.Context) ([]ContainerUpdateItem, error)
	CheckUpdates(ctx context.Context) (string, error)
	StartContainer(ctx context.Context, item ContainerInfoLite) (string, error)
	StopContainer(ctx context.Context, item ContainerInfoLite) (string, error)
	RestartContainer(ctx context.Context, item ContainerInfoLite) (string, error)
	UpdateContainer(ctx context.Context, item ContainerUpdateItem) (string, error)
	BackupJSON(ctx context.Context) error
	BackupCompose(ctx context.Context) error
	CleanImages(ctx context.Context) (string, error)
	RemoveImage(ctx context.Context, item ImageInfoLite, force bool) (string, error)
}

type CommandDispatcher struct {
	cfg               Config
	sender            messageSender
	actions           commandActions
	sessions          *updateSessionStore
	containerSessions *containerSessionStore
	imageSessions     *imageSessionStore
}

func NewCommandDispatcher(cfg Config, sender messageSender, actions commandActions) *CommandDispatcher {
	return &CommandDispatcher{
		cfg:               cfg.Normalized(),
		sender:            sender,
		actions:           actions,
		sessions:          newUpdateSessionStore(10 * time.Minute),
		containerSessions: newContainerSessionStore(10 * time.Minute),
		imageSessions:     newImageSessionStore(10 * time.Minute),
	}
}

func (d *CommandDispatcher) Dispatch(ctx context.Context, cmd IncomingCommand) error {
	if cmd.Kind == CommandKindInteraction {
		return d.handleInteraction(ctx, cmd)
	}
	switch NormalizeCommandText(cmd.Content) {
	case "/start":
		return d.reply(ctx, cmd, renderHome(d.cfg))
	case "/help":
		return d.reply(ctx, cmd, renderHome(d.cfg))
	case "/status":
		return d.handleStatus(ctx, cmd)
	case "/containers":
		return d.handleContainers(ctx, cmd)
	case "/images":
		return d.handleImages(ctx, cmd)
	case "/updates":
		return d.handleUpdates(ctx, cmd)
	case "/check_updates":
		return d.handleCheckUpdates(ctx, cmd)
	case "/backups":
		return d.handleBackups(ctx, cmd)
	case "/backup":
		return d.handleBackupJSON(ctx, cmd)
	case "/backup_compose":
		return d.handleBackupCompose(ctx, cmd)
	case "/clean_images":
		return d.handleCleanImages(ctx, cmd)
	case "/version":
		return d.handleVersion(ctx, cmd)
	default:
		return d.reply(ctx, cmd, d.renderError("暂不支持该命令。发送 /help 查看可用菜单。"))
	}
}

func (d *CommandDispatcher) handleStatus(ctx context.Context, cmd IncomingCommand) error {
	summary, err := d.actions.Status(ctx)
	if err != nil {
		return d.reply(ctx, cmd, d.renderError("获取状态失败："+err.Error()))
	}
	return d.reply(ctx, cmd, renderStatus(summary, d.cfg))
}

func (d *CommandDispatcher) handleContainers(ctx context.Context, cmd IncomingCommand) error {
	items, err := d.actions.Containers(ctx)
	if err != nil {
		return d.reply(ctx, cmd, d.renderError("获取容器列表失败："+err.Error()))
	}
	session := d.containerSessions.put(cmd.UserOpenID, cmd.GroupOpenID, items)
	return d.reply(ctx, cmd, renderContainersPage(items, session, 0, d.cfg))
}

func (d *CommandDispatcher) handleImages(ctx context.Context, cmd IncomingCommand) error {
	items, err := d.actions.ImageList(ctx)
	if err != nil {
		return d.reply(ctx, cmd, d.renderError("获取镜像列表失败："+err.Error()))
	}
	session := d.imageSessions.put(cmd.UserOpenID, cmd.GroupOpenID, items)
	return d.reply(ctx, cmd, renderImagesPage(items, session, 0, d.cfg))
}

func (d *CommandDispatcher) handleUpdates(ctx context.Context, cmd IncomingCommand) error {
	items, err := d.actions.Updates(ctx)
	if err != nil {
		return d.reply(ctx, cmd, d.renderError("获取可更新容器失败："+err.Error()))
	}
	session := d.sessions.put(cmd.UserOpenID, cmd.GroupOpenID, items)
	return d.reply(ctx, cmd, renderUpdates(items, session, d.cfg))
}

func (d *CommandDispatcher) handleCheckUpdates(ctx context.Context, cmd IncomingCommand) error {
	msg, err := d.actions.CheckUpdates(ctx)
	if err != nil {
		return d.reply(ctx, cmd, d.renderError("触发更新检测失败："+err.Error()))
	}
	return d.reply(ctx, cmd, richMessage(Message{
		Text: renderNoticeText("更新检测已触发", msg, "稍后点击“查看更新”或发送 /updates 查看结果。", d.cfg.MarkdownEnabled),
		Keyboard: quickActionKeyboard([]quickAction{
			{Label: "查看更新", Command: "/updates", ID: "updates"},
			homeAction(),
		}),
	}, d.cfg))
}

func (d *CommandDispatcher) handleBackups(ctx context.Context, cmd IncomingCommand) error {
	summary, err := d.actions.Backups(ctx)
	if err != nil {
		return d.reply(ctx, cmd, d.renderError("获取备份列表失败："+err.Error()))
	}
	return d.reply(ctx, cmd, renderBackups(summary, d.cfg))
}

func (d *CommandDispatcher) handleBackupJSON(ctx context.Context, cmd IncomingCommand) error {
	if err := d.actions.BackupJSON(ctx); err != nil {
		return d.reply(ctx, cmd, d.renderError("JSON 备份失败："+err.Error()))
	}
	return d.reply(ctx, cmd, d.renderSuccess("JSON 备份已完成。发送 /backups 查看备份列表。"))
}

func (d *CommandDispatcher) handleBackupCompose(ctx context.Context, cmd IncomingCommand) error {
	if err := d.actions.BackupCompose(ctx); err != nil {
		return d.reply(ctx, cmd, d.renderError("Compose 备份失败："+err.Error()))
	}
	return d.reply(ctx, cmd, d.renderSuccess("Compose 备份已完成。发送 /backups 查看备份列表。"))
}

func (d *CommandDispatcher) handleCleanImages(ctx context.Context, cmd IncomingCommand) error {
	msg, err := d.actions.CleanImages(ctx)
	if err != nil {
		return d.reply(ctx, cmd, d.renderError("清理镜像失败："+err.Error()))
	}
	return d.reply(ctx, cmd, d.renderSuccess(msg))
}

func (d *CommandDispatcher) handleVersion(ctx context.Context, cmd IncomingCommand) error {
	summary, err := d.actions.Version(ctx)
	if err != nil {
		return d.reply(ctx, cmd, d.renderError("获取版本失败："+err.Error()))
	}
	return d.reply(ctx, cmd, renderVersion(summary, d.cfg))
}

func (d *CommandDispatcher) handleInteraction(ctx context.Context, cmd IncomingCommand) error {
	data := firstNonEmpty(cmd.Action, cmd.Content)
	if command, ok := parseCommandCallback(data); ok {
		next := cmd
		next.Kind = CommandKindMessage
		next.Content = command
		next.Action = ""
		return d.Dispatch(ctx, next)
	}
	if cb, ok := parseContainerCallback(data); ok {
		return d.handleContainerInteraction(ctx, cmd, cb)
	}
	if cb, ok := parseImageCallback(data); ok {
		return d.handleImageInteraction(ctx, cmd, cb)
	}
	cb, ok := parseUpdateCallback(data)
	if !ok {
		return d.reply(ctx, cmd, renderStaleInteraction("按钮已失效，请发送 /updates 刷新。"))
	}
	session, err := d.sessions.get(cmd.UserOpenID, cmd.GroupOpenID, cb.SessionID)
	if err != nil {
		return d.reply(ctx, cmd, renderStaleInteraction(err.Error()))
	}
	switch cb.Action {
	case "confirm_item":
		if cb.Index < 0 || cb.Index >= len(session.Items) {
			return d.reply(ctx, cmd, renderStaleInteraction("更新项已变化，请发送 /updates 刷新。"))
		}
		return d.reply(ctx, cmd, renderConfirm(session.Items[cb.Index], session.ID, cb.Index, d.cfg))
	case "confirm_all":
		return d.reply(ctx, cmd, renderConfirmAll(session.Items, session.ID, d.cfg))
	case "run_item":
		if cb.Index < 0 || cb.Index >= len(session.Items) {
			return d.reply(ctx, cmd, renderStaleInteraction("更新项已变化，请发送 /updates 刷新。"))
		}
		return d.runOne(ctx, cmd, session.Items[cb.Index])
	case "run_all":
		return d.runAll(ctx, cmd, session.Items)
	case "cancel":
		return d.reply(ctx, cmd, renderHome(d.cfg))
	default:
		return d.reply(ctx, cmd, renderStaleInteraction("按钮已失效，请发送 /updates 刷新。"))
	}
}

func (d *CommandDispatcher) handleContainerInteraction(ctx context.Context, cmd IncomingCommand, cb listCallback) error {
	session, err := d.containerSessions.get(cmd.UserOpenID, cmd.GroupOpenID, cb.SessionID)
	if err != nil {
		return d.reply(ctx, cmd, renderStaleInteraction(err.Error()))
	}
	switch cb.Action {
	case "page":
		return d.reply(ctx, cmd, renderContainersPage(session.Items, session, cb.Page, d.cfg))
	case "item":
		if cb.Index < 0 || cb.Index >= len(session.Items) {
			return d.reply(ctx, cmd, renderStaleInteraction("容器列表已变化，请重新发送 /containers 刷新。"))
		}
		return d.reply(ctx, cmd, renderContainerDetail(session.Items[cb.Index], session.ID, cb.Index, cb.Page, d.cfg))
	case "start", "stop", "restart":
		if cb.Index < 0 || cb.Index >= len(session.Items) {
			return d.reply(ctx, cmd, renderStaleInteraction("容器列表已变化，请重新发送 /containers 刷新。"))
		}
		return d.runContainerAction(ctx, cmd, session, cb)
	default:
		return d.reply(ctx, cmd, renderStaleInteraction("按钮已失效，请发送 /containers 刷新。"))
	}
}

func (d *CommandDispatcher) runContainerAction(ctx context.Context, cmd IncomingCommand, session containerSession, cb listCallback) error {
	item := session.Items[cb.Index]
	var msg string
	var err error
	switch cb.Action {
	case "start":
		msg, err = d.actions.StartContainer(ctx, item)
	case "stop":
		msg, err = d.actions.StopContainer(ctx, item)
	case "restart":
		msg, err = d.actions.RestartContainer(ctx, item)
	}
	if err != nil {
		return d.reply(ctx, cmd, d.renderError("容器操作失败："+err.Error()))
	}
	return d.reply(ctx, cmd, renderContainerActionResult(item, msg, session.ID, cb.Index, cb.Page, d.cfg))
}

func (d *CommandDispatcher) handleImageInteraction(ctx context.Context, cmd IncomingCommand, cb listCallback) error {
	session, err := d.imageSessions.get(cmd.UserOpenID, cmd.GroupOpenID, cb.SessionID)
	if err != nil {
		return d.reply(ctx, cmd, renderStaleInteraction(err.Error()))
	}
	switch cb.Action {
	case "page":
		return d.reply(ctx, cmd, renderImagesPage(session.Items, session, cb.Page, d.cfg))
	case "item":
		if cb.Index < 0 || cb.Index >= len(session.Items) {
			return d.reply(ctx, cmd, renderStaleInteraction("镜像列表已变化，请重新发送 /images 刷新。"))
		}
		return d.reply(ctx, cmd, renderImageDetail(session.Items[cb.Index], session.ID, cb.Index, cb.Page, d.cfg))
	case "confirm_delete":
		if cb.Index < 0 || cb.Index >= len(session.Items) {
			return d.reply(ctx, cmd, renderStaleInteraction("镜像列表已变化，请重新发送 /images 刷新。"))
		}
		return d.reply(ctx, cmd, renderImageDeleteConfirm(session.Items[cb.Index], session.ID, cb.Index, cb.Page, d.cfg))
	case "delete":
		if cb.Index < 0 || cb.Index >= len(session.Items) {
			return d.reply(ctx, cmd, renderStaleInteraction("镜像列表已变化，请重新发送 /images 刷新。"))
		}
		return d.runImageDelete(ctx, cmd, session, cb)
	default:
		return d.reply(ctx, cmd, renderStaleInteraction("按钮已失效，请发送 /images 刷新。"))
	}
}

func (d *CommandDispatcher) runImageDelete(ctx context.Context, cmd IncomingCommand, session imageSession, cb listCallback) error {
	item := session.Items[cb.Index]
	if item.InUse {
		return d.reply(ctx, cmd, d.renderError("镜像仍在使用中，已阻止删除："+imageDisplayName(item)))
	}
	msg, err := d.actions.RemoveImage(ctx, item, false)
	if err != nil {
		return d.reply(ctx, cmd, d.renderError("镜像删除失败："+err.Error()))
	}
	return d.reply(ctx, cmd, renderImageActionResult(item, msg, session.ID, cb.Page, d.cfg))
}

func (d *CommandDispatcher) runOne(ctx context.Context, cmd IncomingCommand, item ContainerUpdateItem) error {
	if _, err := d.actions.UpdateContainer(ctx, item); err != nil {
		return d.reply(ctx, cmd, d.renderError("提交更新失败："+err.Error()))
	}
	return d.reply(ctx, cmd, d.renderSuccess(fmt.Sprintf("已提交更新：%s\n更新在后台进行，稍后发送 /updates 或 /status 查看结果。", item.Name)))
}

func (d *CommandDispatcher) runAll(ctx context.Context, cmd IncomingCommand, items []ContainerUpdateItem) error {
	started := make([]string, 0, len(items))
	failed := make([]string, 0)
	for _, item := range items {
		if _, err := d.actions.UpdateContainer(ctx, item); err != nil {
			failed = append(failed, item.Name)
			continue
		}
		started = append(started, item.Name)
	}
	var b strings.Builder
	b.WriteString(fmt.Sprintf("批量更新已提交：成功 %d，失败 %d\n", len(started), len(failed)))
	if len(started) > 0 {
		b.WriteString("\n已提交:\n")
		for _, name := range started {
			b.WriteString("- " + name + "\n")
		}
	}
	if len(failed) > 0 {
		b.WriteString("\n提交失败:\n")
		for _, name := range failed {
			b.WriteString("- " + name + "\n")
		}
	}
	b.WriteString("\n更新在后台进行，稍后发送 /updates 查看结果。")
	return d.reply(ctx, cmd, d.renderSuccess(strings.TrimSpace(b.String())))
}

func (d *CommandDispatcher) renderError(text string) Message {
	msg := richMessage(Message{Text: renderErrorText(text, d.cfg.MarkdownEnabled), Keyboard: homeKeyboard()}, d.cfg)
	msg.PlainText = renderErrorText(text, false)
	return msg
}

func (d *CommandDispatcher) renderSuccess(text string) Message {
	msg := richMessage(Message{
		Text: renderSuccessText(text, d.cfg.MarkdownEnabled),
		Keyboard: quickActionKeyboard([]quickAction{
			{Label: "查看备份", Command: "/backups", ID: "backups"},
			{Label: "查看更新", Command: "/updates", ID: "updates"},
			homeAction(),
		}),
	}, d.cfg)
	msg.PlainText = renderSuccessText(text, false)
	return msg
}

func (d *CommandDispatcher) reply(ctx context.Context, cmd IncomingCommand, msg Message) error {
	msg.MsgID = cmd.MessageID
	if cmd.GroupOpenID != "" {
		return d.sender.SendGroup(ctx, cmd.GroupOpenID, msg)
	}
	return d.sender.SendC2C(ctx, cmd.UserOpenID, msg)
}
