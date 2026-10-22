#!/usr/bin/env node
/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { RestClient } from './client.js';
import { loadConfig } from './config.js';
import { createMcpServer } from './server.js';

async function main(): Promise<void> {
  const config = loadConfig(process.env);
  const server = createMcpServer(new RestClient(config));
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
