import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

// This middleware optimizes the application for Vercel Pro by:
// 1. Adding caching for static assets
// 2. Setting appropriate cache control headers
// 3. Optimizing request handling

export function middleware(request: NextRequest) {
  const response = NextResponse.next()

  // Add security headers
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload')
  
  // Optimize caching for static assets
  const url = request.nextUrl.pathname
  if (url.includes('/static/') || url.includes('/_next/static/')) {
    response.headers.set('Cache-Control', 'public, max-age=31536000, immutable')
  }

  return response
}

// Only run middleware on specific paths
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api/transcode (exclude audio processing API routes from middleware)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api/transcode|_next/static|_next/image|favicon.ico).*)',
  ],
}
