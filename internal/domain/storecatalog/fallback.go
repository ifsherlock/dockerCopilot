package storecatalog

import (
	"fmt"
	"strings"
)

func fallbackApps() []App {
	return []App{
		{ID: "fallback-bazarr", SourceID: "fallback", Name: "Bazarr", Author: "linuxserver", Category: "Media", Description: "Subtitle companion for Sonarr and Radarr.", Image: "lscr.io/linuxserver/bazarr:latest", Compose: fallbackCompose("bazarr", "lscr.io/linuxserver/bazarr:latest", "6767")},
		{ID: "fallback-calibre-web", SourceID: "fallback", Name: "Calibre Web", Author: "linuxserver", Category: "Media", Description: "Web app for browsing and downloading e-books.", Image: "lscr.io/linuxserver/calibre-web:latest", Compose: fallbackCompose("calibre-web", "lscr.io/linuxserver/calibre-web:latest", "8083")},
		{ID: "fallback-cloudbeaver", SourceID: "fallback", Name: "CloudBeaver", Author: "dbeaver", Category: "Developer", Description: "Web database management tool.", Image: "dbeaver/cloudbeaver:latest", Compose: fallbackCompose("cloudbeaver", "dbeaver/cloudbeaver:latest", "8978")},
		{ID: "fallback-next-web", SourceID: "fallback", Name: "ChatGPT Next Web", Author: "Yidadaa", Category: "AI", Description: "A well-known ChatGPT web UI.", Image: "yidadaa/chatgpt-next-web:latest", Compose: fallbackCompose("chatgpt-next-web", "yidadaa/chatgpt-next-web:latest", "3000")},
	}
}

func fallbackCompose(name string, imageName string, port string) string {
	lines := []string{"services:", "  " + name + ":", "    image: " + imageName, "    container_name: " + name, "    restart: unless-stopped"}
	if strings.TrimSpace(port) != "" {
		lines = append(lines, "    ports:", fmt.Sprintf("      - \"%s:%s\"", port, port))
	}
	lines = append(lines, "    volumes:", "      - ./data/"+name+":/config", "    environment:", "      - TZ=Asia/Shanghai")
	return strings.Join(lines, "\n") + "\n"
}
