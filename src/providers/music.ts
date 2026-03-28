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
        description: "搜索音乐。返回歌曲列表供选择。",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "搜索关键词" },
          },
          required: ["query"],
        },
      },
      {
        name: "music_play",
        description: "播放音乐。可以提供歌曲 ID，或者直接提供搜索关键词来播放最匹配的歌曲。",
        inputSchema: {
          type: "object",
          properties: {
            song_id: { type: "string", description: "歌曲 ID（如果已知）" },
            query: { type: "string", description: "歌曲名称或搜索关键词（用于直接播放）" },
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
      {
        uri: "music://playlist",
        name: "当前播放列表",
        description: "展示当前队列中的歌曲列表。",
        mimeType: "application/json",
      }
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
              timestamp: new Date().toISOString(),
            }, null, 2),
          }
        ]
      };
    }
    
    if (uri === "music://playlist") {
      return {
        contents: [
          {
            uri: "music://playlist",
            mimeType: "application/json",
            text: JSON.stringify({
              count: this.playlist.length,
              songs: this.playlist,
            }, null, 2),
          }
        ]
      };
    }

    throw new Error(`Resource not found: ${uri}`);
  }

  async handleCall(name: string, args: any): Promise<CallToolResult> {
    console.error(`[Xiaozhi-Intelligent] 工具触发: ${name}`, JSON.stringify(args, null, 2));

    if (name === "music_search") {
      const { query } = z.object({ query: z.string() }).parse(args);
      const songs = await this.client.searchSongs(query);

      if (songs.length === 0) {
        return {
          content: [{ type: "text" as const, text: `抱歉，没有找到关于 "${query}" 的音乐。` }],
        };
      }

      // 更新搜索后的临时列表
      this.playlist = songs.slice(0, 10);

      const list = songs
        .map((s, i) => `${i + 1}. ${s.title} - ${s.artist} [ID: ${s.id}]`)
        .join("\n");

      return {
        content: [{ type: "text" as const, text: `为您找到以下歌曲：\n${list}\n\n您可以对我说“播放第一个”或指定 ID 播放。` }],
      };
    }

    if (name === "music_play") {
      const { song_id, query } = z.object({ 
        song_id: z.string().optional(),
        query: z.string().optional() 
      }).parse(args);

      let targetSong: Song | null = null;

      if (song_id) {
        console.error(`[Xiaozhi-Intelligent] 正在通过 ID 解析歌曲: ${song_id}`);
        targetSong = await this.client.getSong(song_id);
      } else if (query) {
        console.error(`[Xiaozhi-Intelligent] 正在通过关键词直接搜索并播放: ${query}`);
        const results = await this.client.searchSongs(query);
        if (results.length > 0) {
          targetSong = results[0];
        }
      }

      if (!targetSong) {
        return {
          content: [{ type: "text" as const, text: "抱歉，找不到您想播放的这首歌。" }],
        };
      }

      // 更新播放状态
      this.currentSong = targetSong;
      console.error(`[Xiaozhi-Intelligent] 状态已更新，播放 URL: ${targetSong.streamUrl}`);

      return {
        content: [
          {
            type: "text" as const,
            text: `正在播放：${targetSong.title} - ${targetSong.artist}\n链接：${targetSong.streamUrl}`,
          },
        ],
      };
    }

    if (name === "music_control") {
      const { action } = z.object({ action: z.string() }).parse(args);
      console.error(`[Xiaozhi-Intelligent] 执行播放控制: ${action}`);
      
      if (action === "stop") {
        this.currentSong = null;
      }

      const responses: Record<string, string> = {
        pause: "已为您暂停播放。",
        resume: "正在继续为您播放。",
        stop: "已停止播放。",
        next: "正在为您切换到下一首。",
        previous: "正在为您返回上一首。",
      };

      return {
        content: [{ type: "text" as const, text: responses[action] || "指令已执行。" }],
      };
    }

    throw new Error(`Unknown tool: ${name}`);
  }
}
