package bot

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/onlyLTY/dockerCopilot/internal/config"
	"github.com/onlyLTY/dockerCopilot/internal/domain/runtimeconfig"
	"github.com/onlyLTY/dockerCopilot/internal/svc"
)

// 回归测试：SaveConfigHandler 必须走 BotConfigReq 的自定义 UnmarshalJSON，
// 否则局部保存（如加速页只提交加速器字段）会把未提交的布尔开关写成 false。
func TestSaveConfigHandlerPartialSaveKeepsUnsubmittedSwitches(t *testing.T) {
	dir := t.TempDir()
	cfgPath := filepath.Join(dir, "config.json")
	t.Setenv("DOCKERCOPILOT_BOT_CONFIG", cfgPath)

	store := runtimeconfig.NewStore(cfgPath, "test-secret")
	seed, err := store.Read()
	if err != nil {
		t.Fatalf("read seed config: %v", err)
	}
	seed.Telegram["interactive_enabled"] = true
	seed.Telegram["notify_on_update"] = true
	seed.Telegram["bot_token"] = "123:abc"
	seed.QQBot["enabled"] = true
	if err := store.Write(seed); err != nil {
		t.Fatalf("write seed config: %v", err)
	}

	var c config.Config
	c.Auth.AccessSecret = "test-secret"
	svcCtx := svc.NewServiceContext(c)

	body, _ := json.Marshal(map[string]interface{}{
		"imageAccelerators":       "docker.example.com",
		"defaultImageAccelerator": "docker.example.com",
	})
	req := httptest.NewRequest(http.MethodPost, "/api/bot/config", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	SaveConfigHandler(svcCtx)(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}

	b, err := os.ReadFile(cfgPath)
	if err != nil {
		t.Fatalf("read saved config: %v", err)
	}
	var saved runtimeconfig.Config
	if err := json.Unmarshal(b, &saved); err != nil {
		t.Fatalf("unmarshal saved config: %v", err)
	}
	if saved.Telegram["interactive_enabled"] != true {
		t.Errorf("interactive_enabled 被局部保存改写: %v", saved.Telegram["interactive_enabled"])
	}
	if saved.Telegram["notify_on_update"] != true {
		t.Errorf("notify_on_update 被局部保存改写: %v", saved.Telegram["notify_on_update"])
	}
	if saved.Telegram["bot_token"] != "123:abc" {
		t.Errorf("bot_token 被局部保存改写: %v", saved.Telegram["bot_token"])
	}
	if saved.QQBot["enabled"] != true {
		t.Errorf("qqbot enabled 被局部保存改写: %v", saved.QQBot["enabled"])
	}
	accels, _ := saved.Telegram["image_accelerators"].([]interface{})
	if len(accels) != 1 || accels[0] != "docker.example.com" {
		t.Errorf("image_accelerators 未生效: %v", saved.Telegram["image_accelerators"])
	}
}
