import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Cloud, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun,
  Droplets, Eye, Gauge, RefreshCw, Search, Sun, Thermometer, Wind, X
} from 'lucide-react';
import { weatherClient, type WeatherForecast, type WeatherLocation } from '@/lib/weather';

type WeatherCondition = 'Sunny' | 'Cloudy' | 'Partly Cloudy' | 'Rain' | 'Heavy Rain' | 'Snow' | 'Thunderstorm' | 'Fog' | 'Windy';

const PRESET_CITIES: WeatherLocation[] = [
  { name: 'Beijing', country: 'China', latitude: 39.9042, longitude: 116.4074, timezone: 'Asia/Shanghai' },
  { name: 'Shanghai', country: 'China', latitude: 31.2304, longitude: 121.4737, timezone: 'Asia/Shanghai' },
  { name: 'Tokyo', country: 'Japan', latitude: 35.6762, longitude: 139.6503, timezone: 'Asia/Tokyo' },
  { name: 'London', country: 'United Kingdom', latitude: 51.5072, longitude: -0.1276, timezone: 'Europe/London' },
  { name: 'New York', country: 'United States', latitude: 40.7128, longitude: -74.006, timezone: 'America/New_York' },
  { name: 'Singapore', country: 'Singapore', latitude: 1.3521, longitude: 103.8198, timezone: 'Asia/Singapore' },
];

function conditionIcon(condition: string, size = 16) {
  switch (condition as WeatherCondition) {
    case 'Sunny': return <Sun size={size} className="text-warning" />;
    case 'Cloudy': return <Cloud size={size} className="text-ink-500" />;
    case 'Partly Cloudy': return <CloudSun size={size} className="text-ink-500" />;
    case 'Rain': return <CloudRain size={size} className="text-info" />;
    case 'Heavy Rain': return <CloudRain size={size} className="text-info" />;
    case 'Snow': return <CloudSnow size={size} className="text-ink-300" />;
    case 'Thunderstorm': return <CloudLightning size={size} className="text-warning" />;
    case 'Fog': return <CloudFog size={size} className="text-ink-400" />;
    case 'Windy': return <Wind size={size} className="text-ink-500" />;
    default: return <Cloud size={size} className="text-ink-500" />;
  }
}

function conditionLabel(condition: string): string {
  const labels: Record<string, string> = {
    Sunny: 'Sunny (晴)',
    Cloudy: 'Cloudy (多云)',
    'Partly Cloudy': 'Partly Cloudy (局部多云)',
    Rain: 'Rain (雨)',
    'Heavy Rain': 'Heavy Rain (大雨)',
    Snow: 'Snow (雪)',
    Thunderstorm: 'Thunderstorm (雷雨)',
    Fog: 'Fog (雾)',
    Windy: 'Windy (风)',
  };
  return labels[condition] || condition;
}

function displayName(location: WeatherLocation): string {
  return [location.name, location.admin1, location.country].filter(Boolean).join(', ');
}

