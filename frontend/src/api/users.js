import client from './client';

export const getUsers = () => client.get('/api/users');
export const createUser = (data) => client.post('/api/users', data);
export const updateUser = (id, data) => client.patch(`/api/users/${id}`, data);
export const deleteUser = (id) => client.delete(`/api/users/${id}`);
