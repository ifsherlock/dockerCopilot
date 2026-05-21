package types

import (
	docker "github.com/docker/docker/api/types"
)

type Container struct {
	docker.Container
	Update bool `json:"Update"`
}

type ContainerPortBinding struct {
	PrivatePort uint16 `json:"privatePort"`
	PublicPort  uint16 `json:"publicPort"`
	Type        string `json:"type"`
	IP          string `json:"ip"`
}

type ContainerEndpointLink struct {
	NetworkMode  string                 `json:"networkMode"`
	Running      bool                   `json:"running"`
	HostIP       string                 `json:"hostIP"`
	Ports        []ContainerPortBinding `json:"ports"`
	SuggestedURL string                 `json:"suggestedURL"`
	NeedsManual  bool                   `json:"needsManual"`
	ExposedPorts []string               `json:"exposedPorts"`
	EditablePort string                 `json:"editablePort"`
	Source       string                 `json:"source"`
}
