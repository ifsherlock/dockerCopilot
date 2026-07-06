package svc

import (
	"testing"
	"time"

	"github.com/onlyLTY/dockerCopilot/internal/config"
	"github.com/onlyLTY/dockerCopilot/internal/domain/updatecheck"
)

func TestServiceContextPersistsRuntimeLogs(t *testing.T) {
	t.Setenv("DOCKERCOPILOT_LOG_DIR", t.TempDir())

	ctx := NewServiceContext(config.Config{})
	ctx.AddOperationLog("compose", "Compose up done", "demo")
	ctx.UpdateProgress("task-1", TaskProgress{
		TaskID:     "task-1",
		Percentage: 30,
		Message:    "pulling",
		Name:       "demo",
	})
	ctx.AppendProgressLog("task-1", "pull image: nginx:latest")

	reloaded := NewServiceContext(config.Config{})
	operationLogs := reloaded.GetOperationLogs()
	if len(operationLogs) != 1 {
		t.Fatalf("operation log count = %d, want 1", len(operationLogs))
	}
	if operationLogs[0].Type != "compose" || operationLogs[0].Title != "Compose up done" || operationLogs[0].Message != "demo" {
		t.Fatalf("operation log = %#v, want persisted compose log", operationLogs[0])
	}

	progress, ok := reloaded.GetProgress("task-1")
	if !ok {
		t.Fatalf("persisted task progress not found")
	}
	if progress.Message != "pulling" || progress.DetailMsg != "pull image: nginx:latest" {
		t.Fatalf("progress = %#v, want persisted task log", progress)
	}
	if progress.CreatedAt == "" || progress.UpdatedAt == "" {
		t.Fatalf("progress timestamps were not persisted: %#v", progress)
	}
}

func TestServiceContextUsesUpdateStoreAsOnlyImageUpdateState(t *testing.T) {
	ctx := NewServiceContext(config.Config{})

	ctx.SetHubImageUpdate("sha256:image", true)
	needUpdate, ok := ctx.GetHubImageUpdate("sha256:image")
	if !ok || !needUpdate {
		t.Fatalf("GetHubImageUpdate() = %v, %v; want true, true", needUpdate, ok)
	}

	state, ok := ctx.UpdateStore.GetImage("sha256:image")
	if !ok || state.Status != updatecheck.StatusUpdateAvailable {
		t.Fatalf("UpdateStore state = %#v, ok=%v", state, ok)
	}

	ctx.ClearHubImageUpdate("sha256:image")
	if _, ok := ctx.GetHubImageUpdate("sha256:image"); ok {
		t.Fatalf("GetHubImageUpdate() ok = true after clear")
	}
}

func TestServiceContextDelegatesUpdateCheckLifecycleToUpdateStore(t *testing.T) {
	ctx := NewServiceContext(config.Config{})
	now := time.Date(2026, 7, 6, 1, 45, 0, 0, time.UTC)
	ctx.UpdateStore = updatecheck.NewStoreWithClock(func() time.Time { return now })

	if !ctx.TryStartUpdateCheck(30 * time.Minute) {
		t.Fatalf("TryStartUpdateCheck() = false, want true")
	}
	running, last := ctx.UpdateCheckStatus()
	if !running || !last.Equal(now) {
		t.Fatalf("UpdateCheckStatus() = %v, %s; want running at %s", running, last, now)
	}
	if !ctx.UpdateCheckRunning || !ctx.UpdateCheckLast.Equal(now) {
		t.Fatalf("legacy lifecycle fields not synchronized")
	}
	if ctx.TryStartUpdateCheck(0) {
		t.Fatalf("TryStartUpdateCheck while running = true, want false")
	}

	ctx.FinishUpdateCheck()
	running, last = ctx.UpdateCheckStatus()
	if running || !last.Equal(now) {
		t.Fatalf("UpdateCheckStatus() after finish = %v, %s", running, last)
	}
	if ctx.IsUpdateCheckRunning() {
		t.Fatalf("IsUpdateCheckRunning() = true after finish")
	}
}
