package qqbot

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/onlyLTY/dockerCopilot/internal/svc"
	"github.com/zeromicro/go-zero/core/logx"
	"golang.org/x/net/websocket"
)

const (
	gatewayIntentGroupAndC2C = 1 << 25
	gatewayIntentInteraction = 1 << 26

	gatewayOpDispatch     = 0
	gatewayOpHeartbeat    = 1
	gatewayOpIdentify     = 2
	gatewayOpReconnect    = 7
	gatewayOpInvalid      = 9
	gatewayOpHello        = 10
	gatewayOpHeartbeatACK = 11
)

type websocketConn interface {
	Send([]byte) error
	Receive() ([]byte, error)
	Close() error
}

type websocketDialer func(ctx context.Context, url, token string) (websocketConn, error)

type GatewayRuntime struct {
	cfg          Config
	runtimeCfg   svc.BackupRuntimeConfig
	svcCtx       *svc.ServiceContext
	client       *http.Client
	tokens       tokenProvider
	dialer       websocketDialer
	gatewayURLFn func(context.Context, string) (string, error)
	heartbeatFn  func(context.Context, time.Duration, func())
	reconnects   []time.Duration
	// sender / dispatcher 常驻整个运行时生命周期：
	// dispatcher 内部持有交互会话（分页/确认按钮），按事件重建会导致所有按钮点击失效。
	sender     *Sender
	dispatcher *CommandDispatcher
}

func NewGatewayRuntime(cfg Config, runtimeCfg svc.BackupRuntimeConfig, svcCtx *svc.ServiceContext, client *http.Client) *GatewayRuntime {
	normalized := cfg.Normalized()
	if client == nil {
		client = defaultHTTPClient()
	}
	rt := &GatewayRuntime{
		cfg:        normalized,
		runtimeCfg: runtimeCfg,
		svcCtx:     svcCtx,
		client:     client,
		reconnects: []time.Duration{
			time.Second,
			2 * time.Second,
			5 * time.Second,
			10 * time.Second,
			30 * time.Second,
			time.Minute,
		},
	}
	rt.tokens = NewTokenManager(normalized, client)
	rt.dialer = defaultWebsocketDialer
	rt.gatewayURLFn = rt.gatewayURL
	rt.heartbeatFn = defaultHeartbeatLoop
	rt.sender = NewSender(normalized, rt.client, rt.tokens)
	rt.dispatcher = NewCommandDispatcher(normalized, rt.sender, NewActionService(svcCtx))
	return rt
}

func (rt *GatewayRuntime) Run(ctx context.Context) {
	attempt := 0
	for ctx.Err() == nil {
		if err := rt.runOnce(ctx); err != nil && ctx.Err() == nil {
			logx.Errorf("QQBot Gateway 连接中断: %v", err)
		}
		if ctx.Err() != nil {
			return
		}
		delay := rt.reconnectDelay(attempt)
		attempt++
		logx.Infof("QQBot Gateway 将在 %s 后重连", delay)
		if !sleepContext(ctx, delay) {
			return
		}
	}
}

func (rt *GatewayRuntime) runOnce(ctx context.Context) error {
	token, err := rt.tokens.Token(ctx)
	if err != nil {
		return err
	}
	gatewayURL, err := rt.gatewayURLFn(ctx, token)
	if err != nil {
		return err
	}
	conn, err := rt.dialer(ctx, gatewayURL, token)
	if err != nil {
		return err
	}
	defer conn.Close()

	sessionCtx, cancel := context.WithCancel(ctx)
	defer cancel()
	state := &gatewaySession{rt: rt, conn: conn, token: token, cancel: cancel}
	logx.Infof("QQBot Gateway 已连接")

	for sessionCtx.Err() == nil {
		data, err := conn.Receive()
		if err != nil {
			return err
		}
		if err := state.handle(sessionCtx, data); err != nil {
			return err
		}
	}
	return sessionCtx.Err()
}

