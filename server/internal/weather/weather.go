// Package weather fetches and caches weather data from Open-Meteo.
package weather

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/alysechen/mochan-linux/server/internal/audit"
	"github.com/alysechen/mochan-linux/server/internal/netguard"
)

const maxJSONBytes = 2 << 20

var ErrBadRequest = errors.New("bad weather request")

type Location struct {
	Name      string  `json:"name"`
	Country   string  `json:"country,omitempty"`
	Admin1    string  `json:"admin1,omitempty"`
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
	Timezone  string  `json:"timezone,omitempty"`
}

type Forecast struct {
	Location       Location         `json:"location"`
	UpdatedAt      time.Time        `json:"updated_at"`
	Current        CurrentWeather   `json:"current"`
	Daily          []DailyForecast  `json:"daily"`
	Hourly         []HourlyForecast `json:"hourly"`
	Source         string           `json:"source"`
	CacheExpiresAt time.Time        `json:"cache_expires_at"`
}

type CurrentWeather struct {
	TemperatureC float64 `json:"temperature_c"`
	FeelsLikeC   float64 `json:"feels_like_c"`
	Condition    string  `json:"condition"`
	Humidity     int     `json:"humidity"`
	WindKPH      float64 `json:"wind_kph"`
	VisibilityKM float64 `json:"visibility_km"`
	PressureHPa  float64 `json:"pressure_hpa"`
	UVIndex      float64 `json:"uv_index"`
}

type DailyForecast struct {
	Date            string  `json:"date"`
	Condition       string  `json:"condition"`
	HighC           float64 `json:"high_c"`
	LowC            float64 `json:"low_c"`
	PrecipChance    int     `json:"precip_chance"`
	PrecipitationMM float64 `json:"precipitation_mm"`
}

type HourlyForecast struct {
	Time         string  `json:"time"`
	Hour         int     `json:"hour"`
	TemperatureC float64 `json:"temperature_c"`
	Condition    string  `json:"condition"`
}

type Cache struct {
	path        string
	searchURL   string
	forecastURL string
	client      *http.Client
	mu          sync.Mutex
	items       map[string]Forecast
}

func NewCache(path string) (*Cache, error) {
	c := &Cache{
		path:        filepath.Join(path, "cache.json"),
		searchURL:   "https://geocoding-api.open-meteo.com/v1/search",
		forecastURL: "https://api.open-meteo.com/v1/forecast",
		client:      netguard.NewHTTPClient(20*time.Second, 3),
		items:       map[string]Forecast{},
	}
	if err := os.MkdirAll(filepath.Dir(c.path), 0o750); err != nil {
		return nil, err
	}
	_ = c.load()
	return c, nil
}

func (c *Cache) SetEndpoints(searchURL, forecastURL string, client *http.Client) {
	c.searchURL = searchURL
	c.forecastURL = forecastURL
	if client != nil {
		c.client = client
	}
}

func (c *Cache) Search(ctx *http.Request, q string) ([]Location, error) {
	q = strings.TrimSpace(q)
	if len(q) < 2 {
		return nil, fmt.Errorf("%w: search query must be at least 2 characters", ErrBadRequest)
	}
	u, err := url.Parse(c.searchURL)
	if err != nil {
		return nil, err
	}
	params := u.Query()
	params.Set("name", q)
	params.Set("count", "8")
	params.Set("language", "en")
	params.Set("format", "json")
	u.RawQuery = params.Encode()
	req, err := http.NewRequestWithContext(ctx.Context(), http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "mochan-linux-weather/1.0")
	res, err := c.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return nil, fmt.Errorf("weather search returned %d", res.StatusCode)
	}
	var body struct {
		Results []struct {
			Name      string  `json:"name"`
			Country   string  `json:"country"`
			Admin1    string  `json:"admin1"`
			Latitude  float64 `json:"latitude"`
			Longitude float64 `json:"longitude"`
			Timezone  string  `json:"timezone"`
		} `json:"results"`
	}
	if err := json.NewDecoder(io.LimitReader(res.Body, maxJSONBytes)).Decode(&body); err != nil {
		return nil, err
	}
	out := []Location{}
	for _, r := range body.Results {
		out = append(out, Location{Name: r.Name, Country: r.Country, Admin1: r.Admin1, Latitude: r.Latitude, Longitude: r.Longitude, Timezone: r.Timezone})
	}
	return out, nil
}

