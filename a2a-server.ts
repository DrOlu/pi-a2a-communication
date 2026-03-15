/**
 * A2A Server Implementation
 * 
 * Exposes pi as an A2A-compliant agent server.
 * Handles HTTP/JSON-RPC requests and manages task lifecycle.
 */

import * as http from "node:http";
import * as https from "node:https";
import * as fs from "node:fs";
import { URL } from "node:url";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { 
  ServerConfig, 
  SecurityConfig, 
  AgentCard,
  A2ATask,
  Message,
  JSONRPCRequest,
  JSONRPCResponse,
  TaskState,
  StreamResponse,
} from "./types.js";

/**
 * Task handler function type
 */
type TaskHandler = (task: A2ATask, onUpdate: (update: Partial<A2ATask>) => void) => Promise<A2ATask>;

/**
 * A2A Server class
 */
export class A2AServer {
  private config: ServerConfig;
  private security: SecurityConfig;
  private ctx: ExtensionContext;
  private server: http.Server | https.Server | null = null;
  private agentCard: AgentCard;
  private tasks: Map<string, A2ATask> = new Map();
  private taskHandlers: Map<string, TaskHandler> = new Map();
  private subscribers: Map<string, Set<http.ServerResponse>> = new Map();
  private running = false;

  constructor(config: ServerConfig, security: SecurityConfig, ctx: ExtensionContext) {
    this.config = config;
    this.security = security;
    this.ctx = ctx;
    
    // Create default agent card for this pi instance
    this.agentCard = this.createAgentCard();
  }

  /**
   * Start the A2A server
   */
  async start(): Promise<void> {
    if (this.running) {
      throw new Error("Server already running");
    }

    return new Promise((resolve, reject) => {
      const requestHandler = (req: http.IncomingMessage, res: http.ServerResponse) => {
        this.handleRequest(req, res);
      };

      if (this.config.ssl) {
        // HTTPS server
        const options = {
          key: fs.readFileSync(this.config.ssl.key),
          cert: fs.readFileSync(this.config.ssl.cert),
          ca: this.config.ssl.ca ? fs.readFileSync(this.config.ssl.ca) : undefined,
        };
        this.server = https.createServer(options, requestHandler);
      } else {
        // HTTP server
        this.server = http.createServer(requestHandler);
      }

      this.server.listen(this.config.port, this.config.host, () => {
        this.running = true;
        resolve();
      });

      this.server.on("error", (error) => {
        reject(error);
      });
    });
  }

  /**
   * Stop the A2A server
   */
  async stop(): Promise<void> {
    if (!this.server || !this.running) {
      return;
    }

    return new Promise((resolve) => {
      // Close all SSE connections
      for (const [_, responses] of this.subscribers) {
        for (const res of responses) {
          res.end();
        }
      }
      this.subscribers.clear();

      this.server!.close(() => {
        this.running = false;
        this.server = null;
        resolve();
      });
    });
  }

  /**
   * Check if server is running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Register a task handler for a specific skill
   */
  registerTaskHandler(skillId: string, handler: TaskHandler): void {
    this.taskHandlers.set(skillId, handler);
  }

