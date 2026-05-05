package bookmarks

import (
	"path/filepath"
	"testing"
)

func TestStoreBookmarkAndFolderCRUD(t *testing.T) {
	store, err := NewStore(filepath.Join(t.TempDir(), "bookmarks"))
	if err != nil {
		t.Fatal(err)
	}

	folder, err := store.AddFolder("Work")
	if err != nil {
		t.Fatal(err)
	}
	bookmark, err := store.AddBookmark(Bookmark{
		Title:       "Example",
		URL:         "https://user:secret@example.com/docs#fragment",
		Description: "Docs",
		FolderID:    folder.ID,
	})
	if err != nil {
		t.Fatal(err)
	}
	if bookmark.URL != "https://example.com/docs" {
		t.Fatalf("url was not normalized safely: %q", bookmark.URL)
	}
	if bookmark.FolderID != folder.ID {
		t.Fatalf("folder id = %q, want %q", bookmark.FolderID, folder.ID)
	}

	visited, err := store.Visit(bookmark.ID)
	if err != nil {
		t.Fatal(err)
	}
	if visited.VisitCount != 1 {
		t.Fatalf("visit count = %d, want 1", visited.VisitCount)
	}

	updated, err := store.UpdateBookmark(bookmark.ID, Bookmark{Title: "Updated", URL: "https://example.org", FolderID: "missing"})
	if err != nil {
		t.Fatal(err)
	}
	if updated.FolderID != "favorites" {
		t.Fatalf("missing folder should fall back to favorites, got %q", updated.FolderID)
	}

	if _, err := store.DeleteBookmark(bookmark.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := store.DeleteFolder(folder.ID); err != nil {
		t.Fatal(err)
	}
}

func TestStoreImportSkipsBadURLs(t *testing.T) {
	store, err := NewStore(filepath.Join(t.TempDir(), "bookmarks"))
	if err != nil {
		t.Fatal(err)
	}
	state, err := store.Import(State{Bookmarks: []Bookmark{
		{Title: "Bad", URL: "javascript:alert(1)"},
		{Title: "Good", URL: "https://example.com"},
	}})
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, bookmark := range state.Bookmarks {
		if bookmark.Title == "Good" {
			found = true
		}
		if bookmark.Title == "Bad" {
			t.Fatalf("bad bookmark was imported: %#v", bookmark)
		}
	}
	if !found {
		t.Fatal("good bookmark was not imported")
	}
}
