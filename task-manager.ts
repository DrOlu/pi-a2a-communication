/**
 * Task Manager Module
 * 
 * Orchestrates task execution across multiple A2A agents.
 * Handles single tasks, parallel execution, and chained workflows.
 */

import type { 
  A2AClient 
} from "./a2a-client.js";
import type { 
  RemoteAgent, 
  A2ATask, 
  Message, 
  TaskOptions,
  ParallelTaskConfig,
  TaskChainConfig,
  TaskUpdateCallback,
  PendingTask,
  ClientConfig,
} from "./types.js";

/**
 * Task Manager class
 */
export class TaskManager {
  private client: A2AClient;
  private config: ClientConfig;
  private pendingTasks: Map<string, PendingTask> = new Map();
  private taskAgents: Map<string, string> = new Map(); // taskId -> agentUrl
  private concurrentCount = 0;

  constructor(client: A2AClient, config: ClientConfig) {
    this.client = client;
    this.config = config;
  }

  /**
   * Send a task to a single agent
   */
  async sendTask(
    agent: RemoteAgent,
    message: string,
    options: TaskOptions = {},
    onUpdate?: TaskUpdateCallback
  ): Promise<A2ATask> {
    // Create message
    const msg: Message = {
      messageId: this.generateId(),
      role: "user",
      parts: [{ type: "text", text: message }],
    };

    // Track concurrency
    await this.acquireConcurrency();

    try {
      if (options.streaming !== false && onUpdate) {
        // Streaming with updates
        return await this.client.sendStreamingMessage(agent, msg, onUpdate, options);
      } else {
        // Non-streaming
        const result = await this.client.sendMessage(agent, msg, options);
        
        if ("id" in result && "status" in result) {
          return result as A2ATask;
        } else {
          // Message response, wrap in task-like structure
          return {
            id: this.generateId(),
            status: {
              state: "completed",
              message: result as Message,
              timestamp: new Date().toISOString(),
            },
            artifacts: [],
          };
        }
      }
    } catch (error) {
      return {
        id: this.generateId(),
        status: {
          state: "failed",
          message: {
            messageId: this.generateId(),
            role: "agent",
            parts: [{ type: "text", text: String(error) }],
          },
          timestamp: new Date().toISOString(),
        },
        artifacts: [],
        isError: true,
        error: String(error),
      };
    } finally {
      this.releaseConcurrency();
    }
  }

  /**
   * Send tasks to multiple agents in parallel
   */
  async sendParallelTasks(
    tasks: ParallelTaskConfig[],
    onUpdate?: (update: Partial<A2ATask>, index: number) => void
  ): Promise<A2ATask[]> {
    if (tasks.length === 0) {
      return [];
    }

    // Limit concurrency
    const limit = Math.min(
      this.config.maxConcurrentTasks,
      tasks.length
    );

    const results: A2ATask[] = new Array(tasks.length);
    let index = 0;

    // Worker function
    const worker = async () => {
      while (index < tasks.length) {
        const currentIndex = index++;
        const task = tasks[currentIndex];

        const result = await this.sendTask(
          task.agent,
          task.message,
          { ...task.options, streaming: false },
          onUpdate ? (update) => onUpdate(update, currentIndex) : undefined
        );

        results[currentIndex] = result;
      }
    };

    // Start workers
    const workers = new Array(limit).fill(null).map(() => worker());
    await Promise.all(workers);

    return results;
  }

  /**
   * Execute a chain of tasks sequentially
   */
  async sendChainedTasks(
    config: TaskChainConfig,
    onUpdate?: (update: Partial<A2ATask>, step: number) => void
  ): Promise<{ results: A2ATask[]; finalOutput: string }> {
    const results: A2ATask[] = [];
    let previousOutput = "";

    for (let i = 0; i < config.steps.length; i++) {
      const step = config.steps[i];
      
      // Substitute {previous} placeholder
      const message = step.message.replace(/\{previous\}/g, previousOutput);
      
      // Execute task
      const result = await this.sendTask(
        step.agent,
        message,
        { ...step.options, streaming: false },
        onUpdate ? (update) => onUpdate(update, i) : undefined
      );

      results.push(result);

      // Check for error
      if (result.isError && !config.continueOnError) {
        return { results, finalOutput: result.error || "" };
      }

      // Extract output for next step
      previousOutput = this.extractOutput(result);
    }

    return { results, finalOutput: previousOutput };
  }

