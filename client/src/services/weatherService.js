import { api } from "./apiClient.js";

export async function getWeather(city) {
  if (!city) return null;
  const { data } = await api.get(`/weather/${encodeURIComponent(city)}`);
  return data;
}

