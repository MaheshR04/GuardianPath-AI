import http from 'node:http';
import app from './app.js';
import { connectDatabase } from './config/db.js';
import { env } from './config/env.js';
import { initializeSocketServer } from './sockets/index.js';
import { registerAllTools } from './agents/ToolRegistry.js';

const server = http.createServer(app);

initializeSocketServer(server);

async function startServer() {
  await connectDatabase();

  // Register AI Agent tools
  registerAllTools();

  server.listen(env.PORT, () => {
    console.log(`GuardianPath API running on port ${env.PORT}`);
  });
}

startServer().catch((error) => {
  console.error('Failed to start server:', error.message);
  process.exit(1);
});
