// Package sysinfo serves /api/sys/* — system metrics and process control.
package sysinfo

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"runtime"
	"strconv"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/alysechen/mochan-linux/server/internal/audit"
	"github.com/alysechen/mochan-linux/server/internal/auth"

	"github.com/shirou/gopsutil/v4/cpu"
	"github.com/shirou/gopsutil/v4/disk"
	"github.com/shirou/gopsutil/v4/host"
	"github.com/shirou/gopsutil/v4/load"
	"github.com/shirou/gopsutil/v4/mem"
	"github.com/shirou/gopsutil/v4/net"
	"github.com/shirou/gopsutil/v4/process"
)

type Handler struct {
	audit *audit.Logger
}

func New(a *audit.Logger) *Handler { return &Handler{audit: a} }

func (h *Handler) Mount(r chi.Router) {
	r.Get("/stat", h.stat)
	r.Get("/processes", h.processes)
	r.Post("/kill", h.kill)
}

type diskInfo struct {
	Mount   string  `json:"mount"`
	FsType  string  `json:"fstype"`
	Total   uint64  `json:"total"`
	Used    uint64  `json:"used"`
	Free    uint64  `json:"free"`
	Percent float64 `json:"percent"`
}

type netInfo struct {
	BytesSent uint64 `json:"bytes_sent"`
	BytesRecv uint64 `json:"bytes_recv"`
}

