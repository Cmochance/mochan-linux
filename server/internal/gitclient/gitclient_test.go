package gitclient

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

func TestStoreAddStatusStageAndCommit(t *testing.T) {
	root := t.TempDir()
	canonicalRoot, err := filepath.EvalSymlinks(root)
	if err != nil {
		t.Fatal(err)
	}
	mustGit(t, root, "init", "-b", "main")
	mustGit(t, root, "config", "user.name", "Test User")
	mustGit(t, root, "config", "user.email", "test@example.com")
	if err := os.WriteFile(filepath.Join(root, "README.md"), []byte("hello\n"), 0o640); err != nil {
		t.Fatal(err)
	}

	store, err := NewStore(filepath.Join(t.TempDir(), "git"))
	if err != nil {
		t.Fatal(err)
	}
	repo, err := store.Add(root, "")
	if err != nil {
		t.Fatal(err)
	}
	if repo.Path != canonicalRoot {
		t.Fatalf("repo path = %q, want %q", repo.Path, canonicalRoot)
	}

	status, err := repoStatus(context.Background(), repo)
	if err != nil {
		t.Fatal(err)
	}
	if len(status.Files) != 1 || status.Files[0].Path != "README.md" || status.Files[0].Change != "added" {
		t.Fatalf("unexpected status: %#v", status.Files)
	}

	if _, err := runGit(context.Background(), repo.Path, "add", "--", "README.md"); err != nil {
		t.Fatal(err)
	}
	status, err = repoStatus(context.Background(), repo)
	if err != nil {
		t.Fatal(err)
	}
	if len(status.Files) != 1 || !status.Files[0].Staged {
		t.Fatalf("expected staged file: %#v", status.Files)
	}

	if _, err := runGit(context.Background(), repo.Path, "commit", "-m", "initial commit"); err != nil {
		t.Fatal(err)
	}
	status, err = repoStatus(context.Background(), repo)
	if err != nil {
		t.Fatal(err)
	}
	if !status.WorkingTreeOK {
		t.Fatalf("expected clean working tree: %#v", status.Files)
	}
}

func TestRedactSecrets(t *testing.T) {
	got := redactSecrets("https://user:pass@example.com/repo.git token=abc123")
	if got != "https://<redacted>@example.com/repo.git token=<redacted>" {
		t.Fatalf("redacted output = %q", got)
	}
}

func mustGit(t *testing.T, dir string, args ...string) {
	t.Helper()
	if out, err := runGit(context.Background(), dir, args...); err != nil {
		t.Fatalf("git %v failed: %v\n%s", args, err, out)
	}
}
