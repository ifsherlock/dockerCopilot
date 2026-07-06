package image

import (
	"context"
	"time"

	"github.com/onlyLTY/dockerCopilot/internal/domain/inventory"
	"github.com/onlyLTY/dockerCopilot/internal/domain/summary"
	"github.com/onlyLTY/dockerCopilot/internal/domain/updatecheck"
	"github.com/onlyLTY/dockerCopilot/internal/logic/updateview"
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
	UpdateKind       string         `json:"updateKind,omitempty"`
	UpdateStatus     string         `json:"updateStatus,omitempty"`
	Ignored          bool           `json:"ignored,omitempty"`
	IgnoreReason     string         `json:"ignoreReason,omitempty"`
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
	snapshot, err := updateview.BuildImageSnapshot(l.ctx, l.svcCtx)
	if err != nil {
		resp.Code = 500
		resp.Msg = err.Error()
		resp.Data = map[string]interface{}{}
		return resp, err
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
	for _, v := range snapshot.Inventory.Images {
		var imageInfo Info
		imageInfo.Id = v.ID
		imageInfo.Name = v.Name
		imageInfo.Tag = v.Tag
		imageInfo.Size = inventory.SizeFormat(v.Size)
		imageInfo.InUsed = v.InUsed
		imageInfo.UsageState = v.UsageState
		imageInfo.CleanupCandidate = v.CleanupCandidate
		imageInfo.CleanupReason = v.CleanupReason
		imageInfo.MultiRef = v.MultiRef
		state, _ := updateview.UpdateState(l.svcCtx.UpdateStore, v.ID)
		imageInfo.HaveUpdate = state.Status == updatecheck.StatusUpdateAvailable
		if imageInfo.HaveUpdate {
			match := summary.ImageIgnored(v, snapshot.Matcher)
			imageInfo.Ignored = match.Matched
			imageInfo.IgnoreReason = match.Reason
		}
		imageInfo.UpdateKind, imageInfo.UpdateStatus = imageUpdateKind(imageInfo.HaveUpdate, imageInfo.Ignored, state)
		imageInfo.RepoTags = append([]string(nil), v.RepoTags...)
		imageInfo.RepoDigests = append([]string(nil), v.RepoDigests...)
		imageInfo.RepoLinks = ImageRepoLinks{
			DockerHub: utiles.BuildImageDockerHubURL(v.Name),
			GitHub:    utiles.BuildImageGitHubURL(v.Name),
		}
		imageInfo.CreateTime = v.CreatedAt.Format("2006-01-02 15:04:05")
		imageInfoList = append(imageInfoList, imageInfo)
	}
	resp.Data = imageInfoList
	return resp, nil
}

func imageUpdateKind(haveUpdate bool, ignored bool, state updatecheck.ImageState) (string, string) {
	if ignored {
		return "image", string(updatecheck.StatusIgnored)
	}
	if !haveUpdate {
		return "", updateview.UpdateStatus(state, false)
	}
	return "image", string(updatecheck.StatusUpdateAvailable)
}
