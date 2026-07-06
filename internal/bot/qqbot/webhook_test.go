package qqbot

import (
	"bytes"
	"crypto/ed25519"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/onlyLTY/dockerCopilot/internal/svc"
)

func TestEventHTTPCallbackACKPayload(t *testing.T) {
	data, err := MarshalHTTPCallbackACK()
	if err != nil {
		t.Fatalf("MarshalHTTPCallbackACK() error = %v", err)
	}
	var got map[string]interface{}
	if err := json.Unmarshal(data, &got); err != nil {
		t.Fatalf("Unmarshal ACK error = %v", err)
	}
	if got["op"].(float64) != OpHTTPCallbackACK {
		t.Fatalf("ack = %#v, want op 12", got)
	}
}

func TestWebhookValidationSignature(t *testing.T) {
	req := ValidationRequest{PlainToken: "Arq0D5A61EgUu4OxUvOp", EventTs: "1725442341"}
	resp, err := SignValidation("DG5g3B4j9X2KOErG", req)
	if err != nil {
		t.Fatalf("SignValidation() error = %v", err)
	}
	if resp.PlainToken != req.PlainToken {
		t.Fatalf("PlainToken = %q, want %q", resp.PlainToken, req.PlainToken)
	}
	want := "87befc99c42c651b3aac0278e71ada338433ae26fcb24307bdc5ad38c1adc2d01bcfcadc0842edac85e85205028a1132afe09280305f13aa6909ffc2d652c706"
	if resp.Signature != want {
		t.Fatalf("Signature = %q, want %q", resp.Signature, want)
	}
}

func TestVerifyRequestSignature(t *testing.T) {
	timestamp := "1720000000"
	body := []byte(`{"op":0,"t":"C2C_MESSAGE_CREATE","d":{"id":"m1","content":"/status","author":{"user_openid":"u1"}}}`)
	resp, err := signRawRequest("test-secret", timestamp, body)
	if err != nil {
		t.Fatalf("signRawRequest() error = %v", err)
	}
	if !VerifyRequestSignature("test-secret", timestamp, body, resp) {
		t.Fatalf("VerifyRequestSignature() = false, want true")
	}
	if VerifyRequestSignature("test-secret", timestamp, []byte(`{"changed":true}`), resp) {
		t.Fatalf("VerifyRequestSignature() accepted tampered body")
	}
	if VerifyRequestSignature("other-secret", timestamp, body, resp) {
		t.Fatalf("VerifyRequestSignature() accepted other secret")
	}
}

func TestWebhookDisabledReturnsNotFound(t *testing.T) {
	rt := &webhookRuntime{
		loadConfigFn: func() (Config, svc.BackupRuntimeConfig, error) {
			return Config{Enabled: false}, svc.BackupRuntimeConfig{}, nil
		},
	}
	req := httptest.NewRequest(http.MethodPost, WebhookPath, strings.NewReader(`{"op":0}`))
	rr := httptest.NewRecorder()
	rt.Handle(rr, req)
	if rr.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusNotFound)
	}
}

func TestWebhookRejectsInvalidSignature(t *testing.T) {
	rt := &webhookRuntime{
		loadConfigFn: func() (Config, svc.BackupRuntimeConfig, error) {
			return Config{Enabled: true, AppID: "appid", AppSecret: "secret"}, svc.BackupRuntimeConfig{}, nil
		},
	}
	body := `{"op":0,"t":"C2C_MESSAGE_CREATE","d":{"id":"m1","content":"/status","author":{"user_openid":"u1"}}}`
	req := httptest.NewRequest(http.MethodPost, WebhookPath, strings.NewReader(body))
	req.Header.Set("X-Signature-Timestamp", "1720000000")
	req.Header.Set("X-Signature-Ed25519", strings.Repeat("0", 128))
	rr := httptest.NewRecorder()
	rt.Handle(rr, req)
	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusUnauthorized)
	}
}

func signRawRequest(secret string, timestamp string, body []byte) (string, error) {
	privateKey, err := privateKeyFromSecret(secret)
	if err != nil {
		return "", err
	}
	var msg bytes.Buffer
	msg.WriteString(timestamp)
	msg.Write(body)
	return hex.EncodeToString(ed25519.Sign(privateKey, msg.Bytes())), nil
}
