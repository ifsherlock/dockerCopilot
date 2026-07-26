package composeproject

import (
	"context"
	"fmt"
	"io"
	"path/filepath"
	"sort"
	"strings"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/image"
	"github.com/docker/docker/api/types/network"
	"github.com/docker/go-connections/nat"
	"github.com/onlyLTY/dockerCopilot/internal/svc"
	"sigs.k8s.io/yaml"
)

func runComposeSDKFallback(ctx *svc.ServiceContext, taskID string, project Project, action string) error {
	doc, serviceName, service, err := readSDKCompose(project)
	if err != nil {
		return err
	}
	_ = doc
	if service.Build != nil {
		return fmt.Errorf("Docker SDK 降级部署不支持 build，请安装 docker compose CLI 后执行")
	}
	if strings.TrimSpace(service.Image) == "" {
		return fmt.Errorf("Docker SDK 降级部署需要 image 字段")
	}
	name := strings.TrimSpace(service.ContainerName)
	if name == "" {
		name = project.Name + "-" + serviceName
	}
	switch action {
	case "up":
		return sdkComposeUp(ctx, taskID, project, name, service)
	case "stop":
		return sdkComposeStop(ctx, taskID, project.Name, name)
	case "down":
		return sdkComposeDown(ctx, taskID, project.Name, name)
	case "restart":
		return sdkComposeRestart(ctx, taskID, project.Name, name)
	case "pull":
		if err := sdkComposePull(ctx, taskID, project.Name, service.Image); err != nil {
			return err
		}
		progress, _ := ctx.GetProgress(taskID)
		progress.Percentage = 100
		progress.Message = "Compose pull 完成（SDK 降级）"
		progress.DetailMsg = strings.Join(progress.Logs, "\n")
		progress.IsDone = true
		ctx.UpdateProgress(taskID, progress)
		ctx.AddOperationLog("compose", "Compose pull 完成（SDK 降级）", service.Image)
		return nil
	case "rebuild":
		return fmt.Errorf("Docker SDK 降级部署不支持 rebuild，请安装 docker compose CLI 后执行")
	default:
		return fmt.Errorf("unsupported compose action for SDK fallback: %s", action)
	}
}

func readSDKCompose(project Project) (sdkComposeDoc, string, sdkComposeService, error) {
	var doc sdkComposeDoc
	if err := yaml.Unmarshal([]byte(project.Content), &doc); err != nil {
		return doc, "", sdkComposeService{}, err
	}
	if len(doc.Services) != 1 {
		return doc, "", sdkComposeService{}, fmt.Errorf("Docker SDK 降级部署仅支持单服务 Compose，当前服务数: %d", len(doc.Services))
	}
	for name, service := range doc.Services {
		return doc, sanitizeProjectName(name), service, nil
	}
	return doc, "", sdkComposeService{}, fmt.Errorf("Compose 未包含 services")
}

func sdkComposeUp(ctx *svc.ServiceContext, taskID string, project Project, containerName string, service sdkComposeService) error {
	if err := sdkComposePull(ctx, taskID, project.Name, service.Image); err != nil {
		return err
	}
	ctx.AppendProgressLog(taskID, "准备创建容器: "+containerName)
	if err := removeExistingContainer(ctx, taskID, containerName); err != nil {
		return err
	}
	config, hostConfig, networkingConfig, err := serviceToContainerConfig(project, service)
	if err != nil {
		return err
	}
	created, err := ctx.DockerClient.ContainerCreate(context.Background(), config, hostConfig, networkingConfig, nil, containerName)
	if err != nil {
		return err
	}
	ctx.AppendProgressLog(taskID, "容器已创建: "+created.ID[:minInt(len(created.ID), 12)])
	if err := ctx.DockerClient.ContainerStart(context.Background(), created.ID, container.StartOptions{}); err != nil {
		return err
	}
	progress, _ := ctx.GetProgress(taskID)
	progress.Percentage = 100
	progress.Message = "Compose up 完成（SDK 降级）"
	progress.DetailMsg = strings.Join(progress.Logs, "\n")
	progress.IsDone = true
	ctx.UpdateProgress(taskID, progress)
	ctx.AddOperationLog("compose", "Compose up 完成（SDK 降级）", containerName)
	return nil
}

