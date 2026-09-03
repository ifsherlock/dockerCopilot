package instanceproxy

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"strings"
	"testing"

	"github.com/onlyLTY/dockerCopilot/internal/config"
	"github.com/onlyLTY/dockerCopilot/internal/domain/runtimeconfig"
	"github.com/onlyLTY/dockerCopilot/internal/svc"
)

func TestListOmitsInstanceSecrets(t *testing.T) {
	configPath := t.TempDir() + string(os.PathSeparator) + "config.json"
	t.Setenv("DOCKERCOPILOT_BOT_CONFIG", configPath)

	cfg := runtimeconfig.Default("local-secret")
	cfg.Dockercopilot["multi_instance_enabled"] = true
	cfg.Dockercopilot["default_instance"] = "staging"
	cfg.Dockercopilot["instances"] = []map[string]interface{}{
		{"name": "local", "api_url": "http://127.0.0.1:12712", "secret_key": "local-secret", "timeout": 30},
		{"name": "staging", "api_url": "https://staging.example.test", "secret_key": "remote-secret", "timeout": 10},
	}
	if err := runtimeconfig.NewStore(configPath, "local-secret").Write(cfg); err != nil {
		t.Fatalf("write config failed: %v", err)
	}

	var appConfig config.Config
	appConfig.Auth.AccessSecret = "local-secret"
	result, err := List(&svc.ServiceContext{Config: appConfig})
	if err != nil {
		t.Fatalf("List returned error: %v", err)
	}
	if result.DefaultInstance != "staging" {
		t.Fatalf("DefaultInstance = %q, want staging", result.DefaultInstance)
	}
	if len(result.Instances) != 2 {
		t.Fatalf("Instances len = %d, want 2", len(result.Instances))
	}
	b, err := json.Marshal(result)
	if err != nil {
		t.Fatalf("marshal result failed: %v", err)
	}
	if strings.Contains(string(b), "local-secret") || strings.Contains(string(b), "remote-secret") {
		t.Fatalf("instance secrets leaked in response: %s", b)
	}
}

func TestParseInstancesDeduplicatesNames(t *testing.T) {
	instances := parseInstances([]map[string]interface{}{
		{"name": "Remote", "api_url": "http://remote-a", "secret_key": "a"},
		{"name": " remote ", "api_url": "http://remote-b", "secret_key": "b"},
		{"name": "", "api_url": "http://invalid"},
	})
	if len(instances) != 1 {
		t.Fatalf("parseInstances len = %d, want 1", len(instances))
	}
	if instances[0].Name != "Remote" || instances[0].APIURL != "http://remote-a" {
		t.Fatalf("parseInstances() = %#v, want first valid instance", instances)
	}
}

func TestProxyRejectsDisabledMultiInstance(t *testing.T) {
	configPath := t.TempDir() + string(os.PathSeparator) + "config.json"
	t.Setenv("DOCKERCOPILOT_BOT_CONFIG", configPath)

	cfg := runtimeconfig.Default("local-secret")
	cfg.Dockercopilot["multi_instance_enabled"] = false
	cfg.Dockercopilot["instances"] = []map[string]interface{}{
		{"name": "remote", "api_url": "http://remote.example.test", "secret_key": "remote-secret"},
	}
	if err := runtimeconfig.NewStore(configPath, "local-secret").Write(cfg); err != nil {
		t.Fatalf("write config failed: %v", err)
	}

	var appConfig config.Config
	appConfig.Auth.AccessSecret = "local-secret"
	_, err := Proxy(context.Background(), &svc.ServiceContext{Config: appConfig}, "remote", http.MethodGet, "/api/containers", nil, http.Header{}, nil)
	if err == nil || !strings.Contains(err.Error(), "未启用") {
		t.Fatalf("Proxy() error = %v, want disabled error", err)
	}
}
