declare module 's-ytdl' {
  export function getInfo(url: string): Promise<any>;
  export function download(videoId: string, options?: any): Promise<Buffer>;
  export function downloadStream(videoId: string, options?: any): NodeJS.ReadableStream;
  export function getVideoInfo(videoId: string): Promise<any>;
  export function getFormats(videoId: string): Promise<any[]>;
  
  // Define a common interface for the return type with all possible properties
  interface DlResult {
    url?: string;
    title?: string;
    duration?: string;
    size?: number;
    thumbnail?: string;
    length?: number; // For buffer-like properties
    [key: string]: any; // Allow additional properties
  }
  
  // Define a single method signature that returns a type that can be used as either 
  // a Buffer (for download-binary) or an object with a url (for download-robust)
  export function dl(url: string, quality?: string, type?: string): Promise<DlResult & Buffer>;
  
  export default {
    getInfo,
    download,
    downloadStream,
    getVideoInfo,
    getFormats,
    dl
  };
} 