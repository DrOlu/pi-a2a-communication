/**
 * Type definitions for pi-a2a-communication extension
 * 
 * Based on A2A Protocol Specification (a2a-protocol.org)
 */

// ═══════════════════════════════════════════════════════════════════════════
// A2A PROTOCOL TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Agent Card - Self-describing manifest for an A2A agent
 */
export interface AgentCard {
  name: string;
  description: string;
  url: string;
  version: string;
  provider?: {
    organization: string;
    url?: string;
  };
  capabilities: AgentCapabilities;
  skills: AgentSkill[];
  defaultInputModes: string[];
  defaultOutputModes: string[];
  securitySchemes?: Record<string, SecurityScheme>;
  securityRequirements?: SecurityRequirement[];
  documentationUrl?: string;
  iconUrl?: string;
}

/**
 * Agent capabilities
 */
export interface AgentCapabilities {
  streaming?: boolean;
  pushNotifications?: boolean;
  extendedAgentCard?: boolean;
  extensions?: AgentExtension[];
}

/**
 * Agent extension declaration
 */
export interface AgentExtension {
  uri: string;
  description?: string;
  required?: boolean;
  params?: Record<string, unknown>;
}

/**
 * Agent skill definition
 */
export interface AgentSkill {
  id: string;
  name: string;
  description: string;
  tags: string[];
  examples?: string[];
  inputModes?: string[];
  outputModes?: string[];
}

/**
 * Security scheme (discriminated union based on OpenAPI 3.2)
 */
export type SecurityScheme =
  | { type: "apiKey"; location: "query" | "header" | "cookie"; name: string; description?: string }
  | { type: "http"; scheme: string; bearerFormat?: string; description?: string }
  | { type: "oauth2"; flows: OAuthFlows; description?: string }
  | { type: "openIdConnect"; openIdConnectUrl: string; description?: string }
  | { type: "mutualTLS"; description?: string };

/**
 * OAuth flows configuration
 */
export interface OAuthFlows {
  authorizationCode?: {
    authorizationUrl: string;
    tokenUrl: string;
    refreshUrl?: string;
    scopes: Record<string, string>;
    pkceRequired?: boolean;
  };
  clientCredentials?: {
    tokenUrl: string;
    refreshUrl?: string;
    scopes: Record<string, string>;
  };
  deviceCode?: {
    deviceAuthorizationUrl: string;
    tokenUrl: string;
    refreshUrl?: string;
    scopes: Record<string, string>;
  };
}

/**
 * Security requirement
 */
export interface SecurityRequirement {
  schemes: Record<string, string[]>;
}

// ═══════════════════════════════════════════════════════════════════════════
// TASK TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Task state enumeration
 */
export type TaskState =
  | "submitted"
  | "working"
  | "input_required"
  | "auth_required"
  | "completed"
  | "failed"
  | "canceled"
  | "rejected";

/**
 * Task status
 */
export interface TaskStatus {
  state: TaskState;
  message?: Message;
  timestamp?: string;
}

/**
 * A2A Task
 */
export interface A2ATask {
  id: string;
  contextId?: string;
  status: TaskStatus;
  artifacts?: Artifact[];
  history?: Message[];
  metadata?: Record<string, unknown>;
  isError?: boolean;
  error?: string;
}

/**
 * Message in A2A protocol
 */
export interface Message {
  messageId: string;
  contextId?: string;
  taskId?: string;
  role: "user" | "agent";
  parts: Part[];
  metadata?: Record<string, unknown>;
  extensions?: string[];
  referenceTaskIds?: string[];
}

/**
 * Message part (content container)
 */
export type Part =
  | { type: "text"; text: string; metadata?: Record<string, unknown> }
  | { type: "file"; filename?: string; mediaType?: string; raw?: Uint8Array; url?: string; metadata?: Record<string, unknown> }
  | { type: "data"; data: unknown; metadata?: Record<string, unknown> };

/**
 * Artifact (task output)
 */
