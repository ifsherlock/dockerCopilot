package network

import (
	"net/http"
	"net/url"
	"strings"

	networklogic "github.com/onlyLTY/dockerCopilot/internal/logic/network"
	"github.com/onlyLTY/dockerCopilot/internal/svc"
	"github.com/onlyLTY/dockerCopilot/internal/types"
	"github.com/zeromicro/go-zero/rest/httpx"
)

func ListHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		resp, err := networklogic.NewNetworkLogic(r.Context(), svcCtx).List()
		write(w, r, resp, err)
	}
}

func DetailHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req types.NetworkPathReq
		if err := httpx.Parse(r, &req); err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
			return
		}
		resp, err := networklogic.NewNetworkLogic(r.Context(), svcCtx).Detail(&req)
		write(w, r, resp, err)
	}
}

func CreateHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req types.NetworkCreateReq
		if err := httpx.Parse(r, &req); err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
			return
		}
		resp, err := networklogic.NewNetworkLogic(r.Context(), svcCtx).Create(&req)
		write(w, r, resp, err)
	}
}

func RemoveHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req types.NetworkPathReq
		if err := httpx.Parse(r, &req); err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
			return
		}
		resp, err := networklogic.NewNetworkLogic(r.Context(), svcCtx).Remove(&req)
		write(w, r, resp, err)
	}
}

func ConnectHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req types.NetworkContainerReq
		if err := httpx.Parse(r, &req); err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
			return
		}
		resp, err := networklogic.NewNetworkLogic(r.Context(), svcCtx).Connect(&req)
		write(w, r, resp, err)
	}
}

func DisconnectHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req types.NetworkContainerReq
		if err := httpx.Parse(r, &req); err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
			return
		}
		resp, err := networklogic.NewNetworkLogic(r.Context(), svcCtx).Disconnect(&req)
		write(w, r, resp, err)
	}
}

func ContainerIPHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req types.NetworkContainerReq
		if err := httpx.Parse(r, &req); err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
			return
		}
		resp, err := networklogic.NewNetworkLogic(r.Context(), svcCtx).ContainerIP(&req)
		write(w, r, resp, err)
	}
}

func CreateMacvlanHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req types.NetworkCreateReq
		if err := httpx.Parse(r, &req); err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
			return
		}
		resp, err := networklogic.NewNetworkLogic(r.Context(), svcCtx).CreateMacvlan(&req)
		write(w, r, resp, err)
	}
}

func ReplaceMacvlanHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req types.NetworkCreateReq
		if err := httpx.ParseJsonBody(r, &req); err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
			return
		}
		oldID := macvlanReplaceIDFromPath(r.URL.Path)
		if oldID == "" {
			httpx.WriteJson(w, http.StatusBadRequest, map[string]interface{}{"code": 400, "msg": "missing macvlan network id", "data": map[string]interface{}{}})
			return
		}
		req.Driver = "macvlan"
		resp, err := networklogic.NewNetworkLogic(r.Context(), svcCtx).ReplaceMacvlan(&req, oldID)
		write(w, r, resp, err)
	}
}

func MacvlanBridgeStatusHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		resp, err := networklogic.NewNetworkLogic(r.Context(), svcCtx).MacvlanBridgeStatus()
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

func macvlanReplaceIDFromPath(path string) string {
	const prefix = "/api/network/macvlan/"
	const suffix = "/replace"
	value := strings.TrimSpace(path)
	value = strings.TrimPrefix(value, prefix)
	value = strings.TrimSuffix(value, suffix)
	value = strings.Trim(value, "/")
	if value == "" {
		return ""
	}
	if decoded, err := url.PathUnescape(value); err == nil {
		return decoded
	}
	return value
}
