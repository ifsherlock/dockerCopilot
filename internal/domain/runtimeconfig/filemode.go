package runtimeconfig

import (
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// defaultConfigFileMode 是 config.json 的默认权限。
// NAS 场景容器以 root 运行，2.1.25 起的 0600 会让宿主机普通账号
// 在文管里既打不开也保存不了配置，因此默认放宽为 0666；
// 需要收紧时用 DOCKERCOPILOT_CONFIG_FILE_MODE 覆盖（如 600、644）。
const defaultConfigFileMode os.FileMode = 0666

// ConfigFileMode 返回 config.json 应使用的权限。
// 环境变量取八进制（600 / 0600 / 644 / 666 等），非法值回落默认。
func ConfigFileMode() os.FileMode {
	raw := strings.TrimSpace(os.Getenv("DOCKERCOPILOT_CONFIG_FILE_MODE"))
	if raw == "" {
		return defaultConfigFileMode
	}
	parsed, err := strconv.ParseUint(raw, 8, 32)
	if err != nil {
		return defaultConfigFileMode
	}
	mode := os.FileMode(parsed) & os.ModePerm
	if mode == 0 {
		return defaultConfigFileMode
	}
	return mode
}

// ConfigFileOwner 返回 PUID/PGID 指定的配置文件属主。
// 未设置任何一项时 ok 为 false；单独设置一项时另一项为 -1
//（os.Chown 对 -1 表示保持不变）。
func ConfigFileOwner() (uid int, gid int, ok bool) {
	uid = envID("PUID")
	gid = envID("PGID")
	if uid < 0 && gid < 0 {
		return -1, -1, false
	}
	return uid, gid, true
}

func envID(name string) int {
	raw := strings.TrimSpace(os.Getenv(name))
	if raw == "" {
		return -1
	}
	id, err := strconv.Atoi(raw)
	if err != nil || id < 0 {
		return -1
	}
	return id
}

// ApplyConfigFilePolicy 按当前策略修正配置文件及所在目录的权限与属主。
// 用于启动时修复历史版本写出的 0600 root 文件，让存量用户升级即恢复
// 宿主机可编辑；全程 best-effort，失败不影响启动（Windows 下自然无效）。
func ApplyConfigFilePolicy(path string) {
	path = strings.TrimSpace(path)
	if path == "" {
		path = EnvPath()
	}
	if _, err := os.Stat(path); err == nil {
		_ = os.Chmod(path, ConfigFileMode())
	}
	uid, gid, ok := ConfigFileOwner()
	if !ok {
		return
	}
	// 目录也交给指定属主：宿主机编辑器保存时常用"临时文件+改名"，需要目录写权限。
	_ = os.Chown(filepath.Dir(path), uid, gid)
	if _, err := os.Stat(path); err == nil {
		_ = os.Chown(path, uid, gid)
	}
}

func chownConfigFile(path string) {
	if uid, gid, ok := ConfigFileOwner(); ok {
		_ = os.Chown(path, uid, gid)
	}
}
