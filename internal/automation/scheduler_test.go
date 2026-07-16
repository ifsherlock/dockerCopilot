package automation

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/onlyLTY/dockerCopilot/internal/domain/botnotify"
	"github.com/onlyLTY/dockerCopilot/internal/svc"
)

type recordingNotifier struct {
	updates    []botnotify.UpdatesEvent
	automation []botnotify.AutomationEvent
}

func (r *recordingNotifier) NotifyUpdates(_ context.Context, evt botnotify.UpdatesEvent) {
	r.updates = append(r.updates, evt)
}

func (r *recordingNotifier) NotifyAutomation(_ context.Context, evt botnotify.AutomationEvent) {
	r.automation = append(r.automation, evt)
}

func newTestScheduler(t *testing.T) *Scheduler {
	t.Helper()
	dir := t.TempDir()
	t.Setenv("DOCKERCOPILOT_LOG_DIR", dir)
	return &Scheduler{svcCtx: &svc.ServiceContext{}}
}

func candidates(pairs ...[2]string) []updateCandidate {
	out := make([]updateCandidate, 0, len(pairs))
	for _, p := range pairs {
		out = append(out, updateCandidate{
			Key:  instanceKey("local", p[0]+"@"+p[1]),
			Item: botnotify.UpdatableItem{Name: p[0], Image: p[1]},
		})
	}
	return out
}

func TestNotifyNewUpdatesDedup(t *testing.T) {
	s := newTestScheduler(t)
	rec := &recordingNotifier{}
	botnotify.Register("test", rec)
	t.Cleanup(func() { botnotify.Unregister("test") })

	ctx := context.Background()
	// 第一次：两个新项 → 通知一次
	s.notifyNewUpdates(ctx, map[string][]updateCandidate{
		"local": candidates([2]string{"app1", "img1"}, [2]string{"app2", "img2"}),
	})
	if len(rec.updates) != 1 || len(rec.updates[0].Items) != 2 {
		t.Fatalf("首次应通知 2 项，got %+v", rec.updates)
	}

	// 第二次相同集合 → 不再通知
	s.notifyNewUpdates(ctx, map[string][]updateCandidate{
		"local": candidates([2]string{"app1", "img1"}, [2]string{"app2", "img2"}),
	})
	if len(rec.updates) != 1 {
		t.Fatalf("重复集合不应再次通知，got %d 次", len(rec.updates))
	}

	// 新增一项 → 只通知新增项
	s.notifyNewUpdates(ctx, map[string][]updateCandidate{
		"local": candidates([2]string{"app1", "img1"}, [2]string{"app2", "img2"}, [2]string{"app3", "img3"}),
	})
	if len(rec.updates) != 2 || len(rec.updates[1].Items) != 1 || rec.updates[1].Items[0].Name != "app3" {
		t.Fatalf("应只通知新增项 app3，got %+v", rec.updates)
	}

	// app1 更新完成后消失，再次出现 → 重新通知
	s.notifyNewUpdates(ctx, map[string][]updateCandidate{
		"local": candidates([2]string{"app2", "img2"}, [2]string{"app3", "img3"}),
	})
	if len(rec.updates) != 2 {
		t.Fatalf("消失不应触发通知，got %d 次", len(rec.updates))
	}
	s.notifyNewUpdates(ctx, map[string][]updateCandidate{
		"local": candidates([2]string{"app1", "img1-new"}, [2]string{"app2", "img2"}, [2]string{"app3", "img3"}),
	})
	if len(rec.updates) != 3 || rec.updates[2].Items[0].Name != "app1" {
		t.Fatalf("重新出现的 app1 应再次通知，got %+v", rec.updates)
	}
}

func TestNotifyStatePersistsAcrossRestart(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("DOCKERCOPILOT_LOG_DIR", dir)
	rec := &recordingNotifier{}
	botnotify.Register("test", rec)
	t.Cleanup(func() { botnotify.Unregister("test") })
	ctx := context.Background()

	s1 := &Scheduler{svcCtx: &svc.ServiceContext{}}
	s1.notifyNewUpdates(ctx, map[string][]updateCandidate{
		"local": candidates([2]string{"app1", "img1"}),
	})
	if len(rec.updates) != 1 {
		t.Fatalf("首次应通知，got %d", len(rec.updates))
	}
	if _, err := os.Stat(filepath.Join(dir, "runtime", notifyStateFile)); err != nil {
		t.Fatalf("状态文件未持久化: %v", err)
	}

	// 模拟重启：新调度器加载持久化状态，同一集合不再通知
	s2 := &Scheduler{svcCtx: &svc.ServiceContext{}}
	s2.notifyNewUpdates(ctx, map[string][]updateCandidate{
		"local": candidates([2]string{"app1", "img1"}),
	})
	if len(rec.updates) != 1 {
		t.Fatalf("重启后同一集合不应重复通知，got %d 次", len(rec.updates))
	}
}

func TestNotifyKeepsOtherInstanceState(t *testing.T) {
	s := newTestScheduler(t)
	rec := &recordingNotifier{}
	botnotify.Register("test", rec)
	t.Cleanup(func() { botnotify.Unregister("test") })
	ctx := context.Background()

	// 远端实例 remote1 通知过一项
	s.notifyNewUpdates(ctx, map[string][]updateCandidate{
		"remote1": {{Key: instanceKey("remote1", "web@c1"), Item: botnotify.UpdatableItem{Name: "web"}}},
	})
	// 本轮只扫了 local（remote1 失败/未扫描），remote1 的记录必须保留
	s.notifyNewUpdates(ctx, map[string][]updateCandidate{
		"local": candidates([2]string{"app1", "img1"}),
	})
	// remote1 再次报同一项 → 不应重复通知
	s.notifyNewUpdates(ctx, map[string][]updateCandidate{
		"remote1": {{Key: instanceKey("remote1", "web@c1"), Item: botnotify.UpdatableItem{Name: "web"}}},
	})
	total := 0
	for _, evt := range rec.updates {
		total += len(evt.Items)
	}
	if total != 2 {
		t.Fatalf("应共通知 2 项（remote1/web + local/app1），got %d: %+v", total, rec.updates)
	}
}

func TestCronDisabled(t *testing.T) {
	for _, spec := range []string{"off", "OFF", "false", "no", "0", "none", "disabled"} {
		if !cronDisabled(spec) {
			t.Fatalf("%q 应视为关闭", spec)
		}
	}
	for _, spec := range []string{"0 18 * * *", "*/30 * * * *"} {
		if cronDisabled(spec) {
			t.Fatalf("%q 不应视为关闭", spec)
		}
	}
}
