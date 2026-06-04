package utiles

import (
	"context"
	"github.com/docker/docker/api/types/container"
	"github.com/onlyLTY/dockerCopilot/internal/svc"
)

func StartContainer(ctx *svc.ServiceContext, id string) error {
	startOptions := container.StartOptions{}
	ctx.AddOperationLog("container", "启动容器", id)
	err := ctx.DockerClient.ContainerStart(context.Background(), id, startOptions)
	if err != nil {
		ctx.AddOperationLog("container", "启动容器失败", id+": "+err.Error())
		return err
	}
	ctx.AddOperationLog("container", "启动容器完成", id)

	return nil
}
