package qqbot

import (
	"context"
	"fmt"
	"strings"
	"sync"

	"github.com/onlyLTY/dockerCopilot/internal/domain/botreload"
	"github.com/onlyLTY/dockerCopilot/internal/svc"
	"github.com/zeromicro/go-zero/core/logx"
)

var defaultManager = &runtimeManager{}

type runtimeManager struct {
	mu           sync.Mutex
	initialized  bool
	cancel       context.CancelFunc
	startGateway func(context.Context, Config, svc.BackupRuntimeConfig, *svc.ServiceContext)
}

func Start(ctx context.Context, svcCtx *svc.ServiceContext) error {
	botreload.RegisterQQBotReloader(func(ctx context.Context) error {
		return defaultManager.Reload(ctx, svcCtx)
	})
	return defaultManager.Start(ctx, svcCtx)
}

func Reload(ctx context.Context, svcCtx *svc.ServiceContext) error {
	return defaultManager.Reload(ctx, svcCtx)
}

func (m *runtimeManager) Start(ctx context.Context, svcCtx *svc.ServiceContext) error {
	m.mu.Lock()
	m.initialized = true
	m.mu.Unlock()
	return m.reload(ctx, svcCtx, true)
}

func (m *runtimeManager) Reload(ctx context.Context, svcCtx *svc.ServiceContext) error {
	return m.reload(ctx, svcCtx, false)
}

func (m *runtimeManager) reload(ctx context.Context, svcCtx *svc.ServiceContext, allowInitialize bool) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if !m.initialized && !allowInitialize {
		return nil
	}
	if m.cancel != nil {
		m.cancel()
		m.cancel = nil
		logx.Infof("QQBot 运行时已停止，准备按最新配置重载")
	}

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
	runCtx, cancel := context.WithCancel(ctx)
	startUpdateBackgroundJobs(runCtx, svcCtx)
	if allowInitialize {
		SendStartupNotification(runCtx, cfg, "none", startupInstanceNames(cfg))
	}
	if qqCfg.EventMode == "gateway" {
		starter := m.startGateway
		if starter == nil {
			starter = func(ctx context.Context, cfg Config, runtimeCfg svc.BackupRuntimeConfig, svcCtx *svc.ServiceContext) {
				runtime := NewGatewayRuntime(cfg, runtimeCfg, svcCtx, nil)
				runtime.Run(ctx)
			}
		}
		go starter(runCtx, qqCfg, cfg, svcCtx)
		m.cancel = cancel
		logx.Infof("QQBot 配置已加载: mode=%s sandbox=%v markdown=%v buttons=%v", qqCfg.EventMode, qqCfg.Sandbox, qqCfg.MarkdownEnabled, qqCfg.ButtonsEnabled)
		return nil
	}
	if qqCfg.EventMode == "webhook" {
		cancel()
		logx.Infof("QQBot 配置已加载: mode=%s sandbox=%v markdown=%v buttons=%v", qqCfg.EventMode, qqCfg.Sandbox, qqCfg.MarkdownEnabled, qqCfg.ButtonsEnabled)
		return nil
	}
	cancel()
	return fmt.Errorf("QQBot event_mode=%s 不支持", qqCfg.EventMode)
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
	case "containers", "容器", "容器列表":
		return "/containers"
	case "images", "镜像", "镜像列表":
		return "/images"
	case "updates", "更新", "可更新":
		return "/updates"
	case "check_updates", "checkupdate", "刷新更新", "检测更新":
		return "/check_updates"
	case "backups", "备份", "备份列表":
		return "/backups"
	case "backup", "json备份", "备份json":
		return "/backup"
	case "backup_compose", "compose备份", "备份compose":
		return "/backup_compose"
	case "clean_images", "cleanup", "清理镜像":
		return "/clean_images"
	case "version", "版本":
		return "/version"
	default:
		return command
	}
}
