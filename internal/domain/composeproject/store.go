package composeproject

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	dockerTypes "github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/container"
	"github.com/google/uuid"
	"github.com/onlyLTY/dockerCopilot/internal/svc"
)

func List() ([]Project, error) {
	root := composeRoot()
	entries, err := os.ReadDir(root)
	if err != nil {
		if os.IsNotExist(err) {
			return []Project{}, nil
		}
		return nil, err
	}
	projects := []Project{}
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		project, err := Read(entry.Name())
		if err == nil {
			projects = append(projects, project)
		}
	}
	sort.Slice(projects, func(i, j int) bool { return projects[i].Name < projects[j].Name })
	return projects, nil
}

func Read(name string) (Project, error) {
	name = sanitizeProjectName(name)
	path := filepath.Join(composeRoot(), name, "docker-compose.yaml")
	b, err := os.ReadFile(path)
	if err != nil {
		return Project{}, err
	}
	info, _ := os.Stat(path)
	project := Project{
		Name:         name,
		Path:         path,
		Content:      string(b),
		ServiceCount: countComposeServices(b),
	}
	if info != nil {
		project.UpdatedAt = info.ModTime().Format("2006-01-02 15:04:05")
	}
	return project, nil
}

func EnrichStatus(ctx *svc.ServiceContext, project *Project) {
	if ctx == nil || project == nil || strings.TrimSpace(project.Name) == "" {
		return
	}
	containers := composeProjectContainers(ctx, project.Name)
	project.Containers = containers
	project.RunningCount = 0
	project.StoppedCount = 0
	project.ErrorCount = 0
	for _, item := range containers {
		state := strings.ToLower(item.State)
		switch state {
		case "running":
			project.RunningCount++
		case "restarting", "dead":
			project.ErrorCount++
		default:
			project.StoppedCount++
		}
	}
	project.Status = composeProjectStatus(project.RunningCount, project.StoppedCount, project.ErrorCount, len(containers))
}

func composeProjectStatus(running int, stopped int, errors int, total int) string {
	if errors > 0 {
		return "error"
	}
	if total == 0 {
		return "stopped"
	}
	if running == total {
		return "running"
	}
	if running > 0 {
		return "partial"
	}
	return "stopped"
}

func composeProjectContainers(ctx *svc.ServiceContext, projectName string) []ProjectContainer {
	list, err := ctx.DockerClient.ContainerList(context.Background(), container.ListOptions{All: true})
	if err != nil {
		return []ProjectContainer{}
	}
	items := []ProjectContainer{}
	for _, c := range list {
		if !containerBelongsToComposeProject(c.Labels, projectName) {
			continue
		}
		items = append(items, ProjectContainer{
			ID:      c.ID,
			Name:    containerName(c),
			Image:   c.Image,
			State:   c.State,
			Status:  c.Status,
			Ports:   summarizePorts(c.Ports),
			Service: firstNonEmptyString(c.Labels["com.docker.compose.service"], c.Labels["com.dockercopilot.compose.service"]),
			Update:  containerImageHasUpdate(ctx, c.ImageID),
		})
	}
	sort.Slice(items, func(i, j int) bool { return items[i].Name < items[j].Name })
	return items
}

func containerBelongsToComposeProject(labels map[string]string, projectName string) bool {
	if labels == nil {
		return false
	}
	return labels["com.docker.compose.project"] == projectName || labels["com.dockercopilot.compose.project"] == projectName
}

func summarizePorts(ports []dockerTypes.Port) string {
	if len(ports) == 0 {
		return ""
	}
	items := []string{}
	for _, port := range ports {
		if port.PublicPort > 0 {
			items = append(items, fmt.Sprintf("%d->%d/%s", port.PublicPort, port.PrivatePort, port.Type))
		} else {
			items = append(items, fmt.Sprintf("%d/%s", port.PrivatePort, port.Type))
		}
	}
	return strings.Join(items, ", ")
}

func Clear(ctx *svc.ServiceContext, name string) (int, error) {
	project, err := Read(name)
	if err != nil {
		return 0, err
	}
	containers := composeProjectContainers(ctx, project.Name)
	for _, item := range containers {
		if strings.EqualFold(item.State, "running") {
			timeout := 15
			if err := ctx.DockerClient.ContainerStop(context.Background(), item.ID, container.StopOptions{Timeout: &timeout}); err != nil {
				return 0, err
			}
		}
		if err := ctx.DockerClient.ContainerRemove(context.Background(), item.ID, container.RemoveOptions{Force: true}); err != nil {
			return 0, err
		}
	}
	return len(containers), nil
}

func Delete(name string) error {
	name = sanitizeProjectName(name)
	if name == "" {
		return fmt.Errorf("project name is required")
	}
	dir := filepath.Join(composeRoot(), name)
	if _, err := os.Stat(dir); err != nil {
		return err
	}
	return os.RemoveAll(dir)
}

func Save(name string, content string) (Project, error) {
	return SaveWithEnv(name, content, "")
}

// SaveWithEnv 保存项目 compose 文件，envFileContent 非空时一并写入同目录 .env
//（compose 以 --project-directory 运行，.env 会被自动加载用于变量插值）。
func SaveWithEnv(name string, content string, envFileContent string) (Project, error) {
	name = sanitizeProjectName(name)
	if name == "" {
		return Project{}, fmt.Errorf("project name is required")
	}
	if strings.TrimSpace(content) == "" {
		return Project{}, fmt.Errorf("compose content is required")
	}
	dir := filepath.Join(composeRoot(), name)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return Project{}, err
	}
	path := filepath.Join(dir, "docker-compose.yaml")
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		return Project{}, err
	}
	if strings.TrimSpace(envFileContent) != "" {
		if err := os.WriteFile(filepath.Join(dir, ".env"), []byte(envFileContent), 0644); err != nil {
			return Project{}, err
		}
	}
	return Read(name)
}

func Run(ctx *svc.ServiceContext, name string, action string) (string, error) {
	project, err := Read(name)
	if err != nil {
		return "", err
	}
	taskID := uuid.New().String()
	ctx.UpdateProgress(taskID, svc.TaskProgress{
		TaskID:     taskID,
		Percentage: 1,
		Name:       project.Name,
		Message:    "准备执行 Compose " + action,
		DetailMsg:  "准备执行 Compose " + action,
		IsDone:     false,
		Logs:       []string{"compose project: " + project.Name, "action: " + action},
	})
	go func() {
		if err := runComposeCommand(ctx, taskID, project, action); err != nil {
			progress, _ := ctx.GetProgress(taskID)
			progress.Percentage = 100
			progress.Message = "Compose " + action + " 失败"
			progress.DetailMsg = err.Error()
			progress.IsDone = true
			progress.Logs = append(progress.Logs, err.Error())
			ctx.UpdateProgress(taskID, progress)
			ctx.AddOperationLog("compose", "Compose "+action+" 失败", err.Error())
		}
	}()
	return taskID, nil
}
