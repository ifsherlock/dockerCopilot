package utiles

import (
	"encoding/json"
	"fmt"
	"net"
	"net/url"
	"os"
	"strconv"
	"strings"

	dockerTypes "github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/client"
	MyType "github.com/onlyLTY/dockerCopilot/internal/types"
)

func BuildImageDockerHubURL(name string) string {
	name = normalizeImageRepoName(name)
	if name == "" || name == "none" {
		return ""
	}
	if strings.Count(name, "/") == 0 {
		name = "library/" + name
	}
	return "https://hub.docker.com/r/" + name
}

func BuildImageGitHubURL(name string) string {
	name = normalizeImageRepoName(name)
	if name == "" || name == "none" {
		return ""
	}
	trimmed := strings.TrimPrefix(name, "docker.io/")
	trimmed = strings.TrimPrefix(trimmed, "ghcr.io/")
	if strings.Count(trimmed, "/") < 1 {
		return ""
	}
	parts := strings.Split(trimmed, "/")
	if len(parts) < 2 {
		return ""
	}
	owner := parts[0]
	repo := parts[1]
	if owner == "library" || owner == "docker" {
		return ""
	}
	return fmt.Sprintf("https://github.com/%s/%s", owner, repo)
}

func normalizeImageRepoName(name string) string {
	name = strings.TrimSpace(strings.ToLower(name))
	name = strings.TrimPrefix(name, "https://")
	name = strings.TrimPrefix(name, "http://")
	name = strings.TrimPrefix(name, "registry-1.docker.io/")
	return name
}

func BuildContainerEndpointLink(item dockerTypes.Container, inspect dockerTypes.ContainerJSON, dockerCli *client.Client) MyType.ContainerEndpointLink {
	result := MyType.ContainerEndpointLink{
		Running: inspect.State != nil && inspect.State.Running,
		HostIP:  detectConfiguredHostIP(dockerCli),
		Source:  "detected",
	}
	if inspect.HostConfig != nil {
		result.NetworkMode = string(inspect.HostConfig.NetworkMode)
	}
	for _, p := range item.Ports {
		result.Ports = append(result.Ports, MyType.ContainerPortBinding{
			PrivatePort: p.PrivatePort,
			PublicPort:  p.PublicPort,
			Type:        p.Type,
			IP:          p.IP,
		})
	}
	result.ExposedPorts = collectExposedPorts(inspect.Config)
	result.EditablePort = chooseEditablePort(result)
	applyContainerEndpointOverride(&result, inspect, dockerCli)
	result.SuggestedURL = chooseSuggestedURL(result)
	result.NeedsManual = result.NetworkMode == "host" && result.SuggestedURL == ""
	return result
}

func chooseSuggestedURL(link MyType.ContainerEndpointLink) string {
	if link.HostIP == "" || !link.Running {
		return ""
	}
	if link.NetworkMode == "host" {
		if port := strings.TrimSpace(link.EditablePort); port != "" {
			return fmt.Sprintf("http://%s:%s", link.HostIP, port)
		}
		return ""
	}
	bestPort := 0
	for _, p := range link.Ports {
		if p.PublicPort == 0 {
			continue
		}
		if bestPort == 0 || preferredPublicPort(int(p.PublicPort)) < preferredPublicPort(bestPort) {
			bestPort = int(p.PublicPort)
		}
	}
	if bestPort == 0 {
		return ""
	}
	return fmt.Sprintf("http://%s:%d", link.HostIP, bestPort)
}

func preferredPublicPort(port int) int {
	score := 100000 + port
	switch port {
	case 80:
		return 1
	case 8080:
		return 2
	case 8000:
		return 3
	case 3000:
		return 4
	case 5000:
		return 5
	case 443:
		return 6
	default:
		return score
	}
}

func chooseEditablePort(link MyType.ContainerEndpointLink) string {
	for _, p := range link.Ports {
		if p.PublicPort > 0 {
			return strconv.Itoa(int(p.PublicPort))
		}
	}
	for _, exp := range link.ExposedPorts {
		if port := strings.TrimSpace(strings.Split(exp, "/")[0]); port != "" {
			return port
		}
	}
	return ""
}

func collectExposedPorts(cfg *container.Config) []string {
	if cfg == nil || len(cfg.ExposedPorts) == 0 {
		return nil
	}
	ports := make([]string, 0, len(cfg.ExposedPorts))
	for p := range cfg.ExposedPorts {
		ports = append(ports, string(p))
	}
	return ports
}

func detectDockerHostIP(dockerCli *client.Client) string {
	if dockerCli != nil {
		if host := dockerCli.DaemonHost(); host != "" {
			if u, err := url.Parse(host); err == nil {
				h := u.Hostname()
				if ip := normalizeHostIP(h); ip != "" {
					return ip
				}
			}
		}
	}
	if ip := outboundIP(); ip != "" {
		return ip
	}
	return "127.0.0.1"
}

