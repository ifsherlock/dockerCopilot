package types

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

type PullImageReq struct {
	ImageName   string `json:"imageName"`
	Source      string `json:"source"`
	DisplayName string `json:"displayName"`
}

type IdReq struct {
	Id string `path:"id"`
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
	BotToken                string `json:"botToken,optional"`
	ChatIds                 string `json:"chatIds,optional"`
	UpdateCheckCron         string `json:"updateCheckCron,optional"`
	NotifyOnUpdate          bool   `json:"notifyOnUpdate,optional"`
	UpdateBlacklist         string `json:"updateBlacklist,optional"`
	AutoCleanImages         bool   `json:"autoCleanImages,optional"`
	CleanImagesCron         string `json:"cleanImagesCron,optional"`
	AutoUpdateContainers    bool   `json:"autoUpdateContainers,optional"`
	UpdateContainersCron    string `json:"updateContainersCron,optional"`
	ProxyType               string `json:"proxyType,optional"`
	ProxyHost               string `json:"proxyHost,optional"`
	ProxyPort               int    `json:"proxyPort,optional"`
	ProxyUsername           string `json:"proxyUsername,optional"`
	ProxyPassword           string `json:"proxyPassword,optional"`
	DefaultInstance         string `json:"defaultInstance,optional"`
	Instances               string `json:"instances,optional"`
	AutoBackupJson          bool   `json:"autoBackupJson,optional"`
	BackupJsonCron          string `json:"backupJsonCron,optional"`
	AutoBackupCompose       bool   `json:"autoBackupCompose,optional"`
	BackupComposeCron       string `json:"backupComposeCron,optional"`
	BackupMaxFiles          int    `json:"backupMaxFiles,optional"`
	ImageAccelerators       string `json:"imageAccelerators,optional"`
	DefaultImageAccelerator string `json:"defaultImageAccelerator,optional"`
}
