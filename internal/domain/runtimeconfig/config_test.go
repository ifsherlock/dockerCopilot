package runtimeconfig

import (
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func TestStoreReadMissingReturnsDefault(t *testing.T) {
	store := NewStore(filepath.Join(t.TempDir(), "missing.json"), "secret")

	cfg, err := store.Read()
	if err != nil {
		t.Fatalf("Read() error = %v", err)
	}
	if cfg.Version != "1.0" {
		t.Fatalf("version = %q, want 1.0", cfg.Version)
	}
	instances, ok := cfg.Dockercopilot["instances"].([]map[string]interface{})
	if !ok || len(instances) != 1 {
		t.Fatalf("instances = %#v, want one default instance", cfg.Dockercopilot["instances"])
	}
	if instances[0]["secret_key"] != "secret" {
		t.Fatalf("secret_key = %#v, want secret", instances[0]["secret_key"])
	}
}

func TestStoreReadFillsMissingSections(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.json")
	if err := os.WriteFile(path, []byte(`{"version":"2.0","telegram":{"bot_token":"token"}}`), 0600); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	cfg, err := NewStore(path, "secret").Read()
	if err != nil {
		t.Fatalf("Read() error = %v", err)
	}
	if cfg.Version != "2.0" {
		t.Fatalf("version = %q, want 2.0", cfg.Version)
	}
	if cfg.Telegram["bot_token"] != "token" {
		t.Fatalf("bot_token = %#v, want token", cfg.Telegram["bot_token"])
	}
	if cfg.Dockercopilot == nil {
		t.Fatal("Dockercopilot = nil, want defaults")
	}
	if cfg.Telegram["rich_interactions_enabled"] != false {
		t.Fatalf("rich_interactions_enabled = %#v, want default false", cfg.Telegram["rich_interactions_enabled"])
	}
	if cfg.Telegram["parse_mode"] != "HTML" {
		t.Fatalf("parse_mode = %#v, want HTML", cfg.Telegram["parse_mode"])
	}
	if cfg.QQBot["enabled"] != false || cfg.QQBot["event_mode"] != "webhook" {
		t.Fatalf("qqbot defaults = %#v, want disabled webhook defaults", cfg.QQBot)
	}
	proxy, ok := cfg.Telegram["proxy"].(map[string]interface{})
	if !ok || proxy["type"] != "none" {
		t.Fatalf("proxy = %#v, want default proxy map", cfg.Telegram["proxy"])
	}
}

func TestStoreReadReturnsInvalidJSONError(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.json")
	if err := os.WriteFile(path, []byte(`{"telegram":`), 0600); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	if _, err := NewStore(path, "secret").Read(); err == nil {
		t.Fatal("Read() error = nil, want invalid json error")
	}
}

func TestStoreWriteAndReadRoundTrip(t *testing.T) {
	path := filepath.Join(t.TempDir(), "nested", "config.json")
	store := NewStore(path, "secret")
	cfg := Default("secret")
	cfg.Telegram["update_blacklist"] = []string{"nginx:latest"}

	if err := store.Write(cfg); err != nil {
		t.Fatalf("Write() error = %v", err)
	}
	got, err := store.Read()
	if err != nil {
		t.Fatalf("Read() error = %v", err)
	}
	if !reflect.DeepEqual(got.Telegram["update_blacklist"], []interface{}{"nginx:latest"}) {
		t.Fatalf("update_blacklist = %#v", got.Telegram["update_blacklist"])
	}
	if b, err := os.ReadFile(path); err != nil || !strings.Contains(string(b), "\n  \"telegram\":") {
		t.Fatalf("stored json not indented or unreadable: %q err=%v", string(b), err)
	}
}
