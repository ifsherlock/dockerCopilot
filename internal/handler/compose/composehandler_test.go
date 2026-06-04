package compose

import "testing"

func TestComposeProjectNameFromPath(t *testing.T) {
	tests := []struct {
		name string
		path string
		want string
	}{
		{name: "api prefixed", path: "/api/compose/project/media-stack", want: "media-stack"},
		{name: "encoded", path: "/api/compose/project/my%20stack", want: "my stack"},
		{name: "missing", path: "/api/compose/project", want: ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := composeProjectNameFromPath(tt.path); got != tt.want {
				t.Fatalf("composeProjectNameFromPath(%q) = %q, want %q", tt.path, got, tt.want)
			}
		})
	}
}
