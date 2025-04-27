import { NextRequest, NextResponse } from 'next/server';
import puppeteer, { Page } from 'puppeteer';

// Define track interface
interface Track {
  id: string;
  name: string;
  artists: string[];
  album: string;
  albumArtist?: string;
  albumImageUrl: string;
  duration: string | number;
  service: string;
}

// Helper function to auto-scroll the page to trigger lazy loading
async function autoScroll(page: Page): Promise<void> {
  console.log(`[AppleMusic] Auto-scrolling page to ensure all tracks load`);
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      let totalHeight = 0;
      const distance = 100;
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;

        if (totalHeight >= scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 100);
    });
  });
  
  // Extended scroll for large playlists - attempt to click "Load More" buttons
  await page.evaluate(async () => {
    // Try to click any "Load More" or "See All" buttons
    const buttons = Array.from(document.querySelectorAll('button, a')).filter(el => {
      const text = el.textContent?.toLowerCase() || '';
      return text.includes('load more') || 
             text.includes('see all') || 
             text.includes('show more') ||
             text.includes('view all');
    });
    
    for (const button of buttons) {
      try {
        (button as HTMLElement).click();
        // Wait a bit for content to load
        await new Promise(r => setTimeout(r, 1000));
      } catch (e) {
        // Ignore click errors
      }
    }
    
    // Scroll again after clicking buttons
    let totalHeight = 0;
    const distance = 100;
    const scrollHeight = document.body.scrollHeight;
    
    const timer = setInterval(() => {
      window.scrollBy(0, distance);
      totalHeight += distance;
      
      if (totalHeight >= scrollHeight) {
        clearInterval(timer);
      }
    }, 100);
    
    // Wait a bit for any final lazy loading
    await new Promise(r => setTimeout(r, 2000));
  });
  
  console.log(`[AppleMusic] Scrolling complete`);
}

