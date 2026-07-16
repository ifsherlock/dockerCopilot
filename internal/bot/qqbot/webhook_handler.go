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
	"github.com/zeromicro/go-zero/rest"
)

const WebhookPath = "/api/bot/qqbot/webhook"

type webhookRuntime struct {
	svcCtx       *svc.ServiceContext
	loadConfigFn func() (Config, svc.BackupRuntimeConfig, error)

	// dispatcher 常驻以保留交互会话；仅在 app_id 变化时重建。
	mu          sync.Mutex
	dispatcher  *CommandDispatcher
	sender      *Sender
	dispatchKey string
}

func RegisterWebhookRoutes(server *rest.Server, svcCtx *svc.ServiceContext) {
	runtime := &webhookRuntime{svcCtx: svcCtx}
	server.AddRoutes(
		[]rest.Route{
			{
				Method:  http.MethodPost,
				Path:    "/bot/qqbot/webhook",
				Handler: runtime.Handle,
			},
		},
		rest.WithPrefix("/api"),
	)
}

// dispatcherFor 返回与当前配置匹配的常驻 dispatcher，配置身份变化时重建。
func (rt *webhookRuntime) dispatcherFor(cfg Config) (*CommandDispatcher, *Sender) {
	rt.mu.Lock()
	defer rt.mu.Unlock()
	key := cfg.AppID + "|" + cfg.AppSecret
	if rt.dispatcher == nil || rt.dispatchKey != key {
		rt.sender = NewSender(cfg, nil, nil)
		rt.dispatcher = NewCommandDispatcher(cfg, rt.sender, NewActionService(rt.svcCtx))
		rt.dispatchKey = key
	}
	return rt.dispatcher, rt.sender
}

func (rt *webhookRuntime) Handle(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		http.Error(w, "read body failed", http.StatusBadRequest)
		return
	}
	cfg, runtimeCfg, err := rt.loadConfig()
	if err != nil {
		logx.Errorf("QQBot Webhook 配置加载失败: %v", err)
		http.Error(w, "qqbot config failed", http.StatusInternalServerError)
		return
	}
	if !cfg.Enabled {
		http.NotFound(w, r)
		return
	}
	payload, err := ParsePayload(body)
	if err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	if payload.Op == OpValidation {
		rt.handleValidation(w, payload, cfg)
		return
	}
	if !VerifyRequestSignature(cfg.AppSecret, r.Header.Get("X-Signature-Timestamp"), body, r.Header.Get("X-Signature-Ed25519")) {
		http.Error(w, "invalid signature", http.StatusUnauthorized)
		return
	}
	if payload.Op != OpDispatch {
		writeJSON(w, HTTPCallbackACK())
		return
	}
	cmd, ok, err := MapPayloadToCommand(payload)
	if err != nil {
		http.Error(w, "invalid event", http.StatusBadRequest)
		return
	}
	if !ok {
		writeJSON(w, HTTPCallbackACK())
		return
	}
	auth := NewAuthPolicyFromRuntime(runtimeCfg)
	if err := auth.Authorize(cmd); err != nil {
		logx.Errorf("QQBot Webhook 入站未授权: %v", err)
		http.Error(w, "unauthorized", http.StatusForbidden)
		return
	}
	if err := recordRecentIdentity(cmd); err != nil {
		logx.Errorf("%v", err)
	}
	writeJSON(w, HTTPCallbackACK())

	dispatcher, sender := rt.dispatcherFor(cfg)
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
		defer cancel()
		if cmd.Kind == CommandKindInteraction {
			if err := sender.AckInteraction(ctx, cmd); err != nil {
				logx.Errorf("QQBot Webhook 回执 interaction 失败: %v", err)
			}
		}
		if err := dispatcher.Dispatch(ctx, cmd); err != nil {
			logx.Errorf("QQBot Webhook 命令处理失败: %v", err)
		}
	}()
}

func (rt *webhookRuntime) handleValidation(w http.ResponseWriter, payload Payload, cfg Config) {
	var req ValidationRequest
	if err := json.Unmarshal(payload.Data, &req); err != nil {
		http.Error(w, "invalid validation payload", http.StatusBadRequest)
		return
	}
	resp, err := SignValidation(cfg.AppSecret, req)
	if err != nil {
		logx.Errorf("QQBot Webhook 验证签名生成失败: %v", err)
		http.Error(w, "validation failed", http.StatusInternalServerError)
		return
	}
	writeJSON(w, resp)
}

func (rt *webhookRuntime) loadConfig() (Config, svc.BackupRuntimeConfig, error) {
	if rt.loadConfigFn != nil {
		return rt.loadConfigFn()
	}
	runtimeCfg, err := svc.LoadRuntimeConfigForRead()
	if err != nil {
		return Config{}, svc.BackupRuntimeConfig{}, err
	}
	cfg := ConfigFromRuntime(runtimeCfg)
	if cfg.Enabled && (strings.TrimSpace(cfg.AppID) == "" || strings.TrimSpace(cfg.AppSecret) == "") {
		return Config{}, svc.BackupRuntimeConfig{}, fmt.Errorf("QQBot 已启用但 app_id 或 app_secret 未配置")
	}
	return cfg, runtimeCfg, nil
}

func writeJSON(w http.ResponseWriter, value interface{}) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	if err := json.NewEncoder(w).Encode(value); err != nil {
		logx.Errorf("QQBot Webhook 写入响应失败: %v", err)
	}
}
