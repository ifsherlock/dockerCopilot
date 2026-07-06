package composeproject

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"sigs.k8s.io/yaml"
)

func TestFromDockerRunHandlesCommonFlags(t *testing.T) {
	content, err := FromDockerRun(`docker run -d --name web -it --pull always --hostname apphost --user 1000:1000 --workdir /app --entrypoint /entry.sh --platform linux/amd64 -p 8080:80 -v /host:/data -e TZ=Asia/Shanghai --env-file .env --label traefik.enable=true --network macnet --ip 192.168.50.10 --add-host host.docker.internal:host-gateway --dns 1.1.1.1 --device /dev/dri --cap-add NET_ADMIN nginx:latest nginx -g "daemon off;"`)
	if err != nil {
		t.Fatalf("FromDockerRun returned error: %v", err)
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

func TestFromDockerRunSupportsCompactShortFlags(t *testing.T) {
	content, err := FromDockerRun(`docker run --name redis -p6379:6379 -v/data:/data -eREDIS_PASSWORD=secret redis:7`)
	if err != nil {
		t.Fatalf("FromDockerRun returned error: %v", err)
	}

	service := decodeComposeService(t, content, "redis")
	assertEqual(t, service["image"], "redis:7", "image")
	assertStringSliceContains(t, service["ports"], "6379:6379", "ports")
	assertStringSliceContains(t, service["volumes"], "/data:/data", "volumes")
	assertStringSliceContains(t, service["environment"], "REDIS_PASSWORD=secret", "environment")
}

func TestFromDockerRunDoesNotConsumeImageAfterBooleanFlags(t *testing.T) {
	content, err := FromDockerRun(`docker run --name web -P --publish-all --no-healthcheck nginx:latest`)
	if err != nil {
		t.Fatalf("FromDockerRun returned error: %v", err)
	}

	service := decodeComposeService(t, content, "web")
	assertEqual(t, service["image"], "nginx:latest", "image")
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