func (c *Cache) Forecast(ctx *http.Request, loc Location, force bool) (Forecast, error) {
	if strings.TrimSpace(loc.Name) == "" {
		loc.Name = fmt.Sprintf("%.4f, %.4f", loc.Latitude, loc.Longitude)
	}
	if math.Abs(loc.Latitude) > 90 || math.Abs(loc.Longitude) > 180 {
		return Forecast{}, fmt.Errorf("%w: invalid coordinates", ErrBadRequest)
	}
	key := cacheKey(loc)
	now := time.Now().UTC()
	c.mu.Lock()
	if item, ok := c.items[key]; ok && !force && now.Before(item.CacheExpiresAt) {
		c.mu.Unlock()
		return item, nil
	}
	c.mu.Unlock()

	u, err := url.Parse(c.forecastURL)
	if err != nil {
		return Forecast{}, err
	}
	params := u.Query()
	params.Set("latitude", fmt.Sprintf("%.5f", loc.Latitude))
	params.Set("longitude", fmt.Sprintf("%.5f", loc.Longitude))
	params.Set("timezone", "auto")
	params.Set("forecast_days", "5")
	params.Set("current", "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,surface_pressure,wind_speed_10m,visibility")
	params.Set("hourly", "temperature_2m,weather_code")
	params.Set("daily", "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,uv_index_max")
	u.RawQuery = params.Encode()

	req, err := http.NewRequestWithContext(ctx.Context(), http.MethodGet, u.String(), nil)
	if err != nil {
		return Forecast{}, err
	}
	req.Header.Set("User-Agent", "mochan-linux-weather/1.0")
	res, err := c.client.Do(req)
	if err != nil {
		return Forecast{}, err
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return Forecast{}, fmt.Errorf("weather forecast returned %d", res.StatusCode)
	}
	var body openMeteoForecast
	if err := json.NewDecoder(io.LimitReader(res.Body, maxJSONBytes)).Decode(&body); err != nil {
		return Forecast{}, err
	}
	forecast := mapForecast(loc, body, now)
	c.mu.Lock()
	c.items[key] = forecast
	err = c.saveLocked()
	c.mu.Unlock()
	return forecast, err
}

func (c *Cache) load() error {
	f, err := os.Open(c.path)
	if err != nil {
		return err
	}
	defer f.Close()
	return json.NewDecoder(io.LimitReader(f, maxJSONBytes)).Decode(&c.items)
}

func (c *Cache) saveLocked() error {
	tmp := c.path + ".tmp"
	f, err := os.OpenFile(tmp, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o640)
	if err != nil {
		return err
	}
	enc := json.NewEncoder(f)
	enc.SetIndent("", "  ")
	if err := enc.Encode(c.items); err != nil {
		_ = f.Close()
		_ = os.Remove(tmp)
		return err
	}
	if err := f.Close(); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	return os.Rename(tmp, c.path)
}

type openMeteoForecast struct {
	Current struct {
		Time                string  `json:"time"`
		Temperature         float64 `json:"temperature_2m"`
		Humidity            int     `json:"relative_humidity_2m"`
		ApparentTemperature float64 `json:"apparent_temperature"`
		WeatherCode         int     `json:"weather_code"`
		Pressure            float64 `json:"surface_pressure"`
		WindSpeed           float64 `json:"wind_speed_10m"`
		Visibility          float64 `json:"visibility"`
	} `json:"current"`
	Hourly struct {
		Time        []string  `json:"time"`
		Temperature []float64 `json:"temperature_2m"`
		WeatherCode []int     `json:"weather_code"`
	} `json:"hourly"`
	Daily struct {
		Time                 []string  `json:"time"`
		WeatherCode          []int     `json:"weather_code"`
		TemperatureMax       []float64 `json:"temperature_2m_max"`
		TemperatureMin       []float64 `json:"temperature_2m_min"`
		PrecipitationSum     []float64 `json:"precipitation_sum"`
		PrecipProbabilityMax []int     `json:"precipitation_probability_max"`
		UVIndexMax           []float64 `json:"uv_index_max"`
	} `json:"daily"`
}

