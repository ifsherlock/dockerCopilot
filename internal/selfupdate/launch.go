package selfupdate

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"strings"

	dockerTypes "github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/image"
	"github.com/docker/docker/api/types/mount"
	dockerMsgType "github.com/docker/docker/pkg/jsonmessage"
	"github.com/onlyLTY/dockerCopilot/internal/svc"
	"github.com/zeromicro/go-zero/core/logx"
)

// Launch 在主容器内发起镜像自更新：拉取新镜像并启动接力 updater 容器。
// 返回后主容器等待被 updater 停止，任务进度以"交接完成"收尾。
func Launch(svcCtx *svc.ServiceContext, selfID string, name string, imageNameAndTag string, taskID string) error {
	ctx := context.Background()
	progress := func(pct int, msg string, done bool) {
		svcCtx.UpdateProgress(taskID, svc.TaskProgress{
			TaskID:     taskID,
			Percentage: pct,
			Name:       name,
			Message:    msg,
			DetailMsg:  msg,
			IsDone:     done,
		})
	}

	progress(5, "正在拉取新镜像 "+imageNameAndTag, false)
	svcCtx.AddOperationLog("container", "自更新拉取新镜像", imageNameAndTag)
	reader, err := svcCtx.DockerClient.ImagePull(ctx, imageNameAndTag, image.PullOptions{})
	if err != nil {
		progress(100, "拉取镜像失败: "+err.Error(), true)
		return err
	}
	if err := drainPull(reader, svcCtx, taskID); err != nil {
		progress(100, "拉取镜像失败: "+err.Error(), true)
		return err
	}

	progress(50, "正在准备接力更新容器", false)
	selfIns, err := svcCtx.DockerClient.ContainerInspect(ctx, selfID)
	if err != nil {
		progress(100, "获取自身容器信息失败: "+err.Error(), true)
		return err
	}

	// 清理可能残留的旧 updater
	_ = svcCtx.DockerClient.ContainerRemove(ctx, UpdaterName, container.RemoveOptions{Force: true})

	binds, mounts := relayVolumes(selfIns)
	env := []string{
		EnvFlag + "=1",
		EnvTarget + "=" + selfIns.ID,
		EnvImage + "=" + imageNameAndTag,
	}
	for _, key := range []string{"DOCKER_HOST", "TZ", "DOCKER_API_VERSION", "DOCKER_CERT_PATH", "DOCKER_TLS_VERIFY"} {
		if v := strings.TrimSpace(os.Getenv(key)); v != "" {
			env = append(env, key+"="+v)
		}
	}

	cfg := &container.Config{
		Image:      imageNameAndTag,
		Entrypoint: []string{"/app/dockerCopilot"},
		Cmd:        []string{},
		Env:        env,
		WorkingDir: "/app",
		Labels:     map[string]string{"dockercopilot.role": "self-updater"},
	}
	hostCfg := &container.HostConfig{
		Binds:      binds,
		Mounts:     mounts,
		AutoRemove: true,
		Privileged: selfIns.HostConfig != nil && selfIns.HostConfig.Privileged,
	}
	if _, err := svcCtx.DockerClient.ContainerCreate(ctx, cfg, hostCfg, nil, nil, UpdaterName); err != nil {
		progress(100, "创建接力更新容器失败: "+err.Error(), true)
		return err
	}
	if err := svcCtx.DockerClient.ContainerStart(ctx, UpdaterName, container.StartOptions{}); err != nil {
		_ = svcCtx.DockerClient.ContainerRemove(ctx, UpdaterName, container.RemoveOptions{Force: true})
		progress(100, "启动接力更新容器失败: "+err.Error(), true)
		return err
	}

	svcCtx.AddOperationLog("container", "自更新交接完成", fmt.Sprintf("%s -> %s，接力容器已启动，面板即将重启", name, imageNameAndTag))
	progress(100, "接力容器已启动，面板服务即将重启，请稍候刷新页面", true)
	logx.Infof("自更新接力容器已启动，等待被替换: image=%s", imageNameAndTag)
	return nil
}

// relayVolumes 从自身容器的挂载中筛出接力容器需要的部分：
// docker socket（操作 Docker）与 /data（写结果与日志）。
func relayVolumes(ins dockerTypes.ContainerJSON) ([]string, []mount.Mount) {
	binds := make([]string, 0, 2)
	if ins.HostConfig != nil {
		for _, b := range ins.HostConfig.Binds {
			if strings.Contains(b, "docker.sock") || bindTarget(b) == "/data" {
				binds = append(binds, b)
			}
		}
	}
	mounts := make([]mount.Mount, 0, 2)
	if ins.HostConfig != nil {
		for _, m := range ins.HostConfig.Mounts {
			if strings.Contains(m.Source, "docker.sock") || m.Target == "/var/run/docker.sock" || m.Target == "/data" {
				mounts = append(mounts, m)
			}
		}
	}
	return binds, mounts
}

// bindTarget 提取 bind 声明(src:dst[:opts])中的容器内路径。
func bindTarget(b string) string {
	parts := strings.Split(b, ":")
	if len(parts) >= 2 {
		return parts[1]
	}
	return ""
}

// ReportResultOnBoot 在新容器启动后上报接力更新结果：写操作日志并广播 Bot 通知。
// 结果文件读取后即删除，避免重复上报。detail 回调由调用方接入 botnotify 广播。
func ReportResultOnBoot(svcCtx *svc.ServiceContext, broadcast func(ok bool, detail string)) {
	b, err := os.ReadFile(resultFile)
	if err != nil {
		return
	}
	_ = os.Remove(resultFile)
	var res Result
	if err := json.Unmarshal(b, &res); err != nil {
		return
	}
	version := strings.TrimSpace(res.Image)
	if res.Status == "success" {
		detail := fmt.Sprintf("已更新到镜像 %s", version)
		svcCtx.AddOperationLog("container", "服务自更新成功", detail)
		if broadcast != nil {
			broadcast(true, detail)
		}
		return
	}
	detail := fmt.Sprintf("镜像 %s 更新失败: %s（已自动回滚旧版本）", version, res.Error)
	svcCtx.AddOperationLog("container", "服务自更新失败", detail)
	if broadcast != nil {
		broadcast(false, detail)
	}
}

func drainPull(reader io.Reader, svcCtx *svc.ServiceContext, taskID string) error {
	defer func() {
		if closer, ok := reader.(io.Closer); ok {
			_ = closer.Close()
		}
	}()
	decoder := json.NewDecoder(reader)
	for {
		var msg dockerMsgType.JSONMessage
		if err := decoder.Decode(&msg); err != nil {
			if err == io.EOF {
				return nil
			}
			return fmt.Errorf("拉取镜像失败: %w", err)
		}
		if msg.Error != nil {
			return fmt.Errorf("拉取镜像失败: %w", msg.Error)
		}
		if msg.Progress != nil {
			svcCtx.AppendProgressLog(taskID, fmt.Sprintf("拉取%s: %s", msg.Status, msg.Progress.String()))
		} else if strings.TrimSpace(msg.Status) != "" {
			svcCtx.AppendProgressLog(taskID, "拉取"+msg.Status)
		}
	}
}
