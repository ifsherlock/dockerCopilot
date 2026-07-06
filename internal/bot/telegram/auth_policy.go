package telegram

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/onlyLTY/dockerCopilot/internal/svc"
	"github.com/zeromicro/go-zero/core/logx"
)

type telegramActionKind string

const (
	telegramActionRead  telegramActionKind = "read"
	telegramActionWrite telegramActionKind = "write"
)

type telegramAuthPolicy struct {
	allowedChats       map[int64]struct{}
	restricted         bool
	interactiveEnabled bool
}

func newTelegramAuthPolicyFromConfig(cfg svc.BackupRuntimeConfig) telegramAuthPolicy {
	return newTelegramAuthPolicy(
		svc.StringList(cfg.Telegram["chat_ids"]),
		svc.AsBool(cfg.Telegram["interactive_enabled"]),
	)
}

func newTelegramAuthPolicy(chatIDs []string, interactiveEnabled bool) telegramAuthPolicy {
	allowed := make(map[int64]struct{}, len(chatIDs))
	for _, raw := range chatIDs {
		id, err := strconv.ParseInt(strings.TrimSpace(raw), 10, 64)
		if err != nil {
			if strings.TrimSpace(raw) != "" {
				logx.Errorf("忽略无效 Telegram chat_id: %q err=%v", raw, err)
			}
			continue
		}
		allowed[id] = struct{}{}
	}
	return telegramAuthPolicy{
		allowedChats:       allowed,
		restricted:         len(allowed) > 0,
		interactiveEnabled: interactiveEnabled,
	}
}

func (p telegramAuthPolicy) logStartupState() {
	if !p.restricted {
		logx.Errorf("Telegram chat_ids 未配置，入站命令暂保持兼容开放；建议配置 chat_ids 限制可操作聊天")
	}
	if !p.interactiveEnabled {
		logx.Infof("Telegram 交互已禁用：只允许帮助和只读命令")
	}
}

func (p telegramAuthPolicy) authorize(chatID int64, kind telegramActionKind) error {
	if p.restricted {
		if _, ok := p.allowedChats[chatID]; !ok {
			return fmt.Errorf("此聊天未被授权使用 Docker Copilot Bot")
		}
	}
	if kind == telegramActionWrite && !p.interactiveEnabled {
		return fmt.Errorf("Telegram 交互操作当前已禁用")
	}
	return nil
}

func telegramCommandActionKind(command string) telegramActionKind {
	switch strings.ToLower(strings.TrimSpace(command)) {
	case "/start", "/help", "/status", "/version":
		return telegramActionRead
	default:
		return telegramActionWrite
	}
}

func telegramCallbackActionKind(action string) telegramActionKind {
	switch strings.ToLower(strings.TrimSpace(action)) {
	case "noop":
		return telegramActionRead
	default:
		return telegramActionWrite
	}
}
