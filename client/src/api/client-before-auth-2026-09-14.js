import axios from 'axios';

const api = axios.create({ baseURL: '/api', timeout: 10000 });

export const getVehicles = () => api.get('/vehicles').then(function(r) { return r.data; });
export const getVehiclesList = () => api.get('/vehicles/list').then(function(r) { return r.data; });
export const getVehicleDetails = (id) => api.get('/vehicles/' + id + '/details').then(function(r) { return r.data; });
export const addReading = (vehicleId, data) => api.post('/vehicles/' + vehicleId + '/reading', data).then(function(r) { return r.data; });
export const changeOil = (vehicleId, data) => api.post('/vehicles/' + vehicleId + '/oil-change', data).then(function(r) { return r.data; });
export const getAlerts = () => api.get('/alerts').then(function(r) { return r.data; });
export const getIssueTypes = () => api.get('/issues/types').then(function(r) { return r.data; });
export const reportIssue = (data) => api.post('/issues/report', data).then(function(r) { return r.data; });
export const getTickets = () => api.get('/tickets').then(function(r) { return r.data; });
export const deleteAllTickets = () => api.delete('/tickets').then(function(r) { return r.data; });
export const getWorkOrders = () => api.get('/work-orders').then(function(r) { return r.data; });
export const getDashboard = () => api.get('/dashboard').then(function(r) { return r.data; });
export const sendVoiceTranscript = (data) => api.post('/voice/transcript', data).then(function(r) { return r.data; });

export default api;
