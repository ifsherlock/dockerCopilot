package network

import (
	"context"

	"github.com/docker/docker/api/types/network"
	"github.com/onlyLTY/dockerCopilot/internal/svc"
	"github.com/onlyLTY/dockerCopilot/internal/types"
	"github.com/onlyLTY/dockerCopilot/internal/utiles"
	"github.com/zeromicro/go-zero/core/logx"
)

type NetworkLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

func NewNetworkLogic(ctx context.Context, svcCtx *svc.ServiceContext) *NetworkLogic {
	return &NetworkLogic{Logger: logx.WithContext(ctx), ctx: ctx, svcCtx: svcCtx}
}

func (l *NetworkLogic) List() (*types.Resp, error) {
	list, err := utiles.ListNetworks(l.svcCtx)
	if err != nil {
		return &types.Resp{Code: 500, Msg: err.Error(), Data: []interface{}{}}, nil
	}
	return &types.Resp{Code: 200, Msg: "success", Data: list}, nil
}

func (l *NetworkLogic) Detail(req *types.NetworkPathReq) (*types.Resp, error) {
	detail, err := l.svcCtx.DockerClient.NetworkInspect(l.ctx, req.Id, network.InspectOptions{})
	if err != nil {
		return &types.Resp{Code: 500, Msg: err.Error(), Data: map[string]interface{}{}}, nil
	}
	return &types.Resp{Code: 200, Msg: "success", Data: detail}, nil
}

func (l *NetworkLogic) Create(req *types.NetworkCreateReq) (*types.Resp, error) {
	id, err := utiles.CreateNetwork(l.svcCtx, req)
	if err != nil {
		return &types.Resp{Code: 400, Msg: err.Error(), Data: map[string]interface{}{}}, nil
	}
	return &types.Resp{Code: 200, Msg: "success", Data: map[string]string{"id": id}}, nil
}

func (l *NetworkLogic) Remove(req *types.NetworkPathReq) (*types.Resp, error) {
	if err := l.svcCtx.DockerClient.NetworkRemove(l.ctx, req.Id); err != nil {
		return &types.Resp{Code: 500, Msg: err.Error(), Data: map[string]interface{}{}}, nil
	}
	l.svcCtx.AddOperationLog("network", "删除网络", req.Id)
	return &types.Resp{Code: 200, Msg: "success", Data: map[string]string{"id": req.Id}}, nil
}

func (l *NetworkLogic) Connect(req *types.NetworkContainerReq) (*types.Resp, error) {
	if err := utiles.ConnectNetworkContainer(l.svcCtx, req.Id, req); err != nil {
		return &types.Resp{Code: 500, Msg: err.Error(), Data: map[string]interface{}{}}, nil
	}
	return &types.Resp{Code: 200, Msg: "success", Data: map[string]string{"id": req.Id}}, nil
}

func (l *NetworkLogic) Disconnect(req *types.NetworkContainerReq) (*types.Resp, error) {
	if err := utiles.DisconnectNetworkContainer(l.svcCtx, req.Id, req); err != nil {
		return &types.Resp{Code: 500, Msg: err.Error(), Data: map[string]interface{}{}}, nil
	}
	return &types.Resp{Code: 200, Msg: "success", Data: map[string]string{"id": req.Id}}, nil
}

func (l *NetworkLogic) ContainerIP(req *types.NetworkContainerReq) (*types.Resp, error) {
	if err := utiles.ReassignNetworkContainerIP(l.svcCtx, req.Id, req); err != nil {
		return &types.Resp{Code: 500, Msg: err.Error(), Data: map[string]interface{}{}}, nil
	}
	return &types.Resp{Code: 200, Msg: "success", Data: map[string]string{"id": req.Id}}, nil
}

func (l *NetworkLogic) CreateMacvlan(req *types.NetworkCreateReq) (*types.Resp, error) {
	req.Driver = "macvlan"
	return l.Create(req)
}

func (l *NetworkLogic) ReplaceMacvlan(req *types.NetworkCreateReq, oldID string) (*types.Resp, error) {
	result, err := utiles.ReplaceMacvlanNetwork(l.svcCtx, oldID, req)
	if err != nil {
		return &types.Resp{Code: 400, Msg: err.Error(), Data: result}, nil
	}
	return &types.Resp{Code: 200, Msg: "success", Data: result}, nil
}

func (l *NetworkLogic) MacvlanBridgeStatus() (*types.Resp, error) {
	return &types.Resp{Code: 200, Msg: "success", Data: utiles.MacvlanBridgeStatus()}, nil
}
