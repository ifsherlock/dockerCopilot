package utiles

import (
	"bufio"
	"bytes"
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"time"

	dockerTypes "github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/image"
	"github.com/docker/docker/api/types/network"
	"github.com/docker/docker/api/types/volume"
	"github.com/docker/go-connections/nat"
	"github.com/onlyLTY/dockerCopilot/internal/domain/blacklist"
	"github.com/onlyLTY/dockerCopilot/internal/domain/composeproject"
	"github.com/onlyLTY/dockerCopilot/internal/domain/inventory"
	"github.com/onlyLTY/dockerCopilot/internal/domain/storecatalog"
	"github.com/onlyLTY/dockerCopilot/internal/domain/summary"
	"github.com/onlyLTY/dockerCopilot/internal/svc"
	"github.com/onlyLTY/dockerCopilot/internal/types"
)

const (
	defaultComposeDir = "/data/compose"
)

type OverviewData struct {
	Docker              DockerSummary      `json:"docker"`
	Containers          ResourceSummary    `json:"containers"`
	Images              ResourceSummary    `json:"images"`
	Networks            ResourceSummary    `json:"networks"`
	Volumes             ResourceSummary    `json:"volumes"`
	Storage             StorageSummary     `json:"storage"`
	QuickLinks          []QuickLink        `json:"quickLinks"`
	RunningContainers   []ContainerSummary `json:"runningContainers"`
	RecentOperationLogs []svc.OperationLog `json:"recentOperationLogs"`
	Warnings            []string           `json:"warnings"`
}

type DockerSummary struct {
	Connected     bool   `json:"connected"`
	Status        string `json:"status"`
	Endpoint      string `json:"endpoint"`
	ServerVersion string `json:"serverVersion"`
	APIVersion    string `json:"apiVersion"`
	OSType        string `json:"osType"`
	Architecture  string `json:"architecture"`
	Message       string `json:"message"`
}

type ResourceSummary struct {
	Total           int    `json:"total"`
	Running         int    `json:"running,omitempty"`
	Stopped         int    `json:"stopped,omitempty"`
	Paused          int    `json:"paused,omitempty"`
	Error           int    `json:"error,omitempty"`
	UpdateAvailable int    `json:"updateAvailable,omitempty"`
	Ignored         int    `json:"ignored,omitempty"`
	Used            int    `json:"used,omitempty"`
	Unused          int    `json:"unused,omitempty"`
	Dangling        int    `json:"dangling,omitempty"`
	Bridge          int    `json:"bridge,omitempty"`
	Macvlan         int    `json:"macvlan,omitempty"`
	Custom          int    `json:"custom,omitempty"`
	SizeBytes       int64  `json:"sizeBytes,omitempty"`
	Size            string `json:"size,omitempty"`
}

type StorageSummary struct {
	Partial bool               `json:"partial"`
	Items   []StorageUsageItem `json:"items"`
	Message string             `json:"message"`
	Raw     string             `json:"raw,omitempty"`
}

type StorageUsageItem struct {
	Type        string `json:"type"`
	Total       string `json:"total"`
	Active      string `json:"active"`
	Size        string `json:"size"`
	Reclaimable string `json:"reclaimable"`
}

type QuickLink struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	URL       string `json:"url"`
	Status    string `json:"status"`
	Image     string `json:"image"`
	IconURL   string `json:"iconUrl"`
	Container string `json:"container"`
}

type ContainerSummary struct {
	ID           string                      `json:"id"`
	Name         string                      `json:"name"`
	Status       string                      `json:"status"`
	Image        string                      `json:"image"`
	RunningTime  string                      `json:"runningTime"`
	EndpointLink types.ContainerEndpointLink `json:"endpointLink"`
}

type NetworkInfo struct {
	ID             string            `json:"id"`
	Name           string            `json:"name"`
	Driver         string            `json:"driver"`
	Scope          string            `json:"scope"`
	Internal       bool              `json:"internal"`
	Attachable     bool              `json:"attachable"`
	Ingress        bool              `json:"ingress"`
	Builtin        bool              `json:"builtin"`
	Containers     int               `json:"containers"`
	ContainerNames []string          `json:"containerNames"`
	Subnet         string            `json:"subnet"`
	Gateway        string            `json:"gateway"`
	IPRange        string            `json:"ipRange"`
	Options        map[string]string `json:"options"`
	Labels         map[string]string `json:"labels"`
	Created        string            `json:"created"`
}

