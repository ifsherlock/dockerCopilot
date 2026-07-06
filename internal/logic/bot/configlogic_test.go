package bot

import (
	"context"
	"encoding/json"
	"path/filepath"
	"reflect"
	"testing"

	"github.com/onlyLTY/dockerCopilot/internal/config"
	"github.com/onlyLTY/dockerCopilot/internal/domain/runtimeconfig"
	"github.com/onlyLTY/dockerCopilot/internal/svc"
	"github.com/onlyLTY/dockerCopilot/internal/types"
)

func decodeConfigResp(data interface{}, out interface{}) error {
	b, err := json.Marshal(data)
	if err != nil {
		return err
	}
	return json.Unmarshal(b, out)
}

func TestStringSliceFromInterfaceDeduplicatesDockerHubAliases(t *testing.T) {
	got := stringSliceFromInterface([]string{
		" nginx ",
		"nginx:latest",
		"docker.io/library/nginx",
		"registry-1.docker.io/library/nginx:latest",
		"https://docker.io/library/nginx:latest",
		"",
		"  ",
	})
	want := []string{"nginx:latest"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("stringSliceFromInterface() = %#v, want %#v", got, want)
	}
}

func TestStringSliceFromInterfaceKeepsContainerLikeNamesStable(t *testing.T) {
	got := stringSliceFromInterface([]string{
		"media-server",
		"media-server",
		"library/media-server",
	})
	want := []string{"media-server:latest"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("stringSliceFromInterface() = %#v, want %#v", got, want)
	}
}

func TestStringSliceFromInterface(t *testing.T) {
	tests := []struct {
		name string
		in   interface{}
		want []string
	}{
		{
			name: "string slice",
			in:   []string{"nginx", "docker.io/library/nginx:latest"},
			want: []string{"nginx:latest"},
		},
		{
			name: "interface slice",
			in:   []interface{}{"redis", 123, ""},
			want: []string{"redis:latest", "123:latest"},
		},
		{
			name: "comma and newline string",
			in:   "nginx, redis\nalpine",
			want: []string{"nginx:latest", "redis:latest", "alpine:latest"},
		},
		{
			name: "unsupported",
			in:   map[string]string{"nginx": "latest"},
			want: []string{},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := stringSliceFromInterface(tt.in); !reflect.DeepEqual(got, tt.want) {
				t.Fatalf("stringSliceFromInterface() = %#v, want %#v", got, tt.want)
			}
		})
	}
}

func TestSaveConfigPersistsRichTelegramFields(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.json")
	t.Setenv("DOCKERCOPILOT_BOT_CONFIG", path)
	appConfig := config.Config{}
	appConfig.Auth.AccessSecret = "secret"
	logic := NewConfigLogic(context.Background(), svc.NewServiceContext(appConfig))

	resp, err := logic.SaveConfig(&types.BotConfigReq{
		RichInteractionsEnabled: true,
		ParseMode:               "markdown_v2",
		PresentFields: map[string]bool{
			"richInteractionsEnabled": true,
			"parseMode":               true,
		},
	})
	if err != nil {
		t.Fatalf("SaveConfig() error = %v", err)
	}
	if resp == nil || resp.Code != 200 {
		t.Fatalf("SaveConfig() resp = %#v, want 200", resp)
	}

	cfg, err := runtimeconfig.NewStore(path, "secret").Read()
	if err != nil {
		t.Fatalf("Read() error = %v", err)
	}
	if cfg.Telegram["rich_interactions_enabled"] != true {
		t.Fatalf("rich_interactions_enabled = %#v, want true", cfg.Telegram["rich_interactions_enabled"])
	}
	if cfg.Telegram["parse_mode"] != "MarkdownV2" {
		t.Fatalf("parse_mode = %#v, want MarkdownV2", cfg.Telegram["parse_mode"])
	}
}

