package telegram

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"sync"
	"time"

	jwt "github.com/golang-jwt/jwt"
	"github.com/onlyLTY/dockerCopilot/internal/domain/runtimeconfig"
)

type instanceConfig struct {
	Name      string `json:"name"`
	APIURL    string `json:"api_url"`
	SecretKey string `json:"secret_key"`
	Timeout   int    `json:"timeout"`
	Local     bool   `json:"local,omitempty"`
}

type remoteContainer struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	UsingImage  string `json:"usingImage"`
	CreateImage string `json:"createImage"`
	Status      string `json:"status"`
	HaveUpdate  bool   `json:"haveUpdate"`
	IsSelf      bool   `json:"isSelf"`
}

type remoteImage struct {
	ID               string `json:"id"`
	Name             string `json:"name"`
	Tag              string `json:"tag"`
	Size             string `json:"size"`
	CreateTime       string `json:"createTime"`
	InUsed           bool   `json:"inUsed"`
	UsageState       string `json:"usageState"`
	CleanupCandidate bool   `json:"cleanupCandidate"`
	CleanupReason    string `json:"cleanupReason"`
	MultiRef         bool   `json:"multiRef"`
}

type remoteResp struct {
	Code int             `json:"code"`
	Msg  string          `json:"msg"`
	Data json.RawMessage `json:"data"`
}

type remoteClient struct {
	cfg        instanceConfig
	httpClient *http.Client
	mu         sync.Mutex
	token      string
	tokenExp   int64
}

func newRemoteClient(cfg instanceConfig) *remoteClient {
	transport := &http.Transport{
		Proxy: nil,
		DialContext: (&net.Dialer{
			Timeout:   30 * time.Second,
			KeepAlive: 30 * time.Second,
		}).DialContext,
	}
	timeout := time.Duration(cfg.Timeout) * time.Second
	if timeout <= 0 {
		timeout = 30 * time.Second
	}
	return &remoteClient{
		cfg: cfg,
		httpClient: &http.Client{
			Timeout:   timeout,
			Transport: transport,
		},
	}
}

func (c *remoteClient) bearerToken(forceNew bool) (string, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	now := time.Now().Unix()
	if !forceNew && c.token != "" && now < c.tokenExp-300 {
		return c.token, nil
	}
	claims := jwt.MapClaims{
		"exp": now + 28*24*60*60,
		"iat": now - 300,
	}
	token := jwt.New(jwt.SigningMethodHS256)
	token.Claims = claims
	signed, err := token.SignedString([]byte(c.cfg.SecretKey))
	if err != nil {
		return "", err
	}
	c.token = "Bearer " + signed
	c.tokenExp = now + 28*24*60*60
	return c.token, nil
}

