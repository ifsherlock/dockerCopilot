package image

import (
	"context"
	"strings"
	"time"

	"github.com/onlyLTY/dockerCopilot/internal/svc"
	"github.com/onlyLTY/dockerCopilot/internal/types"
	"github.com/onlyLTY/dockerCopilot/internal/utiles"
	"github.com/zeromicro/go-zero/core/logx"
)

type ImagesListLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

type ImageRepoLinks struct {
	DockerHub string `json:"dockerHub"`
	GitHub    string `json:"github"`
}

type Info struct {
	Id               string         `json:"id"`
	Name             string         `json:"name"`
	Tag              string         `json:"tag"`
	Size             string         `json:"size"`
	InUsed           bool           `json:"inUsed"`
	UsageState       string         `json:"usageState"`
	CreateTime       string         `json:"createTime"`
	CleanupCandidate bool           `json:"cleanupCandidate"`
	CleanupReason    string         `json:"cleanupReason"`
	MultiRef         bool           `json:"multiRef"`
	HaveUpdate       bool           `json:"haveUpdate"`
	RepoTags         []string       `json:"repoTags,omitempty"`
	RepoDigests      []string       `json:"repoDigests,omitempty"`
	RepoLinks        ImageRepoLinks `json:"repoLinks"`
}

func NewImagesListLogic(ctx context.Context, svcCtx *svc.ServiceContext) *ImagesListLogic {
	return &ImagesListLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *ImagesListLogic) ImagesList() (resp *types.Resp, err error) {
	resp = &types.Resp{}
	list, err := utiles.GetImagesList(l.svcCtx, false)
	if err != nil {
		resp.Code = 500
		resp.Msg = err.Error()
		resp.Data = map[string]interface{}{}
		return resp, err
	}
	for i := range list {
		if !list[i].InUsed {
			list[i].CleanupCandidate = true
			if list[i].CleanupReason == "" || list[i].CleanupReason == "multi_ref" {
				if strings.TrimSpace(list[i].ImageTag) == "None" || strings.TrimSpace(list[i].ImageTag) == "<none>" || strings.TrimSpace(list[i].ImageTag) == "" {
					list[i].CleanupReason = "dangling"
				} else {
					list[i].CleanupReason = "unused"
				}
			}
		}
	}
	if l.svcCtx.TryStartUpdateCheck(30 * time.Minute) {
		go func() {
			defer l.svcCtx.FinishUpdateCheck()
			_, _ = utiles.GetImagesList(l.svcCtx, true)
		}()
	}
	resp.Code = 200
	resp.Msg = "success"
	var imageInfoList []Info
	for _, v := range list {
		var imageInfo Info
		imageInfo.Id = v.ID
		imageInfo.Name = v.ImageName
		imageInfo.Tag = v.ImageTag
		imageInfo.Size = v.SizeFormat
		imageInfo.InUsed = v.InUsed
		imageInfo.UsageState = v.UsageState
		imageInfo.CleanupCandidate = v.CleanupCandidate
		imageInfo.CleanupReason = v.CleanupReason
		imageInfo.MultiRef = v.MultiRef
		imageInfo.HaveUpdate = v.HaveUpdate
		imageInfo.RepoTags = append([]string(nil), v.RepoTags...)
		imageInfo.RepoDigests = append([]string(nil), v.RepoDigests...)
		imageInfo.RepoLinks = ImageRepoLinks{
			DockerHub: utiles.BuildImageDockerHubURL(v.ImageName),
			GitHub:    utiles.BuildImageGitHubURL(v.ImageName),
		}
		t := time.Unix(v.Created, 0)
		imageInfo.CreateTime = t.Format("2006-01-02 15:04:05")
		imageInfoList = append(imageInfoList, imageInfo)
	}
	resp.Data = imageInfoList
	return resp, nil
}
