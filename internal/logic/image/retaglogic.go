package image

import (
	"context"
	"fmt"
	"strings"

	dockerImage "github.com/docker/docker/api/types/image"
	"github.com/onlyLTY/dockerCopilot/internal/svc"
	"github.com/onlyLTY/dockerCopilot/internal/types"
	"github.com/onlyLTY/dockerCopilot/internal/utiles"
	"github.com/zeromicro/go-zero/core/logx"
)

type RetagLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

func NewRetagLogic(ctx context.Context, svcCtx *svc.ServiceContext) *RetagLogic {
	return &RetagLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *RetagLogic) Retag(req *types.ImageRetagReq) (resp *types.Resp, err error) {
	resp = &types.Resp{}
	name := strings.TrimSpace(req.Name)
	tag := strings.TrimSpace(req.Tag)
	oldName := strings.TrimSpace(req.OldName)
	oldTag := strings.TrimSpace(req.OldTag)
	if name == "" {
		resp.Code = 400
		resp.Msg = "镜像名不能为空"
		return resp, nil
	}
	if tag == "" {
		tag = "latest"
	}
	if strings.Contains(name, " ") || strings.Contains(tag, " ") {
		resp.Code = 400
		resp.Msg = "镜像名和 Tag 不能包含空格"
		return resp, nil
	}
	list, listErr := utiles.GetImagesList(l.svcCtx)
	if listErr == nil {
		for _, img := range list {
			if img.ID != req.Id {
				continue
			}
			if img.InUsed {
				resp.Code = 409
				resp.Msg = "该镜像正在被容器使用，请先关闭相关容器再修改"
				return resp, nil
			}
			if oldName == "" {
				oldName = img.ImageName
			}
			if oldTag == "" {
				oldTag = img.ImageTag
			}
			break
		}
	}
	if oldName == "" || oldName == "None" {
		inspect, _, inspectErr := l.svcCtx.DockerClient.ImageInspectWithRaw(context.Background(), req.Id)
		if inspectErr == nil {
			oldName, oldTag = utiles.PrimaryRepoTagFromInspect(inspect)
		}
	}
	if oldName == "" || oldName == "None" {
		resp.Code = 400
		resp.Msg = "未找到可重命名的原始镜像引用；当前镜像可能是悬空镜像或无仓库标签"
		return resp, nil
	}
	if oldTag == "" || strings.EqualFold(oldTag, "none") {
		oldTag = "latest"
		resp.Code = 400
		resp.Msg = "当前镜像没有可安全替换的原始 tag，请先重新拉取带 tag 的镜像后再修改"
		return resp, nil
	}
	newRef := fmt.Sprintf("%s:%s", name, tag)
	oldRef := fmt.Sprintf("%s:%s", oldName, oldTag)
	if strings.EqualFold(newRef, oldRef) {
		resp.Code = 200
		resp.Msg = "success"
		resp.Data = map[string]interface{}{"image": newRef}
		return resp, nil
	}
	if err = l.svcCtx.DockerClient.ImageTag(context.Background(), req.Id, newRef); err != nil {
		resp.Code = 500
		resp.Msg = "修改镜像名称/Tag失败: " + err.Error()
		return resp, nil
	}
	_, removeErr := l.svcCtx.DockerClient.ImageRemove(context.Background(), oldRef, dockerImage.RemoveOptions{Force: false, PruneChildren: false})
	if removeErr != nil {
		resp.Code = 200
		resp.Msg = "success"
		resp.Data = map[string]interface{}{
			"image":   newRef,
			"warning": "新标签已创建，但旧标签未自动移除: " + removeErr.Error(),
		}
		return resp, nil
	}
	resp.Code = 200
	resp.Msg = "success"
	resp.Data = map[string]interface{}{"image": newRef}
	return resp, nil
}