  /**
   * Update the agent card
   */
  updateAgentCard(updates: Partial<AgentCard>): void {
    this.agentCard = { ...this.agentCard, ...updates };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Handle incoming HTTP requests
   */
  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    const path = url.pathname;

    try {
      // CORS headers
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }

      // Check authentication
      if (!this.isAuthenticated(req)) {
        this.sendError(res, 401, "Unauthorized");
        return;
      }

      // Route requests
      if (path === "/.well-known/agent-card") {
        await this.handleAgentCard(req, res);
      } else if (path === "/sendMessage" || path === "/sendStreamingMessage") {
        await this.handleSendMessage(req, res, path === "/sendStreamingMessage");
      } else if (path.startsWith("/tasks/")) {
        await this.handleTaskRequest(req, res, path);
      } else if (path === "/tasks") {
        await this.handleListTasks(req, res);
      } else {
        this.sendError(res, 404, "Not Found");
      }
    } catch (error) {
      console.error("A2A server error:", error);
      this.sendError(res, 500, "Internal Server Error");
    }
  }

  /**
   * Handle agent card request
   */
  private async handleAgentCard(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    if (req.method !== "GET") {
      this.sendError(res, 405, "Method Not Allowed");
      return;
    }

    res.setHeader("Content-Type", "application/json");
    res.writeHead(200);
    res.end(JSON.stringify(this.agentCard));
  }

  /**
   * Handle send message request
   */
  private async handleSendMessage(
    req: http.IncomingMessage, 
    res: http.ServerResponse,
    streaming: boolean
  ): Promise<void> {
    if (req.method !== "POST") {
      this.sendError(res, 405, "Method Not Allowed");
      return;
    }

    const body = await this.readBody(req);
    const request: JSONRPCRequest = JSON.parse(body);

    // Validate request
    if (request.jsonrpc !== "2.0" || !request.method) {
      this.sendJSONRPCError(res, request.id, -32600, "Invalid Request");
      return;
    }

    const { message, configuration, metadata } = request.params || {};
    
    if (!message) {
      this.sendJSONRPCError(res, request.id, -32602, "Invalid params: message required");
      return;
    }

    // Create task
    const task = this.createTask(message, configuration, metadata);
    this.tasks.set(task.id, task);

    if (streaming) {
      // Setup SSE response
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.writeHead(200);

      // Send initial task state
      this.sendSSE(res, { type: "task", task });

      // Process task asynchronously
      this.processTaskStreaming(task, res).catch(error => {
        console.error("Task processing error:", error);
        task.status.state = "failed";
        task.status.message = {
          messageId: this.generateId(),
          role: "agent",
          parts: [{ type: "text", text: String(error) }],
        };
        this.sendSSE(res, { 
          type: "status_update", 
          taskId: task.id, 
          contextId: task.contextId || "", 
          status: task.status 
        });
        res.end();
      });
    } else {
      // Non-streaming: process and respond
      if (configuration?.returnImmediately) {
        // Return immediately with submitted state
        this.sendJSONRPCResponse(res, request.id, { task });
        
        // Process task in background
        this.processTask(task).catch(console.error);
      } else {
        // Wait for task completion
        try {
          const completedTask = await this.processTask(task);
          this.sendJSONRPCResponse(res, request.id, { task: completedTask });
        } catch (error) {
          task.status.state = "failed";
          task.isError = true;
          task.error = String(error);
          this.sendJSONRPCResponse(res, request.id, { task });
        }
      }
    }
  }

  /**
   * Handle task-specific requests (get, cancel, subscribe)
   */
  private async handleTaskRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    path: string
  ): Promise<void> {
    const match = path.match(/^\/tasks\/([^\/]+)(?:\/(\w+))?/);
    if (!match) {
      this.sendError(res, 404, "Not Found");
      return;
    }

    const taskId = match[1];
    const action = match[2];
    const task = this.tasks.get(taskId);

    if (!task) {
      this.sendJSONRPCError(res, null, -32001, "Task not found");
      return;
    }

    if (req.method === "GET" && !action) {
      // Get task
      const query = new URL(req.url || "/", `http://${req.headers.host}`).searchParams;
      const historyLength = query.get("historyLength");
      
      const response: any = { ...task };
      if (historyLength) {
        const limit = parseInt(historyLength, 10);
        if (task.history) {
          response.history = task.history.slice(-limit);
        }
      }

      res.setHeader("Content-Type", "application/json");
      res.writeHead(200);
      res.end(JSON.stringify(response));
    } else if (req.method === "POST" && action === "cancel") {
      // Cancel task
      task.status.state = "canceled";
      this.sendJSONRPCResponse(res, null, task);
    } else if (req.method === "GET" && action === "subscribe") {
      // Subscribe to task updates (SSE)
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.writeHead(200);

      // Add to subscribers
      if (!this.subscribers.has(taskId)) {
        this.subscribers.set(taskId, new Set());
      }
      this.subscribers.get(taskId)!.add(res);

      // Send current state
      this.sendSSE(res, { type: "task", task });

      // Clean up on client disconnect
      req.on("close", () => {
        this.subscribers.get(taskId)?.delete(res);
      });
    } else {
      this.sendError(res, 405, "Method Not Allowed");
    }
  }

  /**
   * Handle list tasks request
   */
  private async handleListTasks(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    if (req.method !== "GET") {
      this.sendError(res, 405, "Method Not Allowed");
      return;
    }

    const query = new URL(req.url || "/", `http://${req.headers.host}`).searchParams;
    const contextId = query.get("contextId");
    const status = query.get("status");
    const pageSize = parseInt(query.get("pageSize") || "50", 10);

    let tasks = Array.from(this.tasks.values());

    if (contextId) {
      tasks = tasks.filter(t => t.contextId === contextId);
    }

    if (status) {
      tasks = tasks.filter(t => t.status.state === status);
    }

    // Sort by most recent first
    tasks.sort((a, b) => {
      const aTime = new Date(a.status.timestamp || 0).getTime();
      const bTime = new Date(b.status.timestamp || 0).getTime();
      return bTime - aTime;
    });

    const response = {
      tasks: tasks.slice(0, pageSize),
      nextPageToken: tasks.length > pageSize ? "more" : "",
      pageSize,
      totalSize: tasks.length,
    };

    res.setHeader("Content-Type", "application/json");
    res.writeHead(200);
    res.end(JSON.stringify(response));
  }

  /**
   * Process a task (non-streaming)
   */
  private async processTask(task: A2ATask): Promise<A2ATask> {
    // Update state to working
    task.status.state = "working";
    task.status.timestamp = new Date().toISOString();

    try {
      // Get the message content
      const message = task.status.message;
      if (!message) {
        throw new Error("No message in task");
      }

      // Convert to pi task format and execute
      const textContent = message.parts
        .filter(p => p.type === "text")
        .map(p => p.text)
        .join("\n");

      // Execute using pi's capabilities
      const result = await this.executePiTask(textContent);

      // Update task with result
      task.status.state = "completed";
      task.status.timestamp = new Date().toISOString();
      
      if (!task.artifacts) {
        task.artifacts = [];
      }
      
      task.artifacts.push({
        artifactId: this.generateId(),
        name: "result",
        parts: [{ type: "text", text: result }],
      });

      // Notify subscribers
      this.notifySubscribers(task);

      return task;
    } catch (error) {
      task.status.state = "failed";
      task.isError = true;
      task.error = String(error);
      task.status.timestamp = new Date().toISOString();
      this.notifySubscribers(task);
      throw error;
    }
  }

  /**
   * Process a task with streaming
   */
  private async processTaskStreaming(task: A2ATask, res: http.ServerResponse): Promise<void> {
    // Update state to working
    task.status.state = "working";
    task.status.timestamp = new Date().toISOString();

    this.sendSSE(res, {
      type: "status_update",
      taskId: task.id,
      contextId: task.contextId || "",
      status: task.status,
    });

    try {
      const message = task.status.message;
      if (!message) {
        throw new Error("No message in task");
      }

      const textContent = message.parts
        .filter(p => p.type === "text")
        .map(p => p.text)
        .join("\n");

      // Execute with progress updates
      const result = await this.executePiTaskWithProgress(
        textContent,
        (progress) => {
          // Send progress update
          const statusUpdate = {
            type: "status_update" as const,
            taskId: task.id,
            contextId: task.contextId || "",
            status: {
              state: "working" as TaskState,
              message: {
                messageId: this.generateId(),
                role: "agent" as const,
                parts: [{ type: "text" as const, text: progress }],
              },
              timestamp: new Date().toISOString(),
            },
          };
          this.sendSSE(res, statusUpdate);
        }
      );

      // Mark as completed
      task.status.state = "completed";
      task.status.timestamp = new Date().toISOString();

      if (!task.artifacts) {
        task.artifacts = [];
      }

      const artifact = {
        artifactId: this.generateId(),
        name: "result",
        parts: [{ type: "text" as const, text: result }],
      };
      
      task.artifacts.push(artifact);

      // Send final updates
      this.sendSSE(res, {
        type: "artifact_update",
        taskId: task.id,
        contextId: task.contextId || "",
        artifact,
        lastChunk: true,
      });

      this.sendSSE(res, {
        type: "status_update",
        taskId: task.id,
        contextId: task.contextId || "",
        status: task.status,
      });

      this.sendSSE(res, "[DONE]");
      res.end();
    } catch (error) {
      task.status.state = "failed";
      task.isError = true;
      task.error = String(error);
      task.status.timestamp = new Date().toISOString();

      this.sendSSE(res, {
        type: "status_update",
        taskId: task.id,
        contextId: task.contextId || "",
        status: task.status,
      });

      res.end();
    }
  }

  /**
   * Execute a task using pi's capabilities
   */
  private async executePiTask(message: string): Promise<string> {
    // This would integrate with pi's actual task execution
    // For now, return a placeholder
    return `[A2A Task Result]\n\nMessage received: ${message}\n\nThis is a placeholder response from the A2A server. In a full implementation, this would execute the task using pi's capabilities.`;
  }

  /**
   * Execute a task with progress updates
   */
  private async executePiTaskWithProgress(
    message: string,
    onProgress: (progress: string) => void
  ): Promise<string> {
    // Simulate progress updates
    onProgress("Analyzing request...");
    await this.delay(500);
    
    onProgress("Processing task...");
    await this.delay(1000);
    
    onProgress("Generating response...");
    await this.delay(500);

    return this.executePiTask(message);
  }

  /**
   * Check if request is authenticated
   */
  private isAuthenticated(req: http.IncomingMessage): boolean {
    // If no security configured, allow all
    if (this.security.defaultScheme === "none") {
      return true;
    }

    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return false;
    }

    switch (this.security.defaultScheme) {
      case "bearer":
        return authHeader === `Bearer ${this.security.bearerToken}`;
      case "apiKey":
        return authHeader === `ApiKey ${this.security.apiKey}`;
      default:
        return false;
    }
  }

  /**
   * Send SSE event
   */
  private sendSSE(res: http.ServerResponse, data: StreamResponse | string): void {
    if (typeof data === "string") {
      res.write(`data: ${data}\n\n`);
    } else {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    }
  }

  /**
   * Notify all subscribers of a task update
   */
  private notifySubscribers(task: A2ATask): void {
    const subscribers = this.subscribers.get(task.id);
    if (!subscribers) return;

    const update: StreamResponse = {
      type: "task",
      task,
    };

    for (const res of subscribers) {
      this.sendSSE(res, update);
    }
  }

  /**
   * Send JSON-RPC response
   */
  private sendJSONRPCResponse(res: http.ServerResponse, id: string | number | null, result: unknown): void {
    const response: JSONRPCResponse = {
      jsonrpc: "2.0",
      id: id ?? 0,
      result,
    };
    
    res.setHeader("Content-Type", "application/json");
    res.writeHead(200);
    res.end(JSON.stringify(response));
  }

  /**
   * Send JSON-RPC error
   */
  private sendJSONRPCError(
    res: http.ServerResponse, 
    id: string | number | null, 
    code: number, 
    message: string,
    data?: unknown
  ): void {
    const response: JSONRPCResponse = {
      jsonrpc: "2.0",
      id: id ?? 0,
      error: { code, message, data },
    };
    
    res.setHeader("Content-Type", "application/json");
    res.writeHead(400);
    res.end(JSON.stringify(response));
  }

  /**
   * Send HTTP error
   */
  private sendError(res: http.ServerResponse, status: number, message: string): void {
    res.setHeader("Content-Type", "application/json");
    res.writeHead(status);
    res.end(JSON.stringify({ error: message }));
  }

  /**
   * Read request body
   */
  private readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let data = "";
      req.on("data", chunk => data += chunk);
      req.on("end", () => resolve(data));
      req.on("error", reject);
    });
  }

  /**
   * Create a new task
   */
  private createTask(message: Message, config?: unknown, metadata?: unknown): A2ATask {
    const now = new Date().toISOString();
    
    return {
      id: this.generateId(),
      contextId: message.contextId || this.generateId(),
      status: {
        state: "submitted",
        message,
        timestamp: now,
      },
      artifacts: [],
      history: [],
      metadata: metadata as Record<string, unknown> || {},
    };
  }

  /**
   * Create default agent card for this pi instance
   */
  private createAgentCard(): AgentCard {
    return {
      name: "pi-coding-agent",
      description: "pi coding agent exposed via A2A protocol",
      url: `http://${this.config.host}:${this.config.port}`,
      version: "1.0.0",
      provider: {
        organization: "pi",
        url: "https://pi.dev",
      },
      capabilities: {
        streaming: true,
        pushNotifications: true,
        extendedAgentCard: true,
      },
      skills: [
        {
          id: "code-generation",
          name: "Code Generation",
          description: "Generate code from natural language descriptions",
          tags: ["code", "generation", "programming"],
          examples: ["Write a Python function to sort a list", "Create a React component"],
        },
        {
          id: "code-analysis",
          name: "Code Analysis",
          description: "Analyze and review code for issues and improvements",
          tags: ["code", "analysis", "review"],
          examples: ["Review this function for bugs", "Explain what this code does"],
        },
        {
          id: "refactoring",
          name: "Refactoring",
          description: "Refactor code to improve structure and readability",
          tags: ["code", "refactoring", "improvement"],
          examples: ["Refactor this to use async/await", "Simplify this code"],
        },
      ],
      defaultInputModes: ["text/plain", "application/json"],
      defaultOutputModes: ["text/plain", "application/json", "text/markdown", "text/code"],
      securitySchemes: {
        bearer: {
          type: "http",
          scheme: "bearer",
          description: "Bearer token authentication",
        },
      },
      securityRequirements: [{ schemes: { bearer: [] } }],
    };
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
