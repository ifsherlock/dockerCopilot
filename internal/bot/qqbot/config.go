package qqbot

import (
	"net/http"
	"strings"
	"time"

	"github.com/onlyLTY/dockerCopilot/internal/svc"
)

const (
	DefaultBaseURL  = "https://api.sgroup.qq.com"
	DefaultTokenURL = "https://bots.qq.com/app/getAppAccessToken"
)

type Config struct {
	Enabled         bool
	AppID           string
	AppSecret       string
	Sandbox         bool
	EventMode       string
	MarkdownEnabled bool
	ButtonsEnabled  bool
	BaseURL         string
	TokenURL        string
}

func ConfigFromRuntime(cfg svc.BackupRuntimeConfig) Config {
	qq := cfg.QQBot
	return Config{
		Enabled:         svc.AsBool(qq["enabled"]),
		AppID:           strings.TrimSpace(svc.AsString(qq["app_id"], "")),
		AppSecret:       strings.TrimSpace(svc.AsString(qq["app_secret"], "")),
		Sandbox:         svc.AsBool(qq["sandbox"]),
		EventMode:       normalizeEventMode(svc.AsString(qq["event_mode"], "gateway")),
		MarkdownEnabled: svc.AsBool(qq["markdown_enabled"]),
		ButtonsEnabled:  svc.AsBool(qq["buttons_enabled"]),
		BaseURL:         DefaultBaseURL,
		TokenURL:        DefaultTokenURL,
	}
}

func (c Config) Normalized() Config {
	c.AppID = strings.TrimSpace(c.AppID)
	c.AppSecret = strings.TrimSpace(c.AppSecret)
	c.EventMode = normalizeEventMode(c.EventMode)
	if strings.TrimSpace(c.BaseURL) == "" {
		c.BaseURL = DefaultBaseURL
	}
	c.BaseURL = strings.TrimRight(c.BaseURL, "/")
	if strings.TrimSpace(c.TokenURL) == "" {
		c.TokenURL = DefaultTokenURL
	}
	if c.TokenRefreshSkew() <= 0 {
		return c
	}
	return c
}

func (c Config) TokenRefreshSkew() time.Duration {
	return 2 * time.Minute
}

func normalizeEventMode(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "", "gateway":
		return "gateway"
	case "webhook":
		return "webhook"
	default:
		return "gateway"
	}
}

func defaultHTTPClient() *http.Client {
	return &http.Client{Timeout: 20 * time.Second}
}
