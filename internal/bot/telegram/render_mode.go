package telegram

import (
	"html"
	"strings"

	"github.com/mymmrac/telego"
	"github.com/onlyLTY/dockerCopilot/internal/svc"
)

type telegramRenderer struct {
	parseMode string
	rich      bool
}

func newTelegramRendererFromConfig(cfg svc.BackupRuntimeConfig) telegramRenderer {
	return newTelegramRenderer(
		svc.AsString(cfg.Telegram["parse_mode"], telego.ModeHTML),
		svc.AsBool(cfg.Telegram["rich_interactions_enabled"]),
	)
}

func newTelegramRenderer(parseMode string, rich bool) telegramRenderer {
	switch strings.ToUpper(strings.TrimSpace(parseMode)) {
	case strings.ToUpper(telego.ModeMarkdownV2), "MARKDOWN_V2", "MARKDOWN-V2":
		return telegramRenderer{parseMode: telego.ModeMarkdownV2, rich: rich}
	default:
		return telegramRenderer{parseMode: telego.ModeHTML, rich: rich}
	}
}

func (r telegramRenderer) ParseMode() string {
	if r.parseMode == "" {
		return telego.ModeHTML
	}
	return r.parseMode
}

func (r telegramRenderer) RichEnabled() bool {
	return r.rich
}

func (r telegramRenderer) Escape(text string) string {
	if r.ParseMode() == telego.ModeMarkdownV2 {
		return escapeMarkdownV2(text)
	}
	return html.EscapeString(text)
}

func (r telegramRenderer) Bold(text string) string {
	if r.ParseMode() == telego.ModeMarkdownV2 {
		return "*" + r.Escape(text) + "*"
	}
	return "<b>" + r.Escape(text) + "</b>"
}

func (r telegramRenderer) Italic(text string) string {
	if r.ParseMode() == telego.ModeMarkdownV2 {
		return "_" + r.Escape(text) + "_"
	}
	return "<i>" + r.Escape(text) + "</i>"
}

func (r telegramRenderer) Code(text string) string {
	if r.ParseMode() == telego.ModeMarkdownV2 {
		return "`" + strings.ReplaceAll(r.Escape(text), "`", "\\`") + "`"
	}
	return "<code>" + r.Escape(text) + "</code>"
}

func escapeMarkdownV2(text string) string {
	replacer := strings.NewReplacer(
		"_", "\\_",
		"*", "\\*",
		"[", "\\[",
		"]", "\\]",
		"(", "\\(",
		")", "\\)",
		"~", "\\~",
		"`", "\\`",
		">", "\\>",
		"#", "\\#",
		"+", "\\+",
		"-", "\\-",
		"=", "\\=",
		"|", "\\|",
		"{", "\\{",
		"}", "\\}",
		".", "\\.",
		"!", "\\!",
		"<", "\\<",
	)
	return replacer.Replace(text)
}
