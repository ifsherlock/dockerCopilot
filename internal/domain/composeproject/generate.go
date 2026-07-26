package composeproject

import (
	"context"
	"fmt"
	"sort"
	"strings"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/go-connections/nat"
	"github.com/onlyLTY/dockerCopilot/internal/svc"
	"sigs.k8s.io/yaml"
)

func FromContainers(ctx *svc.ServiceContext, containerIDs []string) (string, error) {
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
		// compose 创建的容器优先用 service 标签作为服务名，生成结果更贴近原项目；
		// 同名冲突（如 scale 出的多副本）时退回容器名保证唯一。
		serviceKey := name
		if label := strings.TrimSpace(item.Labels[composeServiceLabel]); label != "" {
			if _, exists := services[sanitizeProjectName(label)]; !exists {
				serviceKey = label
			}
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
		services[sanitizeProjectName(serviceKey)] = service
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

func FromDockerRun(command string) (string, error) {
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