func TestSaveConfigPreservesRichTelegramFieldsWhenMissing(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.json")
	t.Setenv("DOCKERCOPILOT_BOT_CONFIG", path)
	cfg := runtimeconfig.Default("secret")
	cfg.Telegram["rich_interactions_enabled"] = true
	cfg.Telegram["parse_mode"] = "MarkdownV2"
	if err := runtimeconfig.NewStore(path, "secret").Write(cfg); err != nil {
		t.Fatalf("Write() error = %v", err)
	}
	appConfig := config.Config{}
	appConfig.Auth.AccessSecret = "secret"
	logic := NewConfigLogic(context.Background(), svc.NewServiceContext(appConfig))

	resp, err := logic.SaveConfig(&types.BotConfigReq{
		UpdateCheckCron: "5 1 * * *",
		PresentFields: map[string]bool{
			"updateCheckCron": true,
		},
	})
	if err != nil {
		t.Fatalf("SaveConfig() error = %v", err)
	}
	if resp == nil || resp.Code != 200 {
		t.Fatalf("SaveConfig() resp = %#v, want 200", resp)
	}

	got, err := runtimeconfig.NewStore(path, "secret").Read()
	if err != nil {
		t.Fatalf("Read() error = %v", err)
	}
	if got.Telegram["rich_interactions_enabled"] != true {
		t.Fatalf("rich_interactions_enabled = %#v, want preserved true", got.Telegram["rich_interactions_enabled"])
	}
	if got.Telegram["parse_mode"] != "MarkdownV2" {
		t.Fatalf("parse_mode = %#v, want preserved MarkdownV2", got.Telegram["parse_mode"])
	}
	if got.Telegram["update_check_cron"] != "5 1 * * *" {
		t.Fatalf("update_check_cron = %#v, want updated cron", got.Telegram["update_check_cron"])
	}
}

func TestSaveConfigCanDisableTelegramNotificationsWithoutDisablingChecks(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.json")
	t.Setenv("DOCKERCOPILOT_BOT_CONFIG", path)
	cfg := runtimeconfig.Default("secret")
	cfg.Telegram["update_check_cron"] = "5 1 * * *"
	if err := runtimeconfig.NewStore(path, "secret").Write(cfg); err != nil {
		t.Fatalf("Write() error = %v", err)
	}
	appConfig := config.Config{}
	appConfig.Auth.AccessSecret = "secret"
	logic := NewConfigLogic(context.Background(), svc.NewServiceContext(appConfig))

	resp, err := logic.SaveConfig(&types.BotConfigReq{
		NotifyOnUpdate: false,
		PresentFields: map[string]bool{
			"notifyOnUpdate": true,
		},
	})
	if err != nil {
		t.Fatalf("SaveConfig() error = %v", err)
	}
	if resp == nil || resp.Code != 200 {
		t.Fatalf("SaveConfig() resp = %#v, want 200", resp)
	}

	got, err := runtimeconfig.NewStore(path, "secret").Read()
	if err != nil {
		t.Fatalf("Read() error = %v", err)
	}
	if got.Telegram["notify_on_update"] != false {
		t.Fatalf("notify_on_update = %#v, want false", got.Telegram["notify_on_update"])
	}
	if got.Telegram["update_check_cron"] != "5 1 * * *" {
		t.Fatalf("update_check_cron = %#v, want preserved cron", got.Telegram["update_check_cron"])
	}
}

func TestSaveConfigCanDisableUpdateCheckCronWithoutDisablingNotifications(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.json")
	t.Setenv("DOCKERCOPILOT_BOT_CONFIG", path)
	cfg := runtimeconfig.Default("secret")
	cfg.Telegram["notify_on_update"] = true
	if err := runtimeconfig.NewStore(path, "secret").Write(cfg); err != nil {
		t.Fatalf("Write() error = %v", err)
	}
	appConfig := config.Config{}
	appConfig.Auth.AccessSecret = "secret"
	logic := NewConfigLogic(context.Background(), svc.NewServiceContext(appConfig))

	resp, err := logic.SaveConfig(&types.BotConfigReq{
		UpdateCheckCron: "off",
		PresentFields: map[string]bool{
			"updateCheckCron": true,
		},
	})
	if err != nil {
		t.Fatalf("SaveConfig() error = %v", err)
	}
	if resp == nil || resp.Code != 200 {
		t.Fatalf("SaveConfig() resp = %#v, want 200", resp)
	}

	got, err := runtimeconfig.NewStore(path, "secret").Read()
	if err != nil {
		t.Fatalf("Read() error = %v", err)
	}
	if got.Telegram["update_check_cron"] != "off" {
		t.Fatalf("update_check_cron = %#v, want off", got.Telegram["update_check_cron"])
	}
	if got.Telegram["notify_on_update"] != true {
		t.Fatalf("notify_on_update = %#v, want preserved true", got.Telegram["notify_on_update"])
	}
}