  /**
   * Send an async task that returns immediately
   */
  async sendAsyncTask(
    agent: RemoteAgent,
    message: string,
    options: TaskOptions = {}
  ): Promise<string> {
    const msg: Message = {
      messageId: this.generateId(),
      role: "user",
      parts: [{ type: "text", text: message }],
    };

    // Send with returnImmediately
    const result = await this.client.sendMessage(agent, msg, {
      ...options,
      returnImmediately: true,
    });

    if ("id" in result) {
      const task = result as A2ATask;
      
      // Track task
      this.taskAgents.set(task.id, agent.url);
      
      return task.id;
    }

    throw new Error("Unexpected response type for async task");
  }

  /**
   * Get status of a task
   */
  async getTaskStatus(taskId: string, agentUrl?: string): Promise<A2ATask | null> {
    const url = agentUrl || this.taskAgents.get(taskId);
    
    if (!url) {
      return null;
    }

    try {
      // Need to discover agent first
      // This is simplified - in practice, you'd cache the agent
      const agent = { url } as RemoteAgent;
      return await this.client.getTask(agent, taskId);
    } catch {
      return null;
    }
  }

  /**
   * Cancel a task
   */
  async cancelTask(taskId: string, agentUrl?: string): Promise<boolean> {
    const url = agentUrl || this.taskAgents.get(taskId);
    
    if (!url) {
      return false;
    }

    // Check if we have a pending task
    const pending = this.pendingTasks.get(taskId);
    if (pending) {
      pending.abortController.abort();
      this.pendingTasks.delete(taskId);
    }

    try {
      const agent = { url } as RemoteAgent;
      await this.client.cancelTask(agent, taskId);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Subscribe to task updates
   */
  async subscribeToTask(
    taskId: string,
    agentUrl: string,
    onUpdate: TaskUpdateCallback,
    signal?: AbortSignal
  ): Promise<void> {
    const agent = { url: agentUrl } as RemoteAgent;
    await this.client.subscribeToTask(agent, taskId, onUpdate, signal);
  }

  /**
   * Get the agent URL for a task
   */
  getTaskAgent(taskId: string): RemoteAgent | null {
    const url = this.taskAgents.get(taskId);
    if (!url) {
      return null;
    }
    
    return { url } as RemoteAgent;
  }

  /**
   * Wait for a task to complete
   */
  async waitForTask(
    taskId: string,
    agentUrl?: string,
    pollInterval = 2000,
    timeout = 300000
  ): Promise<A2ATask> {
    const startTime = Date.now();
    
    while (true) {
      const task = await this.getTaskStatus(taskId, agentUrl);
      
      if (!task) {
        throw new Error(`Task ${taskId} not found`);
      }

      // Check if terminal state
      const state = task.status.state;
      if (["completed", "failed", "canceled", "rejected"].includes(state)) {
        return task;
      }

      // Check timeout
      if (Date.now() - startTime > timeout) {
        throw new Error(`Timeout waiting for task ${taskId}`);
      }

      // Wait before next poll
      await this.delay(pollInterval);
    }
  }

  /**
   * Cancel all pending tasks
   */
  cancelAll(): void {
    for (const [_, pending] of this.pendingTasks) {
      pending.abortController.abort();
    }
    this.pendingTasks.clear();
    this.client.cancelAll();
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    this.cancelAll();
    this.pendingTasks.clear();
    this.taskAgents.clear();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Acquire concurrency slot
   */
  private async acquireConcurrency(): Promise<void> {
    while (this.concurrentCount >= this.config.maxConcurrentTasks) {
      await this.delay(100);
    }
    this.concurrentCount++;
  }

  /**
   * Release concurrency slot
   */
  private releaseConcurrency(): void {
    this.concurrentCount = Math.max(0, this.concurrentCount - 1);
  }

  /**
   * Extract text output from a task
   */
  private extractOutput(task: A2ATask): string {
    // Try artifacts first
    if (task.artifacts && task.artifacts.length > 0) {
      const artifact = task.artifacts[0];
      const text = artifact.parts
        .filter(p => p.type === "text")
        .map(p => p.text)
        .join("\n");
      if (text) return text;
    }

    // Try status message
    if (task.status?.message?.parts) {
      const text = task.status.message.parts
        .filter(p => p.type === "text")
        .map(p => p.text)
        .join("\n");
      if (text) return text;
    }

    return "";
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
