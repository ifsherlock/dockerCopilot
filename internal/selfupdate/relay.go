// Package selfupdate 实现 DockerCopilot 镜像级自更新。
//
// 容器无法在自身进程内完成"停掉自己再重建"（stop 自己的瞬间流程即中断），
// 因此采用接力容器方案（同 Watchtower 自更新思路）：
//
//	主容器: 拉取新镜像 → 用新镜像启动一次性 updater 容器（AutoRemove）
//	updater: 停旧容器 → 重命名备份 → 用旧容器完整配置+新镜像重建同名容器 →
//	         启动并校验 → 成功删备份 / 失败自动回滚旧容器
//	新容器: 首次启动检测结果文件 → 写操作日志 + Bot 推送更新结果
package selfupdate

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/network"
	"github.com/docker/docker/client"
)

const (
	// EnvFlag 置为 "1" 时进程以接力 updater 模式运行（在 main 最先分支）。
	EnvFlag = "DC_SELF_UPDATE"
	// EnvTarget 为待更新的 dockercopilot 容器 ID。
	EnvTarget = "DC_SELF_UPDATE_TARGET"
	// EnvImage 为更新目标镜像（已由主容器拉取完成）。
	EnvImage = "DC_SELF_UPDATE_IMAGE"

	// UpdaterName 为接力容器名，固定命名便于清理残留。
	UpdaterName = "dockercopilot-self-updater"

	resultFile = "/data/selfupdate-result.json"
	logFile    = "/data/selfupdate.log"
)

// Result 是接力容器写入 /data 的执行结果，由新容器启动时上报。
type Result struct {
	Status string `json:"status"` // success / failed
	Name   string `json:"name"`
	Image  string `json:"image"`
	Error  string `json:"error,omitempty"`
	At     string `json:"at"`
}

func relayLog(format string, args ...interface{}) {
	line := fmt.Sprintf("[self-updater] %s %s", time.Now().Format("2006-01-02 15:04:05"), fmt.Sprintf(format, args...))
	fmt.Println(line)
	if f, err := os.OpenFile(logFile, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644); err == nil {
		_, _ = f.WriteString(line + "\n")
		_ = f.Close()
	}
}

func writeResult(res Result) {
	res.At = time.Now().Format("2006-01-02 15:04:05")
	if b, err := json.MarshalIndent(res, "", "  "); err == nil {
		_ = os.WriteFile(resultFile, b, 0644)
	}
}

// RunRelay 在接力容器内执行完整的自更新流程，返回进程退出码。
func RunRelay() int {
	target := strings.TrimSpace(os.Getenv(EnvTarget))
	image := strings.TrimSpace(os.Getenv(EnvImage))
	relayLog("接力更新开始: target=%s image=%s", target, image)
	if target == "" || image == "" {
		relayLog("缺少必要环境变量，退出")
		writeResult(Result{Status: "failed", Image: image, Error: "updater 缺少目标容器或镜像参数"})
		return 1
	}

	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		relayLog("连接 Docker 失败: %v", err)
		writeResult(Result{Status: "failed", Image: image, Error: "连接 Docker 失败: " + err.Error()})
		return 1
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	// 给主容器留出写完任务进度与响应 HTTP 请求的时间
	time.Sleep(3 * time.Second)

	ins, err := cli.ContainerInspect(ctx, target)
	if err != nil {
		relayLog("获取目标容器信息失败: %v", err)
		writeResult(Result{Status: "failed", Image: image, Error: "获取目标容器信息失败: " + err.Error()})
		return 1
	}
	name := strings.TrimPrefix(ins.Name, "/")
	backupName := name + "-old-" + time.Now().Format("2006-01-02-15-04-05")

	stopTimeout := 10
	relayLog("停止旧容器 %s", name)
	if err := cli.ContainerStop(ctx, target, container.StopOptions{Timeout: &stopTimeout}); err != nil {
		relayLog("停止旧容器失败: %v", err)
		writeResult(Result{Status: "failed", Name: name, Image: image, Error: "停止旧容器失败: " + err.Error()})
		return 1
	}

	relayLog("重命名旧容器为 %s", backupName)
	if err := cli.ContainerRename(ctx, target, backupName); err != nil {
		relayLog("重命名旧容器失败: %v", err)
		_ = cli.ContainerStart(ctx, target, container.StartOptions{})
		writeResult(Result{Status: "failed", Name: name, Image: image, Error: "重命名旧容器失败: " + err.Error()})
		return 1
	}

	rollback := func(reason string, cleanupNew bool) {
		relayLog("更新失败开始回滚: %s", reason)
		if cleanupNew {
			removeTimeout := 5
			_ = cli.ContainerStop(ctx, name, container.StopOptions{Timeout: &removeTimeout})
			_ = cli.ContainerRemove(ctx, name, container.RemoveOptions{Force: true})
		}
		if err := cli.ContainerRename(ctx, target, name); err != nil {
			relayLog("回滚重命名失败(旧容器保留为 %s): %v", backupName, err)
		}
		if err := cli.ContainerStart(ctx, target, container.StartOptions{}); err != nil {
			relayLog("回滚启动旧容器失败: %v", err)
		} else {
			relayLog("已回滚并启动旧容器")
		}
		writeResult(Result{Status: "failed", Name: name, Image: image, Error: reason})
	}

	cfg := ins.Config
	cfg.Hostname = ""
	cfg.Image = image
	hostCfg := ins.HostConfig
	netCfg := &network.NetworkingConfig{EndpointsConfig: ins.NetworkSettings.Networks}

	relayLog("使用新镜像创建容器 %s", name)
	if _, err := cli.ContainerCreate(ctx, cfg, hostCfg, netCfg, nil, name); err != nil {
		rollback("创建新容器失败: "+err.Error(), false)
		return 1
	}
	relayLog("启动新容器 %s", name)
	if err := cli.ContainerStart(ctx, name, container.StartOptions{}); err != nil {
		rollback("启动新容器失败: "+err.Error(), true)
		return 1
	}

	// 校验新容器稳定运行（未进入退出/重启循环）
	healthy := false
	for i := 0; i < 10; i++ {
		time.Sleep(2 * time.Second)
		newIns, err := cli.ContainerInspect(ctx, name)
		if err != nil {
			continue
		}
		if newIns.State != nil && newIns.State.Running && !newIns.State.Restarting {
			healthy = true
			if i >= 2 {
				break
			}
			continue
		}
		healthy = false
	}
	if !healthy {
		rollback("新容器未能稳定运行", true)
		return 1
	}

	relayLog("新容器运行正常，删除备份容器 %s", backupName)
	if err := cli.ContainerRemove(ctx, target, container.RemoveOptions{}); err != nil {
		relayLog("删除备份容器失败(可手动清理 %s): %v", backupName, err)
	}
	writeResult(Result{Status: "success", Name: name, Image: image})
	relayLog("接力更新完成")
	return 0
}
