package inventory

import (
	"os"
	"strings"
)

const selfContainerIDEnv = "DOCKERCOPILOT_CONTAINER_ID"

// CurrentContainerID returns the real Docker container ID when running in a
// container. Docker bind-mounts /etc/hostname from a path containing that ID,
// even when the container has a custom hostname.
func CurrentContainerID() string {
	if id := strings.TrimSpace(os.Getenv(selfContainerIDEnv)); id != "" {
		return id
	}
	if mountInfo, err := os.ReadFile("/proc/self/mountinfo"); err == nil {
		if id := containerIDFromMountInfo(string(mountInfo)); id != "" {
			return id
		}
	}
	hostname, _ := os.Hostname()
	return strings.TrimSpace(hostname)
}

func containerIDFromMountInfo(content string) string {
	for _, line := range strings.Split(content, "\n") {
		fields := strings.Fields(line)
		if len(fields) < 5 || !isDockerIdentityMount(fields[4]) {
			continue
		}
		parts := strings.Split(fields[3], "/")
		for i := 0; i+1 < len(parts); i++ {
			if parts[i] == "containers" && isFullContainerID(parts[i+1]) {
				return strings.ToLower(parts[i+1])
			}
		}
	}
	return ""
}

func isDockerIdentityMount(path string) bool {
	switch path {
	case "/etc/hostname", "/etc/hosts", "/etc/resolv.conf":
		return true
	default:
		return false
	}
}

func isFullContainerID(value string) bool {
	if len(value) != 64 {
		return false
	}
	for _, char := range value {
		if (char < '0' || char > '9') && (char < 'a' || char > 'f') && (char < 'A' || char > 'F') {
			return false
		}
	}
	return true
}
