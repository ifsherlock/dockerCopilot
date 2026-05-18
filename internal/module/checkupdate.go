package module

import (
	"crypto/tls"
	"errors"
	"fmt"
	ref "github.com/distribution/reference"
	"github.com/onlyLTY/dockerCopilot/internal/types"
	"github.com/zeromicro/go-zero/core/logx"
	"io"
	"net"
	"net/http"
	url2 "net/url"
	"strings"
	"time"
)

// ImageCheckList 检查更新处理后的镜像列表
type ImageCheckList struct {
	NeedUpdate bool
}
type ImageUpdateData struct {
	Data map[string]ImageCheckList
}

const ContentDigestHeader = "Docker-Content-Digest"

func NewImageCheck() *ImageUpdateData {
	return &ImageUpdateData{
		Data: map[string]ImageCheckList{},
	}
}
func (i *ImageUpdateData) CheckUpdate(imageList []types.Image) {
	for _, image := range imageList {
		if strings.Contains(image.ImageName, "0nlylty/dockercopilot") {
			continue
		}
		i.checkSingleImage(image)
	}
}

func (i *ImageUpdateData) checkSingleImage(image types.Image) {
	needUpdate, err := CheckImageRefUpdate(image.ImageName+":"+image.ImageTag, image.RepoDigests)
	if err != nil {
		return
	}
	i.Data[image.ID] = ImageCheckList{NeedUpdate: needUpdate}
}

func CheckImageRefUpdate(imageNameAndTag string, localRepoDigests []string) (bool, error) {
	imageName, imageTag, ok := strings.Cut(imageNameAndTag, ":")
	if !ok || imageName == "" || imageTag == "" || imageTag == "None" {
		return false, nil
	}
	image := types.Image{ImageName: imageName, ImageTag: imageTag}
	token, err := GetToken(image, "")
	if err != nil {
		token = ""
	}
	digestURL, err := BuildManifestURL(image)
	if err != nil {
		return false, nil
	}
	remoteDigest, err := GetDigest(digestURL, token)
	if err != nil {
		// 私有仓库/匿名无权限/网络抖动时无法可靠检测，按“不提示更新”降级，避免刷错误日志或误报。
		return false, nil
	}
	if len(localRepoDigests) == 0 {
		// 本地构建镜像、刚被重新 tag 的镜像、或部分私有仓库镜像可能没有 RepoDigest。
		// 这种情况下不能精确比较远端 digest，也不应该刷错误日志或误判为可更新。
		return false, nil
	}
	needUpdate := false
	matchedRepo := false
	remoteRepo := strings.Split(imageNameAndTag, ":")[0]
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
		if remoteDigest != localDigest {
			if remoteDigest == "" || localDigest == "" {
				continue
			}
			needUpdate = true
		} else {
			return false, nil
		}
	}
	if !matchedRepo {
		// 运行镜像可能只有其它仓库/旧 tag 的 RepoDigest。无法可靠判断时按“不提示更新”处理，避免误报。
		return false, nil
	}
	return needUpdate, nil
}

func normalizeRepoName(repo string) string {
	repo = strings.TrimPrefix(repo, "registry-1.docker.io/")
	repo = strings.TrimPrefix(repo, "docker.io/")
	repo = strings.TrimPrefix(repo, "library/")
	return repo
}

func BuildManifestURL(image types.Image) (string, error) {
	normalizedRef, err := ref.ParseDockerRef(image.ImageName + ":" + image.ImageTag)
	if err != nil {
		return "", err
	}
	normalizedTaggedRef, isTagged := normalizedRef.(ref.NamedTagged)
	if !isTagged {
		return "", errors.New("镜像无tag" + normalizedRef.String())
	}

	host, ErrGetRegistryAddress := GetRegistryAddress(normalizedTaggedRef.Name())
	img, tag := ref.Path(normalizedTaggedRef), normalizedTaggedRef.Tag()

	if ErrGetRegistryAddress != nil {
		return "", ErrGetRegistryAddress
	}

	url := url2.URL{
		Scheme: "https",
		Host:   host,
		Path:   fmt.Sprintf("/v2/%s/manifests/%s", img, tag),
	}
	return url.String(), nil
}

func GetDigest(url string, token string) (string, error) {
	tr := &http.Transport{
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
	}
	client := &http.Client{Transport: tr}

	req, _ := http.NewRequest("HEAD", url, nil)

	if token != "" {
		req.Header.Add("Authorization", token)
	}
	req.Header.Add("Accept", "application/vnd.docker.distribution.manifest.v2+json")
	req.Header.Add("Accept", "application/vnd.docker.distribution.manifest.list.v2+json")
	req.Header.Add("Accept", "application/vnd.docker.distribution.manifest.v1+json")
	req.Header.Add("Accept", "application/vnd.oci.image.index.v1+json")

	res, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer func(Body io.ReadCloser) {
		err := Body.Close()
		if err != nil {
			logx.Error("GetDigest关闭body失败" + err.Error())
		}
	}(res.Body)

	if res.StatusCode != 200 {
		wwwAuthHeader := res.Header.Get("www-authenticate")
		if wwwAuthHeader == "" {
			wwwAuthHeader = "not present"
		}
		return "", fmt.Errorf("registry responded to head request with %q, auth: %q", res.Status, wwwAuthHeader)
	}
	return res.Header.Get(ContentDigestHeader), nil
}
