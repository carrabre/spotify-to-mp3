declare module 'youtube-search-api' {
  export function GetListByKeyword(
    keyword: string, 
    withPlaylist?: boolean, 
    limit?: number, 
    options?: object
  ): Promise<any>;
  
  export function GetVideoDetails(videoId: string): Promise<any>;
  export function GetSuggestData(keyword: string): Promise<any>;
} 