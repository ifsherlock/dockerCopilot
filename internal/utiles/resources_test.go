package utiles

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/onlyLTY/dockerCopilot/internal/domain/storecatalog"
)

func TestReadServiceLogsCreatesMissingDirectory(t *testing.T) {
	logDir := filepath.Join(t.TempDir(), "missing-logs")
	t.Setenv("DOCKERCOPILOT_LOG_DIR", logDir)

	logs, err := ReadServiceLogs(100, "", "")
	if err != nil {
		t.Fatalf("ReadServiceLogs returned error: %v", err)
	}
	if !strings.Contains(logs, "No service log files found") {
		t.Fatalf("logs = %q, want empty-log hint", logs)
	}
	if _, err := os.Stat(logDir); err != nil {
		t.Fatalf("log directory was not created: %v", err)
	}
}

func TestQuickLinkIDUsesContainerName(t *testing.T) {
	if got := quickLinkID("/Zomboid-Panel"); got != "container:zomboid-panel" {
		t.Fatalf("quickLinkID() = %q, want container:zomboid-panel", got)
	}
	if got := quickLinkID("  "); got != "" {
		t.Fatalf("quickLinkID(blank) = %q, want empty", got)
	}
}

func TestReadServiceLogsReadsLogFiles(t *testing.T) {
	logDir := t.TempDir()
	t.Setenv("DOCKERCOPILOT_LOG_DIR", logDir)
	if err := os.WriteFile(filepath.Join(logDir, "dockercopilot.log"), []byte("first\nsecond error\nthird\n"), 0644); err != nil {
		t.Fatalf("write log file failed: %v", err)
	}

	logs, err := ReadServiceLogs(1, "", "")
	if err != nil {
		t.Fatalf("ReadServiceLogs returned error: %v", err)
	}
	if strings.TrimSpace(logs) != "third" {
		t.Fatalf("logs = %q, want last line", logs)
	}

	filtered, err := ReadServiceLogs(10, "", "error")
	if err != nil {
		t.Fatalf("ReadServiceLogs with level returned error: %v", err)
	}
	if strings.TrimSpace(filtered) != "second error" {
		t.Fatalf("filtered logs = %q, want matching error line", filtered)
	}
}

func TestParseOnePanelArchive(t *testing.T) {
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	writeZipFile(t, zw, "appstore-dev/apps/2fauth/data.yml", `
name: 2FAuth
tags:
  - 安全
title: 管理双因素身份验证帐户
description: 管理双因素身份验证帐户
additionalProperties:
  key: 2fauth
  name: 2FAuth
  tags:
    - Security
  shortDescZh: 管理双因素身份验证帐户
`)
	writeZipFile(t, zw, "appstore-dev/apps/2fauth/logo.png", "png")
	writeZipFile(t, zw, "appstore-dev/apps/2fauth/6.1.3/docker-compose.yml", `
services:
  2fauth:
    image: 2fauth/2fauth:6.1.3
    container_name: ${CONTAINER_NAME}
`)
	if err := zw.Close(); err != nil {
		t.Fatalf("close zip failed: %v", err)
	}

	apps, err := storecatalog.ParseArchive(
		storecatalog.Source{ID: "1panel", Name: "1Panel", URL: "https://codeload.github.com/1Panel-dev/appstore/zip/refs/heads/dev"},
		buf.Bytes(),
		time.Date(2026, 7, 6, 1, 0, 0, 0, time.UTC),
	)
	if err != nil {
		t.Fatalf("parseOnePanelArchive returned error: %v", err)
	}
	if len(apps) != 1 {
		t.Fatalf("apps len = %d, want 1", len(apps))
	}
	app := apps[0]
	assertEqual(t, app.ID, "1panel-2fauth", "id")
	assertEqual(t, app.Name, "2FAuth", "name")
	assertEqual(t, app.Image, "2fauth/2fauth:6.1.3", "image")
	if !strings.Contains(app.Compose, "2fauth/2fauth:6.1.3") {
		t.Fatalf("compose = %q, want image", app.Compose)
	}
	if !strings.Contains(app.Icon, "raw.githubusercontent.com/1Panel-dev/appstore/dev/apps/2fauth/logo.png") {
		t.Fatalf("icon = %q, want raw github icon url", app.Icon)
	}
}

func TestMergeDefaultStoreSourcesAddsOnePanel(t *testing.T) {
	root := t.TempDir()
	t.Setenv("DOCKERCOPILOT_STORE_DIR", root)
	initial := []StoreSource{{
		ID:      "casaos",
		Name:    "CasaOS AppStore",
		URL:     "https://github.com/IceWhaleTech/CasaOS-AppStore/archive/refs/heads/main.zip",
		Enabled: true,
		Builtin: true,
	}}
	b, err := json.Marshal(initial)
	if err != nil {
		t.Fatalf("marshal sources failed: %v", err)
	}
	if err := os.WriteFile(filepath.Join(root, "sources.json"), b, 0644); err != nil {
		t.Fatalf("write sources failed: %v", err)
	}
	sources, err := LoadStoreSources()
	if err != nil {
		t.Fatalf("LoadStoreSources returned error: %v", err)
	}
	foundOnePanel := false
	foundCasaCodeload := false
	for _, source := range sources {
		if source.ID == "1panel" && source.Enabled && source.Builtin {
			foundOnePanel = true
		}
		if source.ID == "casaos" && strings.Contains(source.URL, "codeload.github.com") {
			foundCasaCodeload = true
		}
	}
	if !foundOnePanel {
		t.Fatalf("1panel source missing: %#v", sources)
	}
	if !foundCasaCodeload {
		t.Fatalf("casaos source was not migrated to codeload: %#v", sources)
	}
}

func writeZipFile(t *testing.T, zw *zip.Writer, name string, content string) {
	t.Helper()
	w, err := zw.Create(name)
	if err != nil {
		t.Fatalf("create zip file %s failed: %v", name, err)
	}
	if _, err := w.Write([]byte(content)); err != nil {
		t.Fatalf("write zip file %s failed: %v", name, err)
	}
}

func assertEqual(t *testing.T, got interface{}, want string, field string) {
	t.Helper()
	if got != want {
		t.Fatalf("%s = %#v, want %q", field, got, want)
	}
}
