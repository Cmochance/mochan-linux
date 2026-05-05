// Package mailclient provides session-only IMAP and SMTP helpers for the
// Email Client app. Mail account credentials are accepted per request and are
// never persisted by this package.
package mailclient

import (
	"bufio"
	"bytes"
	"context"
	"crypto/tls"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"mime/multipart"
	"mime/quotedprintable"
	"net"
	"net/http"
	"net/mail"
	"net/smtp"
	"net/textproto"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync/atomic"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/alysechen/mochan-linux/server/internal/audit"
	"github.com/alysechen/mochan-linux/server/internal/auth"
	"github.com/alysechen/mochan-linux/server/internal/netguard"
)

const (
	maxRequestBytes     = 1 << 20
	maxMessageBytes     = 8 << 20
	maxBodyPreviewBytes = 2 << 20
	maxAttachmentBytes  = 8 << 20
	defaultMessageLimit = 25
	maxMessageLimit     = 100
)

type IMAPAccount struct {
	Host     string `json:"host"`
	Port     int    `json:"port"`
	Security string `json:"security"` // tls, starttls, or plain
	Username string `json:"username"`
	Password string `json:"password"`
}

type SMTPAccount struct {
	Host     string `json:"host"`
	Port     int    `json:"port"`
	Security string `json:"security"` // tls, starttls, or plain
	Username string `json:"username"`
	Password string `json:"password"`
	From     string `json:"from"`
}

type Folder struct {
	Name      string `json:"name"`
	Delimiter string `json:"delimiter,omitempty"`
}

type MessageSummary struct {
	UID     string `json:"uid"`
	Folder  string `json:"folder"`
	From    string `json:"from"`
	To      string `json:"to,omitempty"`
	Subject string `json:"subject"`
	Date    string `json:"date,omitempty"`
	Size    int64  `json:"size,omitempty"`
	Seen    bool   `json:"seen"`
}

type Attachment struct {
	Filename    string `json:"filename"`
	ContentType string `json:"content_type"`
	Size        int64  `json:"size"`
}

type MessageDetail struct {
	MessageSummary
	BodyText    string       `json:"body_text"`
	BodyHTML    string       `json:"body_html,omitempty"`
	Attachments []Attachment `json:"attachments,omitempty"`
}

type SendAttachment struct {
	Path string `json:"path"`
}

type OutgoingMessage struct {
	To          []string         `json:"to"`
	CC          []string         `json:"cc,omitempty"`
	BCC         []string         `json:"bcc,omitempty"`
	Subject     string           `json:"subject"`
	Body        string           `json:"body"`
	Attachments []SendAttachment `json:"attachments,omitempty"`
}

type Handler struct {
	audit *audit.Logger
}

func NewHandler(a *audit.Logger) *Handler {
	return &Handler{audit: a}
}

func (h *Handler) Mount(r chi.Router) {
	r.Post("/connect", h.connect)
	r.Post("/folders", h.folders)
	r.Post("/messages", h.messages)
	r.Post("/message", h.message)
	r.Post("/send", h.send)
}

func (h *Handler) connect(w http.ResponseWriter, r *http.Request) {
	var req struct {
		IMAP *IMAPAccount `json:"imap,omitempty"`
		SMTP *SMTPAccount `json:"smtp,omitempty"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	out := map[string]any{}
	if req.IMAP != nil {
		folders, err := ListFolders(ctx, *req.IMAP)
		h.auditEvent(r, "mail.connect", auditDetail("imap", req.IMAP.Host, req.IMAP.Port, "", err))
		if err != nil {
			writeErr(w, err)
			return
		}
		out["imap"] = map[string]any{"ok": true, "folders": folders}
	}
	if req.SMTP != nil && strings.TrimSpace(req.SMTP.Host) != "" {
		err := TestSMTP(ctx, *req.SMTP)
		h.auditEvent(r, "mail.connect", auditDetail("smtp", req.SMTP.Host, req.SMTP.Port, "", err))
		if err != nil {
			writeErr(w, err)
			return
		}
		out["smtp"] = map[string]any{"ok": true}
	}
	writeJSON(w, http.StatusOK, out)
}

func (h *Handler) folders(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Account IMAPAccount `json:"account"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	folders, err := ListFolders(ctx, req.Account)
	h.auditEvent(r, "mail.imap.list", auditDetail("imap", req.Account.Host, req.Account.Port, "", err))
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"folders": folders})
}