func TestQQBotConfigRoundTripAndMasksSecret(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.json")
	t.Setenv("DOCKERCOPILOT_BOT_CONFIG", path)
	appConfig := config.Config{}
	appConfig.Auth.AccessSecret = "secret"
	logic := NewConfigLogic(context.Background(), svc.NewServiceContext(appConfig))

	resp, err := logic.SaveConfig(&types.BotConfigReq{
		QQBotEnabled:             true,
		QQBotAppID:               "appid",
		QQBotAppSecret:           "app-secret",
		QQBotSandbox:             true,
		QQBotEventMode:           "gateway",
		QQBotAllowedUserOpenIDs:  "user-1,user-2",
		QQBotAllowedGroupOpenIDs: "group-1",
		QQBotNotifyTargets:       "user:user-1\ngroup:group-1",
		QQBotMarkdownEnabled:     true,
		QQBotButtonsEnabled:      true,
		PresentFields: map[string]bool{
			"qqbotEnabled":             true,
			"qqbotAppId":               true,
			"qqbotAppSecret":           true,
			"qqbotSandbox":             true,
			"qqbotEventMode":           true,
			"qqbotAllowedUserOpenids":  true,
			"qqbotAllowedGroupOpenids": true,
			"qqbotNotifyTargets":       true,
			"qqbotMarkdownEnabled":     true,
			"qqbotButtonsEnabled":      true,
		},
	})
	if err != nil {
		t.Fatalf("SaveConfig() error = %v", err)
	}
	if resp == nil || resp.Code != 200 {
		t.Fatalf("SaveConfig() resp = %#v, want 200", resp)
	}

	stored, err := runtimeconfig.NewStore(path, "secret").Read()
	if err != nil {
		t.Fatalf("Read() error = %v", err)
	}
	if stored.QQBot["app_secret"] != "app-secret" || stored.QQBot["event_mode"] != "gateway" || stored.QQBot["sandbox"] != false {
		t.Fatalf("stored qqbot = %#v, want raw secret, gateway, and sandbox=false", stored.QQBot)
	}

	resp, err = logic.GetConfig()
	if err != nil {
		t.Fatalf("GetConfig() error = %v", err)
	}
	var view runtimeconfig.Config
	if err := decodeConfigResp(resp.Data, &view); err != nil {
		t.Fatalf("decode config resp error = %v", err)
	}
	if view.QQBot["app_secret"] != maskedSecretPlaceholder {
		t.Fatalf("GetConfig app_secret = %#v, want masked", view.QQBot["app_secret"])
	}
}

func TestQQBotMaskedSecretPreservesExistingSecret(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.json")
	t.Setenv("DOCKERCOPILOT_BOT_CONFIG", path)
	cfg := runtimeconfig.Default("secret")
	cfg.QQBot["app_secret"] = "old-secret"
	if err := runtimeconfig.NewStore(path, "secret").Write(cfg); err != nil {
		t.Fatalf("Write() error = %v", err)
	}
	appConfig := config.Config{}
	appConfig.Auth.AccessSecret = "secret"
	logic := NewConfigLogic(context.Background(), svc.NewServiceContext(appConfig))
	resp, err := logic.SaveConfig(&types.BotConfigReq{
		QQBotAppSecret: maskedSecretPlaceholder,
		PresentFields: map[string]bool{
			"qqbotAppSecret": true,
		},
	})
	if err != nil {
		t.Fatalf("SaveConfig() error = %v", err)
	}
	if resp == nil || resp.Code != 200 {
		t.Fatalf("SaveConfig() resp = %#v, want 200", resp)
	}
	got, err := runtimeconfig.NewStore(path, "secret").Read()
	if err != nil {
		t.Fatalf("Read() error = %v", err)
	}
	if got.QQBot["app_secret"] != "old-secret" {
		t.Fatalf("app_secret = %#v, want preserved old secret", got.QQBot["app_secret"])
	}
}
