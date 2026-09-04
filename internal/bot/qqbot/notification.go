package qqbot

import (
	"context"
	"fmt"
	"strings"

	"github.com/onlyLTY/dockerCopilot/internal/domain/botnotify"
	"github.com/onlyLTY/dockerCopilot/internal/svc"
	"github.com/zeromicro/go-zero/core/logx"
)

type NotifyUpdateItem struct {
	Name       string
	ImageRef   string
	CreateRef  string
	HaveUpdate bool
}

type notifyTarget struct {
	Kind   string
	OpenID string
}

func SendStartupNotification(ctx context.Context, cfg svc.BackupRuntimeConfig, proxySummary string, instances []string) {
	qqCfg := ConfigFromRuntime(cfg)
	targets := notificationTargets(cfg)
	if !qqCfg.Enabled || len(targets) == 0 {
		return
	}
	plain := renderStartupNotificationText(proxySummary, instances, false)
	var msg Message
	if qqCfg.MarkdownEnabled {
		msg = enrichMarkdown(Message{Text: renderStartupNotificationText(proxySummary, instances, true)}, true)
		msg.PlainText = plain
	} else {
		msg = Message{Text: plain}
	}
	sendNotificationToTargets(ctx, qqCfg, targets, msg)
}

func renderStartupNotificationText(proxySummary string, instances []string, markdown bool) string {
	var b strings.Builder
	if markdown {
		b.WriteString("**DockerCopilot QQBot 启动成功**\n\n")
		b.WriteString(fmt.Sprintf("- 实例：%d 个\n", len(instances)))
		if strings.TrimSpace(proxySummary) != "" {
			b.WriteString("- 代理：" + markdownInline(proxySummary) + "\n")
		}
		if len(instances) > 0 {
			b.WriteString("\n**可用实例**\n")
			for i, name := range instances {
				b.WriteString(fmt.Sprintf("%d. %s\n", i+1, markdownInline(name)))
			}
		}
		b.WriteString("\n" + renderHintText("发送 `/help` 查看可用命令。", true))
		return strings.TrimSpace(b.String())
	}
	b.WriteString("Docker Copilot QQBot 启动成功\n\n")
	b.WriteString(fmt.Sprintf("实例数量: %d 个\n", len(instances)))
	if len(instances) > 0 {
		b.WriteString("\n可用实例:\n")
		for i, name := range instances {
			b.WriteString(fmt.Sprintf("%d. %s\n", i+1, name))
		}
	}
	if strings.TrimSpace(proxySummary) != "" {
		b.WriteString("\n代理: " + proxySummary + "\n")
	}
	b.WriteString("\n发送 /help 查看可用命令")
	return b.String()
}

// renderUpdateNotification 生成 QQ 更新通知：合并为一条精简消息，
// 附带纯文本降级版本，避免富文本失败时露出 markdown 源码。
func renderUpdateNotification(instanceName string, items []NotifyUpdateItem, cfg Config) Message {
	instanceName = notificationInstanceName(instanceName)
	plain := renderUpdateNotificationText(instanceName, items, false)
	msg := Message{
		Text:      plain,
		PlainText: plain,
		Keyboard: quickActionKeyboard([]quickAction{
			{Label: "查看此实例更新", Command: updateCommandForInstance(instanceName), ID: "updates_instance"},
		}),
	}
	if cfg.MarkdownEnabled {
		msg.Text = renderUpdateNotificationText(instanceName, items, true)
	}
	return richMessage(msg, cfg)
}

// renderAutomationNotification 生成 QQ 自动化任务结果通知（自动清理镜像 / 自动更新容器）。
func renderAutomationNotification(evt botnotify.AutomationEvent, cfg Config) Message {
	title := "自动清理镜像"
	if evt.Kind == botnotify.KindUpdateContainers {
		title = "自动更新容器"
	}
	if evt.Kind == botnotify.KindSelfUpdate {
		title = "DockerCopilot 自更新"
	}
	var b strings.Builder
	b.WriteString(title + "\n\n")
	if evt.Err != "" {
		b.WriteString("任务失败: " + shortenText(evt.Err, 160))
	} else {
		b.WriteString(fmt.Sprintf("成功 %d，失败 %d", evt.OK, evt.Failed))
		limit := len(evt.Details)
		if limit > 8 {
			limit = 8
		}
		for i := 0; i < limit; i++ {
			b.WriteString("\n" + shortenText(evt.Details[i], 60))
		}
		if len(evt.Details) > limit {
			b.WriteString(fmt.Sprintf("\n… 还有 %d 条", len(evt.Details)-limit))
		}
	}
	// 自动化结果统一用纯文本，QQ 端最稳、可读性最好。
	return Message{Text: strings.TrimSpace(b.String())}
}

