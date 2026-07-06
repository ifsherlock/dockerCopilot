package qqbot

import (
	"context"
	"fmt"
	"sort"
	"strings"

	"github.com/google/uuid"
	"github.com/onlyLTY/dockerCopilot/internal/domain/blacklist"
	botlogic "github.com/onlyLTY/dockerCopilot/internal/logic/bot"
	containerlogic "github.com/onlyLTY/dockerCopilot/internal/logic/container"
	imagelogic "github.com/onlyLTY/dockerCopilot/internal/logic/image"
	versionlogic "github.com/onlyLTY/dockerCopilot/internal/logic/version"
	"github.com/onlyLTY/dockerCopilot/internal/svc"
	"github.com/onlyLTY/dockerCopilot/internal/types"
	"github.com/onlyLTY/dockerCopilot/internal/utiles"
)

type ContainerUpdateItem struct {
	ID          string
	Name        string
	UsingImage  string
	CreateImage string
	Blocked     bool
	IsSelf      bool
}

type StatusSummary struct {
	Containers  int
	Running     int
	Stopped     int
	UpdateCount int
}

type ContainerInfoLite struct {
	ID         string
	Name       string
	Status     string
	Image      string
	CreatedAt  string
	RunningFor string
	HaveUpdate bool
	Ignored    bool
	IsSelf     bool
}

type ImageInfoLite struct {
	ID               string
	Name             string
	Tag              string
	Size             string
	InUse            bool
	UsageState       string
	CleanupCandidate bool
	CleanupReason    string
	HaveUpdate       bool
	Ignored          bool
}

type BackupSummary struct {
	Files []string
}

type VersionSummary struct {
	LocalVersion  string
	BuildDate     string
	RemoteVersion string
	RemoteStatus  string
}

type ActionService struct {
	svcCtx *svc.ServiceContext
}

func (s *ActionService) Containers(ctx context.Context) ([]ContainerInfoLite, error) {
	items, err := s.listContainers(ctx)
	if err != nil {
		return nil, err
	}
	sort.Slice(items, func(i, j int) bool { return strings.ToLower(items[i].Name) < strings.ToLower(items[j].Name) })
	result := make([]ContainerInfoLite, 0, len(items))
	for _, item := range items {
		result = append(result, ContainerInfoLite{
			ID:         item.Id,
			Name:       item.Name,
			Status:     item.Status,
			Image:      firstNonEmpty(item.UsingImage, item.CreateImage),
			CreatedAt:  item.CreateTime,
			RunningFor: item.RunningTime,
			HaveUpdate: item.HaveUpdate,
			Ignored:    item.Ignored,
			IsSelf:     item.IsSelf,
		})
	}
	return result, nil
}

func (s *ActionService) StartContainer(ctx context.Context, item ContainerInfoLite) (string, error) {
	resp, err := containerlogic.NewStartLogic(ctx, s.svcCtx).Start(&types.IdReq{Id: item.ID})
	if err != nil {
		return "", err
	}
	return successMessage(resp, "容器已启动"), nil
}

func (s *ActionService) StopContainer(ctx context.Context, item ContainerInfoLite) (string, error) {
	resp, err := containerlogic.NewStopLogic(ctx, s.svcCtx).Stop(&types.IdReq{Id: item.ID})
	if err != nil {
		return "", err
	}
	return successMessage(resp, "容器已停止"), nil
}

func (s *ActionService) RestartContainer(ctx context.Context, item ContainerInfoLite) (string, error) {
	resp, err := containerlogic.NewRestartLogic(ctx, s.svcCtx).Restart(&types.IdReq{Id: item.ID})
	if err != nil {
		return "", err
	}
	return successMessage(resp, "容器已重启"), nil
}

func (s *ActionService) ImageList(ctx context.Context) ([]ImageInfoLite, error) {
	logic := imagelogic.NewImagesListLogic(ctx, s.svcCtx)
	resp, err := logic.ImagesList()
	if err != nil {
		return nil, err
	}
	if resp == nil || (resp.Code != 200 && resp.Code != 0) {
		if resp == nil {
			return nil, fmt.Errorf("获取镜像列表失败")
		}
		return nil, fmt.Errorf(resp.Msg)
	}
	var images []imagelogic.Info
	if err := decodeRespData(resp.Data, &images); err != nil {
		return nil, err
	}
	sort.Slice(images, func(i, j int) bool {
		return strings.ToLower(images[i].Name+":"+images[i].Tag) < strings.ToLower(images[j].Name+":"+images[j].Tag)
	})
	result := make([]ImageInfoLite, 0, len(images))
	for _, item := range images {
		result = append(result, ImageInfoLite{
			ID:               item.Id,
			Name:             item.Name,
			Tag:              item.Tag,
			Size:             item.Size,
			InUse:            item.InUsed,
			UsageState:       item.UsageState,
			CleanupCandidate: item.CleanupCandidate,
			CleanupReason:    item.CleanupReason,
			HaveUpdate:       item.HaveUpdate,
			Ignored:          item.Ignored,
		})
	}
	return result, nil
}

