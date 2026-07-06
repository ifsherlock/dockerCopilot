package storecatalog

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"sort"
	"strconv"
	"strings"
	"time"

	"sigs.k8s.io/yaml"
)

func ParseArchive(source Source, data []byte, now time.Time) ([]App, error) {
	if strings.EqualFold(source.ID, "1panel") || strings.Contains(strings.ToLower(source.URL), "1panel") {
		if apps, err := parseOnePanelArchive(source, data, now); err == nil && len(apps) > 0 {
			return apps, nil
		}
	}
	if apps, err := parseCasaOSArchive(source, data, now); err == nil && len(apps) > 0 {
		return apps, nil
	}
	if apps, err := parseOnePanelArchive(source, data, now); err == nil && len(apps) > 0 {
		return apps, nil
	}
	return nil, fmt.Errorf("商店源未解析到 Compose 模板")
}

func parseCasaOSArchive(source Source, data []byte, now time.Time) ([]App, error) {
	reader, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return nil, err
	}
	appsByDir := map[string]*App{}
	for _, file := range reader.File {
		if file.FileInfo().IsDir() {
			continue
		}
		normalized := strings.ReplaceAll(file.Name, "\\", "/")
		parts := strings.Split(normalized, "/")
		appIdx := -1
		for i, part := range parts {
			if strings.EqualFold(part, "Apps") || strings.EqualFold(part, "apps") {
				appIdx = i
				break
			}
		}
		if appIdx < 0 || appIdx+1 >= len(parts) {
			continue
		}
		appDir := parts[appIdx+1]
		if strings.TrimSpace(appDir) == "" {
			continue
		}
		fileName := strings.ToLower(parts[len(parts)-1])
		app := appsByDir[appDir]
		if app == nil {
			app = &App{
				ID:       source.ID + "-" + sanitizeProjectName(appDir),
				SourceID: source.ID,
				Name:     humanizeAppName(appDir),
				Author:   source.Name,
				Category: "CasaOS",
			}
			appsByDir[appDir] = app
		}
		switch {
		case fileName == "docker-compose.yml" || fileName == "docker-compose.yaml" || fileName == "compose.yml" || fileName == "compose.yaml":
			content, err := readZipText(file)
			if err == nil && strings.TrimSpace(content) != "" {
				app.Compose = content
				app.Image = firstImageFromCompose(content)
			}
		case fileName == "config.json" || fileName == "app.json":
			content, err := readZipText(file)
			if err == nil {
				applyAppMetadata(app, content)
			}
		case strings.HasSuffix(fileName, ".png") || strings.HasSuffix(fileName, ".svg") || strings.HasSuffix(fileName, ".webp") || strings.HasSuffix(fileName, ".jpg") || strings.HasSuffix(fileName, ".jpeg"):
			if app.Icon == "" {
				app.Icon = normalized
			}
		}
	}
	apps := []App{}
	updatedAt := now.Format("2006-01-02 15:04:05")
	for _, app := range appsByDir {
		if strings.TrimSpace(app.Compose) == "" {
			continue
		}
		app.UpdatedAt = updatedAt
		apps = append(apps, *app)
	}
	if len(apps) == 0 {
		return nil, fmt.Errorf("商店源未解析到 CasaOS Compose 模板")
	}
	return apps, nil
}

type onePanelAppDraft struct {
	AppDir   string
	Meta     map[string]interface{}
	IconPath string
	Versions map[string]string
}

