package runtimeconfig

type Config struct {
	Version       string                 `json:"version"`
	Dockercopilot map[string]interface{} `json:"dockercopilot"`
	Telegram      map[string]interface{} `json:"telegram"`
	QQBot         map[string]interface{} `json:"qqbot"`
}

func (c *Config) FillDefaults(defaults Config) {
	if c.Version == "" {
		c.Version = defaults.Version
	}
	if c.Dockercopilot == nil {
		c.Dockercopilot = defaults.Dockercopilot
	} else {
		fillMissingMapValues(c.Dockercopilot, defaults.Dockercopilot)
	}
	if c.Telegram == nil {
		c.Telegram = defaults.Telegram
	} else {
		fillMissingMapValues(c.Telegram, defaults.Telegram)
	}
	if c.QQBot == nil {
		c.QQBot = defaults.QQBot
	} else {
		fillMissingMapValues(c.QQBot, defaults.QQBot)
	}
}

func fillMissingMapValues(target map[string]interface{}, defaults map[string]interface{}) {
	for key, value := range defaults {
		if current, ok := target[key]; ok {
			currentMap, currentOK := current.(map[string]interface{})
			defaultMap, defaultOK := value.(map[string]interface{})
			if currentOK && defaultOK && currentMap != nil {
				fillMissingMapValues(currentMap, defaultMap)
			}
			continue
		}
		target[key] = value
	}
}
