package qqbot

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"github.com/onlyLTY/dockerCopilot/internal/config"
	"github.com/onlyLTY/dockerCopilot/internal/domain/runtimeconfig"
	"github.com/onlyLTY/dockerCopilot/internal/svc"
)

func TestRuntimeManagerReloadStartsAndStopsGateway(t *testing.T) {
	path := filepath.Join(t.TempDir(), "runtime.json")
	t.Setenv("DOCKERCOPILOT_BOT_CONFIG", path)
	store := runtimeconfig.NewStore(path, "secret")
	cfg := runtimeconfig.Default("secret")
	cfg.QQBot["enabled"] = false
	if err := store.Write(cfg); err != nil {
		t.Fatalf("write disabled config: %v", err)
	}

	started := make(chan context.Context, 2)
	manager := &runtimeManager{
		initialized: true,
		startGateway: func(ctx context.Context, cfg Config, runtimeCfg svc.BackupRuntimeConfig, svcCtx *svc.ServiceContext) {
			started <- ctx
		},
	}
	svcCtx := svc.NewServiceContext(config.Config{})

	if err := manager.Reload(context.Background(), svcCtx); err != nil {
		t.Fatalf("Reload disabled error = %v", err)
	}
	if len(started) != 0 {
		t.Fatalf("gateway started while disabled")
	}

	cfg.QQBot["enabled"] = true
	cfg.QQBot["app_id"] = "app-id"
	cfg.QQBot["app_secret"] = "app-secret"
	if err := store.Write(cfg); err != nil {
		t.Fatalf("write enabled config: %v", err)
	}
	if err := manager.Reload(context.Background(), svcCtx); err != nil {
		t.Fatalf("Reload enabled error = %v", err)
	}
	var runCtx context.Context
	select {
	case runCtx = <-started:
	case <-time.After(time.Second):
		t.Fatal("gateway did not start after enabling QQBot")
	}

	cfg.QQBot["enabled"] = false
	if err := store.Write(cfg); err != nil {
		t.Fatalf("write disabled config again: %v", err)
	}
	if err := manager.Reload(context.Background(), svcCtx); err != nil {
		t.Fatalf("Reload disabled again error = %v", err)
	}
	select {
	case <-runCtx.Done():
	case <-time.After(time.Second):
		t.Fatal("gateway context was not canceled after disabling QQBot")
	}
}
