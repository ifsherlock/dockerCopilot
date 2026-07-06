package image

import (
	"testing"

	"github.com/onlyLTY/dockerCopilot/internal/domain/updatecheck"
)

func TestImageUpdateKind(t *testing.T) {
	tests := []struct {
		name       string
		haveUpdate bool
		ignored    bool
		state      updatecheck.ImageState
		wantKind   string
		wantStatus string
	}{
		{name: "update available", haveUpdate: true, state: updatecheck.ImageState{Status: updatecheck.StatusUpdateAvailable}, wantKind: "image", wantStatus: "update_available"},
		{name: "ignored update", haveUpdate: true, ignored: true, state: updatecheck.ImageState{Status: updatecheck.StatusUpdateAvailable}, wantKind: "image", wantStatus: "ignored"},
		{name: "up to date", state: updatecheck.ImageState{Status: updatecheck.StatusUpToDate}, wantKind: "", wantStatus: "up_to_date"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotKind, gotStatus := imageUpdateKind(tt.haveUpdate, tt.ignored, tt.state)
			if gotKind != tt.wantKind || gotStatus != tt.wantStatus {
				t.Fatalf("imageUpdateKind() = %q, %q; want %q, %q", gotKind, gotStatus, tt.wantKind, tt.wantStatus)
			}
		})
	}
}
