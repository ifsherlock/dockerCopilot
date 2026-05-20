package telegram

import (
	"context"
	"fmt"
	"strings"

	containerlogic "github.com/onlyLTY/dockerCopilot/internal/logic/container"
)

func (r *Runtime) listContainersForInstance(ctx context.Context, inst instanceConfig) ([]interface{}, error) {
	if inst.Local {
		logic := containerlogic.NewContainersListLogic(ctx, r.svcCtx)
		resp, err := logic.ContainersList()
		if err != nil {
			return nil, err
		}
		if resp == nil || resp.Code != 200 {
			return nil, fmt.Errorf(firstNonEmpty(resp.Msg, "获取本地容器列表失败"))
		}
		var items []containerlogic.Info
		if err := decodeRespData(resp.Data, &items); err != nil {
			return nil, err
		}
		out := make([]interface{}, 0, len(items))
		for _, item := range items {
			out = append(out, item)
		}
		return out, nil
	}

	client := newRemoteClient(inst)
	items, err := client.containers(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]interface{}, 0, len(items))
	for _, item := range items {
		out = append(out, item)
	}
	return out, nil
}

func containerStatus(v interface{}) string {
	switch item := v.(type) {
	case containerlogic.Info:
		return item.Status
	case *containerlogic.Info:
		return item.Status
	case remoteContainer:
		return item.Status
	case *remoteContainer:
		return item.Status
	default:
		return strings.TrimSpace(fmt.Sprint(v))
	}
}
