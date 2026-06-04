package utiles

import (
	"archive/zip"
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
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
	"github.com/google/uuid"
	"github.com/onlyLTY/dockerCopilot/internal/svc"
	"github.com/onlyLTY/dockerCopilot/internal/types"
	"sigs.k8s.io/yaml"
)

const (
	defaultComposeDir = "/data/compose"
	defaultStoreDir   = "/data/app-store"
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

type ComposeProject struct {
	Name         string                    `json:"name"`
	Path         string                    `json:"path"`
	Content      string                    `json:"content"`
	UpdatedAt    string                    `json:"updatedAt"`
	ServiceCount int                       `json:"serviceCount"`
	Status       string                    `json:"status"`
	RunningCount int                       `json:"runningCount"`
	StoppedCount int                       `json:"stoppedCount"`
	ErrorCount   int                       `json:"errorCount"`
	Containers   []ComposeProjectContainer `json:"containers"`
}

type ComposeProjectContainer struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Image   string `json:"image"`
	State   string `json:"state"`
	Status  string `json:"status"`
	Ports   string `json:"ports"`
	Service string `json:"service"`
}

type StoreSource struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	URL     string `json:"url"`
	Enabled bool   `json:"enabled"`
	Builtin bool   `json:"builtin"`
}

type StoreApp struct {
	ID          string `json:"id"`
	SourceID    string `json:"sourceId"`
	Name        string `json:"name"`
	Author      string `json:"author"`
	Category    string `json:"category"`
	Description string `json:"description"`
	Icon        string `json:"icon"`
	Image       string `json:"image"`
	Compose     string `json:"compose"`
	UpdatedAt   string `json:"updatedAt"`
}

type sdkComposeDoc struct {
	Services map[string]sdkComposeService `json:"services"`
}

type sdkComposeService struct {
	Image         string      `json:"image"`
	Build         interface{} `json:"build"`
	ContainerName string      `json:"container_name"`
	Restart       string      `json:"restart"`
	Ports         []string    `json:"ports"`
	Volumes       []string    `json:"volumes"`
	Environment   interface{} `json:"environment"`
	Networks      interface{} `json:"networks"`
	NetworkMode   string      `json:"network_mode"`
	Privileged    bool        `json:"privileged"`
	Command       interface{} `json:"command"`
	Entrypoint    interface{} `json:"entrypoint"`
	WorkingDir    string      `json:"working_dir"`
	TTY           bool        `json:"tty"`
}

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

	data.Containers.Total = len(containers)
	for _, c := range containers {
		switch strings.ToLower(c.State) {
		case "running":
			data.Containers.Running++
		case "exited", "created", "dead":
			data.Containers.Stopped++
		case "paused":
			data.Containers.Paused++
		default:
			if c.State != "" {
				data.Containers.Error++
			}
		}
		if cached, ok := ctx.GetHubImageUpdate(c.ImageID); ok && cached {
			data.Containers.UpdateAvailable++
		}
		if strings.EqualFold(c.State, "running") {
			data.RunningContainers = append(data.RunningContainers, summarizeContainer(ctx, c))
		}
		link := summarizeQuickLink(ctx, c)
		if link.URL != "" {
			data.QuickLinks = append(data.QuickLinks, link)
		}
	}

	data.Images.Total = len(images)
	for _, img := range images {
		data.Images.SizeBytes += img.Size
		if img.Containers > 0 {
			data.Images.Used++
		} else {
			data.Images.Unused++
		}
		if len(img.RepoTags) == 0 || hasDanglingTag(img.RepoTags) {
			data.Images.Dangling++
		}
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
	root := composeRoot()
	entries, err := os.ReadDir(root)
	if err != nil {
		if os.IsNotExist(err) {
			return []ComposeProject{}, nil
		}
		return nil, err
	}
	projects := []ComposeProject{}
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		project, err := ReadComposeProject(entry.Name())
		if err == nil {
			projects = append(projects, project)
		}
	}
	sort.Slice(projects, func(i, j int) bool { return projects[i].Name < projects[j].Name })
	return projects, nil
}

