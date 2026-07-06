package qqbot

import (
	"context"
	"strings"
	"time"

	containerlogic "github.com/onlyLTY/dockerCopilot/internal/logic/container"
	"github.com/onlyLTY/dockerCopilot/internal/svc"
	"github.com/robfig/cron/v3"
	"github.com/zeromicro/go-zero/core/logx"
)

func startUpdateBackgroundJobs(ctx context.Context, svcCtx *svc.ServiceContext) {
	go func() {
		cfg, err := svc.LoadRuntimeConfigForRead()
		if err != nil || !ConfigFromRuntime(cfg).Enabled {
			return
		}
		warmSpec := strings.ToLower(strings.TrimSpace(svc.AsString(cfg.Telegram["update_check_cron"], "0 18 * * *")))
		if cronDisabled(warmSpec) {
			return
		}
		warmCtx, cancel := context.WithTimeout(ctx, 5*time.Minute)
		defer cancel()
		if err := runUpdateDetectionOnce(warmCtx, svcCtx, true); err != nil {
			logx.Errorf("QQBot 启动预热更新检测失败: %v", err)
		}
	}()

	go func() {
		var lastTick string
		for {
			cfg, err := svc.LoadRuntimeConfigForRead()
			if err != nil {
				logx.Errorf("加载 QQBot 定时任务配置失败: %v", err)
				if !sleepOrDone(ctx, 30*time.Second) {
					return
				}
				continue
			}
			if !ConfigFromRuntime(cfg).Enabled {
				if !sleepOrDone(ctx, 30*time.Second) {
					return
				}
				continue
			}
			spec := strings.TrimSpace(svc.AsString(cfg.Telegram["update_check_cron"], "0 18 * * *"))
			if spec == "" {
				spec = "0 18 * * *"
			}
			if cronDisabled(strings.ToLower(spec)) {
				if !sleepOrDone(ctx, 30*time.Second) {
					return
				}
				continue
			}
			schedule, err := cron.ParseStandard(spec)
			if err != nil {
				logx.Errorf("解析 QQBot 更新检测 cron 失败 [%s]: %v", spec, err)
				if !sleepOrDone(ctx, 30*time.Second) {
					return
				}
				continue
			}
			next := schedule.Next(time.Now())
			wait := time.Until(next)
			if wait < 0 {
				wait = time.Second
			}
			if wait > 30*time.Second {
				wait = 30 * time.Second
			}
			if !sleepOrDone(ctx, wait) {
				return
			}
			tickKey := next.Format(time.RFC3339)
			if tickKey == lastTick {
				continue
			}
			lastTick = tickKey
			checkCtx, cancel := context.WithTimeout(ctx, 10*time.Minute)
			if err := runUpdateDetectionOnce(checkCtx, svcCtx, false); err != nil {
				logx.Errorf("QQBot 定时更新检测失败: %v", err)
			}
			cancel()
		}
	}()
}

func runUpdateDetectionOnce(ctx context.Context, svcCtx *svc.ServiceContext, silent bool) error {
	cfg, err := svc.LoadRuntimeConfigForRead()
	if err != nil {
		return err
	}
	if !ConfigFromRuntime(cfg).Enabled {
		return nil
	}
	updates, err := refreshLocalUpdatableContainers(ctx, svcCtx)
	if err != nil {
		return err
	}
	logx.Infof("QQBot 后台更新检测完成: updates=%d silent=%v", len(updates), silent)
	if !silent && len(updates) > 0 {
		SendUpdateNotification(ctx, cfg, "local", notifyItemsFromUpdateItems(updates))
	}
	return nil
}

func refreshLocalUpdatableContainers(ctx context.Context, svcCtx *svc.ServiceContext) ([]ContainerUpdateItem, error) {
	running, last := svcCtx.UpdateCheckStatus()
	cacheAge := time.Duration(0)
	if !last.IsZero() {
		cacheAge = time.Since(last)
	}
	if !running && (last.IsZero() || cacheAge > 60*time.Second) {
		if _, err := containerlogic.NewCheckUpdateLogic(ctx, svcCtx).CheckUpdate(); err != nil {
			return nil, err
		}
		running = true
	}
	if running {
		waitLocalUpdateCheck(ctx, svcCtx, 2500*time.Millisecond)
	}
	return NewActionService(svcCtx).Updates(ctx)
}

func notifyItemsFromUpdateItems(updates []ContainerUpdateItem) []NotifyUpdateItem {
	items := make([]NotifyUpdateItem, 0, len(updates))
	for _, item := range updates {
		items = append(items, NotifyUpdateItem{
			Name:      item.Name,
			ImageRef:  oneLineImageRef(item.UsingImage),
			CreateRef: oneLineImageRef(item.CreateImage),
		})
	}
	return items
}

func waitLocalUpdateCheck(ctx context.Context, svcCtx *svc.ServiceContext, timeout time.Duration) {
	deadline := time.Now().Add(timeout)
	for {
		running, _ := svcCtx.UpdateCheckStatus()
		if !running || time.Now().After(deadline) {
			return
		}
		if !sleepOrDone(ctx, 200*time.Millisecond) {
			return
		}
	}
}

func cronDisabled(spec string) bool {
	switch strings.ToLower(strings.TrimSpace(spec)) {
	case "off", "false", "0", "no":
		return true
	default:
		return false
	}
}

func sleepOrDone(ctx context.Context, d time.Duration) bool {
	timer := time.NewTimer(d)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return false
	case <-timer.C:
		return true
	}
}

func oneLineImageRef(value string) string {
	return strings.Join(strings.Fields(strings.TrimSpace(value)), " ")
}
