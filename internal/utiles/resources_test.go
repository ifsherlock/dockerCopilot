package utiles

import (
	"archive/zip"
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"sigs.k8s.io/yaml"
)

func TestComposeFromDockerRunHandlesCommonFlags(t *testing.T) {
	content, err := ComposeFromDockerRun(`docker run -d --name web -it --pull always --hostname apphost --user 1000:1000 --workdir /app --entrypoint /entry.sh --platform linux/amd64 -p 8080:80 -v /host:/data -e TZ=Asia/Shanghai --env-file .env --label traefik.enable=true --network macnet --ip 192.168.50.10 --add-host host.docker.internal:host-gateway --dns 1.1.1.1 --device /dev/dri --cap-add NET_ADMIN nginx:latest nginx -g "daemon off;"`)
	if err != nil {
		t.Fatalf("ComposeFromDockerRun returned error: %v", err)
	}

	service := decodeComposeService(t, content, "web")
	assertEqual(t, service["image"], "nginx:latest", "image")
	assertEqual(t, service["container_name"], "web", "container_name")
	assertEqual(t, service["hostname"], "apphost", "hostname")
	assertEqual(t, service["user"], "1000:1000", "user")
	assertEqual(t, service["working_dir"], "/app", "working_dir")
	assertEqual(t, service["entrypoint"], "/entry.sh", "entrypoint")
	assertEqual(t, service["platform"], "linux/amd64", "platform")
	assertEqual(t, service["network_mode"], "macnet", "network_mode")
	assertEqual(t, service["ipv4_address"], "192.168.50.10", "ipv4_address")
	assertStringSliceContains(t, service["ports"], "8080:80", "ports")
	assertStringSliceContains(t, service["volumes"], "/host:/data", "volumes")
	assertStringSliceContains(t, service["environment"], "TZ=Asia/Shanghai", "environment")
	assertStringSliceContains(t, service["env_file"], ".env", "env_file")
	assertStringSliceContains(t, service["labels"], "traefik.enable=true", "labels")
	assertStringSliceContains(t, service["extra_hosts"], "host.docker.internal:host-gateway", "extra_hosts")
	assertStringSliceContains(t, service["dns"], "1.1.1.1", "dns")
	assertStringSliceContains(t, service["devices"], "/dev/dri", "devices")
	assertStringSliceContains(t, service["cap_add"], "NET_ADMIN", "cap_add")

	command, ok := service["command"].(string)
	if !ok || !strings.Contains(command, `daemon off;`) {
		t.Fatalf("command = %#v, want string containing daemon off;", service["command"])
	}
}

func TestComposeFromDockerRunSupportsCompactShortFlags(t *testing.T) {
	content, err := ComposeFromDockerRun(`docker run --name redis -p6379:6379 -v/data:/data -eREDIS_PASSWORD=secret redis:7`)
	if err != nil {
		t.Fatalf("ComposeFromDockerRun returned error: %v", err)
	}

	service := decodeComposeService(t, content, "redis")
	assertEqual(t, service["image"], "redis:7", "image")
	assertStringSliceContains(t, service["ports"], "6379:6379", "ports")
	assertStringSliceContains(t, service["volumes"], "/data:/data", "volumes")
	assertStringSliceContains(t, service["environment"], "REDIS_PASSWORD=secret", "environment")
}

func TestComposeFromDockerRunDoesNotConsumeImageAfterBooleanFlags(t *testing.T) {
	content, err := ComposeFromDockerRun(`docker run --name web -P --publish-all --no-healthcheck nginx:latest`)
	if err != nil {
		t.Fatalf("ComposeFromDockerRun returned error: %v", err)
	}

	service := decodeComposeService(t, content, "web")
	assertEqual(t, service["image"], "nginx:latest", "image")
}

func TestReadServiceLogsCreatesMissingDirectory(t *testing.T) {
	logDir := filepath.Join(t.TempDir(), "missing-logs")
	t.Setenv("DOCKERCOPILOT_LOG_DIR", logDir)

	logs, err := ReadServiceLogs(100, "", "")
	if err != nil {
		t.Fatalf("ReadServiceLogs returned error: %v", err)
	}
	if !strings.Contains(logs, "No service log files found") {
		t.Fatalf("logs = %q, want empty-log hint", logs)
	}
	if _, err := os.Stat(logDir); err != nil {
		t.Fatalf("log directory was not created: %v", err)
	}
}

