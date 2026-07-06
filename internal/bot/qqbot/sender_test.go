package qqbot

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

type fakeTokenProvider struct {
	tokenCalls   int
	refreshCalls int
	token        string
	refreshToken string
}

func (p *fakeTokenProvider) Token(ctx context.Context) (string, error) {
	p.tokenCalls++
	return p.token, nil
}

func (p *fakeTokenProvider) ForceRefresh(ctx context.Context) (string, error) {
	p.refreshCalls++
	return p.refreshToken, nil
}

func TestSenderSendsC2CAndGroupMessages(t *testing.T) {
	var paths []string
	var auths []string
	var payloads []map[string]interface{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		paths = append(paths, r.URL.EscapedPath())
		auths = append(auths, r.Header.Get("Authorization"))
		var payload map[string]interface{}
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatalf("decode payload: %v", err)
		}
		payloads = append(payloads, payload)
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"id":"message-id"}`))
	}))
	defer server.Close()

	tokens := &fakeTokenProvider{token: "token-1", refreshToken: "token-2"}
	sender := NewSender(Config{BaseURL: server.URL}, server.Client(), tokens)
	ctx := context.Background()
	if err := sender.SendC2C(ctx, "user/open", Message{Text: "hello", MsgID: "source"}); err != nil {
		t.Fatalf("SendC2C() error = %v", err)
	}
	if err := sender.SendGroup(ctx, "group/open", Message{Text: "group hello"}); err != nil {
		t.Fatalf("SendGroup() error = %v", err)
	}

	if strings.Join(paths, ",") != "/v2/users/user%2Fopen/messages,/v2/groups/group%2Fopen/messages" {
		t.Fatalf("paths = %#v", paths)
	}
	if auths[0] != "QQBot token-1" || auths[1] != "QQBot token-1" {
		t.Fatalf("auth headers = %#v", auths)
	}
	if payloads[0]["content"] != "hello" || payloads[0]["msg_id"] != "source" || payloads[0]["msg_type"].(float64) != 0 {
		t.Fatalf("c2c payload = %#v", payloads[0])
	}
	if payloads[1]["content"] != "group hello" || payloads[1]["msg_type"].(float64) != 0 {
		t.Fatalf("group payload = %#v", payloads[1])
	}
	if tokens.tokenCalls != 2 || tokens.refreshCalls != 0 {
		t.Fatalf("token calls=%d refresh=%d, want 2/0", tokens.tokenCalls, tokens.refreshCalls)
	}
}

func TestSenderRefreshesTokenOnUnauthorized(t *testing.T) {
	var auths []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		auths = append(auths, r.Header.Get("Authorization"))
		if len(auths) == 1 {
			w.WriteHeader(http.StatusUnauthorized)
			_, _ = w.Write([]byte(`{"message":"invalid token"}`))
			return
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	tokens := &fakeTokenProvider{token: "old-token", refreshToken: "new-token"}
	sender := NewSender(Config{BaseURL: server.URL}, server.Client(), tokens)
	if err := sender.SendC2C(context.Background(), "user-1", Message{Text: "hello"}); err != nil {
		t.Fatalf("SendC2C() error = %v", err)
	}
	if strings.Join(auths, ",") != "QQBot old-token,QQBot new-token" {
		t.Fatalf("auths = %#v", auths)
	}
	if tokens.tokenCalls != 1 || tokens.refreshCalls != 1 {
		t.Fatalf("token calls=%d refresh=%d, want 1/1", tokens.tokenCalls, tokens.refreshCalls)
	}
}

func TestSenderSendsMarkdownAndKeyboardWhenEnabled(t *testing.T) {
	var payload map[string]interface{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatalf("decode payload: %v", err)
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	tokens := &fakeTokenProvider{token: "token"}
	sender := NewSender(Config{BaseURL: server.URL, MarkdownEnabled: true, ButtonsEnabled: true}, server.Client(), tokens)
	err := sender.SendGroup(context.Background(), "group-1", Message{
		Text: "fallback",
		Markdown: &Markdown{
			CustomTemplateID: "tpl",
			Params:           []MarkdownParam{{Key: "name", Values: []string{"DockerCopilot"}}},
		},
		Keyboard: &Keyboard{ID: "keyboard-id"},
	})
	if err != nil {
		t.Fatalf("SendGroup() error = %v", err)
	}
	if payload["msg_type"].(float64) != 2 {
		t.Fatalf("msg_type = %#v, want 2", payload["msg_type"])
	}
	if payload["markdown"] == nil || payload["keyboard"] == nil {
		t.Fatalf("payload missing markdown or keyboard: %#v", payload)
	}
}

func TestSenderFallsBackToTextWhenRichMessageForbidden(t *testing.T) {
	var payloads []map[string]interface{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var payload map[string]interface{}
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatalf("decode payload: %v", err)
		}
		payloads = append(payloads, payload)
		if len(payloads) == 1 {
			w.WriteHeader(http.StatusForbidden)
			_, _ = w.Write([]byte(`{"message":"markdown permission denied"}`))
			return
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	tokens := &fakeTokenProvider{token: "token"}
	sender := NewSender(Config{BaseURL: server.URL, MarkdownEnabled: true, ButtonsEnabled: true}, server.Client(), tokens)
	err := sender.SendC2C(context.Background(), "user-1", Message{
		Text:     "fallback text",
		Markdown: &Markdown{Content: "markdown text"},
		Keyboard: &Keyboard{ID: "keyboard-id"},
	})
	if err != nil {
		t.Fatalf("SendC2C() error = %v", err)
	}
	if len(payloads) != 2 {
		t.Fatalf("payload count = %d, want 2", len(payloads))
	}
	if payloads[0]["msg_type"].(float64) != 2 || payloads[1]["msg_type"].(float64) != 0 {
		t.Fatalf("payloads = %#v", payloads)
	}
	if _, ok := payloads[1]["markdown"]; ok {
		t.Fatalf("fallback payload still has markdown: %#v", payloads[1])
	}
}
