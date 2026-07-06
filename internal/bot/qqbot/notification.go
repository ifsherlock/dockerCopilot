package qqbot

import (
	"context"
	"fmt"
	"strings"

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
	var b strings.Builder
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
	sendNotificationToTargets(ctx, qqCfg, targets, enrichMarkdown(Message{Text: b.String()}, qqCfg.MarkdownEnabled))
}

func SendUpdateNotification(ctx context.Context, cfg svc.BackupRuntimeConfig, instanceName string, items []NotifyUpdateItem) {
	qqCfg := ConfigFromRuntime(cfg)
	targets := notificationTargets(cfg)
	if !qqCfg.Enabled || len(targets) == 0 || len(items) == 0 {
		return
	}
	var b strings.Builder
	b.WriteString("检测到可更新容器\n\n")
	b.WriteString(fmt.Sprintf("实例: %s\n", strings.TrimSpace(instanceName)))
	b.WriteString(fmt.Sprintf("数量: %d\n\n", len(items)))
	limit := len(items)
	if limit > 8 {
		limit = 8
	}
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
	b.WriteString("\n发送 /updates 查看详情。")
	sendNotificationToTargets(ctx, qqCfg, targets, enrichMarkdown(Message{Text: b.String()}, qqCfg.MarkdownEnabled))
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
