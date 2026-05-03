package static

import (
	"embed"
	"io/fs"
)

//go:embed all:dist
var distFS embed.FS

// FS returns the embedded web/dist filesystem rooted at "dist".
func FS() (fs.FS, error) {
	return fs.Sub(distFS, "dist")
}
