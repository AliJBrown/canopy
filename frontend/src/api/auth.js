import client from './client';

export const getAuthConfig = () => client.get('/api/auth/config');
export const login = (email, password) => client.post('/api/auth/login', { email, password });
export const getMe = () => client.get('/api/auth/me');
export const changePassword = (currentPassword, newPassword) =>
  client.put('/api/auth/password', { currentPassword, newPassword });
