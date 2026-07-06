package storecatalog

type Source struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	URL     string `json:"url"`
	Enabled bool   `json:"enabled"`
	Builtin bool   `json:"builtin"`
}

type App struct {
	ID          string `json:"id"`
	SourceID    string `json:"sourceId"`
	Name        string `json:"name"`
	Author      string `json:"author"`
	Category    string `json:"category"`
	Description string `json:"description"`
	Icon        string `json:"icon"`
	Image       string `json:"image"`
	Compose     string `json:"compose"`
	UpdatedAt   string `json:"updatedAt"`
}
