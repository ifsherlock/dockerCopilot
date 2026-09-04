package qqbot

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/onlyLTY/dockerCopilot/internal/config"
	"github.com/onlyLTY/dockerCopilot/internal/domain/runtimeconfig"
	"github.com/onlyLTY/dockerCopilot/internal/svc"
)

func TestInstanceUpdateActionsRouteToConfiguredRemote(t *testing.T) {
	var updateCalled bool
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.Header.Get("Authorization"), "Bearer ") {
			t.Errorf("Authorization = %q, want bearer token", r.Header.Get("Authorization"))
		}
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/api/containers":
			_, _ = io.WriteString(w, `{"code":200,"msg":"ok","data":[{"id":"c1","name":"web","usingImage":"nginx:old","createImage":"nginx:latest","haveUpdate":true,"ignored":false,"isSelf":false}]}`)
		case r.Method == http.MethodPost && r.URL.Path == "/api/containers/check-update":
			_, _ = io.WriteString(w, `{"code":200,"msg":"远端检测已提交","data":null}`)
		case r.Method == http.MethodPost && r.URL.Path == "/api/container/c1/update":
			updateCalled = true
			if r.URL.Query().Get("containerName") != "web" || r.URL.Query().Get("imageNameAndTag") != "nginx:latest" {
				t.Errorf("update query = %v", r.URL.Query())
			}
			_, _ = io.WriteString(w, `{"code":200,"msg":"ok","data":{"taskID":"remote-task"}}`)
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	configPath := t.TempDir() + string(os.PathSeparator) + "config.json"
	t.Setenv("DOCKERCOPILOT_BOT_CONFIG", configPath)
	runtimeCfg := runtimeconfig.Default("local-secret")
	runtimeCfg.Dockercopilot["multi_instance_enabled"] = true
	runtimeCfg.Dockercopilot["instances"] = []map[string]interface{}{
		{"name": "local", "api_url": "http://127.0.0.1:12712", "secret_key": "local-secret", "timeout": 30},
		{"name": "nas", "api_url": server.URL, "secret_key": "remote-secret", "timeout": 5},
	}
	if err := runtimeconfig.NewStore(configPath, "local-secret").Write(runtimeCfg); err != nil {
		t.Fatalf("write config: %v", err)
	}
	var appConfig config.Config
	appConfig.Auth.AccessSecret = "local-secret"
	actions := NewActionService(&svc.ServiceContext{Config: appConfig})

	items, instanceName, err := actions.UpdatesForInstance(context.Background(), "NAS")
	if err != nil {
		t.Fatalf("UpdatesForInstance() error = %v", err)
	}
	if instanceName != "nas" || len(items) != 1 || items[0].InstanceName != "nas" || items[0].Name != "web" {
		t.Fatalf("UpdatesForInstance() = %#v, instance=%q", items, instanceName)
	}
	msg, checkedInstance, err := actions.CheckUpdatesForInstance(context.Background(), "nas")
	if err != nil || checkedInstance != "nas" || msg != "远端检测已提交" {
		t.Fatalf("CheckUpdatesForInstance() = msg=%q instance=%q err=%v", msg, checkedInstance, err)
	}
	items[0].IsSelf = true
	taskID, err := actions.UpdateContainer(context.Background(), items[0])
	if err != nil {
		t.Fatalf("UpdateContainer() error = %v", err)
	}
	if taskID != "remote-task" || !updateCalled {
		t.Fatalf("UpdateContainer() taskID=%q called=%v", taskID, updateCalled)
	}
}
