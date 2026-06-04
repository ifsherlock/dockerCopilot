package volume

import (
	"net/http"

	volumelogic "github.com/onlyLTY/dockerCopilot/internal/logic/volume"
	"github.com/onlyLTY/dockerCopilot/internal/svc"
	"github.com/onlyLTY/dockerCopilot/internal/types"
	"github.com/zeromicro/go-zero/rest/httpx"
)

func ListHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		resp, err := volumelogic.NewVolumeLogic(r.Context(), svcCtx).List()
		write(w, r, resp, err)
	}
}

func DetailHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req types.VolumePathReq
		if err := httpx.Parse(r, &req); err != nil { httpx.ErrorCtx(r.Context(), w, err); return }
		resp, err := volumelogic.NewVolumeLogic(r.Context(), svcCtx).Detail(&req)
		write(w, r, resp, err)
	}
}

func RemoveHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req types.VolumePathReq
		if err := httpx.Parse(r, &req); err != nil { httpx.ErrorCtx(r.Context(), w, err); return }
		resp, err := volumelogic.NewVolumeLogic(r.Context(), svcCtx).Remove(&req)
		write(w, r, resp, err)
	}
}

func write(w http.ResponseWriter, r *http.Request, resp interface{}, err error) {
	if err != nil { httpx.ErrorCtx(r.Context(), w, err); return }
	httpx.OkJsonCtx(r.Context(), w, resp)
}
