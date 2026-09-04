package qqbot

import (
	"strings"
	"testing"
)

func TestRenderUpdateNotificationUsesCompactMarkdownList(t *testing.T) {
	items := []NotifyUpdateItem{
		{Name: "asf", ImageRef: "justarchi/archisteamfarm:latest"},
		{Name: "emby-toolkit", ImageRef: "nbq0405/emby-toolkit:latest"},
	}
	text := renderUpdateNotificationText("nas", items, true)
	if !strings.Contains(text, "**检测到可更新容器**") || !strings.Contains(text, "实例：**nas**") || !strings.Contains(text, "1. **asf**") || !strings.Contains(text, "`justarchi/archisteamfarm:latest`") {
		t.Fatalf("notification text = %q, want compact markdown list", text)
	}
	if strings.Contains(text, "| # | 容器 | 镜像 |") || !strings.Contains(text, "/updates nas") {
		t.Fatalf("notification text = %q, want non-table markdown body and command", text)
	}
	msg := renderUpdateNotification("nas", items, Config{MarkdownEnabled: true, ButtonsEnabled: true})
	callbacks := collectQQCallbackData(msg)
	if len(callbacks) != 1 || callbacks[0] != "cmd:/updates nas" {
		t.Fatalf("notification callbacks = %#v, want instance-bound updates command", callbacks)
	}
}

func TestRenderStartupNotificationUsesCompactMarkdownList(t *testing.T) {
	text := renderStartupNotificationText("direct", []string{"local"}, true)
	if !strings.Contains(text, "**DockerCopilot QQBot 启动成功**") || !strings.Contains(text, "- 实例：1 个") || !strings.Contains(text, "1. local") {
		t.Fatalf("startup text = %q, want compact markdown list", text)
	}
	if strings.Contains(text, "| 项目 | 内容 |") {
		t.Fatalf("startup text = %q, want no table in startup notification", text)
	}
}
