import axios from 'axios';

const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
  headers: { 'Content-Type': 'application/json' },
});

client.interceptors.request.use(config => {
  const token = localStorage.getItem('auth_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

client.interceptors.response.use(
  res => res.data,
  err => {
    if (err.response?.status === 401 && window.location.pathname !== '/login') {
      localStorage.removeItem('auth_token');
      window.location.href = '/login';
    }
    return Promise.reject(err.response?.data || err);
  }
);

export default client;
