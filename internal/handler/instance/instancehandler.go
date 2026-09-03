package instance

import (
	"io"
	"net/http"
	"strings"

	"github.com/onlyLTY/dockerCopilot/internal/domain/instanceproxy"
	"github.com/onlyLTY/dockerCopilot/internal/svc"
	"github.com/onlyLTY/dockerCopilot/internal/types"
	"github.com/zeromicro/go-zero/rest/httpx"
	"github.com/zeromicro/go-zero/rest/pathvar"
)

func ListHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		data, err := instanceproxy.List(svcCtx)
		if err != nil {
			httpx.OkJsonCtx(r.Context(), w, &types.Resp{Code: 500, Msg: err.Error(), Data: map[string]interface{}{}})
			return
		}
		httpx.OkJsonCtx(r.Context(), w, &types.Resp{Code: 200, Msg: "success", Data: data})
	}
}

func ProxyHandler(svcCtx *svc.ServiceContext, targetPath func(map[string]string) string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		vars := pathvar.Vars(r)
		response, err := instanceproxy.Proxy(r.Context(), svcCtx, vars["instance"], r.Method, targetPath(vars), r.URL.Query(), r.Header, r.Body)
		if err != nil {
			httpx.OkJsonCtx(r.Context(), w, &types.Resp{Code: 502, Msg: err.Error(), Data: map[string]interface{}{}})
			return
		}
		defer response.Body.Close()
		if contentType := response.Header.Get("Content-Type"); contentType != "" {
			w.Header().Set("Content-Type", contentType)
		}
		statusCode := response.StatusCode
		if statusCode == http.StatusUnauthorized || statusCode == http.StatusForbidden {
			statusCode = http.StatusBadGateway
		}
		w.WriteHeader(statusCode)
		_, _ = io.Copy(w, io.LimitReader(response.Body, 32<<20))
	}
}

func ContainerPath(suffix string) func(map[string]string) string {
	return func(vars map[string]string) string {
		return "/api/container/" + vars["id"] + suffix
	}
}

func StaticPath(path string) func(map[string]string) string {
	return func(map[string]string) string { return path }
}

func ProgressPath(vars map[string]string) string {
	return "/api/progress/" + strings.TrimSpace(vars["taskid"])
}
