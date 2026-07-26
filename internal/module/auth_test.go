package module

import (
	"strings"
	"testing"
)

func TestDockerIOHostCandidatesOrderAndSanitize(t *testing.T) {
	user := []string{
		" https://hub4.nat.tf/ ",       // 带 scheme 与斜杠，应清洗
		"docker.io",                    // 官方别名，归一为官方源，不重复出现
		"docker.1ms.run",               // 与内置列表重复，应去重
		"docker.gh-proxy.com/library/", // 带路径，无法用作 host，丢弃
		"",                             // 空条目丢弃
	}
	got := dockerIOHostCandidates(user)

	if got[0] != DefaultRegistryHost {
		t.Fatalf("candidates[0] = %q, want official host %q", got[0], DefaultRegistryHost)
	}
	if got[1] != "hub4.nat.tf" {
		t.Fatalf("candidates[1] = %q, want user source hub4.nat.tf", got[1])
	}
	counts := map[string]int{}
	for _, host := range got {
		counts[host]++
		if host == "" || strings.Contains(host, "/") || strings.Contains(host, "://") {
			t.Fatalf("candidate %q is not a clean host", host)
		}
	}
	for host, n := range counts {
		if n > 1 {
			t.Fatalf("candidate %q appears %d times, want dedup", host, n)
		}
	}
	if counts["docker.1ms.run"] != 1 {
		t.Fatalf("builtin accelerator docker.1ms.run missing from candidates: %v", got)
	}
}

func TestToStringListSupportsMixedShapes(t *testing.T) {
	if got := toStringList([]interface{}{"a", " b ", 3, ""}); len(got) != 2 || got[0] != "a" || got[1] != "b" {
		t.Fatalf("toStringList([]interface{}) = %v", got)
	}
	if got := toStringList("a, b;c\nd"); len(got) != 4 {
		t.Fatalf("toStringList(string) = %v", got)
	}
	if got := toStringList(nil); len(got) != 0 {
		t.Fatalf("toStringList(nil) = %v", got)
	}
}
