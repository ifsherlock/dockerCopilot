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
	for i, v := range containerListData {
		inspect, err := ctx.DockerClient.ContainerInspect(context.Background(), v.ID)
		if err != nil {
			logx.Errorf("inspect container for update check failed %s: %v", v.ID, err)
			continue
		}
		createImage := strings.TrimSpace(inspect.Config.Image)
		if createImage == "" || strings.HasPrefix(createImage, "sha256:") || !strings.Contains(createImage, ":") {
			continue
		}
		imageInspect, _, err := ctx.DockerClient.ImageInspectWithRaw(context.Background(), v.ImageID)
		if err != nil {
			logx.Errorf("inspect container image for update check failed %s: %v", v.ImageID, err)
			ctx.ClearHubImageUpdate(v.ImageID)
			continue
		}
		result, err := checkImageRefUpdateState(createImage, imageInspect.RepoDigests)
		if err != nil {
			ctx.ClearHubImageUpdate(v.ImageID)
			continue
		}
		needUpdate := result.NeedUpdate
		containerListData[i].Update = needUpdate
		ctx.SetHubImageUpdate(v.ImageID, needUpdate)
	}
	return containerListData
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
	checker.Token = func(ctx context.Context, imageName string) (string, error) {
		return module.GetToken(MyType.Image{ImageName: imageName}, "")
	}
	return checker.CheckImageRef(context.Background(), imageNameAndTag, localRepoDigests)
}
