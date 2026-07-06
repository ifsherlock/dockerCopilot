package telegram

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"sort"
	"strings"

	"github.com/google/uuid"
	"github.com/onlyLTY/dockerCopilot/internal/domain/blacklist"
	botlogic "github.com/onlyLTY/dockerCopilot/internal/logic/bot"
	containerlogic "github.com/onlyLTY/dockerCopilot/internal/logic/container"
	imagelogic "github.com/onlyLTY/dockerCopilot/internal/logic/image"
	versionlogic "github.com/onlyLTY/dockerCopilot/internal/logic/version"
	"github.com/onlyLTY/dockerCopilot/internal/svc"
	apptypes "github.com/onlyLTY/dockerCopilot/internal/types"
	"github.com/onlyLTY/dockerCopilot/internal/utiles"
)

type containerView struct {
	ID            string
	Name          string
	UsingImage    string
	CreateImage   string
	Status        string
	HaveUpdate    bool
	IsSelf        bool
	UpdateBlocked bool
}

type imageView struct {
	ID               string
	Name             string
	Tag              string
	Size             string
	CreateTime       string
	InUsed           bool
	UsageState       string
	CleanupCandidate bool
	CleanupReason    string
	MultiRef         bool
}

func (r *Runtime) currentInstance(ctx context.Context, chatID int64) (instanceConfig, error) {
	instances, current, _, err := r.loadInstances(ctx, chatID)
	if err != nil {
		return instanceConfig{}, err
	}
	for _, inst := range instances {
		if inst.Name == current {
			return inst, nil
		}
	}
	if len(instances) > 0 {
		return instances[0], nil
	}
	return instanceConfig{}, fmt.Errorf("未找到当前实例")
}

func (r *Runtime) listCurrentContainers(ctx context.Context, chatID int64) ([]containerView, instanceConfig, error) {
	inst, err := r.currentInstance(ctx, chatID)
	if err != nil {
		return nil, instanceConfig{}, err
	}
	views, _, err := r.listCurrentContainersForInstance(ctx, inst)
	return views, inst, err
}

func (r *Runtime) listCurrentContainersForInstance(ctx context.Context, inst instanceConfig) ([]containerView, instanceConfig, error) {
	matcher, _ := r.updateBlacklistMatcher(ctx)
	if inst.Local {
		logic := containerlogic.NewContainersListLogic(ctx, r.svcCtx)
		resp, err := logic.ContainersList()
		if err != nil || resp == nil || (resp.Code != 200 && resp.Code != 0) {
			if err == nil && resp != nil {
				err = fmt.Errorf(resp.Msg)
			}
			return nil, inst, err
		}
		var items []containerlogic.Info
		if err := decodeRespData(resp.Data, &items); err != nil {
			return nil, inst, err
		}
		views := make([]containerView, 0, len(items))
		for _, item := range items {
			views = append(views, containerView{
				ID: item.Id, Name: item.Name, UsingImage: item.UsingImage, CreateImage: item.CreateImage,
				Status: item.Status, HaveUpdate: item.HaveUpdate, IsSelf: item.IsSelf,
				UpdateBlocked: isContainerUpdateBlocked(item.Name, item.UsingImage, item.CreateImage, matcher),
			})
		}
		sort.Slice(views, func(i, j int) bool { return strings.ToLower(views[i].Name) < strings.ToLower(views[j].Name) })
		return views, inst, nil
	}
	client := newRemoteClient(inst)
	items, err := client.containers(ctx)
	if err != nil {
		return nil, inst, err
	}
	views := make([]containerView, 0, len(items))
	for _, item := range items {
		views = append(views, containerView{
			ID: item.ID, Name: item.Name, UsingImage: item.UsingImage, CreateImage: item.CreateImage,
			Status: item.Status, HaveUpdate: item.HaveUpdate, IsSelf: item.IsSelf,
			UpdateBlocked: isContainerUpdateBlocked(item.Name, item.UsingImage, item.CreateImage, matcher),
		})
	}
	return views, inst, nil
}