type statResponse struct {
	Hostname     string     `json:"hostname"`
	Kernel       string     `json:"kernel"`
	OS           string     `json:"os"`
	Arch         string     `json:"arch"`
	Uptime       uint64     `json:"uptime"`
	BootTime     uint64     `json:"boot_time"`
	Load1        float64    `json:"load_1"`
	Load5        float64    `json:"load_5"`
	Load15       float64    `json:"load_15"`
	CPUCount     int        `json:"cpu_count"`
	CPUPercent   float64    `json:"cpu_percent"`
	CPUPerCore   []float64  `json:"cpu_per_core"`
	MemTotal     uint64     `json:"mem_total"`
	MemUsed      uint64     `json:"mem_used"`
	MemPercent   float64    `json:"mem_percent"`
	SwapTotal    uint64     `json:"swap_total"`
	SwapUsed     uint64     `json:"swap_used"`
	Disks        []diskInfo `json:"disks"`
	Net          netInfo    `json:"net"`
	Now          int64      `json:"now"`
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func (h *Handler) stat(w http.ResponseWriter, r *http.Request) {
	hi, _ := host.InfoWithContext(r.Context())
	la, _ := load.AvgWithContext(r.Context())
	v, _ := mem.VirtualMemoryWithContext(r.Context())
	s, _ := mem.SwapMemoryWithContext(r.Context())
	cpuPerc, _ := cpu.PercentWithContext(r.Context(), 200*time.Millisecond, false)
	cpuPer, _ := cpu.PercentWithContext(r.Context(), 0, true)
	parts, _ := disk.PartitionsWithContext(r.Context(), false)
	netStats, _ := net.IOCountersWithContext(r.Context(), false)

	out := statResponse{
		Arch:       runtime.GOARCH,
		CPUCount:   runtime.NumCPU(),
		CPUPerCore: cpuPer,
		Now:        time.Now().Unix(),
	}
	if hi != nil {
		out.Hostname = hi.Hostname
		out.Kernel = hi.KernelVersion
		out.OS = hi.Platform + " " + hi.PlatformVersion
		out.Uptime = hi.Uptime
		out.BootTime = hi.BootTime
	}
	if la != nil {
		out.Load1 = la.Load1
		out.Load5 = la.Load5
		out.Load15 = la.Load15
	}
	if v != nil {
		out.MemTotal = v.Total
		out.MemUsed = v.Used
		out.MemPercent = v.UsedPercent
	}
	if s != nil {
		out.SwapTotal = s.Total
		out.SwapUsed = s.Used
	}
	if len(cpuPerc) > 0 {
		out.CPUPercent = cpuPerc[0]
	}
	for _, p := range parts {
		// skip pseudo filesystems
		if p.Fstype == "" || p.Fstype == "tmpfs" || p.Fstype == "devtmpfs" || p.Fstype == "overlay" || p.Fstype == "squashfs" {
			continue
		}
		u, err := disk.UsageWithContext(r.Context(), p.Mountpoint)
		if err != nil || u.Total == 0 {
			continue
		}
		out.Disks = append(out.Disks, diskInfo{
			Mount:   p.Mountpoint,
			FsType:  p.Fstype,
			Total:   u.Total,
			Used:    u.Used,
			Free:    u.Free,
			Percent: u.UsedPercent,
		})
	}
	if len(netStats) > 0 {
		out.Net = netInfo{BytesSent: netStats[0].BytesSent, BytesRecv: netStats[0].BytesRecv}
	}
	writeJSON(w, http.StatusOK, out)
}

type procInfo struct {
	PID        int32   `json:"pid"`
	PPID       int32   `json:"ppid"`
	Name       string  `json:"name"`
	User       string  `json:"user"`
	Status     string  `json:"status"`
	CPUPercent float64 `json:"cpu_percent"`
	MemRSS     uint64  `json:"mem_rss"`
	MemPercent float32 `json:"mem_percent"`
	Created    int64   `json:"created"`
	Cmdline    string  `json:"cmdline"`
	Threads    int32   `json:"threads"`
}

func (h *Handler) processes(w http.ResponseWriter, r *http.Request) {
	pids, err := process.PidsWithContext(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	limit := intParam(r, "limit", 200)
	out := make([]procInfo, 0, len(pids))
	for _, pid := range pids {
		p, err := process.NewProcessWithContext(r.Context(), pid)
		if err != nil {
			continue
		}
		name, _ := p.NameWithContext(r.Context())
		username, _ := p.UsernameWithContext(r.Context())
		statusList, _ := p.StatusWithContext(r.Context())
		cpuPct, _ := p.CPUPercentWithContext(r.Context())
		memInfo, _ := p.MemoryInfoWithContext(r.Context())
		memPct, _ := p.MemoryPercentWithContext(r.Context())
		created, _ := p.CreateTimeWithContext(r.Context())
		cmdline, _ := p.CmdlineWithContext(r.Context())
		threads, _ := p.NumThreadsWithContext(r.Context())
		ppid, _ := p.PpidWithContext(r.Context())

		var rss uint64
		if memInfo != nil {
			rss = memInfo.RSS
		}
		statusStr := ""
		if len(statusList) > 0 {
			statusStr = statusList[0]
		}

		out = append(out, procInfo{
			PID:        pid,
			PPID:       ppid,
			Name:       name,
			User:       username,
			Status:     statusStr,
			CPUPercent: cpuPct,
			MemRSS:     rss,
			MemPercent: memPct,
			Created:    created,
			Cmdline:    cmdline,
			Threads:    threads,
		})
	}
	if len(out) > limit {
		out = out[:limit]
	}
	writeJSON(w, http.StatusOK, map[string]any{"processes": out, "total": len(pids)})
}

func (h *Handler) kill(w http.ResponseWriter, r *http.Request) {
	var body struct {
		PID    int    `json:"pid"`
		Signal string `json:"signal"` // "TERM" (default), "KILL", "INT", "HUP"
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 1024)).Decode(&body); err != nil {
		http.Error(w, "bad json", http.StatusBadRequest)
		return
	}
	if body.PID <= 1 {
		http.Error(w, "refusing to signal pid <= 1", http.StatusBadRequest)
		return
	}
	sig := signalFromName(body.Signal)
	proc, err := os.FindProcess(body.PID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	if err := proc.Signal(sig); err != nil {
		if errors.Is(err, os.ErrPermission) {
			http.Error(w, "permission denied", http.StatusForbidden)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if h.audit != nil {
		actor := ""
		if c, ok := auth.ClaimsFrom(r.Context()); ok {
			actor = c.Subject
		}
		h.audit.Log(r.Context(), audit.Event{
			Type:    "sys.kill",
			Actor:   actor,
			IP:      audit.ClientIP(r),
			Detail:  map[string]any{"pid": body.PID, "signal": sig.String()},
			Outcome: "ok",
		})
	}
	w.WriteHeader(http.StatusNoContent)
}

func signalFromName(s string) os.Signal {
	switch s {
	case "KILL", "9":
		return syscall.SIGKILL
	case "INT", "2":
		return syscall.SIGINT
	case "HUP", "1":
		return syscall.SIGHUP
	default:
		return syscall.SIGTERM
	}
}

func intParam(r *http.Request, name string, fallback int) int {
	v := r.URL.Query().Get(name)
	if v == "" {
		return fallback
	}
	n, err := strconv.Atoi(v)
	if err != nil || n <= 0 {
		return fallback
	}
	return n
}
