import client from './client';

export const getPrograms = () => client.get('/api/programs');
export const getProgram = (id) => client.get(`/api/programs/${id}`);
export const createProgram = (data) => client.post('/api/programs', data);
export const updateProgram = (id, data) => client.patch(`/api/programs/${id}`, data);
export const deleteProgram = (id) => client.delete(`/api/programs/${id}`);
