package automation

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	jwt "github.com/golang-jwt/jwt"
	"github.com/onlyLTY/dockerCopilot/internal/domain/botnotify"
	"github.com/onlyLTY/dockerCopilot/internal/svc"
	"github.com/zeromicro/go-zero/core/logx"
)

// remoteInstance 描述一个通过 HTTP API 访问的远端 DockerCopilot 实例。
type remoteInstance struct {
	Name      string
	APIURL    string
	SecretKey string
	Timeout   int
}

// parseRemoteInstances 从运行时配置解析远端实例（跳过 local）。
func parseRemoteInstances(v interface{}) []remoteInstance {
	items := []map[string]interface{}{}
	bs, _ := svc.MustJSON(v)
	_ = svc.UnmarshalJSON(bs, &items)
	result := make([]remoteInstance, 0, len(items))
	for _, item := range items {
		name := strings.TrimSpace(svc.AsString(item["name"], ""))
		apiURL := strings.TrimSpace(svc.AsString(item["api_url"], ""))
		if name == "" || apiURL == "" || strings.EqualFold(name, "local") {
			continue
		}
		result = append(result, remoteInstance{
			Name:      name,
			APIURL:    apiURL,
			SecretKey: svc.AsString(item["secret_key"], ""),
			Timeout:   svc.AsInt(item["timeout"], 30),
		})
	}
	return result
}

type remoteContainerInfo struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	UsingImage  string `json:"usingImage"`
	CreateImage string `json:"createImage"`
	HaveUpdate  bool   `json:"haveUpdate"`
	Ignored     bool   `json:"ignored"`
}

// fetchRemoteUpdatable 拉取远端实例的容器列表并筛选可更新且未被忽略的容器。
// 远端服务自身的容器列表接口会触发其本地检测（带冷却），因此这里天然复用远端缓存。
func fetchRemoteUpdatable(ctx context.Context, inst remoteInstance) ([]botnotify.UpdatableItem, []string, error) {
	token, err := signInstanceToken(inst.SecretKey)
	if err != nil {
		return nil, nil, err
	}
	timeout := time.Duration(inst.Timeout) * time.Second
	if timeout <= 0 {
		timeout = 30 * time.Second
	}
	client := &http.Client{Timeout: timeout}
	fullURL := strings.TrimRight(inst.APIURL, "/") + "/api/containers"
	if _, err := url.Parse(fullURL); err != nil {
		return nil, nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, fullURL, nil)
	if err != nil {
		return nil, nil, err
	}
	req.Header.Set("Authorization", token)
	resp, err := client.Do(req)
	if err != nil {
		return nil, nil, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if err != nil {
		return nil, nil, err
	}
	if resp.StatusCode != http.StatusOK {
		return nil, nil, fmt.Errorf("实例 %s 返回状态码 %d", inst.Name, resp.StatusCode)
	}
	var payload struct {
		Code int             `json:"code"`
		Msg  string          `json:"msg"`
		Data json.RawMessage `json:"data"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil, nil, err
	}
	if payload.Code != 200 {
		return nil, nil, fmt.Errorf("实例 %s 响应异常: %s", inst.Name, payload.Msg)
	}
	var containers []remoteContainerInfo
	if err := json.Unmarshal(payload.Data, &containers); err != nil {
		return nil, nil, err
	}
	items := []botnotify.UpdatableItem{}
	keys := []string{}
	for _, c := range containers {
		if !c.HaveUpdate || c.Ignored {
			continue
		}
		image := c.CreateImage
		if strings.TrimSpace(image) == "" {
			image = c.UsingImage
		}
		items = append(items, botnotify.UpdatableItem{Name: c.Name, Image: image})
		keys = append(keys, instanceKey(inst.Name, c.Name+"@"+c.ID))
	}
	return items, keys, nil
}

func signInstanceToken(secretKey string) (string, error) {
	now := time.Now().Unix()
	token := jwt.New(jwt.SigningMethodHS256)
	token.Claims = jwt.MapClaims{
		"exp": now + 60*60,
		"iat": now - 300,
	}
	signed, err := token.SignedString([]byte(secretKey))
	if err != nil {
		return "", err
	}
	return "Bearer " + signed, nil
}

func instanceKey(instance string, itemKey string) string {
	return instance + "/" + itemKey
}

// sweepRemoteInstances 扫描全部远端实例，返回每个实例的可更新项与对应去重键。
// 某个实例失败只记录日志并标记为“保留旧状态”，不影响其它实例。
func sweepRemoteInstances(ctx context.Context, cfg svc.BackupRuntimeConfig) (map[string][]botnotify.UpdatableItem, map[string][]string, []string) {
	if !svc.AsBool(cfg.Dockercopilot["multi_instance_enabled"]) {
		return nil, nil, nil
	}
	instances := parseRemoteInstances(cfg.Dockercopilot["instances"])
	if len(instances) == 0 {
		return nil, nil, nil
	}
	itemsByInstance := map[string][]botnotify.UpdatableItem{}
	keysByInstance := map[string][]string{}
	failed := []string{}
	for _, inst := range instances {
		items, keys, err := fetchRemoteUpdatable(ctx, inst)
		if err != nil {
			logx.Errorf("远端实例 %s 更新检测失败: %v", inst.Name, err)
			failed = append(failed, inst.Name)
			continue
		}
		itemsByInstance[inst.Name] = items
		keysByInstance[inst.Name] = keys
		logx.Infof("远端实例 %s 更新检测完成: updates=%d", inst.Name, len(items))
	}
	return itemsByInstance, keysByInstance, failed
}