func sdkComposeDown(ctx *svc.ServiceContext, taskID string, projectName string, containerName string) error {
	_ = projectName
	if err := removeExistingContainer(ctx, taskID, containerName); err != nil {
		return err
	}
	progress, _ := ctx.GetProgress(taskID)
	progress.Percentage = 100
	progress.Message = "Compose down 完成（SDK 降级）"
	progress.DetailMsg = strings.Join(progress.Logs, "\n")
	progress.IsDone = true
	ctx.UpdateProgress(taskID, progress)
	ctx.AddOperationLog("compose", "Compose down 完成（SDK 降级）", containerName)
	return nil
}

func sdkComposeStop(ctx *svc.ServiceContext, taskID string, projectName string, containerName string) error {
	_ = projectName
	ctx.AppendProgressLog(taskID, "停止容器: "+containerName)
	timeout := 15
	if err := ctx.DockerClient.ContainerStop(context.Background(), containerName, container.StopOptions{Timeout: &timeout}); err != nil {
		if !dockerNotFoundError(err) {
			return err
		}
		ctx.AppendProgressLog(taskID, "容器不存在，跳过停止: "+containerName)
	}
	progress, _ := ctx.GetProgress(taskID)
	progress.Percentage = 100
	progress.Message = "Compose stop 完成（SDK 降级）"
	progress.DetailMsg = strings.Join(progress.Logs, "\n")
	progress.IsDone = true
	ctx.UpdateProgress(taskID, progress)
	ctx.AddOperationLog("compose", "Compose stop 完成（SDK 降级）", containerName)
	return nil
}

func sdkComposeRestart(ctx *svc.ServiceContext, taskID string, projectName string, containerName string) error {
	_ = projectName
	ctx.AppendProgressLog(taskID, "重启容器: "+containerName)
	if err := ctx.DockerClient.ContainerRestart(context.Background(), containerName, container.StopOptions{}); err != nil {
		return err
	}
	progress, _ := ctx.GetProgress(taskID)
	progress.Percentage = 100
	progress.Message = "Compose restart 完成（SDK 降级）"
	progress.DetailMsg = strings.Join(progress.Logs, "\n")
	progress.IsDone = true
	ctx.UpdateProgress(taskID, progress)
	ctx.AddOperationLog("compose", "Compose restart 完成（SDK 降级）", containerName)
	return nil
}

func sdkComposePull(ctx *svc.ServiceContext, taskID string, projectName string, imageName string) error {
	_ = projectName
	ctx.AppendProgressLog(taskID, "拉取镜像: "+imageName)
	reader, err := ctx.DockerClient.ImagePull(context.Background(), imageName, image.PullOptions{})
	if err != nil {
		return err
	}
	defer reader.Close()
	b, err := io.ReadAll(reader)
	if err != nil {
		return err
	}
	for _, line := range strings.Split(strings.TrimSpace(string(b)), "\n") {
		if strings.TrimSpace(line) != "" {
			ctx.AppendProgressLog(taskID, line)
		}
	}
	progress, _ := ctx.GetProgress(taskID)
	if progress.Percentage < 60 {
		progress.Percentage = 60
		progress.Message = "镜像拉取完成（SDK 降级）"
		progress.DetailMsg = strings.Join(progress.Logs, "\n")
		ctx.UpdateProgress(taskID, progress)
	}
	return nil
}

func removeExistingContainer(ctx *svc.ServiceContext, taskID string, containerName string) error {
	inspect, err := ctx.DockerClient.ContainerInspect(context.Background(), containerName)
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "no such container") {
			return nil
		}
		return err
	}
	if inspect.State != nil && inspect.State.Running {
		ctx.AppendProgressLog(taskID, "停止已有容器: "+containerName)
		timeout := 15
		if err := ctx.DockerClient.ContainerStop(context.Background(), inspect.ID, container.StopOptions{Timeout: &timeout}); err != nil {
			return err
		}
	}
	ctx.AppendProgressLog(taskID, "删除已有容器: "+containerName)
	return ctx.DockerClient.ContainerRemove(context.Background(), inspect.ID, container.RemoveOptions{Force: true})
}

