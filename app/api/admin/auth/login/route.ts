import { NextRequest, NextResponse } from 'next/server';
import { validateAdminCredentials, createSessionToken, COOKIE_NAME } from '@/lib/admin/auth';

export async function POST(req: NextRequest) {
  try {
    const { password } = await req.json();

    if (!password || !validateAdminCredentials(password)) {
      return NextResponse.json({ error: 'Invalid admin credentials' }, { status: 401 });
    }

    const token = await createSessionToken('admin');

    const response = NextResponse.json({ success: true, message: 'Admin authenticated' }, { status: 200 });

    response.cookies.set({
      name: COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 86400, // 24 hours
    });

    return response;
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Login failed' }, { status: 500 });
  }
}
