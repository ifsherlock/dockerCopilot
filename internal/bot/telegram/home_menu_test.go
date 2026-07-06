package telegram

import (
	"strings"
	"testing"
)

func TestHomeMenuRichModeHasInlineButtons(t *testing.T) {
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
	r := &Runtime{renderer: newTelegramRenderer("MarkdownV2", true)}
	text, _ := r.homeMenu()
	if !strings.Contains(text, "*Docker Copilot Bot*") {
		t.Fatalf("markdown home text = %q, want MarkdownV2 bold title", text)
	}
}
