package image

import (
	"context"

	"github.com/onlyLTY/dockerCopilot/internal/svc"
	"github.com/onlyLTY/dockerCopilot/internal/types"
	"github.com/zeromicro/go-zero/core/logx"
)

type LogsLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

func NewLogsLogic(ctx context.Context, svcCtx *svc.ServiceContext) *LogsLogic {
	return &LogsLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *LogsLogic) Logs(req *types.GetLogsReq) (resp *types.Resp, err error) {
	resp = &types.Resp{}
	resp.Code = 200
	resp.Msg = "success"
	resp.Data = l.svcCtx.GetOperationLogs()
	return resp, nil
}
