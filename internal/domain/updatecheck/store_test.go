package updatecheck

import (
	"testing"
	"time"
)

func TestStoreLegacyImageUpdateCompatibility(t *testing.T) {
	now := time.Date(2026, 7, 6, 1, 40, 0, 0, time.UTC)
	store := NewStoreWithClock(func() time.Time { return now })

	state := store.SetLegacyImageUpdate(" sha256:image ", true)
	if !state.NeedUpdate() {
		t.Fatalf("NeedUpdate() = false, want true")
	}
	got, ok := store.GetImage("sha256:image")
	if !ok {
		t.Fatalf("GetImage() ok = false, want true")
	}
	if got.Status != StatusUpdateAvailable || !got.CheckedAt.Equal(now) {
		t.Fatalf("state = %#v, want update_available at %s", got, now)
	}

	store.SetLegacyImageUpdate("sha256:image", false)
	got, ok = store.GetImage("sha256:image")
	if !ok || got.Status != StatusUpToDate || got.NeedUpdate() {
		t.Fatalf("state after clearing update = %#v, ok=%v", got, ok)
	}

	store.ClearImages("sha256:image")
	if _, ok := store.GetImage("sha256:image"); ok {
		t.Fatalf("image state was not cleared")
	}
}

func TestStoreCheckLifecycleHonorsCooldown(t *testing.T) {
	current := time.Date(2026, 7, 6, 1, 40, 0, 0, time.UTC)
	store := NewStoreWithClock(func() time.Time { return current })

	if !store.TryStartCheck(30 * time.Minute) {
		t.Fatalf("first TryStartCheck() = false, want true")
	}
	running, last := store.CheckStatus()
	if !running || !last.Equal(current) {
		t.Fatalf("CheckStatus() = %v, %s; want running at %s", running, last, current)
	}
	if store.TryStartCheck(0) {
		t.Fatalf("TryStartCheck while running = true, want false")
	}

	store.FinishCheck()
	if store.TryStartCheck(30 * time.Minute) {
		t.Fatalf("TryStartCheck inside cooldown = true, want false")
	}
	current = current.Add(31 * time.Minute)
	if !store.TryStartCheck(30 * time.Minute) {
		t.Fatalf("TryStartCheck after cooldown = false, want true")
	}
}

func TestStoreProgramState(t *testing.T) {
	now := time.Date(2026, 7, 6, 1, 40, 0, 0, time.UTC)
	store := NewStoreWithClock(func() time.Time { return now })

	if _, ok := store.Program(); ok {
		t.Fatalf("Program() ok = true before state set")
	}
	store.SetProgram(ProgramUpdateState{
		LocalVersion:  "2.1.24",
		RemoteVersion: "2.1.25",
		Status:        StatusUpdateAvailable,
	})
	got, ok := store.Program()
	if !ok {
		t.Fatalf("Program() ok = false, want true")
	}
	if got.Status != StatusUpdateAvailable || got.CheckedAt.IsZero() {
		t.Fatalf("program state = %#v", got)
	}
}
