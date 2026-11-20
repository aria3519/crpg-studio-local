import type { NextRequest } from 'next/server';
import { finishSignIn } from '../../_lib';
export const runtime = 'nodejs';

// Kakao sends the player back here with a code: trade it for a token, then ask who they are (id and nickname).
export function GET(req: NextRequest) {
  return finishSignIn(req, 'kakao', async (code, redirectUri) => {
    const secret = process.env.KAKAO_CLIENT_SECRET;
    const token = await fetch('https://kauth.kakao.com/oauth/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' }, signal: AbortSignal.timeout(10000),
      body: new URLSearchParams({ grant_type: 'authorization_code', client_id: process.env.KAKAO_REST_KEY || '', redirect_uri: redirectUri, code, ...(secret ? { client_secret: secret } : {}) }),
    }).then(r => r.json());
    if (typeof token?.access_token !== 'string') return null;
    const me = await fetch('https://kapi.kakao.com/v2/user/me', { headers: { Authorization: `Bearer ${token.access_token}` }, signal: AbortSignal.timeout(10000) }).then(r => r.json());
    const uid = String(me?.id ?? '');
    return /^\d+$/.test(uid) ? { uid, name: String(me?.kakao_account?.profile?.nickname || me?.properties?.nickname || '').slice(0, 30) } : null;
  });
}
