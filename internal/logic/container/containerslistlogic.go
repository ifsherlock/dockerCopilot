package container

import (
	"context"
	"os"
	"strings"
	"time"

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
	list, err := utiles.GetContainerList(l.svcCtx)
	if err != nil {
		resp.Code = 500
		resp.Msg = err.Error()
		resp.Data = map[string]interface{}{}
		return resp, err
	}
	resp.Msg = "success"
	var containerInfoList []Info
	if l.svcCtx.TryStartUpdateCheck(30 * time.Minute) {
		checkList := append([]types.Container(nil), list...)
		go func() {
			defer l.svcCtx.FinishUpdateCheck()
			utiles.CheckImageUpdate(l.svcCtx, checkList)
		}()
	}
	selfID, _ := os.Hostname()
	selfID = strings.TrimSpace(selfID)
	for _, v := range list {
		var containerInfo Info
		containerInfo.Id = v.ID
		containerInfo.Status = v.State
		if len(v.Names) > 0 {
			containerInfo.Name = strings.TrimPrefix(v.Names[0], "/")
		} else {
			containerInfo.Name = "get container name error"
			l.Error("get container name error" + v.ID)
		}
		if v.Image != "" {
			containerInfo.UsingImage = v.Image
		} else {
			containerInfo.UsingImage = v.ImageID
			l.Error("image dont have name" + v.ID)
		}
		containerInspect, err := utiles.GetContainerInspect(l.svcCtx, v.ID)
		if err != nil {
			containerInfo.CreateImage = ""
			l.Error("get image name error" + v.ID)
		} else {
			containerInfo.CreateImage = containerInspect.Config.Image
			containerInfo.EndpointLink = utiles.BuildContainerEndpointLink(v.Container, containerInspect, l.svcCtx.DockerClient)
		}
		if cached, ok := l.svcCtx.GetHubImageUpdate(v.ImageID); ok {
			v.Update = cached
		}
		t := time.Unix(v.Created, 0)
		containerInfo.CreateTime = t.Format("2006-01-02 15:04:05")
		containerInfo.RunningTime = v.Status
		containerInfo.HaveUpdate = v.Update
		containerInfo.IsSelf = selfID != "" && (v.ID == selfID || strings.HasPrefix(v.ID, selfID) || strings.HasPrefix(selfID, v.ID))
		containerInfoList = append(containerInfoList, containerInfo)
	}
	resp.Code = 200
	resp.Data = containerInfoList
	return resp, nil
}
