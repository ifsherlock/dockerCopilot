package store

import (
	"net/http"

	storelogic "github.com/onlyLTY/dockerCopilot/internal/logic/store"
	"github.com/onlyLTY/dockerCopilot/internal/svc"
	"github.com/onlyLTY/dockerCopilot/internal/types"
	"github.com/zeromicro/go-zero/rest/httpx"
)

func SourcesHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		resp, err := storelogic.NewStoreLogic(r.Context(), svcCtx).Sources()
		write(w, r, resp, err)
	}
}

func AppsHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		force := r.URL.Query().Get("force") == "1" || r.URL.Query().Get("force") == "true"
		resp, err := storelogic.NewStoreLogic(r.Context(), svcCtx).Apps(force)
		write(w, r, resp, err)
	}
}

func SaveSourceHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req types.StoreSourceReq
		if err := httpx.Parse(r, &req); err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
			return
		}
		resp, err := storelogic.NewStoreLogic(r.Context(), svcCtx).SaveSource(&req)
		write(w, r, resp, err)
	}
}

func DeleteSourceHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req types.StoreSourcePathReq
		if err := httpx.Parse(r, &req); err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
			return
		}
		resp, err := storelogic.NewStoreLogic(r.Context(), svcCtx).DeleteSource(&req)
		write(w, r, resp, err)
	}
}

func write(w http.ResponseWriter, r *http.Request, resp interface{}, err error) {
	if err != nil {
		httpx.ErrorCtx(r.Context(), w, err)
		return
	}
	httpx.OkJsonCtx(r.Context(), w, resp)
}
