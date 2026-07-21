package runtimeconfig

import (
	"os"
	"path/filepath"
	"strings"

	"github.com/onlyLTY/dockerCopilot/internal/platform/fsjson"
)

// DefaultPath 位于 /data 下：/data 是所有部署都必须挂载的持久化目录（备份也在其中），
// 避免旧路径 /app/config 未挂载时容器重建导致 Bot 配置丢失。
const DefaultPath = "/data/config/config.json"

// LegacyPath 是 2.1.x 早期版本的配置路径，启动时自动迁移到 DefaultPath。
const LegacyPath = "/app/config/config.json"

type Store struct {
	path      string
	secretKey string
}

func NewStore(path string, secretKey string) *Store {
	path = strings.TrimSpace(path)
	if path == "" {
		path = EnvPath()
	}
	return &Store{path: path, secretKey: secretKey}
}

func EnvPath() string {
	if p := strings.TrimSpace(os.Getenv("DOCKERCOPILOT_BOT_CONFIG")); p != "" {
		return p
	}
	return DefaultPath
}

// MigrateLegacyConfig 将旧路径的配置一次性复制到新默认路径。
// 仅当目标不存在且旧文件存在时执行；旧文件保留不动，迁移失败不阻塞启动。
// 返回 (是否执行了迁移, 错误)。
func MigrateLegacyConfig() (bool, error) {
	target := EnvPath()
	if target != DefaultPath {
		// 用户通过 DOCKERCOPILOT_BOT_CONFIG 显式指定了路径，不做迁移。
		return false, nil
	}
	if _, err := os.Stat(target); err == nil {
		return false, nil
	}
	b, err := os.ReadFile(LegacyPath)
	if err != nil {
		if os.IsNotExist(err) {
			return false, nil
		}
		return false, err
	}
	if err := os.MkdirAll(filepath.Dir(target), 0755); err != nil {
		return false, err
	}
	if err := os.WriteFile(target, b, 0600); err != nil {
		return false, err
	}
	return true, nil
}

func (s *Store) Path() string {
	if s == nil || strings.TrimSpace(s.path) == "" {
		return EnvPath()
	}
	return s.path
}

func (s *Store) Read() (Config, error) {
	secretKey := ""
	if s != nil {
		secretKey = s.secretKey
	}
	cfg := Default(secretKey)
	err := fsjson.Read(s.Path(), &cfg)
	if err != nil {
		if os.IsNotExist(err) {
			return cfg, nil
		}
		return cfg, err
	}
	cfg.FillDefaults(Default(secretKey))
	return cfg, nil
}

func (s *Store) Write(cfg Config) error {
	cfg.FillDefaults(Default(s.secretKey))
	return fsjson.WriteAtomic(s.Path(), cfg, 0600)
}
