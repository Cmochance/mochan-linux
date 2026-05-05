package filetransfer

import "testing"

func TestShellQuote(t *testing.T) {
	got := shellQuote("a'b")
	if got != `'a'"'"'b'` {
		t.Fatalf("shellQuote = %q", got)
	}
}

func TestCleanPaths(t *testing.T) {
	if _, err := cleanLocalPath("relative.txt"); err == nil {
		t.Fatal("relative local path should be rejected")
	}
	if _, err := cleanRemotePath(""); err == nil {
		t.Fatal("empty remote path should be rejected")
	}
	if got, err := cleanRemotePath("/tmp/../var/file.txt"); err != nil || got != "/var/file.txt" {
		t.Fatalf("cleanRemotePath = %q, %v", got, err)
	}
}
