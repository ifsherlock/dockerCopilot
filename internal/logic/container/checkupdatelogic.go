package container

import (
	"context"

	"github.com/onlyLTY/dockerCopilot/internal/svc"
	"github.com/onlyLTY/dockerCopilot/internal/types"
	"github.com/onlyLTY/dockerCopilot/internal/utiles"
	"github.com/zeromicro/go-zero/core/logx"
)

type CheckUpdateLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

func NewCheckUpdateLogic(ctx context.Context, svcCtx *svc.ServiceContext) *CheckUpdateLogic {
	return &CheckUpdateLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *CheckUpdateLogic) CheckUpdate() (resp *types.Resp, err error) {
	resp = &types.Resp{}
	if !l.svcCtx.TryStartUpdateCheck(0) {
		resp.Code = 200
		resp.Msg = "检测任务正在运行"
		resp.Data = map[string]interface{}{"running": true}
		return resp, nil
	}

	go func() {
		defer l.svcCtx.FinishUpdateCheck()
		list, err := utiles.GetContainerList(l.svcCtx)
		if err != nil {
			logx.Errorf("manual container update check get list failed: %v", err)
			return
		}
		utiles.CheckImageUpdate(l.svcCtx, list)
	}()

	resp.Code = 200
	resp.Msg = "已开始检测更新"
	resp.Data = map[string]interface{}{"running": true}
	return resp, nil
}
