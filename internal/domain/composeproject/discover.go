package composeproject

import (
	"context"
	"os"
	"path/filepath"
	"sort"
	"strings"

	dockerTypes "github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/container"
	"github.com/onlyLTY/dockerCopilot/internal/svc"
)

const (
	composeProjectLabel     = "com.docker.compose.project"
	composeServiceLabel     = "com.docker.compose.service"
	composeWorkingDirLabel  = "com.docker.compose.project.working_dir"
	composeConfigFilesLabel = "com.docker.compose.project.config_files"
)

// ExternalProject 是在宿主机上由 compose 创建、但不归本面板托管的项目。
type ExternalProject struct {
	Name           string             `json:"name"`
	Status         string             `json:"status"`
	RunningCount   int                `json:"runningCount"`
	StoppedCount   int                `json:"stoppedCount"`
	ErrorCount     int                `json:"errorCount"`
	Containers     []ProjectContainer `json:"containers"`
	WorkingDir     string             `json:"workingDir"`
	ConfigFiles    []string           `json:"configFiles"`
	Content        string             `json:"content"`
	EnvFileContent string             `json:"envFileContent,omitempty"`
	// Source 标识 Content 的来源：file = 读取自宿主机 compose 文件（SourceDetail 为路径），
	// generated = 文件不可读，由容器配置反向生成。
	Source       string `json:"source"`
	SourceDetail string `json:"sourceDetail,omitempty"`
}

// DiscoverExternal 按 compose 标签发现外部项目：
// 对每组容器优先读取标签指向的宿主机 compose 文件（需该路径被挂载进容器才可读），
// 读不到则按容器配置反向生成 Compose 内容兜底。
func DiscoverExternal(ctx *svc.ServiceContext) ([]ExternalProject, error) {
	list, err := ctx.DockerClient.ContainerList(context.Background(), container.ListOptions{All: true})
	if err != nil {
		return nil, err
	}
	managed := managedProjectNames()
	groups := map[string][]dockerTypes.Container{}
	for _, item := range list {
		project := strings.TrimSpace(item.Labels[composeProjectLabel])
		if project == "" || managed[project] {
			continue
		}
		groups[project] = append(groups[project], item)
	}

	projects := make([]ExternalProject, 0, len(groups))
	for name, items := range groups {
		projects = append(projects, buildExternalProject(ctx, name, items))
	}
	sort.Slice(projects, func(i, j int) bool { return projects[i].Name < projects[j].Name })
	return projects, nil
}

func managedProjectNames() map[string]bool {
	names := map[string]bool{}
	entries, err := os.ReadDir(composeRoot())
	if err != nil {
		return names
	}
	for _, entry := range entries {
		if entry.IsDir() {
			names[entry.Name()] = true
		}
	}
	return names
}

func buildExternalProject(ctx *svc.ServiceContext, name string, items []dockerTypes.Container) ExternalProject {
	project := ExternalProject{Name: name}
	ids := make([]string, 0, len(items))
	for _, item := range items {
		ids = append(ids, item.ID)
		project.Containers = append(project.Containers, ProjectContainer{
			ID:      item.ID,
			Name:    containerName(item),
			Image:   item.Image,
			State:   item.State,
			Status:  item.Status,
			Ports:   summarizePorts(item.Ports),
			Service: strings.TrimSpace(item.Labels[composeServiceLabel]),
			Update:  containerImageHasUpdate(ctx, item.ImageID),
		})
		if project.WorkingDir == "" {
			project.WorkingDir = strings.TrimSpace(item.Labels[composeWorkingDirLabel])
		}
		if len(project.ConfigFiles) == 0 {
			project.ConfigFiles = splitConfigFiles(item.Labels[composeConfigFilesLabel])
		}
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
	sort.Slice(project.Containers, func(i, j int) bool { return project.Containers[i].Name < project.Containers[j].Name })
	project.Status = composeProjectStatus(project.RunningCount, project.StoppedCount, project.ErrorCount, len(project.Containers))

	if content, path, ok := readExternalComposeFile(project.WorkingDir, project.ConfigFiles); ok {
		project.Content = content
		project.Source = "file"
		project.SourceDetail = path
		project.EnvFileContent = readExternalEnvFile(project.WorkingDir)
		return project
	}
	if content, err := FromContainers(ctx, ids); err == nil {
		project.Content = content
	}
	project.Source = "generated"
	return project
}

func splitConfigFiles(raw string) []string {
	files := []string{}
	for _, item := range strings.Split(raw, ",") {
		if path := strings.TrimSpace(item); path != "" {
			files = append(files, path)
		}
	}
	return files
}

// readExternalComposeFile 依次尝试标签给出的 compose 文件路径。
// 路径是宿主机视角的，只有该目录恰好被挂载进容器时才可读；
// 相对路径按 working_dir 解析。
func readExternalComposeFile(workingDir string, configFiles []string) (string, string, bool) {
	for _, path := range configFiles {
		if !filepath.IsAbs(path) && workingDir != "" {
			path = filepath.Join(workingDir, path)
		}
		b, err := os.ReadFile(path)
		if err != nil || len(strings.TrimSpace(string(b))) == 0 {
			continue
		}
		return string(b), path, true
	}
	return "", "", false
}

func readExternalEnvFile(workingDir string) string {
	if workingDir == "" {
		return ""
	}
	b, err := os.ReadFile(filepath.Join(workingDir, ".env"))
	if err != nil {
		return ""
	}
	return string(b)
}

func containerImageHasUpdate(ctx *svc.ServiceContext, imageID string) bool {
	if ctx == nil || imageID == "" {
		return false
	}
	update, ok := ctx.GetHubImageUpdate(imageID)
	return ok && update
}
