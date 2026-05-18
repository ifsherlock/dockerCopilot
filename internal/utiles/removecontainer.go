package utiles

import (
	"context"

	"github.com/docker/docker/api/types/container"
	"github.com/onlyLTY/dockerCopilot/internal/svc"
)

func RemoveContainer(ctx *svc.ServiceContext, id string) error {
	return ctx.DockerClient.ContainerRemove(context.Background(), id, container.RemoveOptions{})
}
