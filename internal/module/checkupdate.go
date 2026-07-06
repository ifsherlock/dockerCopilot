package module

import (
	"context"
	"strings"

	"github.com/onlyLTY/dockerCopilot/internal/domain/updatecheck"
	"github.com/onlyLTY/dockerCopilot/internal/types"
)

const ContentDigestHeader = "Docker-Content-Digest"

func CheckImageRefUpdate(imageNameAndTag string, localRepoDigests []string) (bool, error) {
	imageName, imageTag, ok := strings.Cut(imageNameAndTag, ":")
	if !ok || imageName == "" || imageTag == "" || imageTag == "None" {
		return false, nil
	}
	checker := updatecheck.NewRegistryChecker()
	checker.Token = func(ctx context.Context, imageName string) (string, error) {
		return GetToken(types.Image{ImageName: imageName}, "")
	}
	result, err := checker.CheckImageRef(context.Background(), imageNameAndTag, localRepoDigests)
	if err != nil {
		// 私有仓库/匿名无权限/网络抖动时无法可靠检测，按“不提示更新”降级，避免刷错误日志或误报。
		return false, nil
	}
	return result.NeedUpdate, nil
}

func compareRemoteDigestWithLocalRepoDigests(imageNameAndTag string, remoteDigest string, localRepoDigests []string) bool {
	return updatecheck.CompareRemoteDigestsForLegacy(imageNameAndTag, remoteDigest, "", localRepoDigests)
}

func BuildManifestURL(image types.Image) (string, error) {
	checker := updatecheck.NewRegistryChecker()
	checker.ResolveHost = GetRegistryAddress
	manifestURL, _, err := checker.BuildManifestURL(image.ImageName, image.ImageTag)
	return manifestURL, err
}

func GetDigest(url string, token string) (string, error) {
	checker := updatecheck.NewRegistryChecker()
	digest, _, err := checker.FetchManifest(context.Background(), url, token)
	if err != nil {
		return "", err
	}
	return digest, nil
}
