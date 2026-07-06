package telegram

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/onlyLTY/dockerCopilot/internal/config"
	"github.com/onlyLTY/dockerCopilot/internal/domain/runtimeconfig"
	"github.com/onlyLTY/dockerCopilot/internal/svc"
)

func TestMaskSensitiveJSONValueMasksSecrets(t *testing.T) {
	got := maskedJSON([]map[string]interface{}{
		{
			"name":       "local",
			"api_url":    "http://127.0.0.1:12712",
			"secret_key": "real-secret",
			"nested": map[string]interface{}{
				"password": "proxy-password",
			},
		},
	})

	if strings.Contains(got, "real-secret") || strings.Contains(got, "proxy-password") {
		t.Fatalf("maskedJSON leaked secret: %s", got)
	}
	if count := strings.Count(got, maskedSecretPlaceholder); count != 2 {
		t.Fatalf("maskedJSON placeholder count = %d, want 2 in %s", count, got)
	}
}

func TestMaskStatefulInputForLogMasksSensitiveActions(t *testing.T) {
	for _, tc := range []struct {
		action string
		extra  string
		want   string
	}{
		{action: "instance_edit", want: "<masked instance json>"},
		{action: "instance_add", want: "<masked instance json>"},
		{action: "edit_text", extra: "proxy_config", want: "<masked proxy_config>"},
		{action: "edit_text", extra: "instances_json", want: "<masked instances_json>"},
	} {
		got := maskStatefulInputForLog(tc.action, tc.extra, `{"secret_key":"real-secret"}`)
		if got != tc.want {
			t.Fatalf("maskStatefulInputForLog(%q, %q) = %q, want %q", tc.action, tc.extra, got, tc.want)
		}
		if strings.Contains(got, "real-secret") {
			t.Fatalf("maskStatefulInputForLog leaked secret: %q", got)
		}
	}
}

func TestPreserveMaskedInstanceSecretKeepsExistingSecret(t *testing.T) {
	payload := instanceEditPayload{Name: "remote", APIURL: "http://remote", SecretKey: maskedSecretPlaceholder, Timeout: 30}
	got := preserveMaskedInstanceSecret(payload, []instanceConfig{{Name: "remote", SecretKey: "real-secret"}}, "remote")

	if got.SecretKey != "real-secret" {
		t.Fatalf("SecretKey = %q, want existing secret", got.SecretKey)
	}
}

func TestPreserveMaskedInstanceSecretsJSONKeepsExistingSecrets(t *testing.T) {
	input := `[{"name":"local","api_url":"http://local","secret_key":"******","timeout":30},{"name":"new","api_url":"http://new","secret_key":"new-secret","timeout":30}]`
	existing := []map[string]interface{}{
		{"name": "local", "api_url": "http://local", "secret_key": "local-secret", "timeout": 30},
	}

	merged, err := preserveMaskedInstanceSecretsJSON(input, existing)
	if err != nil {
		t.Fatalf("preserveMaskedInstanceSecretsJSON() error = %v", err)
	}
	var got []map[string]interface{}
	if err := json.Unmarshal(merged, &got); err != nil {
		t.Fatalf("merged json unmarshal error = %v", err)
	}
	if got[0]["secret_key"] != "local-secret" {
		t.Fatalf("local secret = %#v, want existing secret", got[0]["secret_key"])
	}
	if got[1]["secret_key"] != "new-secret" {
		t.Fatalf("new secret = %#v, want submitted secret", got[1]["secret_key"])
	}
}

func TestSaveInstanceConfigActionKeepsExistingSecretForMaskedEdit(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.json")
	t.Setenv("DOCKERCOPILOT_BOT_CONFIG", path)

	cfg := runtimeconfig.Default("local-secret")
	cfg.Telegram["bot_token"] = "token"
	cfg.Dockercopilot["multi_instance_enabled"] = true
	cfg.Dockercopilot["default_instance"] = "remote"
	cfg.Dockercopilot["instances"] = []map[string]interface{}{
		{"name": "local", "api_url": "http://127.0.0.1:12712", "secret_key": "local-secret", "timeout": 30},
		{"name": "remote", "api_url": "http://old.example", "secret_key": "remote-secret", "timeout": 15},
	}
	if err := runtimeconfig.NewStore(path, "local-secret").Write(cfg); err != nil {
		t.Fatalf("Write() error = %v", err)
	}

	appConfig := config.Config{}
	appConfig.Auth.AccessSecret = "local-secret"
	r := &Runtime{svcCtx: svc.NewServiceContext(appConfig)}
	err := r.saveInstanceConfigAction(context.Background(), 1, "edit", "remote", instanceEditPayload{
		Name:      "remote",
		APIURL:    "http://new.example",
		SecretKey: maskedSecretPlaceholder,
		Timeout:   25,
	})
	if err != nil {
		t.Fatalf("saveInstanceConfigAction() error = %v", err)
	}

	stored, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("ReadFile() error = %v", err)
	}
	if strings.Contains(string(stored), maskedSecretPlaceholder) {
		t.Fatalf("stored config contains masked placeholder: %s", stored)
	}

	var storedConfig struct {
		Dockercopilot map[string]interface{} `json:"dockercopilot"`
	}
	if err := json.Unmarshal(stored, &storedConfig); err != nil {
		t.Fatalf("stored config unmarshal error = %v", err)
	}
	instances := parseInstances(storedConfig.Dockercopilot["instances"])
	for _, inst := range instances {
		if inst.Name == "remote" {
			if inst.SecretKey != "remote-secret" {
				t.Fatalf("remote secret = %q, want existing secret", inst.SecretKey)
			}
			if inst.APIURL != "http://new.example" {
				t.Fatalf("remote api_url = %q, want updated api url", inst.APIURL)
			}
			return
		}
	}
	t.Fatalf("remote instance not found in %#v", instances)
}
