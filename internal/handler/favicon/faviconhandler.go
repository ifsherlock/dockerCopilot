package favicon

import (
	"context"
	"fmt"
	"io"
	"mime"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/onlyLTY/dockerCopilot/internal/svc"
	"github.com/onlyLTY/dockerCopilot/internal/types"
	"github.com/zeromicro/go-zero/rest/httpx"
	"golang.org/x/net/html"
)

type resolveResp struct {
	URL string `json:"url"`
}

func ResolveHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		target := strings.TrimSpace(r.URL.Query().Get("url"))
		iconURL, err := ResolveFavicon(r.Context(), target)
		if err != nil {
			httpx.OkJsonCtx(r.Context(), w, types.Resp{Code: 200, Msg: err.Error(), Data: resolveResp{}})
			return
		}
		httpx.OkJsonCtx(r.Context(), w, types.Resp{Code: 200, Msg: "Success", Data: resolveResp{URL: iconURL}})
	}
}

func ResolveFavicon(ctx context.Context, rawURL string) (string, error) {
	pageURL, err := normalizeHTTPURL(rawURL)
	if err != nil {
		return "", err
	}
	client := faviconHTTPClient()
	candidates := []string{}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, pageURL.String(), nil)
	if err == nil {
		req.Header.Set("User-Agent", "DockerCopilot/2.1 favicon resolver")
		if resp, err := client.Do(req); err == nil {
			defer resp.Body.Close()
			contentType := strings.ToLower(resp.Header.Get("Content-Type"))
			limited := io.LimitReader(resp.Body, 512*1024)
			body, _ := io.ReadAll(limited)
			if resp.StatusCode >= 200 && resp.StatusCode < 400 && strings.Contains(contentType, "html") {
				candidates = append(candidates, extractFaviconLinks(pageURL, string(body))...)
			}
		}
	}

	fallback := pageURL.ResolveReference(&url.URL{Path: "/favicon.ico"}).String()
	candidates = appendUnique(candidates, fallback)
	for _, candidate := range candidates {
		if ok := probeFavicon(ctx, client, candidate); ok {
			return candidate, nil
		}
	}
	return "", fmt.Errorf("未找到可用 favicon")
}

func normalizeHTTPURL(rawURL string) (*url.URL, error) {
	value := strings.TrimSpace(rawURL)
	if value == "" {
		return nil, fmt.Errorf("URL 不能为空")
	}
	if !strings.Contains(value, "://") {
		value = "http://" + value
	}
	parsed, err := url.Parse(value)
	if err != nil {
		return nil, fmt.Errorf("URL 格式无效")
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return nil, fmt.Errorf("仅支持 http/https")
	}
	if strings.TrimSpace(parsed.Host) == "" {
		return nil, fmt.Errorf("URL 缺少主机")
	}
	return parsed, nil
}

func faviconHTTPClient() *http.Client {
	return &http.Client{
		Timeout: 5 * time.Second,
		Transport: &http.Transport{
			Proxy: http.ProxyFromEnvironment,
			DialContext: (&net.Dialer{
				Timeout:   3 * time.Second,
				KeepAlive: 10 * time.Second,
			}).DialContext,
			TLSHandshakeTimeout:   3 * time.Second,
			ResponseHeaderTimeout: 4 * time.Second,
			IdleConnTimeout:       5 * time.Second,
		},
	}
}

func extractFaviconLinks(base *url.URL, htmlText string) []string {
	out := []string{}
	doc, err := html.Parse(strings.NewReader(htmlText))
	if err != nil {
		return out
	}
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.ElementNode && strings.EqualFold(n.Data, "link") {
			rel := ""
			href := ""
			for _, attr := range n.Attr {
				switch strings.ToLower(attr.Key) {
				case "rel":
					rel = strings.ToLower(attr.Val)
				case "href":
					href = strings.TrimSpace(attr.Val)
				}
			}
			if href != "" && isIconRel(rel) {
				if resolved, err := base.Parse(href); err == nil && resolved.Scheme != "" && resolved.Host != "" {
					out = appendUnique(out, resolved.String())
				}
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(doc)
	if len(out) > 0 {
		return out
	}
	// Some dashboards use script-injected markup; this cheap fallback catches simple link tags.
	re := regexp.MustCompile(`(?is)<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]+href=["']([^"']+)["']`)
	for _, match := range re.FindAllStringSubmatch(htmlText, -1) {
		if len(match) == 2 {
			if resolved, err := base.Parse(strings.TrimSpace(match[1])); err == nil && resolved.Scheme != "" && resolved.Host != "" {
				out = appendUnique(out, resolved.String())
			}
		}
	}
	return out
}

func isIconRel(rel string) bool {
	rel = strings.ToLower(rel)
	return strings.Contains(rel, "icon") || strings.Contains(rel, "apple-touch-icon")
}

func appendUnique(items []string, value string) []string {
	value = strings.TrimSpace(value)
	if value == "" {
		return items
	}
	for _, item := range items {
		if item == value {
			return items
		}
	}
	return append(items, value)
}

func probeFavicon(ctx context.Context, client *http.Client, candidate string) bool {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, candidate, nil)
	if err != nil {
		return false
	}
	req.Header.Set("User-Agent", "DockerCopilot/2.1 favicon resolver")
	resp, err := client.Do(req)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 400 {
		return false
	}
	contentType := strings.ToLower(resp.Header.Get("Content-Type"))
	if contentType == "" {
		return true
	}
	mediaType, _, err := mime.ParseMediaType(contentType)
	if err != nil {
		mediaType = contentType
	}
	return strings.HasPrefix(mediaType, "image/") || mediaType == "application/octet-stream"
}
