package runtimeconfig

import (
	"os"
	"strings"

	"github.com/onlyLTY/dockerCopilot/internal/platform/fsjson"
)

const DefaultPath = "/app/config/config.json"

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