func (rt *GatewayRuntime) gatewayURL(ctx context.Context, token string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rt.cfg.BaseURL+"/gateway", nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "QQBot "+token)

	resp, err := rt.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("获取 QQBot Gateway 地址失败: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("获取 QQBot Gateway 地址失败: status=%d body=%s", resp.StatusCode, strings.TrimSpace(string(body)))
	}
	var payload struct {
		URL string `json:"url"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		return "", fmt.Errorf("解析 QQBot Gateway 地址失败: %w", err)
	}
	if strings.TrimSpace(payload.URL) == "" {
		return "", fmt.Errorf("QQBot Gateway 响应缺少 url")
	}
	return strings.TrimSpace(payload.URL), nil
}

func (rt *GatewayRuntime) reconnectDelay(attempt int) time.Duration {
	if len(rt.reconnects) == 0 {
		return 5 * time.Second
	}
	if attempt < len(rt.reconnects) {
		return rt.reconnects[attempt]
	}
	return rt.reconnects[len(rt.reconnects)-1]
}

type gatewaySession struct {
	rt      *GatewayRuntime
	conn    websocketConn
	token   string
	seq     int64
	cancel  context.CancelFunc
	writeMu sync.Mutex
}

func (s *gatewaySession) handle(ctx context.Context, data []byte) error {
	payload, err := ParsePayload(data)
	if err != nil {
		return err
	}
	if payload.Seq > 0 {
		s.seq = payload.Seq
	}
	switch payload.Op {
	case gatewayOpHello:
		return s.handleHello(ctx, payload.Data)
	case gatewayOpDispatch:
		return s.handleDispatch(ctx, payload)
	case gatewayOpHeartbeatACK:
		return nil
	case gatewayOpReconnect:
		s.cancel()
		return fmt.Errorf("QQBot Gateway 服务端要求重连")
	case gatewayOpInvalid:
		s.cancel()
		return fmt.Errorf("QQBot Gateway session 无效")
	default:
		return nil
	}
}

func (s *gatewaySession) handleHello(ctx context.Context, data json.RawMessage) error {
	interval := 30 * time.Second
	var hello struct {
		HeartbeatInterval int `json:"heartbeat_interval"`
	}
	_ = json.Unmarshal(data, &hello)
	if hello.HeartbeatInterval > 0 {
		interval = time.Duration(hello.HeartbeatInterval) * time.Millisecond
	}
	if err := s.sendIdentify(); err != nil {
		return err
	}
	s.rt.heartbeatFn(ctx, interval, func() {
		if err := s.sendHeartbeat(); err != nil {
			logx.Errorf("QQBot Gateway 心跳发送失败: %v", err)
			s.cancel()
		}
	})
	return nil
}

func (s *gatewaySession) sendIdentify() error {
	return s.sendJSON(map[string]interface{}{
		"op": gatewayOpIdentify,
		"d": map[string]interface{}{
			"token":   "QQBot " + s.token,
			"intents": gatewayIntentGroupAndC2C | gatewayIntentInteraction,
			"shard":   []int{0, 1},
		},
	})
}

func (s *gatewaySession) sendHeartbeat() error {
	return s.sendJSON(map[string]interface{}{
		"op": gatewayOpHeartbeat,
		"d":  s.seq,
	})
}

func (s *gatewaySession) sendJSON(value interface{}) error {
	body, err := json.Marshal(value)
	if err != nil {
		return err
	}
	s.writeMu.Lock()
	defer s.writeMu.Unlock()
	return s.conn.Send(body)
}

func (s *gatewaySession) handleDispatch(ctx context.Context, payload Payload) error {
	if payload.Type == "READY" {
		logx.Infof("QQBot Gateway READY")
		return nil
	}
	cmd, ok, err := MapPayloadToCommand(payload)
	if err != nil {
		return err
	}
	if !ok {
		return nil
	}
	auth := NewAuthPolicyFromRuntime(s.rt.runtimeCfg)
	if err := auth.Authorize(cmd); err != nil {
		logx.Errorf("QQBot Gateway 入站未授权: %v", err)
		return nil
	}
	if err := recordRecentIdentity(cmd); err != nil {
		logx.Errorf("%v", err)
	}
	go func() {
		dispatchCtx, cancel := context.WithTimeout(ctx, 5*time.Minute)
		defer cancel()
		// 按钮回调先回执，避免客户端一直转圈；回执失败不阻断后续处理。
		if cmd.Kind == CommandKindInteraction {
			if err := s.rt.sender.AckInteraction(dispatchCtx, cmd); err != nil {
				logx.Errorf("QQBot Gateway 回执 interaction 失败: %v", err)
			}
		}
		if err := s.rt.dispatcher.Dispatch(dispatchCtx, cmd); err != nil {
			logx.Errorf("QQBot Gateway 命令处理失败: %v", err)
		}
	}()
	return nil
}

type xNetWebsocketConn struct {
	conn *websocket.Conn
}

func defaultWebsocketDialer(ctx context.Context, url, token string) (websocketConn, error) {
	cfg, err := websocket.NewConfig(url, "https://qqbot.dockercopilot.local")
	if err != nil {
		return nil, err
	}
	cfg.Header.Set("Authorization", "QQBot "+token)
	conn, err := websocket.DialConfig(cfg)
	if err != nil {
		return nil, err
	}
	go func() {
		<-ctx.Done()
		_ = conn.Close()
	}()
	return xNetWebsocketConn{conn: conn}, nil
}

func (c xNetWebsocketConn) Send(data []byte) error {
	return websocket.Message.Send(c.conn, string(data))
}

func (c xNetWebsocketConn) Receive() ([]byte, error) {
	var msg []byte
	if err := websocket.Message.Receive(c.conn, &msg); err != nil {
		return nil, err
	}
	return msg, nil
}

func (c xNetWebsocketConn) Close() error {
	return c.conn.Close()
}

func defaultHeartbeatLoop(ctx context.Context, interval time.Duration, tick func()) {
	if interval <= 0 {
		interval = 30 * time.Second
	}
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
			}
			tick()
		}
	}()
}

func sleepContext(ctx context.Context, delay time.Duration) bool {
	timer := time.NewTimer(delay)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return false
	case <-timer.C:
		return true
	}
}
