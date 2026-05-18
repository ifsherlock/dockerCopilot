package utiles

import (
	"os"
	"path/filepath"
	"sort"
	"strings"
)

type backupFileInfo struct {
	name    string
	path    string
	modTime int64
}

func PruneBackups(maxFiles int) error {
	if maxFiles <= 0 {
		maxFiles = 20
	}
	backupDir := os.Getenv("BACKUP_DIR")
	if backupDir == "" {
		backupDir = "/data/backups"
	}
	entries, err := os.ReadDir(backupDir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	files := make([]backupFileInfo, 0)
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		name := entry.Name()
		lower := strings.ToLower(name)
		if !strings.HasPrefix(name, "backup-") || !(strings.HasSuffix(lower, ".json") || strings.HasSuffix(lower, ".yaml") || strings.HasSuffix(lower, ".yml")) {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			continue
		}
		files = append(files, backupFileInfo{name: name, path: filepath.Join(backupDir, name), modTime: info.ModTime().UnixNano()})
	}
	if len(files) <= maxFiles {
		return nil
	}
	sort.Slice(files, func(i, j int) bool {
		if files[i].modTime == files[j].modTime {
			return files[i].name > files[j].name
		}
		return files[i].modTime > files[j].modTime
	})
	for _, file := range files[maxFiles:] {
		if err := os.Remove(file.path); err != nil && !os.IsNotExist(err) {
			return err
		}
	}
	return nil
}
