import { NextResponse, type NextRequest } from 'next/server';
import { startSignIn } from '../_lib';
export const runtime = 'nodejs';

// "구글로 시작하기": to Google's sign-in page (client id from .env.local). Only the profile is asked for, not the mail.
export function GET(req: NextRequest) {
  const id = process.env.GOOGLE_CLIENT_ID;
  if (!id) return new NextResponse('구글 로그인이 설정되지 않았습니다.', { status: 503 });
  return startSignIn(req, 'google', (redirectUri, state) => `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({ client_id: id, redirect_uri: redirectUri, response_type: 'code', scope: 'openid profile', state, prompt: 'select_account' })}`);
}