func (h *Handler) messages(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Account IMAPAccount `json:"account"`
		Folder  string      `json:"folder"`
		Limit   int         `json:"limit"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 45*time.Second)
	defer cancel()
	msgs, err := ListMessages(ctx, req.Account, req.Folder, req.Limit)
	h.auditEvent(r, "mail.imap.messages", auditDetail("imap", req.Account.Host, req.Account.Port, req.Folder, err))
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"messages": msgs})
}

func (h *Handler) message(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Account IMAPAccount `json:"account"`
		Folder  string      `json:"folder"`
		UID     string      `json:"uid"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 45*time.Second)
	defer cancel()
	msg, err := FetchMessage(ctx, req.Account, req.Folder, req.UID)
	h.auditEvent(r, "mail.imap.message", auditDetail("imap", req.Account.Host, req.Account.Port, req.Folder, err))
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, msg)
}

func (h *Handler) send(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Account SMTPAccount     `json:"account"`
		Message OutgoingMessage `json:"message"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 45*time.Second)
	defer cancel()
	err := Send(ctx, req.Account, req.Message)
	detail := auditDetail("smtp", req.Account.Host, req.Account.Port, "", err)
	detail["recipients"] = len(req.Message.To) + len(req.Message.CC) + len(req.Message.BCC)
	detail["attachments"] = len(req.Message.Attachments)
	h.auditEvent(r, "mail.smtp.send", detail)
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func ListFolders(ctx context.Context, account IMAPAccount) ([]Folder, error) {
	c, err := openIMAP(ctx, account)
	if err != nil {
		return nil, err
	}
	defer c.close()
	parts, err := c.command(`LIST "" "*"`)
	if err != nil {
		return nil, err
	}
	folders := ParseFolders(parts)
	if len(folders) == 0 {
		folders = []Folder{{Name: "INBOX"}}
	}
	return folders, nil
}

func ListMessages(ctx context.Context, account IMAPAccount, folder string, limit int) ([]MessageSummary, error) {
	folder = cleanFolder(folder)
	if limit <= 0 {
		limit = defaultMessageLimit
	}
	if limit > maxMessageLimit {
		limit = maxMessageLimit
	}
	c, err := openIMAP(ctx, account)
	if err != nil {
		return nil, err
	}
	defer c.close()
	if _, err := c.command("EXAMINE " + imapQuote(folder)); err != nil {
		return nil, err
	}
	parts, err := c.command("UID SEARCH ALL")
	if err != nil {
		return nil, err
	}
	uids := ParseSearch(parts)
	if len(uids) > limit {
		uids = uids[len(uids)-limit:]
	}
	out := make([]MessageSummary, 0, len(uids))
	for i := len(uids) - 1; i >= 0; i-- {
		parts, err := c.command("UID FETCH " + uids[i] + " (UID FLAGS RFC822.SIZE BODY.PEEK[HEADER.FIELDS (FROM TO SUBJECT DATE)])")
		if err != nil {
			return nil, err
		}
		msg := ParseMessageSummary(folder, parts)
		if msg.UID == "" {
			msg.UID = uids[i]
		}
		out = append(out, msg)
	}
	return out, nil
}

func FetchMessage(ctx context.Context, account IMAPAccount, folder string, uid string) (MessageDetail, error) {
	folder = cleanFolder(folder)
	uid = strings.TrimSpace(uid)
	if !regexp.MustCompile(`^[0-9]+$`).MatchString(uid) {
		return MessageDetail{}, errors.New("uid must be numeric")
	}
	c, err := openIMAP(ctx, account)
	if err != nil {
		return MessageDetail{}, err
	}
	defer c.close()
	if _, err := c.command("EXAMINE " + imapQuote(folder)); err != nil {
		return MessageDetail{}, err
	}
	parts, err := c.command("UID FETCH " + uid + " (UID FLAGS RFC822.SIZE BODY.PEEK[])")
	if err != nil {
		return MessageDetail{}, err
	}
	raw := firstLiteral(parts)
	if len(raw) == 0 {
		return MessageDetail{}, errors.New("message body not returned by IMAP server")
	}
	return ParseMessageDetail(folder, uid, raw)
}

func TestSMTP(ctx context.Context, account SMTPAccount) error {
	c, err := openSMTP(ctx, account)
	if err != nil {
		return err
	}
	defer c.Close()
	return c.Noop()
}

func Send(ctx context.Context, account SMTPAccount, msg OutgoingMessage) error {
	from, err := validateSMTPAccount(&account)
	if err != nil {
		return err
	}
	recipients, err := validateRecipients(msg)
	if err != nil {
		return err
	}
	payload, err := buildMessage(from, msg)
	if err != nil {
		return err
	}
	c, err := openSMTP(ctx, account)
	if err != nil {
		return err
	}
	defer c.Close()
	if err := c.Mail(from.Address); err != nil {
		return err
	}
	for _, rcpt := range recipients {
		if err := c.Rcpt(rcpt.Address); err != nil {
			return err
		}
	}
	wc, err := c.Data()
	if err != nil {
		return err
	}
	if _, err := wc.Write(payload); err != nil {
		_ = wc.Close()
		return err
	}
	if err := wc.Close(); err != nil {
		return err
	}
	return c.Quit()
}

type imapClient struct {
	conn net.Conn
	r    *bufio.Reader
	w    *bufio.Writer
	tag  atomic.Uint64
}

type IMAPPart struct {
	Line    string
	Literal []byte
}

func openIMAP(ctx context.Context, account IMAPAccount) (*imapClient, error) {
	if err := validateIMAPAccount(&account); err != nil {
		return nil, err
	}
	conn, err := dialMail(ctx, account.Host, account.Port, account.Security)
	if err != nil {
		return nil, err
	}
	c := &imapClient{conn: conn, r: bufio.NewReader(conn), w: bufio.NewWriter(conn)}
	if _, err := c.readLine(); err != nil {
		_ = conn.Close()
		return nil, err
	}
	if normalizeSecurity(account.Security, account.Port, 993) == "starttls" {
		if _, err := c.command("STARTTLS"); err != nil {
			_ = conn.Close()
			return nil, err
		}
		tlsConn := tls.Client(conn, tlsConfig(account.Host))
		if err := tlsConn.HandshakeContext(ctx); err != nil {
			_ = conn.Close()
			return nil, err
		}
		c.conn = tlsConn
		c.r = bufio.NewReader(tlsConn)
		c.w = bufio.NewWriter(tlsConn)
	}
	if _, err := c.command("LOGIN " + imapQuote(account.Username) + " " + imapQuote(account.Password)); err != nil {
		_ = c.close()
		return nil, err
	}
	return c, nil
}

func (c *imapClient) close() error {
	if c.conn == nil {
		return nil
	}
	_, _ = c.command("LOGOUT")
	return c.conn.Close()
}

func (c *imapClient) command(cmd string) ([]IMAPPart, error) {
	tag := fmt.Sprintf("A%04d", c.tag.Add(1))
	if err := c.conn.SetDeadline(time.Now().Add(30 * time.Second)); err != nil {
		return nil, err
	}
	if _, err := fmt.Fprintf(c.w, "%s %s\r\n", tag, cmd); err != nil {
		return nil, err
	}
	if err := c.w.Flush(); err != nil {
		return nil, err
	}
	var parts []IMAPPart
	for {
		line, err := c.readLine()
		if err != nil {
			return parts, err
		}
		part := IMAPPart{Line: line}
		if n, ok := literalSize(line); ok {
			if n > maxMessageBytes {
				return parts, errors.New("imap literal is too large")
			}
			part.Literal = make([]byte, n)
			if _, err := io.ReadFull(c.r, part.Literal); err != nil {
				return parts, err
			}
		}
		parts = append(parts, part)
		if strings.HasPrefix(line, tag+" ") {
			if strings.Contains(strings.ToUpper(line), " OK") {
				return parts, nil
			}
			return parts, fmt.Errorf("imap command failed: %s", strings.TrimSpace(line))
		}
	}
}

func (c *imapClient) readLine() (string, error) {
	line, err := c.r.ReadString('\n')
	if err != nil {
		return line, err
	}
	return strings.TrimRight(line, "\r\n"), nil
}

func openSMTP(ctx context.Context, account SMTPAccount) (*smtp.Client, error) {
	if _, err := validateSMTPAccount(&account); err != nil {
		return nil, err
	}
	conn, err := dialMail(ctx, account.Host, account.Port, account.Security)
	if err != nil {
		return nil, err
	}
	c, err := smtp.NewClient(conn, account.Host)
	if err != nil {
		_ = conn.Close()
		return nil, err
	}
	if normalizeSecurity(account.Security, account.Port, 465) == "starttls" {
		if err := c.StartTLS(tlsConfig(account.Host)); err != nil {
			_ = c.Close()
			return nil, err
		}
	}
	if account.Username != "" {
		if err := c.Auth(smtp.PlainAuth("", account.Username, account.Password, account.Host)); err != nil {
			_ = c.Close()
			return nil, err
		}
	}
	return c, nil
}

func dialMail(ctx context.Context, host string, port int, security string) (net.Conn, error) {
	address := net.JoinHostPort(host, strconv.Itoa(port))
	raw, err := netguard.GuardedDialContext(ctx, "tcp", address)
	if err != nil {
		return nil, err
	}
	if normalizeSecurity(security, port, 993) != "tls" && normalizeSecurity(security, port, 465) != "tls" {
		return raw, nil
	}
	tlsConn := tls.Client(raw, tlsConfig(host))
	if err := tlsConn.HandshakeContext(ctx); err != nil {
		_ = raw.Close()
		return nil, err
	}
	return tlsConn, nil
}

func validateIMAPAccount(account *IMAPAccount) error {
	account.Host = strings.TrimSpace(account.Host)
	account.Username = strings.TrimSpace(account.Username)
	if account.Host == "" {
		return errors.New("imap host is required")
	}
	if account.Port <= 0 || account.Port > 65535 {
		return errors.New("imap port is invalid")
	}
	if account.Username == "" || account.Password == "" {
		return errors.New("imap username and password are required")
	}
	security := normalizeSecurity(account.Security, account.Port, 993)
	if security != "tls" && security != "starttls" && security != "plain" {
		return errors.New("imap security must be tls, starttls, or plain")
	}
	account.Security = security
	return nil
}

func validateSMTPAccount(account *SMTPAccount) (*mail.Address, error) {
	account.Host = strings.TrimSpace(account.Host)
	account.Username = strings.TrimSpace(account.Username)
	account.From = strings.TrimSpace(account.From)
	if account.Host == "" {
		return nil, errors.New("smtp host is required")
	}
	if account.Port <= 0 || account.Port > 65535 {
		return nil, errors.New("smtp port is invalid")
	}
	if account.From == "" {
		account.From = account.Username
	}
	from, err := mail.ParseAddress(account.From)
	if err != nil {
		return nil, errors.New("smtp from address is invalid")
	}
	security := normalizeSecurity(account.Security, account.Port, 465)
	if security != "tls" && security != "starttls" && security != "plain" {
		return nil, errors.New("smtp security must be tls, starttls, or plain")
	}
	account.Security = security
	return from, nil
}

func validateRecipients(msg OutgoingMessage) ([]*mail.Address, error) {
	var all []*mail.Address
	for _, group := range [][]string{msg.To, msg.CC, msg.BCC} {
		if len(group) == 0 {
			continue
		}
		parsed, err := mail.ParseAddressList(strings.Join(group, ","))
		if err != nil {
			return nil, errors.New("recipient address is invalid")
		}
		all = append(all, parsed...)
	}
	if len(all) == 0 {
		return nil, errors.New("at least one recipient is required")
	}
	return all, nil
}

func normalizeSecurity(security string, port int, tlsPort int) string {
	security = strings.ToLower(strings.TrimSpace(security))
	if security == "" || security == "auto" {
		if port == tlsPort {
			return "tls"
		}
		return "starttls"
	}
	return security
}

func tlsConfig(host string) *tls.Config {
	return &tls.Config{ServerName: host, MinVersion: tls.VersionTLS12}
}

func cleanFolder(folder string) string {
	folder = strings.TrimSpace(folder)
	if folder == "" {
		return "INBOX"
	}
	return folder
}

func imapQuote(s string) string {
	s = strings.ReplaceAll(s, `\`, `\\`)
	s = strings.ReplaceAll(s, `"`, `\"`)
	return `"` + s + `"`
}

