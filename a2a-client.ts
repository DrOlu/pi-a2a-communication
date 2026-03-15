/**
 * A2A Client Implementation
 * 
 * Handles communication with remote A2A agents via HTTP/JSON-RPC.
 * Supports synchronous, streaming, and asynchronous operations.
 */

import * as https from "node:https";
import * as http from "node:http";
import { URL } from "node:url";
import type { 
  RemoteAgent, 
  A2ATask, 
  Message, 
  TaskOptions, 
  JSONRPCRequest, 
  JSONRPCResponse,
  StreamResponse,
  TaskUpdateCallback,
  ClientConfig,
  SecurityConfig,
  AgentCard,
} from "./types.js";

/**
 * A2A Client class
 */
export class A2AClient {
  private config: ClientConfig;
  private security: SecurityConfig;
  private pendingStreams: Map<string, AbortController> = new Map();

  constructor(config: ClientConfig, security: SecurityConfig) {
    this.config = config;
    this.security = security;
  }

  /**
   * Send a message to an agent (non-streaming)
   */
  async sendMessage(
    agent: RemoteAgent,
    message: Message,
    options: TaskOptions = {}
  ): Promise<A2ATask | Message> {
    const request = this.createRequest("sendMessage", {
      message,
      configuration: {
        acceptedOutputModes: agent.defaultOutputModes || ["text/plain", "application/json"],
        historyLength: options.historyLength ?? 10,
        returnImmediately: options.returnImmediately ?? false,
        pushNotificationConfig: options.pushNotificationConfig,
      },
      metadata: options.metadata,
    });

    const response = await this.sendRequest(agent, request, options);
    
    if (response.error) {
      throw new Error(`A2A error ${response.error.code}: ${response.error.message}`);
    }

    const result = response.result as { task?: A2ATask; message?: Message };
    
    if (result.task) {
      return result.task;
    } else if (result.message) {
      return result.message;
    }
    
    throw new Error("Invalid response: no task or message");
  }

  /**
   * Send a streaming message to an agent
   */
  async sendStreamingMessage(
    agent: RemoteAgent,
    message: Message,
    onUpdate: TaskUpdateCallback,
    options: TaskOptions = {}
  ): Promise<A2ATask> {
    const request = this.createRequest("sendStreamingMessage", {
      message,
      configuration: {
        acceptedOutputModes: agent.defaultOutputModes || ["text/plain", "application/json"],
        historyLength: options.historyLength ?? 10,
        returnImmediately: false,
        pushNotificationConfig: options.pushNotificationConfig,
      },
      metadata: options.metadata,
    });

    return new Promise((resolve, reject) => {
      const abortController = new AbortController();
      const requestId = request.id as string;
      this.pendingStreams.set(requestId, abortController);

      // Add abort signal listener
      if (options.signal) {
        options.signal.addEventListener("abort", () => {
          abortController.abort();
          this.pendingStreams.delete(requestId);
          reject(new Error("Aborted"));
        });
      }

      this.sendStreamingRequest(agent, request, abortController.signal, (update) => {
        if (update.type === "task") {
          // Task complete
          this.pendingStreams.delete(requestId);
          resolve(update.task);
        } else if (update.type === "status_update") {
          // Status update
          onUpdate({
            id: update.taskId,
            contextId: update.contextId,
            status: update.status,
          });
        } else if (update.type === "artifact_update") {
          // Artifact update
          onUpdate({
            id: update.taskId,
            contextId: update.contextId,
            artifacts: [update.artifact],
          });
        } else if (update.type === "message") {
          // Message received
          onUpdate({
            status: {
              state: "working",
              message: update.message,
            },
          });
        }
      }).catch((error) => {
        this.pendingStreams.delete(requestId);
        reject(error);
      });
    });
  }

  /**
   * Get task status
   */
  async getTask(agent: RemoteAgent, taskId: string, historyLength?: number): Promise<A2ATask> {
    const request = this.createRequest("getTask", {
      id: taskId,
      historyLength: historyLength ?? 10,
    });

    const response = await this.sendRequest(agent, request);
    
    if (response.error) {
      throw new Error(`A2A error ${response.error.code}: ${response.error.message}`);
    }

    return response.result as A2ATask;
  }

  /**
   * Cancel a task
   */
  async cancelTask(agent: RemoteAgent, taskId: string): Promise<A2ATask> {
    const request = this.createRequest("cancelTask", {
      id: taskId,
    });

    const response = await this.sendRequest(agent, request);
    
    if (response.error) {
      throw new Error(`A2A error ${response.error.code}: ${response.error.message}`);
    }

    return response.result as A2ATask;
  }

