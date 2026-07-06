package telegram

import (
	"context"
	"strings"
	"testing"

	"github.com/mymmrac/telego"
	"github.com/onlyLTY/dockerCopilot/internal/domain/runtimeconfig"
)

func TestHomeMenuRichModeHasInlineButtons(t *testing.T) {
	cfg := runtimeconfig.Default("secret")
	cfg.Telegram["rich_interactions_enabled"] = true
	cfg.Telegram["parse_mode"] = "HTML"
	writeTelegramRuntimeConfigForTest(t, cfg)
	r := &Runtime{renderer: newTelegramRenderer("HTML", true)}

	text, markup := r.homeMenu()
	if !strings.Contains(text, "Docker Copilot Bot") {
		t.Fatalf("home text = %q, want title", text)
	}
	data := collectCallbackData(markup)
	for _, want := range []string{
		"status_menu:",
		"containers_page:0",
		"updates_refresh:",
		"images_refresh:",
		"backups_refresh:",
		"instances_menu:",
		"settings_menu:",
		"help_menu:",
	} {
		if !containsString(data, want) {
			t.Fatalf("home menu callbacks = %#v, want %q", data, want)
		}
	}
}

func TestHelpTextRemainsCompatible(t *testing.T) {
	r := &Runtime{}
	text := r.helpText()
	for _, want := range []string{"/containers", "/updates", "/settings", "/help"} {
		if !strings.Contains(text, want) {
			t.Fatalf("helpText() missing %q in %s", want, text)
		}
	}
}

func TestHomeMenuMarkdownUsesConfiguredRenderer(t *testing.T) {
	cfg := runtimeconfig.Default("secret")
	cfg.Telegram["rich_interactions_enabled"] = true
	cfg.Telegram["parse_mode"] = "MarkdownV2"
	writeTelegramRuntimeConfigForTest(t, cfg)
	r := &Runtime{renderer: newTelegramRenderer("MarkdownV2", true)}
	text, _ := r.homeMenu()
	if !strings.Contains(text, "*Docker Copilot Bot*") {
		t.Fatalf("markdown home text = %q, want MarkdownV2 bold title", text)
	}
}

func TestHomeMenuUsesUpdatedRuntimeRenderer(t *testing.T) {
	cfg := runtimeconfig.Default("secret")
	cfg.Telegram["rich_interactions_enabled"] = true
	cfg.Telegram["parse_mode"] = "MarkdownV2"
	writeTelegramRuntimeConfigForTest(t, cfg)

	r := &Runtime{renderer: newTelegramRenderer("HTML", false)}
	text, markup := r.homeMenu()
	if !strings.Contains(text, "*Docker Copilot Bot*") {
		t.Fatalf("home text = %q, want MarkdownV2 title from updated runtime config", text)
	}
	if markup == nil || len(collectCallbackData(markup)) == 0 {
		t.Fatalf("home markup = %#v, want rich menu from updated runtime config", markup)
	}
}

func TestCancelCallbackEditsCurrentMessageBackToHome(t *testing.T) {
	r, calls := newAuthPolicyTestRuntime(t, newTelegramAuthPolicy([]string{"12345"}, true))
	r.chatState[12345] = userState{Action: "edit_cron", MessageID: 10}

	r.handleCallback(context.Background(), &telego.CallbackQuery{
		ID:      "callback-1",
		Message: &telego.Message{Chat: telego.Chat{ID: 12345}, MessageID: 10},
		Data:    "cancel:",
	})

	gotMethods := strings.Join(calls.methods, ",")
	if gotMethods != "answerCallbackQuery,editMessageText" {
		t.Fatalf("methods = %s, want answerCallbackQuery,editMessageText", gotMethods)
	}
	if _, ok := r.chatState[12345]; ok {
		t.Fatal("chatState still exists after cancel")
	}
	if !strings.Contains(calls.payloads[1], "Docker Copilot Bot") {
		t.Fatalf("edit payload = %s, want home menu", calls.payloads[1])
	}
}

