package main

import (
	"context"
	"embed"
	"flag"
	"fmt"
	"go/types"
	"io/fs"
	"log"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"time"

	qqbotruntime "github.com/onlyLTY/dockerCopilot/internal/bot/qqbot"
	telegramruntime "github.com/onlyLTY/dockerCopilot/internal/bot/telegram"
	"github.com/onlyLTY/dockerCopilot/internal/config"
	"github.com/onlyLTY/dockerCopilot/internal/handler"
	"github.com/onlyLTY/dockerCopilot/internal/svc"
	"github.com/robfig/cron/v3"
	"github.com/zeromicro/go-zero/core/conf"
	"github.com/zeromicro/go-zero/core/logx"
	"github.com/zeromicro/go-zero/rest"
	"github.com/zeromicro/go-zero/rest/httpx"
	"github.com/zeromicro/x/errors"
	xhttp "github.com/zeromicro/x/http"
)

//go:embed all:front
var embeddedFront embed.FS

var configFile = flag.String("f", "etc/dockerCopilot.yaml", "the config file")

type UnauthorizedResponse struct {
	Code int                    `json:"code"`
	Msg  string                 `json:"msg"`
	Data map[string]interface{} `json:"data"`
}

func main() {
	if loc, err := time.LoadLocation("Asia/Shanghai"); err == nil {
		time.Local = loc
	}

	logDir := "./logs"
	ErrSetupLog := SetupLog(logDir)
	if ErrSetupLog != nil {
		logx.Errorf("日志系统初始化失败: %v", ErrSetupLog)
		os.Exit(1)
	}
	logx.SetLevel(logx.InfoLevel)
	logx.Infof("DockerCopilot 启动中: config=%s logDir=%s", *configFile, logDir)

	flag.Parse()
	var c config.Config
	err := conf.Load(*configFile, &c, conf.UseEnv())
	if err != nil {
		logx.Errorf("配置加载失败: %v", err)
		logx.Errorf("请确认 secretKey 设置正确，要求非纯数字且长度大于 8 位")
		os.Exit(1)
	}
	logx.Infof("配置加载完成: host=%s port=%d", c.Host, c.Port)
	frontFS := mustSubFS(embeddedFront, "front")
	pcFS := mustSubFS(frontFS, "pc")
	pcAssetsFS := mustSubFS(pcFS, "assets")
	mobileFS := mustSubFS(frontFS, "mobile")
	server := rest.MustNewServer(
		c.RestConf,
		rest.WithCors("*"),
		rest.WithFileServer("/assets", http.FS(pcAssetsFS)),
		rest.WithFileServer("/m", http.FS(mobileFS)),
		rest.WithUnauthorizedCallback(
			func(w http.ResponseWriter, r *http.Request, err error) {
				response := UnauthorizedResponse{
					Code: http.StatusUnauthorized, // 401
					Msg:  "未授权",
					Data: map[string]interface{}{},
				}
				httpx.WriteJson(w, http.StatusUnauthorized, response)
			},
		),
	)
	defer server.Stop()
	ctx := svc.NewServiceContext(c)
	logx.Infof("服务上下文初始化完成")
	if err := ctx.ReloadBackupSchedulers(); err != nil {
		logx.Errorf("初始化定时备份失败: %v", err)
	} else {
		logx.Infof("定时备份调度器加载完成")
	}

	// Ensure data directory and config exist (Auto-init)
	dataDir := "/data/config/image"
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		logx.Errorf("创建数据目录失败: %v", err)
	} else {
		logx.Infof("数据目录已就绪: %s", dataDir)
	}

	imageLogosPath := "/data/config/imageLogos.js"
	if _, err := os.Stat(imageLogosPath); os.IsNotExist(err) {
		defaultConfig := []byte(`// 自定义镜像logo配置
export const customImageLogos = {
};
`)
		if err := os.WriteFile(imageLogosPath, defaultConfig, 0644); err != nil {
			logx.Errorf("创建默认 imageLogos.js 失败: %v", err)
		} else {
			logx.Infof("已创建默认镜像图标配置: %s", imageLogosPath)
		}
	}

	// 镜像更新检测改为容器列表请求时按容器创建镜像实时判断，
	// 避免启动时全量扫描 registry 导致服务卡顿或 Bot 首次连接超时。
	corndanmu := cron.New(cron.WithParser(cron.NewParser(
		cron.Minute | cron.Hour | cron.Dom | cron.Month | cron.Dow,
	)))
	_, err = corndanmu.AddFunc("30 * * * *", func() {
		// 保留定时器占位，更新状态由容器列表按实际 createImage/ImageID 检测。
	})
	if err != nil {
		logx.Errorf("添加内置定时任务失败: %v", err)
		panic(err)
	}
	corndanmu.Start()
	logx.Infof("内置 cron 调度器已启动")
	defer corndanmu.Stop()
	httpx.SetErrorHandler(func(err error) (int, any) {
		switch e := err.(type) {
		case *errors.CodeMsg:
			return http.StatusOK, xhttp.BaseResponse[types.Nil]{
				Code: e.Code,
				Msg:  e.Msg,
			}
		default:
			return http.StatusOK, xhttp.BaseResponse[types.Nil]{
				Code: 50000,
				Msg:  err.Error(),
			}
		}
	})
	handler.RegisterHandlers(server, ctx)
	qqbotruntime.RegisterWebhookRoutes(server, ctx)
	RegisterHandlers(server, pcFS, mobileFS)
	logx.Infof("HTTP 路由注册完成")
	if err := telegramruntime.Start(context.Background(), ctx); err != nil {
		logx.Errorf("启动 Telegram Bot 失败: %v", err)
	} else {
		logx.Infof("Telegram Bot 启动流程已完成")
	}
	if err := qqbotruntime.Start(context.Background(), ctx); err != nil {
		logx.Errorf("启动 QQBot 失败: %v", err)
	} else {
		logx.Infof("QQBot 启动流程已完成")
	}
	logx.Infof("程序版本=%s", config.Version)
	logx.Infof("HTTP 服务准备监听: %s:%d", c.Host, c.Port)
	server.Start()
}
func RegisterHandlers(engine *rest.Server, pcFS fs.FS, mobileFS fs.FS) {
	pcIndexHandler := serveEmbeddedIndex(pcFS)
	mobileIndexHandler := serveEmbeddedIndex(mobileFS)

	// Serve custom icons
	iconFileServer := http.StripPrefix("/src/config/image/", http.FileServer(http.Dir("/data/config/image")))
	engine.AddRoutes(
		[]rest.Route{
			{
				Method: http.MethodGet,
				Path:   "/src/config/image/:file",
				Handler: func(w http.ResponseWriter, r *http.Request) {
					iconFileServer.ServeHTTP(w, r)
				},
			},
		},
	)

	engine.AddRoutes(
		[]rest.Route{
			{
				Method:  http.MethodGet,
				Path:    "/manager",
				Handler: pcIndexHandler,
			},
			{
				Method:  http.MethodGet,
				Path:    "/m",
				Handler: mobileIndexHandler,
			},
			{
				Method:  http.MethodGet,
				Path:    "/logo.png",
				Handler: serveEmbeddedFile(pcFS, "logo.png"),
			},
			{
				Method:  http.MethodGet,
				Path:    "/manifest.json",
				Handler: serveEmbeddedFile(pcFS, "manifest.json"),
			},
			{
				Method:  http.MethodGet,
				Path:    "/sw.js",
				Handler: serveEmbeddedFile(pcFS, "sw.js"),
			},
			{
				Method:  http.MethodGet,
				Path:    "/icon.svg",
				Handler: serveEmbeddedFile(mobileFS, "icon.svg"),
			},
			{
				Method:  http.MethodGet,
				Path:    "/icon-light-32x32.png",
				Handler: serveEmbeddedFile(mobileFS, "icon-light-32x32.png"),
			},
			{
				Method:  http.MethodGet,
				Path:    "/icon-dark-32x32.png",
				Handler: serveEmbeddedFile(mobileFS, "icon-dark-32x32.png"),
			},
			{
				Method:  http.MethodGet,
				Path:    "/apple-icon.png",
				Handler: serveEmbeddedFile(mobileFS, "apple-icon.png"),
			},
		},
	)
}

