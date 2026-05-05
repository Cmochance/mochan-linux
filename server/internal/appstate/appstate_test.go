package appstate

import (
	"encoding/json"
	"errors"
	"io/fs"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
)

func TestStorePutGetPatchListDelete(t *testing.T) {
	store, err := NewStore(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}

	doc, err := store.Put("notes", json.RawMessage(`{"items":[{"id":"n1"}],"filter":"all"}`))
	if err != nil {
		t.Fatal(err)
	}
	if doc.AppID != "notes" || !json.Valid(doc.Data) {
		t.Fatalf("bad doc: %#v", doc)
	}

	got, err := store.Get("notes")
	if err != nil {
		t.Fatal(err)
	}
	var gotData map[string]any
	if err := json.Unmarshal(got.Data, &gotData); err != nil {
		t.Fatal(err)
	}
	if gotData["filter"] != "all" {
		t.Fatalf("unexpected data: %s", got.Data)
	}

	patched, err := store.Patch("notes", map[string]json.RawMessage{
		"filter": json.RawMessage(`"pinned"`),
		"items":  json.RawMessage(`null`),
	})
	if err != nil {
		t.Fatal(err)
	}
	if string(patched.Data) != `{"filter":"pinned"}` {
		t.Fatalf("unexpected patched data: %s", patched.Data)
	}

	list, err := store.List()
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 1 || list[0].AppID != "notes" || list[0].Size == 0 {
		t.Fatalf("unexpected list: %#v", list)
	}

	if err := store.Delete("notes"); err != nil {
		t.Fatal(err)
	}
	if _, err := store.Get("notes"); !errors.Is(err, fs.ErrNotExist) {
		t.Fatalf("expected not found, got %v", err)
	}
}

func TestStoreRejectsUnsafeInput(t *testing.T) {
	store, err := NewStore(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}

	for _, appID := range []string{"", "../notes", "Notes", "notes.local", strings.Repeat("a", 65)} {
		if _, err := store.Put(appID, json.RawMessage(`{}`)); !errors.Is(err, ErrInvalidAppID) {
			t.Fatalf("Put(%q) error = %v, want ErrInvalidAppID", appID, err)
		}
	}

	if _, err := store.Put("notes", json.RawMessage(`{"unterminated"`)); err == nil {
		t.Fatal("expected malformed json error")
	}
}

func TestHandlerRoutes(t *testing.T) {
	store, err := NewStore(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	r := chi.NewRouter()
	NewHandler(store, nil).Mount(r)

	req := httptest.NewRequest(http.MethodPut, "/notes", strings.NewReader(`{"data":{"items":[]}}`))
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("PUT status = %d body=%s", rec.Code, rec.Body.String())
	}

	req = httptest.NewRequest(http.MethodGet, "/notes", nil)
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET status = %d body=%s", rec.Code, rec.Body.String())
	}
	var doc Document
	if err := json.Unmarshal(rec.Body.Bytes(), &doc); err != nil {
		t.Fatal(err)
	}
	if doc.AppID != "notes" || string(doc.Data) != `{"items":[]}` {
		t.Fatalf("bad response: %#v data=%s", doc, doc.Data)
	}

	req = httptest.NewRequest(http.MethodPatch, "/notes", strings.NewReader(`{"patch":{"selected":"n1"}}`))
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("PATCH status = %d body=%s", rec.Code, rec.Body.String())
	}

	req = httptest.NewRequest(http.MethodGet, "/", nil)
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"app_id":"notes"`) {
		t.Fatalf("LIST status = %d body=%s", rec.Code, rec.Body.String())
	}
}
