package qqbot

import (
	"context"
	"fmt"
	"strings"

	"github.com/onlyLTY/dockerCopilot/internal/svc"
	"github.com/zeromicro/go-zero/core/logx"
)

func Start(ctx context.Context, svcCtx *svc.ServiceContext) error {
	cfg, err := svc.LoadRuntimeConfigForRead()
	if err != nil {
		return err
	}
	qqCfg := ConfigFromRuntime(cfg)
	if !qqCfg.Enabled {
		logx.Infof("QQBot 未启用，跳过官方 QQBot 启动")
		return nil
	}
	if qqCfg.AppID == "" || qqCfg.AppSecret == "" {
		return fmt.Errorf("QQBot 已启用但 app_id 或 app_secret 未配置")
	}
	if qqCfg.EventMode != "webhook" {
		return fmt.Errorf("QQBot event_mode=%s 暂未实现，请先使用 webhook", qqCfg.EventMode)
	}
	logx.Infof("QQBot 配置已加载: mode=%s sandbox=%v markdown=%v buttons=%v", qqCfg.EventMode, qqCfg.Sandbox, qqCfg.MarkdownEnabled, qqCfg.ButtonsEnabled)
	return nil
}

func NormalizeCommandText(text string) string {
	trimmed := strings.TrimSpace(text)
	if trimmed == "" {
		return "/start"
	}
	fields := strings.Fields(trimmed)
	if len(fields) == 0 {
		return "/start"
	}
	command := strings.ToLower(fields[0])
	switch command {
	case "start", "help", "帮助", "菜单", "/help":
		return "/start"
	case "status", "状态", "概览":
		return "/status"
	case "updates", "更新", "可更新":
		return "/updates"
	default:
		return command
	}
}
