package store

import (
	"context"
	"strings"

	"github.com/onlyLTY/dockerCopilot/internal/svc"
	"github.com/onlyLTY/dockerCopilot/internal/types"
	"github.com/onlyLTY/dockerCopilot/internal/utiles"
	"github.com/zeromicro/go-zero/core/logx"
)

type StoreLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

func NewStoreLogic(ctx context.Context, svcCtx *svc.ServiceContext) *StoreLogic {
	return &StoreLogic{Logger: logx.WithContext(ctx), ctx: ctx, svcCtx: svcCtx}
}

func (l *StoreLogic) Sources() (*types.Resp, error) {
	sources, err := utiles.LoadStoreSources()
	if err != nil {
		return &types.Resp{Code: 500, Msg: err.Error(), Data: []interface{}{}}, nil
	}
	return &types.Resp{Code: 200, Msg: "success", Data: sources}, nil
}

func (l *StoreLogic) Apps(force bool) (*types.Resp, error) {
	apps, err := utiles.LoadStoreApps(force)
	if err != nil {
		return &types.Resp{Code: 200, Msg: "使用缓存或内置样例: " + err.Error(), Data: apps}, nil
	}
	return &types.Resp{Code: 200, Msg: "success", Data: apps}, nil
}

func (l *StoreLogic) SaveSource(req *types.StoreSourceReq) (*types.Resp, error) {
	source := utiles.StoreSource{
		ID:      strings.TrimSpace(req.Id),
		Name:    strings.TrimSpace(req.Name),
		URL:     strings.TrimSpace(req.URL),
		Enabled: req.Enabled,
	}
	sources, err := utiles.SaveStoreSource(source)
	if err != nil {
		return &types.Resp{Code: 400, Msg: err.Error(), Data: []interface{}{}}, nil
	}
	l.svcCtx.AddOperationLog("store", "保存商店源", source.Name)
	return &types.Resp{Code: 200, Msg: "success", Data: sources}, nil
}

func (l *StoreLogic) DeleteSource(req *types.StoreSourcePathReq) (*types.Resp, error) {
	sources, err := utiles.DeleteStoreSource(req.Id)
	if err != nil {
		return &types.Resp{Code: 400, Msg: err.Error(), Data: []interface{}{}}, nil
	}
	l.svcCtx.AddOperationLog("store", "删除商店源", req.Id)
	return &types.Resp{Code: 200, Msg: "success", Data: sources}, nil
}
