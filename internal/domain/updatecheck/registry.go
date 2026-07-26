package updatecheck

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"runtime"
	"strings"
	"time"

	ref "github.com/distribution/reference"
)

const ContentDigestHeader = "Docker-Content-Digest"

type Platform struct {
	OS           string
	Architecture string
	Variant      string
}

type RegistryCheckResult struct {
	ImageRef             string
	Repository           string
	Tag                  string
	ManifestURL          string
	RemoteIndexDigest    string
	RemotePlatformDigest string
	Status               Status
	NeedUpdate           bool
	Error                string
}

type TokenProvider func(ctx context.Context, imageName string) (string, error)
type RegistryHostResolver func(imageName string) (string, error)

type RegistryChecker struct {
	Client       *http.Client
	Token        TokenProvider
	ResolveHost  RegistryHostResolver
	Platform     Platform
	ManifestHost string
}

type manifestDescriptor struct {
	MediaType string `json:"mediaType"`
	Digest    string `json:"digest"`
	Platform  struct {
		Architecture string `json:"architecture"`
		OS           string `json:"os"`
		Variant      string `json:"variant"`
	} `json:"platform"`
}

type manifestIndex struct {
	SchemaVersion int                  `json:"schemaVersion"`
	MediaType     string               `json:"mediaType"`
	Manifests     []manifestDescriptor `json:"manifests"`
}

func NewRegistryChecker() RegistryChecker {
	return RegistryChecker{
		Client:      defaultRegistryHTTPClient(),
		ResolveHost: DefaultRegistryHost,
		Platform: Platform{
			OS:           runtime.GOOS,
			Architecture: runtime.GOARCH,
		},
	}
}

func defaultRegistryHTTPClient() *http.Client {
	return &http.Client{Transport: &http.Transport{
		Proxy: http.ProxyFromEnvironment,
		DialContext: (&net.Dialer{
			Timeout:   30 * time.Second,
			KeepAlive: 30 * time.Second,
		}).DialContext,
		ForceAttemptHTTP2:     true,
		MaxIdleConns:          100,
		IdleConnTimeout:       90 * time.Second,
		TLSHandshakeTimeout:   10 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,
		TLSClientConfig:       &tls.Config{InsecureSkipVerify: true},
	}}
}

func DefaultRegistryHost(imageName string) (string, error) {
	normalizedRef, err := ref.ParseNormalizedNamed(imageName)
	if err != nil {
		return "", err
	}
	domain := ref.Domain(normalizedRef)
	if domain == "docker.io" {
		return "index.docker.io", nil
	}
	return domain, nil
}

func (c RegistryChecker) CheckImageRef(ctx context.Context, imageRef string, localRepoDigests []string) (RegistryCheckResult, error) {
	repository, tag, ok := splitImageRef(imageRef)
	result := RegistryCheckResult{ImageRef: imageRef, Repository: repository, Tag: tag, Status: StatusUnknown}
	if !ok || repository == "" || tag == "" || tag == "None" {
		result.Status = StatusUnsupported
		return result, nil
	}

	manifestURL, normalizedRepo, err := c.BuildManifestURL(repository, tag)
	if err != nil {
		result.Status = StatusUnsupported
		result.Error = err.Error()
		return result, nil
	}
	result.ManifestURL = manifestURL
	result.Repository = normalizedRepo

	token := ""
	if c.Token != nil {
		if value, tokenErr := c.Token(ctx, repository); tokenErr == nil {
			token = value
		}
	}

	// 先用 HEAD 取 digest：HEAD 不计入 Docker Hub 拉取限额。
	// 命中本地 RepoDigests 说明已是最新，直接返回，省掉 GET 正文。
	if digest, headErr := c.FetchManifestDigest(ctx, manifestURL, token); headErr == nil && digest != "" &&
		localDigestsContain(imageRef, digest, localRepoDigests) {
		result.RemoteIndexDigest = digest
		result.NeedUpdate = false
		result.Status = StatusUpToDate
		return result, nil
	}

	digest, body, err := c.FetchManifest(ctx, manifestURL, token)
	if err != nil {
		result.Status = StatusCheckFailed
		result.Error = err.Error()
		return result, err
	}
	result.RemoteIndexDigest = digest
	result.RemotePlatformDigest = selectPlatformDigest(body, c.Platform)
	result.NeedUpdate = compareRemoteDigestsWithLocalRepoDigests(imageRef, result.RemoteIndexDigest, result.RemotePlatformDigest, localRepoDigests)
	if result.NeedUpdate {
		result.Status = StatusUpdateAvailable
	} else {
		result.Status = StatusUpToDate
	}
	return result, nil
}

