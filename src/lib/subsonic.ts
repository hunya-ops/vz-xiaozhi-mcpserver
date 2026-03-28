import crypto from "crypto";

export interface SubsonicConfig {
  baseUrl: string; // 内部访问地址 (e.g. http://127.0.0.1:4533)
  externalBaseUrl?: string; // 对外暴露的域名 (e.g. https://music.9ba.in)
  user: string;
  pass: string;
  clientName: string;
}

export interface Song {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  coverArt?: string;
  streamUrl?: string;
}

export class SubsonicClient {
  private config: SubsonicConfig;
  private apiVersion = "1.16.1";

  constructor(config: SubsonicConfig) {
    this.config = config;
  }

  private getAuthParams(isBinary = false): URLSearchParams {
    const salt = crypto.randomBytes(8).toString("hex");
    const token = crypto
      .createHash("md5")
      .update(this.config.pass + salt)
      .digest("hex");

    const params = new URLSearchParams();
    params.set("u", this.config.user);
    params.set("t", token);
    params.set("s", salt);
    params.set("v", this.apiVersion);
    params.set("c", this.config.clientName);
    
    // 只有非二进制（如搜索）才需要 f=json
    if (!isBinary) {
      params.set("f", "json");
    }
    return params;
  }

  private getBaseRestUrl(method: string, useExternal = false): string {
    const base = useExternal && this.config.externalBaseUrl 
      ? this.config.externalBaseUrl 
      : this.config.baseUrl;
      
    const url = new URL(`${base}/rest/${method}.view`);
    
    // 判断是否是二进制流方法
    const isBinaryMethod = ["stream", "getCoverArt", "download"].includes(method);
    const auth = this.getAuthParams(isBinaryMethod);
    
    auth.forEach((v, k) => url.searchParams.set(k, v));
    
    // 如果是播放流，增加转码参数以提高兼容性
    if (method === "stream") {
      url.searchParams.set("format", "mp3");
      url.searchParams.set("maxBitRate", "64");
      // 增加虚拟后缀，骗过某些只认后缀的播放器
      url.searchParams.set("ext", ".mp3");
    }
    
    return url.toString();
  }

  async searchSongs(query: string, count = 5): Promise<Song[]> {
    const url = new URL(this.getBaseRestUrl("search3", false));
    url.searchParams.set("query", query);
    url.searchParams.set("songCount", count.toString());

    try {
      const resp = await fetch(url.toString());
      const data = (await resp.json()) as any;
      const results = data["subsonic-response"]?.searchResult3?.song || [];

      return results.map((s: any) => ({
        id: s.id,
        title: s.title,
        artist: s.artist,
        album: s.album,
        duration: s.duration,
        coverArt: this.getCoverArtUrl(s.id),
        streamUrl: this.getStreamUrl(s.id),
      }));
    } catch (error) {
      console.error("Subsonic 搜索异常:", error);
      throw error;
    }
  }

  async getSong(id: string): Promise<Song | null> {
    const url = new URL(this.getBaseRestUrl("getSong", false));
    url.searchParams.set("id", id);

    try {
      const resp = await fetch(url.toString());
      const data = (await resp.json()) as any;
      const s = data["subsonic-response"]?.song;

      if (!s) return null;

      return {
        id: s.id,
        title: s.title,
        artist: s.artist,
        album: s.album,
        duration: s.duration,
        coverArt: this.getCoverArtUrl(s.id),
        streamUrl: this.getStreamUrl(s.id),
      };
    } catch (error) {
      console.error(`Subsonic 获取歌曲详情失败 (ID: ${id}):`, error);
      return null;
    }
  }

  getStreamUrl(id: string): string {
    const url = new URL(this.getBaseRestUrl("stream", true));
    url.searchParams.set("id", id);
    return url.toString();
  }

  getCoverArtUrl(id?: string): string | undefined {
    if (!id) return undefined;
    const url = new URL(this.getBaseRestUrl("getCoverArt", true));
    url.searchParams.set("id", id);
    return url.toString();
  }
}
