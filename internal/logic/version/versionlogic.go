package version

import (
	"context"
	"time"

	"github.com/onlyLTY/dockerCopilot/internal/config"
	"github.com/onlyLTY/dockerCopilot/internal/domain/updatecheck"

	"github.com/onlyLTY/dockerCopilot/internal/svc"
	"github.com/onlyLTY/dockerCopilot/internal/types"
	"github.com/onlyLTY/dockerCopilot/internal/utiles"
	"github.com/zeromicro/go-zero/core/logx"
)

type VersionLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

func NewVersionLogic(ctx context.Context, svcCtx *svc.ServiceContext) *VersionLogic {
	return &VersionLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *VersionLogic) Version(req *types.VersionReq) (resp *types.Resp, err error) {
	resp = &types.Resp{}
	if req.Type == "local" {
		resp.Code = 200
		resp.Msg = "success"
		resp.Data = map[string]interface{}{
			"version":   config.Version,
			"buildDate": config.BuildDate,
			"programUpdateState": updatecheck.ProgramUpdateState{
				LocalVersion: config.Version,
				BuildDate:    config.BuildDate,
				Status:       updatecheck.StatusUnknown,
				CheckedAt:    time.Now(),
			},
		}
		return resp, nil
	} else if req.Type == "remote" {
		remoteVersion, err := utiles.GetRemoteVersion()
		if err != nil {
			state := buildProgramUpdateState(config.Version, config.BuildDate, config.Version, updatecheck.StatusCheckFailed, err.Error())
			if l.svcCtx != nil && l.svcCtx.UpdateStore != nil {
				l.svcCtx.UpdateStore.SetProgram(state)
			}
			resp.Code = 50001
			resp.Msg = "获取版本错误" + err.Error()
			resp.Data = programVersionResponse(state)
			return resp, nil
		}
		state := buildProgramUpdateState(config.Version, config.BuildDate, remoteVersion, updatecheck.StatusUpToDate, "")
		if utiles.CompareVersions(remoteVersion, config.Version) > 0 {
			state.Status = updatecheck.StatusUpdateAvailable
		}
		if l.svcCtx != nil && l.svcCtx.UpdateStore != nil {
			l.svcCtx.UpdateStore.SetProgram(state)
		}
		if state.Status == updatecheck.StatusUpdateAvailable {
			resp.Code = 200
			resp.Msg = "程序有更新"
			resp.Data = programVersionResponse(state)
			return resp, nil
		}
		resp.Code = 200
		resp.Msg = "程序无更新"
		resp.Data = programVersionResponse(state)
		return resp, nil

	} else {
		resp.Code = 400
		resp.Msg = "type 参数错误"
		resp.Data = map[string]interface{}{}
		return resp, nil
	}
}

func buildProgramUpdateState(localVersion string, buildDate string, remoteVersion string, status updatecheck.Status, errMsg string) updatecheck.ProgramUpdateState {
	return updatecheck.ProgramUpdateState{
		LocalVersion:  localVersion,
		BuildDate:     buildDate,
		RemoteVersion: remoteVersion,
		Status:        status,
		CheckedAt:     time.Now(),
		Error:         errMsg,
	}
}

func programVersionResponse(state updatecheck.ProgramUpdateState) map[string]interface{} {
	return map[string]interface{}{
		"remoteVersion":       state.RemoteVersion,
		"hasProgramUpdate":    state.Status == updatecheck.StatusUpdateAvailable,
		"programUpdateStatus": string(state.Status),
		"programUpdateState":  state,
	}
}
