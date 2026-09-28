import axios from 'axios';
import { API_URL } from './backend';

const api = axios.create({
  baseURL: API_URL,
  withCredentials: true
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // If it's a 401 AND the request wasn't the login attempt
    if (error.response?.status === 401 && !error.config.url.includes('/login')) {
      localStorage.removeItem('user');
      window.location.href = `/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    }
    return Promise.reject(error);
  }
);

export default api;
