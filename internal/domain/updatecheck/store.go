package updatecheck

import (
	"strings"
	"sync"
	"time"
)

type Store struct {
	mu      sync.RWMutex
	images  map[string]ImageState
	running bool
	last    time.Time
	now     func() time.Time
	program ProgramUpdateState
	hasProg bool
}

func NewStore() *Store {
	return &Store{
		images: make(map[string]ImageState),
		now:    time.Now,
	}
}

func NewStoreWithClock(now func() time.Time) *Store {
	store := NewStore()
	if now != nil {
		store.now = now
	}
	return store
}

func (s *Store) GetImage(imageID string) (ImageState, bool) {
	imageID = strings.TrimSpace(imageID)
	if s == nil || imageID == "" {
		return ImageState{}, false
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	state, ok := s.images[imageID]
	return state, ok
}

func (s *Store) SetImage(imageID string, status Status) ImageState {
	imageID = strings.TrimSpace(imageID)
	if s == nil || imageID == "" {
		return ImageState{}
	}
	state := ImageState{
		ImageID:   imageID,
		Status:    status,
		CheckedAt: s.now(),
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.images[imageID] = state
	return state
}

func (s *Store) SetLegacyImageUpdate(imageID string, needUpdate bool) ImageState {
	if needUpdate {
		return s.SetImage(imageID, StatusUpdateAvailable)
	}
	return s.SetImage(imageID, StatusUpToDate)
}

func (s *Store) ClearImages(imageIDs ...string) {
	if s == nil {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, imageID := range imageIDs {
		imageID = strings.TrimSpace(imageID)
		if imageID == "" {
			continue
		}
		delete(s.images, imageID)
	}
}

func (s *Store) TryStartCheck(cooldown time.Duration) bool {
	if s == nil {
		return false
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	now := s.now()
	if s.running || (!s.last.IsZero() && cooldown > 0 && now.Sub(s.last) < cooldown) {
		return false
	}
	s.running = true
	s.last = now
	return true
}

func (s *Store) FinishCheck() {
	if s == nil {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.running = false
}

func (s *Store) CheckStatus() (running bool, last time.Time) {
	if s == nil {
		return false, time.Time{}
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.running, s.last
}

func (s *Store) SetProgram(state ProgramUpdateState) {
	if s == nil {
		return
	}
	if state.CheckedAt.IsZero() {
		state.CheckedAt = s.now()
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.program = state
	s.hasProg = true
}

func (s *Store) Program() (ProgramUpdateState, bool) {
	if s == nil {
		return ProgramUpdateState{}, false
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.program, s.hasProg
}