func literalSize(line string) (int, bool) {
	line = strings.TrimSpace(line)
	if !strings.HasSuffix(line, "}") {
		return 0, false
	}
	i := strings.LastIndex(line, "{")
	if i < 0 {
		return 0, false
	}
	n, err := strconv.Atoi(strings.TrimSuffix(line[i+1:], "}"))
	if err != nil || n < 0 {
		return 0, false
	}
	return n, true
}

func ParseFolders(parts []IMAPPart) []Folder {
	var out []Folder
	seen := map[string]bool{}
	for _, p := range parts {
		line := strings.TrimSpace(p.Line)
		if !strings.HasPrefix(strings.ToUpper(line), "* LIST ") {
			continue
		}
		quoted := parseQuoted(line)
		name := ""
		delimiter := ""
		if len(quoted) >= 2 {
			delimiter = quoted[len(quoted)-2]
			name = quoted[len(quoted)-1]
		} else {
			fields := strings.Fields(line)
			if len(fields) > 0 {
				name = fields[len(fields)-1]
			}
		}
		name = strings.Trim(name, `"`)
		if name == "" || seen[name] {
			continue
		}
		seen[name] = true
		out = append(out, Folder{Name: name, Delimiter: delimiter})
	}
	return out
}

func ParseSearch(parts []IMAPPart) []string {
	for _, p := range parts {
		line := strings.TrimSpace(p.Line)
		if !strings.HasPrefix(strings.ToUpper(line), "* SEARCH") {
			continue
		}
		fields := strings.Fields(line)
		var out []string
		for _, f := range fields[2:] {
			if regexp.MustCompile(`^[0-9]+$`).MatchString(f) {
				out = append(out, f)
			}
		}
		return out
	}
	return nil
}

