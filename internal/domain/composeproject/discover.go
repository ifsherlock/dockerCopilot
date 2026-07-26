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
// 对每组容器优先读取标签指向的宿主机 compose 文件（直接读取，或经本容器
// 挂载表 / DOCKERCOPILOT_HOST_ROOT 把宿主机路径翻译成容器内路径后读取），
// 读不到则按容器配置反向生成 Compose 内容兜底。
func DiscoverExternal(ctx *svc.ServiceContext) ([]ExternalProject, error) {
	list, err := ctx.DockerClient.ContainerList(context.Background(), container.ListOptions{All: true})
	if err != nil {
		return nil, err
	}
	managed := managedProjectNames()
	mounts := selfContainerMounts(ctx)
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
		projects = append(projects, buildExternalProject(ctx, name, items, mounts))
	}
	sort.Slice(projects, func(i, j int) bool { return projects[i].Name < projects[j].Name })
	return projects, nil
}

type mountPair struct {
	source string
	dest   string
}

// selfContainerMounts 读取 DockerCopilot 自身容器的挂载表（宿主机路径 -> 容器内路径），
// 用于把外部项目 compose 标签里的宿主机路径翻译成容器内可读的路径。
// 容器默认 hostname 即容器短 ID；用户自定义 hostname 时查不到，返回空即可（仅失去翻译能力）。
func selfContainerMounts(ctx *svc.ServiceContext) []mountPair {
	if ctx == nil || ctx.DockerClient == nil {
		return nil
	}
	hostname, err := os.Hostname()
	if err != nil || strings.TrimSpace(hostname) == "" {
		return nil
	}
	inspect, err := ctx.DockerClient.ContainerInspect(context.Background(), hostname)
	if err != nil {
		return nil
	}
	pairs := []mountPair{}
	for _, m := range inspect.Mounts {
		if strings.TrimSpace(m.Source) == "" || strings.TrimSpace(m.Destination) == "" {
			continue
		}
		pairs = append(pairs, mountPair{source: m.Source, dest: m.Destination})
	}
	// 最长前缀优先，保证嵌套挂载时用更精确的映射。
	sort.Slice(pairs, func(i, j int) bool { return len(pairs[i].source) > len(pairs[j].source) })
	return pairs
}

// rebaseHostPath 把宿主机路径按 src 前缀改写到 dst 下；不匹配返回 false。
func rebaseHostPath(hostPath string, srcPrefix string, dst string) (string, bool) {
	srcPrefix = strings.TrimRight(srcPrefix, "/")
	if srcPrefix == "" {
		return "", false
	}
	if hostPath == srcPrefix {
		return dst, true
	}
	if strings.HasPrefix(hostPath, srcPrefix+"/") {
		return strings.TrimRight(dst, "/") + hostPath[len(srcPrefix):], true
	}
	return "", false
}

// hostPathCandidates 返回一个宿主机路径在本容器内可能可读的候选路径列表：
// 原路径（恰好被同路径挂载时可读）→ DOCKERCOPILOT_HOST_ROOT 前缀 → 自身挂载表翻译。
func hostPathCandidates(hostPath string, mounts []mountPair) []string {
	candidates := []string{hostPath}
	if root := strings.TrimRight(strings.TrimSpace(os.Getenv("DOCKERCOPILOT_HOST_ROOT")), "/"); root != "" {
		candidates = append(candidates, root+"/"+strings.TrimLeft(hostPath, "/"))
	}
	for _, pair := range mounts {
		if translated, ok := rebaseHostPath(hostPath, pair.source, pair.dest); ok {
			candidates = append(candidates, translated)
		}
	}
	return candidates
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

func buildExternalProject(ctx *svc.ServiceContext, name string, items []dockerTypes.Container, mounts []mountPair) ExternalProject {
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

	if content, path, ok := readExternalComposeFile(project.WorkingDir, project.ConfigFiles, mounts); ok {
		project.Content = content
		project.Source = "file"
		project.SourceDetail = path
		project.EnvFileContent = readExternalEnvFile(project.WorkingDir, mounts)
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
// 路径是宿主机视角的，先尝试直接读取，再经挂载表翻译成容器内路径读取；
// 相对路径按 working_dir 解析。返回的 SourceDetail 始终是宿主机原路径。
func readExternalComposeFile(workingDir string, configFiles []string, mounts []mountPair) (string, string, bool) {
	for _, path := range configFiles {
		if !filepath.IsAbs(path) && !strings.HasPrefix(path, "/") && workingDir != "" {
			path = strings.TrimRight(workingDir, "/") + "/" + path
		}
		for _, candidate := range hostPathCandidates(path, mounts) {
			b, err := os.ReadFile(candidate)
			if err != nil || len(strings.TrimSpace(string(b))) == 0 {
				continue
			}
			return string(b), path, true
		}
	}
	return "", "", false
}

func readExternalEnvFile(workingDir string, mounts []mountPair) string {
	if workingDir == "" {
		return ""
	}
	envPath := strings.TrimRight(workingDir, "/") + "/.env"
	for _, candidate := range hostPathCandidates(envPath, mounts) {
		if b, err := os.ReadFile(candidate); err == nil {
			return string(b)
		}
	}
	return ""
}

func containerImageHasUpdate(ctx *svc.ServiceContext, imageID string) bool {
	if ctx == nil || imageID == "" {
		return false
	}
	update, ok := ctx.GetHubImageUpdate(imageID)
	return ok && update
}
