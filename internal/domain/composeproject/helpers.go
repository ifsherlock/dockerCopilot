package composeproject

import (
	"fmt"
	"os"
	"strings"

	dockerTypes "github.com/docker/docker/api/types"
	"sigs.k8s.io/yaml"
)

func firstNonEmptyString(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func containerName(c dockerTypes.Container) string {
	if len(c.Names) == 0 {
		return c.ID[:minInt(len(c.ID), 12)]
	}
	return strings.TrimPrefix(c.Names[0], "/")
}
func isBuiltinNetwork(name string) bool {
	return name == "bridge" || name == "host" || name == "none"
}

func isDockerRunBoolFlag(arg string) bool {
	switch arg {
	case "-d", "--detach", "-i", "--interactive", "-t", "--tty", "-it", "-ti", "--rm", "--init", "--read-only", "--oom-kill-disable",
		"-P", "--publish-all", "--no-healthcheck", "--disable-content-trust":
		return true
	default:
		return false
	}
}

func dockerRunFlagConsumesValue(arg string) bool {
	if strings.Contains(arg, "=") || isDockerRunBoolFlag(arg) {
		return false
	}
	switch arg {
	case "--add-host", "--annotation", "--attach", "-a", "--blkio-weight", "--blkio-weight-device", "--cap-add", "--cap-drop",
		"--cgroup-parent", "--cidfile", "--cpu-period", "--cpu-quota", "--cpu-rt-period", "--cpu-rt-runtime", "--cpu-shares", "-c",
		"--cpus", "--cpuset-cpus", "--cpuset-mems", "--device", "--device-cgroup-rule", "--device-read-bps", "--device-read-iops",
		"--device-write-bps", "--device-write-iops", "--dns", "--dns-option", "--dns-search", "--domainname", "--entrypoint",
		"--env", "-e", "--env-file", "--expose", "--gpus", "--group-add", "--health-cmd", "--health-interval", "--health-retries",
		"--health-start-interval", "--health-start-period", "--health-timeout", "--hostname", "-h", "--ip", "--ip6", "--ipc",
		"--isolation", "--kernel-memory", "--label", "-l", "--label-file", "--link", "--link-local-ip", "--log-driver", "--log-opt",
		"--mac-address", "--memory", "-m", "--memory-reservation", "--memory-swap", "--memory-swappiness", "--mount", "--name",
		"--network", "--network-alias", "--oom-score-adj", "--pid", "--pids-limit", "--platform", "--publish", "-p", "--pull",
		"--restart", "--runtime", "--security-opt", "--shm-size", "--stop-signal", "--stop-timeout", "--storage-opt", "--sysctl",
		"--tmpfs", "--ulimit", "--user", "-u", "--userns", "--uts", "--volume", "-v", "--volumes-from", "--workdir", "-w":
		return true
	default:
		return len(arg) == 2 && strings.HasPrefix(arg, "-") && !isDockerRunBoolFlag(arg)
	}
}

func composeRoot() string {
	if v := strings.TrimSpace(os.Getenv("DOCKERCOPILOT_COMPOSE_DIR")); v != "" {
		return v
	}
	return defaultComposeDir
}

func sanitizeProjectName(value string) string {
	value = strings.TrimSpace(strings.ToLower(value))
	var b strings.Builder
	for _, r := range value {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '-' || r == '_' {
			b.WriteRune(r)
		} else if r == ' ' || r == '.' {
			b.WriteRune('-')
		}
	}
	return strings.Trim(b.String(), "-_")
}

func countComposeServices(b []byte) int {
	var doc map[string]interface{}
	if err := yaml.Unmarshal(b, &doc); err != nil {
		return 0
	}
	services, ok := doc["services"].(map[string]interface{})
	if !ok {
		return 0
	}
	return len(services)
}

func splitShellWords(command string) ([]string, error) {
	args := []string{}
	var current strings.Builder
	var quote rune
	escaped := false
	for _, r := range strings.TrimSpace(command) {
		if escaped {
			current.WriteRune(r)
			escaped = false
			continue
		}
		if r == '\\' {
			escaped = true
			continue
		}
		if quote != 0 {
			if r == quote {
				quote = 0
			} else {
				current.WriteRune(r)
			}
			continue
		}
		if r == '\'' || r == '"' {
			quote = r
			continue
		}
		if r == ' ' || r == '\t' || r == '\n' {
			if current.Len() > 0 {
				args = append(args, current.String())
				current.Reset()
			}
			continue
		}
		current.WriteRune(r)
	}
	if quote != 0 {
		return nil, fmt.Errorf("命令引号未闭合")
	}
	if current.Len() > 0 {
		args = append(args, current.String())
	}
	return args, nil
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}
