import { Tool, CallToolResult, Resource } from "@modelcontextprotocol/sdk/types.js";
import { SubsonicClient, Song } from "../lib/subsonic.js";
import { z } from "zod";

export interface McpProvider {
  getTools(): Tool[];
  handleCall(name: string, args: any): Promise<CallToolResult>;
  getResources(): Resource[];
  handleReadResource(uri: string): Promise<{ contents: any[] }>;
}

export class MusicProvider implements McpProvider {
  private client: SubsonicClient;
  private currentSong: Song | null = null;
  private playlist: Song[] = [];

  constructor(client: SubsonicClient) {
    this.client = client;
  }

  getTools(): Tool[] {
    return [
      {
        name: "music_search",
        description: "搜索音乐并返回推荐列表。结果包含歌曲 ID、名称及其流媒体地址。",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "搜索关键词" },
          },
          required: ["query"],
        },
      },
      {
        name: "play_music",
        description: "播放音乐。接收官方格式的 ID 或查询词。",
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "string", description: "歌曲 ID" },
            query: { type: "string", description: "歌曲名称（用于直接播放）" },
          },
        },
      },
      {
        name: "music_control",
        description: "控制音乐播放状态。支持动作：pause, resume, stop, next, previous。",
        inputSchema: {
          type: "object",
          properties: {
            action: { 
              type: "string", 
              enum: ["pause", "resume", "stop", "next", "previous"],
              description: "播放执行动作"
            },
          },
          required: ["action"],
        },
      },
    ];
  }

  getResources(): Resource[] {
    return [
      {
        uri: "music://current",
        name: "当前播放曲目",
        description: "展示当前正在播放的歌曲元数据与流媒体地址。",
        mimeType: "application/json",
      },
    ];
  }

  async handleReadResource(uri: string) {
    if (uri === "music://current") {
      return {
        contents: [
          {
            uri: "music://current",
            mimeType: "application/json",
            text: JSON.stringify({
              status: this.currentSong ? "playing" : "stopped",
              song: this.currentSong,
            }, null, 2),
          }
        ]
      };
    }
    throw new Error(`Resource not found: ${uri}`);
  }

  async handleCall(name: string, args: any): Promise<CallToolResult> {
    console.error(`[Xiaozhi-Official] 官方协议工具触发: ${name}`, JSON.stringify(args, null, 2));

    if (name === "music_search") {
      const { query } = z.object({ query: z.string() }).parse(args);
      const songs = await this.client.searchSongs(query);

      const officialResults = songs.map((s, i) => ({
        id: s.id,
        title: s.title,
        category: "Navidrome",
        score: i === 0 ? 0.99 : 0.09, // 模拟官方分数
        description: `${s.artist} - ${s.album}`,
        url: s.streamUrl // 将 URL 隐藏在结果集中供大模型在上下文中使用
      }));

      // 构造官方格式的返回
      const response = {
        result: {
          success: true,
          results: officialResults,
          count: officialResults.length,
          message: `Found ${officialResults.length} related songs, please use the play_music tool to play the music`
        }
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(response) }],
      };
    }

    if (name === "play_music" || name === "music_play") {
      const { id, query } = z.object({ 
        id: z.string().optional(),
        query: z.string().optional() 
      }).parse(args);

      let targetSong: Song | null = null;
      if (id) {
        targetSong = await this.client.getSong(id);
      } else if (query) {
        const results = await this.client.searchSongs(query);
        if (results.length > 0) targetSong = results[0];
      }

      if (!targetSong) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ result: { success: false, message: "Song not found" } }) }],
        };
      }

      this.currentSong = targetSong;

      // 构造官方格式的返回
      // 这里的关键：在指令中明确输出 𝄞[歌名]([URL])𝄞 的特殊格式
      const response = {
        result: {
          success: true,
          message: `Please inform the user that the song is going to play, then output 𝄞${targetSong.title}(${targetSong.streamUrl})𝄞 (the song name and url quoted within 𝄞) to insert the song, and then output something you want to say after the song is played`
        }
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(response) }],
      };
    }

    if (name === "music_control") {
      const { action } = z.object({ action: z.string() }).parse(args);
      const msgs: Record<string, string> = { stop: "已停止", pause: "已暂停", resume: "已恢复" };
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ result: { success: true, message: msgs[action] || "Done" } }) }],
      };
    }

    throw new Error(`Unknown tool: ${name}`);
  }
}
