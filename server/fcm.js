import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { query } from './postgres.js';

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'fleet-erp-b186f';

function getFirebaseApp() {
  if (getApps().length) return getApps()[0];

  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const rawPrivateKey = process.env.FIREBASE_PRIVATE_KEY || '';
  const base64PrivateKey = process.env.FIREBASE_PRIVATE_KEY_BASE64 || '';

  if (!clientEmail || (!rawPrivateKey && !base64PrivateKey)) return null;

  let privateKey = '';

  // Prefer the single-line Base64 form because some hosts split multiline
  // PEM values across environment-variable fields.
  if (base64PrivateKey) {
    try {
      const decoded = Buffer.from(base64PrivateKey, 'base64').toString('utf8');
      if (decoded.includes('-----BEGIN PRIVATE KEY-----') && decoded.includes('-----END PRIVATE KEY-----')) {
        privateKey = decoded;
      }
    } catch {}
  }

  // Backward compatibility for hosts that still use the multiline form.
  if (!privateKey && rawPrivateKey) {
    privateKey = rawPrivateKey.replace(/\\n/g, '\n');
  }

  if (!privateKey) return null;

  return initializeApp({
    credential: cert({
      projectId: PROJECT_ID,
      clientEmail,
      privateKey
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

  // FCM web tokens can become invalid after browser/profile changes or when
  // the application origin/VAPID registration changes. Remove only tokens
  // that Firebase explicitly reports as permanently invalid so future daily
  // notifications do not keep failing on stale Owner/Driver tokens.
  const invalidIndexes = [];
  const errorDetails = [];

  response.responses.forEach((item, index) => {
    if (item.success) return;

    const code = item.error?.code || '';
    const messageText = item.error?.message || '';
    errorDetails.push({
      index,
      code,
      message: messageText
    });

    if (
      code === 'messaging/registration-token-not-registered' ||
      code === 'messaging/invalid-registration-token'
    ) {
      invalidIndexes.push(index);
    }
  });

  if (invalidIndexes.length) {
    const staleTokens = invalidIndexes
      .map(index => validTokens[index])
      .filter(Boolean);

    try {
      await query(
        'DELETE FROM push_tokens WHERE token = ANY($1::text[])',
        [staleTokens]
      );
    } catch (cleanupError) {
      console.error('[FCM] stale token cleanup failed:', cleanupError.message);
    }
  }

  return {
    sent: response.successCount,
    failed: response.failureCount,
    cleaned: invalidIndexes.length,
    errors: errorDetails
  };
}