// Extract tracks using Puppeteer
async function extractWithPuppeteer(url: string): Promise<{ tracks: Track[], sourceName: string }> {
  console.log(`[AppleMusic] Starting Puppeteer browser for URL: ${url}`);
  
  let browser = null;
  
  try {
    // Launch a headless browser
    console.log(`[AppleMusic] Launching headless browser`);
    browser = await puppeteer.launch({ 
      headless: true, // Use headless mode
      args: ['--no-sandbox', '--disable-setuid-sandbox'], // For cloud environments
    });
    
    const page = await browser.newPage();
    
    // Set viewport and user agent to mimic a desktop browser
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36');
    
    console.log(`[AppleMusic] Navigating to: ${url}`);
    
    // Navigate to the Apple Music URL
    await page.goto(url, { 
      waitUntil: 'networkidle2',  // Wait until network is idle
      timeout: 30000              // 30 second timeout
    });
    
    console.log(`[AppleMusic] Page loaded, waiting for content to stabilize`);
    
    // Give the JavaScript some time to render
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Extract playlist/album info
    console.log(`[AppleMusic] Attempting to extract playlist/album info`);
    const { sourceName, isAlbum, albumArtist } = await page.evaluate(() => {
      const titleElement = document.querySelector('h1');
      const title = titleElement ? titleElement.textContent?.trim() : 'Apple Music Playlist';
      
      // Determine if this is an album (vs a playlist)
      const isAlbum = document.querySelector('.product-page--album-header, [data-testid="album-header"]') !== null;
      
      // Try to get album artist if this is an album
      let albumArtist = '';
      if (isAlbum) {
        const artistElement = document.querySelector('.product-creator, [data-testid="product-creator"], .artist-link');
        albumArtist = artistElement ? artistElement.textContent?.trim() || '' : '';
      }
      
      return { 
        sourceName: title, 
        isAlbum,
        albumArtist
      };
    });
    
    console.log(`[AppleMusic] Found ${isAlbum ? 'album' : 'playlist'}: "${sourceName}"${albumArtist ? ` by ${albumArtist}` : ''}`);
    
    // Try to scroll a bit to trigger lazy loading
    console.log(`[AppleMusic] Auto-scrolling page to load lazy content`);
    await autoScroll(page);
    
    // Wait for track list to load and extract track data
    console.log(`[AppleMusic] Attempting to extract track data using DOM selectors`);
    const tracks = await page.evaluate((contextAlbumArtist, contextIsAlbum) => {
      // Additional selectors specific to Apple Music's structure
      const selectors = {
        trackRow: '.songs-list__row, [role="row"], .tracklist-item, .track-list-item, .track',
        trackName: '.songs-list__song-name, [role="heading"], .track-name, .tracklist-item__text--primary, .track__title, .songs-list-row__song-name',
        trackArtist: '.songs-list__by-line, [role="text"], .track-artist, .tracklist-item__text--secondary, .track__artist, .songs-list-row__by-line, .songs-list-row__link-wrapper',
        trackAlbum: '.track-album, .album-title, .songs-list-row__album-name, [data-testid="track-column-album"]',
        trackDuration: '.songs-list__duration, .duration, .track-duration, .songs-list-row__duration',
        trackArt: '.track-artwork, .artwork-image'
      };

      // These selectors target different parts of the Apple Music interface
      console.log("Trying to find track elements with various selectors");
      const trackElements = Array.from(document.querySelectorAll(selectors.trackRow));
      
      console.log(`Found ${trackElements.length} potential track elements`);
      
      // Extract track information from DOM
      console.log(`Processing ${trackElements.length} track elements from DOM`);
      return trackElements.map((element, index) => {
        // Extract track name - try different selector patterns
        const nameElement = element.querySelector(selectors.trackName) || 
                           element.querySelector('div[dir="auto"]');
        
        const name = nameElement ? nameElement.textContent?.trim() || `Track ${index + 1}` : `Track ${index + 1}`;
        
        // Handle featuring info in track name
        const featMatch = name.match(/\s(?:feat|ft|featuring)\.?\s(.+?)(?:\)|\(|$)/i);
        const cleanedName = featMatch ? name.replace(featMatch[0], '') : name;
        
        // Extract artist - try different selector patterns
        const artistElement = element.querySelector(selectors.trackArtist);
        
        // If this is an album and there's no artist info for the track, use the album artist
        let artistText = artistElement ? artistElement.textContent?.trim() || 'Unknown Artist' : 'Unknown Artist';
        if (artistText === 'Unknown Artist' && contextAlbumArtist) {
          artistText = contextAlbumArtist;
        }
        
        // Clean up artist text (sometimes contains extra info like "feat." or "E")
        // Remove the explicit "E" marker if present
        artistText = artistText.replace(/\s*E\s*$/, '').trim();
        
        // Split multiple artists if comma or & is present
        let artists: string[] = [];
        if (artistText.includes('&')) {
          artists = artistText.split('&').map(a => a.trim());
        } else if (artistText.includes(',')) {
          artists = artistText.split(',').map(a => a.trim());
        } else {
          artists = [artistText];
        }
        
        // If we found featuring info in the track name, add it to artists
        if (featMatch && featMatch[1]) {
          const featuringArtists = featMatch[1].split(/,\s*|&\s*/).map(a => a.trim());
          artists = [...artists, ...featuringArtists];
        }
        
        // Generate a consistent ID from the track info
        const id = `apple-${index}-${encodeURIComponent(cleanedName)}-${encodeURIComponent(artists.join(','))}`;
        
        // Extract album art if available
        const artElement = element.querySelector(selectors.trackArt) || 
                          document.querySelector('.album-header__artwork img, .product-artwork img');
        // Cast to HTMLImageElement to access src property
        const artImg = artElement as HTMLImageElement;
        const albumImageUrl = artImg && artImg.src ? artImg.src : '';
        
        // Extract album name if available
        const albumElement = element.querySelector(selectors.trackAlbum);
        let album = albumElement && albumElement.textContent ? albumElement.textContent.trim() : '';
        
        // If this is an album and we didn't find album name from the track, use the album title
        if ((!album || album === '') && contextIsAlbum) {
          const albumHeader = document.querySelector('h1');
          album = albumHeader ? albumHeader.textContent?.trim() || '' : '';
        }
        
        // Extract duration if available
        const durationElement = element.querySelector(selectors.trackDuration);
        const duration = durationElement && durationElement.textContent ? durationElement.textContent.trim() : '0:00';
        
        return {
          id,
          name: cleanedName, // Use the cleaned track name without featuring info
          artists,
          album,
          albumArtist: contextAlbumArtist || (artists.length > 0 ? artists[0] : ''),
          albumImageUrl,
          duration,
          service: 'apple-music'
        };
      });
    }, albumArtist, isAlbum);
    
    console.log(`[AppleMusic] Extracted ${tracks.length} tracks from "${sourceName}"`);
    
    // If we couldn't extract any tracks, return empty result
    if (tracks.length === 0) {
      console.log(`[AppleMusic] No tracks found with primary selectors`);
      return {
        tracks: [],
        sourceName: sourceName || 'Apple Music Playlist'
      };
    }
    
    // Sample logging of first few tracks
    if (tracks.length > 0) {
      const sampleTracks = tracks.slice(0, Math.min(3, tracks.length));
      sampleTracks.forEach((track: Track, i: number) => {
        console.log(`[AppleMusic] Track ${i+1}: "${track.name}" by ${track.artists.join(', ')} (Album: ${track.album})`);
      });
    }
    
    return {
      tracks,
      sourceName: sourceName || 'Apple Music Playlist'
    };
    
  } catch (error) {
    console.error(`[AppleMusic] Puppeteer error: ${error instanceof Error ? error.message : String(error)}`);
    return {
      tracks: [],
      sourceName: ''
    };
  } finally {
    // Always close the browser
    if (browser) {
      try {
        await browser.close();
        console.log(`[AppleMusic] Browser closed`);
      } catch (e) {
        console.error(`[AppleMusic] Error closing browser: ${e}`);
      }
    }
  }
}

export async function GET(request: NextRequest) {
  try {
    const url = request.nextUrl.searchParams.get("url");

    if (!url) {
      return NextResponse.json(
        { error: "Missing Apple Music URL parameter", tracks: [], sourceName: '' },
        { status: 400 }
      );
    }

    if (!url.includes('music.apple.com')) {
      return NextResponse.json(
        { error: "Invalid Apple Music URL", tracks: [], sourceName: '' },
        { status: 400 }
      );
    }

    console.log(`[AppleMusic] Fetching data for: ${url}`);
    
    // Use Puppeteer to extract playlist data
    const result = await extractWithPuppeteer(url);
    
    if (result.tracks.length > 0) {
      console.log(`[AppleMusic] Successfully extracted ${result.tracks.length} tracks from "${result.sourceName}"`);
      return NextResponse.json(result);
    } else {
      return NextResponse.json(
        { error: "Could not extract tracks from Apple Music URL", tracks: [], sourceName: '' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Error in Apple Music API route:", error);
    
    // Return detailed error information for debugging
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : "An unknown error occurred",
        stack: error instanceof Error ? error.stack : undefined,
        tracks: [],
        sourceName: ''
      },
      { status: 500 }
    );
  }
} 