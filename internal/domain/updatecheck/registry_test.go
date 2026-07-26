package updatecheck

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestRegistryCheckerManifestListSelectsPlatformDigest(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v2/library/nginx/manifests/latest" {
			t.Fatalf("path = %s", r.URL.Path)
		}
		if got := strings.Join(r.Header.Values("Accept"), ","); !strings.Contains(got, "manifest.list") {
			t.Fatalf("Accept = %q, want manifest list media type", got)
		}
		w.Header().Set(ContentDigestHeader, "sha256:index")
		_, _ = w.Write([]byte(`{
			"schemaVersion": 2,
			"mediaType": "application/vnd.docker.distribution.manifest.list.v2+json",
			"manifests": [
				{"digest": "sha256:arm", "platform": {"os": "linux", "architecture": "arm64"}},
				{"digest": "sha256:amd", "platform": {"os": "linux", "architecture": "amd64"}}
			]
		}`))
	}))
	defer server.Close()

	checker := testRegistryChecker(server, Platform{OS: "linux", Architecture: "amd64"})
	result, err := checker.CheckImageRef(context.Background(), "nginx:latest", []string{"docker.io/library/nginx@sha256:amd"})
	if err != nil {
		t.Fatalf("CheckImageRef returned error: %v", err)
	}
	if result.RemoteIndexDigest != "sha256:index" || result.RemotePlatformDigest != "sha256:amd" {
		t.Fatalf("digests = index %q platform %q", result.RemoteIndexDigest, result.RemotePlatformDigest)
	}
	if result.NeedUpdate || result.Status != StatusUpToDate {
		t.Fatalf("result = %#v, want up_to_date", result)
	}
}

func TestRegistryCheckerManifestListDetectsPlatformDigestUpdate(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set(ContentDigestHeader, "sha256:index")
		_, _ = w.Write([]byte(`{
			"schemaVersion": 2,
			"manifests": [
				{"digest": "sha256:remote-platform", "platform": {"os": "linux", "architecture": "amd64"}}
			]
		}`))
	}))
	defer server.Close()

	checker := testRegistryChecker(server, Platform{OS: "linux", Architecture: "amd64"})
	result, err := checker.CheckImageRef(context.Background(), "nginx:latest", []string{"docker.io/library/nginx@sha256:local-platform"})
	if err != nil {
		t.Fatalf("CheckImageRef returned error: %v", err)
	}
	if !result.NeedUpdate || result.Status != StatusUpdateAvailable {
		t.Fatalf("result = %#v, want update_available", result)
	}
}

func TestRegistryCheckerSingleManifestUsesIndexDigest(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set(ContentDigestHeader, "sha256:single")
		_, _ = w.Write([]byte(`{"schemaVersion": 2}`))
	}))
	defer server.Close()

	checker := testRegistryChecker(server, Platform{OS: "linux", Architecture: "amd64"})
	result, err := checker.CheckImageRef(context.Background(), "nginx:latest", []string{"docker.io/library/nginx@sha256:single"})
	if err != nil {
		t.Fatalf("CheckImageRef returned error: %v", err)
	}
	if result.RemotePlatformDigest != "" || result.NeedUpdate || result.Status != StatusUpToDate {
		t.Fatalf("result = %#v, want single manifest up_to_date", result)
	}
}

func TestRegistryCheckerUnauthorizedIsCheckFailed(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("WWW-Authenticate", "Bearer realm=\"https://auth.example/token\"")
		w.WriteHeader(http.StatusUnauthorized)
	}))
	defer server.Close()

	checker := testRegistryChecker(server, Platform{OS: "linux", Architecture: "amd64"})
	result, err := checker.CheckImageRef(context.Background(), "nginx:latest", []string{"docker.io/library/nginx@sha256:local"})
	if err == nil {
		t.Fatalf("CheckImageRef error = nil, want unauthorized error")
	}
	if result.Status != StatusCheckFailed || !strings.Contains(result.Error, "401") {
		t.Fatalf("result = %#v, want check_failed with 401", result)
	}
}

func TestRegistryCheckerTimeoutIsCheckFailed(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(50 * time.Millisecond)
	}))
	defer server.Close()

	checker := testRegistryChecker(server, Platform{OS: "linux", Architecture: "amd64"})
	checker.Client.Timeout = time.Nanosecond
	result, err := checker.CheckImageRef(context.Background(), "nginx:latest", []string{"docker.io/library/nginx@sha256:local"})
	if err == nil {
		t.Fatalf("CheckImageRef error = nil, want timeout error")
	}
	if result.Status != StatusCheckFailed {
		t.Fatalf("result = %#v, want check_failed", result)
	}
}

