import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Sun, Cloud, CloudRain, CloudSnow, CloudLightning, CloudFog, Wind,
  Droplets, Eye, Gauge, Search, Thermometer, CloudSun, X
} from 'lucide-react';

type WeatherCondition = 'Sunny' | 'Cloudy' | 'Partly Cloudy' | 'Rain' | 'Heavy Rain' | 'Snow' | 'Thunderstorm' | 'Fog' | 'Windy';

interface CityWeather {
  name: string;
  nameZh: string;
  temp: number;
  condition: WeatherCondition;
  humidity: number;
  windSpeed: number;
  visibility: number;
  pressure: number;
  uvIndex: number;
  high: number;
  low: number;
  feelsLike: number;
  forecast: DayForecast[];
  hourly: HourlyForecast[];
}

interface DayForecast {
  day: string;
  dayZh: string;
  condition: WeatherCondition;
  high: number;
  low: number;
  precipChance: number;
}

interface HourlyForecast {
  hour: number;
  temp: number;
  condition: WeatherCondition;
}

const CONDITIONS: WeatherCondition[] = ['Sunny', 'Cloudy', 'Partly Cloudy', 'Rain', 'Heavy Rain', 'Snow', 'Thunderstorm', 'Fog', 'Windy'];

function conditionIcon(condition: WeatherCondition, size: number = 16) {
  switch (condition) {
    case 'Sunny': return <Sun size={size} className="text-warning" />;
    case 'Cloudy': return <Cloud size={size} className="text-ink-500" />;
    case 'Partly Cloudy': return <CloudSun size={size} className="text-ink-500" />;
    case 'Rain': return <CloudRain size={size} className="text-info" />;
    case 'Heavy Rain': return <CloudRain size={size} className="text-info" />;
    case 'Snow': return <CloudSnow size={size} className="text-ink-300" />;
    case 'Thunderstorm': return <CloudLightning size={size} className="text-warning" />;
    case 'Fog': return <CloudFog size={size} className="text-ink-400" />;
    case 'Windy': return <Wind size={size} className="text-ink-500" />;
    default: return <Sun size={size} className="text-warning" />;
  }
}

function conditionLabel(condition: WeatherCondition): string {
  const labels: Record<WeatherCondition, string> = {
    'Sunny': 'Sunny (晴)',
    'Cloudy': 'Cloudy (多云)',
    'Partly Cloudy': 'Partly Cloudy (局部多云)',
    'Rain': 'Rain (雨)',
    'Heavy Rain': 'Heavy Rain (大雨)',
    'Snow': 'Snow (雪)',
    'Thunderstorm': 'Thunderstorm (雷雨)',
    'Fog': 'Fog (雾)',
    'Windy': 'Windy (风)',
  };
  return labels[condition] || condition;
}

function generateWeatherData(cityName: string, cityNameZh: string): CityWeather {
  const baseTemp = cityName === 'Beijing (北京)' ? 22 : cityName === 'Shanghai (上海)' ? 25 : cityName === 'Harbin (哈尔滨)' ? 5 : cityName === 'Sanya (三亚)' ? 30 : 15 + Math.random() * 15;
  const condition = CONDITIONS[Math.floor(Math.random() * CONDITIONS.length)];

  const forecast: DayForecast[] = [];
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const daysZh = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const today = new Date().getDay();
  for (let i = 0; i < 5; i++) {
    const dayIdx = (today + i) % 7;
    const dayTemp = baseTemp + (Math.random() - 0.5) * 8;
    forecast.push({
      day: days[dayIdx],
      dayZh: daysZh[dayIdx],
      condition: CONDITIONS[Math.floor(Math.random() * CONDITIONS.length)],
      high: Math.round(dayTemp + 3),
      low: Math.round(dayTemp - 4),
      precipChance: Math.floor(Math.random() * 60),
    });
  }

  const hourly: HourlyForecast[] = [];
  const currentHour = new Date().getHours();
  for (let i = 0; i < 24; i++) {
    const hour = (currentHour + i) % 24;
    const hourTemp = baseTemp + Math.sin((hour - 6) * Math.PI / 12) * 5 + (Math.random() - 0.5) * 2;
    hourly.push({
      hour,
      temp: Math.round(hourTemp),
      condition: CONDITIONS[Math.floor(Math.random() * CONDITIONS.length)],
    });
  }

  return {
    name: cityName,
    nameZh: cityNameZh,
    temp: Math.round(baseTemp),
    condition,
    humidity: 40 + Math.floor(Math.random() * 40),
    windSpeed: Math.round(Math.random() * 20 + 2),
    visibility: Math.round(Math.random() * 10 + 5),
    pressure: 1000 + Math.floor(Math.random() * 30),
    uvIndex: Math.floor(Math.random() * 10),
    high: Math.round(baseTemp + 4),
    low: Math.round(baseTemp - 5),
    feelsLike: Math.round(baseTemp + (Math.random() - 0.5) * 4),
    forecast,
    hourly,
  };
}

