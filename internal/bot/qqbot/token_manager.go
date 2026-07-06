package qqbot

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"
)

type TokenManager struct {
	cfg    Config
	client *http.Client
	now    func() time.Time

	mu          sync.Mutex
	cachedToken string
	expire      time.Time
}

func NewTokenManager(cfg Config, client *http.Client) *TokenManager {
	if client == nil {
		client = defaultHTTPClient()
	}
	return &TokenManager{
		cfg:    cfg.Normalized(),
		client: client,
		now:    time.Now,
	}
}

func (m *TokenManager) Token(ctx context.Context) (string, error) {
	return m.token(ctx, false)
}

func (m *TokenManager) ForceRefresh(ctx context.Context) (string, error) {
	return m.token(ctx, true)
}

func (m *TokenManager) token(ctx context.Context, force bool) (string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if !force && m.cachedToken != "" && m.now().Add(m.cfg.TokenRefreshSkew()).Before(m.expire) {
		return m.cachedToken, nil
	}
	token, expire, err := m.fetch(ctx)
	if err != nil {
		return "", err
	}
	m.cachedToken = token
	m.expire = expire
	return token, nil
}

func (m *TokenManager) fetch(ctx context.Context) (string, time.Time, error) {
	if m.cfg.AppID == "" || m.cfg.AppSecret == "" {
		return "", time.Time{}, fmt.Errorf("QQBot app_id 或 app_secret 未配置")
	}
	body, err := json.Marshal(map[string]string{
		"appId":        m.cfg.AppID,
		"clientSecret": m.cfg.AppSecret,
	})
	if err != nil {
		return "", time.Time{}, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, m.cfg.TokenURL, bytes.NewReader(body))
	if err != nil {
		return "", time.Time{}, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := m.client.Do(req)
	if err != nil {
		return "", time.Time{}, fmt.Errorf("获取 QQBot access token 失败: %w", err)
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", time.Time{}, fmt.Errorf("获取 QQBot access token 失败: status=%d body=%s", resp.StatusCode, strings.TrimSpace(string(respBody)))
	}

	var payload struct {
		AccessToken    string          `json:"access_token"`
		AppAccessToken string          `json:"app_access_token"`
		ExpiresIn      json.RawMessage `json:"expires_in"`
		ExpiresInAlt   json.RawMessage `json:"expiresIn"`
	}
	if err := json.Unmarshal(respBody, &payload); err != nil {
		return "", time.Time{}, fmt.Errorf("解析 QQBot access token 响应失败: %w", err)
	}
	token := strings.TrimSpace(payload.AccessToken)
	if token == "" {
		token = strings.TrimSpace(payload.AppAccessToken)
	}
	if token == "" {
		return "", time.Time{}, fmt.Errorf("QQBot access token 响应缺少 access_token")
	}
	expiresIn := parseExpiresIn(payload.ExpiresIn)
	if expiresIn <= 0 {
		expiresIn = parseExpiresIn(payload.ExpiresInAlt)
	}
	if expiresIn <= 0 {
		expiresIn = 7200
	}
	return token, m.now().Add(time.Duration(expiresIn) * time.Second), nil
}

func parseExpiresIn(raw json.RawMessage) int64 {
	if len(raw) == 0 {
		return 0
	}
	var n int64
	if err := json.Unmarshal(raw, &n); err == nil {
		return n
	}
	var s string
	if err := json.Unmarshal(raw, &s); err == nil {
		var parsed int64
		if _, err := fmt.Sscanf(strings.TrimSpace(s), "%d", &parsed); err == nil {
			return parsed
		}
	}
	return 0
}