func TestSplitImageRefNormalizesTagAndPortRegistry(t *testing.T) {
	cases := []struct {
		in       string
		wantRepo string
		wantTag  string
		wantOK   bool
	}{
		{"nginx", "nginx", "latest", true},
		{"nginx:1.25", "nginx", "1.25", true},
		{"registry.example.com:5000/app", "registry.example.com:5000/app", "latest", true},
		{"registry.example.com:5000/app:v1", "registry.example.com:5000/app", "v1", true},
		{"nginx@sha256:0000000000000000000000000000000000000000000000000000000000000000", "nginx", "", false},
		{"", "", "", false},
	}
	for _, c := range cases {
		repo, tag, ok := splitImageRef(c.in)
		if ok != c.wantOK || (ok && (repo != c.wantRepo || tag != c.wantTag)) {
			t.Fatalf("splitImageRef(%q) = (%q, %q, %v), want (%q, %q, %v)", c.in, repo, tag, ok, c.wantRepo, c.wantTag, c.wantOK)
		}
	}
}

func TestCompareRemoteDigestsPortRegistry(t *testing.T) {
	needUpdate := CompareRemoteDigestsForLegacy(
		"registry.example.com:5000/app:v1",
		"sha256:new", "",
		[]string{"registry.example.com:5000/app@sha256:old"},
	)
	if !needUpdate {
		t.Fatalf("CompareRemoteDigestsForLegacy port registry = false, want true")
	}
	upToDate := CompareRemoteDigestsForLegacy(
		"registry.example.com:5000/app:v1",
		"sha256:same", "",
		[]string{"registry.example.com:5000/app@sha256:same"},
	)
	if upToDate {
		t.Fatalf("CompareRemoteDigestsForLegacy matching digest = true, want false")
	}
}

func TestRegistryCheckerHeadMatchSkipsGet(t *testing.T) {
	getCount := 0
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			getCount++
		}
		w.Header().Set(ContentDigestHeader, "sha256:index")
		_, _ = w.Write([]byte(`{"schemaVersion": 2}`))
	}))
	defer server.Close()

	checker := testRegistryChecker(server, Platform{OS: "linux", Architecture: "amd64"})
	result, err := checker.CheckImageRef(context.Background(), "nginx:latest", []string{"docker.io/library/nginx@sha256:index"})
	if err != nil {
		t.Fatalf("CheckImageRef returned error: %v", err)
	}
	if result.NeedUpdate || result.Status != StatusUpToDate {
		t.Fatalf("result = %#v, want up_to_date", result)
	}
	if getCount != 0 {
		t.Fatalf("GET count = %d, want 0 (HEAD digest match should skip GET)", getCount)
	}
}

func TestRegistryCheckerUntaggedRefDefaultsToLatest(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v2/library/nginx/manifests/latest" {
			t.Fatalf("path = %s, want /v2/library/nginx/manifests/latest", r.URL.Path)
		}
		w.Header().Set(ContentDigestHeader, "sha256:new")
		_, _ = w.Write([]byte(`{"schemaVersion": 2}`))
	}))
	defer server.Close()

	checker := testRegistryChecker(server, Platform{OS: "linux", Architecture: "amd64"})
	result, err := checker.CheckImageRef(context.Background(), "nginx", []string{"nginx@sha256:old"})
	if err != nil {
		t.Fatalf("CheckImageRef returned error: %v", err)
	}
	if !result.NeedUpdate || result.Status != StatusUpdateAvailable {
		t.Fatalf("result = %#v, want update_available", result)
	}
}

func testRegistryChecker(server *httptest.Server, platform Platform) RegistryChecker {
	checker := NewRegistryChecker()
	checker.Client = server.Client()
	checker.ManifestHost = strings.TrimPrefix(server.URL, "https://")
	checker.Platform = platform
	checker.Token = func(ctx context.Context, imageName string) (string, error) {
		return "", nil
	}
	checker.ResolveHost = func(imageName string) (string, error) {
		return "", fmt.Errorf("unexpected host resolver call for %s", imageName)
	}
	return checker
}
