package trash

import (
	"encoding/json"
	"errors"
	"io/fs"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/alysechen/mochan-linux/server/internal/audit"
)

func TestStoreMoveListRestore(t *testing.T) {
	store, err := NewStore(filepath.Join(t.TempDir(), "trash"))
	if err != nil {
		t.Fatal(err)
	}
	root := t.TempDir()
	source := filepath.Join(root, "note.txt")
	if err := os.WriteFile(source, []byte("hello"), 0o644); err != nil {
		t.Fatal(err)
	}

	item, err := store.Move(source)
	if err != nil {
		t.Fatal(err)
	}
	if item.Name != "note.txt" || item.OriginalPath != source || item.IsDir || item.Size != 5 {
		t.Fatalf("bad item: %#v", item)
	}
	if _, err := os.Lstat(source); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("source still exists after move: %v", err)
	}
	if list := store.List(); len(list) != 1 || list[0].ID != item.ID {
		t.Fatalf("bad list: %#v", list)
	}

	restored, err := store.Restore(item.ID)
	if err != nil {
		t.Fatal(err)
	}
	if restored.ID != item.ID {
		t.Fatalf("bad restored item: %#v", restored)
	}
	buf, err := os.ReadFile(source)
	if err != nil {
		t.Fatal(err)
	}
	if string(buf) != "hello" {
		t.Fatalf("restored content = %q", string(buf))
	}
	if list := store.List(); len(list) != 0 {
		t.Fatalf("trash should be empty: %#v", list)
	}
}

func TestRestoreCollisionKeepsTrashItem(t *testing.T) {
	store, err := NewStore(filepath.Join(t.TempDir(), "trash"))
	if err != nil {
		t.Fatal(err)
	}
	root := t.TempDir()
	source := filepath.Join(root, "note.txt")
	if err := os.WriteFile(source, []byte("old"), 0o644); err != nil {
		t.Fatal(err)
	}
	item, err := store.Move(source)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(source, []byte("new"), 0o644); err != nil {
		t.Fatal(err)
	}

	if _, err := store.Restore(item.ID); !errors.Is(err, ErrDestinationExists) {
		t.Fatalf("Restore error = %v, want ErrDestinationExists", err)
	}
	if list := store.List(); len(list) != 1 || list[0].ID != item.ID {
		t.Fatalf("trash item should remain after collision: %#v", list)
	}
	buf, err := os.ReadFile(source)
	if err != nil {
		t.Fatal(err)
	}
	if string(buf) != "new" {
		t.Fatalf("collision destination changed: %q", string(buf))
	}
}

func TestStoreDeleteAndEmpty(t *testing.T) {
	store, err := NewStore(filepath.Join(t.TempDir(), "trash"))
	if err != nil {
		t.Fatal(err)
	}
	root := t.TempDir()
	first := mustTrashFile(t, store, root, "a.txt")
	second := mustTrashFile(t, store, root, "b.txt")

	deleted, err := store.Delete([]string{first.ID})
	if err != nil {
		t.Fatal(err)
	}
	if deleted != 1 {
		t.Fatalf("deleted = %d, want 1", deleted)
	}
	if _, err := store.Restore(first.ID); !errors.Is(err, fs.ErrNotExist) {
		t.Fatalf("deleted item restore error = %v, want not exist", err)
	}

	deleted, err = store.Empty()
	if err != nil {
		t.Fatal(err)
	}
	if deleted != 1 {
		t.Fatalf("empty deleted = %d, want 1", deleted)
	}
	if _, err := store.Restore(second.ID); !errors.Is(err, fs.ErrNotExist) {
		t.Fatalf("emptied item restore error = %v, want not exist", err)
	}
}

func TestStoreRejectsUnsafeInput(t *testing.T) {
	base := filepath.Join(t.TempDir(), "trash")
	store, err := NewStore(base)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.Move("relative.txt"); err == nil {
		t.Fatal("expected relative path error")
	}
	if _, err := store.Restore("../bad"); !errors.Is(err, ErrInvalidID) {
		t.Fatalf("Restore invalid id error = %v, want ErrInvalidID", err)
	}
	if _, err := store.Delete([]string{"not-hex"}); !errors.Is(err, ErrInvalidID) {
		t.Fatalf("Delete invalid id error = %v, want ErrInvalidID", err)
	}
	if _, err := store.Move(base); !errors.Is(err, ErrProtectedPath) {
		t.Fatalf("Move protected path error = %v, want ErrProtectedPath", err)
	}
}

func TestHandlerRoutesAndAudit(t *testing.T) {
	root := t.TempDir()
	source := filepath.Join(root, "note.txt")
	if err := os.WriteFile(source, []byte("hello"), 0o644); err != nil {
		t.Fatal(err)
	}
	store, err := NewStore(filepath.Join(root, "trash"))
	if err != nil {
		t.Fatal(err)
	}
	auditLog, err := audit.New(filepath.Join(root, "audit.log"))
	if err != nil {
		t.Fatal(err)
	}
	defer auditLog.Close()

	r := chi.NewRouter()
	NewHandler(store, auditLog).Mount(r)

	req := httptest.NewRequest(http.MethodPost, "/move", strings.NewReader(`{"path":`+quoteJSON(source)+`}`))
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("MOVE status = %d body=%s", rec.Code, rec.Body.String())
	}
	var item Item
	if err := json.Unmarshal(rec.Body.Bytes(), &item); err != nil {
		t.Fatal(err)
	}

	req = httptest.NewRequest(http.MethodGet, "/list", nil)
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), item.ID) {
		t.Fatalf("LIST status = %d body=%s", rec.Code, rec.Body.String())
	}

	req = httptest.NewRequest(http.MethodPost, "/restore", strings.NewReader(`{"id":"`+item.ID+`"}`))
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("RESTORE status = %d body=%s", rec.Code, rec.Body.String())
	}
	if _, err := os.Stat(source); err != nil {
		t.Fatal(err)
	}
	auditBytes, err := os.ReadFile(auditLog.Path())
	if err != nil {
		t.Fatal(err)
	}
	auditText := string(auditBytes)
	if !strings.Contains(auditText, `"type":"trash.move"`) || !strings.Contains(auditText, `"type":"trash.restore"`) {
		t.Fatalf("missing trash audit events: %s", auditText)
	}
}

func mustTrashFile(t *testing.T, store *Store, root, name string) Item {
	t.Helper()
	source := filepath.Join(root, name)
	if err := os.WriteFile(source, []byte(name), 0o644); err != nil {
		t.Fatal(err)
	}
	item, err := store.Move(source)
	if err != nil {
		t.Fatal(err)
	}
	return item
}

func quoteJSON(s string) string {
	buf, _ := json.Marshal(s)
	return string(buf)
}
