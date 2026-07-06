package telegram

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestRemoteOKAcceptsLegacyAndStandardSuccessCodes(t *testing.T) {
	for _, code := range []int{0, 200} {
		if !remoteOK(code) {
			t.Fatalf("remoteOK(%d) = false, want true", code)
		}
	}
	if remoteOK(500) {
		t.Fatal("remoteOK(500) = true, want false")
	}
}

func TestRemoteClientContainersAcceptsCode200(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/containers" {
			t.Fatalf("path = %s, want /api/containers", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"code":200,"msg":"success","data":[{"id":"c1","name":"web","usingImage":"nginx:latest","createImage":"nginx:latest","status":"running","haveUpdate":true}]}`))
	}))
	defer server.Close()

	client := newRemoteClient(instanceConfig{Name: "remote", APIURL: server.URL, SecretKey: "secret"})
	got, err := client.containers(context.Background())
	if err != nil {
		t.Fatalf("containers() error = %v", err)
	}
	if len(got) != 1 || got[0].Name != "web" || !got[0].HaveUpdate {
		t.Fatalf("containers() = %#v", got)
	}
}