type MacvlanReplaceResult struct {
	OldID             string   `json:"oldId"`
	NewID             string   `json:"newId"`
	NewName           string   `json:"newName"`
	Migrated          []string `json:"migrated"`
	FailedStep        string   `json:"failedStep,omitempty"`
	OldNetworkDeleted bool     `json:"oldNetworkDeleted"`
}

type macvlanMovedContainer struct {
	id       string
	name     string
	ipv4     string
	ipv6     string
	rollback bool
}

type VolumeInfo struct {
	Name           string            `json:"name"`
	Driver         string            `json:"driver"`
	Mountpoint     string            `json:"mountpoint"`
	CreatedAt      string            `json:"createdAt"`
	Labels         map[string]string `json:"labels"`
	Options        map[string]string `json:"options"`
	Scope          string            `json:"scope"`
	InUse          bool              `json:"inUse"`
	ContainerCount int               `json:"containerCount"`
	Containers     []string          `json:"containers"`
}

type ComposeProject = composeproject.Project

type ComposeProjectContainer = composeproject.ProjectContainer

type StoreSource = storecatalog.Source

type StoreApp = storecatalog.App

func GetOverview(ctx *svc.ServiceContext) OverviewData {
	data := OverviewData{
		Docker: DockerSummary{
			Connected: false,
			Status:    "error",
			Endpoint:  dockerEndpoint(),
		},
	}
	ping, err := ctx.DockerClient.Ping(context.Background())
	if err != nil {
		data.Docker.Message = err.Error()
		data.Warnings = append(data.Warnings, "Docker 服务连接异常: "+err.Error())
		return data
	}
	data.Docker.Connected = true
	data.Docker.Status = "connected"
	data.Docker.APIVersion = ping.APIVersion
	data.Docker.OSType = ping.OSType

	if version, err := ctx.DockerClient.ServerVersion(context.Background()); err == nil {
		data.Docker.ServerVersion = version.Version
		data.Docker.Architecture = version.Arch
	}

	containers, _ := ctx.DockerClient.ContainerList(context.Background(), container.ListOptions{All: true})
	images, _ := ctx.DockerClient.ImageList(context.Background(), image.ListOptions{All: true})
	networks, _ := ListNetworks(ctx)
	volumes, _ := ListVolumes(ctx)
	containerSnapshot := inventory.ContainersFromDocker(containers, overviewCreatedImageRefs(ctx, containers), "")
	containerCounts := summary.ContainerCounts(containersToSummaryInventory(containers, containerSnapshot), ctx.UpdateStore, overviewBlacklistMatcher())
	imageSnapshot := inventory.ImagesFromDocker(images, containerSnapshot)
	imageCounts := summary.ImageCounts(imageSnapshot, ctx.UpdateStore, overviewBlacklistMatcher())

	data.Containers.Total = containerCounts.Total
	data.Containers.Running = containerCounts.Running
	data.Containers.Stopped = containerCounts.Stopped
	data.Containers.Paused = containerCounts.Paused
	data.Containers.Error = containerCounts.Error
	data.Containers.UpdateAvailable = containerCounts.UpdateAvailable
	data.Containers.Ignored = containerCounts.Ignored
	for _, c := range containers {
		if strings.EqualFold(c.State, "running") {
			data.RunningContainers = append(data.RunningContainers, summarizeContainer(ctx, c))
		}
		link := summarizeQuickLink(ctx, c)
		if link.URL != "" {
			data.QuickLinks = append(data.QuickLinks, link)
		}
	}

	data.Images.Total = imageCounts.Total
	data.Images.Used = imageCounts.Used
	data.Images.Unused = imageCounts.Unused
	data.Images.Dangling = imageCounts.Dangling
	data.Images.UpdateAvailable = imageCounts.UpdateAvailable
	data.Images.Ignored = imageCounts.Ignored
	for _, img := range images {
		data.Images.SizeBytes += img.Size
	}
	data.Images.Size = formatBytes(data.Images.SizeBytes)

	data.Networks.Total = len(networks)
	for _, n := range networks {
		if n.Driver == "bridge" {
			data.Networks.Bridge++
		}
		if n.Driver == "macvlan" {
			data.Networks.Macvlan++
		}
		if !n.Builtin {
			data.Networks.Custom++
		}
		if n.Containers == 0 && !n.Builtin {
			data.Networks.Unused++
		}
	}

	data.Volumes.Total = len(volumes)
	for _, v := range volumes {
		if v.InUse {
			data.Volumes.Used++
		} else {
			data.Volumes.Unused++
		}
	}

	data.Storage = DockerSystemDf()
	data.RecentOperationLogs = tailOperationLogs(ctx.GetOperationLogs(), 12)
	return data
}

