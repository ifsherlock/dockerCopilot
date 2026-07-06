package container

import (
	"context"
	"time"

	"github.com/onlyLTY/dockerCopilot/internal/domain/summary"
	"github.com/onlyLTY/dockerCopilot/internal/domain/updatecheck"
	"github.com/onlyLTY/dockerCopilot/internal/logic/updateview"
	"github.com/onlyLTY/dockerCopilot/internal/svc"
	"github.com/onlyLTY/dockerCopilot/internal/types"
	"github.com/onlyLTY/dockerCopilot/internal/utiles"
	"github.com/zeromicro/go-zero/core/logx"
)

type ContainersListLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

type Info struct {
	Id           string                      `json:"id"`
	Status       string                      `json:"status"`
	Name         string                      `json:"name"`
	UsingImage   string                      `json:"usingImage"`
	CreateImage  string                      `json:"createImage"`
	CreateTime   string                      `json:"createTime"`
	RunningTime  string                      `json:"runningTime"`
	HaveUpdate   bool                        `json:"haveUpdate"`
	IsSelf       bool                        `json:"isSelf"`
	UpdateKind   string                      `json:"updateKind,omitempty"`
	UpdateStatus string                      `json:"updateStatus,omitempty"`
	Ignored      bool                        `json:"ignored,omitempty"`
	IgnoreReason string                      `json:"ignoreReason,omitempty"`
	EndpointLink types.ContainerEndpointLink `json:"endpointLink"`
}

func NewContainersListLogic(ctx context.Context, svcCtx *svc.ServiceContext) *ContainersListLogic {
	return &ContainersListLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *ContainersListLogic) ContainersList() (resp *types.Resp, err error) {
	resp = &types.Resp{}
	snapshot, err := updateview.BuildContainerSnapshot(l.ctx, l.svcCtx)
	if err != nil {
		resp.Code = 500
		resp.Msg = err.Error()
		resp.Data = map[string]interface{}{}
		return resp, err
	}
	resp.Msg = "success"
	var containerInfoList []Info
	if l.svcCtx.TryStartUpdateCheck(30 * time.Minute) {
		checkList := make([]types.Container, 0, len(snapshot.DockerContainers))
		for _, item := range snapshot.DockerContainers {
			checkList = append(checkList, types.Container{Container: item})
		}
		go func() {
			defer l.svcCtx.FinishUpdateCheck()
			utiles.CheckImageUpdate(l.svcCtx, checkList)
		}()
	}
	for i, v := range snapshot.Inventory.Containers {
		containerInfo := Info{
			Id:           v.ID,
			Status:       v.State,
			Name:         v.Name,
			UsingImage:   v.UsingImage,
			CreateImage:  v.CreatedImageRef,
			CreateTime:   v.CreatedAt.Format("2006-01-02 15:04:05"),
			RunningTime:  v.Status,
			IsSelf:       v.IsSelf,
			UpdateStatus: string(updatecheck.StatusUnknown),
		}
		if inspect, ok := snapshot.Inspects[v.ID]; ok {
			if inspect.Config != nil {
				containerInfo.CreateImage = inspect.Config.Image
			}
			if i < len(snapshot.DockerContainers) {
				containerInfo.EndpointLink = utiles.BuildContainerEndpointLink(snapshot.DockerContainers[i], inspect, l.svcCtx.DockerClient)
			}
		} else {
			l.Error("get image name error" + v.ID)
		}
		state, _ := updateview.UpdateState(l.svcCtx.UpdateStore, v.ImageID)
		containerInfo.HaveUpdate = state.Status == updatecheck.StatusUpdateAvailable
		if containerInfo.HaveUpdate {
			match := summary.ContainerIgnored(v, snapshot.Matcher)
			containerInfo.Ignored = match.Matched
			containerInfo.IgnoreReason = match.Reason
		}
		containerInfo.UpdateKind, containerInfo.UpdateStatus = containerUpdateKind(containerInfo.IsSelf, containerInfo.HaveUpdate, containerInfo.Ignored, state)
		containerInfoList = append(containerInfoList, containerInfo)
	}
	resp.Code = 200
	resp.Data = containerInfoList
	return resp, nil
}

func containerUpdateKind(isSelf bool, haveUpdate bool, ignored bool, state updatecheck.ImageState) (string, string) {
	if ignored {
		if isSelf {
			return "self_container_image", string(updatecheck.StatusIgnored)
		}
		return "container_image", string(updatecheck.StatusIgnored)
	}
	if !haveUpdate {
		return "", updateview.UpdateStatus(state, false)
	}
	if isSelf {
		return "self_container_image", string(updatecheck.StatusUpdateAvailable)
	}
	return "container_image", string(updatecheck.StatusUpdateAvailable)
}