func TestCancelCommandEditsStatefulPanelBackToSettings(t *testing.T) {
	r, calls := newAuthPolicyTestRuntime(t, newTelegramAuthPolicy([]string{"12345"}, true))
	r.chatState[12345] = userState{Action: "edit_cron", Extra: "update_check", MessageID: 10}

	r.handleMessage(context.Background(), &telego.Message{
		Chat: telego.Chat{ID: 12345},
		Text: "/cancel",
	})

	gotMethods := strings.Join(calls.methods, ",")
	if gotMethods != "editMessageText" {
		t.Fatalf("methods = %s, want editMessageText", gotMethods)
	}
	if _, ok := r.chatState[12345]; ok {
		t.Fatal("chatState still exists after /cancel")
	}
	if !strings.Contains(calls.payloads[0], "定时任务配置") {
		t.Fatalf("edit payload = %s, want settings menu", calls.payloads[0])
	}
}

func TestCancelTextInputEditsOriginalPanelBackToSettings(t *testing.T) {
	r, calls := newAuthPolicyTestRuntime(t, newTelegramAuthPolicy([]string{"12345"}, true))
	r.chatState[12345] = userState{Action: "edit_text", Extra: "backup_max_files", MessageID: 10}

	r.handleMessage(context.Background(), &telego.Message{
		Chat: telego.Chat{ID: 12345},
		Text: "/cancel",
	})

	gotMethods := strings.Join(calls.methods, ",")
	if gotMethods != "editMessageText" {
		t.Fatalf("methods = %s, want editMessageText", gotMethods)
	}
	if !strings.Contains(calls.payloads[0], "定时任务配置") {
		t.Fatalf("edit payload = %s, want settings menu", calls.payloads[0])
	}
}

func TestHelpCallbackUsesHomeButtonInsteadOfUpdateRefresh(t *testing.T) {
	r, calls := newAuthPolicyTestRuntime(t, newTelegramAuthPolicy([]string{"12345"}, true))

	r.handleCallback(context.Background(), &telego.CallbackQuery{
		ID:      "callback-1",
		Message: &telego.Message{Chat: telego.Chat{ID: 12345}, MessageID: 10},
		Data:    "help_menu:",
	})

	gotMethods := strings.Join(calls.methods, ",")
	if gotMethods != "answerCallbackQuery,editMessageText" {
		t.Fatalf("methods = %s, want answerCallbackQuery,editMessageText", gotMethods)
	}
	payload := calls.payloads[1]
	if !strings.Contains(payload, "Docker Copilot Bot 帮助") || !strings.Contains(payload, "home_menu:") {
		t.Fatalf("help payload = %s, want help text with home button", payload)
	}
	if strings.Contains(payload, "updates_refresh:") {
		t.Fatalf("help payload = %s, should not contain update refresh callback", payload)
	}
}

func TestContainersCloseEditsCurrentMessageBackToHome(t *testing.T) {
	r, calls := newAuthPolicyTestRuntime(t, newTelegramAuthPolicy([]string{"12345"}, true))

	r.handleCallback(context.Background(), &telego.CallbackQuery{
		ID:      "callback-1",
		Message: &telego.Message{Chat: telego.Chat{ID: 12345}, MessageID: 10},
		Data:    "containers_close:",
	})

	gotMethods := strings.Join(calls.methods, ",")
	if gotMethods != "answerCallbackQuery,editMessageText" {
		t.Fatalf("methods = %s, want answerCallbackQuery,editMessageText", gotMethods)
	}
	payload := calls.payloads[1]
	if !strings.Contains(payload, "Docker Copilot Bot") {
		t.Fatalf("edit payload = %s, want home menu", payload)
	}
	if strings.Contains(payload, "已退出容器菜单") {
		t.Fatalf("edit payload = %s, should not leave a dead exit message", payload)
	}
}