  /**
   * Subscribe to task updates (SSE)
   */
  async subscribeToTask(
    agent: RemoteAgent,
    taskId: string,
    onUpdate: TaskUpdateCallback,
    signal?: AbortSignal
  ): Promise<void> {
    const request = this.createRequest("subscribeToTask", {
      id: taskId,
    });

    return new Promise((resolve, reject) => {
      const abortController = new AbortController();
      
      if (signal) {
        signal.addEventListener("abort", () => {
          abortController.abort();
          resolve();
        });
      }

      this.sendStreamingRequest(agent, request, abortController.signal, (update) => {
        if (update.type === "status_update") {
          onUpdate({
            id: update.taskId,
            contextId: update.contextId,
            status: update.status,
          });
          
          // Resolve on terminal state
          const state = update.status.state;
          if (["completed", "failed", "canceled", "rejected"].includes(state)) {
            resolve();
          }
        } else if (update.type === "artifact_update") {
          onUpdate({
            id: update.taskId,
            contextId: update.contextId,
            artifacts: [update.artifact],
          });
        }
      }).catch(reject);
    });
  }

  /**
   * Discover agent at URL (fetch Agent Card)
   */
  async discoverAgent(url: string): Promise<AgentCard & { url: string }> {
    const agentUrl = new URL(url);
    const cardPath = "/.well-known/agent-card";
    const fullUrl = `${agentUrl.origin}${cardPath}`;
    
    const response = await this.httpGet(fullUrl);
    
    if (!response.ok) {
      throw new Error(`Failed to discover agent: ${response.status} ${response.statusText}`);
    }

    const card = await response.json();
    
    return {
      ...card,
      url,
    };
  }

  /**
   * Cancel all pending requests
   */
  cancelAll(): void {
    for (const [id, controller] of this.pendingStreams) {
      controller.abort();
      this.pendingStreams.delete(id);
    }
  }

