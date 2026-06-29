import client from './client';

// Returns { tickets, total } — callers must destructure
export const getTickets = async (params) => {
  const result = await client.get('/api/tickets', { params });
  // Support both old array shape (e.g. from BacklogView) and new { tickets, total }
  if (Array.isArray(result)) return { tickets: result, total: result.length };
  return result;
};

// Convenience: just the array (for components that don't need total)
export const getTicketList = async (params) => {
  const { tickets } = await getTickets(params);
  return tickets;
};

export const getTicket = (id) => client.get(`/api/tickets/${id}`);
export const createTicket = (data) => client.post('/api/tickets', data);
export const updateTicket = (id, data) => client.patch(`/api/tickets/${id}`, data);
export const deleteTicket = (id) => client.delete(`/api/tickets/${id}`);
