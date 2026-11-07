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

export const getMaintenanceTickets = () =>
  api.get('/tickets', { params: { fleetType: 'maintenance' } }).then((r) => r.data);

export const getMaintenanceWhatsAppInfo = (id) =>
  api.get('/tickets/' + id + '/maintenance-whatsapp-info').then((r) => r.data);

export const getSixMonthRepairStatuses = () =>
  api.get('/periodic-maintenance/repair-statuses').then((r) => r.data);

export const getSixMonthRepairWhatsAppInfo = (id) =>
  api.get('/periodic-maintenance/' + id + '/repair-whatsapp-info').then((r) => r.data);

export const deleteAllTickets = () =>
  api.delete('/tickets').then((r) => r.data);

export const getWorkOrders = () =>
  api.get('/work-orders').then((r) => r.data);

export const getDashboard = () =>
  api.get('/dashboard').then((r) => r.data);

export const sendVoiceTranscript = (data) =>
  api.post('/voice/transcript', data).then((r) => r.data);

/* ============================================================
   INVOICES (Phase 4)
   ============================================================ */

export const getInvoices = () =>
  api.get('/invoices').then((r) => r.data);

export const getInvoice = (id) =>
  api.get('/invoices/' + id).then((r) => r.data);

export const uploadInvoicePreview = (file, type = 'pdf') => {
  const fd = new FormData();
  fd.append('file', file);
  const endpoint = type === 'excel'
    ? '/invoices/import-excel/preview'
    : '/invoices/import-pdf/preview';
  return api.post(endpoint, fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000
  }).then((r) => r.data);
};

export const importInvoice = (file, type = 'pdf', site = '') => {
  const fd = new FormData();
  fd.append('file', file);
  const endpoint = type === 'excel'
    ? '/invoices/import-excel'
    : '/invoices/import-pdf';
  return api.post(endpoint, fd, {
    headers: {
      'Content-Type': 'multipart/form-data',
      'X-Invoice-Site': site || ''
    },
    timeout: 120000
  }).then((r) => r.data);
};

export const autoMatchInvoice = (id) =>
  api.post('/invoices/' + id + '/auto-match').then((r) => r.data);

export const matchInvoiceItem = (id, data) =>
  api.post('/invoices/' + id + '/match', data).then((r) => r.data);

export const confirmInvoiceItemAmount = (itemId, amount) =>
  api.put('/invoices/items/' + itemId + '/confirm-amount', { amount }).then((r) => r.data);

export const verifyInvoiceTotal = (id) =>
  api.get('/invoices/' + id + '/verify-total').then((r) => r.data);

export const finalizeInvoice = (id) =>
  api.post('/invoices/' + id + '/finalize').then((r) => r.data);

/* ============================================================
   OCR INVOICE IMPORT
   Sends pre-extracted text (from Tesseract) + metadata to backend.
   ============================================================ */
export const importOcrInvoice = (payload) =>
  api.post('/invoices/import-ocr', payload, { timeout: 120000 }).then((r) => r.data);

/* ============================================================
   SITES + INVOICE UPDATE
   ============================================================ */
export const getSites = () =>
  api.get('/sites').then((r) => r.data);

export const updateInvoiceSite = (id, site) =>
  api.put('/invoices/' + id, { site }).then((r) => r.data);

export const createManualInvoice = (payload) =>
  api.post('/invoices/manual', payload).then((r) => r.data);

export const reopenMaintenanceRequest = (id, notes) =>
  api.post('/maintenance-requests/' + id + '/reopen', { notes }).then((r) => r.data);

export const archiveMaintenanceRequest = (id) =>
  api.post('/maintenance-requests/' + id + '/archive').then((r) => r.data);

export const getCampusWhatsAppInfo = (id) =>
  api.get('/maintenance-requests/' + id + '/campus-whatsapp').then((r) => r.data);

export const parseMaintenanceEmail = (text) =>
  api.post('/maintenance-requests/parse-email', { text }).then((r) => r.data);

export const updateInvoiceItemSite = (itemId, site) =>
  api.put('/invoices/items/' + itemId + '/site', { site }).then((r) => r.data);

/* ============================================================
   INVENTORY REPORT + STOCK OUT
   ============================================================ */
export const getInventoryReportBySite = (filters = {}) => {
  const params = new URLSearchParams();
  if (filters.from) params.append('from', filters.from);
  if (filters.to) params.append('to', filters.to);
  if (filters.site) params.append('site', filters.site);
  const qs = params.toString();
  return api.get('/inventory/report/by-site' + (qs ? '?' + qs : '')).then((r) => r.data);
};

export const stockOut = (payload) =>
  api.post('/inventory/stock-out', payload).then((r) => r.data);

export const stockIn = (payload) =>
  api.post('/inventory/stock-in', payload).then((r) => r.data);


export const getInventoryReportFull = (filters = {}) => {
  const params = new URLSearchParams();
  if (filters.from) params.append('from', filters.from);
  if (filters.to) params.append('to', filters.to);
  if (filters.site) params.append('site', filters.site);
  if (filters.vehicleId) params.append('vehicleId', filters.vehicleId);
  const qs = params.toString();
  return api.get('/inventory/report/full' + (qs ? '?' + qs : '')).then((r) => r.data);
};

export default api;