func mustSubFS(parent fs.FS, dir string) fs.FS {
	subFS, err := fs.Sub(parent, dir)
	if err != nil {
		log.Fatalf("load embedded frontend %s failed: %v", dir, err)
	}

	return subFS
}

func serveEmbeddedIndex(staticFS fs.FS) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		content, err := fs.ReadFile(staticFS, "index.html")
		if err != nil {
			http.Error(w, "index.html not found", http.StatusNotFound)
			return
		}

		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write(content)
	}
}

func serveEmbeddedFile(staticFS fs.FS, filePath string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		content, err := fs.ReadFile(staticFS, filePath)
		if err != nil {
			http.NotFound(w, r)
			return
		}

		if contentType := mime.TypeByExtension(filepath.Ext(filePath)); contentType != "" {
			w.Header().Set("Content-Type", contentType)
		}

		_, _ = w.Write(content)
	}
}

// 检查并创建日志目录
func ensureLogDirectory(logDir string) error {
	if _, err := os.Stat(logDir); os.IsNotExist(err) {
		return os.MkdirAll(logDir, 0755) // 创建目录并设置权限
	}
	return nil
}

// SetupLog 初始化日志设置
func SetupLog(logDir string) error {
	// 检查日志目录是否存在
	if err := ensureLogDirectory(logDir); err != nil {
		return fmt.Errorf("failed to create log directory: %v", err)
	}

	logConf := logx.LogConf{
		Path:     logDir,
		Level:    "info",
		KeepDays: 7,
		Compress: true,
		Mode:     "file",
		Encoding: "plain",
	}
	logx.MustSetup(logConf)
	logx.AddWriter(logx.NewWriter(os.Stdout))
	return nil
}
