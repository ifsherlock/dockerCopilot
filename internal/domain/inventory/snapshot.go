package inventory

import dockerTypes "github.com/docker/docker/api/types"
import dockerImage "github.com/docker/docker/api/types/image"

func NewSnapshot(containers []dockerTypes.Container, images []dockerImage.Summary, createdImageRefs map[string]string, selfID string) Snapshot {
	containerSnapshot := ContainersFromDocker(containers, createdImageRefs, selfID)
	return Snapshot{
		Containers: containerSnapshot,
		Images:     ImagesFromDocker(images, containerSnapshot),
	}
}
