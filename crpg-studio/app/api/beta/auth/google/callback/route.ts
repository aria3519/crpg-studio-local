import type { NextRequest } from 'next/server';
import { finishSignIn } from '../../_lib';
export const runtime = 'nodejs';

// Google sends the player back here with a code: trade it for a token (with the client secret), then ask who they are.
// The token comes straight from Google over TLS, so its userinfo is trusted as is (no id_token signature check needed).
export function GET(req: NextRequest) {
  return finishSignIn(req, 'google', async (code, redirectUri) => {
    const token = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(10000),
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: process.env.GOOGLE_CLIENT_ID || '', client_secret: process.env.GOOGLE_CLIENT_SECRET || '' }),
    }).then(r => r.json());
    if (typeof token?.access_token !== 'string') return null;
    const me = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${token.access_token}` }, signal: AbortSignal.timeout(10000) }).then(r => r.json());
    const uid = String(me?.sub ?? '');
    return /^\d+$/.test(uid) ? { uid, name: String(me?.name || me?.given_name || '').slice(0, 30) } : null;
  });
}
