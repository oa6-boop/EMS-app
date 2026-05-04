import { useEffect, useState } from "react";

function formatTime(value) {
  return new Date(value).toLocaleString();
}

const WEATHER_CODES = {
  0: "☀️ Clear sky", 1: "🌤️ Mainly clear", 2: "⛅ Partly cloudy", 3: "☁️ Overcast",
  45: "🌫️ Fog", 48: "🌫️ Icy fog", 51: "🌦️ Light drizzle", 53: "🌦️ Drizzle",
  61: "🌧️ Slight rain", 63: "🌧️ Rain", 71: "🌨️ Slight snow", 73: "❄️ Snow",
  80: "🌦️ Showers", 95: "⛈️ Thunderstorm",
};

export default function WeatherPage({ selectedLineLabel }) {
  const [weather, setWeather] = useState(null);
  const [status,  setStatus]  = useState("loading");
  const [error,   setError]   = useState("");

  useEffect(() => {
    let cancelled = false;

    const loadWeather = async (lat, lon) => {
      try {
        const res = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,wind_speed_10m,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=auto`
        );
        if (!res.ok) throw new Error("Weather service unavailable");
        const data = await res.json();
        if (!cancelled) { setWeather(data); setStatus("success"); }
      } catch (err) {
        if (!cancelled) { setError(err.message); setStatus("error"); }
      }
    };

    if (!navigator.geolocation) {
      loadWeather(33.5731, -7.5898); // Casablanca default
      return () => { cancelled = true; };
    }

    navigator.geolocation.getCurrentPosition(
      pos => loadWeather(pos.coords.latitude, pos.coords.longitude),
      ()  => loadWeather(33.5731, -7.5898)
    );

    return () => { cancelled = true; };
  }, []);

  const weatherDesc = weather ? (WEATHER_CODES[weather.current?.weather_code] || "🌡️ Unknown") : "";

  return (
    <div className="overview-page">
      <div className="section-title-wrap">
        <h1>Weather</h1>
        <p>Location-based weather — impacts HVAC energy consumption · {selectedLineLabel}</p>
      </div>

      {status === "loading" && <div className="info-box">⏳ Loading weather data...</div>}
      {status === "error"   && <div className="alarm-item">⚠ {error}</div>}

      {status === "success" && weather && (
        <>
          {/* KPIs météo */}
          <section className="section-block">
            <div className="carbon-kpis">
              <div className="carbon-card">
                <h4>🌡️ Temperature</h4>
                <strong style={{ fontSize: "1.4rem" }}>{weather.current?.temperature_2m}°C</strong>
                <span>Feels like {weather.current?.apparent_temperature}°C</span>
              </div>
              <div className="carbon-card">
                <h4>💧 Humidity</h4>
                <strong style={{ fontSize: "1.4rem" }}>{weather.current?.relative_humidity_2m}%</strong>
                <span>Relative humidity</span>
              </div>
              <div className="carbon-card">
                <h4>💨 Wind</h4>
                <strong style={{ fontSize: "1.4rem" }}>{weather.current?.wind_speed_10m} km/h</strong>
                <span>Surface wind speed</span>
              </div>
              <div className="carbon-card">
                <h4>Sky</h4>
                <strong style={{ fontSize: "1rem" }}>{weatherDesc}</strong>
                <span>Weather code: {weather.current?.weather_code}</span>
              </div>
              <div className="carbon-card">
                <h4>🌧️ Precipitation</h4>
                <strong>{weather.current?.precipitation || 0} mm</strong>
                <span>Current precipitation</span>
              </div>
              <div className="carbon-card">
                <h4>📍 Location</h4>
                <strong style={{ fontSize: "0.85rem" }}>{weather.latitude?.toFixed(2)}°N, {weather.longitude?.toFixed(2)}°E</strong>
                <span>{weather.timezone}</span>
              </div>
            </div>
          </section>

          {/* Détails + prévisions */}
          <div className="two-column-layout">
            <section className="panel-card">
              <div className="panel-head"><div><h2>Location Summary</h2><p>Detected from browser location</p></div></div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.9rem" }}>
                {[
                  { label: "Latitude",  value: `${weather.latitude}°` },
                  { label: "Longitude", value: `${weather.longitude}°` },
                  { label: "Timezone",  value: weather.timezone },
                  { label: "Updated",   value: formatTime(weather.current?.time) },
                ].map(item => (
                  <div key={item.label} style={{ display: "flex", justifyContent: "space-between", padding: "0.5rem 0", borderBottom: "1px solid var(--border-color)" }}>
                    <span style={{ color: "var(--text-secondary)" }}>{item.label}</span>
                    <strong>{item.value}</strong>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: "1rem", padding: "0.75rem", background: "var(--bg-main)", borderRadius: "8px", fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                💡 Hot weather (+35°C) increases HVAC consumption by up to 20%. Cold weather affects production line efficiency.
              </div>
            </section>

            <section className="panel-card">
              <div className="panel-head"><div><h2>3-Day Outlook</h2><p>Daily temperature forecast</p></div></div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {(weather.daily?.time || []).slice(0, 3).map((day, i) => {
                  const tMin = weather.daily.temperature_2m_min?.[i];
                  const tMax = weather.daily.temperature_2m_max?.[i];
                  const isHot = tMax > 35;
                  return (
                    <div key={day} style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "0.75rem", borderRadius: "10px",
                      background: isHot ? "#fff5f5" : "var(--bg-main)",
                      border: `1px solid ${isHot ? "#fed7d7" : "var(--border-color)"}`,
                    }}>
                      <strong style={{ fontSize: "0.9rem" }}>{new Date(day).toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric" })}</strong>
                      <div style={{ display: "flex", gap: "1rem", fontSize: "0.85rem" }}>
                        <span style={{ color: "#4299e1" }}>Min: <strong>{tMin}°C</strong></span>
                        <span style={{ color: isHot ? "#e53e3e" : "#ed8936" }}>Max: <strong>{tMax}°C</strong></span>
                      </div>
                      {isHot && <span style={{ fontSize: "0.72rem", color: "#e53e3e", fontWeight: 700 }}>⚠️ High temp</span>}
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}