package runtimeconfig

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestConfigFileModeDefaultsAndOverrides(t *testing.T) {
	cases := []struct {
		env  string
		want os.FileMode
	}{
		{"", 0666},
		{"600", 0600},
		{"0600", 0600},
		{"644", 0644},
		{"666", 0666},
		{"abc", 0666},  // 非法值回落默认
		{"0", 0666},    // 0 权限无意义，回落默认
		{"1777", 0777}, // 超出 ModePerm 的位被裁剪
	}
	for _, c := range cases {
		t.Setenv("DOCKERCOPILOT_CONFIG_FILE_MODE", c.env)
		if got := ConfigFileMode(); got != c.want {
			t.Fatalf("ConfigFileMode() with env %q = %o, want %o", c.env, got, c.want)
		}
	}
}

func TestConfigFileOwnerParsesPUIDPGID(t *testing.T) {
	t.Setenv("PUID", "")
	t.Setenv("PGID", "")
	if _, _, ok := ConfigFileOwner(); ok {
		t.Fatalf("ConfigFileOwner() with no env = ok, want !ok")
	}

	t.Setenv("PUID", "1000")
	uid, gid, ok := ConfigFileOwner()
	if !ok || uid != 1000 || gid != -1 {
		t.Fatalf("ConfigFileOwner() with PUID only = (%d, %d, %v), want (1000, -1, true)", uid, gid, ok)
	}

	t.Setenv("PGID", "100")
	uid, gid, ok = ConfigFileOwner()
	if !ok || uid != 1000 || gid != 100 {
		t.Fatalf("ConfigFileOwner() = (%d, %d, %v), want (1000, 100, true)", uid, gid, ok)
	}

	t.Setenv("PUID", "-5")
	t.Setenv("PGID", "notanumber")
	if _, _, ok := ConfigFileOwner(); ok {
		t.Fatalf("ConfigFileOwner() with invalid values = ok, want !ok")
	}
}

func TestStoreWriteUsesConfiguredMode(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("Windows 上 chmod 语义不同，权限断言仅在类 Unix 系统有效")
	}
	t.Setenv("DOCKERCOPILOT_CONFIG_FILE_MODE", "640")
	path := filepath.Join(t.TempDir(), "config.json")
	store := NewStore(path, "secret")
	if err := store.Write(Config{}); err != nil {
		t.Fatalf("Write() error = %v", err)
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatalf("Stat() error = %v", err)
	}
	if got := info.Mode().Perm(); got != 0640 {
		t.Fatalf("config file mode = %o, want 640", got)
	}
}

func TestApplyConfigFilePolicyRepairsExistingFile(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("Windows 上 chmod 语义不同，权限断言仅在类 Unix 系统有效")
	}
	t.Setenv("DOCKERCOPILOT_CONFIG_FILE_MODE", "")
	t.Setenv("PUID", "")
	t.Setenv("PGID", "")
	path := filepath.Join(t.TempDir(), "config.json")
	if err := os.WriteFile(path, []byte("{}"), 0600); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}
	ApplyConfigFilePolicy(path)
	info, err := os.Stat(path)
	if err != nil {
		t.Fatalf("Stat() error = %v", err)
	}
	if got := info.Mode().Perm(); got != 0666 {
		t.Fatalf("repaired mode = %o, want 666", got)
	}
}
