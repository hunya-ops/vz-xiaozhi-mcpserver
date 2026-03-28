import { Tool, CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { SubsonicClient } from "../lib/subsonic.js";
import { z } from "zod";

export interface McpProvider {
  getTools(): Tool[];
  handleCall(name: string, args: any): Promise<CallToolResult>;
}

export class MusicProvider implements McpProvider {
  private client: SubsonicClient;

  constructor(client: SubsonicClient) {
    this.client = client;
  }

  getTools(): Tool[] {
    return [
      {
        name: "music_search_and_play",
        description: 
          "搜索并播放音乐。如果找到高匹配度的歌曲，将直接返回播放连接。支持精确搜索和模糊搜索（如：我想听周杰伦的青花瓷、播放清明歌）。",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "搜索关键词（歌曲名、歌手名或两者的组合）",
            },
          },
          required: ["query"],
        },
      },
    ];
  }

  async handleCall(name: string, args: any): Promise<CallToolResult> {
    console.error(`[MusicProvider] 工具调用: ${name}, 参数:`, JSON.stringify(args, null, 2));

    if (name === "music_search_and_play") {
      const { query } = z.object({ query: z.string() }).parse(args);
      const songs = await this.client.searchSongs(query);

      if (songs.length === 0) {
        console.error(`[MusicProvider] 为关键词 "${query}" 未找到任何结果`);
        return {
          content: [
            {
              type: "text",
              text: `抱歉，我在您的 Navidrome 服务器上没有找到与 "${query}" 相关的歌曲。`,
            },
          ],
        };
      }

      const bestMatch = songs[0];
      console.error(`[MusicProvider] 已找到最佳匹配: ${bestMatch.title} - ${bestMatch.artist}`);
      console.error(`[MusicProvider] 播放直链: ${bestMatch.streamUrl}`);

      const response = {
        content: [
          {
            type: "text",
            text: `正在为您准备播放：${bestMatch.title} - ${bestMatch.artist}\n` + 
                  `播放链接：${bestMatch.streamUrl}\n` +
                  (songs.length > 1 ? `\n还为您找到了其他 ${songs.length - 1} 首相关歌曲。` : ""),
          },
        ],
      };

      return response;
    }

    throw new Error(`Tool not found: ${name}`);
  }
}