func TestReadServiceLogsReadsLogFiles(t *testing.T) {
	logDir := t.TempDir()
	t.Setenv("DOCKERCOPILOT_LOG_DIR", logDir)
	if err := os.WriteFile(filepath.Join(logDir, "dockercopilot.log"), []byte("first\nsecond error\nthird\n"), 0644); err != nil {
		t.Fatalf("write log file failed: %v", err)
	}

	logs, err := ReadServiceLogs(1, "", "")
	if err != nil {
		t.Fatalf("ReadServiceLogs returned error: %v", err)
	}
	if strings.TrimSpace(logs) != "third" {
		t.Fatalf("logs = %q, want last line", logs)
	}

	filtered, err := ReadServiceLogs(10, "", "error")
	if err != nil {
		t.Fatalf("ReadServiceLogs with level returned error: %v", err)
	}
	if strings.TrimSpace(filtered) != "second error" {
		t.Fatalf("filtered logs = %q, want matching error line", filtered)
	}
}

func TestParseOnePanelArchive(t *testing.T) {
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	writeZipFile(t, zw, "appstore-dev/apps/2fauth/data.yml", `
name: 2FAuth
tags:
  - 安全
title: 管理双因素身份验证帐户
description: 管理双因素身份验证帐户
additionalProperties:
  key: 2fauth
  name: 2FAuth
  tags:
    - Security
  shortDescZh: 管理双因素身份验证帐户
`)
	writeZipFile(t, zw, "appstore-dev/apps/2fauth/logo.png", "png")
	writeZipFile(t, zw, "appstore-dev/apps/2fauth/6.1.3/docker-compose.yml", `
services:
  2fauth:
    image: 2fauth/2fauth:6.1.3
    container_name: ${CONTAINER_NAME}
`)
	if err := zw.Close(); err != nil {
		t.Fatalf("close zip failed: %v", err)
	}

	apps, err := parseOnePanelArchive(StoreSource{ID: "1panel", Name: "1Panel", URL: "https://codeload.github.com/1Panel-dev/appstore/zip/refs/heads/dev"}, buf.Bytes())
	if err != nil {
		t.Fatalf("parseOnePanelArchive returned error: %v", err)
	}
	if len(apps) != 1 {
		t.Fatalf("apps len = %d, want 1", len(apps))
	}
	app := apps[0]
	assertEqual(t, app.ID, "1panel-2fauth", "id")
	assertEqual(t, app.Name, "2FAuth", "name")
	assertEqual(t, app.Image, "2fauth/2fauth:6.1.3", "image")
	if !strings.Contains(app.Compose, "2fauth/2fauth:6.1.3") {
		t.Fatalf("compose = %q, want image", app.Compose)
	}
	if !strings.Contains(app.Icon, "raw.githubusercontent.com/1Panel-dev/appstore/dev/apps/2fauth/logo.png") {
		t.Fatalf("icon = %q, want raw github icon url", app.Icon)
	}
}

func TestMergeDefaultStoreSourcesAddsOnePanel(t *testing.T) {
	sources, changed := mergeDefaultStoreSources([]StoreSource{{
		ID:      "casaos",
		Name:    "CasaOS AppStore",
		URL:     "https://github.com/IceWhaleTech/CasaOS-AppStore/archive/refs/heads/main.zip",
		Enabled: true,
		Builtin: true,
	}})
	if !changed {
		t.Fatalf("changed = false, want true")
	}
	foundOnePanel := false
	foundCasaCodeload := false
	for _, source := range sources {
		if source.ID == "1panel" && source.Enabled && source.Builtin {
			foundOnePanel = true
		}
		if source.ID == "casaos" && strings.Contains(source.URL, "codeload.github.com") {
			foundCasaCodeload = true
		}
	}
	if !foundOnePanel {
		t.Fatalf("1panel source missing: %#v", sources)
	}
	if !foundCasaCodeload {
		t.Fatalf("casaos source was not migrated to codeload: %#v", sources)
	}
}

func TestResolveComposeBindVolumes(t *testing.T) {
	baseDir := filepath.Join(string(os.PathSeparator), "data", "compose", "media")
	got := resolveComposeBindVolumes(baseDir, []string{
		"./data:/config",
		"../shared:/shared:ro",
		"app_data:/config",
		"/mnt/media:/media",
	})

	assertStringSliceContainsExact(t, got, filepath.Join(baseDir, "data")+":/config", "relative current dir bind")
	assertStringSliceContainsExact(t, got, filepath.Join(string(os.PathSeparator), "data", "compose", "shared")+":/shared:ro", "relative parent bind")
	assertStringSliceContainsExact(t, got, "app_data:/config", "named volume")
	assertStringSliceContainsExact(t, got, "/mnt/media:/media", "absolute bind")
}

