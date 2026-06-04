package types

import "encoding/json"

type ContainerRenameReq struct {
	IdReq
	NewName string `form:"newName"`
}

type ContainerRestoreReq struct {
	Filename string `json:"filename"`
}

type ContainerUpdateReq struct {
	IdReq
	ImageNameAndTag string `form:"imageNameAndTag"`
	ContainerName   string `form:"containerName"`
}

type CreateContainerReq struct {
	OldName         string `json:"old_name"`
	NewName         string `json:"new_name"`
	ImageNameAndTag string `json:"image_name_and_tag"`
}

type DelContainerBackupReq struct {
	Filename string `form:"filename"`
}

type DoLoginReq struct {
	SecretKey string `form:"secret_key,optional"`
}

type GetProgressReq struct {
	TaskId string `path:"taskid"`
}

type GetLogsReq struct{}

type GetSystemLogsReq struct {
	Kind  string `form:"kind,optional"`
	Tail  string `form:"tail,optional"`
	Query string `form:"query,optional"`
	Level string `form:"level,optional"`
}

type GetContainerLogsReq struct {
	Id   string `path:"id"`
	Tail string `form:"tail,optional"`
}

type ComposeProjectReq struct {
	Name    string `json:"name"`
	Content string `json:"content"`
}

type ComposeProjectPathReq struct {
	Name string `path:"name"`
}

type ComposeFromContainersReq struct {
	ContainerIDs []string `json:"containerIDs,optional"`
}

type ComposeFromDockerRunReq struct {
	Command string `json:"command"`
}

type NetworkCreateReq struct {
	Name         string            `json:"name"`
	Driver       string            `json:"driver,optional"`
	Parent       string            `json:"parent,optional"`
	Subnet       string            `json:"subnet,optional"`
	Gateway      string            `json:"gateway,optional"`
	IPRange      string            `json:"ipRange,optional"`
	Labels       map[string]string `json:"labels,optional"`
	Options      map[string]string `json:"options,optional"`
	AuxAddresses map[string]string `json:"auxAddresses,optional"`
	Migrate      bool              `json:"migrate,optional"`
	DeleteOld    bool              `json:"deleteOld,optional"`
}

type NetworkPathReq struct {
	Id string `path:"id"`
}

type NetworkContainerReq struct {
	Id          string `path:"id"`
	ContainerID string `json:"containerID"`
	IPv4Address string `json:"ipv4Address,optional"`
	IPv6Address string `json:"ipv6Address,optional"`
	Force       bool   `json:"force,optional"`
}

type VolumePathReq struct {
	Name string `path:"name"`
}

type StoreSourceReq struct {
	Id      string `path:"id,optional" json:"id,optional"`
	Name    string `json:"name"`
	URL     string `json:"url"`
	Enabled bool   `json:"enabled,optional"`
}

type StoreSourcePathReq struct {
	Id string `path:"id"`
}

type ContainerEndpointConfigReq struct {
	Id     string `path:"id"`
	HostIP string `json:"hostIP,optional"`
	Port   string `json:"port,optional"`
}

type PullImageReq struct {
	ImageName   string `json:"imageName"`
	Source      string `json:"source"`
	DisplayName string `json:"displayName"`
}

type IdReq struct {
	Id string `path:"id"`
}

type ImageRetagReq struct {
	Id      string `path:"id"`
	Name    string `json:"name"`
	Tag     string `json:"tag"`
	OldName string `json:"oldName,optional"`
	OldTag  string `json:"oldTag,optional"`
}

type LoginReq struct {
	SecretKey string `form:"secretKey,optional"`
}

type MsgResp struct {
	Status string `json:"status"`
	Msg    string `json:"msg"`
}

type RemoveContainerReq struct {
	Name string `json:"name"`
}

type RemoveImageReq struct {
	IdReq
	Force bool `form:"force,default=false"`
}

type RenameContainerReq struct {
	OldName string `json:"oldName"`
	NewName string `json:"newName"`
}

type Resp struct {
	Code int         `json:"code"`
	Msg  string      `json:"msg"`
	Data interface{} `json:"data"`
}

type StartContainerReq struct {
	Name string `json:"name"`
}

type StopContainerReq struct {
	Name string `json:"name"`
}

type VerifyJwtReq struct {
	Jwt string `form:"jwt,optional"`
}

type UpdateBlacklistReq struct {
	Items []string `json:"items"`
}

type VersionMsgResp struct {
	Version   string `json:"version"`
	BuildDate string `json:"build_date"`
}

type VersionReq struct {
	Type string `form:"type"`
}

type GetNewImageReq struct {
	ImageNameAndTag string `json:"image_name_and_tag"`
}

type BotConfigReq struct {
	BotToken                string          `json:"botToken,optional"`
	ChatIds                 string          `json:"chatIds,optional"`
	UpdateCheckCron         string          `json:"updateCheckCron,optional"`
	NotifyOnUpdate          bool            `json:"notifyOnUpdate,optional"`
	InteractiveEnabled      bool            `json:"interactiveEnabled,optional"`
	UpdateBlacklist         string          `json:"updateBlacklist,optional"`
	AutoCleanImages         bool            `json:"autoCleanImages,optional"`
	CleanImagesCron         string          `json:"cleanImagesCron,optional"`
	AutoUpdateContainers    bool            `json:"autoUpdateContainers,optional"`
	UpdateContainersCron    string          `json:"updateContainersCron,optional"`
	ScheduledTasks          string          `json:"scheduledTasks,optional"`
	ProxyType               string          `json:"proxyType,optional"`
	ProxyHost               string          `json:"proxyHost,optional"`
	ProxyPort               int             `json:"proxyPort,optional"`
	ProxyUsername           string          `json:"proxyUsername,optional"`
	ProxyPassword           string          `json:"proxyPassword,optional"`
	HostLanIP               string          `json:"hostLanIp,optional"`
	DefaultInstance         string          `json:"defaultInstance,optional"`
	MultiInstanceEnabled    bool            `json:"multiInstanceEnabled,optional"`
	Instances               string          `json:"instances,optional"`
	AutoBackupJson          bool            `json:"autoBackupJson,optional"`
	BackupJsonCron          string          `json:"backupJsonCron,optional"`
	AutoBackupCompose       bool            `json:"autoBackupCompose,optional"`
	BackupComposeCron       string          `json:"backupComposeCron,optional"`
	BackupMaxFiles          int             `json:"backupMaxFiles,optional"`
	ImageAccelerators       string          `json:"imageAccelerators,optional"`
	DefaultImageAccelerator string          `json:"defaultImageAccelerator,optional"`
	ThemeMode               string          `json:"themeMode,optional"`
	ThemeAppearance         string          `json:"themeAppearance,optional"`
	ServiceLogDir           string          `json:"serviceLogDir,optional"`
	PresentFields           map[string]bool `json:"-"`
}

func (req *BotConfigReq) UnmarshalJSON(data []byte) error {
	type Alias BotConfigReq
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}
	var decoded Alias
	if err := json.Unmarshal(data, &decoded); err != nil {
		return err
	}
	*req = BotConfigReq(decoded)
	req.PresentFields = make(map[string]bool, len(raw))
	for key := range raw {
		req.PresentFields[key] = true
	}
	return nil
}

func (req *BotConfigReq) HasField(name string) bool {
	if req == nil || req.PresentFields == nil {
		return true
	}
	return req.PresentFields[name]
}
