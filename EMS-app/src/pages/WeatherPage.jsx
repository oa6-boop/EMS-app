import { useEffect, useState } from "react";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

function formatTime(value) {
  if (!value) return "N/A";

  try {
    return new Date(value).toLocaleString("en", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return value;
  }
}

function formatDay(value) {
  if (!value) return "N/A";

  try {
    return new Date(value).toLocaleDateString("en", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  } catch {
    return value;
  }
}

function getAuthHeaders() {
  const token =
    localStorage.getItem("token") ||
    localStorage.getItem("access_token") ||
    "";

  return token ? { Authorization: `Bearer ${token}` } : {};
}

function cleanText(value) {
  if (!value) return "N/A";

  return String(value)
    .replace(/[^\x00-\x7FÀ-ÿ\s.,'-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export default function WeatherPage({ selectedLineLabel = "Production Line 1" }) {
  const [weather, setWeather] = useState(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [permissionMessage, setPermissionMessage] = useState("");

  const loadWeather = async (lat, lon) => {
    try {
      setStatus("loading");
      setError("");
      setPermissionMessage("");

      const response = await fetch(
        `${API_BASE_URL}/api/weather?lat=${lat}&lon=${lon}`,
        {
          method: "GET",
          headers: {
            Accept: "application/json",
            ...getAuthHeaders(),
          },
        }
      );

      if (!response.ok) {
        throw new Error("Weather service unavailable");
      }

      const data = await response.json();

      setWeather(data);
      setStatus("success");
    } catch (err) {
      console.error("Weather error:", err);
      setError("Failed to fetch weather data. Please check backend connection.");
      setStatus("error");
    }
  };

  const requestLocation = () => {
    setStatus("loading");
    setError("");
    setPermissionMessage("");

    if (!navigator.geolocation) {
      setPermissionMessage("Geolocation is not supported by this browser.");
      setStatus("permission");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        loadWeather(position.coords.latitude, position.coords.longitude);
      },
      (err) => {
        console.error("Geolocation error:", err);

        if (err.code === err.PERMISSION_DENIED) {
          setPermissionMessage(
            "Please allow location access to show exact weather for your current place."
          );
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          setPermissionMessage("Your current position is unavailable.");
        } else if (err.code === err.TIMEOUT) {
          setPermissionMessage("Location request took too long. Please retry.");
        } else {
          setPermissionMessage("Unable to detect your current location.");
        }

        setStatus("permission");
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 60000,
      }
    );
  };

  useEffect(() => {
    requestLocation();
  }, []);

  const current = weather?.current || {};
  const location = weather?.location || {};

  const cityName = cleanText(location.city || "Detected location");
  const countryName = cleanText(location.country || "Current place");

  return (
    <div className="overview-page">
      <div className="section-title-wrap">
        <h1>Weather</h1>
        <p>
          Location-based weather — impacts energy consumption ·{" "}
          {selectedLineLabel}
        </p>
      </div>

      {status === "loading" && (
        <div className="info-box">
          ⏳ Detecting your location and loading weather data...
        </div>
      )}

      {status === "permission" && (
        <div className="alarm-item">
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <strong>📍 Location permission required</strong>
            <span>{permissionMessage}</span>

            <button
              type="button"
              onClick={requestLocation}
              style={{
                width: "fit-content",
                border: "none",
                borderRadius: "10px",
                padding: "0.65rem 1rem",
                background: "#2563eb",
                color: "#fff",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
          </div>
        </div>
      )}

      {status === "error" && (
        <div className="alarm-item">
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <strong>⚠ {error}</strong>

            <button
              type="button"
              onClick={requestLocation}
              style={{
                width: "fit-content",
                border: "none",
                borderRadius: "10px",
                padding: "0.65rem 1rem",
                background: "#dc2626",
                color: "#fff",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Reload
            </button>
          </div>
        </div>
      )}

      {status === "success" && weather && (
        <>
          <section className="section-block">
            <div className="carbon-kpis">
              <div className="carbon-card">
                <h4>🌡️ Temperature</h4>
                <strong style={{ fontSize: "1.4rem" }}>
                  {current.temperature ?? "N/A"}°C
                </strong>
                <span>Feels like {current.apparent_temperature ?? "N/A"}°C</span>
              </div>

              <div className="carbon-card">
                <h4>💧 Humidity</h4>
                <strong style={{ fontSize: "1.4rem" }}>
                  {current.humidity ?? "N/A"}%
                </strong>
                <span>Relative humidity</span>
              </div>

              <div className="carbon-card">
                <h4>💨 Wind</h4>
                <strong style={{ fontSize: "1.4rem" }}>
                  {current.wind_speed ?? "N/A"} km/h
                </strong>
                <span>Surface wind speed</span>
              </div>

              <div className="carbon-card">
                <h4>Sky</h4>
                <strong style={{ fontSize: "1rem" }}>
                  {current.condition || "Unknown"}
                </strong>
                <span>Weather code: {current.weather_code ?? "N/A"}</span>
              </div>

              <div className="carbon-card">
                <h4>🌧️ Precipitation</h4>
                <strong style={{ fontSize: "1.4rem" }}>
                  {current.precipitation ?? 0} mm
                </strong>
                <span>Current precipitation</span>
              </div>

              <div className="carbon-card">
                <h4>📍 Location</h4>
                <strong style={{ fontSize: "0.95rem" }}>{cityName}</strong>
                <span>{countryName}</span>
              </div>
            </div>
          </section>

          <div className="two-column-layout">
            <section className="panel-card">
              <div className="panel-head">
                <div>
                  <h2>Location Summary</h2>
                  <p>Detected from browser location</p>
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.5rem",
                  fontSize: "0.9rem",
                }}
              >
                {[
                  { label: "City", value: cityName },
                  { label: "Country", value: countryName },
                  {
                    label: "Latitude",
                    value: `${weather.latitude?.toFixed?.(5) ?? "N/A"}°`,
                  },
                  {
                    label: "Longitude",
                    value: `${weather.longitude?.toFixed?.(5) ?? "N/A"}°`,
                  },
                  { label: "Timezone", value: weather.timezone || "N/A" },
                  { label: "Updated", value: formatTime(weather.updated_at) },
                ].map((item) => (
                  <div
                    key={item.label}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: "1rem",
                      padding: "0.5rem 0",
                      borderBottom: "1px solid var(--border-color)",
                    }}
                  >
                    <span style={{ color: "var(--text-secondary)" }}>
                      {item.label}
                    </span>
                    <strong style={{ textAlign: "right" }}>{item.value}</strong>
                  </div>
                ))}
              </div>

              <div
                style={{
                  marginTop: "1rem",
                  padding: "0.75rem",
                  background: "var(--bg-main)",
                  borderRadius: "8px",
                  fontSize: "0.82rem",
                  color: "var(--text-secondary)",
                }}
              >
                💡 Weather data is based on the current browser location.
              </div>
            </section>

            <section className="panel-card">
              <div className="panel-head">
                <div>
                  <h2>3-Day Outlook</h2>
                  <p>Daily temperature forecast</p>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {(weather.daily_forecast || []).slice(0, 3).map((day, index) => {
                  const tMin = day.temp_min;
                  const tMax = day.temp_max;
                  const isHot = Number(tMax) > 35;

                  return (
                    <div
                      key={day.date || index}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: "1rem",
                        padding: "0.75rem",
                        borderRadius: "10px",
                        background: isHot ? "#fff5f5" : "var(--bg-main)",
                        border: `1px solid ${
                          isHot ? "#fed7d7" : "var(--border-color)"
                        }`,
                      }}
                    >
                      <strong style={{ fontSize: "0.9rem" }}>
                        {formatDay(day.date)}
                      </strong>

                      <div
                        style={{
                          display: "flex",
                          gap: "1rem",
                          fontSize: "0.85rem",
                        }}
                      >
                        <span style={{ color: "#4299e1" }}>
                          Min: <strong>{tMin ?? "N/A"}°C</strong>
                        </span>

                        <span style={{ color: isHot ? "#e53e3e" : "#ed8936" }}>
                          Max: <strong>{tMax ?? "N/A"}°C</strong>
                        </span>
                      </div>

                      <span
                        style={{
                          fontSize: "0.72rem",
                          color: isHot ? "#e53e3e" : "var(--text-secondary)",
                          fontWeight: 700,
                        }}
                      >
                        {isHot ? "⚠️ High temp" : day.condition}
                      </span>
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