const PRESET_CITIES = [
  { name: 'Beijing (北京)', nameZh: '北京' },
  { name: 'Shanghai (上海)', nameZh: '上海' },
  { name: 'Tokyo (东京)', nameZh: '东京' },
  { name: 'London (伦敦)', nameZh: '伦敦' },
  { name: 'New York (纽约)', nameZh: '纽约' },
  { name: 'Paris (巴黎)', nameZh: '巴黎' },
  { name: 'Sydney (悉尼)', nameZh: '悉尼' },
  { name: 'Moscow (莫斯科)', nameZh: '莫斯科' },
  { name: 'Dubai (迪拜)', nameZh: '迪拜' },
  { name: 'Singapore (新加坡)', nameZh: '新加坡' },
  { name: 'Seoul (首尔)', nameZh: '首尔' },
  { name: 'Bangkok (曼谷)', nameZh: '曼谷' },
  { name: 'Cairo (开罗)', nameZh: '开罗' },
  { name: 'Rome (罗马)', nameZh: '罗马' },
  { name: 'Berlin (柏林)', nameZh: '柏林' },
  { name: 'Toronto (多伦多)', nameZh: '多伦多' },
  { name: 'Mumbai (孟买)', nameZh: '孟买' },
  { name: 'Rio de Janeiro (里约)', nameZh: '里约' },
  { name: 'Istanbul (伊斯坦布尔)', nameZh: '伊斯坦布尔' },
  { name: 'Hong Kong (香港)', nameZh: '香港' },
  { name: 'Harbin (哈尔滨)', nameZh: '哈尔滨' },
  { name: 'Sanya (三亚)', nameZh: '三亚' },
];

