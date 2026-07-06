package storecatalog

import (
	"encoding/json"
	"os"
	"path/filepath"
)

func readAppsCache(path string) ([]App, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var apps []App
	return apps, json.Unmarshal(b, &apps)
}

func writeAppsCache(path string, apps []App) error {
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return err
	}
	b, err := json.MarshalIndent(apps, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, b, 0644)
}
