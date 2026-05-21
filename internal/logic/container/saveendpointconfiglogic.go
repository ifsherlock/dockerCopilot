package container

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	dockerTypes "github.com/docker/docker/api/types"
	"github.com/onlyLTY/dockerCopilot/internal/svc"
	"github.com/onlyLTY/dockerCopilot/internal/types"
	"github.com/onlyLTY/dockerCopilot/internal/utiles"
	"github.com/zeromicro/go-zero/core/logx"
)

type SaveEndpointConfigLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

func NewSaveEndpointConfigLogic(ctx context.Context, svcCtx *svc.ServiceContext) *SaveEndpointConfigLogic {
	return &SaveEndpointConfigLogic{Logger: logx.WithContext(ctx), ctx: ctx, svcCtx: svcCtx}
}

type endpointConfigRuntime struct {
	Version       string                 `json:"version"`
	Dockercopilot map[string]interface{} `json:"dockercopilot"`
	Telegram      map[string]interface{} `json:"telegram"`
}

func endpointConfigPath() string {
	if p := strings.TrimSpace(os.Getenv("DOCKERCOPILOT_BOT_CONFIG")); p != "" {
		return p
	}
	return "/app/config/config.json"
}

func readEndpointRuntimeConfig() (endpointConfigRuntime, error) {
	cfg := endpointConfigRuntime{Dockercopilot: map[string]interface{}{}, Telegram: map[string]interface{}{}}
	b, err := os.ReadFile(endpointConfigPath())
	if err != nil {
		if os.IsNotExist(err) {
			return cfg, nil
		}
		return cfg, err
	}
	if len(b) == 0 {
		return cfg, nil
	}
	if err := json.Unmarshal(b, &cfg); err != nil {
		return cfg, err
	}
	if cfg.Dockercopilot == nil {
		cfg.Dockercopilot = map[string]interface{}{}
	}
	if cfg.Telegram == nil {
		cfg.Telegram = map[string]interface{}{}
	}
	return cfg, nil
}

func saveEndpointRuntimeConfig(cfg endpointConfigRuntime) error {
	path := endpointConfigPath()
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return err
	}
	b, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, b, 0600)
}

func normalizeEndpointPort(value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return ""
	}
	onlyDigits := strings.Map(func(r rune) rune {
		if r >= '0' && r <= '9' {
			return r
		}
		return -1
	}, trimmed)
	if onlyDigits == "" {
		return ""
	}
	n, err := strconv.Atoi(onlyDigits)
	if err != nil || n <= 0 || n > 65535 {
		return ""
	}
	return strconv.Itoa(n)
}

func normalizeContainerName(name string) string {
	name = strings.TrimSpace(name)
	name = strings.TrimPrefix(name, "/")
	return name
}

func inspectBaseContainer(inspect dockerTypes.ContainerJSON) dockerTypes.Container {
	ports := make([]dockerTypes.Port, 0, len(inspect.NetworkSettings.Ports))
	for privatePort, bindings := range inspect.NetworkSettings.Ports {
		privateValue, _ := strconv.Atoi(strings.Split(string(privatePort), "/")[0])
		if len(bindings) == 0 {
			ports = append(ports, dockerTypes.Port{PrivatePort: uint16(privateValue), Type: strings.Split(string(privatePort), "/")[1]})
			continue
		}
		for _, binding := range bindings {
			publicValue, _ := strconv.Atoi(binding.HostPort)
			ports = append(ports, dockerTypes.Port{
				PrivatePort: uint16(privateValue),
				PublicPort:  uint16(publicValue),
				Type:        strings.Split(string(privatePort), "/")[1],
				IP:          binding.HostIP,
			})
		}
	}
	return dockerTypes.Container{Ports: ports}
}

func (l *SaveEndpointConfigLogic) SaveEndpointConfig(req *types.ContainerEndpointConfigReq) (resp *types.Resp, err error) {
	resp = &types.Resp{}
	inspect, err := utiles.GetContainerInspect(l.svcCtx, req.Id)
	if err != nil {
		resp.Code = 404
		resp.Msg = "容器不存在: " + err.Error()
		resp.Data = map[string]interface{}{}
		return resp, nil
	}
	containerName := normalizeContainerName(inspect.Name)
	if containerName == "" {
		resp.Code = 400
		resp.Msg = "容器名称为空，无法保存链接配置"
		resp.Data = map[string]interface{}{}
		return resp, nil
	}

	cfg, err := readEndpointRuntimeConfig()
	if err != nil {
		resp.Code = 500
		resp.Msg = err.Error()
		resp.Data = map[string]interface{}{}
		return resp, nil
	}
	if cfg.Dockercopilot == nil {
		cfg.Dockercopilot = map[string]interface{}{}
	}
	overrides := map[string]map[string]string{}
	if raw, ok := cfg.Dockercopilot["container_endpoint_overrides"]; ok && raw != nil {
		b, _ := json.Marshal(raw)
		_ = json.Unmarshal(b, &overrides)
	}
	cleanHostIP := strings.TrimSpace(req.HostIP)
	cleanPort := normalizeEndpointPort(req.Port)
	if cleanHostIP == "" && cleanPort == "" {
		delete(overrides, containerName)
	} else {
		overrides[containerName] = map[string]string{"host_ip": cleanHostIP, "port": cleanPort}
	}
	cfg.Dockercopilot["container_endpoint_overrides"] = overrides
	if err := saveEndpointRuntimeConfig(cfg); err != nil {
		resp.Code = 500
		resp.Msg = err.Error()
		resp.Data = map[string]interface{}{}
		return resp, nil
	}

	endpoint := utiles.BuildContainerEndpointLink(inspectBaseContainer(inspect), inspect, l.svcCtx.DockerClient)
	resp.Code = 200
	resp.Msg = "success"
	resp.Data = map[string]interface{}{
		"containerName": containerName,
		"configPath":    endpointConfigPath(),
		"saved":         map[string]string{"hostIP": cleanHostIP, "port": cleanPort},
		"endpointLink":  endpoint,
		"message":       fmt.Sprintf("容器 %s 的 WebUI 链接配置已保存", containerName),
	}
	return resp, nil
}
