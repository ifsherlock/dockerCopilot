package qqbot

import (
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"strconv"
	"strings"
	"sync"
	"time"
)

type updateSession struct {
	ID        string
	UserID    string
	GroupID   string
	Items     []ContainerUpdateItem
	CreatedAt time.Time
	ExpiresAt time.Time
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

func (s *updateSessionStore) put(userID string, groupID string, items []ContainerUpdateItem) updateSession {
	now := time.Now()
	session := updateSession{
		ID:        newSessionID(),
		UserID:    userID,
		GroupID:   groupID,
		Items:     append([]ContainerUpdateItem(nil), items...),
		CreatedAt: now,
		ExpiresAt: now.Add(s.ttl),
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.gcLocked(now)
	s.sessions[session.ID] = session
	return session
}

func (s *updateSessionStore) get(userID string, groupID string, id string) (updateSession, error) {
	now := time.Now()
	s.mu.Lock()
	defer s.mu.Unlock()
	s.gcLocked(now)
	session, ok := s.sessions[id]
	if !ok {
		return updateSession{}, fmt.Errorf("更新结果已刷新，请重新发送 /updates")
	}
	if session.UserID != userID || session.GroupID != groupID {
		return updateSession{}, fmt.Errorf("更新结果不属于当前会话")
	}
	if now.After(session.ExpiresAt) {
		delete(s.sessions, id)
		return updateSession{}, fmt.Errorf("更新结果已过期，请重新发送 /updates")
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

func newSessionID() string {
	var b [9]byte
	if _, err := rand.Read(b[:]); err != nil {
		return strconv.FormatInt(time.Now().UnixNano(), 36)
	}
	return base64.RawURLEncoding.EncodeToString(b[:])
}

type updateCallback struct {
	SessionID string
	Action    string
	Index     int
}

func updateCallbackData(sessionID string, action string, index int) string {
	if index >= 0 {
		return fmt.Sprintf("upd:%s:%s:%d", sessionID, action, index)
	}
	return fmt.Sprintf("upd:%s:%s", sessionID, action)
}

func parseUpdateCallback(data string) (updateCallback, bool) {
	parts := strings.Split(strings.TrimSpace(data), ":")
	if len(parts) < 3 || parts[0] != "upd" {
		return updateCallback{}, false
	}
	cb := updateCallback{SessionID: parts[1], Action: parts[2], Index: -1}
	if cb.SessionID == "" || cb.Action == "" {
		return updateCallback{}, false
	}
	if len(parts) >= 4 {
		idx, err := strconv.Atoi(parts[3])
		if err != nil {
			return updateCallback{}, false
		}
		cb.Index = idx
	}
	return cb, true
}

type containerSession struct {
	ID        string
	UserID    string
	GroupID   string
	Items     []ContainerInfoLite
	CreatedAt time.Time
	ExpiresAt time.Time
}

type containerSessionStore struct {
	mu       sync.Mutex
	ttl      time.Duration
	sessions map[string]containerSession
}

func newContainerSessionStore(ttl time.Duration) *containerSessionStore {
	if ttl <= 0 {
		ttl = 10 * time.Minute
	}
	return &containerSessionStore{ttl: ttl, sessions: map[string]containerSession{}}
}

func (s *containerSessionStore) put(userID string, groupID string, items []ContainerInfoLite) containerSession {
	now := time.Now()
	session := containerSession{
		ID:        newSessionID(),
		UserID:    userID,
		GroupID:   groupID,
		Items:     append([]ContainerInfoLite(nil), items...),
		CreatedAt: now,
		ExpiresAt: now.Add(s.ttl),
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.gcLocked(now)
	s.sessions[session.ID] = session
	return session
}

func (s *containerSessionStore) get(userID string, groupID string, id string) (containerSession, error) {
	now := time.Now()
	s.mu.Lock()
	defer s.mu.Unlock()
	s.gcLocked(now)
	session, ok := s.sessions[id]
	if !ok {
		return containerSession{}, fmt.Errorf("容器列表已刷新，请重新发送 /containers")
	}
	if session.UserID != userID || session.GroupID != groupID {
		return containerSession{}, fmt.Errorf("容器列表不属于当前会话")
	}
	if now.After(session.ExpiresAt) {
		delete(s.sessions, id)
		return containerSession{}, fmt.Errorf("容器列表已过期，请重新发送 /containers")
	}
	return session, nil
}

func (s *containerSessionStore) gcLocked(now time.Time) {
	for id, session := range s.sessions {
		if now.After(session.ExpiresAt) {
			delete(s.sessions, id)
		}
	}
}

type imageSession struct {
	ID        string
	UserID    string
	GroupID   string
	Items     []ImageInfoLite
	CreatedAt time.Time
	ExpiresAt time.Time
}

type imageSessionStore struct {
	mu       sync.Mutex
	ttl      time.Duration
	sessions map[string]imageSession
}

func newImageSessionStore(ttl time.Duration) *imageSessionStore {
	if ttl <= 0 {
		ttl = 10 * time.Minute
	}
	return &imageSessionStore{ttl: ttl, sessions: map[string]imageSession{}}
}

func (s *imageSessionStore) put(userID string, groupID string, items []ImageInfoLite) imageSession {
	now := time.Now()
	session := imageSession{
		ID:        newSessionID(),
		UserID:    userID,
		GroupID:   groupID,
		Items:     append([]ImageInfoLite(nil), items...),
		CreatedAt: now,
		ExpiresAt: now.Add(s.ttl),
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.gcLocked(now)
	s.sessions[session.ID] = session
	return session
}

func (s *imageSessionStore) get(userID string, groupID string, id string) (imageSession, error) {
	now := time.Now()
	s.mu.Lock()
	defer s.mu.Unlock()
	s.gcLocked(now)
	session, ok := s.sessions[id]
	if !ok {
		return imageSession{}, fmt.Errorf("镜像列表已刷新，请重新发送 /images")
	}
	if session.UserID != userID || session.GroupID != groupID {
		return imageSession{}, fmt.Errorf("镜像列表不属于当前会话")
	}
	if now.After(session.ExpiresAt) {
		delete(s.sessions, id)
		return imageSession{}, fmt.Errorf("镜像列表已过期，请重新发送 /images")
	}
	return session, nil
}

func (s *imageSessionStore) gcLocked(now time.Time) {
	for id, session := range s.sessions {
		if now.After(session.ExpiresAt) {
			delete(s.sessions, id)
		}
	}
}

type listCallback struct {
	SessionID string
	Action    string
	Index     int
	Page      int
}

func containerCallbackData(sessionID string, action string, index int, page int) string {
	return listCallbackData("ctr", sessionID, action, index, page)
}

func imageCallbackData(sessionID string, action string, index int, page int) string {
	return listCallbackData("img", sessionID, action, index, page)
}

func listCallbackData(prefix string, sessionID string, action string, index int, page int) string {
	if index >= 0 {
		return fmt.Sprintf("%s:%s:%s:%d:%d", prefix, sessionID, action, index, page)
	}
	return fmt.Sprintf("%s:%s:%s:%d", prefix, sessionID, action, page)
}

func parseContainerCallback(data string) (listCallback, bool) {
	return parseListCallback(data, "ctr")
}

func parseImageCallback(data string) (listCallback, bool) {
	return parseListCallback(data, "img")
}

func parseListCallback(data string, prefix string) (listCallback, bool) {
	parts := strings.Split(strings.TrimSpace(data), ":")
	if len(parts) < 4 || parts[0] != prefix {
		return listCallback{}, false
	}
	cb := listCallback{SessionID: parts[1], Action: parts[2], Index: -1}
	if cb.SessionID == "" || cb.Action == "" {
		return listCallback{}, false
	}
	var err error
	if len(parts) >= 5 {
		cb.Index, err = strconv.Atoi(parts[3])
		if err != nil {
			return listCallback{}, false
		}
		cb.Page, err = strconv.Atoi(parts[4])
		if err != nil {
			return listCallback{}, false
		}
		return cb, true
	}
	cb.Page, err = strconv.Atoi(parts[3])
	if err != nil {
		return listCallback{}, false
	}
	return cb, true
}
