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
	"sync"

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
	Text string
	// PlainText 是富文本（markdown）发送失败时的降级文案。
	// 为空时降级会直接复用 Text——那样 markdown 源码会原样露出，
	// 因此所有 markdown 渲染都应同时提供 PlainText。
	PlainText string
	MsgID     string
	Markdown  *Markdown
	Keyboard  *Keyboard
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
			return s.sendOnceWithToken(ctx, path, s.plainFallback(msg), false)
		}
		return err
	}

	if err := s.sendOnceWithToken(ctx, path, msg, true); err == nil {
		return nil
	} else if shouldFallbackToText(err, msg) {
		logx.Errorf("QQBot 刷新 token 后富消息发送失败，降级纯文本: %v", err)
		return s.sendOnceWithToken(ctx, path, s.plainFallback(msg), false)
	} else {
		return err
	}
}

// plainFallback 构造降级用的纯文本消息：优先使用渲染时同步产出的 PlainText，
// 避免把 markdown 源码（**、表格管道符等）直接发给用户造成乱码。
func (s *Sender) plainFallback(msg Message) Message {
	text := msg.PlainText
	if strings.TrimSpace(text) == "" {
		text = msg.Text
	}
	return Message{Text: text, MsgID: msg.MsgID}
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
	if msgID := strings.TrimSpace(msg.MsgID); msgID != "" {
		payload["msg_id"] = msgID
		// QQ 官方对同一 msg_id 的被动回复按 msg_seq 去重，
		// 不递增 seq 时第二条回复会被吞掉。
		payload["msg_seq"] = nextMsgSeq(msgID)
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

// AckInteraction 按 QQ 官方要求回执按钮回调（PUT /interactions/{id}），
// 否则客户端按钮会一直转圈并提示“操作失败”。
func (s *Sender) AckInteraction(ctx context.Context, cmd IncomingCommand) error {
	interactionID := strings.TrimSpace(firstNonEmpty(cmd.InteractionID, cmd.EventID))
	if interactionID == "" {
		return fmt.Errorf("QQBot interaction id 为空，无法回执")
	}
	body, err := json.Marshal(map[string]interface{}{"code": 0})
	if err != nil {
		return err
	}
	token, err := s.accessToken(ctx, false)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPut,
		s.cfg.BaseURL+fmt.Sprintf("/interactions/%s", url.PathEscape(interactionID)), bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "QQBot "+token)
	req.Header.Set("Content-Type", "application/json")
	resp, err := s.client.Do(req)
	if err != nil {
		return fmt.Errorf("回执 QQBot interaction 失败: %w", err)
	}
	defer resp.Body.Close()
	io.Copy(io.Discard, resp.Body)
	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		return nil
	}
	return fmt.Errorf("回执 QQBot interaction 失败: status=%d", resp.StatusCode)
}

// msgSeqStore 为每个 msg_id 维护递增的 msg_seq。
var msgSeqStore = struct {
	mu   sync.Mutex
	seqs map[string]int
}{seqs: map[string]int{}}

func nextMsgSeq(msgID string) int {
	msgSeqStore.mu.Lock()
	defer msgSeqStore.mu.Unlock()
	if len(msgSeqStore.seqs) > 2048 {
		msgSeqStore.seqs = map[string]int{}
	}
	msgSeqStore.seqs[msgID]++
	return msgSeqStore.seqs[msgID]
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
