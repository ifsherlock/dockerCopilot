package utiles

import (
	"context"
	"io"
	"strings"

	"github.com/docker/docker/api/types/container"
	dockerImage "github.com/docker/docker/api/types/image"
	"github.com/onlyLTY/dockerCopilot/internal/domain/updatecheck"
	"github.com/onlyLTY/dockerCopilot/internal/module"
	"github.com/onlyLTY/dockerCopilot/internal/svc"
	MyType "github.com/onlyLTY/dockerCopilot/internal/types"
	"github.com/zeromicro/go-zero/core/logx"
)

func GetContainerList(ctx *svc.ServiceContext) ([]MyType.Container, error) {
	// 获取所有容器（包括停止的容器）
	dockerContainerList, err := ctx.DockerClient.ContainerList(context.Background(), container.ListOptions{
		All: true, // 设置为true来获取所有容器
	})
	if err != nil {
		logx.Errorf("get container list error: %v", err)
		return nil, err
	}
	var containerList []MyType.Container
	for _, dockerContainerInfo := range dockerContainerList {
		containerInfo := MyType.Container{
			Container: dockerContainerInfo,
		}
		containerList = append(containerList, containerInfo)
	}
	return containerList, nil
}

func CheckImageUpdate(ctx *svc.ServiceContext, containerListData []MyType.Container) []MyType.Container {
	type refCheckOutcome struct {
		needUpdate bool
		err        error
	}
	// 同一镜像可能被多个容器共用，一轮检测内只访问一次 registry。
	memo := map[string]refCheckOutcome{}
	for i, v := range containerListData {
		inspect, err := ctx.DockerClient.ContainerInspect(context.Background(), v.ID)
		if err != nil {
			logx.Errorf("inspect container for update check failed %s: %v", v.ID, err)
			continue
		}
		createImage := strings.TrimSpace(inspect.Config.Image)
		// 无 tag 的引用（docker run nginx）交给检测器按 latest 处理，
		// 仅跳过按镜像 ID 创建的容器（无法对应远端仓库）。
		if createImage == "" || strings.HasPrefix(createImage, "sha256:") || looksLikeImageID(createImage) {
			continue
		}
		imageInspect, _, err := ctx.DockerClient.ImageInspectWithRaw(context.Background(), v.ImageID)
		if err != nil {
			logx.Errorf("inspect container image for update check failed %s: %v", v.ImageID, err)
			ctx.ClearHubImageUpdate(v.ImageID)
			continue
		}
		key := v.ImageID + "|" + createImage
		outcome, seen := memo[key]
		if !seen {
			result, err := checkImageRefUpdateState(createImage, imageInspect.RepoDigests)
			outcome = refCheckOutcome{needUpdate: result.NeedUpdate, err: err}
			memo[key] = outcome
		}
		if outcome.err != nil {
			// 网络抖动/限流导致的单次失败不清掉上次结果，避免已检测到的
			// “有更新”状态被误抹掉，表现成时有时无的漏检。
			logx.Infof("check image update failed for %s (%s), keep last state: %v", v.Names, createImage, outcome.err)
			continue
		}
		containerListData[i].Update = outcome.needUpdate
		ctx.SetHubImageUpdate(v.ImageID, outcome.needUpdate)
	}
	return containerListData
}

// looksLikeImageID 识别形如 3fa822599e10 / 完整 64 位十六进制的镜像 ID 引用。
func looksLikeImageID(s string) bool {
	if len(s) < 12 || len(s) > 64 || strings.Contains(s, "/") || strings.Contains(s, ":") {
		return false
	}
	for _, r := range s {
		isHex := (r >= '0' && r <= '9') || (r >= 'a' && r <= 'f')
		if !isHex {
			return false
		}
	}
	return true
}

func ResolveContainerUpdateImage(ctx *svc.ServiceContext, id string, requested string) string {
	requested = strings.TrimSpace(requested)
	inspect, err := ctx.DockerClient.ContainerInspect(context.Background(), id)
	if err == nil {
		createImage := strings.TrimSpace(inspect.Config.Image)
		if createImage != "" && !strings.HasPrefix(createImage, "sha256:") {
			return createImage
		}
	}
	if requested != "" && !strings.HasPrefix(requested, "sha256:") {
		return requested
	}
	if requested != "" {
		imageInspect, _, err := ctx.DockerClient.ImageInspectWithRaw(context.Background(), requested)
		if err == nil && len(imageInspect.RepoTags) > 0 && imageInspect.RepoTags[0] != "<none>:<none>" {
			return imageInspect.RepoTags[0]
		}
	}
	return requested
}

func ContainerNeedsUpdate(ctx *svc.ServiceContext, id string, imageNameAndTag string) bool {
	inspect, err := ctx.DockerClient.ContainerInspect(context.Background(), id)
	if err != nil {
		return true
	}
	imageInspect, _, err := ctx.DockerClient.ImageInspectWithRaw(context.Background(), inspect.Image)
	if err != nil {
		return true
	}
	result, err := checkImageRefUpdateState(imageNameAndTag, imageInspect.RepoDigests)
	if err != nil {
		return true
	}
	needUpdate := result.NeedUpdate
	ctx.SetHubImageUpdate(inspect.Image, needUpdate)
	return needUpdate
}

func PullImageOnly(ctx *svc.ServiceContext, imageNameAndTag string) error {
	reader, err := ctx.DockerClient.ImagePull(context.Background(), imageNameAndTag, dockerImage.PullOptions{})
	if err != nil {
		return err
	}
	defer reader.Close()
	_, err = io.Copy(io.Discard, reader)
	return err
}

func checkImageRefUpdateState(imageNameAndTag string, localRepoDigests []string) (updatecheck.RegistryCheckResult, error) {
	checker := updatecheck.NewRegistryChecker()
	// docker.io 必须走 GetRegistryAddress：官方源不可达时回退加速器，
	// 且与 GetToken 的 challenge host 保持一致，否则国内环境全部检测失败。
	checker.ResolveHost = module.GetRegistryAddress
	checker.Token = func(ctx context.Context, imageName string) (string, error) {
		return module.GetToken(MyType.Image{ImageName: imageName}, "")
	}
	return checker.CheckImageRef(context.Background(), imageNameAndTag, localRepoDigests)
}
