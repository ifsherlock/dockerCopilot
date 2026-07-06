package summary

type ResourceCounts struct {
	Total           int `json:"total"`
	Running         int `json:"running,omitempty"`
	Stopped         int `json:"stopped,omitempty"`
	Paused          int `json:"paused,omitempty"`
	Error           int `json:"error,omitempty"`
	UpdateAvailable int `json:"updateAvailable,omitempty"`
	Ignored         int `json:"ignored,omitempty"`
	Used            int `json:"used,omitempty"`
	Unused          int `json:"unused,omitempty"`
	Dangling        int `json:"dangling,omitempty"`
}