func ParseMessageSummary(folder string, parts []IMAPPart) MessageSummary {
	allLines := strings.ToUpper(joinLines(parts))
	header := firstLiteral(parts)
	msg := MessageSummary{Folder: folder}
	if uid := capture(`UID\s+([0-9]+)`, allLines); uid != "" {
		msg.UID = uid
	}
	if size := capture(`RFC822\.SIZE\s+([0-9]+)`, allLines); size != "" {
		if n, err := strconv.ParseInt(size, 10, 64); err == nil {
			msg.Size = n
		}
	}
	msg.Seen = strings.Contains(allLines, `\SEEN`)
	if len(header) > 0 {
		if m, err := mail.ReadMessage(bytes.NewReader(header)); err == nil {
			msg.From = decodeHeader(m.Header.Get("From"))
			msg.To = decodeHeader(m.Header.Get("To"))
			msg.Subject = decodeHeader(m.Header.Get("Subject"))
			msg.Date = m.Header.Get("Date")
		}
	}
	return msg
}

func ParseMessageDetail(folder string, uid string, raw []byte) (MessageDetail, error) {
	m, err := mail.ReadMessage(bytes.NewReader(raw))
	if err != nil {
		return MessageDetail{}, err
	}
	summary := MessageSummary{
		UID:     uid,
		Folder:  folder,
		From:    decodeHeader(m.Header.Get("From")),
		To:      decodeHeader(m.Header.Get("To")),
		Subject: decodeHeader(m.Header.Get("Subject")),
		Date:    m.Header.Get("Date"),
		Seen:    true,
	}
	body, err := io.ReadAll(io.LimitReader(m.Body, maxMessageBytes+1))
	if err != nil {
		return MessageDetail{}, err
	}
	if len(body) > maxMessageBytes {
		return MessageDetail{}, errors.New("message body is too large")
	}
	detail := MessageDetail{MessageSummary: summary}
	contentType, params, _ := mime.ParseMediaType(m.Header.Get("Content-Type"))
	if strings.HasPrefix(strings.ToLower(contentType), "multipart/") {
		mr := multipart.NewReader(bytes.NewReader(body), params["boundary"])
		for {
			part, err := mr.NextPart()
			if errors.Is(err, io.EOF) {
				break
			}
			if err != nil {
				break
			}
			partBody, _ := io.ReadAll(io.LimitReader(decodedPart(part), maxBodyPreviewBytes+1))
			filename := part.FileName()
			partType, _, _ := mime.ParseMediaType(part.Header.Get("Content-Type"))
			if filename != "" {
				detail.Attachments = append(detail.Attachments, Attachment{Filename: filename, ContentType: partType, Size: int64(len(partBody))})
				continue
			}
			switch strings.ToLower(partType) {
			case "text/plain":
				if detail.BodyText == "" {
					detail.BodyText = string(partBody)
				}
			case "text/html":
				if detail.BodyHTML == "" {
					detail.BodyHTML = string(partBody)
				}
			}
		}
	} else {
		decoded := decodeBytes(bytes.NewReader(body), m.Header.Get("Content-Transfer-Encoding"))
		plain, _ := io.ReadAll(io.LimitReader(decoded, maxBodyPreviewBytes+1))
		if strings.EqualFold(contentType, "text/html") {
			detail.BodyHTML = string(plain)
			detail.BodyText = stripHTML(detail.BodyHTML)
		} else {
			detail.BodyText = string(plain)
		}
	}
	if detail.BodyText == "" && detail.BodyHTML != "" {
		detail.BodyText = stripHTML(detail.BodyHTML)
	}
	return detail, nil
}

