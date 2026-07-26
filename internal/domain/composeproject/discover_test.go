package composeproject

import (
	"os"
	"path/filepath"
	"testing"
)

func TestSplitConfigFiles(t *testing.T) {
	got := splitConfigFiles("/a/docker-compose.yml, /b/override.yml ,,")
	if len(got) != 2 || got[0] != "/a/docker-compose.yml" || got[1] != "/b/override.yml" {
		t.Fatalf("splitConfigFiles() = %#v", got)
	}
	if got := splitConfigFiles(""); len(got) != 0 {
		t.Fatalf("splitConfigFiles(empty) = %#v", got)
	}
}

func TestReadExternalComposeFilePrefersFirstReadable(t *testing.T) {
	dir := t.TempDir()
	target := filepath.Join(dir, "docker-compose.yml")
	if err := os.WriteFile(target, []byte("services: {}"), 0644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}
	content, path, ok := readExternalComposeFile(dir, []string{"/definitely/missing.yml", target})
	if !ok || path != target || content != "services: {}" {
		t.Fatalf("readExternalComposeFile() = (%q, %q, %v)", content, path, ok)
	}
	// 相对路径按 working_dir 解析
	content, path, ok = readExternalComposeFile(dir, []string{"docker-compose.yml"})
	if !ok || path != target || content != "services: {}" {
		t.Fatalf("readExternalComposeFile(relative) = (%q, %q, %v)", content, path, ok)
	}
	if _, _, ok := readExternalComposeFile(dir, []string{"/missing/a.yml"}); ok {
		t.Fatalf("readExternalComposeFile(missing) = ok, want !ok")
	}
}

func TestManagedProjectNamesReadsComposeRoot(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("DOCKERCOPILOT_COMPOSE_DIR", dir)
	if err := os.MkdirAll(filepath.Join(dir, "immich"), 0755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := os.WriteFile(filepath.Join(dir, "not-a-dir.txt"), []byte("x"), 0644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}
	names := managedProjectNames()
	if !names["immich"] || names["not-a-dir.txt"] || len(names) != 1 {
		t.Fatalf("managedProjectNames() = %#v", names)
	}
}

func TestSaveWithEnvWritesEnvFile(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("DOCKERCOPILOT_COMPOSE_DIR", dir)
	project, err := SaveWithEnv("qbittorrent", "services:\n  qbittorrent:\n    image: a:b\n", "PUID=1000\n")
	if err != nil {
		t.Fatalf("SaveWithEnv() error = %v", err)
	}
	if project.Name != "qbittorrent" {
		t.Fatalf("project.Name = %q", project.Name)
	}
	envBytes, err := os.ReadFile(filepath.Join(dir, "qbittorrent", ".env"))
	if err != nil || string(envBytes) != "PUID=1000\n" {
		t.Fatalf(".env = %q, err = %v", string(envBytes), err)
	}
}
