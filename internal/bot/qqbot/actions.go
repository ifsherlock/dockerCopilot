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
	"github.com/onlyLTY/dockerCopilot/internal/svc"
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

type ActionService struct {
	svcCtx *svc.ServiceContext
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
