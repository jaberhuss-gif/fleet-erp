import { useState, useEffect } from 'react';
import api from '../api/client';
import { exportToExcel } from '../api/export';

const TYPE_LABELS = {
  '6_months_general': '6-Month General Maintenance',
  'inspection': 'Periodic Inspection'
};

export default function PeriodicMaintenance({ canWork = false, inspectionEmailOnly = false, inspectionUpcomingOnly = false, onOpenInspectionEmail = null, onOpenInspectionUpcoming = null }) {
  const [subTab, setSubTab] = useState('all');
  const [records, setRecords] = useState([]);
  const [alerts, setAlerts] = useState({ overdue: [], dueSoon: [] });
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [completing, setCompleting] = useState(null);
  const [filterVehicle, setFilterVehicle] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [reportTab, setReportTab] = useState('original');
  const [reminderVehicle, setReminderVehicle] = useState(null);
  const [reminderForm, setReminderForm] = useState({ inspectionExpiryDate: '', reminderDays: 30, managerEmail: '', ccEmails: '' });
  const [hijriExpiryDate, setHijriExpiryDate] = useState('');
  const [showReminderSend, setShowReminderSend] = useState(false);
  const [reminderSendMode, setReminderSendMode] = useState('all');
  const [selectedReminderSites, setSelectedReminderSites] = useState([]);
  const [sendingReminders, setSendingReminders] = useState(false);
  const [reminderSendResult, setReminderSendResult] = useState(null);
  const [reminderDueVehicles, setReminderDueVehicles] = useState([]);

  const annualInspectionSites = ['Uqlat Al Soqour','Al Hadar','Al Hulayfa','Al Sabiyah','Wadi Beddah','Al Quwayiyah','Mahd ad Dhahab'];

  const [form, setForm] = useState({
    vehicleId: '', type: '6_months_general', scheduledDate: '',
    status: 'Pending', technician: '', cost: 0, notes: ''
  });

  const [completeForm, setCompleteForm] = useState({
    completedDate: '', technician: '', cost: 0, notes: ''
  });

  const loadReminderQueue = async () => {
    try {
      const res = await api.get('/inspection-reminders/due');
      setReminderDueVehicles(res.data?.vehicles || []);
    } catch (e) {
      setError('Unable to load the annual inspection email queue.');
    }
  };

  useEffect(() => {
    load();
    if (inspectionEmailOnly || inspectionUpcomingOnly) loadReminderQueue();
  }, [inspectionEmailOnly, inspectionUpcomingOnly]);

  const load = async () => {
    try {
      setLoading(true);
      const [r, a, v] = await Promise.all([
        api.get('/periodic-maintenance'),
        api.get('/periodic-maintenance/alerts'),
        api.get('/vehicles/list')
      ]);
      setRecords(r.data.records || []);
      setAlerts({ overdue: a.data.overdue || [], dueSoon: a.data.dueSoon || [] });
      setVehicles(v.data.vehicles || []);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const resetForm = () => {
    setForm({ vehicleId: '', type: '6_months_general', scheduledDate: '', status: 'Pending', technician: '', cost: 0, notes: '' });
    setEditing(null);
    setShowForm(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage(''); setError('');
    try {
      const payload = { ...form, vehicleId: Number(form.vehicleId), cost: Number(form.cost) };
      if (editing) {
        await api.put('/periodic-maintenance/' + editing.id, payload);
        setMessage('Record updated');
      } else {
        await api.post('/periodic-maintenance', payload);
        setMessage('Schedule created');
      }
      resetForm();
      load();
    } catch (e) { setError(e.response?.data?.error || e.message); }
  };

  const handleEdit = (r) => {
    setForm({
      vehicleId: r.vehicle_id, type: r.type, scheduledDate: r.scheduled_date || '',
      status: r.status, technician: r.technician || '', cost: r.cost || 0, notes: r.notes || ''
    });
    setEditing(r);
    setShowForm(true);
  };

  const handleComplete = (r) => {
    setCompleting(r);
    setCompleteForm({
      completedDate: new Date().toISOString().slice(0, 10),
      technician: r.technician || '',
      cost: r.cost || 0,
      notes: r.notes || ''
    });
  };

  const handleCompleteSubmit = async () => {
    setMessage(''); setError('');
    try {
      await api.put('/periodic-maintenance/' + completing.id + '/complete', completeForm);
      setMessage('Marked as completed');
      setCompleting(null);
      load();
    } catch (e) { setError(e.response?.data?.error || e.message); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this record?')) return;
    try {
      await api.delete('/periodic-maintenance/' + id);
      setMessage('Record deleted');
      load();
    } catch (e) { setError(e.message); }
  };

  const handleGenerate = async () => {
    if (!confirm('Auto-generate schedules for ALL vehicles? (6 months ahead)')) return;
    setMessage(''); setError('');
    try {
      const res = await api.post('/periodic-maintenance/generate', { monthsAhead: 6 });
      setMessage('Generated ' + res.data.created + ' new schedules');
      load();
    } catch (e) { setError(e.message); }
  };

  const today = new Date().toISOString().slice(0, 10);

  const filtered = records.filter(r => {
    const matchVehicle = filterVehicle === 'all' || String(r.vehicle_id) === filterVehicle;
    const matchType = filterType === 'all' || r.type === filterType;
    const matchStatus = filterStatus === 'all' || r.status === filterStatus;
    const matchSearch = search === '' ||
      (r.vehicle_plate || '').toLowerCase().includes(search.toLowerCase()) ||
      (r.driver_name || '').toLowerCase().includes(search.toLowerCase());
    return matchVehicle && matchType && matchStatus && matchSearch;
  });

  const subTabData = {
    all: filtered,
    pending: filtered.filter(r => r.status === 'Pending'),
    completed: filtered.filter(r => r.status === 'Completed'),
    overdue: filtered.filter(r => r.status === 'Pending' && r.scheduled_date < today)
  };

  const currentList = subTabData[subTab] || filtered;

  const inspectionList =
    subTab === 'all' ? null :
    subTab === 'pending' ? null :
    subTab === 'completed' ? null :
    null;

  // A record is considered filled/processed when any actual work data exists.
  // The generated vehicle/type/scheduled-date fields alone do not count.
  const hasActionData = (r) =>
    r.status === 'Completed' ||
    Boolean(String(r.completed_date || '').trim()) ||
    Boolean(String(r.technician || '').trim()) ||
    Number(r.cost || 0) > 0 ||
    Boolean(String(r.notes || '').trim());

  const filledRecords = filtered.filter(hasActionData);
  const untouchedRecords = filtered.filter((r) => !hasActionData(r));

  // Inspection control matrix: use ALL fleet vehicles so a missing PM record is
  // explicitly RED, while preserving the old ERP rule that 6-month notes prove
  // the maintenance was actually performed.
  const isInspected = (r) => {
    if (!r) return false;
    if (r.type === '6_months_general') {
      return r.status === 'Completed' ||
        Boolean(String(r.completed_date || '').trim()) ||
        Boolean(String(r.notes || '').trim());
    }
    if (r.type === 'inspection') {
      return r.status === 'Completed' ||
        Boolean(String(r.completed_date || '').trim());
    }
    return false;
  };

  const pickLatestControl = (list, type) => {
    const typed = list.filter(r => r.type === type);
    if (!typed.length) return null;
    const evidenced = typed.filter(isInspected);
    const pool = evidenced.length ? evidenced : typed;
    return pool.reduce((best, r) => {
      if (!best) return r;
      const bt = new Date(best.completed_date || best.scheduled_date || 0).getTime();
      const rt = new Date(r.completed_date || r.scheduled_date || 0).getTime();
      if (rt > bt) return r;
      if (rt === bt && Number(r.id || 0) > Number(best.id || 0)) return r;
      return best;
    }, null);
  };

  const activeVehicles = vehicles.filter(v => { const plate = String(v.plate || v.plate_number || '').trim().toLowerCase(); return plate !== 'test 123' || plate === 'test 123'; });
  const vehicleById = activeVehicles.reduce((map, v) => { map[String(v.id)] = v; return map; }, {});
  const getInspectionExpiry = (vehicleId) => {
    const v = vehicleById[String(vehicleId)];
    const value = v?.inspectionExpiryDate || v?.inspection_expiry_date || '';
    if (value) return String(value).slice(0, 10);
    const plate = String(v?.plate || v?.plate_number || '').trim().toLowerCase();
    if (plate === 'test 123' || plate === '123') {
      const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10);
    }
    return '—';
  };

  // Annual inspection is valid for one full year from the actual completion date.
  // Do not use the old Vehicle Master expiry here because it may be stale after WhatsApp confirmation.
  const getNextAnnualDueDate = (rec) => {
    const completed = String(rec?.completed_date || '').slice(0, 10);
    if (!completed) return '—';
    const d = new Date(completed + 'T00:00:00Z');
    if (Number.isNaN(d.getTime())) return '—';
    d.setUTCFullYear(d.getUTCFullYear() + 1);
    return d.toISOString().slice(0, 10);
  };

  const recordsByVehicle = records.reduce((map, r) => {
    const key = String(r.vehicle_id);
    if (!map[key]) map[key] = [];
    map[key].push(r);
    return map;
  }, {});

  const vehicleSummary = activeVehicles.map(v => {
    const vehicleRecords = recordsByVehicle[String(v.id)] || [];
    const six = pickLatestControl(vehicleRecords, '6_months_general');
    const annual = pickLatestControl(vehicleRecords, 'inspection');
    const sixDone = Boolean(six && isInspected(six));
    const annualDone = Boolean(annual && isInspected(annual));
    const missing = [];
    if (!sixDone) missing.push('6-Month Maintenance');
    if (!annualDone) missing.push('Annual Inspection');
    return {
      vehicle_id: v.id,
      plate: v.plate || v.plate_number || '-',
      location: v.location || v.site || '-',
      driver: v.driver || v.driver_name || '-',
      inspectionExpiry: v.inspectionExpiryDate || v.inspection_expiry_date || '',
      six, annual, sixDone, annualDone,
      fullyInspected: sixDone && annualDone,
      missing
    };
  });

  const partiallyInspectedVehicles = vehicleSummary.filter(v => v.sixDone !== v.annualDone);
  const notInspectedVehicles = vehicleSummary.filter(v => !v.sixDone && !v.annualDone);
  const fullyInspectedVehicles = vehicleSummary.filter(v => v.fullyInspected);

  const exportColumns = [
    { key: 'vehicle_plate', label: 'Vehicle' },
    { key: 'vehicle_location', label: 'Location' },
    { key: 'driver_name', label: 'Driver' },
    { key: 'type', label: 'Type' },
    { key: 'scheduled_date', label: 'Scheduled' },
    { key: 'completed_date', label: 'Completed' },
    { key: 'status', label: 'Status' },
    { key: 'technician', label: 'Technician' },
    { key: 'cost', label: 'Cost (SAR)' },
    { key: 'notes', label: 'Notes' }
  ];

  const exportReport = async (data, filename, sheetName) => {
    await exportToExcel(data, filename, exportColumns, sheetName);
  };

  const complianceReports = {
    sixInspected: {
      title: '6-Month Maintenance — Inspected',
      color: '#16a34a',
      rows: vehicleSummary.filter(v => v.sixDone)
    },
    annualInspected: {
      title: 'Annual Inspection — Inspected',
      color: '#16a34a',
      rows: vehicleSummary.filter(v => v.annualDone)
    },
    sixNotInspected: {
      title: '6-Month Maintenance — Not Inspected',
      color: '#dc2626',
      rows: vehicleSummary.filter(v => !v.sixDone)
    },
    annualNotInspected: {
      title: 'Annual Inspection — Not Inspected',
      color: '#dc2626',
      rows: vehicleSummary.filter(v => !v.annualDone)
    }
  };

  const normalizeWaPhone = (value) => {
    const digits = String(value || '').replace(/\D/g, '');
    if (digits.length === 9 && digits.startsWith('5')) return '966' + digits;
    if (digits.length === 10 && digits.startsWith('05')) return '966' + digits.slice(1);
    if (digits.startsWith('966')) return digits;
    return digits;
  };

  const reportWhatsApp = async (row, component, inspectedState) => {
    try {
      const info = (await api.get('/vehicles/' + row.vehicle_id + '/whatsapp-info')).data || {};
      const phone = normalizeWaPhone(info.driverPhone);
      const driver = info.driverName || row.driver || 'Driver';
      const plate = info.vehiclePlate || row.plate || '';
      if (!phone) {
        setError('No driver WhatsApp number found for vehicle ' + plate);
        return;
      }

      const confirmationUrl = String(info.confirmationUrl || '').trim();
      const cleanUrl = confirmationUrl.match(/^https:\/\/fleet-erp-kn0c\.onrender\.com\/inspection-confirm\/[0-9a-f-]+$/i)?.[0] || '';

      const message = inspectedState
        ? [
            'Hello ' + driver + ',',
            '',
            'Vehicle ' + plate + ' — ' + component + ' has been inspected and recorded.',
            '',
            'گاڑی ' + plate + ' — ' + component + ' کا معائنہ مکمل کرکے ریکارڈ کر لیا گیا ہے۔',
            '',
            'Fleet Management'
          ].join('\n')
        : [
            'Hello ' + driver + ',',
            '',
            'Vehicle ' + plate + ' — ' + component + ' inspection is still pending. Please arrange the inspection.',
            '',
            'گاڑی ' + plate + ' — ' + component + ' کا معائنہ ابھی باقی ہے۔ براہ کرم معائنہ کروائیں۔',
            '',
            'Please also inform your Supervisor and the Camp/Campus team accordingly.',
            'براہ کرم اپنے سپروائزر اور کیمپ/کیمپس ٹیم کو بھی مطلع کریں۔',
            '',
            'IMPORTANT: If you have completed the inspection, open the link below and press YES to confirm.',
            'اگر معائنہ مکمل ہو چکا ہے تو نیچے دیا گیا لنک کھولیں اور تصدیق کے لیے YES دبائیں۔',
            'If the inspection has NOT been completed yet, DO NOT press YES. Complete the inspection first, then return to this message and press YES.',
            'اگر معائنہ ابھی مکمل نہیں ہوا تو YES نہ دبائیں۔ پہلے معائنہ مکمل کریں، پھر اس پیغام پر واپس آکر YES دبائیں۔',
            '',
            'Inspection confirmation link / معائنہ کی تصدیق کا لنک:',
            cleanUrl || 'The inspection confirmation link is not available yet.\nمعائنہ کی تصدیق کا لنک ابھی دستیاب نہیں ہے۔',
            '',
            'Fleet Management'
          ].join('\n');

      window.open('https://wa.me/' + phone + '?text=' + encodeURIComponent(message), '_blank');
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    }
  };
  const openConfirmationLink = async (row) => {
    try {
      setError('');
      const info = (await api.get('/vehicles/' + row.vehicle_id + '/whatsapp-info')).data || {};
      if (!info.confirmationUrl) {
        setError('No confirmation link is available for vehicle ' + (row.plate || ''));
        return;
      }
      window.open(info.confirmationUrl, '_blank');
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    }
  };

  const closeComplianceReport = async (row, component, type) => {
    if (!canWork) return;
    if (!confirm('Confirm ' + component + ' is completed and close this item?')) return;
    setError(''); setMessage('');
    try {
      let rec = type === '6_months_general' ? row.six : row.annual;
      if (!rec) {
        const created = await api.post('/periodic-maintenance', {
          vehicleId: Number(row.vehicle_id),
          type,
          scheduledDate: new Date().toISOString().slice(0, 10),
          status: 'Pending'
        });
        rec = created.data?.record;
      }
      if (!rec?.id) throw new Error('Unable to create the maintenance record.');
      await api.put('/periodic-maintenance/' + rec.id + '/complete', {
        completedDate: new Date().toISOString().slice(0, 10),
        technician: 'Fleet Management',
        notes: component + ' completed and ticket closed.'
      });
      setMessage(component + ' closed for ' + row.plate);
      await load();
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    }
  };

  // Convert between Gregorian and Saudi Umm al-Qura Hijri dates using the
  // browser's built-in Islamic Umm al-Qura calendar. This avoids manual
  // Hijri-to-Gregorian conversion by the user.
  const gregorianToHijri = (isoDate) => {
    if (!isoDate) return '';
    const [y, m, d] = String(isoDate).slice(0, 10).split('-').map(Number);
    if (!y || !m || !d) return '';
    const parts = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', {
      year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'UTC'
    }).formatToParts(new Date(Date.UTC(y, m - 1, d)));
    const get = (type) => parts.find(p => p.type === type)?.value;
    return get('year') + '-' + get('month') + '-' + get('day');
  };

  const hijriToGregorian = (value) => {
    const m = String(value || '').trim().match(/^(\d{4})[-\/]?(\d{2})[-\/]?(\d{2})$/);
    if (!m) return '';
    const hy = Number(m[1]), hm = Number(m[2]), hd = Number(m[3]);
    if (hm < 1 || hm > 12 || hd < 1 || hd > 30) return '';

    const fmt = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', {
      year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'UTC'
    });
    const target = hy + '-' + String(hm).padStart(2, '0') + '-' + String(hd).padStart(2, '0');
    let lo = Date.UTC(hy - 622, 0, 1);
    let hi = Date.UTC(hy - 621, 11, 31);
    const key = (ms) => {
      const p = fmt.formatToParts(new Date(ms));
      const get = (type) => p.find(x => x.type === type)?.value;
      return get('year') + '-' + get('month') + '-' + get('day');
    };
    // Binary-search the Gregorian range because Umm al-Qura dates are monotonic.
    while (lo <= hi) {
      const mid = lo + Math.floor((hi - lo) / (2 * 86400000)) * 86400000;
      const k = key(mid);
      if (k === target) {
        const date = new Date(mid);
        return date.toISOString().slice(0, 10);
      }
      if (k < target) lo = mid + 86400000;
      else hi = mid - 86400000;
    }
    return '';
  };

  const openReminder = async (vehicle) => {
    // Open the modal immediately so a backend/read failure cannot make the
    // Set Expiry button appear unresponsive. The GET below then fills the
    // saved expiry/recipient values from Vehicle Master.
    setError('');
    setReminderVehicle(vehicle);
    setReminderForm({
      inspectionExpiryDate: '',
      reminderDays: 30,
      managerEmail: '',
      ccEmails: ''
    });
    try {
      const res = await api.get('/vehicles/' + vehicle.vehicle_id + '/inspection-reminder');
      const r = res.data?.reminder || {};
      setReminderForm({
        inspectionExpiryDate: r.inspection_expiry_date ? String(r.inspection_expiry_date).slice(0,10) : '',
        reminderDays: Number(r.inspection_reminder_days || 30),
        managerEmail: r.inspection_manager_email || '',
        ccEmails: r.inspection_cc_emails || ''
      });
      setHijriExpiryDate(gregorianToHijri(r.inspection_expiry_date ? String(r.inspection_expiry_date).slice(0,10) : ''));
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    }
  };

  const saveReminder = async () => {
    if (!reminderVehicle) return;
    try {
      const res = await api.put('/vehicles/' + reminderVehicle.vehicle_id + '/inspection-reminder', reminderForm);
      setMessage('Annual inspection reminder saved for ' + reminderVehicle.plate);
      setReminderVehicle(null);
      await load();
    } catch (e) { setError(e.response?.data?.error || e.message); }
  };

  const testReminder = async () => {
    if (!reminderVehicle) return;
    try {
      const res = await api.post('/vehicles/' + reminderVehicle.vehicle_id + '/inspection-reminder/test');
      setMessage('Test email sent successfully.');
    } catch (e) { setError(e.response?.data?.error || e.message); }
  };

  const openReminderSend = async () => {
    setReminderSendMode('all');
    setSelectedReminderSites([]);
    setReminderSendResult(null);
    setShowReminderSend(true);
    await loadReminderQueue();
  };

  const sendInspectionReminders = async () => {
    if (reminderSendMode === 'sites' && selectedReminderSites.length === 0) {
      setError('Please select at least one site.');
      return;
    }
    if (!confirm(reminderSendMode === 'all'
      ? 'Send annual inspection reminder emails to all sites with vehicles near expiry?'
      : 'Send annual inspection reminder emails to the selected sites?')) return;
    setSendingReminders(true);
    setError('');
    setMessage('');
    try {
      const res = await api.post('/inspection-reminders/send', {
        mode: reminderSendMode,
        sites: selectedReminderSites
      });
      setReminderSendResult(res.data);
      const sent = (res.data.results || []).filter(x => x.sent);
      const skipped = (res.data.results || []).filter(x => !x.sent);
      setMessage('Inspection reminders processed: ' + sent.length + ' email(s) sent for ' + (res.data.dueVehicles || 0) + ' eligible vehicle(s). Vehicles beyond 31 days were not emailed.');
      if (skipped.length) setError(skipped.map(x => x.site + ': ' + x.reason).join(' | '));
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setSendingReminders(false);
    }
  };

  const inspectionEmailGroups = () => {
    const selected = reminderDueVehicles
      .filter(v => Number(v.days) <= 31)
      .filter(v => reminderSendMode === 'all' || selectedReminderSites.includes(v.location));

    const groups = {};
    selected.forEach(v => {
      const site = v.location || 'Unknown Site';
      if (!groups[site]) groups[site] = [];
      groups[site].push(v);
    });

    return Object.entries(groups)
      .map(([site, rows]) => {
        const first = rows[0] || {};
        const to = String(first.managerEmail || '').trim();
        const cc = String(first.ccEmails || '').trim();
        return { site, rows: rows.sort((a,b) => Number(a.days) - Number(b.days)), to, cc };
      })
      .sort((a,b) => {
        const ad = Number(a.rows[0]?.days ?? 99999);
        const bd = Number(b.rows[0]?.days ?? 99999);
        return ad - bd || a.site.localeCompare(b.site);
      });
  };

  const buildInspectionEmail = (group) => {
  const subject = 'Annual Vehicle Inspection Reminder — ' + group.site;
  const formatDate = (value) => {
    const raw = String(value || '').slice(0, 10);
    if (!raw) return '-';
    const parts = raw.split('-');
    if (parts.length !== 3) return raw;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return parts[2] + '-' + (months[Number(parts[1]) - 1] || parts[1]) + '-' + parts[0];
  };
  const body = [
    'ANNUAL VEHICLE INSPECTION REMINDER',
    'Site: ' + group.site,
    '',
    'Dear Team,',
    '',
    'Please arrange the annual government inspection for the following vehicles:',
    '',
    ...group.rows.flatMap((v, i) => {
      const days = Number(v.days);
      const timing = days < 0 ? 'EXPIRED — ' + Math.abs(days) + ' day(s) overdue' :
        days === 0 ? 'EXPIRES TODAY' : days + ' day(s) remaining';
      return [
        (i + 1) + ') ' + (v.plate || '-'),
        '   Driver: ' + (v.driver || '-'),
        '   Inspection Expiry: ' + formatDate(v.expiry),
        '   Status: ' + timing,
        ''
      ];
    }),
    'Please coordinate the inspection and update the Fleet system once completed.',
    '',
    'Regards,',
    'Hussein Anwar',
    'Fleet Manager'
  ].join('\n');

  const to = String(group.to || '').split(',').map(x => x.trim()).filter(Boolean).join(';');
  const cc = String(group.cc || '').split(',').map(x => x.trim()).filter(Boolean).join(';');
  const params = [
    cc ? 'cc=' + encodeURIComponent(cc) : '',
    'subject=' + encodeURIComponent(subject),
    'body=' + encodeURIComponent(body)
  ].filter(Boolean).join('&');

  return {
    subject,
    body,
    url: 'mailto:' + encodeURIComponent(to) + '?' + params
  };
};

