package telegram

import (
	"context"
	"strings"
	"testing"

	"github.com/mymmrac/telego"
	ta "github.com/mymmrac/telego/telegoapi"
)

func TestTelegramAuthPolicyAllowsConfiguredChat(t *testing.T) {
	policy := newTelegramAuthPolicy([]string{"12345"}, true)

	if err := policy.authorize(12345, telegramActionWrite); err != nil {
		t.Fatalf("authorize allowed chat = %v, want nil", err)
	}
}

func TestTelegramAuthPolicyRejectsUnlistedChat(t *testing.T) {
	policy := newTelegramAuthPolicy([]string{"12345"}, true)

	if err := policy.authorize(67890, telegramActionWrite); err == nil {
		t.Fatal("authorize unlisted chat = nil, want error")
	}
}

func TestTelegramAuthPolicyKeepsEmptyChatListCompatible(t *testing.T) {
	policy := newTelegramAuthPolicy(nil, true)

	if err := policy.authorize(67890, telegramActionWrite); err != nil {
		t.Fatalf("authorize unrestricted chat = %v, want nil", err)
	}
}

func TestTelegramAuthPolicyBlocksWritesWhenInteractiveDisabled(t *testing.T) {
	policy := newTelegramAuthPolicy([]string{"12345"}, false)

	if err := policy.authorize(12345, telegramActionWrite); err == nil {
		t.Fatal("authorize write while disabled = nil, want error")
	}
	if err := policy.authorize(12345, telegramActionRead); err != nil {
		t.Fatalf("authorize read while disabled = %v, want nil", err)
	}
}

func TestTelegramCommandActionKind(t *testing.T) {
	for _, command := range []string{"/start", "/help", "/status", "/version"} {
		if got := telegramCommandActionKind(command); got != telegramActionRead {
			t.Fatalf("telegramCommandActionKind(%q) = %s, want read", command, got)
		}
	}
	for _, command := range []string{"/containers", "/updates", "/settings", "/backup"} {
		if got := telegramCommandActionKind(command); got != telegramActionWrite {
			t.Fatalf("telegramCommandActionKind(%q) = %s, want write", command, got)
		}
	}
}

func TestTelegramCallbackActionKind(t *testing.T) {
	if got := telegramCallbackActionKind("noop"); got != telegramActionRead {
		t.Fatalf("telegramCallbackActionKind(noop) = %s, want read", got)
	}
	for _, action := range []string{"update", "updates_update_all", "container_stop", "settings_toggle"} {
		if got := telegramCallbackActionKind(action); got != telegramActionWrite {
			t.Fatalf("telegramCallbackActionKind(%q) = %s, want write", action, got)
		}
	}
}

func TestHandleMessageRejectsUnlistedChatBeforeCommandDispatch(t *testing.T) {
	r, calls := newAuthPolicyTestRuntime(t, newTelegramAuthPolicy([]string{"12345"}, true))

	r.handleMessage(context.Background(), &telego.Message{
		Chat: telego.Chat{ID: 67890},
		Text: "/containers",
	})

	if len(calls.methods) != 1 || calls.methods[0] != "sendMessage" {
		t.Fatalf("methods = %#v, want only sendMessage denial", calls.methods)
	}
	if !strings.Contains(calls.payloads[0], "未被授权") {
		t.Fatalf("denial payload = %s, want unauthorized text", calls.payloads[0])
	}
}

func TestHandleMessageAllowsConfiguredChatPastAuth(t *testing.T) {
	r, calls := newAuthPolicyTestRuntime(t, newTelegramAuthPolicy([]string{"12345"}, true))

	r.handleMessage(context.Background(), &telego.Message{
		Chat: telego.Chat{ID: 12345},
		Text: "/help",
	})

	if len(calls.methods) != 1 || calls.methods[0] != "sendMessage" {
		t.Fatalf("methods = %#v, want sendMessage help response", calls.methods)
	}
	if strings.Contains(calls.payloads[0], "未被授权") {
		t.Fatalf("payload = %s, did not expect denial", calls.payloads[0])
	}
}

func TestHandleMessageBlocksWriteWhenInteractiveDisabled(t *testing.T) {
	r, calls := newAuthPolicyTestRuntime(t, newTelegramAuthPolicy([]string{"12345"}, false))

	r.handleMessage(context.Background(), &telego.Message{
		Chat: telego.Chat{ID: 12345},
		Text: "/updates",
	})

	if len(calls.methods) != 1 || calls.methods[0] != "sendMessage" {
		t.Fatalf("methods = %#v, want only sendMessage disabled response", calls.methods)
	}
	if !strings.Contains(calls.payloads[0], "交互操作当前已禁用") {
		t.Fatalf("payload = %s, want disabled text", calls.payloads[0])
	}
}

func TestHandleCallbackRejectsUnlistedChatBeforeUpdateAction(t *testing.T) {
	r, calls := newAuthPolicyTestRuntime(t, newTelegramAuthPolicy([]string{"12345"}, true))

	r.handleCallback(context.Background(), &telego.CallbackQuery{
		ID:      "callback-1",
		Message: &telego.Message{Chat: telego.Chat{ID: 67890}, MessageID: 10},
		Data:    "update_pick:abc123",
	})

	if len(calls.methods) != 1 {
		t.Fatalf("methods = %#v, want only denial ACK", calls.methods)
	}
	if calls.methods[0] != "answerCallbackQuery" {
		t.Fatalf("methods = %#v, want callback answer only", calls.methods)
	}
	if strings.Contains(strings.Join(calls.methods, ","), "sendMessage") {
		t.Fatalf("methods = %#v, update action should not send messages", calls.methods)
	}
	if !strings.Contains(calls.payloads[0], "未被授权") {
		t.Fatalf("denial payload = %s, want unauthorized callback text", calls.payloads[0])
	}
}

type authPolicyTestCaller struct {
	methods  []string
	payloads []string
}

func (c *authPolicyTestCaller) Call(_ context.Context, url string, data *ta.RequestData) (*ta.Response, error) {
	method := url[strings.LastIndex(url, "/")+1:]
	c.methods = append(c.methods, method)
	if data != nil && data.Buffer != nil {
		c.payloads = append(c.payloads, data.Buffer.String())
	} else {
		c.payloads = append(c.payloads, "")
	}
	result := []byte(`true`)
	if method == "sendMessage" {
		result = []byte(`{"message_id":1,"date":1,"chat":{"id":1,"type":"private"},"text":"ok"}`)
	}
	return &ta.Response{Ok: true, Result: result}, nil
}

func newAuthPolicyTestRuntime(t *testing.T, policy telegramAuthPolicy) (*Runtime, *authPolicyTestCaller) {
	t.Helper()
	caller := &authPolicyTestCaller{}
	bot, err := telego.NewBot("123456:abcdefghijklmnopqrstuvwxyzABCDEFGHI", telego.WithAPICaller(caller))
	if err != nil {
		t.Fatalf("NewBot() error = %v", err)
	}
	return &Runtime{
		bot:          bot,
		chatInstance: map[int64]string{},
		chatState:    map[int64]userState{},
		authPolicy:   policy,
	}, caller
}
