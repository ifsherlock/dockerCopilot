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
	Updates(ctx context.Context) ([]ContainerUpdateItem, error)
	UpdateContainer(ctx context.Context, item ContainerUpdateItem) (string, error)
}

type CommandDispatcher struct {
	cfg      Config
	sender   messageSender
	actions  commandActions
	sessions *updateSessionStore
}

func NewCommandDispatcher(cfg Config, sender messageSender, actions commandActions) *CommandDispatcher {
	return &CommandDispatcher{
		cfg:      cfg.Normalized(),
		sender:   sender,
		actions:  actions,
		sessions: newUpdateSessionStore(10 * time.Minute),
	}
}

func (d *CommandDispatcher) Dispatch(ctx context.Context, cmd IncomingCommand) error {
	if cmd.Kind == CommandKindInteraction {
		return d.handleInteraction(ctx, cmd)
	}
	switch NormalizeCommandText(cmd.Content) {
	case "/start":
		return d.reply(ctx, cmd, renderHome())
	case "/status":
		return d.handleStatus(ctx, cmd)
	case "/updates":
		return d.handleUpdates(ctx, cmd)
	default:
		return d.reply(ctx, cmd, Message{Text: "暂不支持该命令。可发送 /status 或 /updates。"})
	}
}

func (d *CommandDispatcher) handleStatus(ctx context.Context, cmd IncomingCommand) error {
	summary, err := d.actions.Status(ctx)
	if err != nil {
		return d.reply(ctx, cmd, Message{Text: "获取状态失败：" + err.Error()})
	}
	return d.reply(ctx, cmd, renderStatus(summary, d.cfg.MarkdownEnabled))
}

func (d *CommandDispatcher) handleUpdates(ctx context.Context, cmd IncomingCommand) error {
	items, err := d.actions.Updates(ctx)
	if err != nil {
		return d.reply(ctx, cmd, Message{Text: "获取可更新容器失败：" + err.Error()})
	}
	session := d.sessions.put(cmd.UserOpenID, cmd.GroupOpenID, items)
	return d.reply(ctx, cmd, renderUpdates(items, session, d.cfg))
}

func (d *CommandDispatcher) handleInteraction(ctx context.Context, cmd IncomingCommand) error {
	cb, ok := parseUpdateCallback(firstNonEmpty(cmd.Action, cmd.Content))
	if !ok {
		return d.reply(ctx, cmd, Message{Text: "按钮已失效，请发送 /updates 刷新。"})
	}
	session, err := d.sessions.get(cmd.UserOpenID, cmd.GroupOpenID, cb.SessionID)
	if err != nil {
		return d.reply(ctx, cmd, Message{Text: err.Error()})
	}
	switch cb.Action {
	case "confirm_item":
		if cb.Index < 0 || cb.Index >= len(session.Items) {
			return d.reply(ctx, cmd, Message{Text: "更新项已变化，请发送 /updates 刷新。"})
		}
		return d.reply(ctx, cmd, renderConfirm(session.Items[cb.Index], session.ID, cb.Index, d.cfg))
	case "confirm_all":
		return d.reply(ctx, cmd, renderConfirmAll(session.Items, session.ID, d.cfg))
	case "run_item":
		if cb.Index < 0 || cb.Index >= len(session.Items) {
			return d.reply(ctx, cmd, Message{Text: "更新项已变化，请发送 /updates 刷新。"})
		}
		return d.runOne(ctx, cmd, session.Items[cb.Index])
	case "run_all":
		return d.runAll(ctx, cmd, session.Items)
	case "cancel":
		return d.reply(ctx, cmd, Message{Text: "已取消。"})
	default:
		return d.reply(ctx, cmd, Message{Text: "按钮已失效，请发送 /updates 刷新。"})
	}
}

func (d *CommandDispatcher) runOne(ctx context.Context, cmd IncomingCommand, item ContainerUpdateItem) error {
	taskID, err := d.actions.UpdateContainer(ctx, item)
	if err != nil {
		return d.reply(ctx, cmd, Message{Text: "提交更新失败：" + err.Error()})
	}
	return d.reply(ctx, cmd, Message{Text: fmt.Sprintf("已提交更新：%s\nTaskID: %s", item.Name, taskID)})
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
	b.WriteString("批量更新已提交\n")
	if len(started) > 0 {
		b.WriteString("\n成功:\n")
		for _, name := range started {
			b.WriteString("- " + name + "\n")
		}
	}
	if len(failed) > 0 {
		b.WriteString("\n失败:\n")
		for _, name := range failed {
			b.WriteString("- " + name + "\n")
		}
	}
	return d.reply(ctx, cmd, Message{Text: b.String()})
}

func (d *CommandDispatcher) reply(ctx context.Context, cmd IncomingCommand, msg Message) error {
	msg.MsgID = cmd.MessageID
	if cmd.GroupOpenID != "" {
		return d.sender.SendGroup(ctx, cmd.GroupOpenID, msg)
	}
	return d.sender.SendC2C(ctx, cmd.UserOpenID, msg)
}
