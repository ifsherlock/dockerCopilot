package volume

import (
	"context"

	"github.com/docker/docker/api/types/volume"
	"github.com/onlyLTY/dockerCopilot/internal/svc"
	"github.com/onlyLTY/dockerCopilot/internal/types"
	"github.com/onlyLTY/dockerCopilot/internal/utiles"
	"github.com/zeromicro/go-zero/core/logx"
)

type VolumeLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

func NewVolumeLogic(ctx context.Context, svcCtx *svc.ServiceContext) *VolumeLogic {
	return &VolumeLogic{Logger: logx.WithContext(ctx), ctx: ctx, svcCtx: svcCtx}
}

func (l *VolumeLogic) List() (*types.Resp, error) {
	list, err := utiles.ListVolumes(l.svcCtx)
	if err != nil {
		return &types.Resp{Code: 500, Msg: err.Error(), Data: []interface{}{}}, nil
	}
	return &types.Resp{Code: 200, Msg: "success", Data: list}, nil
}

func (l *VolumeLogic) Detail(req *types.VolumePathReq) (*types.Resp, error) {
	detail, err := l.svcCtx.DockerClient.VolumeInspect(l.ctx, req.Name)
	if err != nil {
		return &types.Resp{Code: 500, Msg: err.Error(), Data: volume.Volume{}}, nil
	}
	return &types.Resp{Code: 200, Msg: "success", Data: detail}, nil
}

func (l *VolumeLogic) Remove(req *types.VolumePathReq) (*types.Resp, error) {
	if err := utiles.DeleteVolume(l.svcCtx, req.Name); err != nil {
		return &types.Resp{Code: 400, Msg: err.Error(), Data: map[string]interface{}{}}, nil
	}
	return &types.Resp{Code: 200, Msg: "success", Data: map[string]string{"name": req.Name}}, nil
}
