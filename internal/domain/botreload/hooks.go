package botreload

import (
	"context"
	"sync"
)

var (
	mu               sync.RWMutex
	qqBotReloader    func(context.Context) error
	telegramReloader func(context.Context) error
)

func RegisterQQBotReloader(fn func(context.Context) error) {
	mu.Lock()
	defer mu.Unlock()
	qqBotReloader = fn
}

func ReloadQQBot(ctx context.Context) error {
	mu.RLock()
	fn := qqBotReloader
	mu.RUnlock()
	if fn == nil {
		return nil
	}
	return fn(ctx)
}

func RegisterTelegramReloader(fn func(context.Context) error) {
	mu.Lock()
	defer mu.Unlock()
	telegramReloader = fn
}

func ReloadTelegram(ctx context.Context) error {
	mu.RLock()
	fn := telegramReloader
	mu.RUnlock()
	if fn == nil {
		return nil
	}
	return fn(ctx)
}
