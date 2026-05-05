import { apiJSON } from './api';

export interface WeatherLocation {
  name: string;
  country?: string;
  admin1?: string;
  latitude: number;
  longitude: number;
  timezone?: string;
}

export interface WeatherForecast {
  location: WeatherLocation;
  updated_at: string;
  current: {
    temperature_c: number;
    feels_like_c: number;
    condition: string;
    humidity: number;
    wind_kph: number;
    visibility_km: number;
    pressure_hpa: number;
    uv_index: number;
  };
  daily: Array<{
    date: string;
    condition: string;
    high_c: number;
    low_c: number;
    precip_chance: number;
    precipitation_mm: number;
  }>;
  hourly: Array<{
    time: string;
    hour: number;
    temperature_c: number;
    condition: string;
  }>;
  source: string;
  cache_expires_at: string;
}

export const weatherClient = {
  search: (q: string) => apiJSON<{ locations: WeatherLocation[] }>(`/api/weather/search?q=${encodeURIComponent(q)}`),
  forecast: (location: WeatherLocation, force = false) => {
    const params = new URLSearchParams({
      name: location.name,
      lat: String(location.latitude),
      lon: String(location.longitude),
      force: String(force),
    });
    if (location.country) params.set('country', location.country);
    if (location.admin1) params.set('admin1', location.admin1);
    if (location.timezone) params.set('timezone', location.timezone);
    return apiJSON<WeatherForecast>(`/api/weather/forecast?${params.toString()}`);
  },
};
