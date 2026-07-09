/**
 * MCP server assembly (E6): registers every tool from the {@link VAULT_TOOLS} registry against a
 * vault. Kept separate from the stdio entry so tests can connect over an in-memory transport and
 * the same server could later ride other transports. Thin by design — behavior lives in the
 * registry's handlers, which live on `packages/core`.
 */
import type { Vault } from '@brain/core';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { VAULT_TOOLS } from './tools.js';

export function createVaultServer(vault: Vault): McpServer {
  const server = new McpServer({ name: 'second-brain', version: '1.0.0' });
  for (const tool of VAULT_TOOLS) {
    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema: tool.schema },
      async (args: Record<string, unknown>) => {
        try {
          return { content: [{ type: 'text' as const, text: await tool.handler(vault, args) }] };
        } catch (error) {
          return {
            content: [
              {
                type: 'text' as const,
                text: error instanceof Error ? error.message : String(error),
              },
            ],
            isError: true,
          };
        }
      },
    );
  }
  return server;
}
