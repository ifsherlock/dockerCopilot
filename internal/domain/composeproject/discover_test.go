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
	content, path, ok := readExternalComposeFile(dir, []string{"/definitely/missing.yml", target}, nil)
	if !ok || path != target || content != "services: {}" {
		t.Fatalf("readExternalComposeFile() = (%q, %q, %v)", content, path, ok)
	}
	if _, _, ok := readExternalComposeFile(dir, []string{"/missing/a.yml"}, nil); ok {
		t.Fatalf("readExternalComposeFile(missing) = ok, want !ok")
	}
}

func TestReadExternalComposeFileTranslatesViaMounts(t *testing.T) {
	dir := t.TempDir()
	target := filepath.Join(dir, "docker-compose.yml")
	if err := os.WriteFile(target, []byte("services: {}"), 0644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}
	// 宿主机路径 /volume1/docker/app 挂载到了本测试的临时目录
	mounts := []mountPair{{source: "/volume1/docker/app", dest: dir}}
	content, path, ok := readExternalComposeFile("/volume1/docker/app", []string{"/volume1/docker/app/docker-compose.yml"}, mounts)
	if !ok || content != "services: {}" {
		t.Fatalf("readExternalComposeFile(mount translate) = (%q, %q, %v)", content, path, ok)
	}
	if path != "/volume1/docker/app/docker-compose.yml" {
		t.Fatalf("SourceDetail 应保留宿主机原路径, got %q", path)
	}
}

func TestRebaseHostPath(t *testing.T) {
	if got, ok := rebaseHostPath("/volume1/docker/app/compose.yml", "/volume1/docker", "/host/docker"); !ok || got != "/host/docker/app/compose.yml" {
		t.Fatalf("rebaseHostPath() = (%q, %v)", got, ok)
	}
	if got, ok := rebaseHostPath("/volume1/docker", "/volume1/docker", "/host/docker"); !ok || got != "/host/docker" {
		t.Fatalf("rebaseHostPath(equal) = (%q, %v)", got, ok)
	}
	// 前缀必须落在路径分隔符边界上
	if _, ok := rebaseHostPath("/volume1/dockerX/app.yml", "/volume1/docker", "/host"); ok {
		t.Fatalf("rebaseHostPath(boundary) = ok, want !ok")
	}
	if _, ok := rebaseHostPath("/other/path.yml", "/volume1/docker", "/host"); ok {
		t.Fatalf("rebaseHostPath(unrelated) = ok, want !ok")
	}
}

func TestHostPathCandidatesOrderAndHostRoot(t *testing.T) {
	t.Setenv("DOCKERCOPILOT_HOST_ROOT", "/hostfs")
	mounts := []mountPair{{source: "/volume1/docker", dest: "/mnt/docker"}}
	got := hostPathCandidates("/volume1/docker/app/compose.yml", mounts)
	want := []string{
		"/volume1/docker/app/compose.yml",
		"/hostfs/volume1/docker/app/compose.yml",
		"/mnt/docker/app/compose.yml",
	}
	if len(got) != len(want) {
		t.Fatalf("hostPathCandidates() = %#v, want %#v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("hostPathCandidates()[%d] = %q, want %q", i, got[i], want[i])
		}
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
