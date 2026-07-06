package qqbot

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"

	"github.com/zeromicro/go-zero/core/logx"
)

type tokenProvider interface {
	Token(ctx context.Context) (string, error)
	ForceRefresh(ctx context.Context) (string, error)
}

type Sender struct {
	cfg    Config
	client *http.Client
	tokens tokenProvider
}

type Message struct {
	Text     string
	MsgID    string
	Markdown *Markdown
	Keyboard *Keyboard
}

type Markdown struct {
	CustomTemplateID string                 `json:"custom_template_id,omitempty"`
	Params           []MarkdownParam        `json:"params,omitempty"`
	Content          string                 `json:"content,omitempty"`
	Raw              map[string]interface{} `json:"-"`
}

type MarkdownParam struct {
	Key    string   `json:"key"`
	Values []string `json:"values"`
}

type Keyboard struct {
	ID      string                 `json:"id,omitempty"`
	Content map[string]interface{} `json:"content,omitempty"`
	Raw     map[string]interface{} `json:"-"`
}

func NewSender(cfg Config, client *http.Client, tokens tokenProvider) *Sender {
	if client == nil {
		client = defaultHTTPClient()
	}
	normalized := cfg.Normalized()
	if tokens == nil {
		tokens = NewTokenManager(normalized, client)
	}
	return &Sender{cfg: normalized, client: client, tokens: tokens}
}

func (s *Sender) SendC2C(ctx context.Context, openID string, msg Message) error {
	openID = strings.TrimSpace(openID)
	if openID == "" {
		return fmt.Errorf("QQBot C2C openid 不能为空")
	}
	return s.send(ctx, fmt.Sprintf("/v2/users/%s/messages", url.PathEscape(openID)), msg)
}

func (s *Sender) SendGroup(ctx context.Context, groupOpenID string, msg Message) error {
	groupOpenID = strings.TrimSpace(groupOpenID)
	if groupOpenID == "" {
		return fmt.Errorf("QQBot group_openid 不能为空")
	}
	return s.send(ctx, fmt.Sprintf("/v2/groups/%s/messages", url.PathEscape(groupOpenID)), msg)
}

func (s *Sender) send(ctx context.Context, path string, msg Message) error {
	if err := s.sendOnceWithToken(ctx, path, msg, false); err == nil {
		return nil
	} else if !isUnauthorizedErr(err) {
		if shouldFallbackToText(err, msg) {
			logx.Errorf("QQBot 富消息发送失败，降级纯文本: %v", err)
			return s.sendOnceWithToken(ctx, path, Message{Text: msg.Text, MsgID: msg.MsgID}, false)
		}
		return err
	}

	if err := s.sendOnceWithToken(ctx, path, msg, true); err == nil {
		return nil
	} else if shouldFallbackToText(err, msg) {
		logx.Errorf("QQBot 刷新 token 后富消息发送失败，降级纯文本: %v", err)
		return s.sendOnceWithToken(ctx, path, Message{Text: msg.Text, MsgID: msg.MsgID}, false)
	} else {
		return err
	}
}

func (s *Sender) sendOnceWithToken(ctx context.Context, path string, msg Message, refresh bool) error {
	token, err := s.accessToken(ctx, refresh)
	if err != nil {
		return err
	}
	payload := s.messagePayload(msg)
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.cfg.BaseURL+path, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "QQBot "+token)
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.client.Do(req)
	if err != nil {
		return fmt.Errorf("发送 QQBot 消息失败: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		io.Copy(io.Discard, resp.Body)
		return nil
	}
	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	return qqAPIError{
		status: resp.StatusCode,
		body:   strings.TrimSpace(string(respBody)),
		rich:   msg.Markdown != nil || msg.Keyboard != nil,
	}
}

func (s *Sender) accessToken(ctx context.Context, refresh bool) (string, error) {
	if refresh {
		return s.tokens.ForceRefresh(ctx)
	}
	return s.tokens.Token(ctx)
}

func (s *Sender) messagePayload(msg Message) map[string]interface{} {
	payload := map[string]interface{}{
		"content":  strings.TrimSpace(msg.Text),
		"msg_type": 0,
	}
	if strings.TrimSpace(msg.MsgID) != "" {
		payload["msg_id"] = strings.TrimSpace(msg.MsgID)
	}
	if s.cfg.MarkdownEnabled && msg.Markdown != nil {
		payload["msg_type"] = 2
		payload["markdown"] = markdownPayload(*msg.Markdown)
	}
	if s.cfg.ButtonsEnabled && msg.Keyboard != nil {
		payload["keyboard"] = keyboardPayload(*msg.Keyboard)
	}
	return payload
}

func markdownPayload(markdown Markdown) map[string]interface{} {
	if markdown.Raw != nil {
		return markdown.Raw
	}
	payload := map[string]interface{}{}
	if markdown.CustomTemplateID != "" {
		payload["custom_template_id"] = markdown.CustomTemplateID
	}
	if len(markdown.Params) > 0 {
		payload["params"] = markdown.Params
	}
	if markdown.Content != "" {
		payload["content"] = markdown.Content
	}
	return payload
}

func keyboardPayload(keyboard Keyboard) map[string]interface{} {
	if keyboard.Raw != nil {
		return keyboard.Raw
	}
	payload := map[string]interface{}{}
	if keyboard.ID != "" {
		payload["id"] = keyboard.ID
	}
	if keyboard.Content != nil {
		payload["content"] = keyboard.Content
	}
	return payload
}

type qqAPIError struct {
	status int
	body   string
	rich   bool
}

func (e qqAPIError) Error() string {
	if e.body == "" {
		return fmt.Sprintf("QQBot API 请求失败: status=%d", e.status)
	}
	return fmt.Sprintf("QQBot API 请求失败: status=%d body=%s", e.status, e.body)
}

func isUnauthorizedErr(err error) bool {
	apiErr, ok := err.(qqAPIError)
	return ok && apiErr.status == http.StatusUnauthorized
}

func shouldFallbackToText(err error, msg Message) bool {
	if msg.Text == "" || (msg.Markdown == nil && msg.Keyboard == nil) {
		return false
	}
	apiErr, ok := err.(qqAPIError)
	return ok && apiErr.rich && (apiErr.status == http.StatusBadRequest || apiErr.status == http.StatusForbidden)
}