func parseOnePanelArchive(source Source, data []byte, now time.Time) ([]App, error) {
	reader, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return nil, err
	}
	drafts := map[string]*onePanelAppDraft{}
	for _, file := range reader.File {
		if file.FileInfo().IsDir() {
			continue
		}
		normalized := strings.ReplaceAll(file.Name, "\\", "/")
		parts := strings.Split(normalized, "/")
		appIdx := -1
		for i, part := range parts {
			if strings.EqualFold(part, "apps") {
				appIdx = i
				break
			}
		}
		if appIdx < 0 || appIdx+1 >= len(parts) {
			continue
		}
		appDir := strings.TrimSpace(parts[appIdx+1])
		if appDir == "" {
			continue
		}
		draft := drafts[appDir]
		if draft == nil {
			draft = &onePanelAppDraft{AppDir: appDir, Versions: map[string]string{}}
			drafts[appDir] = draft
		}
		fileName := strings.ToLower(parts[len(parts)-1])
		if len(parts) == appIdx+3 && fileName == "data.yml" {
			content, err := readZipText(file)
			if err == nil {
				var meta map[string]interface{}
				if yaml.Unmarshal([]byte(content), &meta) == nil {
					draft.Meta = meta
				}
			}
			continue
		}
		if len(parts) == appIdx+3 && (strings.HasSuffix(fileName, ".png") || strings.HasSuffix(fileName, ".svg") || strings.HasSuffix(fileName, ".webp") || strings.HasSuffix(fileName, ".jpg") || strings.HasSuffix(fileName, ".jpeg")) {
			if draft.IconPath == "" {
				draft.IconPath = strings.Join(parts[appIdx:], "/")
			}
			continue
		}
		if len(parts) == appIdx+4 && (fileName == "docker-compose.yml" || fileName == "docker-compose.yaml" || fileName == "compose.yml" || fileName == "compose.yaml") {
			version := strings.TrimSpace(parts[appIdx+2])
			content, err := readZipText(file)
			if version != "" && err == nil && strings.TrimSpace(content) != "" {
				draft.Versions[version] = content
			}
		}
	}

	apps := []App{}
	updatedAt := now.Format("2006-01-02 15:04:05")
	for appDir, draft := range drafts {
		_, compose := latestOnePanelCompose(draft.Versions)
		if strings.TrimSpace(compose) == "" {
			continue
		}
		meta := draft.Meta
		properties := mapValue(meta, "additionalProperties")
		name := firstNonEmptyString(
			stringValue(properties, "name"),
			stringValue(meta, "name"),
			stringValue(meta, "title"),
			humanizeAppName(appDir),
		)
		description := firstNonEmptyString(
			stringValue(properties, "shortDescZh"),
			stringValue(meta, "description"),
			stringValue(meta, "title"),
		)
		category := firstNonEmptyString(
			firstStringInSlice(meta["tags"]),
			firstStringInSlice(properties["tags"]),
			"1Panel",
		)
		apps = append(apps, App{
			ID:          source.ID + "-" + sanitizeProjectName(firstNonEmptyString(stringValue(properties, "key"), appDir)),
			SourceID:    source.ID,
			Name:        name,
			Author:      source.Name,
			Category:    category,
			Description: description,
			Icon:        onePanelRawIconURL(source, draft.IconPath),
			Image:       firstImageFromCompose(compose),
			Compose:     compose,
			UpdatedAt:   updatedAt,
		})
	}
	if len(apps) == 0 {
		return nil, fmt.Errorf("商店源未解析到 1Panel Compose 模板")
	}
	return apps, nil
}

func latestOnePanelCompose(versions map[string]string) (string, string) {
	names := make([]string, 0, len(versions))
	for version := range versions {
		names = append(names, version)
	}
	sort.Slice(names, func(i, j int) bool {
		return compareVersionLike(names[i], names[j]) > 0
	})
	for _, name := range names {
		if compose := strings.TrimSpace(versions[name]); compose != "" {
			return name, compose
		}
	}
	return "", ""
}

func compareVersionLike(a, b string) int {
	as := versionParts(a)
	bs := versionParts(b)
	maxLen := len(as)
	if len(bs) > maxLen {
		maxLen = len(bs)
	}
	for i := 0; i < maxLen; i++ {
		av, bv := 0, 0
		if i < len(as) {
			av = as[i]
		}
		if i < len(bs) {
			bv = bs[i]
		}
		if av > bv {
			return 1
		}
		if av < bv {
			return -1
		}
	}
	return strings.Compare(a, b)
}

func versionParts(value string) []int {
	fields := strings.FieldsFunc(value, func(r rune) bool {
		return r < '0' || r > '9'
	})
	parts := []int{}
	for _, field := range fields {
		if field == "" {
			continue
		}
		n, err := strconv.Atoi(field)
		if err == nil {
			parts = append(parts, n)
		}
	}
	return parts
}