func (r *Runtime) updateBlacklistMatcher(ctx context.Context) (blacklist.Matcher, error) {
	logic := botlogic.NewConfigLogic(ctx, r.svcCtx)
	resp, err := logic.GetUpdateBlacklist()
	if err != nil {
		return blacklist.NewMatcher(nil), err
	}
	if resp == nil || resp.Code != 200 {
		return blacklist.NewMatcher(nil), fmt.Errorf(firstNonEmpty(resp.Msg, "获取更新黑名单失败"))
	}
	var list []string
	if err := decodeRespData(resp.Data, &list); err != nil {
		return blacklist.NewMatcher(nil), err
	}
	return blacklist.NewMatcher(blacklist.FromLegacyStrings(list)), nil
}

func isContainerUpdateBlocked(name string, usingImage string, createImage string, matcher blacklist.Matcher) bool {
	return matcher.MatchContainerUpdate(name, usingImage, createImage).Matched
}

func (r *Runtime) listCurrentImages(ctx context.Context, chatID int64) ([]imageView, instanceConfig, error) {
	inst, err := r.currentInstance(ctx, chatID)
	if err != nil {
		return nil, instanceConfig{}, err
	}
	if inst.Local {
		logic := imagelogic.NewImagesListLogic(ctx, r.svcCtx)
		resp, err := logic.ImagesList()
		if err != nil || resp == nil || resp.Code != 200 {
			if err == nil && resp != nil {
				err = fmt.Errorf(resp.Msg)
			}
			return nil, inst, err
		}
		var items []imagelogic.Info
		if err := decodeRespData(resp.Data, &items); err != nil {
			return nil, inst, err
		}
		views := make([]imageView, 0, len(items))
		for _, item := range items {
			views = append(views, imageView{
				ID: item.Id, Name: item.Name, Tag: item.Tag, Size: item.Size, CreateTime: item.CreateTime,
				InUsed: item.InUsed, UsageState: item.UsageState, CleanupCandidate: item.CleanupCandidate, CleanupReason: item.CleanupReason, MultiRef: item.MultiRef,
			})
		}
		sort.Slice(views, func(i, j int) bool {
			left := strings.ToLower(views[i].Name + ":" + views[i].Tag)
			right := strings.ToLower(views[j].Name + ":" + views[j].Tag)
			return left < right
		})
		return views, inst, nil
	}
	client := newRemoteClient(inst)
	items, err := client.images(ctx)
	if err != nil {
		return nil, inst, err
	}
	views := make([]imageView, 0, len(items))
	for _, item := range items {
		views = append(views, imageView{
			ID: item.ID, Name: item.Name, Tag: item.Tag, Size: item.Size, CreateTime: item.CreateTime,
			InUsed: item.InUsed, UsageState: item.UsageState, CleanupCandidate: item.CleanupCandidate, CleanupReason: item.CleanupReason, MultiRef: item.MultiRef,
		})
	}
	sort.Slice(views, func(i, j int) bool {
		left := strings.ToLower(views[i].Name + ":" + views[i].Tag)
		right := strings.ToLower(views[j].Name + ":" + views[j].Tag)
		return left < right
	})
	return views, inst, nil
}

func (r *Runtime) listCurrentBackups(ctx context.Context, chatID int64) ([]string, instanceConfig, error) {
	inst, err := r.currentInstance(ctx, chatID)
	if err != nil {
		return nil, instanceConfig{}, err
	}
	if inst.Local {
		logic := containerlogic.NewListBackupsLogic(ctx, r.svcCtx)
		resp, err := logic.ListBackups()
		if err != nil || resp == nil || resp.Code != 200 {
			if err == nil && resp != nil {
				err = fmt.Errorf(resp.Msg)
			}
			return nil, inst, err
		}
		var items []string
		if err := decodeRespData(resp.Data, &items); err != nil {
			return nil, inst, err
		}
		sort.Strings(items)
		for i, j := 0, len(items)-1; i < j; i, j = i+1, j-1 {
			items[i], items[j] = items[j], items[i]
		}
		return items, inst, nil
	}
	client := newRemoteClient(inst)
	items, err := client.backups(ctx)
	if err != nil {
		return nil, inst, err
	}
	sort.Strings(items)
	for i, j := 0, len(items)-1; i < j; i, j = i+1, j-1 {
		items[i], items[j] = items[j], items[i]
	}
	return items, inst, nil
}

