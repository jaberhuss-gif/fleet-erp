import { initializeApp } from 'firebase/app';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import api from './api/client';

const firebaseConfig = {
  apiKey: 'AIzaSyAhevglOhmR-0Q02D69IYVWR3sx_JZPrC8',
  authDomain: 'fleet-erp-b186f.firebaseapp.com',
  projectId: 'fleet-erp-b186f',
  storageBucket: 'fleet-erp-b186f.firebasestorage.app',
  messagingSenderId: '866952449353',
  appId: '1:866952449353:web:ce5c2b4f09941c70a4de98',
  measurementId: 'G-G4VVLEEJ1J'
};

const VAPID_KEY = 'BD8r8h8FELk2S2jLxLeFhAtwX6Bg8t-SBFZ-PiQSlKWOL6s0V0HxTkPgrn6t53j5HwMw4bn44X_ymYFco2pjC58';

const app = initializeApp(firebaseConfig);
const messaging = typeof window !== 'undefined' ? getMessaging(app) : null;

export async function enablePushNotifications() {
  if (!messaging || typeof window === 'undefined') {
    return { success: false, message: 'Push notifications are not supported in this environment.' };
  }

  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    return { success: false, message: 'This browser does not support web push notifications.' };
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return { success: false, message: 'Notification permission was not granted.' };
  }

  const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
  const token = await getToken(messaging, {
    vapidKey: VAPID_KEY,
    serviceWorkerRegistration: registration
  });

  if (!token) {
    return { success: false, message: 'Firebase did not return a registration token.' };
  }

  await api.post('/push/register', {
    token,
    platform: 'web',
    userAgent: navigator.userAgent
  });

  localStorage.setItem('fcm_push_enabled', 'true');
  return { success: true, token };
}

export function subscribeToForegroundMessages(callback) {
  if (!messaging) return () => {};
  return onMessage(messaging, callback);
}
