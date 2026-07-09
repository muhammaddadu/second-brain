#!/usr/bin/env node
/**
 * `brain-mcp` stdio entry — resolves the vault (--vault <path> or BRAIN_VAULT), builds the server
 * from the tool registry, and serves over stdio (what MCP clients like Claude Code spawn). All
 * logic lives in server.ts/tools.ts; this file is intentionally trivial.
 */
import { isVault, openVault } from '@brain/core';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createVaultServer } from './server.js';

async function main(): Promise<void> {
  const flagIndex = process.argv.indexOf('--vault');
  const vaultPath = flagIndex !== -1 ? process.argv[flagIndex + 1] : process.env.BRAIN_VAULT;
  if (!vaultPath) {
    process.stderr.write('No vault. Pass --vault <path> or set BRAIN_VAULT.\n');
    process.exit(1);
  }
  if (!(await isVault(vaultPath))) {
    process.stderr.write(`Not a Second Brain vault: ${vaultPath}\n`);
    process.exit(1);
  }
  const server = createVaultServer(openVault(vaultPath));
  await server.connect(new StdioServerTransport());
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
