import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'fleet-erp-b186f';

function getFirebaseApp() {
  if (getApps().length) return getApps()[0];

  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const rawPrivateKey = process.env.FIREBASE_PRIVATE_KEY || '';
  const base64PrivateKey = process.env.FIREBASE_PRIVATE_KEY_BASE64 || '';

  if (!clientEmail || (!rawPrivateKey && !base64PrivateKey)) return null;

  let privateKey = rawPrivateKey;

  if (!privateKey && base64PrivateKey) {
    try {
      privateKey = Buffer.from(base64PrivateKey, 'base64').toString('utf8');
    } catch {
      return null;
    }
  }

  return initializeApp({
    credential: cert({
      projectId: PROJECT_ID,
      clientEmail,
      privateKey: privateKey.replace(/\\n/g, '\n')
    })
  });
}

export function isFcmConfigured() {
  return Boolean(
    process.env.FIREBASE_CLIENT_EMAIL &&
    (process.env.FIREBASE_PRIVATE_KEY || process.env.FIREBASE_PRIVATE_KEY_BASE64)
  );
}

export async function sendFcmToToken({ token, title, body, data = {} }) {
  const app = getFirebaseApp();
  if (!app) {
    return { sent: false, reason: 'Firebase Admin credentials are not configured.' };
  }

  const message = {
    token,
    notification: {
      title: String(title || 'Fleet ERP'),
      body: String(body || '')
    },
    data: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, String(value ?? '')])),
    webpush: {
      fcmOptions: { link: '/' },
      notification: {
        icon: '/favicon.ico',
        badge: '/favicon.ico'
      }
    }
  };

  const messageId = await getMessaging(app).send(message);
  return { sent: true, messageId };
}

export async function sendFcmToTokens({ tokens, title, body, data = {} }) {
  const validTokens = [...new Set((tokens || []).filter(Boolean))];
  if (!validTokens.length) return { sent: 0, failed: 0, reason: 'No tokens.' };

  const app = getFirebaseApp();
  if (!app) return { sent: 0, failed: validTokens.length, reason: 'Firebase Admin credentials are not configured.' };

  const message = {
    tokens: validTokens,
    notification: {
      title: String(title || 'Fleet ERP'),
      body: String(body || '')
    },
    data: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, String(value ?? '')])),
    webpush: {
      fcmOptions: { link: '/' },
      notification: {
        icon: '/favicon.ico',
        badge: '/favicon.ico'
      }
    }
  };

  const response = await getMessaging(app).sendEachForMulticast(message);
  return {
    sent: response.successCount,
    failed: response.failureCount,
    responses: response.responses
  };
}