func overviewCreatedImageRefs(ctx *svc.ServiceContext, containers []dockerTypes.Container) map[string]string {
	refs := make(map[string]string, len(containers))
	for _, container := range containers {
		inspect, err := ctx.DockerClient.ContainerInspect(context.Background(), container.ID)
		if err != nil || inspect.Config == nil {
			continue
		}
		refs[container.ID] = inspect.Config.Image
	}
	return refs
}

func containersToSummaryInventory(raw []dockerTypes.Container, snapshot []inventory.Container) []inventory.Container {
	if len(raw) != len(snapshot) {
		return snapshot
	}
	out := make([]inventory.Container, len(snapshot))
	copy(out, snapshot)
	for i := range raw {
		if strings.TrimSpace(out[i].CreatedImageRef) == "" {
			out[i].CreatedImageRef = raw[i].Image
		}
	}
	return out
}

func overviewBlacklistMatcher() blacklist.Matcher {
	cfg, err := svc.LoadRuntimeConfigForRead()
	if err != nil {
		return blacklist.NewMatcher(nil)
	}
	return blacklist.NewMatcher(blacklist.FromLegacyStrings(svc.StringList(cfg.Telegram["update_blacklist"])))
}

func ListNetworks(ctx *svc.ServiceContext) ([]NetworkInfo, error) {
	list, err := ctx.DockerClient.NetworkList(context.Background(), network.ListOptions{})
	if err != nil {
		return nil, err
	}
	var out []NetworkInfo
	for _, n := range list {
		item := NetworkInfo{
			ID:         n.ID,
			Name:       n.Name,
			Driver:     n.Driver,
			Scope:      n.Scope,
			Internal:   n.Internal,
			Attachable: n.Attachable,
			Ingress:    n.Ingress,
			Builtin:    isBuiltinNetwork(n.Name),
			Options:    n.Options,
			Labels:     n.Labels,
			Created:    n.Created.Format("2006-01-02 15:04:05"),
		}
		if len(n.IPAM.Config) > 0 {
			item.Subnet = n.IPAM.Config[0].Subnet
			item.Gateway = n.IPAM.Config[0].Gateway
			item.IPRange = n.IPAM.Config[0].IPRange
		}
		if detail, err := ctx.DockerClient.NetworkInspect(context.Background(), n.ID, network.InspectOptions{}); err == nil {
			item.Containers = len(detail.Containers)
			for _, c := range detail.Containers {
				item.ContainerNames = append(item.ContainerNames, c.Name)
			}
			sort.Strings(item.ContainerNames)
		}
		out = append(out, item)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out, nil
}

func CreateNetwork(ctx *svc.ServiceContext, req *types.NetworkCreateReq) (string, error) {
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return "", fmt.Errorf("network name is required")
	}
	driver := strings.TrimSpace(req.Driver)
	if driver == "" {
		driver = "bridge"
	}
	options := map[string]string{}
	for k, v := range req.Options {
		options[k] = v
	}
	if driver == "macvlan" && strings.TrimSpace(req.Parent) != "" {
		options["parent"] = strings.TrimSpace(req.Parent)
	}
	ipam := &network.IPAM{}
	if req.Subnet != "" || req.Gateway != "" || req.IPRange != "" || len(req.AuxAddresses) > 0 {
		ipam.Config = []network.IPAMConfig{{
			Subnet:     strings.TrimSpace(req.Subnet),
			Gateway:    strings.TrimSpace(req.Gateway),
			IPRange:    strings.TrimSpace(req.IPRange),
			AuxAddress: req.AuxAddresses,
		}}
	}
	res, err := ctx.DockerClient.NetworkCreate(context.Background(), name, network.CreateOptions{
		Driver:  driver,
		Options: options,
		Labels:  req.Labels,
		IPAM:    ipam,
	})
	if err != nil {
		return "", err
	}
	ctx.AddOperationLog("network", "创建网络", fmt.Sprintf("%s (%s)", name, driver))
	return res.ID, nil
}

