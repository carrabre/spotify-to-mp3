import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

// This function can be marked `async` if using `await` inside
export function middleware(request: NextRequest) {
  // You can add CORS headers for API routes here if needed
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next({
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    })
  }

  return NextResponse.next()
}

// Configure the paths that should trigger this middleware
export const config = {
  matcher: ["/api/:path*"],
}
