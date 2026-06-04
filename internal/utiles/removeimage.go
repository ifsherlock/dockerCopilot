package utiles

import (
	"context"
	"github.com/docker/docker/api/types/image"
	"github.com/onlyLTY/dockerCopilot/internal/svc"
)

func RemoveImage(ctx *svc.ServiceContext, imageID string, force bool) error {
	ctx.AddOperationLog("image", "删除镜像", imageID)
	_, err := ctx.DockerClient.ImageRemove(context.Background(), imageID, image.RemoveOptions{Force: force})
	if err != nil {
		ctx.AddOperationLog("image", "删除镜像失败", imageID+": "+err.Error())
		return err
	}
	ctx.AddOperationLog("image", "删除镜像完成", imageID)
	return nil
}