func mapValue(raw map[string]interface{}, key string) map[string]interface{} {
	if raw == nil {
		return map[string]interface{}{}
	}
	value, ok := raw[key]
	if !ok {
		return map[string]interface{}{}
	}
	switch typed := value.(type) {
	case map[string]interface{}:
		return typed
	case map[interface{}]interface{}:
		next := map[string]interface{}{}
		for k, v := range typed {
			next[fmt.Sprint(k)] = v
		}
		return next
	default:
		return map[string]interface{}{}
	}
}

func stringValue(raw map[string]interface{}, key string) string {
	if raw == nil {
		return ""
	}
	value := strings.TrimSpace(fmt.Sprint(raw[key]))
	if value == "" || value == "<nil>" {
		return ""
	}
	return value
}

func firstNonEmptyString(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func firstStringInSlice(value interface{}) string {
	switch typed := value.(type) {
	case []interface{}:
		for _, item := range typed {
			if s := strings.TrimSpace(fmt.Sprint(item)); s != "" && s != "<nil>" {
				return s
			}
		}
	case []string:
		for _, item := range typed {
			if strings.TrimSpace(item) != "" {
				return strings.TrimSpace(item)
			}
		}
	case string:
		return strings.TrimSpace(typed)
	}
	return ""
}

func onePanelRawIconURL(source Source, iconPath string) string {
	if strings.TrimSpace(iconPath) == "" {
		return ""
	}
	if strings.Contains(source.URL, "github.com/1Panel-dev/appstore") || strings.Contains(source.URL, "codeload.github.com/1Panel-dev/appstore") {
		return "https://raw.githubusercontent.com/1Panel-dev/appstore/dev/" + strings.TrimLeft(iconPath, "/")
	}
	return iconPath
}

func readZipText(file *zip.File) (string, error) {
	reader, err := file.Open()
	if err != nil {
		return "", err
	}
	defer reader.Close()
	b, err := io.ReadAll(io.LimitReader(reader, 2*1024*1024))
	if err != nil {
		return "", err
	}
	return string(b), nil
}

func applyAppMetadata(app *App, content string) {
	var raw map[string]interface{}
	if err := json.Unmarshal([]byte(content), &raw); err != nil {
		return
	}
	for _, key := range []string{"name", "title", "Name", "Title"} {
		if s := strings.TrimSpace(fmt.Sprint(raw[key])); s != "" && s != "<nil>" {
			app.Name = s
			break
		}
	}
	for _, key := range []string{"description", "Description", "desc"} {
		if s := strings.TrimSpace(fmt.Sprint(raw[key])); s != "" && s != "<nil>" {
			app.Description = s
			break
		}
	}
	for _, key := range []string{"category", "Category"} {
		if s := strings.TrimSpace(fmt.Sprint(raw[key])); s != "" && s != "<nil>" {
			app.Category = s
			break
		}
	}
	for _, key := range []string{"author", "developer", "Author"} {
		if s := strings.TrimSpace(fmt.Sprint(raw[key])); s != "" && s != "<nil>" {
			app.Author = s
			break
		}
	}
}

func humanizeAppName(value string) string {
	value = strings.TrimSpace(strings.ReplaceAll(strings.ReplaceAll(value, "_", " "), "-", " "))
	if value == "" {
		return "App"
	}
	parts := strings.Fields(value)
	for i, part := range parts {
		if len(part) > 0 {
			parts[i] = strings.ToUpper(part[:1]) + part[1:]
		}
	}
	return strings.Join(parts, " ")
}

func firstImageFromCompose(content string) string {
	var doc map[string]interface{}
	if err := yaml.Unmarshal([]byte(content), &doc); err != nil {
		return ""
	}
	services, ok := doc["services"].(map[string]interface{})
	if !ok {
		return ""
	}
	for _, raw := range services {
		service, ok := raw.(map[string]interface{})
		if !ok {
			continue
		}
		if imageName := strings.TrimSpace(fmt.Sprint(service["image"])); imageName != "" && imageName != "<nil>" {
			return imageName
		}
	}
	return ""
}

func sanitizeProjectName(value string) string {
	value = strings.TrimSpace(strings.ToLower(value))
	var b strings.Builder
	for _, r := range value {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '-' || r == '_' {
			b.WriteRune(r)
			continue
		}
		if r == ' ' || r == '.' {
			b.WriteRune('-')
		}
	}
	return strings.Trim(b.String(), "-_")
}