  /**
   * Get health status of an agent
   */
  async checkHealth(agent: RemoteAgent): Promise<{ healthy: boolean; latency: number; error?: string }> {
    const startTime = Date.now();
    
    try {
      // Try to get the agent card (lightweight health check)
      await this.discoverAgent(agent.url);
      return {
        healthy: true,
        latency: Date.now() - startTime,
      };
    } catch (error) {
      return {
        healthy: false,
        latency: Date.now() - startTime,
        error: String(error),
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Create a JSON-RPC request
   */
  private createRequest(method: string, params: Record<string, unknown>): JSONRPCRequest {
    return {
      jsonrpc: "2.0",
      id: this.generateId(),
      method,
      params,
    };
  }

  /**
   * Generate a unique request ID
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Send a JSON-RPC request (non-streaming)
   */
  private async sendRequest(
    agent: RemoteAgent,
    request: JSONRPCRequest,
    options: TaskOptions = {},
    attempt = 0
  ): Promise<JSONRPCResponse> {
    const url = this.getA2AEndpoint(agent);
    const body = JSON.stringify(request);
    
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Accept": "application/json",
    };

    // Add authentication
    const authHeader = this.getAuthHeader(agent);
    if (authHeader) {
      headers["Authorization"] = authHeader;
    }

    try {
      const response = await this.httpPost(url, body, headers, options.timeout || this.config.timeout);
      
      if (!response.ok) {
        // Retry on 5xx errors
        if (response.status >= 500 && attempt < this.config.retryAttempts) {
          await this.delay(this.config.retryDelay * Math.pow(2, attempt));
          return this.sendRequest(agent, request, options, attempt + 1);
        }
        
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      // Retry on network errors
      if (attempt < this.config.retryAttempts) {
        await this.delay(this.config.retryDelay * Math.pow(2, attempt));
        return this.sendRequest(agent, request, options, attempt + 1);
      }
      
      throw error;
    }
  }

  /**
   * Send a streaming JSON-RPC request (SSE)
   */
  private async sendStreamingRequest(
    agent: RemoteAgent,
    request: JSONRPCRequest,
    signal: AbortSignal,
    onUpdate: (update: StreamResponse) => void
  ): Promise<void> {
    const url = this.getA2AEndpoint(agent);
    const body = JSON.stringify(request);
    
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Accept": "text/event-stream",
    };

    const authHeader = this.getAuthHeader(agent);
    if (authHeader) {
      headers["Authorization"] = authHeader;
    }

    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const isHttps = urlObj.protocol === "https:";
      const client = isHttps ? https : http;
      
      const req = client.request(
        url,
        {
          method: "POST",
          headers,
          timeout: this.config.timeout,
        },
        (res) => {
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode}`));
            return;
          }

          let buffer = "";
          
          res.on("data", (chunk: Buffer) => {
            buffer += chunk.toString();
            
            // Process SSE events
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";
            
            for (const line of lines) {
              if (line.startsWith("data: ")) {
                const data = line.substring(6);
                if (data === "[DONE]") {
                  resolve();
                  return;
                }
                
                try {
                  const update = JSON.parse(data) as StreamResponse;
                  onUpdate(update);
                } catch (e) {
                  // Ignore parse errors for partial data
                }
              }
            }
          });
          
          res.on("end", () => resolve());
          res.on("error", reject);
        }
      );

      req.on("error", reject);
      req.on("timeout", () => {
        req.destroy();
        reject(new Error("Request timeout"));
      });

      // Handle abort
      signal.addEventListener("abort", () => {
        req.destroy();
        reject(new Error("Aborted"));
      });

      req.write(body);
      req.end();
    });
  }

  /**
   * Get the A2A endpoint URL from agent card
   */
  private getA2AEndpoint(agent: RemoteAgent): string {
    // Use the agent's URL directly or look for interface in capabilities
    return agent.url;
  }

  /**
   * Get authentication header
   */
  private getAuthHeader(agent: RemoteAgent): string | null {
    // Check agent-specific security requirements
    if (agent.securitySchemes && agent.securityRequirements) {
      for (const req of agent.securityRequirements) {
        for (const [schemeName, _] of Object.entries(req.schemes)) {
          const scheme = agent.securitySchemes[schemeName];
          if (scheme) {
            return this.buildAuthHeader(scheme);
          }
        }
      }
    }
    
    // Fall back to global security config
    return this.buildGlobalAuthHeader();
  }

  /**
   * Build authentication header from scheme
   */
  private buildAuthHeader(scheme: { type: string; scheme?: string; name?: string; location?: string }): string | null {
    switch (scheme.type) {
      case "http":
        if (scheme.scheme?.toLowerCase() === "bearer") {
          return `Bearer ${this.security.bearerToken || ""}`;
        }
        break;
      case "apiKey":
        if (scheme.location === "header") {
          return `${scheme.name} ${this.security.apiKey || ""}`;
        }
        break;
    }
    return null;
  }

  /**
   * Build authentication header from global config
   */
  private buildGlobalAuthHeader(): string | null {
    switch (this.security.defaultScheme) {
      case "bearer":
        return this.security.bearerToken ? `Bearer ${this.security.bearerToken}` : null;
      case "apiKey":
        return this.security.apiKey ? `ApiKey ${this.security.apiKey}` : null;
      default:
        return null;
    }
  }

  /**
   * HTTP POST helper
   */
  private httpPost(
    url: string,
    body: string,
    headers: Record<string, string>,
    timeout: number
  ): Promise<{ ok: boolean; status: number; statusText: string; json: () => Promise<any> }> {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const isHttps = urlObj.protocol === "https:";
      const client = isHttps ? https : http;

      const options: https.RequestOptions = {
        hostname: urlObj.hostname,
        port: urlObj.port || (isHttps ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method: "POST",
        headers,
        timeout,
        rejectUnauthorized: this.security.verifySsl,
      };

      const req = client.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => data += chunk);
        res.on("end", () => {
          resolve({
            ok: res.statusCode! >= 200 && res.statusCode! < 300,
            status: res.statusCode!,
            statusText: res.statusMessage || "",
            json: async () => JSON.parse(data),
          });
        });
      });

      req.on("error", reject);
      req.on("timeout", () => {
        req.destroy();
        reject(new Error("Request timeout"));
      });

      req.write(body);
      req.end();
    });
  }

  /**
   * HTTP GET helper
   */
  private httpGet(url: string): Promise<{ ok: boolean; status: number; statusText: string; json: () => Promise<any> }> {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const isHttps = urlObj.protocol === "https:";
      const client = isHttps ? https : http;

      const options: https.RequestOptions = {
        hostname: urlObj.hostname,
        port: urlObj.port || (isHttps ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method: "GET",
        timeout: 10000,
        rejectUnauthorized: this.security.verifySsl,
      };

      const req = client.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => data += chunk);
        res.on("end", () => {
          resolve({
            ok: res.statusCode! >= 200 && res.statusCode! < 300,
            status: res.statusCode!,
            statusText: res.statusMessage || "",
            json: async () => JSON.parse(data),
          });
        });
      });

      req.on("error", reject);
      req.on("timeout", () => {
        req.destroy();
        reject(new Error("Request timeout"));
      });

      req.end();
    });
  }

  /**
   * Delay helper for retries
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
