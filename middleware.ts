import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// In-memory rate limiting store for API protection
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 20;  // 20 requests/min per IP for API endpoints

// Blocked malicious bot signatures
const BLOCKED_USER_AGENTS = [
  'sqlmap',
  'nikto',
  'nmap',
  'masscan',
  'zgrab',
  'gospider',
];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const userAgent = (req.headers.get('user-agent') || '').toLowerCase();

  // 1. Bot & Vulnerability Scanner Firewall
  if (BLOCKED_USER_AGENTS.some((bot) => userAgent.includes(bot))) {
    return new NextResponse('Access Denied (WAF Blocked)', { status: 403 });
  }

  // 2. Protect API Routes (/api/scan) with Rate Limiting & Firewall
  if (pathname.startsWith('/api/')) {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || '127.0.0.1';
    const now = Date.now();

    const currentRecord = rateLimitMap.get(ip);

    if (!currentRecord || now > currentRecord.resetTime) {
      rateLimitMap.set(ip, {
        count: 1,
        resetTime: now + RATE_LIMIT_WINDOW,
      });
    } else {
      currentRecord.count += 1;
      if (currentRecord.count > MAX_REQUESTS_PER_WINDOW) {
        return new NextResponse(
          JSON.stringify({
            error: 'Too Many Requests',
            message: 'API rate limit exceeded. Please wait 60 seconds before scanning again.',
          }),
          {
            status: 429,
            headers: {
              'Content-Type': 'application/json',
              'Retry-After': '60',
            },
          }
        );
      }
    }

    // 3. Payload Size Guard (Reject payloads > 50MB before processing)
    const contentLength = parseInt(req.headers.get('content-length') || '0', 10);
    if (contentLength > 50 * 1024 * 1024) {
      return new NextResponse(
        JSON.stringify({
          error: 'Payload Too Large',
          message: 'Uploaded file size exceeds 50MB security limit.',
        }),
        {
          status: 413,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*'],
};
