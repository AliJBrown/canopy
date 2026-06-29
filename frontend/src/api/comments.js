import client from './client';

export const getComments = (ticketId) => client.get('/api/comments', { params: { ticketId } });
export const createComment = (data) => client.post('/api/comments', data);
export const updateComment = (id, data) => client.patch(`/api/comments/${id}`, data);
export const deleteComment = (id) => client.delete(`/api/comments/${id}`);
