package utiles

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"debug/elf"
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
	"time"
)

type ProgramUpdateSource struct {
	ArchivePath string
	Filename    string
	Manual      bool
}

func UpdateProgram(ctx *svc.ServiceContext, taskID string) error {
	return UpdateProgramWithSource(ctx, taskID, ProgramUpdateSource{})
}

func UpdateProgramWithSource(ctx *svc.ServiceContext, taskID string, source ProgramUpdateSource) error {
	updateTask := func(percent int, msg, detail string, done bool) {
		if ctx == nil || strings.TrimSpace(taskID) == "" {
			return
		}
		ctx.UpdateProgress(taskID, svc.TaskProgress{TaskID: taskID, Percentage: percent, Message: msg, Name: "dockerCopilot", DetailMsg: detail, IsDone: done})
	}

	workDir := os.Getenv("WORKDIR")
	if workDir == "" {
		workDir = "."
	}
	stagedBinaryPath := filepath.Join(workDir, "dockerCopilot-new")
	tempExtractDir := filepath.Join(workDir, ".dockercopilot-update")
	_ = os.RemoveAll(tempExtractDir)
	if err := os.MkdirAll(tempExtractDir, 0755); err != nil {
		return fmt.Errorf("创建更新临时目录失败: %w", err)
	}
	defer os.RemoveAll(tempExtractDir)

	archivePath := source.ArchivePath
	if source.Manual {
		updateTask(10, "正在校验上传更新包...", source.Filename, false)
	} else {
		updateTask(5, "正在检查新版本...", "正在拉取远端版本信息", false)
		githubProxy := os.Getenv("githubProxy")
		if githubProxy != "" {
			githubProxy = strings.TrimRight(githubProxy, "/") + "/"
		}
		versionURL := githubProxy + "https://raw.githubusercontent.com/ifsherlock/dockerCopilot/latest/version"
		releaseBaseURL := githubProxy + "https://github.com/ifsherlock/dockerCopilot/releases/download"
		logx.Infof("versionURL: %s", versionURL)
		client := &http.Client{Timeout: 180 * time.Second}
		resp, err := client.Get(versionURL)
		if err != nil {
			return fmt.Errorf("获取最新版本失败: %w", err)
		}
		defer resp.Body.Close()
		versionData, err := io.ReadAll(resp.Body)
		if err != nil {
			return fmt.Errorf("读取最新版本失败: %w", err)
		}
		remoteVersion := strings.TrimSpace(string(versionData))
		localVersion := strings.TrimSpace(config.Version)
		logx.Infof("remoteVersion: %s, localVersion: %s", remoteVersion, localVersion)
		if normalizeVersion(remoteVersion) == normalizeVersion(localVersion) {
			updateTask(100, "当前已是最新版本", fmt.Sprintf("本地 %s 与远端 %s 一致", localVersion, remoteVersion), true)
			return nil
		}
		updateTask(20, "已发现新版本，准备下载...", fmt.Sprintf("本地 %s -> 远端 %s", localVersion, remoteVersion), false)
		downloadURL := fmt.Sprintf("%s/%s/dockerCopilot-%s.tar.gz", releaseBaseURL, remoteVersion, runtime.GOARCH)
		logx.Info("下载链接：", downloadURL)
		archivePath = filepath.Join(workDir, "dockerCopilot.tar.gz")
		updateTask(35, "正在下载更新包...", "下载发布资产中", false)
		if err := downloadFile(client, downloadURL, archivePath); err != nil {
			return err
		}
	}

	if strings.TrimSpace(archivePath) == "" {
		return fmt.Errorf("更新包路径为空")
	}
	updateTask(60, "正在校验并解压更新包...", "正在处理压缩包", false)
	extractedBinaryPath, err := extractUploadedOrReleaseBinary(archivePath, tempExtractDir)
	if err != nil {
		return err
	}
	if err := validateBinaryArch(extractedBinaryPath); err != nil {
		return err
	}
	if err := validateBinaryRuntimeCompatibility(extractedBinaryPath); err != nil {
		return err
	}

	updateTask(80, "正在替换程序文件...", "写入新二进制文件", false)
	if err := copyFile(extractedBinaryPath, stagedBinaryPath, 0755); err != nil {
		return fmt.Errorf("写入新二进制失败: %w", err)
	}
	logx.Infof("已写入待切换新二进制: %s", stagedBinaryPath)
	updateTask(100, "更新包已就绪，正在重启服务...", "新版本已准备完成，准备自动重启", true)
	return nil
}

