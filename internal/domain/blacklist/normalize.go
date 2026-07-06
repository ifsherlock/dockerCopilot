package blacklist

import "strings"

func NormalizeImageRef(value string) string {
	v := normalizeBase(value)
	for _, prefix := range []string{"registry-1.docker.io/", "docker.io/", "library/"} {
		v = strings.TrimPrefix(v, prefix)
	}
	if v == "" {
		return ""
	}
	slash := strings.LastIndex(v, "/")
	colon := strings.LastIndex(v, ":")
	if colon <= slash && !strings.Contains(v, "@") {
		v += ":latest"
	}
	return v
}

func NormalizeKey(value string) string {
	return normalizeBase(value)
}

func Repository(value string) string {
	v := NormalizeKey(value)
	if v == "" {
		return ""
	}
	if at := strings.Index(v, "@"); at >= 0 {
		v = v[:at]
	}
	slash := strings.LastIndex(v, "/")
	colon := strings.LastIndex(v, ":")
	if colon > slash {
		v = v[:colon]
	}
	return strings.TrimSpace(v)
}

func Tail(value string) string {
	v := Repository(value)
	if v == "" {
		return ""
	}
	if idx := strings.LastIndex(v, "/"); idx >= 0 && idx+1 < len(v) {
		return v[idx+1:]
	}
	return v
}

func normalizeBase(value string) string {
	v := strings.ToLower(strings.TrimSpace(value))
	v = strings.TrimPrefix(v, "http://")
	v = strings.TrimPrefix(v, "https://")
	v = strings.TrimPrefix(v, "registry-1.docker.io/")
	v = strings.TrimPrefix(v, "docker.io/")
	return strings.TrimSpace(v)
}

func uniqueStrings(items []string) []string {
	seen := make(map[string]struct{}, len(items))
	out := make([]string, 0, len(items))
	for _, item := range items {
		item = strings.TrimSpace(item)
		if item == "" {
			continue
		}
		if _, ok := seen[item]; ok {
			continue
		}
		seen[item] = struct{}{}
		out = append(out, item)
	}
	return out
}
