package handler

import (
	"net/http"
	"strings"

	"github.com/onlyLTY/dockerCopilot/internal/svc"
)

func webindexHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		target := "/manager"
		if isMobileUserAgent(r.UserAgent()) {
			target = "/m"
		}

		w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate")
		w.Header().Set("Pragma", "no-cache")
		w.Header().Set("Expires", "0")
		http.Redirect(w, r, target, http.StatusFound)
	}
}

func isMobileUserAgent(userAgent string) bool {
	ua := strings.ToLower(userAgent)
	mobileKeywords := []string{"android", "iphone", "ipad", "ipod", "mobile", "harmonyos"}

	for _, keyword := range mobileKeywords {
		if strings.Contains(ua, keyword) {
			return true
		}
	}

	return false
}
