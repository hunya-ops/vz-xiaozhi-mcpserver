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

  private getAuthParams(): URLSearchParams {
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
    params.set("f", "json");
    return params;
  }

  private getBaseRestUrl(method: string, useExternal = false): string {
    const base = useExternal && this.config.externalBaseUrl 
      ? this.config.externalBaseUrl 
      : this.config.baseUrl;
      
    const url = new URL(`${base}/rest/${method}.view`);
    const auth = this.getAuthParams();
    auth.forEach((v, k) => url.searchParams.set(k, v));
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
