import { NextResponse, type NextRequest } from 'next/server';
import { startSignIn } from '../_lib';
export const runtime = 'nodejs';

// "카카오로 시작하기": to Kakao's sign-in page (REST API key from .env.local).
export function GET(req: NextRequest) {
  const key = process.env.KAKAO_REST_KEY;
  if (!key) return new NextResponse('카카오 로그인이 설정되지 않았습니다.', { status: 503 });
  return startSignIn(req, 'kakao', (redirectUri, state) => `https://kauth.kakao.com/oauth/authorize?${new URLSearchParams({ client_id: key, redirect_uri: redirectUri, response_type: 'code', state })}`);
}
