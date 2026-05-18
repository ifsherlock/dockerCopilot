package bot

import (
	"net/http"

	botlogic "github.com/onlyLTY/dockerCopilot/internal/logic/bot"
	"github.com/onlyLTY/dockerCopilot/internal/svc"
	"github.com/onlyLTY/dockerCopilot/internal/types"
	"github.com/zeromicro/go-zero/rest/httpx"
)

func GetBlacklistHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		l := botlogic.NewConfigLogic(r.Context(), svcCtx)
		resp, _ := l.GetUpdateBlacklist()
		httpx.WriteJson(w, resp.Code, resp)
	}
}

func SaveBlacklistHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req types.UpdateBlacklistReq
		if err := httpx.Parse(r, &req); err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
			return
		}
		l := botlogic.NewConfigLogic(r.Context(), svcCtx)
		resp, _ := l.SaveUpdateBlacklist(&req)
		httpx.WriteJson(w, resp.Code, resp)
	}
}