func ConnectNetworkContainer(ctx *svc.ServiceContext, networkID string, req *types.NetworkContainerReq) error {
	if strings.TrimSpace(req.ContainerID) == "" {
		return fmt.Errorf("containerID is required")
	}
	endpoint := &network.EndpointSettings{}
	if req.IPv4Address != "" || req.IPv6Address != "" {
		endpoint.IPAMConfig = &network.EndpointIPAMConfig{
			IPv4Address: strings.TrimSpace(req.IPv4Address),
			IPv6Address: strings.TrimSpace(req.IPv6Address),
		}
	}
	err := ctx.DockerClient.NetworkConnect(context.Background(), networkID, req.ContainerID, endpoint)
	if err != nil {
		return err
	}
	ctx.AddOperationLog("network", "连接容器到网络", fmt.Sprintf("%s -> %s", req.ContainerID, networkID))
	return nil
}

func DisconnectNetworkContainer(ctx *svc.ServiceContext, networkID string, req *types.NetworkContainerReq) error {
	if strings.TrimSpace(req.ContainerID) == "" {
		return fmt.Errorf("containerID is required")
	}
	err := ctx.DockerClient.NetworkDisconnect(context.Background(), networkID, req.ContainerID, req.Force)
	if err != nil {
		return err
	}
	ctx.AddOperationLog("network", "断开容器网络", fmt.Sprintf("%s -/-> %s", req.ContainerID, networkID))
	return nil
}

func ReassignNetworkContainerIP(ctx *svc.ServiceContext, networkID string, req *types.NetworkContainerReq) error {
	rollbackReq := currentNetworkEndpoint(ctx, networkID, req.ContainerID)
	if err := DisconnectNetworkContainer(ctx, networkID, req); err != nil {
		return fmt.Errorf("断开旧网络连接失败: %w", err)
	}
	if err := ConnectNetworkContainer(ctx, networkID, req); err != nil {
		if rollbackReq != nil {
			_ = ConnectNetworkContainer(ctx, networkID, rollbackReq)
		}
		return fmt.Errorf("重新连接并指定 IP 失败: %w", err)
	}
	ctx.AddOperationLog("network", "调整容器网络 IP", fmt.Sprintf("%s @ %s", req.ContainerID, req.IPv4Address))
	return nil
}

func currentNetworkEndpoint(ctx *svc.ServiceContext, networkID string, containerID string) *types.NetworkContainerReq {
	inspect, err := ctx.DockerClient.ContainerInspect(context.Background(), containerID)
	if err != nil || inspect.NetworkSettings == nil {
		return nil
	}
	for name, endpoint := range inspect.NetworkSettings.Networks {
		if endpoint == nil {
			continue
		}
		if name != networkID && endpoint.NetworkID != networkID && endpoint.NetworkID[:minInt(len(endpoint.NetworkID), 12)] != networkID {
			continue
		}
		req := &types.NetworkContainerReq{ContainerID: containerID}
		req.IPv4Address = strings.TrimSpace(strings.Split(endpoint.IPAddress, "/")[0])
		req.IPv6Address = strings.TrimSpace(strings.Split(endpoint.GlobalIPv6Address, "/")[0])
		return req
	}
	return nil
}

