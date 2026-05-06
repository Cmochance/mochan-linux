package audit

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

func TestRotationKeepsActiveWriterAndArchivesOld(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "audit.log")
	l, err := New(path)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = l.Close() })

	// Force rotation by writing a known-old marker, then rotating manually.
	l.Log(context.Background(), Event{Type: "marker.old"})

	l.mu.Lock()
	if err := l.rotateLocked(); err != nil {
		l.mu.Unlock()
		t.Fatalf("rotateLocked: %v", err)
	}
	l.mu.Unlock()

	// New active log must accept further writes.
	l.Log(context.Background(), Event{Type: "marker.new"})

	active, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(active), `"type":"marker.new"`) {
		t.Fatalf("active log missing post-rotation entry: %s", active)
	}
	if strings.Contains(string(active), `"type":"marker.old"`) {
		t.Fatalf("active log still contains pre-rotation entry: %s", active)
	}

	archived, err := os.ReadFile(path + ".1")
	if err != nil {
		t.Fatalf("archived log missing: %v", err)
	}
	if !strings.Contains(string(archived), `"type":"marker.old"`) {
		t.Fatalf("archived log missing pre-rotation entry: %s", archived)
	}
}

func TestRotationDropsOlderArchive(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "audit.log")
	l, err := New(path)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = l.Close() })

	for i := 0; i < 3; i++ {
		l.Log(context.Background(), Event{Type: "round", Detail: map[string]any{"n": i}})
		l.mu.Lock()
		if err := l.rotateLocked(); err != nil {
			l.mu.Unlock()
			t.Fatalf("rotation %d: %v", i, err)
		}
		l.mu.Unlock()
	}

	// Only one rotation file is kept; older content is gone.
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	var names []string
	for _, e := range entries {
		names = append(names, e.Name())
	}
	wantNames := map[string]bool{"audit.log": true, "audit.log.1": true}
	if len(entries) != 2 || !wantNames[names[0]] || !wantNames[names[1]] {
		t.Fatalf("after multiple rotations files = %v, want only audit.log + audit.log.1", names)
	}
}

func TestConcurrentLogIsSerialized(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "audit.log")
	l, err := New(path)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = l.Close() })

	var wg sync.WaitGroup
	const writers = 16
	const perWriter = 32
	for i := 0; i < writers; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			for j := 0; j < perWriter; j++ {
				l.Log(context.Background(), Event{Type: "concurrent", Actor: "w", Detail: map[string]any{"id": id, "j": j}})
			}
		}(i)
	}
	wg.Wait()

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	lines := strings.Split(strings.TrimRight(string(data), "\n"), "\n")
	if len(lines) != writers*perWriter {
		t.Fatalf("got %d lines, want %d", len(lines), writers*perWriter)
	}
	// Each line must be a complete JSON object — no torn writes.
	for i, line := range lines {
		if !strings.HasPrefix(line, "{") || !strings.HasSuffix(line, "}") {
			t.Fatalf("line %d not framed JSON: %q", i, line)
		}
	}
}
