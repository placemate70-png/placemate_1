import axios from "axios";

// Vite exposes env vars as import.meta.env.VITE_*; REACT_APP_* is kept as a
// fallback so an existing .env still works during the migration.
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || import.meta.env.VITE_REACT_APP_BACKEND_URL;

export const API = `${BACKEND_URL}/api`;
export const TOKEN_KEY = "piq_token";

export const api = axios.create({ baseURL: API, withCredentials: true });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export function formatApiError(error) {
  const detail = error?.response?.data?.detail;
  if (detail == null) return error?.message || "Something went wrong. Please try again.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e)))
      .filter(Boolean)
      .join(" ");
  }
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail);
}

export function fileUrl(downloadToken) {
  return `${API}/files/download?token=${encodeURIComponent(downloadToken)}`;
}
