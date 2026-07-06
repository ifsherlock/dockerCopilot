package blacklist

import (
	"fmt"
	"strings"
)

type Matcher struct {
	rules []Rule
}

type MatchResult struct {
	Matched bool
	Rule    Rule
	Reason  string
}

func NewMatcher(rules []Rule) Matcher {
	normalized := make([]Rule, 0, len(rules))
	seen := make(map[string]struct{}, len(rules))
	for _, rule := range rules {
		rule = NormalizeRule(rule)
		if rule.Key == "" || !rule.Enabled {
			continue
		}
		id := fmt.Sprintf("%s|%s|%s", rule.Scope, rule.Match, rule.Key)
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		normalized = append(normalized, rule)
	}
	return Matcher{rules: normalized}
}

func (m Matcher) Rules() []Rule {
	out := make([]Rule, len(m.rules))
	copy(out, m.rules)
	return out
}

func (m Matcher) Match(target Target) MatchResult {
	target.Scope = normalizeScope(target.Scope)
	for _, rule := range m.rules {
		if rule.Scope != target.Scope {
			continue
		}
		if matchRule(rule, target) {
			return MatchResult{Matched: true, Rule: rule, Reason: fmt.Sprintf("%s:%s:%s", rule.Scope, rule.Match, rule.Key)}
		}
	}
	return MatchResult{}
}

func (m Matcher) MatchContainerUpdate(containerName string, imageRef string, createdImageRef string) MatchResult {
	if result := m.Match(Target{Scope: ScopeContainer, ContainerName: containerName}); result.Matched {
		return result
	}
	return m.Match(Target{Scope: ScopeImage, ImageRef: imageRef, CreatedImageRef: createdImageRef})
}

func NormalizeRule(rule Rule) Rule {
	rule.Scope = normalizeScope(rule.Scope)
	rule.Match = normalizeMatchMode(rule.Match)
	if !rule.Enabled {
		return rule
	}
	switch rule.Match {
	case MatchRepo:
		rule.Key = Repository(rule.Key)
	case MatchTag:
		rule.Key = NormalizeImageRef(rule.Key)
	default:
		rule.Key = NormalizeKey(rule.Key)
	}
	return rule
}

func FromLegacyStrings(items []string) []Rule {
	rules := make([]Rule, 0, len(items)*2)
	seen := make(map[string]struct{}, len(items)*2)
	add := func(rule Rule) {
		rule.Enabled = true
		rule = NormalizeRule(rule)
		if rule.Key == "" {
			return
		}
		id := fmt.Sprintf("%s|%s|%s", rule.Scope, rule.Match, rule.Key)
		if _, ok := seen[id]; ok {
			return
		}
		seen[id] = struct{}{}
		rules = append(rules, rule)
	}
	for _, item := range items {
		value := NormalizeKey(item)
		if value == "" {
			continue
		}
		add(Rule{Scope: ScopeContainer, Match: MatchExact, Key: value, Enabled: true})
		add(Rule{Scope: ScopeContainer, Match: MatchExact, Key: Tail(value), Enabled: true})
		if strings.Contains(Repository(value), "/") {
			add(Rule{Scope: ScopeImage, Match: MatchRepo, Key: value, Enabled: true})
		}
		add(Rule{Scope: ScopeImage, Match: MatchTag, Key: value, Enabled: true})
	}
	return rules
}

func LegacyStringsFromInterface(v interface{}) []string {
	switch t := v.(type) {
	case []string:
		return NormalizeLegacyStrings(t)
	case []interface{}:
		out := make([]string, 0, len(t))
		for _, item := range t {
			out = append(out, fmt.Sprint(item))
		}
		return NormalizeLegacyStrings(out)
	case string:
		return NormalizeLegacyStrings(splitLegacyString(t))
	default:
		return []string{}
	}
}

func NormalizeLegacyStrings(items []string) []string {
	out := make([]string, 0, len(items))
	for _, item := range items {
		if v := NormalizeImageRef(item); v != "" {
			out = append(out, v)
		}
	}
	return uniqueStrings(out)
}

func splitLegacyString(s string) []string {
	return strings.FieldsFunc(s, func(r rune) bool {
		return r == ',' || r == '\n' || r == '\r' || r == ';'
	})
}

func matchRule(rule Rule, target Target) bool {
	switch rule.Scope {
	case ScopeContainer:
		return matchContainerRule(rule, target)
	case ScopeImage:
		return matchImageRule(rule, target)
	case ScopeProgram:
		return matchProgramRule(rule, target)
	default:
		return false
	}
}

func matchContainerRule(rule Rule, target Target) bool {
	name := NormalizeKey(target.ContainerName)
	if name == "" {
		return false
	}
	switch rule.Match {
	case MatchExact:
		return name == rule.Key
	default:
		return false
	}
}

func matchImageRule(rule Rule, target Target) bool {
	candidates := imageCandidates(target)
	if len(candidates) == 0 {
		return false
	}
	switch rule.Match {
	case MatchRepo:
		for _, candidate := range candidates {
			repo := Repository(candidate)
			if repo == rule.Key {
				return true
			}
		}
	case MatchTag:
		for _, candidate := range candidates {
			if NormalizeImageRef(candidate) == rule.Key {
				return true
			}
		}
	case MatchExact:
		for _, candidate := range candidates {
			if NormalizeKey(candidate) == rule.Key {
				return true
			}
		}
	}
	return false
}

func matchProgramRule(rule Rule, target Target) bool {
	name := NormalizeKey(target.ProgramName)
	return name != "" && rule.Match == MatchExact && name == rule.Key
}

func imageCandidates(target Target) []string {
	return uniqueStrings([]string{target.ImageRef, target.CreatedImageRef})
}

func normalizeScope(scope Scope) Scope {
	switch scope {
	case ScopeImage, ScopeProgram:
		return scope
	default:
		return ScopeContainer
	}
}

func normalizeMatchMode(mode MatchMode) MatchMode {
	switch mode {
	case MatchRepo, MatchTag:
		return mode
	default:
		return MatchExact
	}
}