func firstLiteral(parts []IMAPPart) []byte {
	for _, p := range parts {
		if len(p.Literal) > 0 {
			return p.Literal
		}
	}
	return nil
}

func joinLines(parts []IMAPPart) string {
	lines := make([]string, 0, len(parts))
	for _, p := range parts {
		lines = append(lines, p.Line)
	}
	return strings.Join(lines, "\n")
}

func capture(pattern string, text string) string {
	m := regexp.MustCompile(pattern).FindStringSubmatch(text)
	if len(m) < 2 {
		return ""
	}
	return m[1]
}

func parseQuoted(line string) []string {
	var out []string
	var b strings.Builder
	inQuote := false
	escaped := false
	for _, r := range line {
		if !inQuote {
			if r == '"' {
				inQuote = true
				b.Reset()
			}
			continue
		}
		if escaped {
			b.WriteRune(r)
			escaped = false
			continue
		}
		if r == '\\' {
			escaped = true
			continue
		}
		if r == '"' {
			out = append(out, b.String())
			inQuote = false
			continue
		}
		b.WriteRune(r)
	}
	return out
}

func decodeHeader(v string) string {
	if v == "" {
		return ""
	}
	decoded, err := (&mime.WordDecoder{}).DecodeHeader(v)
	if err != nil {
		return v
	}
	return decoded
}

