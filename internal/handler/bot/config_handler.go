package bot

import (
	"encoding/json"
	"io"
	"net/http"

	botlogic "github.com/onlyLTY/dockerCopilot/internal/logic/bot"
	"github.com/onlyLTY/dockerCopilot/internal/svc"
	"github.com/onlyLTY/dockerCopilot/internal/types"
	"github.com/zeromicro/go-zero/rest/httpx"
)

const maxConfigBodyBytes = 1 << 20

func GetConfigHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		l := botlogic.NewConfigLogic(r.Context(), svcCtx)
		resp, _ := l.GetConfig()
		httpx.WriteJson(w, resp.Code, resp)
	}
}

func SaveConfigHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// 必须用 encoding/json 手动解析：go-zero 的 httpx.Parse 不会调用
		// BotConfigReq 的自定义 UnmarshalJSON，导致 PresentFields 缺失，
		// 局部保存(如仅提交加速器字段)会把未提交的布尔开关全部写成 false。
		body, err := io.ReadAll(io.LimitReader(r.Body, maxConfigBodyBytes))
		if err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
			return
		}
		var req types.BotConfigReq
		if err := json.Unmarshal(body, &req); err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
			return
		}
		l := botlogic.NewConfigLogic(r.Context(), svcCtx)
		resp, _ := l.SaveConfig(&req)
		httpx.WriteJson(w, resp.Code, resp)
	}
}
