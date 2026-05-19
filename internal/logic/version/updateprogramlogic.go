package version

import (
	"context"
	"github.com/onlyLTY/dockerCopilot/internal/config"
	"github.com/onlyLTY/dockerCopilot/internal/svc"
	"github.com/onlyLTY/dockerCopilot/internal/types"
	"github.com/onlyLTY/dockerCopilot/internal/utiles"
	"github.com/zeromicro/go-zero/core/logx"
	"os"
	"strings"
	"time"
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

	err = utiles.UpdateProgram(l.svcCtx)
	if err != nil {
		resp.Code = 500
		resp.Msg = err.Error()
		resp.Data = map[string]interface{}{}
		return resp, err
	}
	resp.Code = 200
	resp.Msg = "success"
	go func() {
		time.Sleep(10 * time.Second)
		os.Exit(1)
	}()
	resp.Data = map[string]interface{}{"updated": true}
	return resp, nil
}
