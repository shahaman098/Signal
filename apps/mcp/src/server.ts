import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createSignalMcpServer } from "./signal-mcp.js";

const server = createSignalMcpServer();
const transport = new StdioServerTransport();
await server.connect(transport);
