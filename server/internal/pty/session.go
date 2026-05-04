package pty

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"log"
	"os"
	"os/exec"
	"sync"
	"sync/atomic"
	"time"

	creackpty "github.com/creack/pty"
)

// Session is a PTY whose lifetime is decoupled from any single WebSocket.
// Clients attach by ID; when all detach, an idle timer reaps the PTY.
type Session struct {
	ID      string
	created time.Time

	mu          sync.Mutex
	pty         *os.File
	cmd         *exec.Cmd
	closed      bool
	subscribers int
	lastIdle    time.Time

	buffer *ringBuffer

	// Outbound stream: every PTY read is delivered to every active
	// subscriber channel. Channels are bounded; slow consumers get dropped
	// via Conn.Close on overflow.
	subsMu sync.Mutex
	subs   map[uint64]chan []byte
	subSeq atomic.Uint64

	// done is closed when the session has been reaped; reads return after.
	done chan struct{}
}

// SessionOptions controls how a freshly created session is started.
type SessionOptions struct {
	Cols    uint16
	Rows    uint16
	Shell   string
	WorkDir string
	Env     []string
}

func newSession(id string, opts SessionOptions) (*Session, error) {
	shell := opts.Shell
	if shell == "" {
		shell = "bash"
	}
	cmd := exec.Command(shell, "-l")
	if opts.WorkDir != "" {
		cmd.Dir = opts.WorkDir
	}
	cmd.Env = opts.Env
	if cmd.Env == nil {
		cmd.Env = append(os.Environ(),
			"TERM=xterm-256color",
			"COLORTERM=truecolor",
			"LANG=C.UTF-8",
			"LC_ALL=C.UTF-8",
		)
	}

	cols, rows := opts.Cols, opts.Rows
	if cols == 0 {
		cols = 80
	}
	if rows == 0 {
		rows = 24
	}

	ptmx, err := creackpty.StartWithSize(cmd, &creackpty.Winsize{Cols: cols, Rows: rows})
	if err != nil {
		return nil, err
	}

	s := &Session{
		ID:       id,
		created:  time.Now(),
		pty:      ptmx,
		cmd:      cmd,
		buffer:   newRingBuffer(256 * 1024),
		subs:     make(map[uint64]chan []byte),
		done:     make(chan struct{}),
		lastIdle: time.Now(), // counted as idle until first attach
	}

	go s.pumpPTY()
	return s, nil
}

// pumpPTY reads from the PTY forever, appending to the ring buffer and
// broadcasting to subscribers. Exits when the PTY closes.
func (s *Session) pumpPTY() {
	buf := make([]byte, 32*1024)
	for {
		n, err := s.pty.Read(buf)
		if n > 0 {
			chunk := make([]byte, n)
			copy(chunk, buf[:n])
			s.buffer.Write(chunk)
			s.broadcast(chunk)
		}
		if err != nil {
			s.markClosed()
			return
		}
	}
}

func (s *Session) broadcast(data []byte) {
	s.subsMu.Lock()
	defer s.subsMu.Unlock()
	for id, ch := range s.subs {
		select {
		case ch <- data:
		default:
			// Slow consumer: drop the channel; the next select in the
			// reader will yield a closed channel and disconnect.
			close(ch)
			delete(s.subs, id)
		}
	}
}

// Subscribe attaches a new client. Returns:
//   - subID for later unsubscribe
//   - chan delivering raw PTY bytes
//   - snapshot of the entire buffer for backfill (caller writes this first)
func (s *Session) Subscribe() (uint64, <-chan []byte, []byte) {
	s.mu.Lock()
	s.subscribers++
	s.mu.Unlock()

	ch := make(chan []byte, 64)
	id := s.subSeq.Add(1)
	s.subsMu.Lock()
	s.subs[id] = ch
	s.subsMu.Unlock()

	snap := s.buffer.Snapshot()
	return id, ch, snap
}

// Unsubscribe drops a client. When the count hits zero the idle timer starts.
func (s *Session) Unsubscribe(id uint64) {
	s.subsMu.Lock()
	if ch, ok := s.subs[id]; ok {
		delete(s.subs, id)
		// Best-effort drain so the broadcast goroutine doesn't deadlock.
		// Actual close is deferred until ch goes out of scope.
		go func() {
			defer func() { recover() }()
			close(ch)
		}()
	}
	s.subsMu.Unlock()

	s.mu.Lock()
	s.subscribers--
	if s.subscribers <= 0 {
		s.subscribers = 0
		s.lastIdle = time.Now()
	}
	s.mu.Unlock()
}

