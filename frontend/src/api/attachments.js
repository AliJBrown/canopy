import client from './client';

export const getAttachments = (ticketId) =>
  client.get(`/api/tickets/${ticketId}/attachments`);

export const uploadAttachment = (ticketId, file, onUploadProgress) => {
  const formData = new FormData();
  formData.append('file', file);
  return client.post(`/api/tickets/${ticketId}/attachments`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress,
  });
};

export const deleteAttachment = (ticketId, id) =>
  client.delete(`/api/tickets/${ticketId}/attachments/${id}`);
