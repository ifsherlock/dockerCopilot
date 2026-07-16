package qqbot

import (
	"context"
	"strings"

	"github.com/onlyLTY/dockerCopilot/internal/domain/botnotify"
	"github.com/onlyLTY/dockerCopilot/internal/svc"
)

// qqNotifier 把 automation 的渠道无关事件渲染为 QQ 渠道消息。
// QQ 主动消息有配额限制，因此更新/自动化通知都合并为“单条精简消息”，
// 官方 markdown 不支持表格，富文本失败会自动降级到 PlainText。
type qqNotifier struct {
	svcCtx *svc.ServiceContext
}

func registerNotifier(svcCtx *svc.ServiceContext) {
	botnotify.Register("qqbot", &qqNotifier{svcCtx: svcCtx})
}

func unregisterNotifier() {
	botnotify.Unregister("qqbot")
}

func (n *qqNotifier) enabled() (svc.BackupRuntimeConfig, Config, bool) {
	cfg, err := svc.LoadRuntimeConfigForRead()
	if err != nil {
		return svc.BackupRuntimeConfig{}, Config{}, false
	}
	qqCfg := ConfigFromRuntime(cfg)
	if !qqCfg.Enabled {
		return cfg, qqCfg, false
	}
	return cfg, qqCfg, true
}

func (n *qqNotifier) NotifyUpdates(ctx context.Context, evt botnotify.UpdatesEvent) {
	cfg, qqCfg, ok := n.enabled()
	if !ok || len(evt.Items) == 0 {
		return
	}
	targets := notificationTargets(cfg)
	if len(targets) == 0 {
		return
	}
	items := make([]NotifyUpdateItem, 0, len(evt.Items))
	for _, item := range evt.Items {
		items = append(items, NotifyUpdateItem{Name: item.Name, ImageRef: oneLineImageRef(item.Image)})
	}
	sendNotificationToTargets(ctx, qqCfg, targets, renderUpdateNotification(evt.Instance, items, qqCfg))
}

func (n *qqNotifier) NotifyAutomation(ctx context.Context, evt botnotify.AutomationEvent) {
	cfg, qqCfg, ok := n.enabled()
	if !ok {
		return
	}
	targets := notificationTargets(cfg)
	if len(targets) == 0 {
		return
	}
	sendNotificationToTargets(ctx, qqCfg, targets, renderAutomationNotification(evt, qqCfg))
}

func oneLineImageRef(value string) string {
	return strings.Join(strings.Fields(strings.TrimSpace(value)), " ")
}