func (c *remoteClient) request(ctx context.Context, method string, path string, query url.Values, body interface{}) (*remoteResp, error) {
	if query == nil {
		query = url.Values{}
	}
	fullURL := strings.TrimRight(c.cfg.APIURL, "/") + path
	if encoded := query.Encode(); encoded != "" {
		fullURL += "?" + encoded
	}
	var payload io.Reader
	if body != nil {
		bs, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		payload = bytes.NewReader(bs)
	}
	makeReq := func(forceNew bool) (*http.Request, error) {
		token, err := c.bearerToken(forceNew)
		if err != nil {
			return nil, err
		}
		req, err := http.NewRequestWithContext(ctx, method, fullURL, payload)
		if err != nil {
			return nil, err
		}
		req.Header.Set("Authorization", token)
		req.Header.Set("Content-Type", "application/json")
		return req, nil
	}
	doReq := func(forceNew bool) (*http.Response, error) {
		if seeker, ok := payload.(io.Seeker); ok {
			_, _ = seeker.Seek(0, io.SeekStart)
		}
		req, err := makeReq(forceNew)
		if err != nil {
			return nil, err
		}
		return c.httpClient.Do(req)
	}
	resp, err := doReq(false)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusUnauthorized {
		resp.Body.Close()
		resp, err = doReq(true)
		if err != nil {
			return nil, err
		}
		defer resp.Body.Close()
	}
	bs, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("%s", strings.TrimSpace(string(bs)))
	}
	var out remoteResp
	if err := json.Unmarshal(bs, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

func (c *remoteClient) containers(ctx context.Context) ([]remoteContainer, error) {
	resp, err := c.request(ctx, http.MethodGet, "/api/containers", nil, nil)
	if err != nil {
		return nil, err
	}
	if !remoteOK(resp.Code) {
		return nil, fmt.Errorf(resp.Msg)
	}
	var items []remoteContainer
	if err := json.Unmarshal(resp.Data, &items); err != nil {
		return nil, err
	}
	sort.Slice(items, func(i, j int) bool { return strings.ToLower(items[i].Name) < strings.ToLower(items[j].Name) })
	return items, nil
}

func remoteOK(code int) bool {
	return code == 0 || code == 200
}

func (c *remoteClient) images(ctx context.Context) ([]remoteImage, error) {
	resp, err := c.request(ctx, http.MethodGet, "/api/images", nil, nil)
	if err != nil {
		return nil, err
	}
	if resp.Code != 200 {
		return nil, fmt.Errorf(resp.Msg)
	}
	var items []remoteImage
	if err := json.Unmarshal(resp.Data, &items); err != nil {
		return nil, err
	}
	return items, nil
}

func (c *remoteClient) backups(ctx context.Context) ([]string, error) {
	resp, err := c.request(ctx, http.MethodGet, "/api/container/listBackups", nil, nil)
	if err != nil {
		return nil, err
	}
	if resp.Code != 200 {
		return nil, fmt.Errorf(resp.Msg)
	}
	var items []string
	if err := json.Unmarshal(resp.Data, &items); err != nil {
		return nil, err
	}
	return items, nil
}

func (c *remoteClient) version(ctx context.Context, versionType string) (map[string]string, string, error) {
	resp, err := c.request(ctx, http.MethodGet, "/api/version", url.Values{"type": []string{versionType}}, nil)
	if err != nil {
		return nil, "", err
	}
	if resp.Code != 200 {
		return nil, resp.Msg, fmt.Errorf(resp.Msg)
	}
	var data map[string]string
	if err := json.Unmarshal(resp.Data, &data); err != nil {
		return nil, resp.Msg, err
	}
	return data, resp.Msg, nil
}

func (c *remoteClient) progress(ctx context.Context, taskID string) (map[string]interface{}, error) {
	resp, err := c.request(ctx, http.MethodGet, "/api/progress/"+taskID, nil, nil)
	if err != nil {
		return nil, err
	}
	var data map[string]interface{}
	if len(resp.Data) > 0 {
		if err := json.Unmarshal(resp.Data, &data); err != nil {
			return nil, err
		}
		return data, nil
	}
	return map[string]interface{}{"msg": resp.Msg}, nil
}

func (c *remoteClient) renameContainer(ctx context.Context, id string, newName string) error {
	resp, err := c.request(ctx, http.MethodPost, "/api/container/"+id+"/rename", url.Values{"newName": []string{newName}}, nil)
	if err != nil {
		return err
	}
	if resp.Code != 200 {
		return fmt.Errorf(resp.Msg)
	}
	return nil
}

func (c *remoteClient) simpleAction(ctx context.Context, method string, path string, query url.Values, body interface{}) (map[string]interface{}, error) {
	resp, err := c.request(ctx, method, path, query, body)
	if err != nil {
		return nil, err
	}
	if resp.Code != 200 {
		return nil, fmt.Errorf(resp.Msg)
	}
	if len(resp.Data) == 0 {
		return map[string]interface{}{}, nil
	}
	var data map[string]interface{}
	if err := json.Unmarshal(resp.Data, &data); err != nil {
		return map[string]interface{}{}, nil
	}
	return data, nil
}

func (c *remoteClient) configPath() string {
	return runtimeconfig.EnvPath()
}