func decodedPart(p *multipart.Part) io.Reader {
	return decodeBytes(p, p.Header.Get("Content-Transfer-Encoding"))
}

func decodeBytes(r io.Reader, encoding string) io.Reader {
	switch strings.ToLower(strings.TrimSpace(encoding)) {
	case "base64":
		return base64.NewDecoder(base64.StdEncoding, r)
	case "quoted-printable":
		return quotedprintable.NewReader(r)
	default:
		return r
	}
}

func stripHTML(html string) string {
	replacer := strings.NewReplacer("<br>", "\n", "<br/>", "\n", "<br />", "\n", "</p>", "\n", "</div>", "\n")
	html = replacer.Replace(html)
	return strings.TrimSpace(regexp.MustCompile(`<[^>]+>`).ReplaceAllString(html, ""))
}

func buildMessage(from *mail.Address, msg OutgoingMessage) ([]byte, error) {
	to, err := mail.ParseAddressList(strings.Join(msg.To, ","))
	if err != nil {
		return nil, err
	}
	cc, _ := mail.ParseAddressList(strings.Join(msg.CC, ","))
	var buf bytes.Buffer
	writeHeader := func(k, v string) {
		if strings.TrimSpace(v) != "" {
			fmt.Fprintf(&buf, "%s: %s\r\n", k, v)
		}
	}
	writeHeader("From", from.String())
	writeHeader("To", addressList(to).String())
	if len(cc) > 0 {
		writeHeader("Cc", addressList(cc).String())
	}
	writeHeader("Subject", mime.QEncoding.Encode("UTF-8", strings.TrimSpace(msg.Subject)))
	writeHeader("Date", time.Now().Format(time.RFC1123Z))
	writeHeader("MIME-Version", "1.0")
	if len(msg.Attachments) == 0 {
		writeHeader("Content-Type", `text/plain; charset="UTF-8"`)
		writeHeader("Content-Transfer-Encoding", "quoted-printable")
		buf.WriteString("\r\n")
		qp := quotedprintable.NewWriter(&buf)
		_, _ = qp.Write([]byte(msg.Body))
		_ = qp.Close()
		return buf.Bytes(), nil
	}

	mw := multipart.NewWriter(&buf)
	writeHeader("Content-Type", `multipart/mixed; boundary="`+mw.Boundary()+`"`)
	buf.WriteString("\r\n")
	textHeader := make(textproto.MIMEHeader)
	textHeader.Set("Content-Type", `text/plain; charset="UTF-8"`)
	textHeader.Set("Content-Transfer-Encoding", "quoted-printable")
	textPart, err := mw.CreatePart(textHeader)
	if err != nil {
		return nil, err
	}
	qp := quotedprintable.NewWriter(textPart)
	_, _ = qp.Write([]byte(msg.Body))
	_ = qp.Close()

	var total int64
	for _, a := range msg.Attachments {
		path := filepath.Clean(strings.TrimSpace(a.Path))
		if !filepath.IsAbs(path) {
			return nil, errors.New("attachment path must be absolute")
		}
		info, err := os.Stat(path)
		if err != nil {
			return nil, err
		}
		if info.IsDir() {
			return nil, errors.New("attachment path is a directory")
		}
		if info.Size() > maxAttachmentBytes || total+info.Size() > maxAttachmentBytes {
			return nil, errors.New("attachment size limit exceeded")
		}
		total += info.Size()
		f, err := os.Open(path)
		if err != nil {
			return nil, err
		}
		partHeader := make(textproto.MIMEHeader)
		partHeader.Set("Content-Type", "application/octet-stream")
		partHeader.Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, strings.ReplaceAll(filepath.Base(path), `"`, "")))
		partHeader.Set("Content-Transfer-Encoding", "base64")
		part, err := mw.CreatePart(partHeader)
		if err != nil {
			_ = f.Close()
			return nil, err
		}
		encoder := base64.NewEncoder(base64.StdEncoding, newBase64LineWriter(part))
		_, copyErr := io.Copy(encoder, io.LimitReader(f, maxAttachmentBytes+1))
		closeErr := encoder.Close()
		_ = f.Close()
		if copyErr != nil {
			return nil, copyErr
		}
		if closeErr != nil {
			return nil, closeErr
		}
	}
	if err := mw.Close(); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

