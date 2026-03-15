/**
 * pi-a2a-communication Extension
 * 
 * Enterprise-grade A2A protocol implementation for pi coding agent.
 * Enables multi-node, multi-agent collaboration across diverse enterprise scenarios.
 * 
 * Features:
 * - A2A client for calling remote agents
 * - A2A server mode for exposing pi as an agent
 * - Agent discovery via Agent Cards
 * - Task lifecycle management (sync, streaming, async)
 * - Enterprise security (OAuth2, mTLS, API keys)
 * - Load balancing and failover
 * - Task queuing and persistence
 * 
 * @module pi-a2a-communication
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { A2AClient } from "./a2a-client.js";
import { A2AServer } from "./a2a-server.js";
import { AgentDiscovery } from "./agent-discovery.js";
import { TaskManager } from "./task-manager.js";
import { ConfigManager } from "./config.js";
import type { A2AConfig, RemoteAgent, TaskOptions, A2ATask } from "./types.js";

export { A2AClient, A2AServer, AgentDiscovery, TaskManager, ConfigManager };
export type { A2AConfig, RemoteAgent, TaskOptions, A2ATask };

// Global extension state
let a2aClient: A2AClient | null = null;
let a2aServer: A2AServer | null = null;
let agentDiscovery: AgentDiscovery | null = null;
let taskManager: TaskManager | null = null;
let configManager: ConfigManager | null = null;
let currentCtx: ExtensionContext | null = null;

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Partial<A2AConfig> = {
  client: {
    timeout: 30000,
    retryAttempts: 3,
    retryDelay: 1000,
    maxConcurrentTasks: 10,
    streamingEnabled: true,
  },
  server: {
    enabled: false,
    port: 10000,
    host: "0.0.0.0",
    basePath: "/a2a",
  },
  discovery: {
    cacheEnabled: true,
    cacheTtl: 300000, // 5 minutes
    agentCardPath: "/.well-known/agent-card",
  },
  security: {
    defaultScheme: "bearer",
    verifySsl: true,
  },
};

export default function (pi: ExtensionAPI) {
  // Initialize configuration
  configManager = new ConfigManager(DEFAULT_CONFIG);

  /**
   * Initialize A2A components on session start
   */
  pi.on("session_start", async (event, ctx) => {
    currentCtx = ctx;
    const config = configManager!.getConfig();

    // Initialize A2A client
    a2aClient = new A2AClient(config.client, config.security);

    // Initialize agent discovery
    agentDiscovery = new AgentDiscovery(config.discovery);

    // Initialize task manager
    taskManager = new TaskManager(a2aClient, config.client);

    // Initialize A2A server if enabled
    if (config.server?.enabled) {
      a2aServer = new A2AServer(config.server, config.security, ctx);
      await a2aServer.start();
      ctx.ui?.notify?.(`A2A server started on ${config.server.host}:${config.server.port}`, "info");
    }

    ctx.ui?.notify?.("A2A communication initialized", "info");
  });

  /**
   * Cleanup on session end
   */
  pi.on("session_end", async () => {
    if (a2aServer) {
      await a2aServer.stop();
      a2aServer = null;
    }
    if (taskManager) {
      await taskManager.cleanup();
      taskManager = null;
    }
    a2aClient = null;
    agentDiscovery = null;
    currentCtx = null;
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // COMMANDS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Discover agents at a given URL
   * Usage: /a2a-discover <url>
   */
  pi.registerCommand("a2a-discover", {
    description: "Discover A2A agents at a URL",
    handler: async (args, ctx) => {
      if (!agentDiscovery) {
        ctx.ui?.notify?.("A2A not initialized", "error");
        return;
      }

      const url = args.trim();
      if (!url) {
        ctx.ui?.notify?.("Usage: /a2a-discover <url>", "warning");
        return;
      }

      try {
        const agent = await agentDiscovery.discoverAgent(url);
        ctx.ui?.notify?.(`Discovered agent: ${agent.name} at ${url}`, "success");
        
        // Store in config
        configManager!.addRemoteAgent(url, agent);
        
        // Display agent info
        const info = [
          `Name: ${agent.name}`,
          `Description: ${agent.description}`,
          `Version: ${agent.version}`,
          `Skills: ${agent.skills.map(s => s.id).join(", ")}`,
          `Capabilities: ${Object.entries(agent.capabilities)
            .filter(([_, v]) => v)
            .map(([k]) => k)
            .join(", ")}`,
        ].join("\n");
        
        ctx.ui?.notify?.(info, "info");
      } catch (error) {
        ctx.ui?.notify?.(`Discovery failed: ${error}`, "error");
      }
    },
  });

  /**
   * List discovered agents
   * Usage: /a2a-agents
   */
  pi.registerCommand("a2a-agents", {
    description: "List all discovered A2A agents",
    handler: async (_args, ctx) => {
      const agents = configManager!.getRemoteAgents();
      
      if (agents.length === 0) {
        ctx.ui?.notify?.("No agents discovered. Use /a2a-discover <url>", "info");
        return;
      }

      const list = agents.map((a, i) => 
        `${i + 1}. ${a.name} (${a.url}) - ${a.skills.length} skills`
      ).join("\n");
      
      ctx.ui?.notify?.(`Discovered Agents:\n${list}`, "info");
    },
  });

  /**
   * Send a task to a remote agent
   * Usage: /a2a-send <agent-url-or-name> <task-message>
   */
  pi.registerCommand("a2a-send", {
    description: "Send a task to a remote A2A agent",
    handler: async (args, ctx) => {
      if (!taskManager || !a2aClient) {
        ctx.ui?.notify?.("A2A not initialized", "error");
        return;
      }

      const parts = args.trim().split(/\s+/);
      if (parts.length < 2) {
        ctx.ui?.notify?.("Usage: /a2a-send <agent-url-or-name> <task-message>", "warning");
        return;
      }

      const agentRef = parts[0];
      const message = parts.slice(1).join(" ");

      try {
        // Resolve agent reference
        let agentUrl = agentRef;
        const knownAgent = configManager!.getRemoteAgent(agentRef);
        if (knownAgent) {
          agentUrl = knownAgent.url;
        }

        // Get or discover agent
        let agent = knownAgent || await agentDiscovery!.discoverAgent(agentUrl);

        ctx.ui?.notify?.(`Sending task to ${agent.name}...`, "info");

        // Send task
        const result = await taskManager.sendTask(agent, message, {
          streaming: true,
          timeout: 60000,
        }, (update) => {
          // Progress callback
          if (update.status?.state) {
            ctx.ui?.notify?.(`Task state: ${update.status.state}`, "info");
          }
        });

        // Display result
        if (result.artifacts && result.artifacts.length > 0) {
          const artifact = result.artifacts[0];
          const content = artifact.parts
            .filter(p => p.type === "text")
            .map(p => p.text)
            .join("\n");
          ctx.ui?.notify?.(`Result:\n${content}`, "success");
        } else if (result.status?.message?.parts) {
          const content = result.status.message.parts
            .filter(p => p.type === "text")
            .map(p => p.text)
            .join("\n");
          ctx.ui?.notify?.(`Result:\n${content}`, "success");
        }
      } catch (error) {
        ctx.ui?.notify?.(`Task failed: ${error}`, "error");
      }
    },
  });

  /**
   * Send tasks to multiple agents in parallel
   * Usage: /a2a-broadcast <message> --agents <url1,url2,...>
   */
  pi.registerCommand("a2a-broadcast", {
    description: "Broadcast a task to multiple A2A agents in parallel",
    handler: async (args, ctx) => {
      if (!taskManager) {
        ctx.ui?.notify?.("A2A not initialized", "error");
        return;
      }

      // Parse arguments
      const agentsMatch = args.match(/--agents\s+([^\s]+)/);
      const message = args.replace(/--agents\s+[^\s]+/, "").trim();

      if (!agentsMatch || !message) {
        ctx.ui?.notify?.("Usage: /a2a-broadcast <message> --agents <url1,url2,...>", "warning");
        return;
      }

      const agentUrls = agentsMatch[1].split(",");

      try {
        ctx.ui?.notify?.(`Broadcasting to ${agentUrls.length} agents...`, "info");

        // Discover all agents first
        const agents = await Promise.all(
          agentUrls.map(url => agentDiscovery!.discoverAgent(url))
        );

        // Send parallel tasks
        const results = await taskManager.sendParallelTasks(
          agents.map((agent, i) => ({
            agent,
            message,
            options: { timeout: 60000 },
          })),
          (update, index) => {
            ctx.ui?.notify?.(`[${agents[index].name}] ${update.status?.state || "update"}`, "info");
          }
        );

        // Display results
        const summary = results.map((r, i) => {
          const status = r.isError ? "✗" : "✓";
          return `${status} ${agents[i].name}: ${r.status?.state || "unknown"}`;
        }).join("\n");

        ctx.ui?.notify?.(`Results:\n${summary}`, "info");
      } catch (error) {
        ctx.ui?.notify?.(`Broadcast failed: ${error}`, "error");
      }
    },
  });

  /**
   * Chain tasks across multiple agents
   * Usage: /a2a-chain <agent1> <task1> | <agent2> <task2> | ...
   */
  pi.registerCommand("a2a-chain", {
    description: "Chain tasks across multiple A2A agents sequentially",
    handler: async (args, ctx) => {
      if (!taskManager) {
        ctx.ui?.notify?.("A2A not initialized", "error");
        return;
      }

      // Parse chain: agent1 task1 | agent2 task2 | ...
      const steps = args.split("|").map(s => s.trim()).filter(Boolean);
      
      if (steps.length === 0) {
        ctx.ui?.notify?.("Usage: /a2a-chain <agent1> <task1> | <agent2> <task2> | ...", "warning");
        return;
      }

      const chainSteps: Array<{ agent: RemoteAgent; task: string }> = [];

      try {
        // Parse each step
        for (const step of steps) {
          const parts = step.split(/\s+/);
          if (parts.length < 2) {
            ctx.ui?.notify?.(`Invalid step: ${step}`, "error");
            return;
          }
          
          const agentRef = parts[0];
          const task = parts.slice(1).join(" ");
          
          let agent = configManager!.getRemoteAgent(agentRef);
          if (!agent) {
            agent = await agentDiscovery!.discoverAgent(agentRef);
          }
          
          chainSteps.push({ agent, task });
        }

        ctx.ui?.notify?.(`Executing chain of ${chainSteps.length} steps...`, "info");

        // Execute chain
        let previousOutput = "";
        for (let i = 0; i < chainSteps.length; i++) {
          const { agent, task } = chainSteps[i];
          const taskWithContext = task.replace(/\{previous\}/g, previousOutput);
          
          ctx.ui?.notify?.(`Step ${i + 1}/${chainSteps.length}: ${agent.name}...`, "info");

          const result = await taskManager.sendTask(agent, taskWithContext, {
            streaming: false,
            timeout: 60000,
          });

          if (result.isError) {
            ctx.ui?.notify?.(`Chain failed at step ${i + 1}: ${result.error}`, "error");
            return;
          }

          // Extract output for next step
          previousOutput = result.artifacts?.[0]?.parts
            ?.filter(p => p.type === "text")
            ?.map(p => p.text)
            ?.join("\n") || "";
        }

        ctx.ui?.notify?.(`Chain completed. Final output:\n${previousOutput}`, "success");
      } catch (error) {
        ctx.ui?.notify?.(`Chain failed: ${error}`, "error");
      }
    },
  });

  /**
   * Start A2A server mode
   * Usage: /a2a-server start [port]
   * Usage: /a2a-server stop
   */
  pi.registerCommand("a2a-server", {
    description: "Start or stop the A2A server mode",
    handler: async (args, ctx) => {
      const parts = args.trim().split(/\s+/);
      const command = parts[0];

      if (command === "start") {
        if (a2aServer?.isRunning()) {
          ctx.ui?.notify?.("A2A server already running", "warning");
          return;
        }

        const port = parts[1] ? parseInt(parts[1], 10) : 10000;
        const config = configManager!.getConfig();
        
        a2aServer = new A2AServer(
          { ...config.server, enabled: true, port },
          config.security,
          ctx
        );

        try {
          await a2aServer.start();
          ctx.ui?.notify?.(`A2A server started on port ${port}`, "success");
        } catch (error) {
          ctx.ui?.notify?.(`Failed to start server: ${error}`, "error");
        }
      } else if (command === "stop") {
        if (!a2aServer?.isRunning()) {
          ctx.ui?.notify?.("A2A server not running", "warning");
          return;
        }

        await a2aServer.stop();
        ctx.ui?.notify?.("A2A server stopped", "success");
      } else {
        ctx.ui?.notify?.("Usage: /a2a-server start [port] | /a2a-server stop", "warning");
      }
    },
  });

  /**
   * Get task status
   * Usage: /a2a-status <task-id> [agent-url]
   */
  pi.registerCommand("a2a-status", {
    description: "Get status of an A2A task",
    handler: async (args, ctx) => {
      if (!a2aClient) {
        ctx.ui?.notify?.("A2A not initialized", "error");
        return;
      }

      const parts = args.trim().split(/\s+/);
      if (parts.length < 1) {
        ctx.ui?.notify?.("Usage: /a2a-status <task-id> [agent-url]", "warning");
        return;
      }

      const taskId = parts[0];
      const agentUrl = parts[1];

      try {
        let agent: RemoteAgent | null = null;
        
        if (agentUrl) {
          agent = configManager!.getRemoteAgent(agentUrl) || 
                  await agentDiscovery!.discoverAgent(agentUrl);
        } else {
          // Try to find agent from task manager cache
          agent = taskManager!.getTaskAgent(taskId);
        }

        if (!agent) {
          ctx.ui?.notify?.("Agent not found. Provide agent URL.", "error");
          return;
        }

        const task = await a2aClient.getTask(agent, taskId);
        
        const info = [
          `Task ID: ${task.id}`,
          `State: ${task.status?.state}`,
          `Context ID: ${task.contextId}`,
          `Artifacts: ${task.artifacts?.length || 0}`,
          `History: ${task.history?.length || 0} messages`,
        ].join("\n");
        
        ctx.ui?.notify?.(info, "info");
      } catch (error) {
        ctx.ui?.notify?.(`Failed to get status: ${error}`, "error");
      }
    },
  });

  /**
   * Cancel a task
   * Usage: /a2a-cancel <task-id> [agent-url]
   */
  pi.registerCommand("a2a-cancel", {
    description: "Cancel an A2A task",
    handler: async (args, ctx) => {
      if (!a2aClient) {
        ctx.ui?.notify?.("A2A not initialized", "error");
        return;
      }

      const parts = args.trim().split(/\s+/);
      if (parts.length < 1) {
        ctx.ui?.notify?.("Usage: /a2a-cancel <task-id> [agent-url]", "warning");
        return;
      }

      const taskId = parts[0];
      const agentUrl = parts[1];

      try {
        let agent: RemoteAgent | null = null;
        
        if (agentUrl) {
          agent = configManager!.getRemoteAgent(agentUrl) || 
                  await agentDiscovery!.discoverAgent(agentUrl);
        } else {
          agent = taskManager!.getTaskAgent(taskId);
        }

        if (!agent) {
          ctx.ui?.notify?.("Agent not found. Provide agent URL.", "error");
          return;
        }

        await a2aClient.cancelTask(agent, taskId);
        ctx.ui?.notify?.(`Task ${taskId} canceled`, "success");
      } catch (error) {
        ctx.ui?.notify?.(`Failed to cancel task: ${error}`, "error");
      }
    },
  });

  /**
   * Configure A2A settings
   * Usage: /a2a-config <key> <value>
   */
  pi.registerCommand("a2a-config", {
    description: "Configure A2A settings",
    handler: async (args, ctx) => {
      const parts = args.trim().split(/\s+/);
      if (parts.length < 2) {
        ctx.ui?.notify?.("Usage: /a2a-config <key> <value>\nKeys: timeout, retryAttempts, cacheTtl", "warning");
        return;
      }

      const key = parts[0];
      const value = parts.slice(1).join(" ");

      try {
        configManager!.set(key, value);
        ctx.ui?.notify?.(`Configuration updated: ${key} = ${value}`, "success");
      } catch (error) {
        ctx.ui?.notify?.(`Failed to set config: ${error}`, "error");
      }
    },
  });

  /**
   * Show A2A help
   * Usage: /a2a-help
   */
  pi.registerCommand("a2a-help", {
    description: "Show A2A extension help",
    handler: async (_args, ctx) => {
      const help = `
A2A Communication Extension Commands:

Discovery:
  /a2a-discover <url>           - Discover agent at URL
  /a2a-agents                   - List discovered agents

Task Management:
  /a2a-send <agent> <message>   - Send task to agent
  /a2a-broadcast <msg> --agents <urls> - Broadcast to multiple agents
  /a2a-chain <agent1> <task1> | <agent2> <task2> | ... - Chain tasks
  /a2a-status <task-id> [url]   - Get task status
  /a2a-cancel <task-id> [url]   - Cancel a task

Server:
  /a2a-server start [port]        - Start A2A server mode
  /a2a-server stop                - Stop A2A server mode

Configuration:
  /a2a-config <key> <value>       - Configure settings
  /a2a-help                       - Show this help

Examples:
  /a2a-discover https://agent.example.com
  /a2a-send my-agent "Analyze this code"
  /a2a-broadcast "Check security" --agents https://agent1.com,https://agent2.com
  /a2a-chain scout "find bugs" | worker "fix {previous}"
      `.trim();

      ctx.ui?.notify?.(help, "info");
    },
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TOOLS REGISTRATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Register a2a_call tool for programmatic agent invocation
   */
  pi.registerTool({
    name: "a2a_call",
    label: "A2A Agent Call",
    description: "Call a remote A2A agent to perform a task",
    parameters: {
      type: "object",
      properties: {
        agent_url: {
          type: "string",
          description: "URL of the A2A agent",
        },
        message: {
          type: "string",
          description: "Task message to send",
        },
        streaming: {
          type: "boolean",
          description: "Enable streaming responses",
          default: true,
        },
        timeout: {
          type: "number",
          description: "Timeout in milliseconds",
          default: 60000,
        },
      },
      required: ["agent_url", "message"],
    },
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      if (!taskManager || !agentDiscovery) {
        return {
          content: [{ type: "text", text: "A2A not initialized" }],
          isError: true,
        };
      }

      try {
        const agent_url = params.agent_url as string;
        const message = params.message as string;
        const agent = await agentDiscovery.discoverAgent(agent_url);
        
        const result = await taskManager.sendTask(agent, message, {
          streaming: (params.streaming as boolean) ?? true,
          timeout: (params.timeout as number) ?? 60000,
          signal,
        }, onUpdate ? (update) => {
          if (update.status?.state) {
            onUpdate({
              content: [{ type: "text", text: `Status: ${update.status.state}` }],
              details: update,
            });
          }
        } : undefined);

        const output = result.artifacts?.[0]?.parts
          ?.filter(p => p.type === "text")
          ?.map(p => p.text)
          ?.join("\n") || result.status?.message?.parts
          ?.filter(p => p.type === "text")
          ?.map(p => p.text)
          ?.join("\n") || "(no output)";

        return {
          content: [{ type: "text", text: output }],
          details: result,
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error}` }],
          isError: true,
        };
      }
    },
  });

  /**
   * Register a2a_parallel tool for parallel agent execution
   */
  pi.registerTool({
    name: "a2a_parallel",
    label: "A2A Parallel Agents",
    description: "Send tasks to multiple A2A agents in parallel",
    parameters: {
      type: "object",
      properties: {
        tasks: {
          type: "array",
          description: "Array of tasks to send",
          items: {
            type: "object",
            properties: {
              agent_url: { type: "string" },
              message: { type: "string" },
            },
            required: ["agent_url", "message"],
          },
        },
        timeout: {
          type: "number",
          default: 60000,
        },
      },
      required: ["tasks"],
    },
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      if (!taskManager || !agentDiscovery) {
        return {
          content: [{ type: "text", text: "A2A not initialized" }],
          isError: true,
        };
      }

      try {
        // Discover all agents
        const tasks = params.tasks as Array<{ agent_url: string; message: string }>;
        const agents = await Promise.all(
          tasks.map((t: { agent_url: string }) => agentDiscovery!.discoverAgent(t.agent_url))
        );

        const taskConfigs = agents.map((agent, i) => ({
          agent,
          message: tasks[i].message,
          options: { timeout: (params.timeout as number) ?? 60000, signal },
        }));

        const results = await taskManager.sendParallelTasks(taskConfigs);

        const summaries = results.map((r, i) => {
          const output = r.artifacts?.[0]?.parts
            ?.filter(p => p.type === "text")
            ?.map(p => p.text)
            ?.join("\n") || "(no output)";
          return `[${agents[i].name}]\n${output}`;
        });

        return {
          content: [{ type: "text", text: summaries.join("\n\n---\n\n") }],
          details: results,
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error}` }],
          isError: true,
        };
      }
    },
  });
}