func (s *ActionService) RemoveImage(ctx context.Context, item ImageInfoLite, force bool) (string, error) {
	resp, err := imagelogic.NewRemoveLogic(ctx, s.svcCtx).Remove(&types.RemoveImageReq{
		IdReq: types.IdReq{Id: item.ID},
		Force: force,
	})
	if err != nil {
		return "", err
	}
	if resp != nil && resp.Code != 200 && resp.Code != 0 {
		return "", fmt.Errorf(firstNonEmpty(resp.Msg, "镜像删除失败"))
	}
	return successMessage(resp, "镜像已删除"), nil
}

func (s *ActionService) Backups(ctx context.Context) (BackupSummary, error) {
	logic := containerlogic.NewListBackupsLogic(ctx, s.svcCtx)
	resp, err := logic.ListBackups()
	if err != nil {
		return BackupSummary{}, err
	}
	if resp == nil || (resp.Code != 200 && resp.Code != 0) {
		if resp == nil {
			return BackupSummary{}, fmt.Errorf("获取备份列表失败")
		}
		return BackupSummary{}, fmt.Errorf(resp.Msg)
	}
	var files []string
	if err := decodeRespData(resp.Data, &files); err != nil {
		return BackupSummary{}, err
	}
	sort.Strings(files)
	return BackupSummary{Files: files}, nil
}

func (s *ActionService) Version(ctx context.Context) (VersionSummary, error) {
	localResp, err := versionlogic.NewVersionLogic(ctx, s.svcCtx).Version(&types.VersionReq{Type: "local"})
	if err != nil {
		return VersionSummary{}, err
	}
	var local map[string]interface{}
	if localResp != nil {
		_ = decodeRespData(localResp.Data, &local)
	}
	remoteResp, _ := versionlogic.NewVersionLogic(ctx, s.svcCtx).Version(&types.VersionReq{Type: "remote"})
	var remote map[string]interface{}
	if remoteResp != nil {
		_ = decodeRespData(remoteResp.Data, &remote)
	}
	return VersionSummary{
		LocalVersion:  mapString(local, "version"),
		BuildDate:     mapString(local, "buildDate"),
		RemoteVersion: mapString(remote, "remoteVersion"),
		RemoteStatus:  firstNonEmpty(mapString(remote, "programUpdateStatus"), remoteRespMsg(remoteResp), "未知"),
	}, nil
}

func (s *ActionService) CheckUpdates(ctx context.Context) (string, error) {
	resp, err := containerlogic.NewCheckUpdateLogic(ctx, s.svcCtx).CheckUpdate()
	if err != nil {
		return "", err
	}
	if resp == nil {
		return "已提交更新检测。", nil
	}
	return firstNonEmpty(resp.Msg, "已提交更新检测。"), nil
}

func (s *ActionService) BackupJSON(ctx context.Context) error {
	return s.svcCtx.RunJSONBackupNow()
}

func (s *ActionService) BackupCompose(ctx context.Context) error {
	return s.svcCtx.RunComposeBackupNow()
}

func (s *ActionService) CleanImages(ctx context.Context) (string, error) {
	images, err := imagelogic.NewImagesListLogic(ctx, s.svcCtx).ImagesList()
	if err != nil {
		return "", err
	}
	var items []imagelogic.Info
	if images != nil {
		_ = decodeRespData(images.Data, &items)
	}
	candidates := make([]imagelogic.Info, 0)
	for _, item := range items {
		if item.CleanupCandidate && !item.InUsed {
			candidates = append(candidates, item)
		}
	}
	if len(candidates) == 0 {
		return "没有可清理的未使用镜像。", nil
	}
	removed := 0
	for _, item := range candidates {
		resp, err := imagelogic.NewRemoveLogic(ctx, s.svcCtx).Remove(&types.RemoveImageReq{
			IdReq: types.IdReq{Id: item.Id},
			Force: false,
		})
		if err == nil && resp != nil && (resp.Code == 200 || resp.Code == 0) {
			removed++
		}
	}
	return fmt.Sprintf("清理完成：已删除 %d/%d 个候选镜像。", removed, len(candidates)), nil
}

