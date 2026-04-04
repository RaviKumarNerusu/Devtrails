import React from "react";

export default function WeatherCards({ current }) {
  if (!current) return null;

  const { temperature, feelsLike, humidity, pressure, visibility, windSpeed, condition, description, sunrise, sunset } =
    current;

  return (
    <div className="row g-3 mb-3">
      <div className="col-md-3">
        <div className="card card-glass shadow-sm h-100">
          <div className="card-body">
            <h5 className="card-title">Temperature</h5>
            <p className="display-6 mb-0">{temperature != null ? `${temperature.toFixed(1)} °C` : "-"}</p>
            {feelsLike != null && <p className="text-muted mb-0 small">Feels like {feelsLike.toFixed(1)} °C</p>}
          </div>
        </div>
      </div>
      <div className="col-md-3">
        <div className="card card-glass shadow-sm h-100">
          <div className="card-body">
            <h5 className="card-title">Humidity</h5>
            <p className="display-6 mb-0">{humidity != null ? `${humidity} %` : "-"}</p>
          </div>
        </div>
      </div>
      <div className="col-md-3">
        <div className="card card-glass shadow-sm h-100">
          <div className="card-body">
            <h5 className="card-title">Wind</h5>
            <p className="display-6 mb-0">{windSpeed != null ? `${windSpeed.toFixed(1)} m/s` : "-"}</p>
          </div>
        </div>
      </div>
      <div className="col-md-3">
        <div className="card card-glass shadow-sm h-100">
          <div className="card-body">
            <h5 className="card-title">Condition</h5>
            <p className="fs-4 mb-0">{condition || "-"}</p>
            <p className="text-muted mb-0">{description}</p>
          </div>
        </div>
      </div>
      <div className="col-md-3">
        <div className="card card-glass shadow-sm h-100">
          <div className="card-body">
            <h5 className="card-title">Pressure</h5>
            <p className="display-6 mb-0">{pressure != null ? `${pressure} hPa` : "-"}</p>
            {visibility != null && <p className="text-muted mb-0 small">Visibility {(visibility / 1000).toFixed(1)} km</p>}
          </div>
        </div>
      </div>
      <div className="col-md-3">
        <div className="card card-glass shadow-sm h-100">
          <div className="card-body">
            <h5 className="card-title">Sunrise / Sunset</h5>
            <p className="mb-0">
              <span className="badge bg-warning text-dark pill-badge me-1">
                {sunrise ? new Date(sunrise).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "--"}
              </span>
              <span className="badge bg-secondary pill-badge">
                {sunset ? new Date(sunset).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "--"}
              </span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

