/**
 * Configuration Manager for pi-a2a-communication
 * 
 * Handles loading, saving, and managing A2A configuration
 * including remote agent registries and security settings.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { A2AConfig, RemoteAgent, SecurityScheme } from "./types.js";

/**
 * Default configuration values
 */
const DEFAULTS: A2AConfig = {
  client: {
    timeout: 30000,
    retryAttempts: 3,
    retryDelay: 1000,
    maxConcurrentTasks: 10,
    streamingEnabled: true,
    http2: false,
    keepAlive: true,
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
    timeout: 10000,
  },
  security: {
    defaultScheme: "bearer",
    verifySsl: true,
  },
};

/**
 * Configuration file path
 */
function getConfigDir(): string {
  const configDir = path.join(os.homedir(), ".pi", "agent", "a2a");
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  return configDir;
}

function getConfigPath(): string {
  return path.join(getConfigDir(), "config.json");
}

function getAgentsPath(): string {
  return path.join(getConfigDir(), "agents.json");
}

/**
 * Configuration Manager class
 */
export class ConfigManager {
  private config: A2AConfig;
  private remoteAgents: Map<string, RemoteAgent> = new Map();
  private configPath: string;
  private agentsPath: string;

  constructor(defaults?: Partial<A2AConfig>) {
    this.configPath = getConfigPath();
    this.agentsPath = getAgentsPath();
    
    // Merge defaults with provided defaults
    this.config = this.deepMerge(DEFAULTS, defaults || {});
    
    // Load from disk
    this.load();
  }

  /**
   * Get current configuration
   */
  getConfig(): A2AConfig {
    return this.config;
  }

  /**
   * Update configuration with partial updates
   */
  updateConfig(updates: Partial<A2AConfig>): void {
    this.config = this.deepMerge(this.config, updates);
    this.save();
  }

  /**
   * Set a specific configuration value by path
   */
  set(path: string, value: string | number | boolean): void {
    const parts = path.split(".");
    let current: any = this.config;
    
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!(part in current)) {
        current[part] = {};
      }
      current = current[part];
    }
    
    const lastPart = parts[parts.length - 1];
    
    // Parse value
    let parsedValue: string | number | boolean = value;
    if (typeof value === "string") {
      if (value.toLowerCase() === "true") parsedValue = true;
      else if (value.toLowerCase() === "false") parsedValue = false;
      else if (!isNaN(Number(value))) parsedValue = Number(value);
    }
    
    current[lastPart] = parsedValue;
    this.save();
  }

  /**
   * Get a specific configuration value by path
   */
  get(path: string): unknown {
    const parts = path.split(".");
    let current: any = this.config;
    
    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      current = current[part];
    }
    
    return current;
  }

  /**
   * Add a remote agent to the registry
   */
  addRemoteAgent(url: string, agent: Omit<RemoteAgent, "url" | "discoveredAt">): void {
    const remoteAgent: RemoteAgent = {
      ...agent,
      url,
      discoveredAt: Date.now(),
    };
    
    this.remoteAgents.set(url, remoteAgent);
    this.saveAgents();
  }

  /**
   * Get a remote agent by URL or name
   */
  getRemoteAgent(urlOrName: string): RemoteAgent | null {
    // Try exact URL match first
    if (this.remoteAgents.has(urlOrName)) {
      const agent = this.remoteAgents.get(urlOrName)!;
      agent.lastUsedAt = Date.now();
      return agent;
    }
    
    // Try name match
    for (const agent of this.remoteAgents.values()) {
      if (agent.name === urlOrName || agent.name.toLowerCase().replace(/\s+/g, "-") === urlOrName.toLowerCase()) {
        agent.lastUsedAt = Date.now();
        return agent;
      }
    }
    
    return null;
  }

  /**
   * Get all remote agents
   */
  getRemoteAgents(): RemoteAgent[] {
    return Array.from(this.remoteAgents.values());
  }

  /**
   * Remove a remote agent
   */
  removeRemoteAgent(url: string): boolean {
    const existed = this.remoteAgents.has(url);
    this.remoteAgents.delete(url);
    if (existed) {
      this.saveAgents();
    }
    return existed;
  }

  /**
   * Update agent health status
   */
  updateAgentHealth(url: string, status: RemoteAgent["healthStatus"]): void {
    const agent = this.remoteAgents.get(url);
    if (agent) {
      agent.healthStatus = status;
      agent.healthCheckedAt = Date.now();
      this.saveAgents();
    }
  }

  /**
   * Get security scheme for an agent
   */
  getSecurityScheme(agent: RemoteAgent): SecurityScheme | null {
    const requirements = agent.securityRequirements;
    const schemes = agent.securitySchemes;
    
    if (!requirements || requirements.length === 0 || !schemes) {
      return null;
    }

    // Use the first requirement's first scheme
    const firstReq = requirements[0];
    const schemeName = Object.keys(firstReq.schemes)[0];
    
    if (schemeName && schemes[schemeName]) {
      return schemes[schemeName];
    }
    
    return null;
  }

  /**
   * Load configuration from disk
   */
  private load(): void {
    try {
      // Load config
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, "utf-8");
        const loaded = JSON.parse(data);
        this.config = this.deepMerge(this.config, loaded);
      }
      
      // Load agents
      if (fs.existsSync(this.agentsPath)) {
        const data = fs.readFileSync(this.agentsPath, "utf-8");
        const agents = JSON.parse(data) as RemoteAgent[];
        this.remoteAgents.clear();
        for (const agent of agents) {
          this.remoteAgents.set(agent.url, agent);
        }
      }
    } catch (error) {
      console.error("Failed to load A2A configuration:", error);
    }
  }

  /**
   * Save configuration to disk
   */
  private save(): void {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
    } catch (error) {
      console.error("Failed to save A2A configuration:", error);
    }
  }

  /**
   * Save agents registry to disk
   */
  private saveAgents(): void {
    try {
      const agents = Array.from(this.remoteAgents.values());
      fs.writeFileSync(this.agentsPath, JSON.stringify(agents, null, 2));
    } catch (error) {
      console.error("Failed to save A2A agents:", error);
    }
  }

  /**
   * Deep merge two objects
   */
  private deepMerge<T>(target: T, source: Partial<T>): T {
    const result: any = { ...target };
    
    for (const key in source) {
      if (source[key] !== null && typeof source[key] === "object" && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(result[key] || {}, source[key] as any);
      } else if (source[key] !== undefined) {
        result[key] = source[key];
      }
    }
    
    return result;
  }

  /**
   * Get the configuration directory path
   */
  getConfigDir(): string {
    return path.dirname(this.configPath);
  }

  /**
   * Create a default agent card for this pi instance
   */
  createDefaultAgentCard(name: string, description: string, skills: string[]): Record<string, unknown> {
    return {
      name,
      description,
      version: "1.0.0",
      provider: {
        organization: "pi-a2a",
        url: "https://pi.dev",
      },
      capabilities: {
        streaming: true,
        pushNotifications: true,
        extendedAgentCard: true,
      },
      skills: skills.map((skill, i) => ({
        id: `skill-${i + 1}`,
        name: skill,
        description: `${skill} capability`,
        tags: [skill.toLowerCase().replace(/\s+/g, "-")],
      })),
      defaultInputModes: ["text/plain", "application/json"],
      defaultOutputModes: ["text/plain", "application/json", "text/markdown"],
    };
  }
}
