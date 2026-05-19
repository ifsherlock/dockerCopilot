package version

import (
	"net/http"
	"strings"

	"github.com/onlyLTY/dockerCopilot/internal/logic/version"
	"github.com/onlyLTY/dockerCopilot/internal/svc"
	"github.com/zeromicro/go-zero/rest/httpx"
)

func UpdateProgramHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		l := version.NewUpdateProgramLogic(r.Context(), svcCtx)
		force := strings.TrimSpace(r.URL.Query().Get("force"))
		resp, err := l.UpdateProgram(force == "1" || strings.EqualFold(force, "true"))
		if err != nil {
			httpx.WriteJson(w, resp.Code, resp)
		} else {
			httpx.WriteJson(w, resp.Code, resp)
		}
	}
}
