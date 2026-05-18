package utiles

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"strings"

	"github.com/docker/docker/api/types/image"
	dockerMsgType "github.com/docker/docker/pkg/jsonmessage"
	"github.com/onlyLTY/dockerCopilot/internal/svc"
)

func PullImage(serviceContext *svc.ServiceContext, taskID string, displayName string, imageNameAndTag string) error {
	ctx := context.Background()
	serviceContext.UpdateProgress(taskID, svc.TaskProgress{
		TaskID:     taskID,
		Percentage: 5,
		Name:       displayName,
		Message:    "正在连接Docker",
		DetailMsg:  "正在连接Docker",
		IsDone:     false,
		Logs: []string{
			"正在连接Docker",
			"镜像: " + imageNameAndTag,
		},
	})
	serviceContext.AddOperationLog("pull", "开始拉取镜像", imageNameAndTag)
	serviceContext.DockerClient.NegotiateAPIVersion(ctx)
	reader, err := serviceContext.DockerClient.ImagePull(ctx, imageNameAndTag, image.PullOptions{})
	if err != nil {
		serviceContext.UpdateProgress(taskID, svc.TaskProgress{
			TaskID:     taskID,
			Percentage: 100,
			Name:       displayName,
			Message:    "拉取镜像失败",
			DetailMsg:  err.Error(),
			IsDone:     true,
			Logs:       []string{"拉取镜像失败: " + err.Error()},
		})
		serviceContext.AddOperationLog("pull", "拉取镜像失败", err.Error())
		return err
	}
	return decodePullOnlyResp(reader, serviceContext, taskID, displayName)
}

func decodePullOnlyResp(reader io.Reader, ctx *svc.ServiceContext, taskID string, displayName string) error {
	decoder := json.NewDecoder(reader)
	for {
		var msg dockerMsgType.JSONMessage
		if err := decoder.Decode(&msg); err != nil {
			if err == io.EOF {
				progress, _ := ctx.GetProgress(taskID)
				progress.Percentage = 100
				progress.Message = "镜像拉取完成"
				progress.DetailMsg = strings.Join(progress.Logs, "\n")
				progress.IsDone = true
				ctx.UpdateProgress(taskID, progress)
				ctx.AddOperationLog("pull", "镜像拉取完成", displayName)
				return nil
			}
			progress, _ := ctx.GetProgress(taskID)
			progress.Percentage = 100
			progress.Message = "拉取镜像失败"
			progress.IsDone = true
			ctx.UpdateProgress(taskID, progress)
			ctx.AppendProgressLog(taskID, "拉取镜像失败: "+err.Error())
			ctx.AddOperationLog("pull", "拉取镜像失败", err.Error())
			return fmt.Errorf("拉取镜像失败: %w", err)
		}
		if msg.Error != nil {
			progress, _ := ctx.GetProgress(taskID)
			progress.Percentage = 100
			progress.Message = "拉取镜像失败"
			progress.IsDone = true
			ctx.UpdateProgress(taskID, progress)
			ctx.AppendProgressLog(taskID, "拉取镜像失败: "+msg.Error.Error())
			ctx.AddOperationLog("pull", "拉取镜像失败", msg.Error.Error())
			return fmt.Errorf("拉取镜像失败: %w", msg.Error)
		}
		formattedMsg := msg.Status
		if msg.Progress != nil {
			formattedMsg = fmt.Sprintf("%s: %s", msg.Status, msg.Progress.String())
		}
		ctx.AppendProgressLog(taskID, formattedMsg)
		progress, ok := ctx.GetProgress(taskID)
		if ok {
			progress.Message = "正在加速拉取镜像"
			progress.Percentage = 60
			progress.DetailMsg = strings.Join(progress.Logs, "\n")
			ctx.UpdateProgress(taskID, progress)
		}
	}
}
