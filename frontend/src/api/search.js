import client from './client';

export const globalSearch = (q, limit = 10) =>
  client.get(`/api/search?q=${encodeURIComponent(q)}&limit=${limit}`);
