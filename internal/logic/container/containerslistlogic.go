package container

import (
	"context"
	"github.com/onlyLTY/dockerCopilot/internal/utiles"
	"os"
	"strings"
	"time"

	"github.com/onlyLTY/dockerCopilot/internal/svc"
	"github.com/onlyLTY/dockerCopilot/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type ContainersListLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

type Info struct {
	Id          string `json:"id"`
	Status      string `json:"status"`
	Name        string `json:"name"`
	UsingImage  string `json:"usingImage"`
	CreateImage string `json:"createImage"`
	CreateTime  string `json:"createTime"`
	RunningTime string `json:"runningTime"`
	HaveUpdate  bool   `json:"haveUpdate"`
	IsSelf      bool   `json:"isSelf"`
}

func NewContainersListLogic(ctx context.Context, svcCtx *svc.ServiceContext) *ContainersListLogic {
	return &ContainersListLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *ContainersListLogic) ContainersList() (resp *types.Resp, err error) {
	// 获取所有容器（包括停止的容器）
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
	// 容器列表必须优先稳定返回本地 Docker 状态。
	// 远端镜像更新检测会访问 DockerHub/GHCR/私有仓库，遇到无权限、无 RepoDigest 或网络慢时会阻塞页面，
	// 因此不能在 /api/containers 同步执行。这里仅复用已有缓存；后台会带 30 分钟冷却异步刷新缓存。
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
			ContainerName := v.Names[0][1:]
			containerInfo.Name = ContainerName
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
		}
		containerInfo.CreateImage = containerInspect.Config.Image
		if cached, ok := l.svcCtx.GetHubImageUpdate(v.ImageID); ok {
			// /api/containers must stay local-fast.
			// Never re-check remote registries synchronously while rendering the page;
			// just reuse cached update state and let the background refresh update it.
			v.Update = cached
		}
		t := time.Unix(v.Created, 0)
		containerInfo.CreateTime = t.Format("2006-01-02 15:04:05")
		containerInfo.RunningTime = v.Status
		containerInfo.HaveUpdate = v.Update
		containerInfo.IsSelf = selfID != "" && (v.ID == selfID || strings.HasPrefix(v.ID, selfID) || strings.HasPrefix(selfID, v.ID))
		containerInfoList = append(containerInfoList, containerInfo)
	}
	resp.Data = containerInfoList
	return resp, nil
}
