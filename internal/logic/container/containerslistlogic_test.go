package container

import (
	"testing"

	"github.com/onlyLTY/dockerCopilot/internal/domain/updatecheck"
)

func TestContainerUpdateKindSeparatesSelfImageUpdate(t *testing.T) {
	tests := []struct {
		name       string
		isSelf     bool
		haveUpdate bool
		ignored    bool
		state      updatecheck.ImageState
		wantKind   string
		wantStatus string
	}{
		{name: "normal container image update", haveUpdate: true, state: updatecheck.ImageState{Status: updatecheck.StatusUpdateAvailable}, wantKind: "container_image", wantStatus: "update_available"},
		{name: "self container image update", isSelf: true, haveUpdate: true, state: updatecheck.ImageState{Status: updatecheck.StatusUpdateAvailable}, wantKind: "self_container_image", wantStatus: "update_available"},
		{name: "self up to date", isSelf: true, haveUpdate: false, state: updatecheck.ImageState{Status: updatecheck.StatusUpToDate}, wantKind: "", wantStatus: "up_to_date"},
		{name: "ignored normal update", haveUpdate: true, ignored: true, state: updatecheck.ImageState{Status: updatecheck.StatusUpdateAvailable}, wantKind: "container_image", wantStatus: "ignored"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotKind, gotStatus := containerUpdateKind(tt.isSelf, tt.haveUpdate, tt.ignored, tt.state)
			if gotKind != tt.wantKind || gotStatus != tt.wantStatus {
				t.Fatalf("containerUpdateKind() = %q, %q; want %q, %q", gotKind, gotStatus, tt.wantKind, tt.wantStatus)
			}
		})
	}
}