func ReplaceMacvlanNetwork(ctx *svc.ServiceContext, oldID string, req *types.NetworkCreateReq) (MacvlanReplaceResult, error) {
	result := MacvlanReplaceResult{OldID: oldID}
	oldNet, err := ctx.DockerClient.NetworkInspect(context.Background(), oldID, network.InspectOptions{})
	if err != nil {
		result.FailedStep = "inspect-old-network"
		return result, err
	}
	if oldNet.Driver != "macvlan" {
		result.FailedStep = "validate-driver"
		return result, fmt.Errorf("只能替换 macvlan 网络，当前 driver: %s", oldNet.Driver)
	}
	req.Driver = "macvlan"
	newID, err := CreateNetwork(ctx, req)
	if err != nil {
		result.FailedStep = "create-new-network"
		return result, err
	}
	result.NewID = newID
	result.NewName = strings.TrimSpace(req.Name)
	if result.NewName == "" {
		result.NewName = newID
	}
	if !req.Migrate {
		ctx.AddOperationLog("network", "创建 macvlan 替换网络", fmt.Sprintf("%s -> %s", oldID, newID))
		return result, nil
	}

	moved := []macvlanMovedContainer{}
	for containerID, endpoint := range oldNet.Containers {
		name := strings.TrimSpace(endpoint.Name)
		if name == "" {
			name = containerID
		}
		connectReq := &types.NetworkContainerReq{
			ContainerID: containerID,
			IPv4Address: stripCIDRSuffix(endpoint.IPv4Address),
			IPv6Address: stripCIDRSuffix(endpoint.IPv6Address),
			Force:       false,
		}
		if err := ConnectNetworkContainer(ctx, newID, connectReq); err != nil {
			result.FailedStep = "connect-" + name
			rollbackMacvlanMoves(ctx, oldID, newID, moved)
			return result, fmt.Errorf("连接容器到新网络失败 (%s): %w", name, err)
		}
		moved = append(moved, macvlanMovedContainer{id: containerID, name: name, ipv4: connectReq.IPv4Address, ipv6: connectReq.IPv6Address, rollback: true})
		if err := DisconnectNetworkContainer(ctx, oldID, &types.NetworkContainerReq{ContainerID: containerID, Force: false}); err != nil {
			result.FailedStep = "disconnect-old-" + name
			rollbackMacvlanMoves(ctx, oldID, newID, moved)
			return result, fmt.Errorf("从旧网络断开容器失败 (%s): %w", name, err)
		}
		result.Migrated = append(result.Migrated, name)
	}
	if req.DeleteOld {
		if err := ctx.DockerClient.NetworkRemove(context.Background(), oldID); err != nil {
			result.FailedStep = "delete-old-network"
			return result, fmt.Errorf("迁移完成但删除旧网络失败: %w", err)
		}
		result.OldNetworkDeleted = true
	}
	ctx.AddOperationLog("network", "替换 macvlan 网络", fmt.Sprintf("%s -> %s, migrated=%d", oldID, newID, len(result.Migrated)))
	return result, nil
}

func rollbackMacvlanMoves(ctx *svc.ServiceContext, oldID string, newID string, moved []macvlanMovedContainer) {
	for i := len(moved) - 1; i >= 0; i-- {
		item := moved[i]
		if item.rollback {
			_ = DisconnectNetworkContainer(ctx, newID, &types.NetworkContainerReq{ContainerID: item.id, Force: true})
			_ = ConnectNetworkContainer(ctx, oldID, &types.NetworkContainerReq{ContainerID: item.id, IPv4Address: item.ipv4, IPv6Address: item.ipv6})
		}
	}
}

func stripCIDRSuffix(value string) string {
	value = strings.TrimSpace(value)
	if idx := strings.Index(value, "/"); idx >= 0 {
		return value[:idx]
	}
	return value
}

func MacvlanBridgeStatus() map[string]interface{} {
	status := map[string]interface{}{
		"supported": runtime.GOOS == "linux",
		"os":        runtime.GOOS,
		"message":   "macvlan 桥接需要在宿主机创建 shim 网卡；当前版本仅提供状态检测和命令提示。",
		"commands": []string{
			"ip link add macvlan-shim link <parent> type macvlan mode bridge",
			"ip addr add <shim-ip>/<prefix> dev macvlan-shim",
			"ip link set macvlan-shim up",
			"ip route add <macvlan-subnet> dev macvlan-shim",
		},
	}
	if runtime.GOOS != "linux" {
		status["ready"] = false
		return status
	}
	if _, err := exec.LookPath("ip"); err != nil {
		status["ready"] = false
		status["message"] = "未找到 ip 命令，无法检测 macvlan shim。"
		return status
	}
	out, err := exec.Command("ip", "link", "show").CombinedOutput()
	status["ready"] = err == nil && strings.Contains(string(out), "macvlan")
	return status
}

