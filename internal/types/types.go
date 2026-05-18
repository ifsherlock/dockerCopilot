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
	BotToken                string `json:"botToken"`
	ChatIds                 string `json:"chatIds"`
	UpdateCheckCron         string `json:"updateCheckCron"`
	NotifyOnUpdate          bool   `json:"notifyOnUpdate"`
	UpdateBlacklist         string `json:"updateBlacklist"`
	AutoCleanImages         bool   `json:"autoCleanImages"`
	CleanImagesCron         string `json:"cleanImagesCron"`
	AutoUpdateContainers    bool   `json:"autoUpdateContainers"`
	UpdateContainersCron    string `json:"updateContainersCron"`
	ProxyType               string `json:"proxyType"`
	ProxyHost               string `json:"proxyHost"`
	ProxyPort               int    `json:"proxyPort"`
	ProxyUsername           string `json:"proxyUsername"`
	ProxyPassword           string `json:"proxyPassword"`
	DefaultInstance         string `json:"defaultInstance"`
	Instances               string `json:"instances"`
	AutoBackupJson          bool   `json:"autoBackupJson"`
	BackupJsonCron          string `json:"backupJsonCron"`
	AutoBackupCompose       bool   `json:"autoBackupCompose"`
	BackupComposeCron       string `json:"backupComposeCron"`
	ImageAccelerators       string `json:"imageAccelerators"`
	DefaultImageAccelerator string `json:"defaultImageAccelerator"`
}
