package composeproject

const defaultComposeDir = "/data/compose"

type Project struct {
	Name         string             `json:"name"`
	Path         string             `json:"path"`
	Content      string             `json:"content"`
	UpdatedAt    string             `json:"updatedAt"`
	ServiceCount int                `json:"serviceCount"`
	Status       string             `json:"status"`
	RunningCount int                `json:"runningCount"`
	StoppedCount int                `json:"stoppedCount"`
	ErrorCount   int                `json:"errorCount"`
	Containers   []ProjectContainer `json:"containers"`
}

type ProjectContainer struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Image   string `json:"image"`
	State   string `json:"state"`
	Status  string `json:"status"`
	Ports   string `json:"ports"`
	Service string `json:"service"`
	Update  bool   `json:"update"`
}
type sdkComposeDoc struct {
	Services map[string]sdkComposeService `json:"services"`
}

type sdkComposeService struct {
	Image         string      `json:"image"`
	Build         interface{} `json:"build"`
	ContainerName string      `json:"container_name"`
	Restart       string      `json:"restart"`
	Ports         []string    `json:"ports"`
	Volumes       []string    `json:"volumes"`
	Environment   interface{} `json:"environment"`
	Networks      interface{} `json:"networks"`
	NetworkMode   string      `json:"network_mode"`
	Privileged    bool        `json:"privileged"`
	Command       interface{} `json:"command"`
	Entrypoint    interface{} `json:"entrypoint"`
	WorkingDir    string      `json:"working_dir"`
	TTY           bool        `json:"tty"`
}