// Write forwards stdin from a client to the PTY.
func (s *Session) Write(p []byte) (int, error) {
	s.mu.Lock()
	if s.closed {
		s.mu.Unlock()
		return 0, errors.New("session closed")
	}
	s.mu.Unlock()
	return s.pty.Write(p)
}

// Resize forwards a TIOCSWINSZ to the PTY.
func (s *Session) Resize(cols, rows uint16) error {
	if cols == 0 || rows == 0 {
		return nil
	}
	return creackpty.Setsize(s.pty, &creackpty.Winsize{Cols: cols, Rows: rows})
}

// Done is closed when the session has been reaped.
func (s *Session) Done() <-chan struct{} { return s.done }

func (s *Session) markClosed() {
	s.mu.Lock()
	if s.closed {
		s.mu.Unlock()
		return
	}
	s.closed = true
	s.mu.Unlock()

	_ = s.pty.Close()
	if s.cmd.Process != nil {
		_ = s.cmd.Process.Kill()
		_, _ = s.cmd.Process.Wait()
	}

	s.subsMu.Lock()
	for id, ch := range s.subs {
		close(ch)
		delete(s.subs, id)
	}
	s.subsMu.Unlock()

	close(s.done)
}

// Manager owns a process-wide pool of named sessions and a reaper goroutine.
type Manager struct {
	mu       sync.Mutex
	sessions map[string]*Session
	idleTTL  time.Duration
}

// NewManager starts a manager that reaps sessions whose subscribers have been
// zero for longer than idleTTL.
func NewManager(idleTTL time.Duration) *Manager {
	if idleTTL <= 0 {
		idleTTL = 5 * time.Minute
	}
	m := &Manager{
		sessions: make(map[string]*Session),
		idleTTL:  idleTTL,
	}
	go m.reapLoop(context.Background())
	return m
}

// GetOrCreate returns an existing session by ID or creates a new one with the
// supplied options. The returned bool is true iff the session was just
// created.
func (m *Manager) GetOrCreate(id string, opts SessionOptions) (*Session, bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if id != "" {
		if s, ok := m.sessions[id]; ok {
			return s, false, nil
		}
	}
	if id == "" {
		id = randomID()
	}
	s, err := newSession(id, opts)
	if err != nil {
		return nil, false, err
	}
	m.sessions[id] = s
	go func() {
		<-s.done
		m.mu.Lock()
		delete(m.sessions, id)
		m.mu.Unlock()
	}()
	return s, true, nil
}

// Close all sessions; called on server shutdown.
func (m *Manager) Close() {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, s := range m.sessions {
		s.markClosed()
	}
}

func (m *Manager) reapLoop(ctx context.Context) {
	t := time.NewTicker(30 * time.Second)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			m.reapOnce()
		}
	}
}

func (m *Manager) reapOnce() {
	cutoff := time.Now().Add(-m.idleTTL)
	m.mu.Lock()
	victims := make([]*Session, 0)
	for _, s := range m.sessions {
		s.mu.Lock()
		if s.subscribers == 0 && s.lastIdle.Before(cutoff) {
			victims = append(victims, s)
		}
		s.mu.Unlock()
	}
	m.mu.Unlock()
	for _, s := range victims {
		log.Printf("pty: reaping idle session %s (idle for >%s)", s.ID, m.idleTTL)
		s.markClosed()
	}
}

// ----- ring buffer -----

type ringBuffer struct {
	mu  sync.Mutex
	buf bytes.Buffer
	max int
}

func newRingBuffer(max int) *ringBuffer { return &ringBuffer{max: max} }

func (r *ringBuffer) Write(p []byte) (int, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	n, err := r.buf.Write(p)
	if r.buf.Len() > r.max {
		// Discard the oldest excess bytes.
		excess := r.buf.Len() - r.max
		r.buf.Next(excess)
	}
	return n, err
}

func (r *ringBuffer) Snapshot() []byte {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := make([]byte, r.buf.Len())
	copy(out, r.buf.Bytes())
	return out
}

// ----- helpers -----

func randomID() string {
	var b [12]byte
	if _, err := rand.Read(b[:]); err != nil {
		// Extremely unlikely; fall back to a timestamp.
		return "ts" + hex.EncodeToString([]byte(time.Now().Format(time.RFC3339Nano)))[:22]
	}
	return hex.EncodeToString(b[:])
}
