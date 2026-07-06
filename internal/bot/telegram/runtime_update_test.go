package telegram

import (
	"context"
	"testing"
	"time"

	"github.com/onlyLTY/dockerCopilot/internal/config"
	"github.com/onlyLTY/dockerCopilot/internal/svc"
)

func TestWaitLocalUpdateCheckImmediateCompletion(t *testing.T) {
	r := &Runtime{svcCtx: svc.NewServiceContext(config.Config{})}

	if !r.waitLocalUpdateCheck(context.Background(), time.Second) {
		t.Fatal("waitLocalUpdateCheck() = false, want true when no check is running")
	}
}

func TestWaitLocalUpdateCheckTimesOutWhileBackgroundRunning(t *testing.T) {
	r := &Runtime{svcCtx: svc.NewServiceContext(config.Config{})}
	if !r.svcCtx.TryStartUpdateCheck(0) {
		t.Fatal("failed to start update check")
	}
	defer r.svcCtx.FinishUpdateCheck()

	started := time.Now()
	if r.waitLocalUpdateCheck(context.Background(), 20*time.Millisecond) {
		t.Fatal("waitLocalUpdateCheck() = true, want false while check is still running")
	}
	if elapsed := time.Since(started); elapsed < 20*time.Millisecond {
		t.Fatalf("wait returned too early: %s", elapsed)
	}
}

func TestWaitUpdatesProgressiveResultTimesOutWithoutConsumingResult(t *testing.T) {
	resultCh := make(chan updatesProgressiveResult, 1)
	last := time.Now().Add(-2 * time.Minute)

	started := time.Now()
	_, timedOut, running, cacheAge := waitUpdatesProgressiveResult(context.Background(), resultCh, 20*time.Millisecond, func() (bool, time.Time) {
		return true, last
	})
	if !timedOut {
		t.Fatal("timedOut = false, want true")
	}
	if !running {
		t.Fatal("running = false, want true")
	}
	if elapsed := time.Since(started); elapsed < 20*time.Millisecond {
		t.Fatalf("wait returned too early: %s", elapsed)
	}
	if cacheAge < time.Minute {
		t.Fatalf("cacheAge = %s, want at least one minute", cacheAge)
	}

	resultCh <- updatesProgressiveResult{updates: []containerView{{ID: "c1", Name: "web"}}}
	select {
	case got := <-resultCh:
		if len(got.updates) != 1 || got.updates[0].ID != "c1" {
			t.Fatalf("result after timeout = %#v, want buffered update", got.updates)
		}
	default:
		t.Fatal("result channel was consumed on timeout")
	}
}

func TestUpdatesSnapshotChangedDetectsDifferentFinalResult(t *testing.T) {
	cached := []containerView{{ID: "c1", Name: "web"}}
	latest := []containerView{{ID: "c1", Name: "web"}, {ID: "c2", Name: "db"}}

	if !updatesSnapshotChanged(cached, latest) {
		t.Fatal("updatesSnapshotChanged() = false, want true for changed result")
	}
	if prefix := finalUpdatesPrefix(cached, latest, true); prefix != "✅ 实时更新结果已返回，结果有变化\n\n" {
		t.Fatalf("finalUpdatesPrefix() = %q, want changed prefix", prefix)
	}
	if updatesSnapshotChanged(cached, []containerView{{ID: "c1", Name: "web"}}) {
		t.Fatal("updatesSnapshotChanged() = true, want false for same result")
	}
}