func (r *Runtime) currentVersion(ctx context.Context, chatID int64) (map[string]string, map[string]string, string, instanceConfig, error) {
	inst, err := r.currentInstance(ctx, chatID)
	if err != nil {
		return nil, nil, "", instanceConfig{}, err
	}
	if inst.Local {
		logic := versionlogic.NewVersionLogic(ctx, r.svcCtx)
		localResp, _ := logic.Version(&apptypes.VersionReq{Type: "local"})
		remoteResp, _ := logic.Version(&apptypes.VersionReq{Type: "remote"})
		localVersion := map[string]string{}
		remoteVersion := map[string]string{}
		if localResp != nil {
			_ = decodeRespData(localResp.Data, &localVersion)
		}
		if remoteResp != nil {
			_ = decodeRespData(remoteResp.Data, &remoteVersion)
		}
		status := "未知"
		if remoteResp != nil {
			status = firstNonEmpty(remoteResp.Msg, status)
		}
		return localVersion, remoteVersion, status, inst, nil
	}
	client := newRemoteClient(inst)
	localVersion, _, err := client.version(ctx, "local")
	if err != nil {
		return nil, nil, "", inst, err
	}
	remoteVersion, status, err := client.version(ctx, "remote")
	if err != nil {
		status = err.Error()
	}
	return localVersion, remoteVersion, status, inst, nil
}

func (r *Runtime) startContainerOnCurrent(ctx context.Context, chatID int64, id string) error {
	inst, err := r.currentInstance(ctx, chatID)
	if err != nil {
		return err
	}
	if inst.Local {
		return utiles.StartContainer(r.svcCtx, id)
	}
	_, err = newRemoteClient(inst).simpleAction(ctx, http.MethodPost, "/api/container/"+id+"/start", nil, nil)
	return err
}

func (r *Runtime) stopContainerOnCurrent(ctx context.Context, chatID int64, id string) error {
	inst, err := r.currentInstance(ctx, chatID)
	if err != nil {
		return err
	}
	if inst.Local {
		return utiles.StopContainer(r.svcCtx, id)
	}
	_, err = newRemoteClient(inst).simpleAction(ctx, http.MethodPost, "/api/container/"+id+"/stop", nil, nil)
	return err
}

func (r *Runtime) restartContainerOnCurrent(ctx context.Context, chatID int64, id string) error {
	inst, err := r.currentInstance(ctx, chatID)
	if err != nil {
		return err
	}
	if inst.Local {
		return utiles.RestartContainer(r.svcCtx, id)
	}
	_, err = newRemoteClient(inst).simpleAction(ctx, http.MethodPost, "/api/container/"+id+"/restart", nil, nil)
	return err
}

func (r *Runtime) removeImageOnCurrent(ctx context.Context, chatID int64, imageID string, force bool) error {
	inst, err := r.currentInstance(ctx, chatID)
	if err != nil {
		return err
	}
	if inst.Local {
		logic := imagelogic.NewRemoveLogic(ctx, r.svcCtx)
		resp, err := logic.Remove(&apptypes.RemoveImageReq{IdReq: apptypes.IdReq{Id: imageID}, Force: force})
		if err != nil || resp == nil || resp.Code != 200 {
			if err == nil && resp != nil {
				err = fmt.Errorf(resp.Msg)
			}
			return err
		}
		return nil
	}
	_, err = newRemoteClient(inst).simpleAction(ctx, http.MethodDelete, "/api/image/"+imageID, url.Values{"force": []string{fmt.Sprintf("%t", force)}}, nil)
	return err
}

