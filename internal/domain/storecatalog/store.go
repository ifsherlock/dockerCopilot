package storecatalog

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

const DefaultDir = "/data/app-store"

type Store struct {
	root   string
	client *http.Client
	now    func() time.Time
}

func New(root string) *Store {
	if strings.TrimSpace(root) == "" {
		root = EnvRoot()
	}
	return &Store{
		root:   root,
		client: &http.Client{Timeout: 30 * time.Second},
		now:    time.Now,
	}
}

func NewWithClient(root string, client *http.Client) *Store {
	store := New(root)
	if client != nil {
		store.client = client
	}
	return store
}

func EnvRoot() string {
	if v := strings.TrimSpace(os.Getenv("DOCKERCOPILOT_STORE_DIR")); v != "" {
		return v
	}
	return DefaultDir
}

func (s *Store) LoadSources() ([]Source, error) {
	if err := os.MkdirAll(s.rootDir(), 0755); err != nil {
		return nil, err
	}
	path := filepath.Join(s.rootDir(), "sources.json")
	if _, err := os.Stat(path); os.IsNotExist(err) {
		sources := defaultSources()
		if err := s.saveSources(sources); err != nil {
			return nil, err
		}
		return sources, nil
	}
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var sources []Source
	if err := json.Unmarshal(b, &sources); err != nil {
		return nil, err
	}
	if len(sources) == 0 {
		sources = defaultSources()
	}
	sources, changed := mergeDefaultSources(sources)
	if changed {
		if err := s.saveSources(sources); err != nil {
			return nil, err
		}
	}
	return sources, nil
}

func (s *Store) SaveSource(req Source) ([]Source, error) {
	sources, err := s.LoadSources()
	if err != nil {
		return nil, err
	}
	if req.ID == "" {
		req.ID = sanitizeProjectName(req.Name)
	}
	if req.ID == "" {
		return nil, fmt.Errorf("source id is required")
	}
	if req.Name == "" || req.URL == "" {
		return nil, fmt.Errorf("source name and url are required")
	}
	found := false
	for i := range sources {
		if sources[i].ID == req.ID {
			req.Builtin = sources[i].Builtin
			sources[i] = req
			found = true
			break
		}
	}
	if !found {
		sources = append(sources, req)
	}
	return sources, s.saveSources(sources)
}

func (s *Store) DeleteSource(id string) ([]Source, error) {
	sources, err := s.LoadSources()
	if err != nil {
		return nil, err
	}
	next := []Source{}
	for _, source := range sources {
		if source.ID == id {
			if source.Builtin {
				return nil, fmt.Errorf("内置商店源不能删除，可禁用")
			}
			continue
		}
		next = append(next, source)
	}
	return next, s.saveSources(next)
}

func (s *Store) LoadApps(force bool) ([]App, error) {
	sources, err := s.LoadSources()
	if err != nil {
		return nil, err
	}
	apps := []App{}
	var lastErr error
	for _, source := range sources {
		if !source.Enabled {
			continue
		}
		items, err := s.loadAppsFromSource(source, force)
		if err != nil {
			lastErr = err
		}
		apps = append(apps, items...)
	}
	sort.Slice(apps, func(i, j int) bool {
		return strings.ToLower(apps[i].Name) < strings.ToLower(apps[j].Name)
	})
	if len(apps) == 0 && lastErr != nil {
		return fallbackApps(), lastErr
	}
	if len(apps) == 0 {
		return fallbackApps(), nil
	}
	return apps, lastErr
}

func (s *Store) loadAppsFromSource(source Source, force bool) ([]App, error) {
	cacheFile := filepath.Join(s.cacheDir(), source.ID+".json")
	if !force {
		if apps, err := readAppsCache(cacheFile); err == nil && len(apps) > 0 {
			return apps, nil
		}
	}
	archiveBytes, err := s.downloadArchive(source.URL)
	if err != nil {
		if apps, cacheErr := readAppsCache(cacheFile); cacheErr == nil && len(apps) > 0 {
			return apps, fmt.Errorf("商店源 %s 下载失败，使用缓存: %w", source.Name, err)
		}
		return nil, err
	}
	apps, err := ParseArchive(source, archiveBytes, s.now())
	if err != nil {
		if cached, cacheErr := readAppsCache(cacheFile); cacheErr == nil && len(cached) > 0 {
			return cached, fmt.Errorf("商店源 %s 解析失败，使用缓存: %w", source.Name, err)
		}
		return nil, err
	}
	if err := writeAppsCache(cacheFile, apps); err != nil {
		return apps, fmt.Errorf("商店源 %s 缓存写入失败: %w", source.Name, err)
	}
	return apps, nil
}

func (s *Store) downloadArchive(url string) ([]byte, error) {
	resp, err := s.client.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("商店源下载失败: HTTP %d", resp.StatusCode)
	}
	return io.ReadAll(io.LimitReader(resp.Body, 350*1024*1024))
}

func (s *Store) saveSources(sources []Source) error {
	if err := os.MkdirAll(s.rootDir(), 0755); err != nil {
		return err
	}
	b, err := json.MarshalIndent(sources, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(s.rootDir(), "sources.json"), b, 0644)
}

func (s *Store) rootDir() string {
	if s == nil || strings.TrimSpace(s.root) == "" {
		return EnvRoot()
	}
	return s.root
}

func (s *Store) cacheDir() string {
	return filepath.Join(s.rootDir(), "cache")
}

func defaultSources() []Source {
	return []Source{
		{
			ID:      "casaos",
			Name:    "CasaOS",
			URL:     "https://codeload.github.com/IceWhaleTech/CasaOS-AppStore/zip/refs/heads/main",
			Enabled: true,
			Builtin: true,
		},
		{
			ID:      "1panel",
			Name:    "1Panel",
			URL:     "https://codeload.github.com/1Panel-dev/appstore/zip/refs/heads/dev",
			Enabled: true,
			Builtin: true,
		},
	}
}

func mergeDefaultSources(sources []Source) ([]Source, bool) {
	changed := false
	index := map[string]int{}
	for i, source := range sources {
		index[source.ID] = i
	}
	for _, builtin := range defaultSources() {
		if i, ok := index[builtin.ID]; ok {
			if !sources[i].Builtin {
				sources[i].Builtin = true
				changed = true
			}
			if builtin.ID == "casaos" && strings.Contains(sources[i].URL, "github.com/IceWhaleTech/CasaOS-AppStore/archive/refs/heads/main.zip") {
				sources[i].URL = builtin.URL
				changed = true
			}
			continue
		}
		sources = append(sources, builtin)
		changed = true
	}
	return sources, changed
}
