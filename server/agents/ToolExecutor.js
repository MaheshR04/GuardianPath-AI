import { memoryManager } from './MemoryManager.js';

class ToolExecutor {
  constructor() {
    this.tools = new Map();
  }

  registerTool(name, description, parameterSchema, handler) {
    this.tools.set(name, {
      name,
      description,
      parameterSchema,
      handler,
    });
  }

  getToolsList() {
    return Array.from(this.tools.values()).map((t) => ({
      name: t.name,
      description: t.description,
      parameterSchema: t.parameterSchema,
    }));
  }

  async execute(toolName, args, context = {}) {
    const startTime = Date.now();
    const tool = this.tools.get(toolName);
    const userId = context.userId || args.userId;

    if (!tool) {
      const durationMs = Date.now() - startTime;
      const errorMsg = `Tool '${toolName}' not found in registry.`;
      const logEntry = {
        toolName,
        arguments: args,
        status: 'FAILED',
        output: errorMsg,
        durationMs,
      };
      if (userId) {
        memoryManager.addToolCall(userId, logEntry);
      }
      return { status: 'FAILED', error: errorMsg, durationMs, logEntry };
    }

    try {
      const output = await tool.handler(args, context);
      const durationMs = Date.now() - startTime;
      const logEntry = {
        toolName,
        arguments: args,
        status: 'SUCCESS',
        output: output,
        durationMs,
      };
      if (userId) {
        memoryManager.addToolCall(userId, logEntry);
      }
      return { status: 'SUCCESS', output, durationMs, logEntry };
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const errorMsg = err.message || 'Unknown execution error';
      const logEntry = {
        toolName,
        arguments: args,
        status: 'FAILED',
        output: errorMsg,
        durationMs,
      };
      if (userId) {
        memoryManager.addToolCall(userId, logEntry);
      }
      return { status: 'FAILED', error: errorMsg, durationMs, logEntry };
    }
  }
}

export const toolExecutor = new ToolExecutor();