func ListVolumes(ctx *svc.ServiceContext) ([]VolumeInfo, error) {
	res, err := ctx.DockerClient.VolumeList(context.Background(), volume.ListOptions{})
	if err != nil {
		return nil, err
	}
	containers, _ := ctx.DockerClient.ContainerList(context.Background(), container.ListOptions{All: true})
	usage := map[string][]string{}
	for _, c := range containers {
		name := containerName(c)
		for _, m := range c.Mounts {
			if m.Type == "volume" && m.Name != "" {
				usage[m.Name] = append(usage[m.Name], name)
			}
		}
	}
	var out []VolumeInfo
	for _, v := range res.Volumes {
		names := usage[v.Name]
		item := VolumeInfo{
			Name:           v.Name,
			Driver:         v.Driver,
			Mountpoint:     v.Mountpoint,
			CreatedAt:      v.CreatedAt,
			Labels:         v.Labels,
			Options:        v.Options,
			Scope:          v.Scope,
			InUse:          len(names) > 0,
			ContainerCount: len(names),
			Containers:     names,
		}
		sort.Strings(item.Containers)
		out = append(out, item)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out, nil
}

func DeleteVolume(ctx *svc.ServiceContext, name string) error {
	name = strings.TrimSpace(name)
	if name == "" {
		return fmt.Errorf("volume name is required")
	}
	volumes, err := ListVolumes(ctx)
	if err != nil {
		return err
	}
	for _, v := range volumes {
		if v.Name == name && v.InUse {
			return fmt.Errorf("卷仍被容器使用: %s", strings.Join(v.Containers, ", "))
		}
	}
	if err := ctx.DockerClient.VolumeRemove(context.Background(), name, false); err != nil {
		return err
	}
	ctx.AddOperationLog("volume", "删除卷", name)
	return nil
}

func ReadServiceLogs(tail int, query string, level string) (string, error) {
	logDir := serviceLogDir()
	entries, err := os.ReadDir(logDir)
	if err != nil {
		if os.IsNotExist(err) {
			if mkErr := os.MkdirAll(logDir, 0755); mkErr != nil {
				return "", mkErr
			}
			return "No service log files found.\nLog directory: " + logDir, nil
		}
		return "", err
	}
	type fileInfo struct {
		path string
		mod  time.Time
	}
	files := []fileInfo{}
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			continue
		}
		if strings.HasSuffix(strings.ToLower(entry.Name()), ".log") || strings.Contains(strings.ToLower(entry.Name()), "docker") {
			files = append(files, fileInfo{path: filepath.Join(logDir, entry.Name()), mod: info.ModTime()})
		}
	}
	sort.Slice(files, func(i, j int) bool { return files[i].mod.After(files[j].mod) })
	if len(files) == 0 {
		return "No service log files found.\nLog directory: " + logDir, nil
	}
	lines := []string{}
	query = strings.ToLower(strings.TrimSpace(query))
	level = strings.ToLower(strings.TrimSpace(level))
	for _, f := range files[:minInt(len(files), 3)] {
		b, err := os.ReadFile(f.path)
		if err != nil {
			continue
		}
		scanner := bufio.NewScanner(bytes.NewReader(b))
		scanner.Buffer(make([]byte, 1024), 1024*1024)
		for scanner.Scan() {
			line := scanner.Text()
			lower := strings.ToLower(line)
			if query != "" && !strings.Contains(lower, query) {
				continue
			}
			if level != "" && level != "all" && !strings.Contains(lower, level) {
				continue
			}
			lines = append(lines, line)
		}
	}
	if tail <= 0 {
		tail = 300
	}
	if len(lines) > tail {
		lines = lines[len(lines)-tail:]
	}
	return strings.Join(lines, "\n"), nil
}

func serviceLogDir() string {
	if logDir := strings.TrimSpace(os.Getenv("DOCKERCOPILOT_LOG_DIR")); logDir != "" {
		return logDir
	}
	if cfg, err := svc.LoadRuntimeConfigForRead(); err == nil && cfg.Dockercopilot != nil {
		if logDir := strings.TrimSpace(fmt.Sprint(cfg.Dockercopilot["service_log_dir"])); logDir != "" {
			return logDir
		}
	}
	return "./logs"
}

func DockerSystemDf() StorageSummary {
	out, err := exec.Command("docker", "system", "df").CombinedOutput()
	if err != nil {
		return StorageSummary{Partial: true, Message: err.Error()}
	}
	raw := strings.TrimSpace(string(out))
	lines := strings.Split(raw, "\n")
	items := []StorageUsageItem{}
	for _, line := range lines[1:] {
		fields := strings.Fields(line)
		if len(fields) < 4 {
			continue
		}
		item := StorageUsageItem{Type: fields[0], Total: fields[1], Active: fields[2], Size: fields[3]}
		if len(fields) >= 5 {
			item.Reclaimable = strings.Join(fields[4:], " ")
		}
		items = append(items, item)
	}
	return StorageSummary{Items: items, Raw: raw}
}

