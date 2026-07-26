package compose

import (
	"net/http"
	"net/url"
	"strings"

	composelogic "github.com/onlyLTY/dockerCopilot/internal/logic/compose"
	"github.com/onlyLTY/dockerCopilot/internal/svc"
	"github.com/onlyLTY/dockerCopilot/internal/types"
	"github.com/zeromicro/go-zero/rest/httpx"
)

func ProjectsHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		resp, err := composelogic.NewComposeLogic(r.Context(), svcCtx).Projects()
		write(w, r, resp, err)
	}
}

func ProjectHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req types.ComposeProjectPathReq
		if err := httpx.Parse(r, &req); err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
			return
		}
		resp, err := composelogic.NewComposeLogic(r.Context(), svcCtx).Project(&req)
		write(w, r, resp, err)
	}
}

func SaveHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req types.ComposeProjectReq
		if err := httpx.Parse(r, &req); err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
			return
		}
		if strings.TrimSpace(req.Name) == "" {
			req.Name = composeProjectNameFromPath(r.URL.Path)
		}
		resp, err := composelogic.NewComposeLogic(r.Context(), svcCtx).Save(&req)
		write(w, r, resp, err)
	}
}

func ActionHandler(svcCtx *svc.ServiceContext, action string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req types.ComposeProjectPathReq
		if err := httpx.Parse(r, &req); err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
			return
		}
		resp, err := composelogic.NewComposeLogic(r.Context(), svcCtx).Run(&req, action)
		write(w, r, resp, err)
	}
}

func ClearHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req types.ComposeProjectPathReq
		if err := httpx.Parse(r, &req); err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
			return
		}
		resp, err := composelogic.NewComposeLogic(r.Context(), svcCtx).Clear(&req)
		write(w, r, resp, err)
	}
}

func DeleteHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req types.ComposeProjectPathReq
		if err := httpx.Parse(r, &req); err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
			return
		}
		resp, err := composelogic.NewComposeLogic(r.Context(), svcCtx).Delete(&req)
		write(w, r, resp, err)
	}
}

func FromDockerRunHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req types.ComposeFromDockerRunReq
		if err := httpx.Parse(r, &req); err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
			return
		}
		resp, err := composelogic.NewComposeLogic(r.Context(), svcCtx).FromDockerRun(&req)
		write(w, r, resp, err)
	}
}

func FromContainersHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req types.ComposeFromContainersReq
		if err := httpx.Parse(r, &req); err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
			return
		}
		resp, err := composelogic.NewComposeLogic(r.Context(), svcCtx).FromContainers(&req)
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

func composeProjectNameFromPath(path string) string {
	const marker = "/compose/project/"
	idx := strings.LastIndex(path, marker)
	if idx < 0 {
		return ""
	}
	name := strings.Trim(strings.TrimPrefix(path[idx:], marker), "/")
	if name == "" {
		return ""
	}
	if decoded, err := url.PathUnescape(name); err == nil {
		return decoded
	}
	return name
}
