package telegram

import (
	"encoding/json"
	"strings"

	"github.com/onlyLTY/dockerCopilot/internal/svc"
)

const maskedSecretPlaceholder = "******"

func isMaskedSecretPlaceholder(value string) bool {
	trimmed := strings.TrimSpace(value)
	return trimmed == maskedSecretPlaceholder || trimmed == "********"
}

func maskSecretForDisplay(value string) string {
	if strings.TrimSpace(value) == "" {
		return ""
	}
	return maskedSecretPlaceholder
}

func maskStatefulInputForLog(action string, extra string, text string) string {
	trimmed := strings.TrimSpace(text)
	switch action {
	case "instance_add", "instance_edit":
		return "<masked instance json>"
	case "edit_text":
		switch extra {
		case "proxy_config", "instances_json":
			return "<masked " + extra + ">"
		}
	}
	return shorten(trimmed, 160)
}

func maskedInstanceEditPayload(payload instanceEditPayload) instanceEditPayload {
	payload.SecretKey = maskSecretForDisplay(payload.SecretKey)
	return payload
}

func preserveMaskedInstanceSecret(payload instanceEditPayload, existing []instanceConfig, oldName string) instanceEditPayload {
	if !isMaskedSecretPlaceholder(payload.SecretKey) {
		return payload
	}
	for _, inst := range existing {
		if inst.Name == oldName {
			payload.SecretKey = inst.SecretKey
			return payload
		}
	}
	return payload
}

func preserveMaskedInstanceSecretsJSON(input string, existingRaw interface{}) ([]byte, error) {
	var parsed []map[string]interface{}
	if err := json.Unmarshal([]byte(input), &parsed); err != nil {
		return nil, err
	}
	existing := parseInstances(existingRaw)
	secrets := make(map[string]string, len(existing))
	for _, inst := range existing {
		secrets[inst.Name] = inst.SecretKey
	}
	for _, item := range parsed {
		name := strings.TrimSpace(svc.AsString(item["name"], ""))
		if name == "" {
			continue
		}
		if isMaskedSecretPlaceholder(svc.AsString(item["secret_key"], "")) {
			if secret, ok := secrets[name]; ok {
				item["secret_key"] = secret
			}
		}
	}
	return json.Marshal(parsed)
}

func maskedJSON(v interface{}) string {
	masked := maskSensitiveJSONValue(v)
	bs, err := json.MarshalIndent(masked, "", "  ")
	if err != nil {
		return ""
	}
	return string(bs)
}

func maskSensitiveJSONValue(v interface{}) interface{} {
	switch value := v.(type) {
	case []map[string]interface{}:
		items := make([]interface{}, 0, len(value))
		for _, item := range value {
			items = append(items, maskSensitiveJSONValue(item))
		}
		return items
	case []interface{}:
		items := make([]interface{}, 0, len(value))
		for _, item := range value {
			items = append(items, maskSensitiveJSONValue(item))
		}
		return items
	case map[string]interface{}:
		masked := make(map[string]interface{}, len(value))
		for key, item := range value {
			if isSensitiveJSONKey(key) {
				masked[key] = maskSecretForDisplay(toStringForMask(item))
				continue
			}
			masked[key] = maskSensitiveJSONValue(item)
		}
		return masked
	default:
		return v
	}
}

func isSensitiveJSONKey(key string) bool {
	normalized := strings.ToLower(strings.TrimSpace(key))
	switch normalized {
	case "secret_key", "secretkey", "bot_token", "token", "password", "app_secret":
		return true
	default:
		return false
	}
}

func toStringForMask(v interface{}) string {
	if v == nil {
		return ""
	}
	switch value := v.(type) {
	case string:
		return value
	default:
		bs, err := json.Marshal(value)
		if err != nil {
			return ""
		}
		return string(bs)
	}
}
