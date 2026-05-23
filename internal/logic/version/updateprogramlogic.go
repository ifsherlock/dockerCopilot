package version

import (
	"context"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/onlyLTY/dockerCopilot/internal/config"
	"github.com/onlyLTY/dockerCopilot/internal/svc"
	"github.com/onlyLTY/dockerCopilot/internal/types"
	"github.com/onlyLTY/dockerCopilot/internal/utiles"
	"github.com/zeromicro/go-zero/core/logx"
)

type UpdateProgramLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

func NewUpdateProgramLogic(ctx context.Context, svcCtx *svc.ServiceContext) *UpdateProgramLogic {
	return &UpdateProgramLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *UpdateProgramLogic) UpdateProgram(force bool) (resp *types.Resp, err error) {
	resp = &types.Resp{}
	if !force {
		remoteVersion, remoteErr := utiles.GetRemoteVersion()
		if remoteErr == nil && strings.TrimSpace(remoteVersion) != "" {
			if strings.TrimPrefix(strings.TrimSpace(remoteVersion), "v") == strings.TrimPrefix(strings.TrimSpace(config.Version), "v") {
				resp.Code = 200
				resp.Msg = "当前已是最新版本"
				resp.Data = map[string]interface{}{"updated": false, "currentVersion": config.Version, "remoteVersion": remoteVersion}
				return resp, nil
			}
		}
	}

	taskID := uuid.New().String()
	l.svcCtx.UpdateProgress(taskID, svc.TaskProgress{
		TaskID:     taskID,
		Percentage: 1,
		Name:       "dockerCopilot",
		Message:    "正在排队更新任务...",
		DetailMsg:  "任务已创建，准备开始执行",
		IsDone:     false,
	})

	go func() {
		if runErr := utiles.UpdateProgram(l.svcCtx, taskID); runErr != nil {
			l.svcCtx.UpdateProgress(taskID, svc.TaskProgress{
				TaskID:     taskID,
				Percentage: 100,
				Name:       "dockerCopilot",
				Message:    "更新失败",
				DetailMsg:  runErr.Error(),
				IsDone:     true,
			})
			return
		}

		l.svcCtx.UpdateProgress(taskID, svc.TaskProgress{
			TaskID:     taskID,
			Percentage: 100,
			Name:       "dockerCopilot",
			Message:    "更新完成，正在重启服务...",
			DetailMsg:  "即将自动重启并恢复连接",
			IsDone:     true,
		})
		if restartErr := utiles.ScheduleServiceRestart(3 * time.Second); restartErr != nil {
			l.svcCtx.UpdateProgress(taskID, svc.TaskProgress{
				TaskID:     taskID,
				Percentage: 100,
				Name:       "dockerCopilot",
				Message:    "更新失败",
				DetailMsg:  "更新包已应用，但调度服务重启失败: " + restartErr.Error(),
				IsDone:     true,
			})
			return
		}
	}()

	resp.Code = 200
	resp.Msg = "success"
	resp.Data = map[string]interface{}{"updated": true, "taskID": taskID}
	return resp, nil
}