func NewActionService(svcCtx *svc.ServiceContext) *ActionService {
	return &ActionService{svcCtx: svcCtx}
}

func (s *ActionService) Status(ctx context.Context) (StatusSummary, error) {
	containers, err := s.listContainers(ctx)
	if err != nil {
		return StatusSummary{}, err
	}
	summary := StatusSummary{Containers: len(containers)}
	for _, item := range containers {
		switch strings.ToLower(item.Status) {
		case "running":
			summary.Running++
		default:
			summary.Stopped++
		}
		if item.HaveUpdate && !item.Ignored {
			summary.UpdateCount++
		}
	}
	return summary, nil
}

func (s *ActionService) Updates(ctx context.Context) ([]ContainerUpdateItem, error) {
	containers, err := s.listContainers(ctx)
	if err != nil {
		return nil, err
	}
	matcher, _ := s.updateBlacklistMatcher(ctx)
	updates := make([]ContainerUpdateItem, 0)
	for _, item := range containers {
		if !item.HaveUpdate || item.Ignored {
			continue
		}
		blocked := matcher.MatchContainerUpdate(item.Name, item.UsingImage, item.CreateImage).Matched
		if blocked {
			continue
		}
		updates = append(updates, ContainerUpdateItem{
			ID:          item.Id,
			Name:        item.Name,
			UsingImage:  item.UsingImage,
			CreateImage: item.CreateImage,
			Blocked:     blocked,
			IsSelf:      item.IsSelf,
		})
	}
	sort.Slice(updates, func(i, j int) bool { return strings.ToLower(updates[i].Name) < strings.ToLower(updates[j].Name) })
	return updates, nil
}

func (s *ActionService) UpdateContainer(ctx context.Context, item ContainerUpdateItem) (string, error) {
	if item.Blocked {
		return "", fmt.Errorf("该容器命中更新黑名单，已禁止更新")
	}
	if item.IsSelf {
		return "", fmt.Errorf("DockerCopilot 自身容器需要走程序更新流程")
	}
	taskID := newTaskID()
	go func() {
		_ = utiles.UpdateContainer(s.svcCtx, item.ID, item.Name, item.CreateImage, true, taskID)
	}()
	return taskID, nil
}

func (s *ActionService) listContainers(ctx context.Context) ([]containerlogic.Info, error) {
	logic := containerlogic.NewContainersListLogic(ctx, s.svcCtx)
	resp, err := logic.ContainersList()
	if err != nil {
		return nil, err
	}
	if resp == nil || (resp.Code != 200 && resp.Code != 0) {
		if resp == nil {
			return nil, fmt.Errorf("获取容器列表失败")
		}
		return nil, fmt.Errorf(resp.Msg)
	}
	var items []containerlogic.Info
	if err := decodeRespData(resp.Data, &items); err != nil {
		return nil, err
	}
	return items, nil
}

func (s *ActionService) updateBlacklistMatcher(ctx context.Context) (blacklist.Matcher, error) {
	logic := botlogic.NewConfigLogic(ctx, s.svcCtx)
	resp, err := logic.GetUpdateBlacklist()
	if err != nil {
		return blacklist.NewMatcher(nil), err
	}
	if resp == nil || resp.Code != 200 {
		return blacklist.NewMatcher(nil), fmt.Errorf("获取更新黑名单失败")
	}
	var list []string
	if err := decodeRespData(resp.Data, &list); err != nil {
		return blacklist.NewMatcher(nil), err
	}
	return blacklist.NewMatcher(blacklist.FromLegacyStrings(list)), nil
}

func decodeRespData(data interface{}, out interface{}) error {
	b, err := svc.MustJSON(data)
	if err != nil {
		return err
	}
	return svc.UnmarshalJSON(b, out)
}

func newTaskID() string {
	return uuid.New().String()
}

func remoteRespMsg(resp *types.Resp) string {
	if resp == nil {
		return ""
	}
	return resp.Msg
}

func mapString(values map[string]interface{}, key string) string {
	if values == nil {
		return ""
	}
	return strings.TrimSpace(fmt.Sprint(values[key]))
}

func successMessage(resp *types.Resp, fallback string) string {
	if resp == nil {
		return fallback
	}
	return firstNonEmpty(resp.Msg, fallback)
}
