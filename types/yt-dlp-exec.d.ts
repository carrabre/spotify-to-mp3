declare module 'yt-dlp-exec' {
  interface YtDlpOptions {
    [key: string]: any;
    dumpSingleJson?: boolean;
    format?: string;
    output?: string;
    noWarnings?: boolean;
    noCheckCertificate?: boolean;
    preferFreeFormats?: boolean;
    youtubeSkipDashManifest?: boolean;
    extractAudio?: boolean;
    audioFormat?: string;
    audioQuality?: string;
    referer?: string;
    userAgent?: string;
    ffmpegLocation?: string;
    addHeader?: string[];
    quiet?: boolean;
    verbose?: boolean;
    updateTo?: string;
    printJson?: boolean;
  }

  function ytDlp(url: string, options?: YtDlpOptions): Promise<any>;
  
  namespace ytDlp {
    export const getInfo: (url: string) => Promise<any>;
    export const getFormats: (url: string) => Promise<any[]>;
    export const version: () => Promise<string>;
    export const path: string;
  }
  
  export = ytDlp;
} 