func renderUpdateNotificationText(instanceName string, items []NotifyUpdateItem, markdown bool) string {
	instanceName = notificationInstanceName(instanceName)
	var b strings.Builder
	limit := len(items)
	if limit > 8 {
		limit = 8
	}
	if markdown {
		b.WriteString(fmt.Sprintf("**检测到可更新容器** · %d 个\n\n", len(items)))
		b.WriteString("- 实例：**" + markdownInline(instanceName) + "**\n\n")
		for i := 0; i < limit; i++ {
			item := items[i]
			ref := firstNonEmpty(item.ImageRef, item.CreateRef)
			b.WriteString(fmt.Sprintf("%d. **%s**\n", i+1, markdownInline(item.Name)))
			if strings.TrimSpace(ref) != "" {
				b.WriteString("   `" + markdownCodeInline(shortenText(ref, 72)) + "`\n")
			}
		}
		if len(items) > limit {
			b.WriteString("\n" + renderHintText(fmt.Sprintf("还有 %d 个未显示。", len(items)-limit), true))
		}
		b.WriteString("\n\n" + renderHintText("发送 `"+markdownCodeInline(updateCommandForInstance(instanceName))+"` 查看此实例详情。", true))
		return strings.TrimSpace(b.String())
	}
	b.WriteString(fmt.Sprintf("检测到可更新容器：%d 个\n实例: %s\n\n", len(items), instanceName))
	for i := 0; i < limit; i++ {
		item := items[i]
		b.WriteString(fmt.Sprintf("%d. %s\n", i+1, item.Name))
		if ref := strings.TrimSpace(firstNonEmpty(item.ImageRef, item.CreateRef)); ref != "" {
			b.WriteString("   " + shortenText(ref, 52) + "\n")
		}
	}
	if len(items) > limit {
		b.WriteString(fmt.Sprintf("\n还有 %d 个未显示。\n", len(items)-limit))
	}
	b.WriteString("\n发送 " + updateCommandForInstance(instanceName) + " 查看此实例详情。")
	return strings.TrimSpace(b.String())
}

func notificationInstanceName(instanceName string) string {
	return firstNonEmpty(strings.TrimSpace(instanceName), "local")
}

func updateCommandForInstance(instanceName string) string {
	return "/updates " + notificationInstanceName(instanceName)
}

func sendNotificationToTargets(ctx context.Context, cfg Config, targets []notifyTarget, msg Message) {
	sender := NewSender(cfg, nil, nil)
	for _, target := range targets {
		switch target.Kind {
		case "group":
			if err := sender.SendGroup(ctx, target.OpenID, msg); err != nil {
				logx.Errorf("发送 QQBot 群通知失败: %v", err)
			}
		default:
			if err := sender.SendC2C(ctx, target.OpenID, msg); err != nil {
				logx.Errorf("发送 QQBot 用户通知失败: %v", err)
			}
		}
	}
}

func notificationTargets(cfg svc.BackupRuntimeConfig) []notifyTarget {
	qq := cfg.QQBot
	seen := map[string]struct{}{}
	targets := make([]notifyTarget, 0)
	add := func(kind string, openID string) {
		kind = strings.ToLower(strings.TrimSpace(kind))
		if kind != "group" {
			kind = "user"
		}
		openID = strings.TrimSpace(openID)
		if openID == "" {
			return
		}
		key := kind + ":" + openID
		if _, ok := seen[key]; ok {
			return
		}
		seen[key] = struct{}{}
		targets = append(targets, notifyTarget{Kind: kind, OpenID: openID})
	}
	for _, raw := range svc.StringList(qq["notify_targets"]) {
		kind, openID, ok := strings.Cut(strings.TrimSpace(raw), ":")
		if ok {
			add(kind, openID)
		}
	}
	if len(targets) > 0 {
		return targets
	}
	for _, openID := range svc.StringList(qq["allowed_user_openids"]) {
		add("user", openID)
	}
	for _, openID := range svc.StringList(qq["allowed_group_openids"]) {
		add("group", openID)
	}
	return targets
}

func startupInstanceNames(cfg svc.BackupRuntimeConfig) []string {
	names := make([]string, 0)
	for _, raw := range interfaceList(cfg.Dockercopilot["instances"]) {
		item, ok := raw.(map[string]interface{})
		if !ok {
			continue
		}
		name := strings.TrimSpace(svc.AsString(item["name"], ""))
		if name != "" {
			names = append(names, name)
		}
	}
	if len(names) == 0 {
		return []string{"local"}
	}
	return names
}

func interfaceList(value interface{}) []interface{} {
	switch v := value.(type) {
	case []interface{}:
		return v
	case []map[string]interface{}:
		items := make([]interface{}, 0, len(v))
		for _, item := range v {
			items = append(items, item)
		}
		return items
	default:
		return nil
	}
}
