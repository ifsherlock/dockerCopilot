package inventory

import "time"

type Container struct {
	ID              string    `json:"id"`
	Name            string    `json:"name"`
	Status          string    `json:"status"`
	State           string    `json:"state"`
	UsingImage      string    `json:"usingImage"`
	CreatedImageRef string    `json:"createdImageRef"`
	ImageID         string    `json:"imageID"`
	CreatedAt       time.Time `json:"createdAt"`
	IsRunning       bool      `json:"isRunning"`
	IsSelf          bool      `json:"isSelf"`
}

type Image struct {
	ID               string    `json:"id"`
	Name             string    `json:"name"`
	Tag              string    `json:"tag"`
	RepoTags         []string  `json:"repoTags"`
	RepoDigests      []string  `json:"repoDigests"`
	Size             int64     `json:"size"`
	CreatedAt        time.Time `json:"createdAt"`
	InUsed           bool      `json:"inUsed"`
	UsageState       string    `json:"usageState"`
	CleanupCandidate bool      `json:"cleanupCandidate"`
	CleanupReason    string    `json:"cleanupReason"`
	MultiRef         bool      `json:"multiRef"`
}

type Snapshot struct {
	Containers []Container `json:"containers"`
	Images     []Image     `json:"images"`
}
