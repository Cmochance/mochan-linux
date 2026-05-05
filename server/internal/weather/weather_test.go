package weather

import (
	"testing"
	"time"
)

func TestMapForecast(t *testing.T) {
	var body openMeteoForecast
	body.Current.Temperature = 21.5
	body.Current.ApparentTemperature = 22
	body.Current.Humidity = 65
	body.Current.WeatherCode = 61
	body.Current.Pressure = 1012
	body.Current.WindSpeed = 12
	body.Current.Visibility = 9000
	body.Hourly.Time = []string{"2026-05-06T08:00", "2026-05-06T09:00"}
	body.Hourly.Temperature = []float64{21, 22}
	body.Hourly.WeatherCode = []int{0, 3}
	body.Daily.Time = []string{"2026-05-06"}
	body.Daily.WeatherCode = []int{95}
	body.Daily.TemperatureMax = []float64{25}
	body.Daily.TemperatureMin = []float64{18}
	body.Daily.PrecipitationSum = []float64{4.2}
	body.Daily.PrecipProbabilityMax = []int{80}
	body.Daily.UVIndexMax = []float64{6}

	forecast := mapForecast(Location{Name: "Test", Latitude: 1, Longitude: 2}, body, time.Unix(10, 0).UTC())
	if forecast.Current.Condition != "Rain" {
		t.Fatalf("current condition = %q, want Rain", forecast.Current.Condition)
	}
	if forecast.Current.VisibilityKM != 9 {
		t.Fatalf("visibility km = %v, want 9", forecast.Current.VisibilityKM)
	}
	if len(forecast.Hourly) != 2 || forecast.Hourly[0].Hour != 8 {
		t.Fatalf("unexpected hourly forecast: %#v", forecast.Hourly)
	}
	if len(forecast.Daily) != 1 || forecast.Daily[0].Condition != "Thunderstorm" || forecast.Daily[0].PrecipChance != 80 {
		t.Fatalf("unexpected daily forecast: %#v", forecast.Daily)
	}
}

func TestConditionMapping(t *testing.T) {
	cases := map[int]string{
		0:  "Sunny",
		2:  "Partly Cloudy",
		3:  "Cloudy",
		45: "Fog",
		61: "Rain",
		80: "Heavy Rain",
		71: "Snow",
		95: "Thunderstorm",
	}
	for code, want := range cases {
		if got := condition(code); got != want {
			t.Fatalf("condition(%d) = %q, want %q", code, got, want)
		}
	}
}
