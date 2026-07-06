package blacklist

type Scope string

const (
	ScopeContainer Scope = "container"
	ScopeImage     Scope = "image"
	ScopeProgram   Scope = "program"
)

type MatchMode string

const (
	MatchExact MatchMode = "exact"
	MatchRepo  MatchMode = "repo"
	MatchTag   MatchMode = "tag"
)

type Rule struct {
	Scope   Scope     `json:"scope"`
	Key     string    `json:"key"`
	Match   MatchMode `json:"match"`
	Enabled bool      `json:"enabled"`
}

type Target struct {
	Scope           Scope
	ContainerName   string
	ImageRef        string
	CreatedImageRef string
	ProgramName     string
}
