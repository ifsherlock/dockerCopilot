package utiles

import (
	"archive/tar"
	"compress/gzip"
	"fmt"
	"github.com/onlyLTY/dockerCopilot/internal/config"
	"github.com/onlyLTY/dockerCopilot/internal/svc"
	"github.com/zeromicro/go-zero/core/logx"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

func UpdateProgram(ctx *svc.ServiceContext) error {
	githubProxy := os.Getenv("githubProxy")
	if githubProxy != "" {
		githubProxy = strings.TrimRight(githubProxy, "/") + "/"
	}
	versionURL := githubProxy + "https://raw.githubusercontent.com/ifsherlock/dockerCopilot/latest/version"
	releaseBaseURL := githubProxy + "https://github.com/ifsherlock/dockerCopilot/releases/download"
	logx.Infof("versionURL: %s", versionURL)

	resp, err := http.Get(versionURL)
	if err != nil {
		return fmt.Errorf("获取最新版本失败: %w", err)
	}
	defer func(Body io.ReadCloser) {
		err := Body.Close()
		if err != nil {
			logx.Error("关闭resp.Body失败:", err)
		}
	}(resp.Body)

	versionData, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("读取最新版本失败: %w", err)
	}

	remoteVersion := strings.TrimSpace(string(versionData))
	localVersion := strings.TrimSpace(config.Version)
	logx.Infof("remoteVersion: %s, localVersion: %s", remoteVersion, localVersion)
	if normalizeVersion(remoteVersion) == normalizeVersion(localVersion) {
		logx.Info("当前已是最新版本，无需自更新")
		return nil
	}

	downloadURL := fmt.Sprintf("%s/%s/dockerCopilot-%s.tar.gz", releaseBaseURL, remoteVersion, runtime.GOARCH)
	logx.Info("下载链接：", downloadURL)

	workDir := os.Getenv("WORKDIR")
	if workDir == "" {
		workDir = "."
	}
	archivePath := filepath.Join(workDir, "dockerCopilot.tar.gz")
	stagedBinaryPath := filepath.Join(workDir, "dockerCopilot-new")
	tempExtractDir := filepath.Join(workDir, ".dockercopilot-update")
	_ = os.RemoveAll(tempExtractDir)
	if err := os.MkdirAll(tempExtractDir, 0755); err != nil {
		return fmt.Errorf("创建更新临时目录失败: %w", err)
	}
	defer os.RemoveAll(tempExtractDir)

	if err := downloadFile(downloadURL, archivePath); err != nil {
		logx.Error("下载失败:", err)
		return err
	}
	logx.Info("下载成功")

	if err := decompressTarGz(archivePath, tempExtractDir); err != nil {
		logx.Info("解压缩失败:", err)
		return err
	}
	logx.Info("解压缩成功")

	extractedBinaryPath := filepath.Join(tempExtractDir, "dist", "linux", runtime.GOARCH, "dockerCopilot-new")
	if _, err := os.Stat(extractedBinaryPath); err != nil {
		return fmt.Errorf("未找到解压后的新二进制: %s", extractedBinaryPath)
	}

	if err := copyFile(extractedBinaryPath, stagedBinaryPath, 0755); err != nil {
		return fmt.Errorf("写入新二进制失败: %w", err)
	}
	logx.Infof("已写入待切换新二进制: %s", stagedBinaryPath)
	return nil
}

func downloadFile(url string, dest string) error {
	resp, err := http.Get(url)
	if err != nil {
		return err
	}
	defer func(Body io.ReadCloser) {
		err := Body.Close()
		if err != nil {
			logx.Error("关闭resp.Body失败:", err)
		}
	}(resp.Body)

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("下载失败，HTTP %d", resp.StatusCode)
	}

	out, err := os.Create(dest)
	if err != nil {
		return err
	}
	defer func(out *os.File) {
		err := out.Close()
		if err != nil {
			logx.Error("关闭out失败:", err)
		}
	}(out)

	_, err = io.Copy(out, resp.Body)
	return err
}

func decompressTarGz(gzFilePath string, dest string) error {
	file, err := os.Open(gzFilePath)
	if err != nil {
		return err
	}
	defer func(file *os.File) {
		err := file.Close()
		if err != nil {
			logx.Error("关闭file失败:", err)
		}
	}(file)

	gzr, err := gzip.NewReader(file)
	if err != nil {
		return err
	}
	defer func(gzr *gzip.Reader) {
		err := gzr.Close()
		if err != nil {
			logx.Error("关闭gzr失败:", err)
		}
	}(gzr)

	tarReader := tar.NewReader(gzr)

	for {
		header, err := tarReader.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return err
		}

		target := filepath.Join(dest, header.Name)

		switch header.Typeflag {
		case tar.TypeDir:
			if err := os.MkdirAll(target, os.FileMode(header.Mode)); err != nil {
				return err
			}
		case tar.TypeReg:
			if err := os.MkdirAll(filepath.Dir(target), 0755); err != nil {
				return err
			}
			outFile, err := os.OpenFile(target, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, os.FileMode(header.Mode))
			if err != nil {
				return err
			}
			if _, err := io.Copy(outFile, tarReader); err != nil {
				_ = outFile.Close()
				return err
			}
			if err = outFile.Close(); err != nil {
				return err
			}
		default:
			return fmt.Errorf("未知类型: %v in %s", header.Typeflag, header.Name)
		}
	}

	return nil
}

func copyFile(src, dst string, perm os.FileMode) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	out, err := os.OpenFile(dst, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, perm)
	if err != nil {
		return err
	}
	defer out.Close()

	if _, err := io.Copy(out, in); err != nil {
		return err
	}
	return out.Chmod(perm)
}
