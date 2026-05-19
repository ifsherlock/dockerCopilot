package container

import (
	"context"
	"github.com/google/uuid"
	"github.com/onlyLTY/dockerCopilot/internal/svc"
	"github.com/onlyLTY/dockerCopilot/internal/types"
	"github.com/onlyLTY/dockerCopilot/internal/utiles"
	"github.com/zeromicro/go-zero/core/logx"
	"os"
	"strings"
)

type UpdateLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

func NewUpdateLogic(ctx context.Context, svcCtx *svc.ServiceContext) *UpdateLogic {
	return &UpdateLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *UpdateLogic) Update(req *types.ContainerUpdateReq) (resp *types.Resp, err error) {
	resp = &types.Resp{}
	taskID := uuid.New().String()
	selfID, _ := os.Hostname()
	selfID = strings.TrimSpace(selfID)
	isSelf := selfID != "" && (req.Id == selfID || strings.HasPrefix(req.Id, selfID) || strings.HasPrefix(selfID, req.Id))
	go func() {
		// Catch any panic and log the error
		defer func() {
			if r := recover(); r != nil {
				l.Errorf("Recovered from panic in UpdateContainer: %v", r)
			}
		}()
		if isSelf {
			l.svcCtx.UpdateProgress(taskID, svc.TaskProgress{
				TaskID:     taskID,
				Percentage: 10,
				Name:       req.ContainerName,
				Message:    "正在更新 DockerCopilot",
				DetailMsg:  "检测到当前容器，切换为程序自更新流程",
				IsDone:     false,
			})
			err := utiles.UpdateProgram(l.svcCtx)
			if err != nil {
				l.svcCtx.UpdateProgress(taskID, svc.TaskProgress{
					TaskID:     taskID,
					Percentage: 100,
					Name:       req.ContainerName,
					Message:    "更新失败",
					DetailMsg:  err.Error(),
					IsDone:     true,
				})
				l.Errorf("Error in self UpdateProgram: %v", err)
				return
			}
			l.svcCtx.UpdateProgress(taskID, svc.TaskProgress{
				TaskID:     taskID,
				Percentage: 100,
				Name:       req.ContainerName,
				Message:    "更新成功",
				DetailMsg:  "DockerCopilot 已完成程序自更新，容器即将重启",
				IsDone:     true,
			})
			return
		}
		imageNameAndTag := utiles.ResolveContainerUpdateImage(l.svcCtx, req.Id, req.ImageNameAndTag)
		delOldContainer := os.Getenv("DelOldContainer") != "false"
		err := utiles.UpdateContainer(l.svcCtx, req.Id, req.ContainerName, imageNameAndTag, delOldContainer, taskID)
		if err != nil {
			l.Errorf("Error in UpdateContainer: %v", err)
		}
	}()
	resp.Code = 200
	resp.Msg = "success"
	resp.Data = map[string]string{"taskID": taskID}
	return resp, nil
}
