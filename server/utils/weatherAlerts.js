function buildAlerts(current) {
  const alerts = [];

  const temp = current?.main?.temp;
  const weatherMain = current?.weather?.[0]?.main;
  const windSpeed = current?.wind?.speed;

  if (typeof temp === "number" && temp > 40) {
    alerts.push({ type: "HIGH_TEMPERATURE", message: "High temperature alert (> 40°C)." });
  }

  if (weatherMain && ["Rain", "Thunderstorm", "Tornado", "Squall"].includes(weatherMain)) {
    if (weatherMain === "Rain") alerts.push({ type: "HEAVY_RAIN", message: "Heavy rain alert." });
    if (weatherMain === "Thunderstorm") alerts.push({ type: "STORM_WARNING", message: "Storm warning (thunderstorm)." });
    if (weatherMain === "Tornado") alerts.push({ type: "STORM_WARNING", message: "Storm warning (tornado)." });
    if (weatherMain === "Squall") alerts.push({ type: "STORM_WARNING", message: "Storm warning (squall)." });
  }

  // Extra: if wind is extreme (~> 20 m/s), treat as storm-like condition.
  if (typeof windSpeed === "number" && windSpeed > 20) {
    alerts.push({ type: "STORM_WARNING", message: "Storm warning (very high wind)." });
  }

  return alerts;
}

module.exports = { buildAlerts };

