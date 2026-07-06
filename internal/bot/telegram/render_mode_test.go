package telegram

import (
	"strings"
	"testing"

	"github.com/mymmrac/telego"
	"github.com/onlyLTY/dockerCopilot/internal/svc"
)

func TestRenderEscapesHTMLAndMarkdownV2(t *testing.T) {
	raw := `<tag> _*[x](y)`

	htmlRenderer := newTelegramRenderer(telego.ModeHTML, false)
	if got := htmlRenderer.Escape(raw); got != "&lt;tag&gt; _*[x](y)" {
		t.Fatalf("HTML Escape() = %q", got)
	}
	if got := htmlRenderer.Bold(raw); got != "<b>&lt;tag&gt; _*[x](y)</b>" {
		t.Fatalf("HTML Bold() = %q", got)
	}

	mdRenderer := newTelegramRenderer(telego.ModeMarkdownV2, true)
	got := mdRenderer.Escape(raw)
	for _, want := range []string{`\\<`, `\\>`, `\\_`, `\\*`, `\\[`, `\\]`, `\\(`, `\\)`} {
		if !strings.Contains(got, want[1:]) {
			t.Fatalf("MarkdownV2 Escape() = %q, want escaped token %s", got, want)
		}
	}
	if strings.Contains(got, "<tag>") || strings.Contains(got, "_*") {
		t.Fatalf("MarkdownV2 Escape() leaked raw markup chars: %q", got)
	}
}

func TestParseModeFromConfig(t *testing.T) {
	cfg := svc.BackupRuntimeConfig{Telegram: map[string]interface{}{
		"parse_mode":                "markdown_v2",
		"rich_interactions_enabled": true,
	}}
	renderer := newTelegramRendererFromConfig(cfg)
	if renderer.ParseMode() != telego.ModeMarkdownV2 {
		t.Fatalf("ParseMode() = %q, want MarkdownV2", renderer.ParseMode())
	}
	if !renderer.rich {
		t.Fatal("renderer.rich = false, want true")
	}

	r := &Runtime{renderer: renderer}
	if got := r.telegramParseMode(); got != telego.ModeMarkdownV2 {
		t.Fatalf("telegramParseMode() = %q, want MarkdownV2", got)
	}
}

func TestParseModeDefaultsToHTML(t *testing.T) {
	renderer := newTelegramRenderer("unknown", false)
	if got := renderer.ParseMode(); got != telego.ModeHTML {
		t.Fatalf("ParseMode() = %q, want HTML", got)
	}
}
