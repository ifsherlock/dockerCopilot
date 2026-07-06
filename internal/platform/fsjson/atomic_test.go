package fsjson

import (
	"os"
	"path/filepath"
	"testing"
)

func TestWriteAtomicCreatesParentAndWritesIndentedJSON(t *testing.T) {
	path := filepath.Join(t.TempDir(), "nested", "config.json")
	value := map[string]interface{}{"name": "local", "enabled": true}

	if err := WriteAtomic(path, value, 0600); err != nil {
		t.Fatalf("WriteAtomic() error = %v", err)
	}

	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("ReadFile() error = %v", err)
	}
	if got := string(b); got != "{\n  \"enabled\": true,\n  \"name\": \"local\"\n}" {
		t.Fatalf("written json = %q", got)
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatalf("Stat() error = %v", err)
	}
	if info.Mode().Perm() != 0600 {
		t.Fatalf("mode = %v, want 0600", info.Mode().Perm())
	}
}

func TestReadReturnsJSONError(t *testing.T) {
	path := filepath.Join(t.TempDir(), "bad.json")
	if err := os.WriteFile(path, []byte("{bad"), 0600); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}
	var got map[string]interface{}
	if err := Read(path, &got); err == nil {
		t.Fatal("Read() error = nil, want json error")
	}
}
