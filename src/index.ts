import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { SubsonicClient } from "./lib/subsonic.js";
import { MusicProvider } from "./providers/music.js";
import dotenv from "dotenv";

dotenv.config();

const navidromeUrl = process.env.NAVIDROME_URL || "http://127.0.0.1:4533";
const navidromeExternalUrl = process.env.NAVIDROME_EXTERNAL_URL || navidromeUrl;
const navidromeUser = process.env.NAVIDROME_USER || "";
const navidromePass = process.env.NAVIDROME_PASS || "";

if (!navidromeUser || !navidromePass) {
  console.error("Warning: NAVIDROME_USER or NAVIDROME_PASS is not set.");
}

const client = new SubsonicClient({
  baseUrl: navidromeUrl,
  externalBaseUrl: navidromeExternalUrl,
  user: navidromeUser,
  pass: navidromePass,
  clientName: "vz-xiaozhi-mcp",
});

const musicProvider = new MusicProvider(client);
const providers = [musicProvider];

const server = new Server(
  {
    name: "vz-xiaozhi-mcpserver",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

/**
 * Register all resources from providers
 */
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  const resources = providers.flatMap((p) => p.getResources());
  return { resources };
});

/**
 * Handle resource reading
 */
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;
  for (const provider of providers) {
    try {
      return await provider.handleReadResource(uri);
    } catch (e) {
      // Continue to next provider if not found
    }
  }
  throw new Error(`Resource not found: ${uri}`);
});

/**
 * Register all tools from providers
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  const tools = providers.flatMap((p) => p.getTools());
  return { tools };
});

/**
 * Handle tool calls by delegating to the appropriate provider
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  for (const provider of providers) {
    const tools = provider.getTools();
    if (tools.some((t) => t.name === name)) {
      try {
        return await provider.handleCall(name!, args);
      } catch (error) {
        console.error(`Error executing tool ${name}:`, error);
        return {
          content: [
            {
              type: "text",
              text: `执行工具 ${name} 时出错: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  }

  throw new Error(`Tool not found: ${name}`);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("vz-xiaozhi-mcpserver (Navidrome) running on stdio");
}

main().catch((error) => {
  console.error("Fatal server error:", error);
  process.exit(1);
});
