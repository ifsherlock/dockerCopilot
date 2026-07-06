package updatecheck

import "time"

type Status string

const (
	StatusUnknown         Status = "unknown"
	StatusChecking        Status = "checking"
	StatusUpToDate        Status = "up_to_date"
	StatusUpdateAvailable Status = "update_available"
	StatusIgnored         Status = "ignored"
	StatusUnsupported     Status = "unsupported"
	StatusCheckFailed     Status = "check_failed"
)

type ImageState struct {
	ImageID   string    `json:"imageID"`
	Status    Status    `json:"status"`
	CheckedAt time.Time `json:"checkedAt"`
	Error     string    `json:"error,omitempty"`
}

func (s ImageState) NeedUpdate() bool {
	return s.Status == StatusUpdateAvailable
}

type ContainerUpdateState struct {
	ContainerID          string    `json:"containerID"`
	ContainerName        string    `json:"containerName"`
	IsSelf               bool      `json:"isSelf"`
	CreatedImageRef      string    `json:"createdImageRef"`
	RunningImageID       string    `json:"runningImageID"`
	LocalRepoDigests     []string  `json:"localRepoDigests"`
	RemoteIndexDigest    string    `json:"remoteIndexDigest,omitempty"`
	RemotePlatformDigest string    `json:"remotePlatformDigest,omitempty"`
	Status               Status    `json:"status"`
	CheckedAt            time.Time `json:"checkedAt"`
	Error                string    `json:"error,omitempty"`
	Ignored              bool      `json:"ignored"`
	IgnoreReason         string    `json:"ignoreReason,omitempty"`
}

type ProgramUpdateState struct {
	LocalVersion   string    `json:"localVersion"`
	BuildDate      string    `json:"buildDate"`
	RemoteVersion  string    `json:"remoteVersion"`
	UpdateChannel  string    `json:"updateChannel,omitempty"`
	ArtifactDigest string    `json:"artifactDigest,omitempty"`
	Status         Status    `json:"status"`
	CheckedAt      time.Time `json:"checkedAt"`
	Error          string    `json:"error,omitempty"`
}