type addressList []*mail.Address

func (l addressList) String() string {
	parts := make([]string, 0, len(l))
	for _, a := range l {
		parts = append(parts, a.String())
	}
	return strings.Join(parts, ", ")
}

type base64LineWriter struct {
	w    io.Writer
	line int
}

func newBase64LineWriter(w io.Writer) *base64LineWriter { return &base64LineWriter{w: w} }

func (w *base64LineWriter) Write(p []byte) (int, error) {
	written := 0
	for _, b := range p {
		if w.line == 76 {
			if _, err := w.w.Write([]byte("\r\n")); err != nil {
				return written, err
			}
			w.line = 0
		}
		if _, err := w.w.Write([]byte{b}); err != nil {
			return written, err
		}
		w.line++
		written++
	}
	return written, nil
}

func (h *Handler) actor(r *http.Request) string {
	if c, ok := auth.ClaimsFrom(r.Context()); ok {
		return c.Subject
	}
	return ""
}

func (h *Handler) auditEvent(r *http.Request, eventType string, detail map[string]any) {
	if h.audit == nil {
		return
	}
	outcome := "ok"
	if err, _ := detail["error"].(string); err != "" {
		outcome = "error"
	}
	h.audit.Log(r.Context(), audit.Event{
		Type:    eventType,
		Actor:   h.actor(r),
		IP:      audit.ClientIP(r),
		Detail:  detail,
		Outcome: outcome,
	})
}

func auditDetail(protocol, host string, port int, folder string, err error) map[string]any {
	detail := map[string]any{
		"protocol": protocol,
		"host":     strings.TrimSpace(host),
		"port":     port,
	}
	if folder != "" {
		detail["folder"] = folder
	}
	if err != nil {
		detail["error"] = err.Error()
	}
	return detail
}

func decodeJSON(w http.ResponseWriter, r *http.Request, v any) bool {
	defer r.Body.Close()
	if err := json.NewDecoder(io.LimitReader(r.Body, maxRequestBytes)).Decode(v); err != nil {
		http.Error(w, "invalid json: "+err.Error(), http.StatusBadRequest)
		return false
	}
	return true
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, err error) {
	http.Error(w, err.Error(), http.StatusBadRequest)
}