func (c RegistryChecker) BuildManifestURL(imageName string, tag string) (string, string, error) {
	normalizedRef, err := ref.ParseDockerRef(imageName + ":" + tag)
	if err != nil {
		return "", "", err
	}
	taggedRef, isTagged := normalizedRef.(ref.NamedTagged)
	if !isTagged {
		return "", "", errors.New("image has no tag: " + normalizedRef.String())
	}
	host := strings.TrimSpace(c.ManifestHost)
	if host == "" {
		resolver := c.ResolveHost
		if resolver == nil {
			resolver = DefaultRegistryHost
		}
		host, err = resolver(taggedRef.Name())
		if err != nil {
			return "", "", err
		}
	}
	u := url.URL{
		Scheme: "https",
		Host:   host,
		Path:   fmt.Sprintf("/v2/%s/manifests/%s", ref.Path(taggedRef), taggedRef.Tag()),
	}
	return u.String(), taggedRef.Name(), nil
}

// FetchManifestDigest 用 HEAD 请求获取 manifest 的 Docker-Content-Digest。
// HEAD 请求不计入 Docker Hub 的拉取限额，适合做"是否有变化"的低成本探测。
func (c RegistryChecker) FetchManifestDigest(ctx context.Context, manifestURL string, token string) (string, error) {
	client := c.Client
	if client == nil {
		client = defaultRegistryHTTPClient()
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodHead, manifestURL, nil)
	if err != nil {
		return "", err
	}
	if token != "" {
		req.Header.Set("Authorization", token)
	}
	for _, accept := range registryManifestAccepts() {
		req.Header.Add("Accept", accept)
	}
	res, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return "", fmt.Errorf("registry responded to head request with %q", res.Status)
	}
	return res.Header.Get(ContentDigestHeader), nil
}

func (c RegistryChecker) FetchManifest(ctx context.Context, manifestURL string, token string) (digest string, body []byte, err error) {
	client := c.Client
	if client == nil {
		client = defaultRegistryHTTPClient()
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, manifestURL, nil)
	if err != nil {
		return "", nil, err
	}
	if token != "" {
		req.Header.Set("Authorization", token)
	}
	for _, accept := range registryManifestAccepts() {
		req.Header.Add("Accept", accept)
	}
	res, err := client.Do(req)
	if err != nil {
		return "", nil, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		wwwAuthHeader := res.Header.Get("www-authenticate")
		if wwwAuthHeader == "" {
			wwwAuthHeader = "not present"
		}
		return "", nil, fmt.Errorf("registry responded with %q, auth: %q", res.Status, wwwAuthHeader)
	}
	body, err = io.ReadAll(res.Body)
	if err != nil {
		return "", nil, err
	}
	return res.Header.Get(ContentDigestHeader), body, nil
}

func registryManifestAccepts() []string {
	return []string{
		"application/vnd.docker.distribution.manifest.v2+json",
		"application/vnd.docker.distribution.manifest.list.v2+json",
		"application/vnd.docker.distribution.manifest.v1+json",
		"application/vnd.oci.image.index.v1+json",
		"application/vnd.oci.image.manifest.v1+json",
	}
}

