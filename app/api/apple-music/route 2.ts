import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url');
  
  if (!url) {
    return NextResponse.json(
      { 
        error: 'No URL provided',
        tracks: [],
        sourceName: 'Apple Music'
      }, 
      { status: 400 }
    );
  }

  try {
    // Call the original API endpoint from pages/api
    const response = await fetch(`${request.nextUrl.origin}/api/apple-music-browser`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      return NextResponse.json(
        { 
          error: errorData.error || 'Error fetching from Apple Music API',
          tracks: [],
          sourceName: 'Apple Music'
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in Apple Music API route:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'An unknown error occurred',
        tracks: [],
        sourceName: 'Apple Music'
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const url = body.url;
    
    if (!url) {
      return NextResponse.json(
        { 
          error: 'No URL provided',
          tracks: [],
          sourceName: 'Apple Music'
        }, 
        { status: 400 }
      );
    }

    // Call the original API endpoint from pages/api
    const response = await fetch(`${request.nextUrl.origin}/api/apple-music-browser`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      return NextResponse.json(
        { 
          error: errorData.error || 'Error fetching from Apple Music API',
          tracks: [],
          sourceName: 'Apple Music'
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in Apple Music API route:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'An unknown error occurred',
        tracks: [],
        sourceName: 'Apple Music'
      },
      { status: 500 }
    );
  }
} 