export interface Artifact {
  artifactId: string;
  name?: string;
  description?: string;
  parts: Part[];
  metadata?: Record<string, unknown>;
  extensions?: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Client configuration
 */
export interface ClientConfig {
  timeout: number;
  retryAttempts: number;
  retryDelay: number;
  maxConcurrentTasks: number;
  streamingEnabled: boolean;
  http2?: boolean;
  keepAlive?: boolean;
}

/**
 * Server configuration
 */
export interface ServerConfig {
  enabled: boolean;
  port: number;
  host: string;
  basePath: string;
  ssl?: {
    cert: string;
    key: string;
    ca?: string;
  };
  cors?: {
    origins: string[];
    methods: string[];
  };
}

/**
 * Discovery configuration
 */
export interface DiscoveryConfig {
  cacheEnabled: boolean;
  cacheTtl: number;
  agentCardPath: string;
  timeout?: number;
}

/**
 * Security configuration
 */
export interface SecurityConfig {
  defaultScheme: "bearer" | "apiKey" | "oauth2" | "mtls" | "none";
  verifySsl: boolean;
  apiKey?: string;
  bearerToken?: string;
  oauth2Config?: {
    clientId: string;
    clientSecret: string;
    tokenUrl: string;
    scopes: string[];
  };
  mtlsConfig?: {
    cert: string;
    key: string;
    ca?: string;
  };
}

/**
 * Complete A2A configuration
 */
export interface A2AConfig {
  client: ClientConfig;
  server: ServerConfig;
  discovery: DiscoveryConfig;
  security: SecurityConfig;
}

// ═══════════════════════════════════════════════════════════════════════════
// REMOTE AGENT TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Remote agent with cached metadata
 */
export interface RemoteAgent extends AgentCard {
  url: string;
  discoveredAt: number;
  lastUsedAt?: number;
  healthStatus?: "healthy" | "unhealthy" | "unknown";
  healthCheckedAt?: number;
}

/**
 * Task options
 */
export interface TaskOptions {
  streaming?: boolean;
  timeout?: number;
  signal?: AbortSignal;
  historyLength?: number;
  returnImmediately?: boolean;
  pushNotificationConfig?: PushNotificationConfig;
  metadata?: Record<string, unknown>;
}

/**
 * Push notification configuration
 */
export interface PushNotificationConfig {
  url: string;
  token?: string;
  authentication?: {
    scheme: string;
    credentials: string;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// JSON-RPC TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * JSON-RPC 2.0 request
 */
export interface JSONRPCRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

/**
 * JSON-RPC 2.0 response
 */
export interface JSONRPCResponse {
  jsonrpc: "2.0";
  id: string | number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

/**
 * JSON-RPC 2.0 error codes
 */
export enum JSONRPCErrorCode {
  ParseError = -32700,
  InvalidRequest = -32600,
  MethodNotFound = -32601,
  InvalidParams = -32602,
  InternalError = -32603,
  ServerError = -32000,
  TaskNotFound = -32001,
  TaskAlreadyExists = -32002,
  UnsupportedOperation = -32003,
}

// ═══════════════════════════════════════════════════════════════════════════
// STREAMING TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Stream response wrapper
 */
export type StreamResponse =
  | { type: "task"; task: A2ATask }
  | { type: "message"; message: Message }
  | { type: "status_update"; taskId: string; contextId: string; status: TaskStatus }
  | { type: "artifact_update"; taskId: string; contextId: string; artifact: Artifact; append?: boolean; lastChunk?: boolean };

/**
 * Task update callback
 */
export type TaskUpdateCallback = (update: Partial<A2ATask>) => void;

// ═══════════════════════════════════════════════════════════════════════════
// INTERNAL TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Cached agent entry
 */
export interface CachedAgent {
  agent: RemoteAgent;
  cachedAt: number;
  etag?: string;
}

/**
 * Pending task entry
 */
export interface PendingTask {
  taskId: string;
  agentUrl: string;
  promise: Promise<A2ATask>;
  abortController: AbortController;
  startTime: number;
  options: TaskOptions;
}

/**
 * Task chain configuration
 */
export interface TaskChainConfig {
  steps: Array<{
    agent: RemoteAgent;
    message: string;
    options?: TaskOptions;
  }>;
  continueOnError?: boolean;
}

/**
 * Parallel task configuration
 */
export interface ParallelTaskConfig {
  agent: RemoteAgent;
  message: string;
  options?: TaskOptions;
}

/**
 * Agent health check result
 */
export interface AgentHealth {
  url: string;
  status: "healthy" | "unhealthy" | "unknown";
  latency: number;
  error?: string;
  checkedAt: number;
}

/**
 * Load balancing strategy
 */
export type LoadBalanceStrategy = "round_robin" | "least_connections" | "random" | "weighted";

/**
 * Agent pool configuration
 */
export interface AgentPool {
  name: string;
  agents: RemoteAgent[];
  strategy: LoadBalanceStrategy;
  healthCheck?: boolean;
  healthCheckInterval?: number;
}