// splitImageRef 用标准镜像引用语法拆分 repo 与 tag。
// 相比按第一个冒号切分：无 tag 时补默认 latest（docker run nginx），
// 带端口的私有仓库（registry.example.com:5000/app:v1）不会被切错，
// digest 固定引用（repo@sha256:...）视为不支持检测。
func splitImageRef(imageRef string) (string, string, bool) {
	trimmed := strings.TrimSpace(imageRef)
	if trimmed == "" {
		return "", "", false
	}
	named, err := ref.ParseDockerRef(trimmed)
	if err != nil {
		return trimmed, "", false
	}
	tagged, isTagged := named.(ref.NamedTagged)
	if !isTagged {
		return ref.FamiliarName(named), "", false
	}
	return ref.FamiliarName(named), tagged.Tag(), true
}

// repoFromImageRef 提取镜像引用中的 repo 部分（不含 tag/digest）。
func repoFromImageRef(imageRef string) string {
	if named, err := ref.ParseDockerRef(strings.TrimSpace(imageRef)); err == nil {
		return ref.FamiliarName(named)
	}
	return strings.Split(imageRef, ":")[0]
}

// localDigestsContain 判断本地 RepoDigests 中同仓库的条目是否已包含远端 digest。
func localDigestsContain(imageRef string, remoteDigest string, localRepoDigests []string) bool {
	if remoteDigest == "" {
		return false
	}
	remoteRepo := repoFromImageRef(imageRef)
	for _, localRepoDigest := range localRepoDigests {
		parts := strings.Split(localRepoDigest, "@")
		if len(parts) != 2 {
			continue
		}
		if normalizeRepoName(parts[0]) != normalizeRepoName(remoteRepo) {
			continue
		}
		if parts[1] == remoteDigest {
			return true
		}
	}
	return false
}

func selectPlatformDigest(body []byte, platform Platform) string {
	var index manifestIndex
	if len(body) == 0 || json.Unmarshal(body, &index) != nil || len(index.Manifests) == 0 {
		return ""
	}
	wantOS := firstNonEmptyString(platform.OS, runtime.GOOS)
	wantArch := firstNonEmptyString(platform.Architecture, runtime.GOARCH)
	for _, item := range index.Manifests {
		if item.Digest == "" {
			continue
		}
		if item.Platform.OS != wantOS || item.Platform.Architecture != wantArch {
			continue
		}
		if platform.Variant != "" && item.Platform.Variant != "" && item.Platform.Variant != platform.Variant {
			continue
		}
		return item.Digest
	}
	return ""
}

func compareRemoteDigestsWithLocalRepoDigests(imageRef string, remoteIndexDigest string, remotePlatformDigest string, localRepoDigests []string) bool {
	return CompareRemoteDigestsForLegacy(imageRef, remoteIndexDigest, remotePlatformDigest, localRepoDigests)
}

func CompareRemoteDigestsForLegacy(imageRef string, remoteIndexDigest string, remotePlatformDigest string, localRepoDigests []string) bool {
	if len(localRepoDigests) == 0 {
		return false
	}
	remoteRepo := repoFromImageRef(imageRef)
	matchedRepo := false
	hasRemoteDigest := remoteIndexDigest != "" || remotePlatformDigest != ""
	if !hasRemoteDigest {
		return false
	}
	remoteDigests := map[string]struct{}{}
	if remoteIndexDigest != "" {
		remoteDigests[remoteIndexDigest] = struct{}{}
	}
	if remotePlatformDigest != "" {
		remoteDigests[remotePlatformDigest] = struct{}{}
	}

	for _, localRepoDigest := range localRepoDigests {
		parts := strings.Split(localRepoDigest, "@")
		if len(parts) != 2 {
			continue
		}
		localRepo, localDigest := parts[0], parts[1]
		if normalizeRepoName(localRepo) != normalizeRepoName(remoteRepo) {
			continue
		}
		matchedRepo = true
		if _, ok := remoteDigests[localDigest]; ok {
			return false
		}
	}
	return matchedRepo
}

func normalizeRepoName(repo string) string {
	repo = strings.TrimPrefix(repo, "registry-1.docker.io/")
	repo = strings.TrimPrefix(repo, "docker.io/")
	repo = strings.TrimPrefix(repo, "library/")
	return repo
}

func firstNonEmptyString(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}
