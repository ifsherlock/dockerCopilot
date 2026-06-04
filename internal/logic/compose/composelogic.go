package compose

import (
	"context"

	"github.com/onlyLTY/dockerCopilot/internal/svc"
	"github.com/onlyLTY/dockerCopilot/internal/types"
	"github.com/onlyLTY/dockerCopilot/internal/utiles"
	"github.com/zeromicro/go-zero/core/logx"
)

type ComposeLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

func NewComposeLogic(ctx context.Context, svcCtx *svc.ServiceContext) *ComposeLogic {
	return &ComposeLogic{Logger: logx.WithContext(ctx), ctx: ctx, svcCtx: svcCtx}
}

func (l *ComposeLogic) Projects() (*types.Resp, error) {
	projects, err := utiles.ListComposeProjects()
	if err != nil {
		return &types.Resp{Code: 500, Msg: err.Error(), Data: []interface{}{}}, nil
	}
	for i := range projects {
		utiles.EnrichComposeProjectStatus(l.svcCtx, &projects[i])
	}
	return &types.Resp{Code: 200, Msg: "success", Data: projects}, nil
}

func (l *ComposeLogic) Project(req *types.ComposeProjectPathReq) (*types.Resp, error) {
	project, err := utiles.ReadComposeProject(req.Name)
	if err != nil {
		return &types.Resp{Code: 404, Msg: err.Error(), Data: map[string]interface{}{}}, nil
	}
	utiles.EnrichComposeProjectStatus(l.svcCtx, &project)
	return &types.Resp{Code: 200, Msg: "success", Data: project}, nil
}

func (l *ComposeLogic) Save(req *types.ComposeProjectReq) (*types.Resp, error) {
	project, err := utiles.SaveComposeProject(req.Name, req.Content)
	if err != nil {
		return &types.Resp{Code: 400, Msg: err.Error(), Data: map[string]interface{}{}}, nil
	}
	utiles.EnrichComposeProjectStatus(l.svcCtx, &project)
	l.svcCtx.AddOperationLog("compose", "保存 Compose 项目", project.Name)
	return &types.Resp{Code: 200, Msg: "success", Data: project}, nil
}

func (l *ComposeLogic) Clear(req *types.ComposeProjectPathReq) (*types.Resp, error) {
	count, err := utiles.ClearComposeProject(l.svcCtx, req.Name)
	if err != nil {
		return &types.Resp{Code: 400, Msg: err.Error(), Data: map[string]interface{}{}}, nil
	}
	l.svcCtx.AddOperationLog("compose", "清除 Compose 项目容器", req.Name)
	return &types.Resp{Code: 200, Msg: "success", Data: map[string]interface{}{"removed": count}}, nil
}

func (l *ComposeLogic) Delete(req *types.ComposeProjectPathReq) (*types.Resp, error) {
	if err := utiles.DeleteComposeProject(req.Name); err != nil {
		return &types.Resp{Code: 400, Msg: err.Error(), Data: map[string]interface{}{}}, nil
	}
	l.svcCtx.AddOperationLog("compose", "删除 Compose 项目", req.Name)
	return &types.Resp{Code: 200, Msg: "success", Data: map[string]interface{}{}}, nil
}

func (l *ComposeLogic) Run(req *types.ComposeProjectPathReq, action string) (*types.Resp, error) {
	taskID, err := utiles.RunComposeProject(l.svcCtx, req.Name, action)
	if err != nil {
		return &types.Resp{Code: 400, Msg: err.Error(), Data: map[string]interface{}{}}, nil
	}
	return &types.Resp{Code: 200, Msg: "success", Data: map[string]string{"taskID": taskID}}, nil
}

func (l *ComposeLogic) FromDockerRun(req *types.ComposeFromDockerRunReq) (*types.Resp, error) {
	content, err := utiles.ComposeFromDockerRun(req.Command)
	if err != nil {
		return &types.Resp{Code: 400, Msg: err.Error(), Data: map[string]interface{}{}}, nil
	}
	return &types.Resp{Code: 200, Msg: "success", Data: map[string]string{"content": content}}, nil
}

func (l *ComposeLogic) FromContainers(req *types.ComposeFromContainersReq) (*types.Resp, error) {
	content, err := utiles.ComposeFromContainers(l.svcCtx, req.ContainerIDs)
	if err != nil {
		return &types.Resp{Code: 500, Msg: err.Error(), Data: map[string]interface{}{}}, nil
	}
	return &types.Resp{Code: 200, Msg: "success", Data: map[string]string{"content": content}}, nil
}