func serviceToContainerConfig(project Project, service sdkComposeService) (*container.Config, *container.HostConfig, *network.NetworkingConfig, error) {
	exposedPorts, portBindings, err := nat.ParsePortSpecs(service.Ports)
	if err != nil {
		return nil, nil, nil, err
	}
	config := &container.Config{
		Image:        service.Image,
		Env:          normalizeComposeEnv(service.Environment),
		ExposedPorts: exposedPorts,
		WorkingDir:   service.WorkingDir,
		Tty:          service.TTY,
		Labels: map[string]string{
			"com.dockercopilot.compose.project": project.Name,
		},
	}
	if command := normalizeComposeCommand(service.Command); len(command) > 0 {
		config.Cmd = command
	}
	if entrypoint := normalizeComposeCommand(service.Entrypoint); len(entrypoint) > 0 {
		config.Entrypoint = entrypoint
	}
	hostConfig := &container.HostConfig{
		Binds:        resolveComposeBindVolumes(filepath.Dir(project.Path), service.Volumes),
		PortBindings: portBindings,
		Privileged:   service.Privileged,
	}
	if service.Restart != "" && service.Restart != "no" {
		hostConfig.RestartPolicy = container.RestartPolicy{Name: container.RestartPolicyMode(service.Restart)}
	}
	if service.NetworkMode != "" {
		hostConfig.NetworkMode = container.NetworkMode(service.NetworkMode)
	}
	networkingConfig := &network.NetworkingConfig{}
	if service.NetworkMode == "" {
		networks := normalizeComposeNetworks(service.Networks)
		if len(networks) > 0 {
			networkingConfig.EndpointsConfig = map[string]*network.EndpointSettings{}
			for _, name := range networks {
				networkingConfig.EndpointsConfig[name] = &network.EndpointSettings{}
			}
		}
	}
	return config, hostConfig, networkingConfig, nil
}

func normalizeComposeNetworks(value interface{}) []string {
	seen := map[string]bool{}
	out := []string{}
	add := func(value interface{}) {
		name := composeValueString(value)
		if name == "" || seen[name] {
			return
		}
		seen[name] = true
		out = append(out, name)
	}
	switch typed := value.(type) {
	case []string:
		for _, item := range typed {
			add(item)
		}
	case []interface{}:
		for _, item := range typed {
			add(item)
		}
	case map[string]interface{}:
		for name := range typed {
			add(name)
		}
	case map[string]string:
		for name := range typed {
			add(name)
		}
	case string:
		add(typed)
	}
	sort.Strings(out)
	return out
}

func resolveComposeBindVolumes(baseDir string, volumes []string) []string {
	if len(volumes) == 0 {
		return volumes
	}
	resolved := make([]string, 0, len(volumes))
	for _, volume := range volumes {
		resolved = append(resolved, resolveComposeBindVolume(baseDir, volume))
	}
	return resolved
}

func resolveComposeBindVolume(baseDir string, volume string) string {
	parts := strings.Split(volume, ":")
	if len(parts) < 2 {
		return volume
	}
	source := strings.TrimSpace(parts[0])
	if !isRelativeBindSource(source) {
		return volume
	}
	parts[0] = filepath.Clean(filepath.Join(baseDir, source))
	return strings.Join(parts, ":")
}

func isRelativeBindSource(source string) bool {
	source = strings.TrimSpace(source)
	return source == "." || source == ".." || strings.HasPrefix(source, "./") || strings.HasPrefix(source, "../")
}

func normalizeComposeEnv(value interface{}) []string {
	switch v := value.(type) {
	case nil:
		return nil
	case []string:
		return v
	case []interface{}:
		out := []string{}
		for _, item := range v {
			if s := strings.TrimSpace(fmt.Sprint(item)); s != "" {
				out = append(out, s)
			}
		}
		return out
	case map[string]string:
		out := []string{}
		for key, val := range v {
			out = append(out, key+"="+val)
		}
		sort.Strings(out)
		return out
	case map[string]interface{}:
		out := []string{}
		for key, val := range v {
			out = append(out, key+"="+fmt.Sprint(val))
		}
		sort.Strings(out)
		return out
	default:
		return nil
	}
}

func normalizeComposeCommand(value interface{}) []string {
	switch v := value.(type) {
	case nil:
		return nil
	case string:
		if strings.TrimSpace(v) == "" {
			return nil
		}
		return []string{v}
	case []string:
		return v
	case []interface{}:
		out := []string{}
		for _, item := range v {
			if s := strings.TrimSpace(fmt.Sprint(item)); s != "" {
				out = append(out, s)
			}
		}
		return out
	default:
		return nil
	}
}
