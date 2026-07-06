package qqbot

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestTokenManagerCachesAndRefreshesToken(t *testing.T) {
	var calls int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if r.Method != http.MethodPost {
			t.Fatalf("method = %s, want POST", r.Method)
		}
		var body map[string]string
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatalf("decode request body: %v", err)
		}
		if body["appId"] != "appid" || body["clientSecret"] != "secret" {
			t.Fatalf("token request body = %#v", body)
		}
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"access_token": "token-1",
			"expires_in":   "3600",
		})
	}))
	defer server.Close()

	now := time.Unix(1000, 0)
	manager := NewTokenManager(Config{AppID: "appid", AppSecret: "secret", TokenURL: server.URL}, server.Client())
	manager.now = func() time.Time { return now }

	ctx := context.Background()
	got, err := manager.Token(ctx)
	if err != nil {
		t.Fatalf("Token() error = %v", err)
	}
	if got != "token-1" {
		t.Fatalf("Token() = %q, want token-1", got)
	}
	got, err = manager.Token(ctx)
	if err != nil {
		t.Fatalf("Token() cached error = %v", err)
	}
	if got != "token-1" || calls != 1 {
		t.Fatalf("cached token = %q calls=%d, want token-1 calls=1", got, calls)
	}

	now = now.Add(3590 * time.Second)
	_, err = manager.Token(ctx)
	if err != nil {
		t.Fatalf("Token() refresh error = %v", err)
	}
	if calls != 2 {
		t.Fatalf("calls after near-expiry token = %d, want 2", calls)
	}
}

func TestTokenManagerAcceptsAppAccessTokenField(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"app_access_token": "app-token",
			"expiresIn":        60,
		})
	}))
	defer server.Close()

	manager := NewTokenManager(Config{AppID: "appid", AppSecret: "secret", TokenURL: server.URL}, server.Client())
	got, err := manager.Token(context.Background())
	if err != nil {
		t.Fatalf("Token() error = %v", err)
	}
	if got != "app-token" {
		t.Fatalf("Token() = %q, want app-token", got)
	}
}