func (r *Runtime) triggerJSONBackupOnCurrent(ctx context.Context, chatID int64) error {
	inst, err := r.currentInstance(ctx, chatID)
	if err != nil {
		return err
	}
	if inst.Local {
		return r.svcCtx.RunJSONBackupNow()
	}
	_, err = newRemoteClient(inst).simpleAction(ctx, http.MethodGet, "/api/container/backup", nil, nil)
	return err
}

func (r *Runtime) triggerComposeBackupOnCurrent(ctx context.Context, chatID int64) error {
	inst, err := r.currentInstance(ctx, chatID)
	if err != nil {
		return err
	}
	if inst.Local {
		return r.svcCtx.RunComposeBackupNow()
	}
	_, err = newRemoteClient(inst).simpleAction(ctx, http.MethodGet, "/api/container/backup2compose", nil, nil)
	return err
}

func (r *Runtime) restoreBackupOnCurrent(ctx context.Context, chatID int64, filename string) (string, error) {
	inst, err := r.currentInstance(ctx, chatID)
	if err != nil {
		return "", err
	}
	if inst.Local {
		logic := containerlogic.NewRestoreLogic(ctx, r.svcCtx)
		resp, err := logic.Restore(&apptypes.ContainerRestoreReq{Filename: filename})
		if err != nil || resp == nil || resp.Code != 200 {
			if err == nil && resp != nil {
				err = fmt.Errorf(resp.Msg)
			}
			return "", err
		}
		data := map[string]interface{}{}
		_ = decodeRespData(resp.Data, &data)
		return svc.AsString(data["taskID"], ""), nil
	}
	data, err := newRemoteClient(inst).simpleAction(ctx, http.MethodPost, "/api/container/backups/restore", nil, map[string]string{"filename": filename})
	if err != nil {
		return "", err
	}
	return svc.AsString(data["taskID"], ""), nil
}

func (r *Runtime) deleteBackupOnCurrent(ctx context.Context, chatID int64, filename string) error {
	inst, err := r.currentInstance(ctx, chatID)
	if err != nil {
		return err
	}
	if inst.Local {
		logic := containerlogic.NewDelRestoreLogic(ctx, r.svcCtx)
		resp, err := logic.DelRestore(&apptypes.DelContainerBackupReq{Filename: filename})
		if err != nil || resp == nil || resp.Code != 200 {
			if err == nil && resp != nil {
				err = fmt.Errorf(resp.Msg)
			}
			return err
		}
		return nil
	}
	_, err = newRemoteClient(inst).simpleAction(ctx, http.MethodDelete, "/api/container/backups", url.Values{"filename": []string{filename}}, nil)
	return err
}

func (r *Runtime) updateContainerOnCurrent(ctx context.Context, chatID int64, id string) (string, string, error) {
	containers, inst, err := r.listCurrentContainers(ctx, chatID)
	if err != nil {
		return "", "", err
	}
	for _, item := range containers {
		if item.ID != id {
			continue
		}
		if item.UpdateBlocked {
			return "", "", fmt.Errorf("该容器命中更新黑名单，已禁止更新")
		}
		if item.IsSelf {
			return "", "", fmt.Errorf("SELF_UPDATE_REQUIRED:%s", item.Name)
		}
		if inst.Local {
			taskID := utilesTaskID()
			go func(ci containerView) {
				if err := utiles.UpdateContainer(r.svcCtx, ci.ID, ci.Name, ci.CreateImage, true, taskID); err != nil {
					// logged inside utility path elsewhere
				}
			}(item)
			return item.Name, taskID, nil
		}
		data, err := newRemoteClient(inst).simpleAction(ctx, http.MethodPost, "/api/container/"+id+"/update", url.Values{
			"imageNameAndTag": []string{item.CreateImage},
			"containerName":   []string{item.Name},
		}, nil)
		if err != nil {
			return "", "", err
		}
		return item.Name, svc.AsString(data["taskID"], ""), nil
	}
	return "", "", fmt.Errorf("未找到目标容器")
}

func utilesTaskID() string {
	return uuid.New().String()
}
