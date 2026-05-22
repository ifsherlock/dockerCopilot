package utiles

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/onlyLTY/dockerCopilot/internal/config"
	"github.com/zeromicro/go-zero/core/logx"
)

func GetRemoteVersion() (remoteVersion string, err error) {
	githubProxy := os.Getenv("githubProxy")
	if githubProxy != "" {
		githubProxy = strings.TrimRight(githubProxy, "/") + "/"
	}
	versionURL := os.Getenv("remoteVersionURL")
	if versionURL == "" {
		versionURL = githubProxy + "https://raw.githubusercontent.com/ifsherlock/dockerCopilot/latest/version"
	} else if githubProxy != "" && strings.HasPrefix(versionURL, "https://") {
		versionURL = githubProxy + versionURL
	}
	remoteVersion, err = fetchVersionFromURL(versionURL)
	if err != nil {
		return "0.0.0", err
	}

	localVersion := config.Version
	if strings.Contains(localVersion, "FNOS") {
		logx.Infof("飞牛版本，无需在线更新")
		return localVersion, nil
	}
	if normalizeVersion(localVersion) == normalizeVersion(remoteVersion) {
		logx.Info("版本一致:", localVersion)
		return localVersion, nil
	}

	logx.Infof("版本不一致! 本地: %s, 远程: %s\n", localVersion, remoteVersion)
	return remoteVersion, nil

}

func fetchVersionFromURL(url string) (string, error) {
	client := &http.Client{
		Timeout: 10 * time.Second,
		Transport: &http.Transport{
			Proxy: http.ProxyFromEnvironment,
		},
	}

	var lastErr error
	for i := 0; i < 3; i++ {
		resp, err := client.Get(url)
		if err != nil {
			lastErr = err
			time.Sleep(time.Duration(i+1) * 300 * time.Millisecond)
			continue
		}

		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			_ = resp.Body.Close()
			lastErr = fmt.Errorf("fetch version failed, HTTP %d", resp.StatusCode)
			time.Sleep(time.Duration(i+1) * 300 * time.Millisecond)
			continue
		}

		versionData, err := io.ReadAll(resp.Body)
		_ = resp.Body.Close()
		if err != nil {
			lastErr = err
			time.Sleep(time.Duration(i+1) * 300 * time.Millisecond)
			continue
		}

		v := strings.TrimSpace(string(versionData))
		if v == "" {
			lastErr = fmt.Errorf("remote version is empty")
			time.Sleep(time.Duration(i+1) * 300 * time.Millisecond)
			continue
		}
		return v, nil
	}
	return "", lastErr
}

func normalizeVersion(version string) string {
	version = strings.TrimSpace(version)
	version = strings.TrimPrefix(version, "v")
	version = strings.TrimPrefix(version, "V")
	return version
}

func CompareVersions(a, b string) int {
	a = normalizeVersion(a)
	b = normalizeVersion(b)
	if a == b {
		return 0
	}
	ap := strings.Split(a, ".")
	bp := strings.Split(b, ".")
	maxLen := len(ap)
	if len(bp) > maxLen {
		maxLen = len(bp)
	}
	for i := 0; i < maxLen; i++ {
		ai := 0
		bi := 0
		if i < len(ap) {
			fmt.Sscanf(ap[i], "%d", &ai)
		}
		if i < len(bp) {
			fmt.Sscanf(bp[i], "%d", &bi)
		}
		if ai > bi {
			return 1
		}
		if ai < bi {
			return -1
		}
	}
	if a > b {
		return 1
	}
	if a < b {
		return -1
	}
	return 0
}
