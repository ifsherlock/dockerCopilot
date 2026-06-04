package utiles

import (
	"context"
	"github.com/docker/docker/api/types/container"
	"github.com/onlyLTY/dockerCopilot/internal/svc"
)

func StopContainer(ctx *svc.ServiceContext, id string) error {
	timeout := 10
	signal := "SIGINT"
	stopOptions := container.StopOptions{
		Signal:  signal,
		Timeout: &timeout,
	}
	ctx.AddOperationLog("container", "停止容器", id)
	err := ctx.DockerClient.ContainerStop(context.Background(), id, stopOptions)
	if err != nil {
		ctx.AddOperationLog("container", "停止容器失败", id+": "+err.Error())
		return err
	}
	ctx.AddOperationLog("container", "停止容器完成", id)
	return nil
}
