package module

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/onlyLTY/dockerCopilot/internal/types"
)

func TestBuildManifestURLNormalizesDockerHubReference(t *testing.T) {
	url, err := BuildManifestURL(types.Image{ImageName: "nginx", ImageTag: "latest"})
	if err != nil {
		t.Fatalf("BuildManifestURL returned error: %v", err)
	}
	if url != "https://index.docker.io/v2/library/nginx/manifests/latest" {
		t.Fatalf("BuildManifestURL() = %q", url)
	}
}

func TestBuildManifestURLRejectsMissingTag(t *testing.T) {
	if _, err := BuildManifestURL(types.Image{ImageName: "nginx", ImageTag: ""}); err == nil {
		t.Fatalf("BuildManifestURL() error = nil, want error")
	}
}

func TestGetDigestReadsDockerContentDigest(t *testing.T) {
	const wantDigest = "sha256:remote"
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			t.Fatalf("method = %s, want GET", r.Method)
		}
		if got := r.Header.Get("Accept"); got == "" {
			t.Fatalf("Accept header is empty")
		}
		w.Header().Set(ContentDigestHeader, wantDigest)
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	got, err := GetDigest(server.URL, "")
	if err != nil {
		t.Fatalf("GetDigest returned error: %v", err)
	}
	if got != wantDigest {
		t.Fatalf("GetDigest() = %q, want %q", got, wantDigest)
	}
}

func TestGetDigestReturnsRegistryStatusOnUnauthorized(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("WWW-Authenticate", "Bearer realm=\"https://auth.example/token\"")
		w.WriteHeader(http.StatusUnauthorized)
	}))
	defer server.Close()

	if _, err := GetDigest(server.URL, ""); err == nil {
		t.Fatalf("GetDigest() error = nil, want unauthorized error")
	}
}

func TestCompareRemoteDigestWithLocalRepoDigests(t *testing.T) {
	tests := []struct {
		name             string
		imageRef         string
		remoteDigest     string
		localRepoDigests []string
		want             bool
	}{
		{
			name:             "same digest is current",
			imageRef:         "nginx:latest",
			remoteDigest:     "sha256:same",
			localRepoDigests: []string{"docker.io/library/nginx@sha256:same"},
			want:             false,
		},
		{
			name:             "matching repo different digest needs update",
			imageRef:         "nginx:latest",
			remoteDigest:     "sha256:remote",
			localRepoDigests: []string{"docker.io/library/nginx@sha256:local"},
			want:             true,
		},
		{
			name:             "missing repo digest falls back to no update",
			imageRef:         "nginx:latest",
			remoteDigest:     "sha256:remote",
			localRepoDigests: nil,
			want:             false,
		},
		{
			name:             "different local repo falls back to no update",
			imageRef:         "nginx:latest",
			remoteDigest:     "sha256:remote",
			localRepoDigests: []string{"ghcr.io/example/nginx@sha256:local"},
			want:             false,
		},
		{
			name:             "empty remote digest is not update",
			imageRef:         "nginx:latest",
			remoteDigest:     "",
			localRepoDigests: []string{"docker.io/library/nginx@sha256:local"},
			want:             false,
		},
		{
			name:             "malformed local repo digest is ignored",
			imageRef:         "nginx:latest",
			remoteDigest:     "sha256:remote",
			localRepoDigests: []string{"docker.io/library/nginx"},
			want:             false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := compareRemoteDigestWithLocalRepoDigests(tt.imageRef, tt.remoteDigest, tt.localRepoDigests); got != tt.want {
				t.Fatalf("compareRemoteDigestWithLocalRepoDigests() = %v, want %v", got, tt.want)
			}
		})
	}
}
