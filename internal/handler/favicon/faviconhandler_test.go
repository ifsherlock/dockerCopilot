package favicon

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestResolveFaviconFromLinkTag(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/":
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			_, _ = w.Write([]byte(`<html><head><link rel="shortcut icon" href="/assets/icon.png"></head></html>`))
		case "/assets/icon.png":
			w.Header().Set("Content-Type", "image/png")
			_, _ = w.Write([]byte("png"))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	got, err := ResolveFavicon(context.Background(), server.URL)
	if err != nil {
		t.Fatalf("ResolveFavicon returned error: %v", err)
	}
	want := server.URL + "/assets/icon.png"
	if got != want {
		t.Fatalf("ResolveFavicon = %q, want %q", got, want)
	}
}

func TestResolveFaviconFallsBackToRootIcon(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/app":
			w.Header().Set("Content-Type", "text/html")
			_, _ = w.Write([]byte(`<html><head></head><body>app</body></html>`))
		case "/favicon.ico":
			w.Header().Set("Content-Type", "image/x-icon")
			_, _ = w.Write([]byte("ico"))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	got, err := ResolveFavicon(context.Background(), server.URL+"/app")
	if err != nil {
		t.Fatalf("ResolveFavicon returned error: %v", err)
	}
	want := server.URL + "/favicon.ico"
	if got != want {
		t.Fatalf("ResolveFavicon = %q, want %q", got, want)
	}
}

func TestResolveFaviconRejectsUnsupportedScheme(t *testing.T) {
	if _, err := ResolveFavicon(context.Background(), "file:///etc/passwd"); err == nil {
		t.Fatal("ResolveFavicon should reject non-http URL")
	}
}
