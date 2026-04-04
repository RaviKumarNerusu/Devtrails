const SearchHistory = require("../models/SearchHistory");
const { fetchCurrentWeather, fetchFiveDayForecast } = require("./openWeatherService");
const { buildAlerts } = require("../utils/weatherAlerts");

function simplifyForecast(forecastData) {
  const items = Array.isArray(forecastData?.list) ? forecastData.list : [];
  const byDate = new Map();

  for (const item of items) {
    const dtTxt = item?.dt_txt;
    if (!dtTxt) continue;
    const date = dtTxt.slice(0, 10);
    const hour = Number(dtTxt.slice(11, 13));

    const score = Math.abs(12 - hour);
    const prev = byDate.get(date);
    if (!prev || score < prev.score) {
      byDate.set(date, {
        score,
        date,
        temp: item?.main?.temp,
        humidity: item?.main?.humidity,
        wind: item?.wind?.speed,
        weather: item?.weather?.[0]?.main
      });
    }
  }

  return Array.from(byDate.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(({ score, ...rest }) => rest);
}

async function getCityWeatherForUser(user, rawCity) {
  const city = String(rawCity || "").trim();
  if (!city) {
    const error = new Error("City is required");
    error.statusCode = 400;
    throw error;
  }

  const [current, forecast] = await Promise.all([fetchCurrentWeather(city), fetchFiveDayForecast(city)]);

  if (user?._id) {
    await SearchHistory.create({
      userId: user._id,
      city: current?.name || city,
      date: new Date()
    });
  }

  const alerts = buildAlerts(current);
  const trend = simplifyForecast(forecast);

  return {
    city: current?.name || city,
    coordinates: {
      lat: current?.coord?.lat,
      lon: current?.coord?.lon
    },
    current: {
      temperature: current?.main?.temp,
      feelsLike: current?.main?.feels_like,
      humidity: current?.main?.humidity,
      pressure: current?.main?.pressure,
      visibility: current?.visibility,
      windSpeed: current?.wind?.speed,
      condition: current?.weather?.[0]?.main,
      description: current?.weather?.[0]?.description,
      icon: current?.weather?.[0]?.icon,
      sunrise: current?.sys?.sunrise ? current.sys.sunrise * 1000 : undefined,
      sunset: current?.sys?.sunset ? current.sys.sunset * 1000 : undefined
    },
    forecast: {
      rawCount: Array.isArray(forecast?.list) ? forecast.list.length : 0,
      trend
    },
    alerts
  };
}

module.exports = {
  getCityWeatherForUser
};

