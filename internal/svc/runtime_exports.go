package svc

import (
	"context"
	"encoding/json"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"golang.org/x/net/proxy"
)

type BackupRuntimeConfig = backupRuntimeConfig

// automationReloader 由 automation 包注册，配置保存后触发自动化任务重载。
var (
	automationReloaderMu sync.Mutex
	automationReloader   func() error
)

// SetAutomationReloader 注册自动化调度器的重载回调。
func SetAutomationReloader(fn func() error) {
	automationReloaderMu.Lock()
	defer automationReloaderMu.Unlock()
	automationReloader = fn
}

// ReloadAutomation 触发已注册的自动化调度器重载，未注册时为空操作。
func ReloadAutomation() error {
	automationReloaderMu.Lock()
	fn := automationReloader
	automationReloaderMu.Unlock()
	if fn == nil {
		return nil
	}
	return fn()
}

// RuntimeStateFile 返回运行时状态文件的绝对/相对路径，与运行日志同目录。
func RuntimeStateFile(name string) string {
	return runtimeLogFile(name)
}

func AsString(v interface{}, fallback string) string {
	return asString(v, fallback)
}

func AsInt(v interface{}, fallback int) int {
	return asInt(v, fallback)
}

func AsBool(v interface{}) bool {
	return asBool(v)
}

func ProxyMap(v interface{}) map[string]interface{} {
	if m, ok := v.(map[string]interface{}); ok && m != nil {
		return m
	}
	return map[string]interface{}{}
}

func MustJSON(v interface{}) ([]byte, error) {
	return json.Marshal(v)
}

func UnmarshalJSON(data []byte, out interface{}) error {
	return json.Unmarshal(data, out)
}

func TelegramHTTPClient(cfg backupRuntimeConfig) (*http.Client, error) {
	proxyCfg := ProxyMap(cfg.Telegram["proxy"])
	proxyType := strings.ToLower(strings.TrimSpace(AsString(proxyCfg["type"], "none")))
	host := strings.TrimSpace(AsString(proxyCfg["host"], ""))
	port := AsInt(proxyCfg["port"], 0)
	username := strings.TrimSpace(AsString(proxyCfg["username"], ""))
	password := AsString(proxyCfg["password"], "")

	transport := &http.Transport{
		Proxy: http.ProxyFromEnvironment,
		DialContext: (&net.Dialer{
			Timeout:   15 * time.Second,
			KeepAlive: 30 * time.Second,
		}).DialContext,
		ForceAttemptHTTP2:     true,
		MaxIdleConns:          20,
		MaxIdleConnsPerHost:   4,
		IdleConnTimeout:       10 * time.Second,
		TLSHandshakeTimeout:   10 * time.Second,
		ResponseHeaderTimeout: 20 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,
	}

	switch proxyType {
	case "", "none":
		// direct
	case "http", "https":
		if host != "" && port > 0 {
			proxyURL := &url.URL{Scheme: proxyType, Host: net.JoinHostPort(host, strconv.Itoa(port))}
			if username != "" {
				proxyURL.User = url.UserPassword(username, password)
			}
			transport.Proxy = http.ProxyURL(proxyURL)
		}
	case "socks5":
		if host != "" && port > 0 {
			var auth *proxy.Auth
			if username != "" {
				auth = &proxy.Auth{User: username, Password: password}
			}
			dialer, err := proxy.SOCKS5("tcp", net.JoinHostPort(host, strconv.Itoa(port)), auth, &net.Dialer{
				Timeout:   15 * time.Second,
				KeepAlive: 30 * time.Second,
			})
			if err != nil {
				return nil, err
			}
			if contextDialer, ok := dialer.(proxy.ContextDialer); ok {
				transport.DialContext = contextDialer.DialContext
			} else {
				transport.DialContext = func(ctx context.Context, network, addr string) (net.Conn, error) {
					return dialer.Dial(network, addr)
				}
			}
			transport.Proxy = nil
		}
	default:
		// unknown proxy type -> fallback direct
	}

	return &http.Client{Timeout: 25 * time.Second, Transport: transport}, nil
}
