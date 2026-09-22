import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 10000
});

// ============================================================
// AUTH TOKEN
// Send JWT token automatically with every API request
// ============================================================
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// ============================================================
// API FUNCTIONS
// ============================================================

export const getVehicles = () =>
  api.get('/vehicles').then((r) => r.data);

export const getVehiclesList = () =>
  api.get('/vehicles/list').then((r) => r.data);

export const getVehicleDetails = (id) =>
  api.get('/vehicles/' + id + '/details').then((r) => r.data);

export const addReading = (vehicleId, data) =>
  api.post('/vehicles/' + vehicleId + '/reading', data).then((r) => r.data);

export const changeOil = (vehicleId, data) =>
  api.post('/vehicles/' + vehicleId + '/oil-change', data).then((r) => r.data);

export const getAlerts = () =>
  api.get('/alerts').then((r) => r.data);

export const getIssueTypes = () =>
  api.get('/issues/types').then((r) => r.data);

export const reportIssue = (data) =>
  api.post('/issues/report', data).then((r) => r.data);

export const getTickets = () =>
  api.get('/tickets').then((r) => r.data);

export const deleteAllTickets = () =>
  api.delete('/tickets').then((r) => r.data);

export const getWorkOrders = () =>
  api.get('/work-orders').then((r) => r.data);

export const getDashboard = () =>
  api.get('/dashboard').then((r) => r.data);

export const sendVoiceTranscript = (data) =>
  api.post('/voice/transcript', data).then((r) => r.data);

export default api;
