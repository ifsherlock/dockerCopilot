package systemlog

import (
	"context"
	"strings"

	"github.com/onlyLTY/dockerCopilot/internal/svc"
	"github.com/onlyLTY/dockerCopilot/internal/types"
	"github.com/onlyLTY/dockerCopilot/internal/utiles"
	"github.com/zeromicro/go-zero/core/logx"
)

type SystemLogLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

func NewSystemLogLogic(ctx context.Context, svcCtx *svc.ServiceContext) *SystemLogLogic {
	return &SystemLogLogic{Logger: logx.WithContext(ctx), ctx: ctx, svcCtx: svcCtx}
}

func (l *SystemLogLogic) Logs(req *types.GetSystemLogsReq) (*types.Resp, error) {
	kind := strings.TrimSpace(req.Kind)
	if kind == "" {
		kind = "service"
	}
	tail := utiles.TailFromString(req.Tail, 300)
	switch kind {
	case "operation":
		return &types.Resp{Code: 200, Msg: "success", Data: l.svcCtx.GetOperationLogs()}, nil
	case "task":
		return &types.Resp{Code: 200, Msg: "success", Data: l.svcCtx.ListProgress(tail)}, nil
	case "service":
		logs, err := utiles.ReadServiceLogs(tail, req.Query, req.Level)
		if err != nil {
			return &types.Resp{Code: 500, Msg: err.Error(), Data: map[string]interface{}{}}, nil
		}
		return &types.Resp{Code: 200, Msg: "success", Data: map[string]interface{}{"logs": logs, "tail": tail}}, nil
	default:
		return &types.Resp{Code: 400, Msg: "unsupported log kind", Data: map[string]interface{}{}}, nil
	}
}
