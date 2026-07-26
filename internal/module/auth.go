package module

import (
	"encoding/json"
	"errors"
	"fmt"
	ref "github.com/distribution/reference"
	"github.com/onlyLTY/dockerCopilot/internal/domain/runtimeconfig"
	"github.com/onlyLTY/dockerCopilot/internal/types"
	"github.com/zeromicro/go-zero/core/logx"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

const ChallengeHeader = "WWW-Authenticate"
const (
	DefaultRegistryDomain = "docker.io"
	DefaultRegistryHost   = "index.docker.io"
)

var DefaultAcceleratorHostList = []string{"docker.1ms.run", "docker.m.daocloud.io",
	"docker.1panel.top", "docker.1panel.live", "proxy.1panel.live", "dockerproxy.1panel.live", "docker.1panel.dev",
	"docker.anye.in", "hub.rat.dev", "docker.amingg.com"}

func GetToken(image types.Image, registryAuth string) (string, error) {
	normalizedRef, err := ref.ParseNormalizedNamed(image.ImageName)
	if err != nil {
		return "", err
	}

	URL := GetChallengeURL(normalizedRef)

	var req *http.Request
	if req, err = GetChallengeRequest(URL); err != nil {
		return "", err
	}

	client := &http.Client{}
	var res *http.Response
	if res, err = client.Do(req); err != nil {
		return "", err
	}
	defer func(Body io.ReadCloser) {
		err := Body.Close()
		if err != nil {
			logx.Error("GetToken关闭Body失败" + err.Error())
		}
	}(res.Body)
	v := res.Header.Get(ChallengeHeader)

	challenge := strings.ToLower(v)
	if strings.HasPrefix(challenge, "basic") {
		if registryAuth == "" {
			return "", fmt.Errorf("no credentials available")
		}

		return fmt.Sprintf("Basic %s", registryAuth), nil
	}
	if strings.HasPrefix(challenge, "bearer") {
		return GetBearerHeader(challenge, normalizedRef, registryAuth)
	}

	return "", errors.New("unsupported challenge type from registry")
}

func GetChallengeRequest(URL url.URL) (*http.Request, error) {
	req, err := http.NewRequest("GET", URL.String(), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "*/*")
	req.Header.Set("User-Agent", "Watchtower (Docker)")
	return req, nil
}

func GetBearerHeader(challenge string, imageRef ref.Named, registryAuth string) (string, error) {
	client := http.Client{}
	authURL, err := GetAuthURL(challenge, imageRef)

	if err != nil {
		return "", err
	}

	var r *http.Request
	if r, err = http.NewRequest("GET", authURL.String(), nil); err != nil {
		return "", err
	}

	if registryAuth != "" {
		logx.Info("私有镜像，无法获取是否有更新")
		r.Header.Add("Authorization", fmt.Sprintf("Basic %s", registryAuth))
	}

	var authResponse *http.Response
	if authResponse, err = client.Do(r); err != nil {
		return "", err
	}

	body, _ := io.ReadAll(authResponse.Body)
	tokenResponse := &types.TokenResponse{}

	err = json.Unmarshal(body, tokenResponse)
	if err != nil {
		return "", err
	}

	return fmt.Sprintf("Bearer %s", tokenResponse.Token), nil
}

func GetAuthURL(challenge string, imageRef ref.Named) (*url.URL, error) {
	loweredChallenge := strings.ToLower(challenge)
	raw := strings.TrimPrefix(loweredChallenge, "bearer")

	pairs := strings.Split(raw, ",")
	values := make(map[string]string, len(pairs))

	for _, pair := range pairs {
		trimmed := strings.Trim(pair, " ")
		if key, val, ok := strings.Cut(trimmed, "="); ok {
			values[key] = strings.Trim(val, `"`)
		}
	}
	if values["realm"] == "" || values["service"] == "" {

		return nil, fmt.Errorf("challenge header did not include all values needed to construct an auth url")
	}

	authURL, _ := url.Parse(values["realm"])
	q := authURL.Query()
	q.Add("service", values["service"])

	scopeImage := ref.Path(imageRef)

	scope := fmt.Sprintf("repository:%s:pull", scopeImage)
	q.Add("scope", scope)

	authURL.RawQuery = q.Encode()
	return authURL, nil
}

func GetChallengeURL(imageRef ref.Named) url.URL {
	host, _ := GetRegistryAddress(imageRef.Name())

	URL := url.URL{
		Scheme: "https",
		Host:   host,
		Path:   "/v2/",
	}
	return URL
}

func GetRegistryAddress(imageRef string) (string, error) {
	normalizedRef, err := ref.ParseNormalizedNamed(imageRef)
	if err != nil {
		return "", err
	}

	address := ref.Domain(normalizedRef)

	if address == DefaultRegistryDomain {
		address = resolveDockerIOHost()
	}
	return address, nil
}

var (
	dockerIOHostMu      sync.Mutex
	dockerIOHostCached  string
	dockerIOHostExpires time.Time
)

// resolveDockerIOHost 返回 docker.io 实际使用的 registry 地址：
// 依次探测官方源 → 用户在「加速拉取」页配置的加速源 → 内置加速器列表，
// 取第一个可达的。探测结果缓存 10 分钟，避免批量检测时逐镜像重复探测
// （官方源被墙时每次探测都要等满 5 秒超时），同时保证同一轮检测里
// token 获取与 manifest 请求落在同一个 host 上。
func resolveDockerIOHost() string {
	dockerIOHostMu.Lock()
	if dockerIOHostCached != "" && time.Now().Before(dockerIOHostExpires) {
		host := dockerIOHostCached
		dockerIOHostMu.Unlock()
		return host
	}
	dockerIOHostMu.Unlock()

	address := DefaultRegistryHost
	for _, host := range dockerIOHostCandidates(userConfiguredAccelerators()) {
		if checkHost(host) {
			address = host
			break
		}
	}

	dockerIOHostMu.Lock()
	dockerIOHostCached = address
	dockerIOHostExpires = time.Now().Add(10 * time.Minute)
	dockerIOHostMu.Unlock()
	return address
}

// dockerIOHostCandidates 生成 docker.io 的候选 host 列表：
// 官方源优先，其次用户配置的加速源，最后内置加速器，去重。
// 用户输入可能带 scheme / 末尾斜杠，清洗后只保留纯 host；
// docker.io 等官方别名归一为官方源，带路径的条目无法用作 registry host，丢弃。
func dockerIOHostCandidates(userSources []string) []string {
	candidates := []string{DefaultRegistryHost}
	seen := map[string]struct{}{DefaultRegistryHost: {}}
	appendHost := func(raw string) {
		host := strings.TrimSpace(raw)
		host = strings.TrimPrefix(host, "https://")
		host = strings.TrimPrefix(host, "http://")
		host = strings.Trim(host, "/")
		switch host {
		case "docker.io", "registry-1.docker.io", "www.docker.io":
			host = DefaultRegistryHost
		}
		if host == "" || strings.Contains(host, "/") {
			return
		}
		if _, ok := seen[host]; ok {
			return
		}
		seen[host] = struct{}{}
		candidates = append(candidates, host)
	}
	for _, source := range userSources {
		appendHost(source)
	}
	for _, source := range DefaultAcceleratorHostList {
		appendHost(source)
	}
	return candidates
}

// userConfiguredAccelerators 读取「加速拉取」页保存的自定义加速源列表。
func userConfiguredAccelerators() []string {
	cfg, err := runtimeconfig.NewStore("", "").Read()
	if err != nil {
		return nil
	}
	return toStringList(cfg.Telegram["image_accelerators"])
}

func toStringList(v interface{}) []string {
	out := []string{}
	switch t := v.(type) {
	case []string:
		for _, item := range t {
			if s := strings.TrimSpace(item); s != "" {
				out = append(out, s)
			}
		}
	case []interface{}:
		for _, item := range t {
			if s, ok := item.(string); ok && strings.TrimSpace(s) != "" {
				out = append(out, strings.TrimSpace(s))
			}
		}
	case string:
		for _, item := range strings.FieldsFunc(t, func(r rune) bool { return r == ',' || r == '\n' || r == '\r' || r == ';' }) {
			if s := strings.TrimSpace(item); s != "" {
				out = append(out, s)
			}
		}
	}
	return out
}

func checkHost(host string) bool {
	URL := "https://" + host + "/v2/"
	// 创建带有超时设置的 http.Client。
	// 不跟随重定向：真正的 registry 对 /v2/ 直接回 200/401，
	// 跳转到官网首页之类的域名（如 docker.io）不能当作可用源。
	client := http.Client{
		Timeout: 5 * time.Second,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
	// 发送 HEAD 请求
	resp, err := client.Get(URL)
	if err != nil {
		logx.Errorf("Failed to connect to %s: %s", URL, err)
		return false
	}
	defer func(Body io.ReadCloser) {
		err := Body.Close()
		if err != nil {
			logx.Errorf("关闭body失败" + err.Error())
		}
	}(resp.Body)

	// 检查 HTTP 响应状态码
	if resp.StatusCode == http.StatusOK ||
		resp.StatusCode == http.StatusUnauthorized {
		return true
	}

	logx.Errorf("Failed to connect to %s: %s", URL, resp.Status)
	return false
}
