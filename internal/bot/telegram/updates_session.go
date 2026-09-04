package telegram

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"strconv"
	"strings"
	"sync"
	"time"
)

type updateSession struct {
	ID           string
	ChatID       int64
	InstanceName string
	Items        []containerView
	CreatedAt    time.Time
	ExpiresAt    time.Time
}

type updateSessionStore struct {
	mu       sync.Mutex
	ttl      time.Duration
	sessions map[string]updateSession
}

func newUpdateSessionStore(ttl time.Duration) *updateSessionStore {
	if ttl <= 0 {
		ttl = 10 * time.Minute
	}
	return &updateSessionStore{ttl: ttl, sessions: map[string]updateSession{}}
}

func (s *updateSessionStore) put(chatID int64, instanceName string, items []containerView) updateSession {
	if s == nil {
		s = newUpdateSessionStore(10 * time.Minute)
	}
	now := time.Now()
	session := updateSession{
		ID:           newUpdateSessionID(),
		ChatID:       chatID,
		InstanceName: instanceName,
		Items:        append([]containerView(nil), items...),
		CreatedAt:    now,
		ExpiresAt:    now.Add(s.ttl),
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.gcLocked(now)
	s.sessions[session.ID] = session
	return session
}

func (s *updateSessionStore) get(chatID int64, sessionID string) (updateSession, error) {
	if s == nil {
		return updateSession{}, fmt.Errorf("结果已更新，请使用当前面板")
	}
	now := time.Now()
	s.mu.Lock()
	defer s.mu.Unlock()
	s.gcLocked(now)
	session, ok := s.sessions[sessionID]
	if !ok {
		return updateSession{}, fmt.Errorf("结果已更新，请使用当前面板")
	}
	if session.ChatID != chatID {
		return updateSession{}, fmt.Errorf("结果不属于当前聊天，请重新刷新")
	}
	if now.After(session.ExpiresAt) {
		delete(s.sessions, sessionID)
		return updateSession{}, fmt.Errorf("结果已过期，请刷新后重试")
	}
	return session, nil
}

func (s *updateSessionStore) gcLocked(now time.Time) {
	for id, session := range s.sessions {
		if now.After(session.ExpiresAt) {
			delete(s.sessions, id)
		}
	}
}

func newUpdateSessionID() string {
	var b [9]byte
	if _, err := rand.Read(b[:]); err != nil {
		return strconv.FormatInt(time.Now().UnixNano(), 36)
	}
	return base64.RawURLEncoding.EncodeToString(b[:])
}

func updateSessionCallbackData(sessionID string, action string, index int) string {
	return fmt.Sprintf("upd:%s:%s:%d", sessionID, action, index)
}

func updateSessionPageCallbackData(sessionID string, page int) string {
	return fmt.Sprintf("upd:%s:page:%d", sessionID, page)
}

func updateSessionAllCallbackData(sessionID string) string {
	return fmt.Sprintf("upd:%s:confirm_all", sessionID)
}

func updateSessionRunAllCallbackData(sessionID string) string {
	return fmt.Sprintf("upd:%s:run_all", sessionID)
}

func updateInstanceCallbackData(instanceName string) string {
	return "updates_instance:" + updateInstanceToken(instanceName)
}

func updateInstanceToken(instanceName string) string {
	normalized := strings.ToLower(strings.TrimSpace(instanceName))
	if normalized == "" {
		normalized = "local"
	}
	sum := sha256.Sum256([]byte(normalized))
	return base64.RawURLEncoding.EncodeToString(sum[:9])
}

func findUpdateInstanceByToken(instances []instanceConfig, token string) (instanceConfig, bool) {
	for _, instance := range instances {
		if updateInstanceToken(instance.Name) == token {
			return instance, true
		}
	}
	return instanceConfig{}, false
}

type updateSessionCallback struct {
	SessionID string
	Action    string
	Index     int
}

func parseUpdateSessionCallback(data string) (updateSessionCallback, bool) {
	parts := strings.Split(strings.TrimSpace(data), ":")
	if len(parts) < 3 || parts[0] != "upd" {
		return updateSessionCallback{}, false
	}
	cb := updateSessionCallback{SessionID: parts[1], Action: parts[2], Index: -1}
	if cb.SessionID == "" || cb.Action == "" {
		return updateSessionCallback{}, false
	}
	if len(parts) >= 4 {
		idx, err := strconv.Atoi(parts[3])
		if err != nil {
			return updateSessionCallback{}, false
		}
		cb.Index = idx
	}
	return cb, true
}

func (r *Runtime) ensureUpdateSessions() *updateSessionStore {
	if r.updateSessions == nil {
		r.updateSessions = newUpdateSessionStore(10 * time.Minute)
	}
	return r.updateSessions
}
