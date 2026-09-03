package instanceproxy

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	jwt "github.com/golang-jwt/jwt"
	"github.com/onlyLTY/dockerCopilot/internal/domain/runtimeconfig"
	"github.com/onlyLTY/dockerCopilot/internal/svc"
)

type Instance struct {
	Name      string `json:"name"`
	APIURL    string `json:"apiUrl"`
	Local     bool   `json:"local"`
	Timeout   int    `json:"timeout"`
	SecretKey string `json:"-"`
}

type ListResult struct {
	Enabled         bool       `json:"enabled"`
	DefaultInstance string     `json:"defaultInstance"`
	Instances       []Instance `json:"instances"`
}

func List(svcCtx *svc.ServiceContext) (ListResult, error) {
	cfg, err := runtimeconfig.NewStore("", svcCtx.Config.Auth.AccessSecret).Read()
	if err != nil {
		return ListResult{}, err
	}
	instances := parseInstances(cfg.Dockercopilot["instances"])
	if len(instances) == 0 {
		instances = []Instance{{Name: "local", APIURL: "http://127.0.0.1:12712", Local: true, Timeout: 30}}
	}
	hasLocal := false
	for i := range instances {
		if strings.EqualFold(instances[i].Name, "local") {
			instances[i].Name = "local"
			instances[i].Local = true
			hasLocal = true
		}
	}
	if !hasLocal {
		instances = append([]Instance{{Name: "local", APIURL: "http://127.0.0.1:12712", Local: true, Timeout: 30}}, instances...)
	}
	defaultInstance := strings.TrimSpace(svc.AsString(cfg.Dockercopilot["default_instance"], "local"))
	if !contains(instances, defaultInstance) {
		defaultInstance = "local"
	}
	return ListResult{
		Enabled:         svc.AsBool(cfg.Dockercopilot["multi_instance_enabled"]),
		DefaultInstance: defaultInstance,
		Instances:       instances,
	}, nil
}

func Proxy(ctx context.Context, svcCtx *svc.ServiceContext, instanceName string, method string, path string, query url.Values, headers http.Header, body io.Reader) (*http.Response, error) {
	list, err := List(svcCtx)
	if err != nil {
		return nil, err
	}
	if !list.Enabled {
		return nil, fmt.Errorf("多实例功能未启用")
	}
	instance, ok := find(list.Instances, instanceName)
	if !ok {
		return nil, fmt.Errorf("实例不存在: %s", instanceName)
	}
	if instance.Local {
		return nil, fmt.Errorf("本地实例请使用本地 API")
	}
	base, err := url.Parse(strings.TrimRight(instance.APIURL, "/"))
	if err != nil || (base.Scheme != "http" && base.Scheme != "https") || base.Host == "" {
		return nil, fmt.Errorf("实例 %s 的 API 地址无效", instance.Name)
	}
	target, err := url.Parse(strings.TrimLeft(path, "/"))
	if err != nil {
		return nil, err
	}
	base.Path = strings.TrimRight(base.Path, "/") + "/"
	targetURL := base.ResolveReference(target)
	targetURL.RawQuery = query.Encode()
	req, err := http.NewRequestWithContext(ctx, method, targetURL.String(), body)
	if err != nil {
		return nil, err
	}
	for _, name := range []string{"Content-Type", "Accept"} {
		if value := headers.Get(name); value != "" {
			req.Header.Set(name, value)
		}
	}
	token, err := signToken(instance.SecretKey)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	timeout := time.Duration(instance.Timeout) * time.Second
	if timeout <= 0 {
		timeout = 30 * time.Second
	}
	return (&http.Client{Timeout: timeout}).Do(req)
}

func parseInstances(raw interface{}) []Instance {
	var items []map[string]interface{}
	b, _ := svc.MustJSON(raw)
	_ = svc.UnmarshalJSON(b, &items)
	result := make([]Instance, 0, len(items))
	seen := map[string]bool{}
	for _, item := range items {
		name := strings.TrimSpace(svc.AsString(item["name"], ""))
		apiURL := strings.TrimSpace(svc.AsString(item["api_url"], ""))
		key := strings.ToLower(name)
		if name == "" || apiURL == "" || seen[key] {
			continue
		}
		seen[key] = true
		result = append(result, Instance{
			Name:      name,
			APIURL:    apiURL,
			Local:     strings.EqualFold(name, "local"),
			Timeout:   svc.AsInt(item["timeout"], 30),
			SecretKey: svc.AsString(item["secret_key"], ""),
		})
	}
	return result
}

func find(instances []Instance, name string) (Instance, bool) {
	for _, instance := range instances {
		if strings.EqualFold(instance.Name, strings.TrimSpace(name)) {
			return instance, true
		}
	}
	return Instance{}, false
}

func contains(instances []Instance, name string) bool {
	_, ok := find(instances, name)
	return ok
}

func signToken(secret string) (string, error) {
	if strings.TrimSpace(secret) == "" {
		return "", fmt.Errorf("远端实例未配置密钥")
	}
	now := time.Now().Unix()
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"exp": now + 3600,
		"iat": now - 300,
	})
	return token.SignedString([]byte(secret))
}