const openInspectionEmail = (group) => {
    if (!group.to) {
      setError(group.site + ': no email recipient is configured.');
      return;
    }
    const email = buildInspectionEmail(group);
    const w = window.open(email.url, '_blank');
    if (!w) setError('Please allow pop-ups to open the Outlook email draft.');
  };

  const copyInspectionEmail = async (group) => {
    const email = buildInspectionEmail(group);
    const text = 'To: ' + (group.to || '-') + '\\n' +
      'CC: ' + (group.cc || '-') + '\\n' +
      'Subject: ' + email.subject + '\\n\\n' + email.body;
    try {
      await navigator.clipboard.writeText(text);
      setMessage('Email details copied for ' + group.site + '.');
    } catch (e) {
      setError('Unable to copy the email details. Please use Open Email.');
    }
  };

  const printComplianceReport = (key) => {
    const report = complianceReports[key];
    if (!report) return;
    const component = key.startsWith('six') ? '6-Month Maintenance' : 'Annual Inspection';
    const type = key.startsWith('six') ? '6_months_general' : 'inspection';
    const esc = (value) => String(value ?? '-')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    const rows = report.rows.map(row => {
      const rec = type === '6_months_general' ? row.six : row.annual;
      const done = type === '6_months_general' ? row.sixDone : row.annualDone;
      return '<tr><td>'+esc(row.plate)+'</td><td>'+esc(row.driver)+'</td><td>'+esc(done ? 'Inspected' : 'Not Inspected')+'</td><td>'+esc(type === 'inspection' ? getInspectionExpiry(row.vehicle_id) : rec?.scheduled_date)+'</td><td>'+esc(rec?.completed_date)+'</td><td>'+esc(rec?.notes)+'</td></tr>';
    }).join('');
    const w=window.open('', '_blank', 'width=1200,height=800');
    if(!w){setError('Please allow pop-ups for the report.');return;}
    w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>'+esc(report.title)+'</title><style>@page{size:A4 landscape;margin:10mm}body{font-family:Arial;font-size:9pt}h1{margin-bottom:4mm}table{width:100%;border-collapse:collapse}th,td{border:1px solid #999;padding:5px;text-align:left;vertical-align:top}th{background:#e9eef5}</style></head><body><h1>'+esc(report.title)+'</h1><div>Generated: '+esc(new Date().toLocaleString())+' · Records: '+report.rows.length+'</div><table><thead><tr><th>Vehicle</th><th>Driver</th><th>Status</th><th>Scheduled</th><th>Completed</th><th>Notes</th></tr></thead><tbody>'+rows+'</tbody></table></body></html>');
    w.document.close();w.focus();setTimeout(()=>w.print(),250);
  };

  if (inspectionUpcomingOnly) {
    const upcoming = reminderDueVehicles
      .filter(v => Number(v.days) > 31)
      .sort((a,b) => Number(a.days) - Number(b.days));
    return (
      <div className="periodic-maintenance-print-root">
        <div className="panel" style={{marginBottom:16}}>
          <h1 style={{margin:0}}>📅 Future Annual Inspection Schedule</h1>
          <p style={{margin:'6px 0 0',color:'#64748b'}}>
            Vehicles more than 31 days from annual inspection. These vehicles are for monitoring only and are not included in email sending.
            When a vehicle reaches 31 days or less, it automatically moves to the Annual Inspection Email page.
          </p>
        </div>
        {error && <div className="alert alert-error" style={{marginBottom:12}}>{error}</div>}
        <div className="panel" style={{marginBottom:16}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap'}}>
            <div>
              <h2 style={{marginTop:0,marginBottom:4}}>Future Vehicles — Nearest Expiry First</h2>
              <div style={{fontSize:13,color:'#64748b'}}>More than 31 days remaining · No email is sent from this page</div>
            </div>
            <button className="btn" onClick={openReminderSend}>↻ Refresh</button>
          </div>
          {upcoming.length===0 ? (
            <div style={{marginTop:14,color:'#64748b'}}>No future annual inspections beyond 31 days.</div>
          ) : (
            <table style={{marginTop:14}}>
              <thead><tr><th>Vehicle</th><th>Driver</th><th>Site</th><th>Expiry</th><th>Days Left</th><th>Status</th></tr></thead>
              <tbody>
                {upcoming.map(v=>(
                  <tr key={v.id}>
                    <td><strong>{v.plate||'-'}</strong></td>
                    <td>{v.driver||'-'}</td>
                    <td>{v.location||'-'}</td>
                    <td><strong>{v.expiry||'-'}</strong></td>
                    <td>{v.days} days</td>
                    <td><span className="status-badge" style={{background:'#16a34a',color:'#fff'}}>Not due yet</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="btn-row">
          {onOpenInspectionEmail && <button className="btn btn-primary" onClick={onOpenInspectionEmail}>📧 Open Annual Inspection Email</button>}
        </div>
      </div>
    );
  }

  if (inspectionEmailOnly) {
    const emailGroups = inspectionEmailGroups();
    const eligibleRows = reminderDueVehicles
      .filter(v => Number(v.days) <= 31)
      .filter(v => reminderSendMode === 'all' || selectedReminderSites.includes(v.location))
      .sort((a,b) => Number(a.days) - Number(b.days));

    return (
      <div className="periodic-maintenance-print-root">
        <div className="panel" style={{marginBottom:16}}>
          <h1 style={{margin:0}}>📧 Annual Vehicle Inspection — Email Control</h1>
          <p style={{margin:'6px 0 0',color:'#64748b'}}>
            Prepare Outlook emails for expired vehicles and vehicles expiring within the next 31 days.
            The system does not send the email automatically — you review it and press Send in Outlook.
          </p>
        </div>
        {error && <div className="alert alert-error" style={{marginBottom:12}}>{error}</div>}
        {message && <div className="alert alert-success" style={{marginBottom:12}}>{message}</div>}

        <div className="panel" style={{marginBottom:16}}>
          <h2 style={{marginTop:0}}>1. Email Scope</h2>
          <div className="btn-row">
            <button className={reminderSendMode==='all'?'btn btn-success':'btn'} onClick={()=>setReminderSendMode('all')}>1️⃣ All Sites</button>
            <button className={reminderSendMode==='sites'?'btn btn-success':'btn'} onClick={()=>setReminderSendMode('sites')}>2️⃣ Select Sites</button>
            <button className="btn" onClick={loadReminderQueue}>↻ Refresh</button>
          </div>
          {reminderSendMode==='sites' && (
            <div style={{marginTop:14}}>
              <strong>Select Sites</strong>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:8,marginTop:8}}>
                {annualInspectionSites.map(site=>(
                  <label key={site} style={{display:'flex',alignItems:'center',gap:8,padding:10,border:'1px solid #e2e8f0',borderRadius:8,cursor:'pointer'}}>
                    <input type="checkbox" checked={selectedReminderSites.includes(site)}
                      onChange={e=>setSelectedReminderSites(prev=>e.target.checked?[...prev,site]:prev.filter(x=>x!==site))}/>
                    {site}
                  </label>
                ))}
              </div>
              <div style={{marginTop:8,color:'#64748b'}}>Selected: {selectedReminderSites.length}</div>
            </div>
          )}
        </div>

        <div className="panel" style={{marginBottom:16,overflowX:'auto'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap'}}>
            <div>
              <h2 style={{marginTop:0,marginBottom:4}}>2. Eligible Vehicles — Nearest Expiry First ({eligibleRows.length})</h2>
              <div style={{fontSize:13,color:'#64748b'}}>
                Expired + next 31 days only. Vehicles beyond 31 days are not included.
              </div>
            </div>
          </div>
          {eligibleRows.length===0 ? (
            <div style={{marginTop:14,color:'#64748b'}}>No eligible vehicles found.</div>
          ) : (
            <table style={{marginTop:14}}>
              <thead><tr><th>Vehicle</th><th>Driver</th><th>Site</th><th>Expiry</th><th>Status</th><th>To</th><th>CC</th></tr></thead>
              <tbody>
                {eligibleRows.map(v=>(
                  <tr key={v.id}>
                    <td><strong>{v.plate||'-'}</strong></td>
                    <td>{v.driver||'-'}</td>
                    <td>{v.location||'-'}</td>
                    <td>{v.expiry||'-'}</td>
                    <td><span className="status-badge" style={{background:Number(v.days)<=0?'#dc2626':'#f59e0b',color:'#fff'}}>
                      {Number(v.days)<0?'Expired':Number(v.days)===0?'Today':Number(v.days)+' days left'}
                    </span></td>
                    <td>{v.managerEmail||'-'}</td>
                    <td>{v.ccEmails||'-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="panel" style={{marginBottom:16}}>
          <h2 style={{marginTop:0}}>3. Prepared Outlook Emails ({emailGroups.length})</h2>
          <div style={{color:'#64748b',fontSize:13,marginBottom:12}}>
            Each site gets its own email with the vehicles, expiry dates and recipients already filled in.
          </div>
          {emailGroups.length===0 ? (
            <div style={{color:'#64748b'}}>No site email drafts are available for the current selection.</div>
          ) : (
            emailGroups.map(group=>{
              const email = buildInspectionEmail(group);
              return (
                <div key={group.site} style={{border:'1px solid #e2e8f0',borderRadius:10,padding:14,marginBottom:10}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:12,flexWrap:'wrap'}}>
                    <div>
                      <strong style={{fontSize:16}}>{group.site}</strong>
                      <div style={{marginTop:5,fontSize:13}}>Vehicles: {group.rows.length}</div>
                      <div style={{marginTop:4,fontSize:12,color:'#64748b'}}>To: {group.to||'Not configured'}</div>
                      <div style={{marginTop:2,fontSize:12,color:'#64748b'}}>CC: {group.cc||'Not configured'}</div>
                    </div>
                    <div className="btn-row">
                      <button className="btn btn-success" onClick={()=>openInspectionEmail(group)} disabled={!group.to}>✉️ Open Outlook Email</button>
                      <button className="btn btn-primary" onClick={()=>copyInspectionEmail(group)}>📋 Copy Email</button>
                    </div>
                  </div>
                  <div style={{marginTop:10,background:'#f8fafc',padding:10,borderRadius:8,fontSize:12,whiteSpace:'pre-wrap',maxHeight:180,overflowY:'auto'}}>
                    <strong>Subject:</strong> {email.subject}
                    {'\\n\\n'}
                    {email.body}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  }

  const renderComplianceReport = (key) => {
    const report = complianceReports[key];
    if (!report) return null;
    const component = key.startsWith('six') ? '6-Month Maintenance' : 'Annual Inspection';
    const type = key.startsWith('six') ? '6_months_general' : 'inspection';

    return (
      <div className="panel print-hide" style={{ marginBottom: 18, overflowX: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          <div>
            <h2 style={{ margin: 0, color: report.color }}>{report.title} ({report.rows.length})</h2>
            <div style={{ marginTop: 5, color: '#64748b' }}>Separate control report — {component}</div>
          </div>
          <button className="btn btn-primary" onClick={() => printComplianceReport(key)}>🖨️ Print / Save PDF</button>
        </div>
        <table>
          <thead><tr><th>Vehicle</th><th>Driver</th><th>Status</th><th>{type === 'inspection' ? 'Inspection Expiry' : 'Scheduled'}</th><th>Completed</th><th>Notes</th><th>Actions</th></tr></thead>
          <tbody>
            {report.rows.length === 0 ? (
              <tr><td colSpan="7" style={{ textAlign: 'center', padding: 24 }}>No vehicles in this report.</td></tr>
            ) : report.rows.map(row => {
              const rec = type === '6_months_general' ? row.six : row.annual;
              const done = type === '6_months_general' ? row.sixDone : row.annualDone;
              return (
                <tr key={key + '-' + row.vehicle_id}>
                  <td><strong>{row.plate}</strong></td>
                  <td>{row.driver || '-'}</td>
                  <td><span className="status-badge" style={{ background: done ? '#16a34a' : '#dc2626', color: '#fff' }}>{done ? 'Inspected' : 'Not Inspected'}</span></td>
                  <td>{type === 'inspection' ? getInspectionExpiry(row.vehicle_id) : (rec?.scheduled_date || '-')}</td>
                  <td>{rec?.completed_date || '-'}</td>
                  <td>{rec?.notes || '-'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button className="btn" style={{ padding: '6px 10px', background: '#25D366', color: '#fff' }} onClick={() => reportWhatsApp(row, component, done)}>📱 WhatsApp</button>
                      {canWork && (done
                        ? <button className="btn btn-success" style={{ padding: '6px 10px' }} disabled>✓ Closed</button>
                        : <button className="btn btn-danger" style={{ padding: '6px 10px' }} onClick={() => closeComplianceReport(row, component, type)}>Close</button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };


  const printPdfReport = () => {
    const esc = (value) => String(value ?? '-')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    const inspectionMode = ['partial', 'none', 'fully'].includes(subTab);
    let title = 'Vehicle Maintenance';
    let headers = [];
    let rows = '';

    if (inspectionMode) {
      const list = subTab === 'partial' ? partiallyInspectedVehicles
        : subTab === 'none' ? notInspectedVehicles : fullyInspectedVehicles;
      title = subTab === 'partial' ? 'Partially Inspected Vehicles'
        : subTab === 'none' ? 'Not Inspected Vehicles' : 'Fully Inspected Vehicles';
      headers = ['Vehicle','Driver','6-Month','Annual Inspection','Overall','Missing'];
      rows = list.map(v => {
        const overall = subTab === 'fully' ? 'GREEN — Fully Inspected'
          : subTab === 'none' ? 'RED — Not Inspected' : 'YELLOW — Partially Inspected';
        return '<tr><td>'+esc(v.plate)+'</td><td>'+esc(v.driver)+'</td><td>'+
          esc(v.sixDone ? 'Inspected' : 'Not Inspected')+'</td><td>'+
          esc(v.annualDone ? 'Inspected' : 'Not Inspected')+'</td><td>'+
          esc(overall)+'</td><td>'+esc(v.missing.length ? v.missing.join(' + ') : '—')+'</td></tr>';
      }).join('');
    } else {
      title = 'Vehicle Maintenance';
      headers = ['Vehicle','Location','Driver','Type','Scheduled','Inspection Expiry','Completed','Status','Technician','Notes'];
      rows = currentList.map((r) => {
        const status = r.status === 'Completed' ? 'Completed' : (r.scheduled_date < today ? 'Overdue' : 'Pending');
        return '<tr><td>'+esc(r.vehicle_plate)+'</td><td>'+esc(r.vehicle_location)+
          '</td><td>'+esc(r.driver_name)+'</td><td>'+esc(TYPE_LABELS[r.type] || r.type)+
          '</td><td>'+esc(r.scheduled_date)+'</td><td>'+esc(getInspectionExpiry(r.vehicle_id))+'</td><td>'+esc(r.completed_date)+
          '</td><td>'+esc(status)+'</td><td>'+esc(r.technician)+'</td><td>'+esc(r.notes)+'</td></tr>';
      }).join('');
    }

    const printWindow = window.open('', '_blank', 'width=1200,height=800');
    if (!printWindow) { setError('Please allow pop-ups for the PDF print report.'); return; }
    printWindow.document.open();
    printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>@page{size:A4 landscape;margin:10mm}*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;font-size:8.5pt;color:#111}
.title{font-size:18pt;font-weight:700;margin:0 0 3mm}.meta{font-size:8pt;color:#555;margin-bottom:4mm;padding-bottom:3mm;border-bottom:2px solid #1e3a8a}
table{width:100%;border-collapse:collapse;table-layout:fixed}thead{display:table-header-group}tr{break-inside:avoid;page-break-inside:avoid}
th,td{border:1px solid #9aa4b2;padding:4px 5px;text-align:left;vertical-align:top;line-height:1.2;overflow-wrap:anywhere}th{background:#e9eef5;font-weight:700}</style>
</head><body><div class="title">${esc(title)}</div><div class="meta">Generated: ${esc(new Date().toLocaleString())} · Records: ${inspectionMode ? (subTab === 'partial' ? partiallyInspectedVehicles.length : subTab === 'none' ? notInspectedVehicles.length : fullyInspectedVehicles.length) : currentList.length}</div>
<table><thead><tr>${headers.map(h => '<th>'+esc(h)+'</th>').join('')}</tr></thead><tbody>${rows}</tbody></table>
</body></html>`);
    printWindow.document.close(); printWindow.focus();
    setTimeout(() => printWindow.print(), 250);
  };

  // For 6-month maintenance, a note is the evidence that the vehicle was inspected.
  // Notes may describe findings; they still mean the inspection was performed.
  const isSixMonthInspected = (r) => r.type === '6_months_general' && (
    r.status === 'Completed' || Boolean(String(r.notes || '').trim())
  );

  const getStatusBadge = (r) => {
    if (isSixMonthInspected(r)) return <span className="status-badge status-safe">GREEN — Inspected</span>;
    if (r.type === '6_months_general') return <span className="status-badge status-urgent">RED — Not Inspected</span>;
    if (r.status === 'Completed') return <span className="status-badge status-safe">Completed</span>;
    if (r.scheduled_date < today) return <span className="status-badge status-urgent">Overdue</span>;
    return <span className="status-badge status-warning">Pending</span>;
  };

  const reopenInspection = async (rec) => {
    if (!canWork || !rec?.id) return;
    if (!confirm('Reopen this annual inspection and return it to Not Inspected?')) return;
    setError(''); setMessage('');
    try {
      await api.put('/periodic-maintenance/' + rec.id + '/reopen');
      setMessage('Annual inspection reopened and returned to the Not Inspected list.');
      await load();
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    }
  };

  const renderControlTable = (kind) => {
    const isSix = kind === 'six';
    const pendingRows = isSix
      ? vehicleSummary.filter(v => !v.sixDone)
      : vehicleSummary
          .filter(v => !v.annualDone && (v.inspectionExpiry || String(v.plate).trim().toLowerCase() === 'test 123' || String(v.plate).trim() === '123'))
          .map(v => ({ ...v, inspectionExpiry: String(v.inspectionExpiry || getInspectionExpiry(v.vehicle_id)).slice(0, 10) }))
          .filter(v => {
            const days = Math.ceil(
              (new Date(v.inspectionExpiry + 'T00:00:00Z') - new Date(today + 'T00:00:00Z')) / 86400000
            );
            return days <= 30;
          })
          .sort((a, b) => {
            const da = new Date(a.inspectionExpiry + 'T00:00:00Z').getTime();
            const db = new Date(b.inspectionExpiry + 'T00:00:00Z').getTime();
            return da - db || String(a.plate).localeCompare(String(b.plate));
          });

    const completedRows = isSix ? [] : records
      .filter(r => r.type === 'inspection' && r.status === 'Completed' && r.completed_date)
      .sort((a, b) => {
        const da = new Date(a.completed_date).getTime();
        const db = new Date(b.completed_date).getTime();
        return db - da || Number(b.id || 0) - Number(a.id || 0);
      });

    const title = isSix ? '6-Month Mechanical Inspection' : 'Annual Periodic Inspection — Due Within 30 Days';
    const description = isSix
      ? 'Mechanical 6-month inspection control. GREEN means inspection evidence is recorded; RED means no inspection evidence is recorded.'
      : 'Pending section shows expired vehicles and vehicles expiring within the next 30 days. Completed inspections remain listed below with completion date and next due date.';
    return (
      <>
        <div className="panel" style={{ marginBottom: 18, overflowX: 'auto' }}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap',marginBottom:12}}>
            <div>
              <h2 style={{margin:0}}>{title}</h2>
              <div style={{marginTop:5,color:'#64748b'}}>{description}</div>
            </div>
            <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
              {!isSix && onOpenInspectionEmail && <button className="btn btn-success" onClick={onOpenInspectionEmail}>📧 Annual Inspection Email</button>}
              <button className="btn btn-primary" onClick={() => printComplianceReport(isSix ? 'sixNotInspected' : 'annualNotInspected')}>🖨️ Print / Save PDF</button>
            </div>
          </div>
          <table className="periodic-maintenance-screen-table">
            <thead>
              <tr>
                <th>Vehicle</th><th>Location</th><th>Driver</th>
                {isSix ? <><th>Inspection Date</th><th>Status</th><th>Technician</th><th>Notes</th></> :
                  <><th>Inspection Expiry</th><th>Status</th><th>Last Completed</th><th>Notes</th></>}
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pendingRows.map(row => {
                const rec = isSix ? row.six : row.annual;
                const done = isSix ? row.sixDone : row.annualDone;
                return (
                  <tr key={(isSix ? 'six-' : 'annual-') + row.vehicle_id}>
                    <td><strong>{row.plate}</strong></td>
                    <td>{vehicleById[String(row.vehicle_id)]?.location || '-'}</td>
                    <td>{row.driver || '-'}</td>
                    {isSix ? (
                      <>
                        <td>{rec?.completed_date || (done ? rec?.scheduled_date : '-') || '-'}</td>
                        <td><span className={done ? 'status-badge status-safe' : 'status-badge status-urgent'}>{done ? 'GREEN — Inspected' : 'RED — Not Inspected'}</span></td>
                        <td>{rec?.technician || '-'}</td>
                        <td style={{whiteSpace:'pre-wrap',minWidth:240}}>{rec?.notes || '-'}</td>
                      </>
                    ) : (
                      <>
                        <td><strong>{row.inspectionExpiry || '—'}</strong></td>
                        <td><span className={done ? 'status-badge status-safe' : 'status-badge status-urgent'}>{done ? 'GREEN — Inspected' : 'RED — Not Inspected'}</span></td>
                        <td>{rec?.completed_date || '-'}</td>
                        <td style={{whiteSpace:'pre-wrap',minWidth:240}}>{rec?.notes || '-'}</td>
                      </>
                    )}
                    <td>
                      <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                        <button className="btn" style={{padding:'6px 10px',background:'#25D366',color:'#fff'}} onClick={() => reportWhatsApp(row, title, done)}>📱 WhatsApp</button>
                        {canWork && (done
                          ? <button className="btn btn-success" style={{padding:'6px 10px'}} disabled>✓ Inspected</button>
                          : <button className="btn btn-danger" style={{padding:'6px 10px'}} onClick={() => closeComplianceReport(row, title, isSix ? '6_months_general' : 'inspection')}>Close Inspection</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!pendingRows.length && <tr><td colSpan={isSix ? 8 : 8} style={{textAlign:'center',padding:18}}>No pending inspections in this section.</td></tr>}
            </tbody>
          </table>
        </div>

        {!isSix && (
          <div className="panel" style={{ marginBottom: 18, overflowX: 'auto' }}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap',marginBottom:12}}>
              <div>
                <h2 style={{margin:0}}>✓ Completed Annual Inspections ({completedRows.length})</h2>
                <div style={{marginTop:5,color:'#64748b'}}>Completed inspections stay in the system. The completion date and next due date are shown here. Reopen returns the record to Not Inspected.</div>
              </div>
              <button className="btn" onClick={load}>↻ Refresh</button>
            </div>
            <table className="periodic-maintenance-screen-table">
              <thead>
                <tr><th>Vehicle</th><th>Location</th><th>Driver</th><th>Completed Date</th><th>Next Due Date</th><th>Status</th><th>Technician</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {completedRows.map(rec => {
                  const v = vehicleById[String(rec.vehicle_id)] || {};
                  const plate = rec.vehicle_plate || v.plate || v.plate_number || '-';
                  const due = getNextAnnualDueDate(rec);
                  return (
                    <tr key={'completed-annual-' + rec.id}>
                      <td><strong>{plate}</strong></td>
                      <td>{rec.vehicle_location || v.location || '-'}</td>
                      <td>{rec.driver_name || v.driver || '-'}</td>
                      <td>{String(rec.completed_date).slice(0,10)}</td>
                      <td><strong>{due || '—'}</strong></td>
                      <td><span className="status-badge status-safe">GREEN — Inspected</span></td>
                      <td>{rec.technician || '-'}</td>
                      <td>
                        {canWork && <button className="btn btn-warning" style={{padding:'6px 10px'}} onClick={() => reopenInspection(rec)}>↩ Reopen / Edit</button>}
                      </td>
                    </tr>
                  );
                })}
                {!completedRows.length && <tr><td colSpan="8" style={{textAlign:'center',padding:18}}>No completed annual inspections recorded yet.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </>
    );
  };

  return (
    <div className="periodic-maintenance-print-root">
      <div className="panel print-hide" style={{marginBottom:16}}>
        <h1 style={{margin:'0 0 6px'}}>🔧 Periodic Maintenance & Vehicle Inspection Control</h1>
        <div style={{color:'#64748b'}}>
          Rebuilt control page: 6-Month Mechanical and Annual Inspection are independent controls.
          Existing periodic maintenance records are preserved.
        </div>
      </div>

      {message && <div className="alert alert-success print-hide">{message}</div>}
      {error && <div className="alert alert-error print-hide">{error}</div>}

      <div className="sub-nav print-hide" style={{marginBottom:16}}>
        <button className={reportTab==='six' ? 'sub-btn active' : 'sub-btn'} onClick={()=>setReportTab('six')}>
          🔧 6-Month Mechanical ({vehicleSummary.filter(v=>!v.sixDone).length})
        </button>
        <button className={reportTab==='annual' ? 'sub-btn active' : 'sub-btn'} onClick={()=>setReportTab('annual')}>
          📋 Annual Inspection ({vehicleSummary.filter(v=>!v.annualDone).length})
        </button>
        <button className={reportTab==='original' ? 'sub-btn active' : 'sub-btn'} onClick={()=>setReportTab('original')}>
          📚 Original Maintenance Records ({records.length})
        </button>
      </div>

      {reportTab === 'six' && renderControlTable('six')}
      {reportTab === 'annual' && renderControlTable('annual')}

      {reportTab === 'original' && (
        <>
          <div className="print-hide" style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:10,marginBottom:16}}>
            <div className="panel"><strong>All Records</strong><div style={{fontSize:28,fontWeight:700}}>{records.length}</div></div>
            <div className="panel"><strong>Pending</strong><div style={{fontSize:28,fontWeight:700,color:'#d97706'}}>{subTabData.pending.length}</div></div>
            <div className="panel"><strong>Overdue</strong><div style={{fontSize:28,fontWeight:700,color:'#dc2626'}}>{subTabData.overdue.length}</div></div>
            <div className="panel"><strong>Completed</strong><div style={{fontSize:28,fontWeight:700,color:'#16a34a'}}>{subTabData.completed.length}</div></div>
          </div>

          <div className="sub-nav print-hide" style={{marginBottom:12}}>
            {[
              ['all','All'],['pending','Pending'],['overdue','Overdue'],['completed','Completed']
            ].map(([key,label]) => (
              <button key={key} className={subTab===key?'sub-btn active':'sub-btn'} onClick={()=>setSubTab(key)}>
                {label} ({key==='all'?records.length:subTabData[key].length})
              </button>
            ))}
          </div>

          <div className="panel" style={{overflowX:'auto'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap'}}>
              <div>
                <h2 style={{margin:0}}>Original Periodic Maintenance Records</h2>
                <div style={{marginTop:5,color:'#64748b'}}>This section keeps the existing database records. No compliance calculation changes the source data.</div>
              </div>
              <div className="btn-row print-hide">
                {canWork && <button className="btn btn-warning" onClick={handleGenerate}>Auto-Generate All</button>}
                <button className="btn btn-success" onClick={() => exportReport(filledRecords,'Periodic_Maintenance_Filled','Filled Records')}>📊 Export Filled</button>
                <button className="btn btn-primary" onClick={printPdfReport}>🖨️ PDF</button>
                {canWork && <button className="btn btn-primary" onClick={()=>setShowForm(!showForm)}>{showForm?'Cancel':'+ Schedule New'}</button>}
              </div>
            </div>

            <div className="filters no-print" style={{marginTop:14}}>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Vehicle / Driver" />
              <select value={filterVehicle} onChange={e=>setFilterVehicle(e.target.value)}>
                <option value="all">All Vehicles</option>
                {vehicles.map(v=><option key={v.id} value={v.id}>{v.plate}</option>)}
              </select>
              <select value={filterType} onChange={e=>setFilterType(e.target.value)}>
                <option value="all">All Types</option>
                <option value="6_months_general">6-Month General</option>
                <option value="inspection">Inspection</option>
              </select>
              <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}>
                <option value="all">All Statuses</option>
                <option value="Pending">Pending</option>
                <option value="Completed">Completed</option>
              </select>
              <button className="btn btn-warning" onClick={()=>{setSearch('');setFilterVehicle('all');setFilterType('all');setFilterStatus('all')}}>Clear</button>
            </div>

            {showForm && (
              <form className="no-print" onSubmit={handleSubmit} style={{marginTop:14}}>
                <h3>{editing?'Edit Schedule':'New Schedule'}</h3>
                <div className="cards-grid">
                  <div className="form-group"><label>Vehicle *</label><select value={form.vehicleId} onChange={e=>setForm({...form,vehicleId:e.target.value})} required><option value="">-- Select Vehicle --</option>{vehicles.map(v=><option key={v.id} value={v.id}>{v.plate} - {v.driver}</option>)}</select></div>
                  <div className="form-group"><label>Type *</label><select value={form.type} onChange={e=>setForm({...form,type:e.target.value})}><option value="6_months_general">6-Month General Maintenance</option><option value="inspection">Periodic Inspection</option></select></div>
                  <div className="form-group"><label>Scheduled Date *</label><input type="date" value={form.scheduledDate} onChange={e=>setForm({...form,scheduledDate:e.target.value})} required /></div>
                  <div className="form-group"><label>Status</label><input value="Pending" readOnly disabled /></div>
                  <div className="form-group"><label>Technician</label><input value={form.technician} onChange={e=>setForm({...form,technician:e.target.value})}/></div>
                  <div className="form-group"><label>Cost (SAR)</label><input type="number" value={form.cost} onChange={e=>setForm({...form,cost:Number(e.target.value)})}/></div>
                </div>
                <div className="form-group"><label>Notes</label><textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} rows={2}/></div>
                <div className="btn-row"><button type="submit" className="btn btn-success">{editing?'Update':'Save'}</button><button type="button" className="btn btn-warning" onClick={resetForm}>Cancel</button></div>
              </form>
            )}

            {loading ? <div className="loading">Loading...</div> : (
              <table className="periodic-maintenance-screen-table" style={{marginTop:14}}>
                <thead><tr><th>Vehicle</th><th>Location</th><th>Driver</th><th>Type</th><th>Scheduled</th><th>Inspection Expiry</th><th>Completed</th><th>Status</th><th>Technician</th><th>Cost</th><th>Notes</th><th>Actions</th></tr></thead>
                <tbody>
                  {currentList.map(r=>(
                    <tr key={r.id}>
                      <td><strong>{r.vehicle_plate||'-'}</strong></td><td>{r.vehicle_location||'-'}</td><td>{r.driver_name||'-'}</td>
                      <td>{TYPE_LABELS[r.type]||r.type}</td><td>{r.scheduled_date||'-'}</td><td><strong>{getInspectionExpiry(r.vehicle_id)}</strong></td>
                      <td>{r.completed_date||'-'}</td><td>{getStatusBadge(r)}</td><td>{r.technician||'-'}</td><td>{Number(r.cost||0).toLocaleString()}</td>
                      <td style={{whiteSpace:'pre-wrap',minWidth:220}}>{r.notes||'-'}</td>
                      <td>{canWork&&r.status==='Pending'&&<button className="btn btn-success" onClick={()=>handleComplete(r)}>Complete</button>} {canWork&&<button className="btn btn-primary" onClick={()=>handleEdit(r)}>Edit</button>} {canWork&&<button className="btn btn-danger" onClick={()=>handleDelete(r.id)}>Del</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {completing && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Complete Maintenance</h3>
            <p>{completing.vehicle_plate} — {TYPE_LABELS[completing.type] || completing.type}</p>
            <label>Completion Date</label>
            <input type="date" value={completeForm.completedDate} onChange={e=>setCompleteForm({...completeForm,completedDate:e.target.value})}/>
            <label>Technician</label><input value={completeForm.technician} onChange={e=>setCompleteForm({...completeForm,technician:e.target.value})}/>
            <label>Total Cost (SAR)</label><input type="number" value={completeForm.cost} onChange={e=>setCompleteForm({...completeForm,cost:Number(e.target.value)})}/>
            <label>Notes</label><textarea value={completeForm.notes} onChange={e=>setCompleteForm({...completeForm,notes:e.target.value})} rows={3}/>
            <div className="btn-row">{canWork&&<button className="btn btn-success" onClick={handleCompleteSubmit}>Mark Completed</button>}<button className="btn btn-warning" onClick={()=>setCompleting(null)}>Cancel</button></div>
          </div>
        </div>
      )}
    </div>
  );
}