func normalizeHostIP(host string) string {
	host = strings.TrimSpace(host)
	if host == "" || host == "localhost" || host == "docker" || host == "unix" {
		return ""
	}
	if ip := net.ParseIP(host); ip != nil {
		if ip.IsLoopback() {
			return ""
		}
		return ip.String()
	}
	ips, err := net.LookupIP(host)
	if err != nil {
		return ""
	}
	for _, ip := range ips {
		if ip == nil || ip.IsLoopback() {
			continue
		}
		if v4 := ip.To4(); v4 != nil {
			return v4.String()
		}
	}
	return ""
}

func outboundIP() string {
	conn, err := net.Dial("udp", "8.8.8.8:80")
	if err != nil {
		return ""
	}
	defer conn.Close()
	addr, ok := conn.LocalAddr().(*net.UDPAddr)
	if !ok || addr == nil || addr.IP == nil || addr.IP.IsLoopback() {
		return ""
	}
	return addr.IP.String()
}

type runtimeConfigForLinks struct {
	Dockercopilot map[string]interface{} `json:"dockercopilot"`
}

func detectConfiguredHostIP(dockerCli *client.Client) string {
	if ip := configuredHostIP(); ip != "" {
		return ip
	}
	return detectDockerHostIP(dockerCli)
}

func configuredHostIP() string {
	path := strings.TrimSpace(os.Getenv("DOCKERCOPILOT_BOT_CONFIG"))
	if path == "" {
		path = "/app/config/config.json"
	}
	b, err := os.ReadFile(path)
	if err != nil || len(b) == 0 {
		return ""
	}
	var cfg runtimeConfigForLinks
	if err := json.Unmarshal(b, &cfg); err != nil {
		return ""
	}
	if cfg.Dockercopilot == nil {
		return ""
	}
	if value, ok := cfg.Dockercopilot["host_lan_ip"]; ok {
		if ip := normalizeHostIP(fmt.Sprint(value)); ip != "" {
			return ip
		}
		trimmed := strings.TrimSpace(fmt.Sprint(value))
		if trimmed != "" {
			return trimmed
		}
	}
	return ""
}

type containerEndpointOverride struct {
	HostIP string `json:"host_ip"`
	Port   string `json:"port"`
}

func applyContainerEndpointOverride(link *MyType.ContainerEndpointLink, inspect dockerTypes.ContainerJSON, dockerCli *client.Client) {
	if link == nil {
		return
	}
	containerName := strings.TrimPrefix(strings.TrimSpace(inspect.Name), "/")
	if override, ok := configuredContainerEndpointOverride(containerName); ok {
		if ip := strings.TrimSpace(override.HostIP); ip != "" {
			link.HostIP = ip
		}
		if port := normalizeEndpointOverridePort(override.Port); port != "" {
			link.EditablePort = port
		}
		link.Source = "container_override"
		return
	}
	if strings.TrimSpace(link.HostIP) != "" {
		link.Source = "host_lan_ip"
		return
	}
	link.HostIP = detectDockerHostIP(dockerCli)
	link.Source = "detected"
}

func normalizeEndpointOverridePort(value string) string {
	v := strings.TrimSpace(value)
	if v == "" {
		return ""
	}
	v = strings.Map(func(r rune) rune {
		if r >= '0' && r <= '9' {
			return r
		}
		return -1
	}, v)
	if v == "" {
		return ""
	}
	return v
}

func configuredContainerEndpointOverride(containerName string) (containerEndpointOverride, bool) {
	containerName = strings.TrimSpace(containerName)
	if containerName == "" {
		return containerEndpointOverride{}, false
	}
	path := strings.TrimSpace(os.Getenv("DOCKERCOPILOT_BOT_CONFIG"))
	if path == "" {
		path = "/app/config/config.json"
	}
	b, err := os.ReadFile(path)
	if err != nil || len(b) == 0 {
		return containerEndpointOverride{}, false
	}
	var cfg runtimeConfigForLinks
	if err := json.Unmarshal(b, &cfg); err != nil || cfg.Dockercopilot == nil {
		return containerEndpointOverride{}, false
	}
	raw, ok := cfg.Dockercopilot["container_endpoint_overrides"]
	if !ok || raw == nil {
		return containerEndpointOverride{}, false
	}
	b2, _ := json.Marshal(raw)
	overrides := map[string]containerEndpointOverride{}
	if err := json.Unmarshal(b2, &overrides); err != nil {
		return containerEndpointOverride{}, false
	}
	override, ok := overrides[containerName]
	if !ok {
		return containerEndpointOverride{}, false
	}
	return override, true
}
