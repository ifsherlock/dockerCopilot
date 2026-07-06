package qqbot

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"github.com/onlyLTY/dockerCopilot/internal/svc"
)

func TestGatewaySessionIdentifiesAndHeartbeatsAfterHello(t *testing.T) {
	conn := &fakeWSConn{}
	rt := &GatewayRuntime{
		cfg: Config{AppID: "appid", AppSecret: "secret"}.Normalized(),
		heartbeatFn: func(ctx context.Context, interval time.Duration, tick func()) {
			if interval != 45*time.Second {
				t.Fatalf("heartbeat interval = %s, want 45s", interval)
			}
			tick()
		},
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	session := &gatewaySession{rt: rt, conn: conn, token: "token", cancel: cancel, seq: 42}

	err := session.handle(ctx, []byte(`{"op":10,"d":{"heartbeat_interval":45000}}`))
	if err != nil {
		t.Fatalf("handle hello error = %v", err)
	}
	if len(conn.sent) != 2 {
		t.Fatalf("sent messages = %d, want identify + heartbeat", len(conn.sent))
	}
	var identify map[string]interface{}
	if err := json.Unmarshal(conn.sent[0], &identify); err != nil {
		t.Fatalf("identify json error = %v", err)
	}
	if identify["op"].(float64) != gatewayOpIdentify {
		t.Fatalf("identify op = %#v", identify["op"])
	}
	d := identify["d"].(map[string]interface{})
	if d["token"] != "QQBot token" {
		t.Fatalf("identify token = %#v", d["token"])
	}
	if int(d["intents"].(float64)) != gatewayIntentGroupAndC2C|gatewayIntentInteraction {
		t.Fatalf("identify intents = %#v", d["intents"])
	}

	var heartbeat map[string]interface{}
	if err := json.Unmarshal(conn.sent[1], &heartbeat); err != nil {
		t.Fatalf("heartbeat json error = %v", err)
	}
	if heartbeat["op"].(float64) != gatewayOpHeartbeat || heartbeat["d"].(float64) != 42 {
		t.Fatalf("heartbeat = %#v", heartbeat)
	}
}

func TestGatewayRuntimeFetchesGatewayURL(t *testing.T) {
	rt := NewGatewayRuntime(Config{AppID: "appid", AppSecret: "secret"}, emptyRuntimeConfig(), nil, nil)
	rt.tokens = &fakeTokenProvider{token: "token"}
	rt.gatewayURLFn = func(ctx context.Context, gotToken string) (string, error) {
		if gotToken != "token" {
			t.Fatalf("gateway token = %q, want token", gotToken)
		}
		return "wss://example.invalid/gateway", nil
	}
	conn := &fakeWSConn{
		recv: [][]byte{
			[]byte(`{"op":10,"d":{"heartbeat_interval":1}}`),
		},
		err: errors.New("stop"),
	}
	rt.dialer = func(ctx context.Context, url, gotToken string) (websocketConn, error) {
		if url != "wss://example.invalid/gateway" || gotToken != "token" {
			t.Fatalf("dial url=%q token=%q", url, gotToken)
		}
		return conn, nil
	}
	rt.heartbeatFn = func(context.Context, time.Duration, func()) {}

	err := rt.runOnce(context.Background())
	if err == nil || err.Error() != "stop" {
		t.Fatalf("runOnce error = %v, want stop", err)
	}
	if len(conn.sent) != 1 {
		t.Fatalf("sent messages = %d, want identify", len(conn.sent))
	}
}

type fakeWSConn struct {
	sent   [][]byte
	recv   [][]byte
	err    error
	closed bool
}

func (c *fakeWSConn) Send(data []byte) error {
	c.sent = append(c.sent, append([]byte(nil), data...))
	return nil
}

func (c *fakeWSConn) Receive() ([]byte, error) {
	if len(c.recv) == 0 {
		if c.err != nil {
			return nil, c.err
		}
		return nil, errors.New("empty")
	}
	data := c.recv[0]
	c.recv = c.recv[1:]
	return data, nil
}

func (c *fakeWSConn) Close() error {
	c.closed = true
	return nil
}

func emptyRuntimeConfig() svc.BackupRuntimeConfig {
	return svc.BackupRuntimeConfig{
		QQBot: map[string]interface{}{},
	}
}
