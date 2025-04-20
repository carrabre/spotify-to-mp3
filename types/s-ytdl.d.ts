declare module 's-ytdl' {
  export function getInfo(url: string): Promise<any>;
  export function download(videoId: string, options?: any): Promise<Buffer>;
  export function downloadStream(videoId: string, options?: any): NodeJS.ReadableStream;
  export function getVideoInfo(videoId: string): Promise<any>;
  export function getFormats(videoId: string): Promise<any[]>;
  
  // Use function overloading to clearly define the two possible return types
  // When type is "audio", it returns a Buffer (used in download-binary)
  export function dl(url: string, quality: string, type: "audio"): Promise<Buffer>;
  // For any other type (or undefined), it returns an object (used in download-robust)
  export function dl(url: string, quality?: string, type?: string): Promise<{
    url: string;
    title?: string;
    duration?: string;
    size?: number;
    thumbnail?: string;
  }>;
  
  export default {
    getInfo,
    download,
    downloadStream,
    getVideoInfo,
    getFormats,
    dl
  };
} 