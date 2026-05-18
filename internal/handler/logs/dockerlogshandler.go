package logs

import (
	"net/http"

	logslogic "github.com/onlyLTY/dockerCopilot/internal/logic/logs"
	"github.com/onlyLTY/dockerCopilot/internal/svc"
	"github.com/onlyLTY/dockerCopilot/internal/types"
	"github.com/zeromicro/go-zero/rest/httpx"
)

func DockerLogsHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req types.GetLogsReq
		if err := httpx.Parse(r, &req); err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
			return
		}
		l := logslogic.NewDockerLogsLogic(r.Context(), svcCtx)
		resp, _ := l.DockerLogs(&req)
		httpx.WriteJson(w, resp.Code, resp)
	}
}
