package composeproject

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strings"

	"github.com/docker/docker/api/types/network"
	"github.com/onlyLTY/dockerCopilot/internal/svc"
	"sigs.k8s.io/yaml"
)

func runComposeCommand(ctx *svc.ServiceContext, taskID string, project Project, action string) error {
	if _, err := os.Stat(project.Path); err != nil {
		if os.IsNotExist(err) {
			return fmt.Errorf("Compose 文件不存在: %s，请先保存项目再部署", project.Path)
		}
		return err
	}
	if action == "up" || action == "rebuild" || action == "redeploy" {
		if err := ensureComposeExternalNetworks(ctx, taskID, project.Content); err != nil {
			return err
		}
	}
	composePath, cleanup, err := prepareComposeCLIFile(project, taskID)
	if err != nil {
		return err
	}
	defer cleanup()
	projectDir := filepath.Dir(project.Path)
	baseArgs := []string{"compose", "-f", composePath, "--project-directory", projectDir, "-p", project.Name}
	var steps [][]string
	switch action {
	case "up":
		steps = [][]string{{"up", "-d"}}
	case "stop":
		steps = [][]string{{"stop"}}
	case "down":
		steps = [][]string{{"down"}}
	case "restart":
		steps = [][]string{{"restart"}}
	case "pull":
		steps = [][]string{{"pull"}}
	case "rebuild":
		steps = [][]string{{"up", "-d", "--build", "--force-recreate"}}
	case "redeploy":
		// 更新重建：先拉取最新镜像，再强制重建，卷数据不受影响。
		steps = [][]string{{"pull"}, {"up", "-d", "--force-recreate"}}
	default:
		return fmt.Errorf("unsupported compose action: %s", action)
	}
	for i, step := range steps {
		if len(steps) > 1 {
			ctx.AppendProgressLog(taskID, fmt.Sprintf("[%d/%d] docker compose %s", i+1, len(steps), strings.Join(step, " ")))
		}
		cmd := exec.Command("docker", append(append([]string{}, baseArgs...), step...)...)
		cmd.Dir = filepath.Dir(composePath)
		out, err := cmd.CombinedOutput()
		logText := strings.TrimSpace(string(out))
		progress, _ := ctx.GetProgress(taskID)
		if logText != "" {
			progress.Logs = append(progress.Logs, strings.Split(logText, "\n")...)
		}
		if err != nil {
			ctx.UpdateProgress(taskID, progress)
			if composeCLIUnavailable(err, logText) {
				ctx.AppendProgressLog(taskID, "docker compose CLI 不可用或无法访问 Compose 文件，尝试使用 Docker SDK 单服务降级执行")
				return runComposeSDKFallback(ctx, taskID, project, action)
			}
			return err
		}
		ctx.UpdateProgress(taskID, progress)
	}
	progress, _ := ctx.GetProgress(taskID)
	progress.Percentage = 100
	progress.Message = "Compose " + action + " 完成"
	progress.DetailMsg = strings.Join(progress.Logs, "\n")
	progress.IsDone = true
	ctx.UpdateProgress(taskID, progress)
	ctx.AddOperationLog("compose", "Compose "+action+" 完成", project.Name)
	return nil
}

func prepareComposeCLIFile(project Project, taskID string) (string, func(), error) {
	composePath := project.Path
	if abs, err := filepath.Abs(project.Path); err == nil {
		composePath = abs
	}
	if runtime.GOOS == "windows" || !strings.HasPrefix(composePath, string(os.PathSeparator)+"data"+string(os.PathSeparator)) {
		return composePath, func() {}, nil
	}
	workDir, err := os.Getwd()
	if err != nil {
		return "", func() {}, err
	}
	runDir := filepath.Join(workDir, ".dockercopilot-compose-run", sanitizeProjectName(taskID))
	if err := os.MkdirAll(runDir, 0755); err != nil {
		return "", func() {}, err
	}
	target := filepath.Join(runDir, "docker-compose.yaml")
	if err := os.WriteFile(target, []byte(project.Content), 0644); err != nil {
		return "", func() {}, err
	}
	return target, func() { _ = os.RemoveAll(runDir) }, nil
}

func composeCLIUnavailable(err error, output string) bool {
	if err == nil {
		return false
	}
	if errorsIsExecutableMissing(err) {
		return true
	}
	text := strings.ToLower(output + " " + err.Error())
	return strings.Contains(text, "is not a docker command") ||
		strings.Contains(text, "unknown command") ||
		strings.Contains(text, "/var/lib/snapd/void/") ||
		strings.Contains(text, "var/lib/snapd/void") ||
		strings.Contains(text, "executable file not found") ||
		strings.Contains(text, "compose is not")
}

func ensureComposeExternalNetworks(ctx *svc.ServiceContext, taskID string, content string) error {
	names, err := composeExternalNetworkNames(content)
	if err != nil {
		return err
	}
	for _, name := range names {
		if name == "" {
			continue
		}
		if _, err := ctx.DockerClient.NetworkInspect(context.Background(), name, network.InspectOptions{}); err == nil {
			ctx.AppendProgressLog(taskID, "外部网络已存在: "+name)
			continue
		} else if !dockerNotFoundError(err) {
			return err
		}
		ctx.AppendProgressLog(taskID, "创建缺失外部网络: "+name+" (bridge)")
		if _, err := ctx.DockerClient.NetworkCreate(context.Background(), name, network.CreateOptions{
			Driver: "bridge",
			Labels: map[string]string{
				"com.dockercopilot.created": "true",
				"com.dockercopilot.reason":  "compose-external-network",
			},
		}); err != nil {
			if dockerNotFoundError(err) {
				continue
			}
			return err
		}
		ctx.AddOperationLog("network", "创建 Compose 外部网络", name)
	}
	return nil
}

func composeExternalNetworkNames(content string) ([]string, error) {
	var doc map[string]interface{}
	if err := yaml.Unmarshal([]byte(content), &doc); err != nil {
		return nil, err
	}
	rawNetworks, ok := doc["networks"].(map[string]interface{})
	if !ok {
		return nil, nil
	}
	names := []string{}
	seen := map[string]bool{}
	for key, rawSpec := range rawNetworks {
		spec, ok := rawSpec.(map[string]interface{})
		if !ok {
			continue
		}
		if !composeNetworkExternal(spec["external"]) {
			continue
		}
		name := firstNonEmptyString(composeNetworkName(spec["external"]), composeValueString(spec["name"]), key)
		if name == "" || seen[name] {
			continue
		}
		seen[name] = true
		names = append(names, name)
	}
	sort.Strings(names)
	return names, nil
}

func composeNetworkExternal(value interface{}) bool {
	switch typed := value.(type) {
	case bool:
		return typed
	case map[string]interface{}:
		return true
	default:
		return false
	}
}

func composeNetworkName(value interface{}) string {
	if typed, ok := value.(map[string]interface{}); ok {
		return composeValueString(typed["name"])
	}
	return ""
}

func composeValueString(value interface{}) string {
	if value == nil {
		return ""
	}
	text := strings.TrimSpace(fmt.Sprint(value))
	if text == "<nil>" {
		return ""
	}
	return text
}

func dockerNotFoundError(err error) bool {
	if err == nil {
		return false
	}
	text := strings.ToLower(err.Error())
	return strings.Contains(text, "not found") || strings.Contains(text, "no such")
}

func errorsIsExecutableMissing(err error) bool {
	if err == nil {
		return false
	}
	return strings.Contains(strings.ToLower(err.Error()), "executable file not found") ||
		strings.Contains(strings.ToLower(err.Error()), "no such file or directory")
}
