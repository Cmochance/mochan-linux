package mailclient

import (
	"bytes"
	"mime"
	"net/mail"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestParseFoldersAndSearch(t *testing.T) {
	folders := ParseFolders([]IMAPPart{
		{Line: `* LIST (\HasNoChildren) "/" "INBOX"`},
		{Line: `* LIST (\HasNoChildren) "/" "Archive/2026"`},
		{Line: `A0001 OK LIST completed`},
	})
	if len(folders) != 2 {
		t.Fatalf("folders len = %d, want 2", len(folders))
	}
	if folders[0].Name != "INBOX" || folders[0].Delimiter != "/" {
		t.Fatalf("first folder = %#v", folders[0])
	}

	uids := ParseSearch([]IMAPPart{{Line: "* SEARCH 1 2 42"}, {Line: "A0002 OK SEARCH completed"}})
	if strings.Join(uids, ",") != "1,2,42" {
		t.Fatalf("uids = %v", uids)
	}
}

func TestParseMessageSummary(t *testing.T) {
	header := []byte("From: =?UTF-8?B?5rWL6K+V?= <sender@example.com>\r\nTo: user@example.com\r\nSubject: =?UTF-8?B?5L2g5aW9?=\r\nDate: Wed, 6 May 2026 10:00:00 +0800\r\n\r\n")
	msg := ParseMessageSummary("INBOX", []IMAPPart{
		{Line: `* 1 FETCH (UID 42 FLAGS (\Seen) RFC822.SIZE 123 BODY[HEADER.FIELDS (FROM TO SUBJECT DATE)] {128}`, Literal: header},
		{Line: `)`},
		{Line: `A0003 OK FETCH completed`},
	})
	if msg.UID != "42" || msg.Folder != "INBOX" || !msg.Seen || msg.Size != 123 {
		t.Fatalf("summary metadata = %#v", msg)
	}
	if msg.From != "测试 <sender@example.com>" || msg.Subject != "你好" {
		t.Fatalf("decoded headers = from %q subject %q", msg.From, msg.Subject)
	}
}

func TestParseMessageDetailPlainText(t *testing.T) {
	raw := []byte("From: sender@example.com\r\nTo: user@example.com\r\nSubject: hello\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nLine one\nLine two")
	msg, err := ParseMessageDetail("INBOX", "99", raw)
	if err != nil {
		t.Fatal(err)
	}
	if msg.UID != "99" || msg.Subject != "hello" || !strings.Contains(msg.BodyText, "Line two") {
		t.Fatalf("message detail = %#v", msg)
	}
}

func TestBuildMessageWithAttachment(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "report.txt")
	if err := os.WriteFile(path, []byte("attachment body"), 0o600); err != nil {
		t.Fatal(err)
	}
	from, err := mail.ParseAddress("sender@example.com")
	if err != nil {
		t.Fatal(err)
	}
	payload, err := buildMessage(from, OutgoingMessage{
		To:      []string{"user@example.com"},
		Subject: "Monthly report",
		Body:    "See attachment.",
		Attachments: []SendAttachment{
			{Path: path},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	parsed, err := mail.ReadMessage(bytes.NewReader(payload))
	if err != nil {
		t.Fatal(err)
	}
	contentType := parsed.Header.Get("Content-Type")
	mediaType, params, err := mime.ParseMediaType(contentType)
	if err != nil {
		t.Fatal(err)
	}
	if mediaType != "multipart/mixed" || params["boundary"] == "" {
		t.Fatalf("content type = %q params = %v", mediaType, params)
	}
	if !bytes.Contains(payload, []byte("filename=\"report.txt\"")) {
		t.Fatalf("payload does not include attachment filename:\n%s", string(payload))
	}
}

func TestBuildMessageRejectsRelativeAttachment(t *testing.T) {
	from, err := mail.ParseAddress("sender@example.com")
	if err != nil {
		t.Fatal(err)
	}
	_, err = buildMessage(from, OutgoingMessage{
		To:          []string{"user@example.com"},
		Subject:     "bad",
		Body:        "bad",
		Attachments: []SendAttachment{{Path: "relative.txt"}},
	})
	if err == nil {
		t.Fatal("expected relative attachment path error")
	}
}
