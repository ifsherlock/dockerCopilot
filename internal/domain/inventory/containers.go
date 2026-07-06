package inventory

import (
	"strings"
	"time"

	dockerTypes "github.com/docker/docker/api/types"
)

func ContainersFromDocker(items []dockerTypes.Container, createdImageRefs map[string]string, selfID string) []Container {
	out := make([]Container, 0, len(items))
	for _, item := range items {
		out = append(out, ContainerFromDocker(item, createdImageRefs[item.ID], selfID))
	}
	return out
}

func ContainerFromDocker(item dockerTypes.Container, createdImageRef string, selfID string) Container {
	name := item.ID
	if len(item.Names) > 0 {
		name = strings.TrimPrefix(item.Names[0], "/")
	}
	return Container{
		ID:              item.ID,
		Name:            name,
		Status:          item.Status,
		State:           item.State,
		UsingImage:      firstNonEmpty(item.Image, item.ImageID),
		CreatedImageRef: strings.TrimSpace(createdImageRef),
		ImageID:         item.ImageID,
		CreatedAt:       time.Unix(item.Created, 0),
		IsRunning:       strings.EqualFold(strings.TrimSpace(item.State), "running"),
		IsSelf:          IsSelfContainer(item.ID, selfID),
	}
}

func IsSelfContainer(containerID string, selfID string) bool {
	containerID = strings.TrimSpace(containerID)
	selfID = strings.TrimSpace(selfID)
	if containerID == "" || selfID == "" {
		return false
	}
	return containerID == selfID || strings.HasPrefix(containerID, selfID) || strings.HasPrefix(selfID, containerID)
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}
