package container

import (
	"context"
	"strings"

	"github.com/onlyLTY/dockerCopilot/internal/svc"
	"github.com/onlyLTY/dockerCopilot/internal/types"
	"github.com/onlyLTY/dockerCopilot/internal/utiles"
	"github.com/zeromicro/go-zero/core/logx"
)

type ContainerLogsLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

func NewContainerLogsLogic(ctx context.Context, svcCtx *svc.ServiceContext) *ContainerLogsLogic {
	return &ContainerLogsLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *ContainerLogsLogic) ContainerLogs(req *types.GetContainerLogsReq) (resp *types.Resp, err error) {
	resp = &types.Resp{}
	if strings.TrimSpace(req.Id) == "" {
		resp.Code = 400
		resp.Msg = "缺少容器 id"
		return resp, nil
	}

	logs, err := utiles.GetContainerLogs(l.svcCtx, req.Id, req.Tail)
	if err != nil {
		resp.Code = 500
		resp.Msg = "获取容器日志失败: " + err.Error()
		return resp, nil
	}

	resp.Code = 200
	resp.Msg = "success"
	resp.Data = map[string]interface{}{
		"id":   req.Id,
		"tail": strings.TrimSpace(req.Tail),
		"logs": logs,
	}
	return resp, nil
}
