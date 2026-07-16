package runtimeconfig

import "os"

func Default(secretKey string) Config {
	apiURL := os.Getenv("DOCKERCOPILOT_API_URL")
	if apiURL == "" {
		apiURL = "http://127.0.0.1:12712"
	}
	if secretKey == "" {
		secretKey = os.Getenv("secretKey")
	}
	return Config{
		Version: "1.0",
		Dockercopilot: map[string]interface{}{
			"multi_instance_enabled": false,
			"default_instance":       "local",
			"service_log_dir":        "",
			"instances": []map[string]interface{}{
				{
					"name":       "local",
					"api_url":    apiURL,
					"secret_key": secretKey,
					"timeout":    30,
				},
			},
		},
		Telegram: map[string]interface{}{
			"bot_token":                 "",
			"chat_ids":                  []string{},
			"polling_interval":          1,
			"interactive_enabled":       true,
			"rich_interactions_enabled": false,
			"parse_mode":                "HTML",
			"update_check_cron":         "*/30 * * * *",
			"notify_on_update":          true,
			"update_blacklist":          []string{},
			"auto_clean_images":         false,
			"clean_images_cron":         "3 2 * * *",
			"auto_update_containers":    false,
			"update_containers_cron":    "0 */6 * * *",
			"scheduled_container_tasks": []map[string]interface{}{},
			"auto_backup_json":          false,
			"backup_json_cron":          "0 1 * * *",
			"auto_backup_compose":       false,
			"backup_compose_cron":       "30 1 * * *",
			"backup_max_files":          20,
			"image_accelerators":        []string{"docker.1ms.run", "docker.xuanyuan.me", "dockerproxy.com"},
			"default_image_accelerator": "docker.1ms.run",
			"theme_mode":                "light",
			"theme_appearance":          "aurora",
			"proxy": map[string]interface{}{
				"type":     "none",
				"host":     "",
				"port":     0,
				"username": "",
				"password": "",
			},
		},
		QQBot: map[string]interface{}{
			"enabled":               false,
			"app_id":                "",
			"app_secret":            "",
			"sandbox":               false,
			"event_mode":            "gateway",
			"allowed_user_openids":  []string{},
			"allowed_group_openids": []string{},
			"notify_targets":        []string{},
			"recent_identities":     []map[string]interface{}{},
			"markdown_enabled":      false,
			"buttons_enabled":       false,
		},
	}
}
