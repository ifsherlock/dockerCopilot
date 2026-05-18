package image

import (
	"context"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/onlyLTY/dockerCopilot/internal/svc"
	"github.com/onlyLTY/dockerCopilot/internal/types"
	"github.com/onlyLTY/dockerCopilot/internal/utiles"
	"github.com/zeromicro/go-zero/core/logx"
)

type PullLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

func NewPullLogic(ctx context.Context, svcCtx *svc.ServiceContext) *PullLogic {
	return &PullLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *PullLogic) Pull(req *types.PullImageReq) (resp *types.Resp, err error) {
	resp = &types.Resp{}
	imageName := strings.TrimSpace(req.ImageName)
	if imageName == "" {
		resp.Code = 400
		resp.Msg = "镜像名不能为空"
		resp.Data = map[string]interface{}{}
		return resp, nil
	}

	displayName := strings.TrimSpace(req.DisplayName)
	if displayName == "" {
		displayName = imageName
	}

	source := strings.Trim(strings.TrimSpace(req.Source), "/")
	pullRef := imageName
	if source != "" {
		pullRef = fmt.Sprintf("%s/%s", source, strings.TrimPrefix(imageName, "/"))
	}

	taskID := uuid.New().String()
	l.svcCtx.UpdateProgress(taskID, svc.TaskProgress{
		TaskID:     taskID,
		Percentage: 1,
		Name:       displayName,
		Message:    "准备加速拉取镜像",
		DetailMsg:  "准备加速拉取镜像",
		IsDone:     false,
		Logs: []string{
			"开始任务: " + displayName,
			"拉取地址: " + pullRef,
		},
	})
	l.svcCtx.AddOperationLog("pull", "加速拉取镜像", fmt.Sprintf("%s <- %s", displayName, pullRef))

	go func() {
		if err := utiles.PullImage(l.svcCtx, taskID, displayName, pullRef); err != nil {
			l.Errorf("Pull image failed: %v", err)
		}
	}()

	resp.Code = 200
	resp.Msg = "success"
	resp.Data = map[string]string{"taskID": taskID}
	return resp, nil
}
