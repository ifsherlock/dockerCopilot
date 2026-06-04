package utiles

import (
	"context"

	"github.com/docker/docker/api/types/container"
	"github.com/onlyLTY/dockerCopilot/internal/svc"
)

func RemoveContainer(ctx *svc.ServiceContext, id string) error {
	ctx.AddOperationLog("container", "删除容器", id)
	if err := ctx.DockerClient.ContainerRemove(context.Background(), id, container.RemoveOptions{}); err != nil {
		ctx.AddOperationLog("container", "删除容器失败", id+": "+err.Error())
		return err
	}
	ctx.AddOperationLog("container", "删除容器完成", id)
	return nil
}
