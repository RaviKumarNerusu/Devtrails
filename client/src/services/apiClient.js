import axios from "axios";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.DEV
    ? "http://localhost:5000"
    : "https://devtrails-riec.onrender.com");

export const api = axios.create({
  baseURL: `${API_BASE_URL}/api`
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("auth_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => {
    if (response.data && typeof response.data.success === "boolean") {
      // Unwrap only when `data` container exists; otherwise preserve top-level payload
      if (Object.prototype.hasOwnProperty.call(response.data, "data")) {
        return {
          ...response,
          data: response.data.data,
          message: response.data.message
        };
      }
      return {
        ...response,
        data: response.data,
        message: response.data.message
      };
    }
    return response;
  },
  (error) => {
    const normalizedError = new Error(
      error.response?.data?.message || error.message || "Request failed"
    );
    normalizedError.status = error.response?.status;
    normalizedError.response = error.response;
    normalizedError.raw = error;
    throw normalizedError;
  }
);