func mapForecast(loc Location, body openMeteoForecast, now time.Time) Forecast {
	hourly := []HourlyForecast{}
	for i, t := range body.Hourly.Time {
		if i >= 24 || i >= len(body.Hourly.Temperature) || i >= len(body.Hourly.WeatherCode) {
			break
		}
		hour := 0
		if parsed, err := time.Parse("2006-01-02T15:04", t); err == nil {
			hour = parsed.Hour()
		}
		hourly = append(hourly, HourlyForecast{Time: t, Hour: hour, TemperatureC: body.Hourly.Temperature[i], Condition: condition(body.Hourly.WeatherCode[i])})
	}
	daily := []DailyForecast{}
	for i, d := range body.Daily.Time {
		if i >= 5 || i >= len(body.Daily.TemperatureMax) || i >= len(body.Daily.TemperatureMin) || i >= len(body.Daily.WeatherCode) {
			break
		}
		precip := 0
		if i < len(body.Daily.PrecipProbabilityMax) {
			precip = body.Daily.PrecipProbabilityMax[i]
		}
		precipMM := 0.0
		if i < len(body.Daily.PrecipitationSum) {
			precipMM = body.Daily.PrecipitationSum[i]
		}
		daily = append(daily, DailyForecast{
			Date: d, Condition: condition(body.Daily.WeatherCode[i]), HighC: body.Daily.TemperatureMax[i], LowC: body.Daily.TemperatureMin[i],
			PrecipChance: precip, PrecipitationMM: precipMM,
		})
	}
	uv := 0.0
	if len(body.Daily.UVIndexMax) > 0 {
		uv = body.Daily.UVIndexMax[0]
	}
	return Forecast{
		Location:  loc,
		UpdatedAt: now,
		Current: CurrentWeather{
			TemperatureC: body.Current.Temperature, FeelsLikeC: body.Current.ApparentTemperature, Condition: condition(body.Current.WeatherCode),
			Humidity: body.Current.Humidity, WindKPH: body.Current.WindSpeed, VisibilityKM: body.Current.Visibility / 1000,
			PressureHPa: body.Current.Pressure, UVIndex: uv,
		},
		Daily: daily, Hourly: hourly, Source: "open-meteo", CacheExpiresAt: now.Add(15 * time.Minute),
	}
}

type Handler struct {
	cache *Cache
	audit *audit.Logger
}

func NewHandler(cache *Cache, auditLog *audit.Logger) *Handler {
	return &Handler{cache: cache, audit: auditLog}
}

func (h *Handler) Mount(r chi.Router) {
	r.Get("/search", h.search)
	r.Get("/forecast", h.forecast)
}

func (h *Handler) search(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query().Get("q")
	results, err := h.cache.Search(r, q)
	outcome := "ok"
	if err != nil {
		outcome = "error"
	}
	h.auditEvent(r, "weather.search", outcome, map[string]any{"query_len": len(q), "error": errString(err)})
	if err != nil {
		writeWeatherError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"locations": results})
}

func (h *Handler) forecast(w http.ResponseWriter, r *http.Request) {
	loc, err := locationFromQuery(r.URL.Query())
	if err != nil {
		writeWeatherError(w, err)
		return
	}
	forecast, err := h.cache.Forecast(r, loc, r.URL.Query().Get("force") == "true")
	outcome := "ok"
	if err != nil {
		outcome = "error"
	}
	h.auditEvent(r, "weather.forecast", outcome, map[string]any{"location": loc.Name, "error": errString(err)})
	if err != nil {
		writeWeatherError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, forecast)
}

func locationFromQuery(q url.Values) (Location, error) {
	var loc Location
	loc.Name = strings.TrimSpace(q.Get("name"))
	loc.Country = strings.TrimSpace(q.Get("country"))
	loc.Admin1 = strings.TrimSpace(q.Get("admin1"))
	loc.Timezone = strings.TrimSpace(q.Get("timezone"))
	if _, err := fmt.Sscanf(q.Get("lat"), "%f", &loc.Latitude); err != nil {
		return loc, fmt.Errorf("%w: lat is required", ErrBadRequest)
	}
	if _, err := fmt.Sscanf(q.Get("lon"), "%f", &loc.Longitude); err != nil {
		return loc, fmt.Errorf("%w: lon is required", ErrBadRequest)
	}
	return loc, nil
}

func condition(code int) string {
	switch code {
	case 0:
		return "Sunny"
	case 1, 2:
		return "Partly Cloudy"
	case 3:
		return "Cloudy"
	case 45, 48:
		return "Fog"
	case 51, 53, 55, 61, 63:
		return "Rain"
	case 65, 80, 81, 82:
		return "Heavy Rain"
	case 71, 73, 75, 77, 85, 86:
		return "Snow"
	case 95, 96, 99:
		return "Thunderstorm"
	default:
		return "Cloudy"
	}
}

func cacheKey(loc Location) string {
	return fmt.Sprintf("%.4f,%.4f", loc.Latitude, loc.Longitude)
}

func writeWeatherError(w http.ResponseWriter, err error) {
	status := http.StatusInternalServerError
	if errors.Is(err, ErrBadRequest) {
		status = http.StatusBadRequest
	}
	http.Error(w, err.Error(), status)
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func (h *Handler) auditEvent(r *http.Request, eventType, outcome string, detail map[string]any) {
	if h.audit == nil {
		return
	}
	h.audit.Log(r.Context(), audit.Event{
		Type:    eventType,
		Actor:   "authenticated",
		IP:      audit.ClientIP(r),
		Outcome: outcome,
		Detail:  detail,
	})
}

func errString(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}