export default function Weather() {
  const [savedCities, setSavedCities] = useState<CityWeather[]>([
    generateWeatherData('Beijing (北京)', '北京'),
    generateWeatherData('Shanghai (上海)', '上海'),
    generateWeatherData('Tokyo (东京)', '东京'),
  ]);
  const [activeCity, setActiveCity] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [unit, setUnit] = useState<'C' | 'F'>('C');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const currentWeather = savedCities[activeCity];

  const refreshData = useCallback(() => {
    setSavedCities(prev => prev.map(city => ({
      ...city,
      temp: city.temp + (Math.random() > 0.7 ? (Math.random() > 0.5 ? 1 : -1) : 0),
      humidity: Math.max(10, Math.min(95, city.humidity + Math.floor((Math.random() - 0.5) * 3))),
      windSpeed: Math.max(0, city.windSpeed + Math.floor((Math.random() - 0.5) * 2)),
    })));
  }, []);

  useEffect(() => {
    intervalRef.current = setInterval(refreshData, 60000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [refreshData]);

  const addCity = (cityInfo: typeof PRESET_CITIES[0]) => {
    if (!savedCities.find(c => c.name === cityInfo.name)) {
      const newCity = generateWeatherData(cityInfo.name, cityInfo.nameZh);
      setSavedCities(prev => [...prev, newCity]);
      setActiveCity(savedCities.length);
    }
    setShowSearch(false);
    setSearchQuery('');
  };

  const removeCity = (index: number) => {
    if (savedCities.length <= 1) return;
    setSavedCities(prev => prev.filter((_, i) => i !== index));
    if (activeCity >= index && activeCity > 0) setActiveCity(activeCity - 1);
  };

  const convertTemp = (c: number) => unit === 'C' ? c : Math.round(c * 9 / 5 + 32);

  const filteredCities = PRESET_CITIES.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.nameZh.includes(searchQuery)
  );

  return (
    <div className="w-full h-full flex flex-col bg-ink-50 overflow-hidden">
      {/* City Tabs */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-ink-200 bg-ink-100 overflow-x-auto">
        {savedCities.map((city, i) => (
          <div key={city.name} className="flex items-center flex-shrink-0">
            <button
              onClick={() => setActiveCity(i)}
              className={`px-3 py-1.5 rounded text-body-sm whitespace-nowrap transition-colors ${
                activeCity === i ? 'bg-ink-800 text-ink-50' : 'text-ink-600 hover:bg-ink-200'
              }`}
            >
              {city.name}
            </button>
            {savedCities.length > 1 && (
              <button onClick={() => removeCity(i)} className="ml-0.5 text-ink-400 hover:text-cinnabar transition-colors">
                <X size={12} />
              </button>
            )}
          </div>
        ))}
        <button
          onClick={() => setShowSearch(!showSearch)}
          className="flex items-center gap-1 px-2 py-1.5 rounded text-ink-600 hover:bg-ink-200 transition-colors text-body-sm flex-shrink-0"
        >
          <Search size={14} /> +
        </button>
        <button
          onClick={() => setUnit(unit === 'C' ? 'F' : 'C')}
          className="ml-auto px-2 py-1 rounded border border-ink-300 text-ink-600 text-caption hover:border-cinnabar transition-colors flex-shrink-0"
        >
          °{unit}
        </button>
      </div>

      {/* Search dropdown */}
      {showSearch && (
        <div className="bg-ink-100 border-b border-ink-200 px-3 py-2">
          <div className="flex items-center gap-2 mb-2">
            <Search size={14} className="text-ink-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search city (搜索城市)..."
              className="flex-1 bg-ink-50 border border-ink-300 rounded px-3 py-1.5 text-body-sm text-ink-700 outline-none focus:border-cinnabar"
              autoFocus
            />
            <button onClick={() => { setShowSearch(false); setSearchQuery(''); }} className="text-ink-500 hover:text-ink-700">
              <X size={16} />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1 max-h-32 overflow-y-auto">
            {filteredCities.filter(c => !savedCities.find(s => s.name === c.name)).map(city => (
              <button
                key={city.name}
                onClick={() => addCity(city)}
                className="text-left px-2 py-1 rounded text-body-sm text-ink-600 hover:bg-ink-200 transition-colors truncate"
              >
                {city.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {currentWeather && (
          <div className="p-4 space-y-4">
            {/* Current Weather */}
            <div className="bg-ink-100 rounded-md p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-heading-lg text-ink-800">{currentWeather.name}</div>
                  <div className="text-body-sm text-ink-500">{currentWeather.nameZh}</div>
                </div>
                <div className="text-right">
                  <div className="flex items-start">
                    <span className="text-display-xl text-ink-800 font-display">{convertTemp(currentWeather.temp)}°</span>
                  </div>
                  <div className="flex items-center gap-1 justify-end">
                    {conditionIcon(currentWeather.condition, 16)}
                    <span className="text-body-sm text-ink-600">{conditionLabel(currentWeather.condition)}</span>
                  </div>
                </div>
              </div>

              {/* Detail cards */}
              <div className="grid grid-cols-4 gap-2 mt-3">
                <div className="bg-ink-50 rounded p-2 text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <Thermometer size={12} className="text-cinnabar" />
                    <span className="text-caption text-ink-500">Feels (体感)</span>
                  </div>
                  <div className="text-body-sm text-ink-800">{convertTemp(currentWeather.feelsLike)}°</div>
                </div>
                <div className="bg-ink-50 rounded p-2 text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <Droplets size={12} className="text-info" />
                    <span className="text-caption text-ink-500">Humidity (湿度)</span>
                  </div>
                  <div className="text-body-sm text-ink-800">{currentWeather.humidity}%</div>
                </div>
                <div className="bg-ink-50 rounded p-2 text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <Wind size={12} className="text-success" />
                    <span className="text-caption text-ink-500">Wind (风速)</span>
                  </div>
                  <div className="text-body-sm text-ink-800">{currentWeather.windSpeed} km/h</div>
                </div>
                <div className="bg-ink-50 rounded p-2 text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <Eye size={12} className="text-ink-600" />
                    <span className="text-caption text-ink-500">Visibility (能见度)</span>
                  </div>
                  <div className="text-body-sm text-ink-800">{currentWeather.visibility} km</div>
                </div>
                <div className="bg-ink-50 rounded p-2 text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <Gauge size={12} className="text-warning" />
                    <span className="text-caption text-ink-500">Pressure (气压)</span>
                  </div>
                  <div className="text-body-sm text-ink-800">{currentWeather.pressure} hPa</div>
                </div>
                <div className="bg-ink-50 rounded p-2 text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <Sun size={12} className="text-warning" />
                    <span className="text-caption text-ink-500">UV Index (紫外线)</span>
                  </div>
                  <div className="text-body-sm text-ink-800">{currentWeather.uvIndex}</div>
                </div>
                <div className="bg-ink-50 rounded p-2 text-center">
                  <div className="text-caption text-ink-500 mb-1">High (最高)</div>
                  <div className="text-body-sm text-cinnabar">{convertTemp(currentWeather.high)}°</div>
                </div>
                <div className="bg-ink-50 rounded p-2 text-center">
                  <div className="text-caption text-ink-500 mb-1">Low (最低)</div>
                  <div className="text-body-sm text-info">{convertTemp(currentWeather.low)}°</div>
                </div>
              </div>
            </div>

            {/* Hourly Forecast */}
            <div className="bg-ink-100 rounded-md p-3 shadow-sm">
              <div className="text-body-sm font-medium text-ink-700 mb-2">Hourly Forecast (每小时)</div>
              <div className="flex gap-3 overflow-x-auto pb-1">
                {currentWeather.hourly.map((h, i) => (
                  <div key={i} className="flex flex-col items-center gap-1 flex-shrink-0 px-2 py-1 rounded hover:bg-ink-200 transition-colors">
                    <span className="text-caption text-ink-500">{String(h.hour).padStart(2, '0')}:00</span>
                    {conditionIcon(h.condition, 14)}
                    <span className="text-body-sm text-ink-700">{convertTemp(h.temp)}°</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 5-Day Forecast */}
            <div className="bg-ink-100 rounded-md p-3 shadow-sm">
              <div className="text-body-sm font-medium text-ink-700 mb-2">5-Day Forecast (5天预报)</div>
              <div className="space-y-2">
                {currentWeather.forecast.map((day, i) => (
                  <div key={i} className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-ink-200 transition-colors">
                    <div className="w-20">
                      <span className="text-body-sm text-ink-700">{i === 0 ? 'Today (今天)' : day.day}</span>
                    </div>
                    <div className="flex items-center gap-1 flex-1">
                      {conditionIcon(day.condition, 16)}
                      <span className="text-caption text-ink-500">{conditionLabel(day.condition)}</span>
                    </div>
                    <div className="w-16 text-right">
                      <span className="text-body-sm text-cinnabar">{convertTemp(day.high)}°</span>
                      <span className="text-ink-400 mx-1">/</span>
                      <span className="text-body-sm text-info">{convertTemp(day.low)}°</span>
                    </div>
                    <div className="w-12 text-right">
                      <span className="text-caption text-ink-500">{day.precipChance}%</span>
                    </div>
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
