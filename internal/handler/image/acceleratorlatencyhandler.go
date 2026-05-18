package image

import (
	"net/http"

	imagelogic "github.com/onlyLTY/dockerCopilot/internal/logic/image"
	"github.com/onlyLTY/dockerCopilot/internal/svc"
	"github.com/zeromicro/go-zero/rest/httpx"
)

func AcceleratorLatencyHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		l := imagelogic.NewAcceleratorLatencyLogic(r.Context(), svcCtx)
		resp, _ := l.GetLatency()
		httpx.WriteJson(w, resp.Code, resp)
	}
}
