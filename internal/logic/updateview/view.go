package updateview

import (
	"context"

	dockerTypes "github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/image"
	"github.com/onlyLTY/dockerCopilot/internal/domain/blacklist"
	"github.com/onlyLTY/dockerCopilot/internal/domain/inventory"
	"github.com/onlyLTY/dockerCopilot/internal/domain/summary"
	"github.com/onlyLTY/dockerCopilot/internal/domain/updatecheck"
	"github.com/onlyLTY/dockerCopilot/internal/svc"
)

type Snapshot struct {
	Inventory        inventory.Snapshot
	DockerContainers []dockerTypes.Container
	Inspects         map[string]dockerTypes.ContainerJSON
	Matcher          blacklist.Matcher
}

func BuildContainerSnapshot(ctx context.Context, svcCtx *svc.ServiceContext) (Snapshot, error) {
	containers, err := svcCtx.DockerClient.ContainerList(ctx, container.ListOptions{All: true})
	if err != nil {
		return Snapshot{}, err
	}
	createdRefs := make(map[string]string, len(containers))
	inspects := make(map[string]dockerTypes.ContainerJSON, len(containers))
	for _, item := range containers {
		inspect, err := svcCtx.DockerClient.ContainerInspect(ctx, item.ID)
		if err != nil {
			continue
		}
		inspects[item.ID] = inspect
		if inspect.Config != nil {
			createdRefs[item.ID] = inspect.Config.Image
		}
	}
	selfID := inventory.CurrentContainerID()
	return Snapshot{
		Inventory:        inventory.Snapshot{Containers: inventory.ContainersFromDocker(containers, createdRefs, selfID)},
		DockerContainers: append([]dockerTypes.Container(nil), containers...),
		Inspects:         inspects,
		Matcher:          RuntimeBlacklistMatcher(),
	}, nil
}

func BuildImageSnapshot(ctx context.Context, svcCtx *svc.ServiceContext) (Snapshot, error) {
	containers, err := svcCtx.DockerClient.ContainerList(ctx, container.ListOptions{All: true})
	if err != nil {
		return Snapshot{}, err
	}
	images, err := svcCtx.DockerClient.ImageList(ctx, image.ListOptions{})
	if err != nil {
		return Snapshot{}, err
	}
	selfID := inventory.CurrentContainerID()
	containerSnapshot := inventory.ContainersFromDocker(containers, nil, selfID)
	return Snapshot{
		Inventory: inventory.Snapshot{
			Containers: containerSnapshot,
			Images:     inventory.ImagesFromDocker(images, containerSnapshot),
		},
		DockerContainers: append([]dockerTypes.Container(nil), containers...),
		Matcher:          RuntimeBlacklistMatcher(),
	}, nil
}

func RuntimeBlacklistMatcher() blacklist.Matcher {
	cfg, err := svc.LoadRuntimeConfigForRead()
	if err != nil {
		return blacklist.NewMatcher(nil)
	}
	return blacklist.NewMatcher(blacklist.FromLegacyStrings(svc.StringList(cfg.Telegram["update_blacklist"])))
}

func UpdateState(store summary.ImageStateReader, imageID string) (updatecheck.ImageState, bool) {
	if store == nil {
		return updatecheck.ImageState{ImageID: imageID, Status: updatecheck.StatusUnknown}, false
	}
	state, ok := store.GetImage(imageID)
	if !ok {
		return updatecheck.ImageState{ImageID: imageID, Status: updatecheck.StatusUnknown}, false
	}
	return state, true
}

func UpdateStatus(state updatecheck.ImageState, ignored bool) string {
	if ignored {
		return string(updatecheck.StatusIgnored)
	}
	if state.Status == "" {
		return string(updatecheck.StatusUnknown)
	}
	return string(state.Status)
}
