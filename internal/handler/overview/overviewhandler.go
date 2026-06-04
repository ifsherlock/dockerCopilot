package overview

import (
	"net/http"

	overviewlogic "github.com/onlyLTY/dockerCopilot/internal/logic/overview"
	"github.com/onlyLTY/dockerCopilot/internal/svc"
	"github.com/zeromicro/go-zero/rest/httpx"
)

func OverviewHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		l := overviewlogic.NewOverviewLogic(r.Context(), svcCtx)
		resp, err := l.Overview()
		if err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
			return
		}
		httpx.OkJsonCtx(r.Context(), w, resp)
	}
}
