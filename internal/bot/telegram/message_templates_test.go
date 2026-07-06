package telegram

import (
	"fmt"
	"strings"
	"testing"
	"time"
)

func TestAccessDeniedMessageHasRecoveryAction(t *testing.T) {
	msg := telegramAccessDeniedMessage(fmt.Errorf("Telegram 交互操作当前已禁用"))
	if !strings.Contains(msg, "/help") {
		t.Fatalf("access denied message = %q, want /help recovery action", msg)
	}
}

func TestUpdateCacheHeaderContainsInstanceAndStatus(t *testing.T) {
	msg := updateCacheHeader("local<prod>", 2*time.Minute, true)
	for _, want := range []string{"实例:", "local&lt;prod&gt;", "缓存年龄:", "实时检测:"} {
		if !strings.Contains(msg, want) {
			t.Fatalf("update cache header = %q, want %q", msg, want)
		}
	}
}

func TestSensitiveTemplatesDoNotExposeSecret(t *testing.T) {
	payload := instanceEditPayload{Name: "remote", APIURL: "http://remote", SecretKey: "real-secret", Timeout: 30}
	masked := maskedInstanceEditPayload(payload)
	if masked.SecretKey == payload.SecretKey || strings.Contains(masked.SecretKey, "real-secret") {
		t.Fatalf("masked secret = %q, want placeholder", masked.SecretKey)
	}
	if got := maskStatefulInputForLog("instance_edit", "", `{"secret_key":"real-secret"}`); strings.Contains(got, "real-secret") {
		t.Fatalf("masked log input leaked secret: %q", got)
	}
}
