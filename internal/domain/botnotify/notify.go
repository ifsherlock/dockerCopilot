// Package botnotify 提供与具体聊天渠道解耦的通知抽象。
//
// 后端调度器（更新检测、自动清理、自动更新）只产出结构化事件并广播，
// 各 Bot（Telegram / QQ）注册为 Notifier 后按各自渠道特性渲染并发送，
// 从而避免检测与推送逻辑在每个 Bot 里重复实现。
package botnotify

import (
	"context"
	"sync"
	"time"
)

// UpdatableItem 描述一个可更新的容器。
type UpdatableItem struct {
	Name  string
	Image string
}

// UpdatesEvent 表示某个实例上检测到的可更新容器集合。
// 事件只在“相比上次通知出现新增可更新项”时广播，避免重复刷屏。
type UpdatesEvent struct {
	Instance string
	Items    []UpdatableItem
	At       time.Time
}

// AutomationKind 标识自动化任务类型。
type AutomationKind string

const (
	KindCleanImages      AutomationKind = "clean_images"
	KindUpdateContainers AutomationKind = "update_containers"
	KindSelfUpdate       AutomationKind = "self_update"
)

// AutomationEvent 表示一次自动化任务的执行结果。
type AutomationEvent struct {
	Kind    AutomationKind
	OK      int
	Failed  int
	Details []string
	Err     string
	At      time.Time
}

// Notifier 由各 Bot 实现并注册。所有方法都应当是非阻塞或自带超时的，
// 广播方在独立 goroutine 中串行调用它们，一个渠道的慢/错不应影响其它渠道。
type Notifier interface {
	NotifyUpdates(ctx context.Context, evt UpdatesEvent)
	NotifyAutomation(ctx context.Context, evt AutomationEvent)
}

var (
	mu        sync.RWMutex
	notifiers = make(map[string]Notifier)
)

// Register 注册（或替换）一个命名的通知渠道。
func Register(name string, n Notifier) {
	if name == "" || n == nil {
		return
	}
	mu.Lock()
	defer mu.Unlock()
	notifiers[name] = n
}

// Unregister 注销一个通知渠道（Bot 停止时调用）。
func Unregister(name string) {
	mu.Lock()
	defer mu.Unlock()
	delete(notifiers, name)
}

func snapshot() []Notifier {
	mu.RLock()
	defer mu.RUnlock()
	out := make([]Notifier, 0, len(notifiers))
	for _, n := range notifiers {
		out = append(out, n)
	}
	return out
}

// HasNotifier 报告是否至少注册了一个渠道，供调度器决定是否需要构造通知内容。
func HasNotifier() bool {
	mu.RLock()
	defer mu.RUnlock()
	return len(notifiers) > 0
}

// BroadcastUpdates 向所有渠道广播“检测到可更新容器”事件。
func BroadcastUpdates(ctx context.Context, evt UpdatesEvent) {
	if len(evt.Items) == 0 {
		return
	}
	if evt.At.IsZero() {
		evt.At = time.Now()
	}
	for _, n := range snapshot() {
		func(n Notifier) {
			defer func() { _ = recover() }()
			n.NotifyUpdates(ctx, evt)
		}(n)
	}
}

// BroadcastAutomation 向所有渠道广播一次自动化任务结果。
func BroadcastAutomation(ctx context.Context, evt AutomationEvent) {
	if evt.At.IsZero() {
		evt.At = time.Now()
	}
	for _, n := range snapshot() {
		func(n Notifier) {
			defer func() { _ = recover() }()
			n.NotifyAutomation(ctx, evt)
		}(n)
	}
}
