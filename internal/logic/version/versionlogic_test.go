package version

import (
	"testing"

	"github.com/onlyLTY/dockerCopilot/internal/domain/updatecheck"
)

func TestProgramVersionResponseSeparatesProgramState(t *testing.T) {
	state := buildProgramUpdateState("2.1.24", "2026-07-06", "2.1.24", updatecheck.StatusUpToDate, "")
	data := programVersionResponse(state)
	if data["hasProgramUpdate"] != false {
		t.Fatalf("hasProgramUpdate = %#v, want false", data["hasProgramUpdate"])
	}
	if data["programUpdateStatus"] != string(updatecheck.StatusUpToDate) {
		t.Fatalf("programUpdateStatus = %#v", data["programUpdateStatus"])
	}

	state = buildProgramUpdateState("2.1.24", "2026-07-06", "2.1.25", updatecheck.StatusUpdateAvailable, "")
	data = programVersionResponse(state)
	if data["hasProgramUpdate"] != true {
		t.Fatalf("hasProgramUpdate = %#v, want true", data["hasProgramUpdate"])
	}
	if data["remoteVersion"] != "2.1.25" {
		t.Fatalf("remoteVersion = %#v", data["remoteVersion"])
	}
}
