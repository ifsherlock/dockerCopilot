package utiles

import "testing"

func TestCompareVersions(t *testing.T) {
	tests := []struct {
		name string
		a    string
		b    string
		want int
	}{
		{name: "equal with v prefix", a: "v2.1.24", b: "2.1.24", want: 0},
		{name: "remote patch is newer", a: "2.1.25", b: "2.1.24", want: 1},
		{name: "local minor is newer", a: "2.1.24", b: "2.2.0", want: -1},
		{name: "missing patch preserves current fallback ordering", a: "2.1", b: "2.1.0", want: -1},
		{name: "numeric compare beats lexical", a: "2.10.0", b: "2.9.9", want: 1},
		{name: "pre release suffix preserves current fallback ordering", a: "2.1.24-beta", b: "2.1.24", want: 1},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := CompareVersions(tt.a, tt.b); got != tt.want {
				t.Fatalf("CompareVersions(%q, %q) = %d, want %d", tt.a, tt.b, got, tt.want)
			}
		})
	}
}

func TestResolveProgramDownloadURL(t *testing.T) {
	tests := []struct {
		name          string
		releaseBase   string
		remoteVersion string
		arch          string
		want          string
	}{
		{
			name:          "github release base",
			releaseBase:   "https://github.com/ifsherlock/dockerCopilot/releases/download",
			remoteVersion: "2.1.24",
			arch:          "amd64",
			want:          "https://github.com/ifsherlock/dockerCopilot/releases/download/2.1.24/dockerCopilot-linux-amd64.tar.gz",
		},
		{
			name:          "templated mirror",
			releaseBase:   "https://mirror.example/{version}/dockerCopilot-{arch}.tar.gz",
			remoteVersion: "2.1.24",
			arch:          "arm64",
			want:          "https://mirror.example/2.1.24/dockerCopilot-arm64.tar.gz",
		},
		{
			name:          "direct tarball",
			releaseBase:   "https://mirror.example/dockerCopilot-linux-amd64.tar.gz",
			remoteVersion: "2.1.24",
			arch:          "amd64",
			want:          "https://mirror.example/dockerCopilot-linux-amd64.tar.gz",
		},
		{
			name:          "generic base",
			releaseBase:   "https://mirror.example/releases/",
			remoteVersion: "2.1.24",
			arch:          "amd64",
			want:          "https://mirror.example/releases/dockerCopilot-amd64.tar.gz",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := resolveProgramDownloadURL(tt.releaseBase, tt.remoteVersion, tt.arch); got != tt.want {
				t.Fatalf("resolveProgramDownloadURL() = %q, want %q", got, tt.want)
			}
		})
	}
}