function shortError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export default function Weather() {
  const [locations, setLocations] = useState<WeatherLocation[]>(PRESET_CITIES.slice(0, 3));
  const [forecasts, setForecasts] = useState<Record<string, WeatherForecast>>({});
  const [activeCity, setActiveCity] = useState(0);
  const [unit, setUnit] = useState<'C' | 'F'>('C');
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<WeatherLocation[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const currentLocation = locations[activeCity];
  const currentWeather = currentLocation ? forecasts[keyFor(currentLocation)] : undefined;

  const loadForecast = async (location: WeatherLocation, force = false) => {
    const forecast = await weatherClient.forecast(location, force);
    setForecasts(prev => ({ ...prev, [keyFor(location)]: forecast }));
  };

  const refreshAll = async (force = false) => {
    setBusy(true);
    setError('');
    try {
      await Promise.all(locations.map(location => loadForecast(location, force)));
    } catch (err) {
      setError(shortError(err));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    refreshAll().catch(err => setError(shortError(err)));
  }, []);

  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setSearchResults(PRESET_CITIES.filter(c => displayName(c).toLowerCase().includes(searchQuery.toLowerCase())));
      return;
    }
    const timer = window.setTimeout(() => {
      weatherClient.search(searchQuery)
        .then(res => setSearchResults(res.locations))
        .catch(err => setError(shortError(err)));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  const addCity = async (location: WeatherLocation) => {
    if (!locations.some(c => keyFor(c) === keyFor(location))) {
      const next = [...locations, location];
      setLocations(next);
      setActiveCity(next.length - 1);
      await loadForecast(location, true);
    }
    setShowSearch(false);
    setSearchQuery('');
  };

  const removeCity = (index: number) => {
    if (locations.length <= 1) return;
    setLocations(prev => prev.filter((_, i) => i !== index));
    if (activeCity >= index && activeCity > 0) setActiveCity(activeCity - 1);
  };

  const convertTemp = (c: number) => unit === 'C' ? Math.round(c) : Math.round(c * 9 / 5 + 32);
  const highLow = useMemo(() => currentWeather?.daily[0], [currentWeather]);

  return (
    <div className="w-full h-full flex flex-col bg-ink-50 overflow-hidden">
      <div className="flex items-center gap-1 px-3 py-2 border-b border-ink-200 bg-ink-100 overflow-x-auto">
        {locations.map((location, i) => (
          <div key={keyFor(location)} className="flex items-center flex-shrink-0">
            <button onClick={() => setActiveCity(i)} className={`px-3 py-1.5 rounded text-body-sm whitespace-nowrap transition-colors ${activeCity === i ? 'bg-ink-800 text-ink-50' : 'text-ink-600 hover:bg-ink-200'}`}>
              {location.name}
            </button>
            {locations.length > 1 && <button onClick={() => removeCity(i)} className="ml-0.5 text-ink-400 hover:text-cinnabar"><X size={12} /></button>}
          </div>
        ))}
        <button onClick={() => setShowSearch(!showSearch)} className="flex items-center gap-1 px-2 py-1.5 rounded text-ink-600 hover:bg-ink-200 text-body-sm flex-shrink-0"><Search size={14} /> +</button>
        <button onClick={() => refreshAll(true)} className="ml-auto p-1.5 rounded text-ink-600 hover:bg-ink-200"><RefreshCw size={14} className={busy ? 'animate-spin' : ''} /></button>
        <button onClick={() => setUnit(unit === 'C' ? 'F' : 'C')} className="px-2 py-1 rounded border border-ink-300 text-ink-600 text-caption hover:border-cinnabar">°{unit}</button>
      </div>

      {showSearch && (
        <div className="bg-ink-100 border-b border-ink-200 px-3 py-2">
          <div className="flex items-center gap-2 mb-2">
            <Search size={14} className="text-ink-400" />
            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search city (搜索城市)..." className="flex-1 bg-ink-50 border border-ink-300 rounded px-3 py-1.5 text-body-sm text-ink-700 outline-none focus:border-cinnabar" autoFocus />
            <button onClick={() => { setShowSearch(false); setSearchQuery(''); }} className="text-ink-500 hover:text-ink-700"><X size={16} /></button>
          </div>
          <div className="grid grid-cols-2 gap-1 max-h-36 overflow-y-auto">
            {searchResults.filter(c => !locations.some(s => keyFor(s) === keyFor(c))).map(city => (
              <button key={keyFor(city)} onClick={() => addCity(city)} className="text-left px-2 py-1 rounded text-body-sm text-ink-600 hover:bg-ink-200 truncate">
                {displayName(city)}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <div className="px-3 py-2 text-caption bg-red-50 text-cinnabar">{error}</div>}

      <div className="flex-1 overflow-y-auto">
        {!currentWeather ? (
          <div className="h-full flex items-center justify-center text-body-sm text-ink-400">{busy ? 'Loading weather...' : 'No weather data'}</div>
        ) : (
          <div className="p-4 space-y-4">
            <div className="bg-ink-100 rounded-md p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-heading-lg text-ink-800">{displayName(currentWeather.location)}</div>
                  <div className="text-body-sm text-ink-500">Updated {new Date(currentWeather.updated_at).toLocaleString()} · {currentWeather.source}</div>
                </div>
                <div className="text-right">
                  <span className="text-display-xl text-ink-800 font-display">{convertTemp(currentWeather.current.temperature_c)}°</span>
                  <div className="flex items-center gap-1 justify-end">
                    {conditionIcon(currentWeather.current.condition, 16)}
                    <span className="text-body-sm text-ink-600">{conditionLabel(currentWeather.current.condition)}</span>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2 mt-3">
                <Metric icon={<Thermometer size={12} className="text-cinnabar" />} label="Feels" value={`${convertTemp(currentWeather.current.feels_like_c)}°`} />
                <Metric icon={<Droplets size={12} className="text-info" />} label="Humidity" value={`${currentWeather.current.humidity}%`} />
                <Metric icon={<Wind size={12} className="text-success" />} label="Wind" value={`${Math.round(currentWeather.current.wind_kph)} km/h`} />
                <Metric icon={<Eye size={12} className="text-ink-600" />} label="Visibility" value={`${currentWeather.current.visibility_km.toFixed(1)} km`} />
                <Metric icon={<Gauge size={12} className="text-warning" />} label="Pressure" value={`${Math.round(currentWeather.current.pressure_hpa)} hPa`} />
                <Metric icon={<Sun size={12} className="text-warning" />} label="UV" value={`${Math.round(currentWeather.current.uv_index)}`} />
                <Metric label="High" value={highLow ? `${convertTemp(highLow.high_c)}°` : '-'} accent="var(--cinnabar)" />
                <Metric label="Low" value={highLow ? `${convertTemp(highLow.low_c)}°` : '-'} accent="var(--info)" />
              </div>
            </div>

            <div className="bg-ink-100 rounded-md p-3 shadow-sm">
              <div className="text-body-sm font-medium text-ink-700 mb-2">Hourly Forecast (每小时)</div>
              <div className="flex gap-3 overflow-x-auto pb-1">
                {currentWeather.hourly.map((h) => (
                  <div key={h.time} className="flex flex-col items-center gap-1 flex-shrink-0 px-2 py-1 rounded hover:bg-ink-200">
                    <span className="text-caption text-ink-500">{String(h.hour).padStart(2, '0')}:00</span>
                    {conditionIcon(h.condition, 14)}
                    <span className="text-body-sm text-ink-700">{convertTemp(h.temperature_c)}°</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-ink-100 rounded-md p-3 shadow-sm">
              <div className="text-body-sm font-medium text-ink-700 mb-2">5-Day Forecast (5天预报)</div>
              <div className="space-y-2">
                {currentWeather.daily.map((day, i) => (
                  <div key={day.date} className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-ink-200">
                    <div className="w-24"><span className="text-body-sm text-ink-700">{i === 0 ? 'Today (今天)' : day.date.slice(5)}</span></div>
                    <div className="flex items-center gap-1 flex-1">{conditionIcon(day.condition, 16)}<span className="text-caption text-ink-500">{conditionLabel(day.condition)}</span></div>
                    <div className="w-20 text-right"><span className="text-body-sm text-cinnabar">{convertTemp(day.high_c)}°</span><span className="text-ink-400 mx-1">/</span><span className="text-body-sm text-info">{convertTemp(day.low_c)}°</span></div>
                    <div className="w-14 text-right"><span className="text-caption text-ink-500">{day.precip_chance}%</span></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function keyFor(location: WeatherLocation): string {
  return `${location.latitude.toFixed(4)},${location.longitude.toFixed(4)}`;
}

function Metric({ icon, label, value, accent }: { icon?: ReactNode; label: string; value: string; accent?: string }) {
  return (
    <div className="bg-ink-50 rounded p-2 text-center">
      <div className="flex items-center justify-center gap-1 mb-1">{icon}<span className="text-caption text-ink-500">{label}</span></div>
      <div className="text-body-sm text-ink-800" style={{ color: accent }}>{value}</div>
    </div>
  );
}