func extractUploadedOrReleaseBinary(path string, dest string) (string, error) {
	name := strings.ToLower(filepath.Base(path))
	if strings.HasSuffix(name, ".tar.gz") || strings.HasSuffix(name, ".tgz") {
		if err := decompressTarGz(path, dest); err != nil {
			return "", err
		}
		candidates := []string{
			filepath.Join(dest, "dist", "linux", runtime.GOARCH, "dockerCopilot-new"),
			filepath.Join(dest, "dockerCopilot-new"),
			filepath.Join(dest, "dockerCopilot"),
		}
		for _, c := range candidates {
			if info, err := os.Stat(c); err == nil && !info.IsDir() {
				return c, nil
			}
		}
		var found string
		_ = filepath.Walk(dest, func(p string, info os.FileInfo, err error) error {
			if err == nil && !info.IsDir() && (info.Name() == "dockerCopilot" || info.Name() == "dockerCopilot-new") && found == "" {
				found = p
			}
			return nil
		})
		if found == "" {
			return "", fmt.Errorf("未找到更新包内的 dockerCopilot 二进制")
		}
		return found, nil
	}
	return path, nil
}

func validateBinaryArch(path string) error {
	f, err := elf.Open(path)
	if err != nil {
		return fmt.Errorf("无法识别二进制格式，请上传 Linux %s 的 dockerCopilot 二进制或 tar.gz 更新包: %w", runtime.GOARCH, err)
	}
	defer f.Close()
	if f.FileHeader.OSABI != elf.ELFOSABI_NONE && f.FileHeader.OSABI != elf.ELFOSABI_LINUX {
		logx.Infof("binary OSABI: %v", f.FileHeader.OSABI)
	}
	machine := f.FileHeader.Machine
	ok := (runtime.GOARCH == "amd64" && machine == elf.EM_X86_64) || (runtime.GOARCH == "arm64" && machine == elf.EM_AARCH64) || (runtime.GOARCH == "arm" && machine == elf.EM_ARM)
	if !ok {
		return fmt.Errorf("二进制架构不匹配：当前运行环境是 %s，但上传文件是 %s", runtime.GOARCH, machine.String())
	}
	return nil
}

func validateBinaryRuntimeCompatibility(path string) error {
	f, err := elf.Open(path)
	if err != nil {
		return nil
	}
	defer f.Close()

	for _, prog := range f.Progs {
		if prog.Type != elf.PT_INTERP {
			continue
		}
		r := prog.Open()
		data, err := io.ReadAll(r)
		if err != nil {
			return fmt.Errorf("读取二进制解释器信息失败: %w", err)
		}
		interp := strings.TrimRight(string(data), "\x00")
		if strings.Contains(interp, "ld-linux") {
			return fmt.Errorf("上传的二进制依赖 glibc 动态链接器（%s），当前 DockerCopilot 容器基于 Alpine/musl，无法直接运行；请上传静态编译（CGO_ENABLED=0）的 Linux %s dockerCopilot 二进制或 tar.gz 更新包", interp, runtime.GOARCH)
		}
	}
	return nil
}

func downloadFile(client *http.Client, url string, dest string) error {
	resp, err := client.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("下载失败，HTTP %d", resp.StatusCode)
	}
	out, err := os.Create(dest)
	if err != nil {
		return err
	}
	defer out.Close()
	_, err = io.Copy(out, resp.Body)
	return err
}

func decompressTarGz(gzFilePath string, dest string) error {
	file, err := os.Open(gzFilePath)
	if err != nil {
		return err
	}
	defer file.Close()
	gzr, err := gzip.NewReader(file)
	if err != nil {
		return err
	}
	defer gzr.Close()
	tarReader := tar.NewReader(gzr)
	cleanDest, _ := filepath.Abs(dest)
	for {
		header, err := tarReader.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return err
		}
		target := filepath.Join(dest, header.Name)
		absTarget, _ := filepath.Abs(target)
		if !strings.HasPrefix(absTarget, cleanDest+string(os.PathSeparator)) && absTarget != cleanDest {
			return fmt.Errorf("更新包包含非法路径: %s", header.Name)
		}
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
			_, copyErr := io.Copy(outFile, tarReader)
			closeErr := outFile.Close()
			if copyErr != nil {
				return copyErr
			}
			if closeErr != nil {
				return closeErr
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
	buf := bytes.NewBuffer(nil)
	if _, err := io.Copy(buf, in); err != nil {
		return err
	}
	out, err := os.OpenFile(dst, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, perm)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, buf); err != nil {
		_ = out.Close()
		return err
	}
	if err := out.Close(); err != nil {
		return err
	}
	return os.Chmod(dst, perm)
}