func ReadComposeProject(name string) (ComposeProject, error) {
	name = sanitizeProjectName(name)
	path := filepath.Join(composeRoot(), name, "docker-compose.yaml")
	b, err := os.ReadFile(path)
	if err != nil {
		return ComposeProject{}, err
	}
	info, _ := os.Stat(path)
	project := ComposeProject{
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

func EnrichComposeProjectStatus(ctx *svc.ServiceContext, project *ComposeProject) {
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

func composeProjectContainers(ctx *svc.ServiceContext, projectName string) []ComposeProjectContainer {
	list, err := ctx.DockerClient.ContainerList(context.Background(), container.ListOptions{All: true})
	if err != nil {
		return []ComposeProjectContainer{}
	}
	items := []ComposeProjectContainer{}
	for _, c := range list {
		if !containerBelongsToComposeProject(c.Labels, projectName) {
			continue
		}
		items = append(items, ComposeProjectContainer{
			ID:      c.ID,
			Name:    containerName(c),
			Image:   c.Image,
			State:   c.State,
			Status:  c.Status,
			Ports:   summarizePorts(c.Ports),
			Service: firstNonEmptyString(c.Labels["com.docker.compose.service"], c.Labels["com.dockercopilot.compose.service"]),
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

func ClearComposeProject(ctx *svc.ServiceContext, name string) (int, error) {
	project, err := ReadComposeProject(name)
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

func DeleteComposeProject(name string) error {
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

func SaveComposeProject(name string, content string) (ComposeProject, error) {
	name = sanitizeProjectName(name)
	if name == "" {
		return ComposeProject{}, fmt.Errorf("project name is required")
	}
	if strings.TrimSpace(content) == "" {
		return ComposeProject{}, fmt.Errorf("compose content is required")
	}
	dir := filepath.Join(composeRoot(), name)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return ComposeProject{}, err
	}
	path := filepath.Join(dir, "docker-compose.yaml")
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		return ComposeProject{}, err
	}
	return ReadComposeProject(name)
}

func RunComposeProject(ctx *svc.ServiceContext, name string, action string) (string, error) {
	project, err := ReadComposeProject(name)
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

func ComposeFromContainers(ctx *svc.ServiceContext, containerIDs []string) (string, error) {
	all, err := ctx.DockerClient.ContainerList(context.Background(), container.ListOptions{All: true})
	if err != nil {
		return "", err
	}
	wanted := map[string]bool{}
	for _, id := range containerIDs {
		id = strings.TrimSpace(id)
		if id != "" {
			wanted[id] = true
		}
	}
	services := map[string]interface{}{}
	networks := map[string]interface{}{}
	for _, item := range all {
		if len(wanted) > 0 && !wanted[item.ID] && !wanted[item.ID[:minInt(len(item.ID), 12)]] && !wanted[containerName(item)] {
			continue
		}
		inspect, err := ctx.DockerClient.ContainerInspect(context.Background(), item.ID)
		if err != nil {
			return "", err
		}
		name := strings.TrimPrefix(inspect.Name, "/")
		if name == "" {
			name = containerName(item)
		}
		service := map[string]interface{}{
			"image":          inspect.Config.Image,
			"container_name": name,
		}
		if inspect.HostConfig != nil {
			if restart := string(inspect.HostConfig.RestartPolicy.Name); restart != "" && restart != "no" {
				service["restart"] = restart
			}
			if inspect.HostConfig.Privileged {
				service["privileged"] = true
			}
			if mode := string(inspect.HostConfig.NetworkMode); mode == "host" || mode == "none" || strings.HasPrefix(mode, "container:") {
				service["network_mode"] = mode
			}
			ports := []string{}
			for port, bindings := range inspect.HostConfig.PortBindings {
				proto, target := nat.SplitProtoPort(string(port))
				for _, binding := range bindings {
					hostPort := strings.TrimSpace(binding.HostPort)
					if hostPort == "" {
						continue
					}
					value := hostPort + ":" + target
					if strings.TrimSpace(binding.HostIP) != "" && binding.HostIP != "0.0.0.0" {
						value = binding.HostIP + ":" + value
					}
					if proto != "" && proto != "tcp" {
						value += "/" + proto
					}
					ports = append(ports, value)
				}
			}
			sort.Strings(ports)
			if len(ports) > 0 {
				service["ports"] = ports
			}
		}
		if inspect.Config != nil {
			if len(inspect.Config.Env) > 0 {
				service["environment"] = inspect.Config.Env
			}
			if len(inspect.Config.Entrypoint) > 0 {
				service["entrypoint"] = inspect.Config.Entrypoint
			}
			if len(inspect.Config.Cmd) > 0 {
				service["command"] = inspect.Config.Cmd
			}
			if inspect.Config.WorkingDir != "" {
				service["working_dir"] = inspect.Config.WorkingDir
			}
			if inspect.Config.Tty {
				service["tty"] = true
			}
		}
		volumes := []string{}
		for _, mount := range inspect.Mounts {
			source := mount.Source
			if source == "" {
				source = mount.Name
			}
			if source == "" || mount.Destination == "" {
				continue
			}
			value := source + ":" + mount.Destination
			if !mount.RW {
				value += ":ro"
			}
			volumes = append(volumes, value)
		}
		sort.Strings(volumes)
		if len(volumes) > 0 {
			service["volumes"] = volumes
		}
		if service["network_mode"] == nil && inspect.NetworkSettings != nil && len(inspect.NetworkSettings.Networks) > 0 {
			names := []string{}
			for networkName := range inspect.NetworkSettings.Networks {
				if isBuiltinNetwork(networkName) {
					continue
				}
				names = append(names, networkName)
				networks[networkName] = map[string]interface{}{"external": true}
			}
			sort.Strings(names)
			if len(names) > 0 {
				service["networks"] = names
			}
		}
		services[sanitizeProjectName(name)] = service
	}
	if len(services) == 0 {
		return "", fmt.Errorf("no containers matched")
	}
	doc := map[string]interface{}{"services": services}
	if len(networks) > 0 {
		doc["networks"] = networks
	}
	b, err := yaml.Marshal(doc)
	if err != nil {
		return "", err
	}
	ctx.AddOperationLog("compose", "从容器生成 Compose 草稿", fmt.Sprintf("%d services", len(services)))
	return string(b), nil
}

func ComposeFromDockerRun(command string) (string, error) {
	args, err := splitShellWords(command)
	if err != nil {
		return "", err
	}
	if len(args) >= 2 && args[0] == "docker" && args[1] == "run" {
		args = args[2:]
	}
	service := map[string]interface{}{}
	env := []string{}
	ports := []string{}
	volumes := []string{}
	labels := []string{}
	envFiles := []string{}
	expose := []string{}
	extraHosts := []string{}
	dns := []string{}
	devices := []string{}
	capAdd := []string{}
	capDrop := []string{}
	name := "app"
	restart := "unless-stopped"
	for i := 0; i < len(args); i++ {
		arg := args[i]
		next := func() string {
			if i+1 >= len(args) {
				return ""
			}
			i++
			return args[i]
		}
		switch {
		case isDockerRunBoolFlag(arg):
		case arg == "--name":
			name = next()
		case strings.HasPrefix(arg, "--name="):
			name = strings.TrimPrefix(arg, "--name=")
		case arg == "-p" || arg == "--publish":
			ports = append(ports, next())
		case strings.HasPrefix(arg, "-p") && arg != "-p":
			ports = append(ports, strings.TrimPrefix(arg, "-p"))
		case strings.HasPrefix(arg, "-p=") || strings.HasPrefix(arg, "--publish="):
			ports = append(ports, strings.TrimPrefix(strings.TrimPrefix(arg, "-p="), "--publish="))
		case arg == "-v" || arg == "--volume":
			volumes = append(volumes, next())
		case strings.HasPrefix(arg, "-v") && arg != "-v":
			volumes = append(volumes, strings.TrimPrefix(arg, "-v"))
		case strings.HasPrefix(arg, "-v=") || strings.HasPrefix(arg, "--volume="):
			volumes = append(volumes, strings.TrimPrefix(strings.TrimPrefix(arg, "-v="), "--volume="))
		case arg == "-e" || arg == "--env":
			env = append(env, next())
		case strings.HasPrefix(arg, "-e") && arg != "-e":
			env = append(env, strings.TrimPrefix(arg, "-e"))
		case strings.HasPrefix(arg, "-e=") || strings.HasPrefix(arg, "--env="):
			env = append(env, strings.TrimPrefix(strings.TrimPrefix(arg, "-e="), "--env="))
		case arg == "--restart":
			restart = next()
		case strings.HasPrefix(arg, "--restart="):
			restart = strings.TrimPrefix(arg, "--restart=")
		case arg == "--hostname" || arg == "-h":
			service["hostname"] = next()
		case strings.HasPrefix(arg, "--hostname="):
			service["hostname"] = strings.TrimPrefix(arg, "--hostname=")
		case arg == "--user" || arg == "-u":
			service["user"] = next()
		case strings.HasPrefix(arg, "--user="):
			service["user"] = strings.TrimPrefix(arg, "--user=")
		case arg == "--workdir" || arg == "-w":
			service["working_dir"] = next()
		case strings.HasPrefix(arg, "--workdir="):
			service["working_dir"] = strings.TrimPrefix(arg, "--workdir=")
		case arg == "--entrypoint":
			service["entrypoint"] = next()
		case strings.HasPrefix(arg, "--entrypoint="):
			service["entrypoint"] = strings.TrimPrefix(arg, "--entrypoint=")
		case arg == "--platform":
			service["platform"] = next()
		case strings.HasPrefix(arg, "--platform="):
			service["platform"] = strings.TrimPrefix(arg, "--platform=")
		case arg == "--network":
			service["network_mode"] = next()
		case strings.HasPrefix(arg, "--network="):
			service["network_mode"] = strings.TrimPrefix(arg, "--network=")
		case arg == "--ip":
			service["ipv4_address"] = next()
		case strings.HasPrefix(arg, "--ip="):
			service["ipv4_address"] = strings.TrimPrefix(arg, "--ip=")
		case arg == "--label" || arg == "-l":
			labels = append(labels, next())
		case strings.HasPrefix(arg, "--label="):
			labels = append(labels, strings.TrimPrefix(arg, "--label="))
		case arg == "--env-file":
			envFiles = append(envFiles, next())
		case strings.HasPrefix(arg, "--env-file="):
			envFiles = append(envFiles, strings.TrimPrefix(arg, "--env-file="))
		case arg == "--expose":
			expose = append(expose, next())
		case strings.HasPrefix(arg, "--expose="):
			expose = append(expose, strings.TrimPrefix(arg, "--expose="))
		case arg == "--add-host":
			extraHosts = append(extraHosts, next())
		case strings.HasPrefix(arg, "--add-host="):
			extraHosts = append(extraHosts, strings.TrimPrefix(arg, "--add-host="))
		case arg == "--dns":
			dns = append(dns, next())
		case strings.HasPrefix(arg, "--dns="):
			dns = append(dns, strings.TrimPrefix(arg, "--dns="))
		case arg == "--device":
			devices = append(devices, next())
		case strings.HasPrefix(arg, "--device="):
			devices = append(devices, strings.TrimPrefix(arg, "--device="))
		case arg == "--cap-add":
			capAdd = append(capAdd, next())
		case strings.HasPrefix(arg, "--cap-add="):
			capAdd = append(capAdd, strings.TrimPrefix(arg, "--cap-add="))
		case arg == "--cap-drop":
			capDrop = append(capDrop, next())
		case strings.HasPrefix(arg, "--cap-drop="):
			capDrop = append(capDrop, strings.TrimPrefix(arg, "--cap-drop="))
		case arg == "--privileged":
			service["privileged"] = true
		case strings.HasPrefix(arg, "-"):
			if dockerRunFlagConsumesValue(arg) {
				_ = next()
			}
		default:
			service["image"] = arg
			if i+1 < len(args) {
				service["command"] = strings.Join(args[i+1:], " ")
			}
			i = len(args)
		}
	}
	if service["image"] == nil {
		return "", fmt.Errorf("未识别到镜像名称")
	}
	service["container_name"] = name
	service["restart"] = restart
	if len(env) > 0 {
		service["environment"] = env
	}
	if len(ports) > 0 {
		service["ports"] = ports
	}
	if len(volumes) > 0 {
		service["volumes"] = volumes
	}
	if len(labels) > 0 {
		service["labels"] = labels
	}
	if len(envFiles) > 0 {
		service["env_file"] = envFiles
	}
	if len(expose) > 0 {
		service["expose"] = expose
	}
	if len(extraHosts) > 0 {
		service["extra_hosts"] = extraHosts
	}
	if len(dns) > 0 {
		service["dns"] = dns
	}
	if len(devices) > 0 {
		service["devices"] = devices
	}
	if len(capAdd) > 0 {
		service["cap_add"] = capAdd
	}
	if len(capDrop) > 0 {
		service["cap_drop"] = capDrop
	}
	doc := map[string]interface{}{"services": map[string]interface{}{sanitizeProjectName(name): service}}
	b, err := yaml.Marshal(doc)
	return string(b), err
}

func LoadStoreSources() ([]StoreSource, error) {
	if err := os.MkdirAll(storeRoot(), 0755); err != nil {
		return nil, err
	}
	path := filepath.Join(storeRoot(), "sources.json")
	if _, err := os.Stat(path); os.IsNotExist(err) {
		sources := defaultStoreSources()
		if err := saveStoreSources(sources); err != nil {
			return nil, err
		}
		return sources, nil
	}
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var sources []StoreSource
	if err := json.Unmarshal(b, &sources); err != nil {
		return nil, err
	}
	if len(sources) == 0 {
		sources = defaultStoreSources()
	}
	sources, changed := mergeDefaultStoreSources(sources)
	if changed {
		if err := saveStoreSources(sources); err != nil {
			return nil, err
		}
	}
	return sources, nil
}

func SaveStoreSource(req StoreSource) ([]StoreSource, error) {
	sources, err := LoadStoreSources()
	if err != nil {
		return nil, err
	}
	if req.ID == "" {
		req.ID = sanitizeProjectName(req.Name)
	}
	if req.ID == "" {
		return nil, fmt.Errorf("source id is required")
	}
	if req.Name == "" || req.URL == "" {
		return nil, fmt.Errorf("source name and url are required")
	}
	found := false
	for i := range sources {
		if sources[i].ID == req.ID {
			req.Builtin = sources[i].Builtin
			sources[i] = req
			found = true
			break
		}
	}
	if !found {
		sources = append(sources, req)
	}
	return sources, saveStoreSources(sources)
}

func DeleteStoreSource(id string) ([]StoreSource, error) {
	sources, err := LoadStoreSources()
	if err != nil {
		return nil, err
	}
	next := []StoreSource{}
	for _, s := range sources {
		if s.ID == id {
			if s.Builtin {
				return nil, fmt.Errorf("内置商店源不能删除，可禁用")
			}
			continue
		}
		next = append(next, s)
	}
	return next, saveStoreSources(next)
}

func defaultStoreSources() []StoreSource {
	return []StoreSource{
		{
			ID:      "casaos",
			Name:    "CasaOS",
			URL:     "https://codeload.github.com/IceWhaleTech/CasaOS-AppStore/zip/refs/heads/main",
			Enabled: true,
			Builtin: true,
		},
		{
			ID:      "1panel",
			Name:    "1Panel",
			URL:     "https://codeload.github.com/1Panel-dev/appstore/zip/refs/heads/dev",
			Enabled: true,
			Builtin: true,
		},
	}
}

func mergeDefaultStoreSources(sources []StoreSource) ([]StoreSource, bool) {
	changed := false
	index := map[string]int{}
	for i, source := range sources {
		index[source.ID] = i
	}
	for _, builtin := range defaultStoreSources() {
		if i, ok := index[builtin.ID]; ok {
			if !sources[i].Builtin {
				sources[i].Builtin = true
				changed = true
			}
			if builtin.ID == "casaos" && strings.Contains(sources[i].URL, "github.com/IceWhaleTech/CasaOS-AppStore/archive/refs/heads/main.zip") {
				sources[i].URL = builtin.URL
				changed = true
			}
			continue
		}
		sources = append(sources, builtin)
		changed = true
	}
	return sources, changed
}

func saveStoreSources(sources []StoreSource) error {
	if err := os.MkdirAll(storeRoot(), 0755); err != nil {
		return err
	}
	b, err := json.MarshalIndent(sources, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(storeRoot(), "sources.json"), b, 0644)
}

func LoadStoreApps(force bool) ([]StoreApp, error) {
	sources, err := LoadStoreSources()
	if err != nil {
		return nil, err
	}
	apps := []StoreApp{}
	var lastErr error
	for _, source := range sources {
		if !source.Enabled {
			continue
		}
		items, err := loadStoreAppsFromSource(source, force)
		if err != nil {
			lastErr = err
			continue
		}
		apps = append(apps, items...)
	}
	sort.Slice(apps, func(i, j int) bool {
		return strings.ToLower(apps[i].Name) < strings.ToLower(apps[j].Name)
	})
	if len(apps) == 0 && lastErr != nil {
		return fallbackStoreApps(), lastErr
	}
	if len(apps) == 0 {
		return fallbackStoreApps(), nil
	}
	return apps, nil
}

func loadStoreAppsFromSource(source StoreSource, force bool) ([]StoreApp, error) {
	cacheFile := filepath.Join(storeCacheRoot(), source.ID+".json")
	if !force {
		if apps, err := readStoreAppsCache(cacheFile); err == nil && len(apps) > 0 {
			return apps, nil
		}
	}
	archiveBytes, err := downloadStoreArchive(source.URL)
	if err != nil {
		if apps, cacheErr := readStoreAppsCache(cacheFile); cacheErr == nil && len(apps) > 0 {
			return apps, nil
		}
		return nil, err
	}
	apps, err := parseStoreArchive(source, archiveBytes)
	if err != nil {
		if cached, cacheErr := readStoreAppsCache(cacheFile); cacheErr == nil && len(cached) > 0 {
			return cached, nil
		}
		return nil, err
	}
	if err := writeStoreAppsCache(cacheFile, apps); err != nil {
		return apps, nil
	}
	return apps, nil
}

func downloadStoreArchive(url string) ([]byte, error) {
	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("商店源下载失败: HTTP %d", resp.StatusCode)
	}
	return io.ReadAll(io.LimitReader(resp.Body, 350*1024*1024))
}

func parseStoreArchive(source StoreSource, data []byte) ([]StoreApp, error) {
	if strings.EqualFold(source.ID, "1panel") || strings.Contains(strings.ToLower(source.URL), "1panel") {
		if apps, err := parseOnePanelArchive(source, data); err == nil && len(apps) > 0 {
			return apps, nil
		}
	}
	if apps, err := parseCasaOSArchive(source, data); err == nil && len(apps) > 0 {
		return apps, nil
	}
	if apps, err := parseOnePanelArchive(source, data); err == nil && len(apps) > 0 {
		return apps, nil
	}
	return nil, fmt.Errorf("商店源未解析到 Compose 模板")
}

func parseCasaOSArchive(source StoreSource, data []byte) ([]StoreApp, error) {
	reader, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return nil, err
	}
	appsByDir := map[string]*StoreApp{}
	for _, file := range reader.File {
		if file.FileInfo().IsDir() {
			continue
		}
		normalized := strings.ReplaceAll(file.Name, "\\", "/")
		parts := strings.Split(normalized, "/")
		appIdx := -1
		for i, part := range parts {
			if strings.EqualFold(part, "Apps") || strings.EqualFold(part, "apps") {
				appIdx = i
				break
			}
		}
		if appIdx < 0 || appIdx+1 >= len(parts) {
			continue
		}
		appDir := parts[appIdx+1]
		if strings.TrimSpace(appDir) == "" {
			continue
		}
		fileName := strings.ToLower(parts[len(parts)-1])
		app := appsByDir[appDir]
		if app == nil {
			app = &StoreApp{
				ID:       source.ID + "-" + sanitizeProjectName(appDir),
				SourceID: source.ID,
				Name:     humanizeAppName(appDir),
				Author:   source.Name,
				Category: "CasaOS",
			}
			appsByDir[appDir] = app
		}
		switch {
		case fileName == "docker-compose.yml" || fileName == "docker-compose.yaml" || fileName == "compose.yml" || fileName == "compose.yaml":
			content, err := readZipText(file)
			if err == nil && strings.TrimSpace(content) != "" {
				app.Compose = content
				app.Image = firstImageFromCompose(content)
			}
		case fileName == "config.json" || fileName == "app.json":
			content, err := readZipText(file)
			if err == nil {
				applyStoreAppMetadata(app, content)
			}
		case strings.HasSuffix(fileName, ".png") || strings.HasSuffix(fileName, ".svg") || strings.HasSuffix(fileName, ".webp") || strings.HasSuffix(fileName, ".jpg") || strings.HasSuffix(fileName, ".jpeg"):
			if app.Icon == "" {
				app.Icon = normalized
			}
		}
	}
	apps := []StoreApp{}
	now := time.Now().Format("2006-01-02 15:04:05")
	for _, app := range appsByDir {
		if strings.TrimSpace(app.Compose) == "" {
			continue
		}
		app.UpdatedAt = now
		apps = append(apps, *app)
	}
	if len(apps) == 0 {
		return nil, fmt.Errorf("商店源未解析到 CasaOS Compose 模板")
	}
	return apps, nil
}

type onePanelAppDraft struct {
	AppDir   string
	Meta     map[string]interface{}
	IconPath string
	Versions map[string]string
}

func parseOnePanelArchive(source StoreSource, data []byte) ([]StoreApp, error) {
	reader, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return nil, err
	}
	drafts := map[string]*onePanelAppDraft{}
	for _, file := range reader.File {
		if file.FileInfo().IsDir() {
			continue
		}
		normalized := strings.ReplaceAll(file.Name, "\\", "/")
		parts := strings.Split(normalized, "/")
		appIdx := -1
		for i, part := range parts {
			if strings.EqualFold(part, "apps") {
				appIdx = i
				break
			}
		}
		if appIdx < 0 || appIdx+1 >= len(parts) {
			continue
		}
		appDir := strings.TrimSpace(parts[appIdx+1])
		if appDir == "" {
			continue
		}
		draft := drafts[appDir]
		if draft == nil {
			draft = &onePanelAppDraft{AppDir: appDir, Versions: map[string]string{}}
			drafts[appDir] = draft
		}
		fileName := strings.ToLower(parts[len(parts)-1])
		if len(parts) == appIdx+3 && fileName == "data.yml" {
			content, err := readZipText(file)
			if err == nil {
				var meta map[string]interface{}
				if yaml.Unmarshal([]byte(content), &meta) == nil {
					draft.Meta = meta
				}
			}
			continue
		}
		if len(parts) == appIdx+3 && (strings.HasSuffix(fileName, ".png") || strings.HasSuffix(fileName, ".svg") || strings.HasSuffix(fileName, ".webp") || strings.HasSuffix(fileName, ".jpg") || strings.HasSuffix(fileName, ".jpeg")) {
			if draft.IconPath == "" {
				draft.IconPath = strings.Join(parts[appIdx:], "/")
			}
			continue
		}
		if len(parts) == appIdx+4 && (fileName == "docker-compose.yml" || fileName == "docker-compose.yaml" || fileName == "compose.yml" || fileName == "compose.yaml") {
			version := strings.TrimSpace(parts[appIdx+2])
			content, err := readZipText(file)
			if version != "" && err == nil && strings.TrimSpace(content) != "" {
				draft.Versions[version] = content
			}
		}
	}

	apps := []StoreApp{}
	now := time.Now().Format("2006-01-02 15:04:05")
	for appDir, draft := range drafts {
		_, compose := latestOnePanelCompose(draft.Versions)
		if strings.TrimSpace(compose) == "" {
			continue
		}
		meta := draft.Meta
		properties := mapValue(meta, "additionalProperties")
		name := firstNonEmptyString(
			stringValue(properties, "name"),
			stringValue(meta, "name"),
			stringValue(meta, "title"),
			humanizeAppName(appDir),
		)
		description := firstNonEmptyString(
			stringValue(properties, "shortDescZh"),
			stringValue(meta, "description"),
			stringValue(meta, "title"),
		)
		category := firstNonEmptyString(
			firstStringInSlice(meta["tags"]),
			firstStringInSlice(properties["tags"]),
			"1Panel",
		)
		app := StoreApp{
			ID:          source.ID + "-" + sanitizeProjectName(firstNonEmptyString(stringValue(properties, "key"), appDir)),
			SourceID:    source.ID,
			Name:        name,
			Author:      source.Name,
			Category:    category,
			Description: description,
			Icon:        onePanelRawIconURL(source, draft.IconPath),
			Image:       firstImageFromCompose(compose),
			Compose:     compose,
			UpdatedAt:   now,
		}
		apps = append(apps, app)
	}
	if len(apps) == 0 {
		return nil, fmt.Errorf("商店源未解析到 1Panel Compose 模板")
	}
	return apps, nil
}

func latestOnePanelCompose(versions map[string]string) (string, string) {
	names := make([]string, 0, len(versions))
	for version := range versions {
		names = append(names, version)
	}
	sort.Slice(names, func(i, j int) bool {
		return compareVersionLike(names[i], names[j]) > 0
	})
	for _, name := range names {
		if compose := strings.TrimSpace(versions[name]); compose != "" {
			return name, compose
		}
	}
	return "", ""
}

func compareVersionLike(a, b string) int {
	as := versionParts(a)
	bs := versionParts(b)
	maxLen := len(as)
	if len(bs) > maxLen {
		maxLen = len(bs)
	}
	for i := 0; i < maxLen; i++ {
		av, bv := 0, 0
		if i < len(as) {
			av = as[i]
		}
		if i < len(bs) {
			bv = bs[i]
		}
		if av > bv {
			return 1
		}
		if av < bv {
			return -1
		}
	}
	return strings.Compare(a, b)
}

func versionParts(value string) []int {
	fields := strings.FieldsFunc(value, func(r rune) bool {
		return r < '0' || r > '9'
	})
	parts := []int{}
	for _, field := range fields {
		if field == "" {
			continue
		}
		n, err := strconv.Atoi(field)
		if err == nil {
			parts = append(parts, n)
		}
	}
	return parts
}

func mapValue(raw map[string]interface{}, key string) map[string]interface{} {
	if raw == nil {
		return map[string]interface{}{}
	}
	value, ok := raw[key]
	if !ok {
		return map[string]interface{}{}
	}
	switch typed := value.(type) {
	case map[string]interface{}:
		return typed
	case map[interface{}]interface{}:
		next := map[string]interface{}{}
		for k, v := range typed {
			next[fmt.Sprint(k)] = v
		}
		return next
	default:
		return map[string]interface{}{}
	}
}

func stringValue(raw map[string]interface{}, key string) string {
	if raw == nil {
		return ""
	}
	value := strings.TrimSpace(fmt.Sprint(raw[key]))
	if value == "" || value == "<nil>" {
		return ""
	}
	return value
}

func firstNonEmptyString(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func firstStringInSlice(value interface{}) string {
	switch typed := value.(type) {
	case []interface{}:
		for _, item := range typed {
			if s := strings.TrimSpace(fmt.Sprint(item)); s != "" && s != "<nil>" {
				return s
			}
		}
	case []string:
		for _, item := range typed {
			if strings.TrimSpace(item) != "" {
				return strings.TrimSpace(item)
			}
		}
	case string:
		return strings.TrimSpace(typed)
	}
	return ""
}

func onePanelRawIconURL(source StoreSource, iconPath string) string {
	if strings.TrimSpace(iconPath) == "" {
		return ""
	}
	if strings.Contains(source.URL, "github.com/1Panel-dev/appstore") || strings.Contains(source.URL, "codeload.github.com/1Panel-dev/appstore") {
		return "https://raw.githubusercontent.com/1Panel-dev/appstore/dev/" + strings.TrimLeft(iconPath, "/")
	}
	return iconPath
}

func readZipText(file *zip.File) (string, error) {
	reader, err := file.Open()
	if err != nil {
		return "", err
	}
	defer reader.Close()
	b, err := io.ReadAll(io.LimitReader(reader, 2*1024*1024))
	if err != nil {
		return "", err
	}
	return string(b), nil
}

func applyStoreAppMetadata(app *StoreApp, content string) {
	var raw map[string]interface{}
	if err := json.Unmarshal([]byte(content), &raw); err != nil {
		return
	}
	for _, key := range []string{"name", "title", "Name", "Title"} {
		if s := strings.TrimSpace(fmt.Sprint(raw[key])); s != "" && s != "<nil>" {
			app.Name = s
			break
		}
	}
	for _, key := range []string{"description", "Description", "desc"} {
		if s := strings.TrimSpace(fmt.Sprint(raw[key])); s != "" && s != "<nil>" {
			app.Description = s
			break
		}
	}
	for _, key := range []string{"category", "Category"} {
		if s := strings.TrimSpace(fmt.Sprint(raw[key])); s != "" && s != "<nil>" {
			app.Category = s
			break
		}
	}
	for _, key := range []string{"author", "developer", "Author"} {
		if s := strings.TrimSpace(fmt.Sprint(raw[key])); s != "" && s != "<nil>" {
			app.Author = s
			break
		}
	}
}

func readStoreAppsCache(path string) ([]StoreApp, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var apps []StoreApp
	return apps, json.Unmarshal(b, &apps)
}

func writeStoreAppsCache(path string, apps []StoreApp) error {
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return err
	}
	b, err := json.MarshalIndent(apps, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, b, 0644)
}

func fallbackStoreApps() []StoreApp {
	return []StoreApp{
		{ID: "fallback-bazarr", SourceID: "fallback", Name: "Bazarr", Author: "linuxserver", Category: "Media", Description: "Subtitle companion for Sonarr and Radarr.", Image: "lscr.io/linuxserver/bazarr:latest", Compose: fallbackCompose("bazarr", "lscr.io/linuxserver/bazarr:latest", "6767")},
		{ID: "fallback-calibre-web", SourceID: "fallback", Name: "Calibre Web", Author: "linuxserver", Category: "Media", Description: "Web app for browsing and downloading e-books.", Image: "lscr.io/linuxserver/calibre-web:latest", Compose: fallbackCompose("calibre-web", "lscr.io/linuxserver/calibre-web:latest", "8083")},
		{ID: "fallback-cloudbeaver", SourceID: "fallback", Name: "CloudBeaver", Author: "dbeaver", Category: "Developer", Description: "Web database management tool.", Image: "dbeaver/cloudbeaver:latest", Compose: fallbackCompose("cloudbeaver", "dbeaver/cloudbeaver:latest", "8978")},
		{ID: "fallback-next-web", SourceID: "fallback", Name: "ChatGPT Next Web", Author: "Yidadaa", Category: "AI", Description: "A well-known ChatGPT web UI.", Image: "yidadaa/chatgpt-next-web:latest", Compose: fallbackCompose("chatgpt-next-web", "yidadaa/chatgpt-next-web:latest", "3000")},
	}
}

func fallbackCompose(name string, imageName string, port string) string {
	lines := []string{"services:", "  " + name + ":", "    image: " + imageName, "    container_name: " + name, "    restart: unless-stopped"}
	if strings.TrimSpace(port) != "" {
		lines = append(lines, "    ports:", fmt.Sprintf("      - \"%s:%s\"", port, port))
	}
	lines = append(lines, "    volumes:", "      - ./data/"+name+":/config", "    environment:", "      - TZ=Asia/Shanghai")
	return strings.Join(lines, "\n") + "\n"
}

func humanizeAppName(value string) string {
	value = strings.TrimSpace(strings.ReplaceAll(strings.ReplaceAll(value, "_", " "), "-", " "))
	if value == "" {
		return "App"
	}
	parts := strings.Fields(value)
	for i, part := range parts {
		if len(part) > 0 {
			parts[i] = strings.ToUpper(part[:1]) + part[1:]
		}
	}
	return strings.Join(parts, " ")
}

func firstImageFromCompose(content string) string {
	var doc map[string]interface{}
	if err := yaml.Unmarshal([]byte(content), &doc); err != nil {
		return ""
	}
	services, ok := doc["services"].(map[string]interface{})
	if !ok {
		return ""
	}
	for _, raw := range services {
		service, ok := raw.(map[string]interface{})
		if !ok {
			continue
		}
		if imageName := strings.TrimSpace(fmt.Sprint(service["image"])); imageName != "" && imageName != "<nil>" {
			return imageName
		}
	}
	return ""
}

func runComposeCommand(ctx *svc.ServiceContext, taskID string, project ComposeProject, action string) error {
	if _, err := os.Stat(project.Path); err != nil {
		if os.IsNotExist(err) {
			return fmt.Errorf("Compose 文件不存在: %s，请先保存项目再部署", project.Path)
		}
		return err
	}
	if action == "up" || action == "rebuild" {
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
	args := []string{"compose", "-f", composePath, "--project-directory", projectDir, "-p", project.Name}
	switch action {
	case "up":
		args = append(args, "up", "-d")
	case "stop":
		args = append(args, "stop")
	case "down":
		args = append(args, "down")
	case "restart":
		args = append(args, "restart")
	case "pull":
		args = append(args, "pull")
	case "rebuild":
		args = append(args, "up", "-d", "--build", "--force-recreate")
	default:
		return fmt.Errorf("unsupported compose action: %s", action)
	}
	cmd := exec.Command("docker", args...)
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
	progress.Percentage = 100
	progress.Message = "Compose " + action + " 完成"
	progress.DetailMsg = strings.Join(progress.Logs, "\n")
	progress.IsDone = true
	ctx.UpdateProgress(taskID, progress)
	ctx.AddOperationLog("compose", "Compose "+action+" 完成", project.Name)
	return nil
}

func prepareComposeCLIFile(project ComposeProject, taskID string) (string, func(), error) {
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

func runComposeSDKFallback(ctx *svc.ServiceContext, taskID string, project ComposeProject, action string) error {
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

func readSDKCompose(project ComposeProject) (sdkComposeDoc, string, sdkComposeService, error) {
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

func sdkComposeUp(ctx *svc.ServiceContext, taskID string, project ComposeProject, containerName string, service sdkComposeService) error {
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

func serviceToContainerConfig(project ComposeProject, service sdkComposeService) (*container.Config, *container.HostConfig, *network.NetworkingConfig, error) {
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

func storeRoot() string {
	if v := strings.TrimSpace(os.Getenv("DOCKERCOPILOT_STORE_DIR")); v != "" {
		return v
	}
	return defaultStoreDir
}

func storeCacheRoot() string {
	return filepath.Join(storeRoot(), "cache")
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
