package guiapps

import (
	"bufio"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// DesktopApp is one parsed .desktop entry. Fields are intentionally
// minimal — enough to render a launcher tile and feed `command` back
// into Launch.
type DesktopApp struct {
	ID      string `json:"id"`      // basename without .desktop, used as a stable client-side key
	Name    string `json:"name"`    // localized display name (Name= or Name[zh_CN]= etc., we just take Name=)
	Exec    string `json:"exec"`    // raw Exec= line, with %F/%U/%i/%c/%k stripped
	Icon    string `json:"icon"`    // icon name or absolute path; consumed loosely by the UI
	Comment string `json:"comment"` // optional Comment= field
}

// scanDirs are the standard locations where Linux distros publish app
// launchers. We only scan, don't follow symlinks aggressively, so any
// duplicate Names will appear as duplicate tiles — fine for now.
var scanDirs = []string{
	"/usr/share/applications",
	"/usr/local/share/applications",
	"/var/lib/flatpak/exports/share/applications",
	"/var/lib/snapd/desktop/applications",
}

// ListAppsHandler returns the http.HandlerFunc for `GET /api/gui/apps`,
// which scans system-wide .desktop directories and returns the parsed
// entries. Wired in from main.go alongside the rest of the gui routes.
func (h *Handler) ListAppsHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		apps, err := listDesktopApps()
		if err != nil {
			http.Error(w, "scan failed: "+err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"apps": apps})
	}
}

// listDesktopApps walks scanDirs and returns the parsed entries,
// sorted by display name. Entries with NoDisplay=true, Hidden=true,
// or no Exec= are skipped — they're either internal (mimeapps,
// shim entries) or hidden by maintainer intent.
func listDesktopApps() ([]DesktopApp, error) {
	seen := map[string]bool{}
	var out []DesktopApp
	for _, dir := range scanDirs {
		entries, err := os.ReadDir(dir)
		if err != nil {
			if errors.Is(err, os.ErrNotExist) {
				continue
			}
			return nil, err
		}
		for _, e := range entries {
			if e.IsDir() || !strings.HasSuffix(e.Name(), ".desktop") {
				continue
			}
			full := filepath.Join(dir, e.Name())
			app, ok := parseDesktopFile(full)
			if !ok {
				continue
			}
			if seen[app.ID] {
				continue
			}
			seen[app.ID] = true
			out = append(out, app)
		}
	}
	sort.Slice(out, func(i, j int) bool {
		return strings.ToLower(out[i].Name) < strings.ToLower(out[j].Name)
	})
	return out, nil
}

// parseDesktopFile reads a .desktop file's [Desktop Entry] section,
// returning false if the entry should be skipped (NoDisplay/Hidden,
// missing Name or Exec, or not Type=Application).
func parseDesktopFile(path string) (DesktopApp, bool) {
	f, err := os.Open(path)
	if err != nil {
		return DesktopApp{}, false
	}
	defer f.Close()

	var (
		entry      DesktopApp
		typ        string
		noDisplay  bool
		hidden     bool
		inSection  bool
	)

	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 16*1024), 256*1024)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		if strings.HasPrefix(line, "[") {
			// .desktop allows many [Section] groups (e.g. Desktop Action *).
			// We only honor the canonical [Desktop Entry].
			inSection = line == "[Desktop Entry]"
			if !inSection && entry.Name != "" {
				// We've already collected the main section — stop.
				break
			}
			continue
		}
		if !inSection {
			continue
		}
		k, v, ok := splitKV(line)
		if !ok {
			continue
		}
		switch k {
		case "Type":
			typ = v
		case "Name":
			if entry.Name == "" {
				entry.Name = v
			}
		case "Exec":
			entry.Exec = stripDesktopFieldCodes(v)
		case "Icon":
			entry.Icon = v
		case "Comment":
			if entry.Comment == "" {
				entry.Comment = v
			}
		case "NoDisplay":
			noDisplay = strings.EqualFold(v, "true")
		case "Hidden":
			hidden = strings.EqualFold(v, "true")
		}
	}
	if entry.Name == "" || entry.Exec == "" || typ != "Application" || noDisplay || hidden {
		return DesktopApp{}, false
	}
	entry.ID = strings.TrimSuffix(filepath.Base(path), ".desktop")
	return entry, true
}

// splitKV splits "Key=Value" (also "Key[locale]=Value", whose key we
// strip down to "Key"). Returns (key, value, ok).
func splitKV(line string) (string, string, bool) {
	eq := strings.IndexByte(line, '=')
	if eq <= 0 {
		return "", "", false
	}
	k := line[:eq]
	v := line[eq+1:]
	if br := strings.IndexByte(k, '['); br > 0 {
		k = k[:br]
	}
	return strings.TrimSpace(k), v, true
}

// stripDesktopFieldCodes removes the %f/%F/%u/%U/%i/%c/%k tokens
// xdg-spec defines for Exec=. None of them mean anything in our
// "fire and forget" launch, and leaving them in would confuse xpra's
// shell parsing.
func stripDesktopFieldCodes(s string) string {
	out := strings.Builder{}
	for i := 0; i < len(s); i++ {
		if s[i] == '%' && i+1 < len(s) {
			c := s[i+1]
			if (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') {
				i++ // skip %X
				continue
			}
		}
		out.WriteByte(s[i])
	}
	return strings.TrimSpace(out.String())
}

