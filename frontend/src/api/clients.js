import client from './client';

export const getClients = () => client.get('/api/clients');
export const getClient = (id) => client.get(`/api/clients/${id}`);
export const createClient = (data) => client.post('/api/clients', data);
export const updateClient = (id, data) => client.patch(`/api/clients/${id}`, data);
export const deleteClient = (id) => client.delete(`/api/clients/${id}`);