func ListComposeProjects() ([]ComposeProject, error) {
	return composeproject.List()
}

func ReadComposeProject(name string) (ComposeProject, error) {
	return composeproject.Read(name)
}

func EnrichComposeProjectStatus(ctx *svc.ServiceContext, project *ComposeProject) {
	composeproject.EnrichStatus(ctx, project)
}

func ClearComposeProject(ctx *svc.ServiceContext, name string) (int, error) {
	return composeproject.Clear(ctx, name)
}

func DeleteComposeProject(name string) error {
	return composeproject.Delete(name)
}

func SaveComposeProject(name string, content string) (ComposeProject, error) {
	return composeproject.Save(name, content)
}

func RunComposeProject(ctx *svc.ServiceContext, name string, action string) (string, error) {
	return composeproject.Run(ctx, name, action)
}

func ComposeFromContainers(ctx *svc.ServiceContext, containerIDs []string) (string, error) {
	return composeproject.FromContainers(ctx, containerIDs)
}

func ComposeFromDockerRun(command string) (string, error) {
	return composeproject.FromDockerRun(command)
}

func LoadStoreSources() ([]StoreSource, error) {
	return storecatalog.New("").LoadSources()
}

func SaveStoreSource(req StoreSource) ([]StoreSource, error) {
	return storecatalog.New("").SaveSource(req)
}

func DeleteStoreSource(id string) ([]StoreSource, error) {
	return storecatalog.New("").DeleteSource(id)
}

func LoadStoreApps(force bool) ([]StoreApp, error) {
	return storecatalog.New("").LoadApps(force)
}

func summarizeContainer(ctx *svc.ServiceContext, c dockerTypes.Container) ContainerSummary {
	inspect, _ := ctx.DockerClient.ContainerInspect(context.Background(), c.ID)
	return ContainerSummary{
		ID:           c.ID,
		Name:         containerName(c),
		Status:       c.State,
		Image:        c.Image,
		RunningTime:  c.Status,
		EndpointLink: BuildContainerEndpointLink(c, inspect, ctx.DockerClient),
	}
}

func summarizeQuickLink(ctx *svc.ServiceContext, c dockerTypes.Container) QuickLink {
	summary := summarizeContainer(ctx, c)
	if summary.EndpointLink.SuggestedURL == "" {
		return QuickLink{}
	}
	return QuickLink{
		ID:        c.ID,
		Name:      summary.Name,
		URL:       summary.EndpointLink.SuggestedURL,
		Status:    c.State,
		Image:     c.Image,
		Container: c.ID,
	}
}

func containerName(c dockerTypes.Container) string {
	if len(c.Names) == 0 {
		return c.ID[:minInt(len(c.ID), 12)]
	}
	return strings.TrimPrefix(c.Names[0], "/")
}

func hasDanglingTag(tags []string) bool {
	for _, tag := range tags {
		if tag == "<none>:<none>" || strings.Contains(tag, "<none>") {
			return true
		}
	}
	return false
}

func tailOperationLogs(logs []svc.OperationLog, tail int) []svc.OperationLog {
	if len(logs) <= tail {
		return logs
	}
	return logs[len(logs)-tail:]
}

func dockerEndpoint() string {
	if v := os.Getenv("DOCKER_HOST"); strings.TrimSpace(v) != "" {
		return v
	}
	return "unix:///var/run/docker.sock"
}

func formatBytes(size int64) string {
	units := []string{"B", "KB", "MB", "GB", "TB"}
	value := float64(size)
	idx := 0
	for value >= 1024 && idx < len(units)-1 {
		value /= 1024
		idx++
	}
	return fmt.Sprintf("%.1f %s", value, units[idx])
}

func isBuiltinNetwork(name string) bool {
	return name == "bridge" || name == "host" || name == "none"
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func parseTail(value string, fallback int) int {
	n, err := strconv.Atoi(strings.TrimSpace(value))
	if err != nil || n <= 0 {
		return fallback
	}
	if n > 5000 {
		return 5000
	}
	return n
}

func TailFromString(value string, fallback int) int {
	return parseTail(value, fallback)
}

func ExposedPortsFromStrings(values []string) nat.PortSet {
	ports := nat.PortSet{}
	for _, value := range values {
		if value == "" {
			continue
		}
		port, err := nat.NewPort("tcp", value)
		if err == nil {
			ports[port] = struct{}{}
		}
	}
	return ports
}
