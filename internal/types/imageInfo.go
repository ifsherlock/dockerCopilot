package types

import (
	"github.com/docker/docker/api/types/image"
)

type Image struct {
	image.Summary
	ImageName        string `json:"imageName"`
	ImageTag         string `json:"imageTag"`
	InUsed           bool   `json:"inUsed"`
	UsageState       string `json:"usageState"`
	SizeFormat       string `json:"sizeFormat"`
	CleanupCandidate bool   `json:"cleanupCandidate"`
	CleanupReason    string `json:"cleanupReason"`
	MultiRef         bool   `json:"multiRef"`
}
