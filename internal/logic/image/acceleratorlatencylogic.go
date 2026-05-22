package image

import (
	"context"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/onlyLTY/dockerCopilot/internal/svc"
	"github.com/onlyLTY/dockerCopilot/internal/types"
	"github.com/zeromicro/go-zero/core/logx"
)

type AcceleratorLatencyLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

type AcceleratorLatency struct {
	Source  string `json:"source"`
	Latency int64  `json:"latency"`
	Status  string `json:"status"`
	Error   string `json:"error,omitempty"`
}

func NewAcceleratorLatencyLogic(ctx context.Context, svcCtx *svc.ServiceContext) *AcceleratorLatencyLogic {
	return &AcceleratorLatencyLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *AcceleratorLatencyLogic) GetLatency() (resp *types.Resp, err error) {
	resp = &types.Resp{}
	cfg, err := svc.LoadRuntimeConfigForRead()
	if err != nil {
		resp.Code = 500
		resp.Msg = err.Error()
		resp.Data = []AcceleratorLatency{}
		return resp, nil
	}
	list := svc.StringList(cfg.Telegram["image_accelerators"])
	if len(list) == 0 {
		list = []string{"docker.1ms.run", "docker.xuanyuan.me", "dockerproxy.com"}
	}
	list = append([]string{"registry-1.docker.io"}, list...)

	client := &http.Client{Timeout: 4 * time.Second}
	results := make([]AcceleratorLatency, len(list))
	var wg sync.WaitGroup
	for i, src := range list {
		source := strings.Trim(strings.TrimSpace(src), "/")
		results[i] = AcceleratorLatency{Source: source, Latency: -1, Status: "testing"}
		if source == "" {
			results[i] = AcceleratorLatency{Source: source, Latency: -1, Status: "failed", Error: "空加速源"}
			continue
		}
		wg.Add(1)
		go func(idx int, source string) {
			defer wg.Done()
			url := "https://" + source + "/v2/"
			started := time.Now()
			req, reqErr := http.NewRequestWithContext(l.ctx, http.MethodGet, url, nil)
			if reqErr != nil {
				results[idx] = AcceleratorLatency{Source: source, Latency: -1, Status: "failed", Error: reqErr.Error()}
				return
			}
			res, doErr := client.Do(req)
			latency := time.Since(started).Milliseconds()
			if doErr != nil {
				results[idx] = AcceleratorLatency{Source: source, Latency: -1, Status: "failed", Error: doErr.Error()}
				return
			}
			defer res.Body.Close()
			status := "ok"
			if res.StatusCode >= 500 {
				status = "failed"
			}
			// Docker registry mirrors commonly return 200 or 401 for /v2/; both mean the endpoint is reachable.
			results[idx] = AcceleratorLatency{Source: source, Latency: latency, Status: status}
		}(i, source)
	}
	wg.Wait()

	resp.Code = 200
	resp.Msg = "success"
	resp.Data = results
	return resp, nil
}
