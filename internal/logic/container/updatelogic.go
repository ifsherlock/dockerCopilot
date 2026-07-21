package container

import (
	"context"
	"fmt"
	"os"
	"strings"

	"github.com/google/uuid"
	"github.com/onlyLTY/dockerCopilot/internal/selfupdate"
	"github.com/onlyLTY/dockerCopilot/internal/svc"
	"github.com/onlyLTY/dockerCopilot/internal/types"
	"github.com/onlyLTY/dockerCopilot/internal/utiles"
	"github.com/zeromicro/go-zero/core/logx"
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
	l.svcCtx.AddOperationLog("container", "提交容器更新任务", fmt.Sprintf("%s taskID=%s", req.ContainerName, taskID))
	go func() {
		// Catch any panic and log the error
		defer func() {
			if r := recover(); r != nil {
				l.Errorf("Recovered from panic in UpdateContainer: %v", r)
				l.svcCtx.AddOperationLog("container", "容器更新任务异常", fmt.Sprintf("%s taskID=%s: %v", req.ContainerName, taskID, r))
			}
		}()
		if isSelf {
			imageNameAndTag := utiles.ResolveContainerUpdateImage(l.svcCtx, req.Id, req.ImageNameAndTag)
			l.svcCtx.AddOperationLog("container", "切换为镜像自更新", fmt.Sprintf("%s -> %s taskID=%s", req.ContainerName, imageNameAndTag, taskID))
			l.svcCtx.UpdateProgress(taskID, svc.TaskProgress{
				TaskID:     taskID,
				Percentage: 5,
				Name:       req.ContainerName,
				Message:    "正在更新 DockerCopilot",
				DetailMsg:  "检测到当前容器，切换为镜像自更新流程（接力容器方式）",
				IsDone:     false,
			})
			if err := selfupdate.Launch(l.svcCtx, req.Id, req.ContainerName, imageNameAndTag, taskID); err != nil {
				l.Errorf("Error in self image update: %v", err)
				l.svcCtx.AddOperationLog("container", "镜像自更新失败", fmt.Sprintf("%s taskID=%s: %v", req.ContainerName, taskID, err))
			}
			return
		}
		imageNameAndTag := utiles.ResolveContainerUpdateImage(l.svcCtx, req.Id, req.ImageNameAndTag)
		delOldContainer := os.Getenv("DelOldContainer") != "false"
		err := utiles.UpdateContainer(l.svcCtx, req.Id, req.ContainerName, imageNameAndTag, delOldContainer, taskID)
		if err != nil {
			l.Errorf("Error in UpdateContainer: %v", err)
			l.svcCtx.AddOperationLog("container", "容器更新任务失败", fmt.Sprintf("%s taskID=%s: %v", req.ContainerName, taskID, err))
		}
	}()
	resp.Code = 200
	resp.Msg = "success"
	resp.Data = map[string]string{"taskID": taskID}
	return resp, nil
}