func TestComposeExternalNetworkNames(t *testing.T) {
	content := `
services:
  app:
    image: nginx
    networks:
      - 1panel-network
      - renamed
networks:
  1panel-network:
    external: true
  renamed:
    name: real-network-name
    external: true
  internal-only:
    driver: bridge
`
	got, err := composeExternalNetworkNames(content)
	if err != nil {
		t.Fatalf("composeExternalNetworkNames() error = %v", err)
	}
	assertStringSliceContainsExact(t, got, "1panel-network", "external network key")
	assertStringSliceContainsExact(t, got, "real-network-name", "external network name")
	if len(got) != 2 {
		t.Fatalf("composeExternalNetworkNames() = %#v, want 2 networks", got)
	}
}

func TestNormalizeComposeNetworks(t *testing.T) {
	got := normalizeComposeNetworks(map[string]interface{}{
		"backend": nil,
		"front":   map[string]interface{}{"aliases": []interface{}{"web"}},
	})
	assertStringSliceContainsExact(t, got, "backend", "map network")
	assertStringSliceContainsExact(t, got, "front", "map network")
	if len(got) != 2 {
		t.Fatalf("normalizeComposeNetworks() = %#v, want 2 networks", got)
	}
}

func TestContainerBelongsToComposeProjectSupportsStandardAndFallbackLabels(t *testing.T) {
	tests := []struct {
		name    string
		labels  map[string]string
		project string
		want    bool
	}{
		{
			name:    "standard compose label",
			labels:  map[string]string{"com.docker.compose.project": "media"},
			project: "media",
			want:    true,
		},
		{
			name:    "dockercopilot fallback label",
			labels:  map[string]string{"com.dockercopilot.compose.project": "media"},
			project: "media",
			want:    true,
		},
		{
			name:    "different project",
			labels:  map[string]string{"com.docker.compose.project": "other"},
			project: "media",
			want:    false,
		},
		{
			name:    "missing labels",
			labels:  nil,
			project: "media",
			want:    false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := containerBelongsToComposeProject(tt.labels, tt.project); got != tt.want {
				t.Fatalf("containerBelongsToComposeProject() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestComposeProjectStatus(t *testing.T) {
	tests := []struct {
		name    string
		running int
		stopped int
		errors  int
		total   int
		want    string
	}{
		{name: "all running", running: 2, total: 2, want: "running"},
		{name: "partial running", running: 1, stopped: 1, total: 2, want: "partial"},
		{name: "all stopped", stopped: 2, total: 2, want: "stopped"},
		{name: "error wins", running: 1, errors: 1, total: 2, want: "error"},
		{name: "no containers", total: 0, want: "stopped"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := composeProjectStatus(tt.running, tt.stopped, tt.errors, tt.total); got != tt.want {
				t.Fatalf("composeProjectStatus() = %q, want %q", got, tt.want)
			}
		})
	}
}

func decodeComposeService(t *testing.T, content string, name string) map[string]interface{} {
	t.Helper()
	var doc map[string]interface{}
	if err := yaml.Unmarshal([]byte(content), &doc); err != nil {
		t.Fatalf("yaml unmarshal failed: %v\n%s", err, content)
	}
	services, ok := doc["services"].(map[string]interface{})
	if !ok {
		t.Fatalf("services missing in compose: %#v", doc)
	}
	service, ok := services[name].(map[string]interface{})
	if !ok {
		t.Fatalf("service %q missing in compose services: %#v", name, services)
	}
	return service
}

func writeZipFile(t *testing.T, zw *zip.Writer, name string, content string) {
	t.Helper()
	w, err := zw.Create(name)
	if err != nil {
		t.Fatalf("create zip file %s failed: %v", name, err)
	}
	if _, err := w.Write([]byte(content)); err != nil {
		t.Fatalf("write zip file %s failed: %v", name, err)
	}
}

func assertEqual(t *testing.T, got interface{}, want string, field string) {
	t.Helper()
	if got != want {
		t.Fatalf("%s = %#v, want %q", field, got, want)
	}
}

func assertStringSliceContains(t *testing.T, got interface{}, want string, field string) {
	t.Helper()
	items, ok := got.([]interface{})
	if !ok {
		t.Fatalf("%s = %#v, want []interface{}", field, got)
	}
	for _, item := range items {
		if item == want {
			return
		}
	}
	t.Fatalf("%s = %#v, want item %q", field, got, want)
}

func assertStringSliceContainsExact(t *testing.T, got []string, want string, field string) {
	t.Helper()
	for _, item := range got {
		if item == want {
			return
		}
	}
	t.Fatalf("%s = %#v, want item %q", field, got, want)
}
