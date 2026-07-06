package storecatalog

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestLoadAppsDownloadsParsesAndCachesCasaOSArchive(t *testing.T) {
	archive := casaOSArchive(t)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write(archive)
	}))
	defer server.Close()
	root := t.TempDir()
	writeSources(t, root, []Source{{ID: "test", Name: "Test", URL: server.URL, Enabled: true}})
	store := New(root)
	store.now = func() time.Time { return time.Date(2026, 7, 6, 1, 0, 0, 0, time.UTC) }

	apps, err := store.LoadApps(true)
	if err != nil {
		t.Fatalf("LoadApps() error = %v", err)
	}
	if len(apps) != 1 {
		t.Fatalf("apps len = %d, want 1: %#v", len(apps), apps)
	}
	if apps[0].Name != "Demo App" || apps[0].Image != "nginx:latest" || apps[0].UpdatedAt != "2026-07-06 01:00:00" {
		t.Fatalf("app = %#v", apps[0])
	}
	if _, err := os.Stat(filepath.Join(root, "cache", "test.json")); err != nil {
		t.Fatalf("cache not written: %v", err)
	}
}

func TestLoadAppsDownloadFailureUsesVisibleCache(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "nope", http.StatusBadGateway)
	}))
	defer server.Close()
	root := t.TempDir()
	writeSources(t, root, []Source{{ID: "test", Name: "Test", URL: server.URL, Enabled: true}})
	writeCache(t, root, "test", []App{{ID: "cached", Name: "Cached"}})

	apps, err := New(root).LoadApps(true)
	if err == nil {
		t.Fatal("LoadApps() error = nil, want visible cache fallback error")
	}
	if !strings.Contains(err.Error(), "使用缓存") {
		t.Fatalf("error = %q, want cache fallback message", err.Error())
	}
	if len(apps) != 1 || apps[0].ID != "cached" {
		t.Fatalf("apps = %#v, want cached app", apps)
	}
}

func TestLoadAppsDownloadFailureWithoutCacheUsesFallbackAndReturnsError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "nope", http.StatusBadGateway)
	}))
	defer server.Close()
	root := t.TempDir()
	writeSources(t, root, []Source{{ID: "test", Name: "Test", URL: server.URL, Enabled: true}})

	apps, err := New(root).LoadApps(true)
	if err == nil {
		t.Fatal("LoadApps() error = nil, want download error")
	}
	if len(apps) == 0 || apps[0].SourceID != "fallback" {
		t.Fatalf("apps = %#v, want fallback apps", apps)
	}
}

func TestLoadAppsParseFailureWithoutCacheUsesFallbackAndReturnsError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write(badArchive(t))
	}))
	defer server.Close()
	root := t.TempDir()
	writeSources(t, root, []Source{{ID: "test", Name: "Test", URL: server.URL, Enabled: true}})

	apps, err := New(root).LoadApps(true)
	if err == nil {
		t.Fatal("LoadApps() error = nil, want parse error")
	}
	if !strings.Contains(err.Error(), "Compose 模板") {
		t.Fatalf("error = %q, want parse error", err.Error())
	}
	if len(apps) == 0 || apps[0].SourceID != "fallback" {
		t.Fatalf("apps = %#v, want fallback apps", apps)
	}
}

func casaOSArchive(t *testing.T) []byte {
	t.Helper()
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	addZipFile(t, zw, "repo/Apps/demo/docker-compose.yml", "services:\n  demo:\n    image: nginx:latest\n")
	addZipFile(t, zw, "repo/Apps/demo/config.json", `{"name":"Demo App","description":"Demo","category":"Test","author":"Tester"}`)
	if err := zw.Close(); err != nil {
		t.Fatalf("Close zip: %v", err)
	}
	return buf.Bytes()
}

func badArchive(t *testing.T) []byte {
	t.Helper()
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	addZipFile(t, zw, "repo/readme.md", "empty")
	if err := zw.Close(); err != nil {
		t.Fatalf("Close zip: %v", err)
	}
	return buf.Bytes()
}

func addZipFile(t *testing.T, zw *zip.Writer, name string, content string) {
	t.Helper()
	w, err := zw.Create(name)
	if err != nil {
		t.Fatalf("Create zip file: %v", err)
	}
	if _, err := w.Write([]byte(content)); err != nil {
		t.Fatalf("Write zip file: %v", err)
	}
}

func writeSources(t *testing.T, root string, sources []Source) {
	t.Helper()
	sources = append(sources,
		Source{ID: "casaos", Name: "CasaOS", URL: "http://127.0.0.1/disabled", Enabled: false, Builtin: true},
		Source{ID: "1panel", Name: "1Panel", URL: "http://127.0.0.1/disabled", Enabled: false, Builtin: true},
	)
	b, err := json.Marshal(sources)
	if err != nil {
		t.Fatalf("Marshal sources: %v", err)
	}
	if err := os.WriteFile(filepath.Join(root, "sources.json"), b, 0644); err != nil {
		t.Fatalf("Write sources: %v", err)
	}
}

func writeCache(t *testing.T, root string, sourceID string, apps []App) {
	t.Helper()
	if err := os.MkdirAll(filepath.Join(root, "cache"), 0755); err != nil {
		t.Fatalf("Mkdir cache: %v", err)
	}
	b, err := json.Marshal(apps)
	if err != nil {
		t.Fatalf("Marshal cache: %v", err)
	}
	if err := os.WriteFile(filepath.Join(root, "cache", sourceID+".json"), b, 0644); err != nil {
		t.Fatalf("Write cache: %v", err)
	}
}
