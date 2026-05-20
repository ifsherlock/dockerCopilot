package svc

import (
	"context"
	"encoding/json"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"golang.org/x/net/proxy"
)

type BackupRuntimeConfig = backupRuntimeConfig

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
			Timeout:   30 * time.Second,
			KeepAlive: 30 * time.Second,
		}).DialContext,
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
				Timeout:   30 * time.Second,
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

	return &http.Client{Timeout: 60 * time.Second, Transport: transport}, nil
}
