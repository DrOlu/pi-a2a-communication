# pi-a2a-communication Extension

Enterprise-grade A2A (Agent2Agent) protocol implementation for pi coding agent. Enables multi-node, multi-agent collaboration across diverse enterprise scenarios.

## Overview

This extension transforms pi from a single-node agent into a distributed multi-agent orchestration platform. It implements the [A2A Protocol](https://a2a-protocol.org) specification, allowing pi to:

- **Discover and invoke** remote A2A-compliant agents
- **Expose itself** as an A2A server for other agents to call
- **Execute parallel tasks** across multiple agents
- **Chain tasks** across different agents for complex workflows
- **Manage task lifecycle** with support for streaming and async operations

## Features

### Discovery & Registry
- Automatic agent discovery via Agent Cards (`.well-known/agent-card`)
- Persistent agent registry with health monitoring
- Caching with configurable TTL
- Capability-based agent search

### Task Execution Modes
| Mode | Description | Use Case |
|------|-------------|----------|
| **Single** | Send task to one agent | Direct agent invocation |
| **Parallel** | Send tasks to multiple agents simultaneously | Map-reduce operations, voting systems |
| **Chain** | Sequential execution with output passing | Pipelines, refinement workflows |
| **Async** | Fire-and-forget with polling | Long-running operations |
| **Streaming** | Real-time progress updates | Interactive workflows |

### Security
- Bearer token authentication
- API key authentication
- OAuth2 / OIDC support
- mTLS (mutual TLS)
- SSL verification options

### Enterprise Features
- Configurable timeouts and retries
- Concurrency limiting
- Load balancing ready
- Health check monitoring
- Task persistence

## Installation

```bash
# Create extension directory
mkdir -p ~/.pi/agent/extensions/pi-a2a-communication

# Copy extension files
cp -r /path/to/pi-a2a-communication/* ~/.pi/agent/extensions/pi-a2a-communication/
```

The extension will be automatically loaded on next pi startup.

## Configuration

Configuration is stored in `~/.pi/agent/a2a/config.json` and `~/.pi/agent/a2a/agents.json`.

### Default Configuration

```json
{
  "client": {
    "timeout": 30000,
    "retryAttempts": 3,
    "retryDelay": 1000,
    "maxConcurrentTasks": 10,
    "streamingEnabled": true
  },
  "server": {
    "enabled": false,
    "port": 10000,
    "host": "0.0.0.0",
    "basePath": "/a2a"
  },
  "discovery": {
    "cacheEnabled": true,
    "cacheTtl": 300000,
    "agentCardPath": "/.well-known/agent-card"
  },
  "security": {
    "defaultScheme": "bearer",
    "verifySsl": true
  }
}
```

### Set Configuration

```bash
/a2a-config client.timeout 60000
/a2a-config security.defaultScheme apiKey
/a2a-config server.port 8080
```

## Commands

### Agent Discovery

```bash
# Discover an agent at a URL
/a2a-discover https://agent.example.com

# List all discovered agents
/a2a-agents
```

### Task Execution

```bash
# Send task to a single agent
/a2a-send my-agent "Analyze this codebase for security issues"

# Broadcast to multiple agents in parallel
/a2a-broadcast "Review this PR" --agents https://agent1.com,https://agent2.com,https://agent3.com

# Chain tasks across agents
/a2a-chain scout "find all auth code" | planner "design refactor for {previous}" | worker "implement the changes"

# Get task status
/a2a-status task-123-abc

# Cancel a task
/a2a-cancel task-123-abc
```

### Server Mode

```bash
# Start A2A server
/a2a-server start 8080

# Stop A2A server
/a2a-server stop
```

### Help

```bash
/a2a-help
```

## Usage Examples

### Example 1: Code Review Pipeline

```bash
# Chain: Scout finds code -> Reviewer analyzes -> Worker fixes issues
/a2a-chain code-scout "find all Python files with error handling" \
  | code-reviewer "analyze error handling in {previous} and identify issues" \
  | code-worker "fix the error handling issues identified in {previous}"
```

### Example 2: Parallel Security Audit

```bash
# Send security audit to multiple specialized agents simultaneously
/a2a-broadcast "Audit this codebase for vulnerabilities" \
  --agents https://security-agent1.enterprise.com,https://security-agent2.enterprise.com,https://compliance-agent.enterprise.com
```

### Example 3: Multi-Step Refinement

```bash
# First pass: Generate code
/a2a-send code-generator "Create a REST API for user management"

# Second pass: Review and improve
/a2a-send code-reviewer "Review and improve this API design: <paste previous output>"

# Third pass: Add tests
/a2a-send test-generator "Generate unit tests for this API: <paste improved code>"
```

### Example 4: Distributed Documentation

```bash
# Discover documentation agents
/a2a-discover https://docs-agent.team-a.company.com
/a2a-discover https://docs-agent.team-b.company.com
/a2a-discover https://docs-agent.team-c.company.com

# Request documentation from all teams in parallel
/a2a-broadcast "Generate API documentation for the user service" \
  --agents https://docs-agent.team-a.company.com,https://docs-agent.team-b.company.com,https://docs-agent.team-c.company.com
```

## Tools

The extension registers two tools for programmatic use:

### `a2a_call`

Call a remote A2A agent from within a conversation.

**Parameters:**
- `agent_url` (string, required): URL of the A2A agent
- `message` (string, required): Task message to send
- `streaming` (boolean, optional): Enable streaming responses (default: true)
- `timeout` (number, optional): Timeout in milliseconds (default: 60000)

**Example:**
```json
{
  "tool": "a2a_call",
  "params": {
    "agent_url": "https://security-agent.enterprise.com",
    "message": "Audit this code for SQL injection vulnerabilities",
    "streaming": true,
    "timeout": 120000
  }
}
```

### `a2a_parallel`

Send tasks to multiple A2A agents in parallel.

**Parameters:**
- `tasks` (array, required): Array of tasks with `agent_url` and `message`
- `timeout` (number, optional): Timeout per task in milliseconds (default: 60000)

**Example:**
```json
{
  "tool": "a2a_parallel",
  "params": {
    "tasks": [
      { "agent_url": "https://agent1.com", "message": "Review API" },
      { "agent_url": "https://agent2.com", "message": "Review API" },
      { "agent_url": "https://agent3.com", "message": "Review API" }
    ],
    "timeout": 60000
  }
}
```

## Enterprise Scenarios

### Microservices Architecture

```
┌─────────────┐     A2A      ┌─────────────────┐
│   pi CLI    │ <──────────> │  API Gateway    │
│  (Client)   │              │  (A2A Server)   │
└─────────────┘              └────────┬────────┘
                                     │
                    ┌────────────────┼────────────────┐
                    │                │                │
                    ▼                ▼                ▼
            ┌───────────┐    ┌───────────┐    ┌───────────┐
            │   Auth    │    │  Billing  │    │Analytics  │
            │   Agent   │    │   Agent   │    │   Agent   │
            └───────────┘    └───────────┘    └───────────┘
```

Use case: pi orchestrates calls to multiple microservices through their A2A interfaces.

### Cross-Organization Collaboration

```
┌─────────────────────────────────────────────┐
│          Organization A                      │
│  ┌──────────────┐    ┌──────────────────┐  │
│  │  pi Agent    │<-->│  A2A Gateway     │  │
│  │  (Client)    │    │  (mTLS secured)  │  │
│  └──────────────┘    └──────────────────┘  │
└─────────────────────────────────────────────┘
                      │
                      │ A2A Protocol
                      │ (mutual TLS)
                      │
                      ▼
┌─────────────────────────────────────────────┐
│          Organization B                      │
│  ┌──────────────────┐    ┌──────────────┐  │
│  │  A2A Gateway     │<-->|  Specialized │  │
│  │  (mTLS secured)  │    │  ML Agent    │  │
│  └──────────────────┘    └──────────────┘  │
└─────────────────────────────────────────────┘
```

Use case: Secure cross-organization collaboration with specialized agents.

### Distributed CI/CD Pipeline

```bash
# 1. Code analysis across multiple linters
/a2a-broadcast "Analyze code quality" \
  --agents https://eslint-agent.ci.com,https://pylint-agent.ci.com,https://golangci-agent.ci.com

# 2. Security scanning
/a2a-send security-scanner "Scan for vulnerabilities"

# 3. Test execution in parallel environments
/a2a-broadcast "Run integration tests" \
  --agents https://test-env-1.ci.com,https://test-env-2.ci.com,https://test-env-3.ci.com

# 4. Documentation generation
/a2a-send docs-agent "Generate release notes"
```

### AI Mesh / Agent Swarm

```
                    ┌─────────────┐
                    │  pi Master  │
                    │  Agent      │
                    └──────┬──────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
          ▼                ▼                ▼
   ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
   │ Research     │ │  Code Gen    │ │   Review     │
   │ Agent        │ │   Agent      │ │   Agent      │
   └──────────────┘ └──────────────┘ └──────────────┘
          │                │                │
          │                │                │
          ▼                ▼                ▼
   ┌─────────────────────────────────────────────┐
   │         Results Aggregation                  │
   │              (pi)                            │
   └─────────────────────────────────────────────┘
```

Use case: pi acts as orchestrator for a swarm of specialized agents.

## Security Considerations

### Authentication Methods

1. **Bearer Token** (default)
   - Configure via `/a2a-config security.bearerToken <token>`
   - Sent as `Authorization: Bearer <token>`

2. **API Key**
   - Configure via `/a2a-config security.defaultScheme apiKey`
   - Configure via `/a2a-config security.apiKey <key>`
   - Sent as `Authorization: ApiKey <key>`

3. **OAuth2**
   - Configure client credentials in config
   - Automatic token refresh
   - Supports authorization code, client credentials, device code flows

4. **mTLS**
   - Configure certificates in server.ssl and security.mtlsConfig
   - Mutual authentication between agents

### Network Security

- Always use HTTPS in production
- Configure `security.verifySsl: true` (default)
- Use internal networks or VPNs for sensitive agents
- Consider API gateways for external exposure

## Troubleshooting

### Agent Discovery Fails

```bash
# Check if agent card is accessible
curl https://agent.example.com/.well-known/agent-card

# Increase timeout
/a2a-config discovery.timeout 30000

# Disable SSL verification (dev only)
/a2a-config security.verifySsl false
```

### Tasks Timeout

```bash
# Increase timeout
/a2a-config client.timeout 120000

# Use async mode for long tasks
# (Set returnImmediately: true in options)
```

### Connection Issues

```bash
# Check agent health
/a2a-discover https://agent.example.com
# Check cached agents health in results

# Clear cache
# (Delete ~/.pi/agent/a2a/agents.json)
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    pi-a2a-communication Extension             │
├─────────────────────────────────────────────────────────────┤
│  Commands              Tools               Server            │
│  ├─ a2a-discover       ├─ a2a_call         ├─ HTTP/HTTPS    │
│  ├─ a2a-agents         └─ a2a_parallel     ├─ JSON-RPC      │
│  ├─ a2a-send                               ├─ SSE Streaming │
│  ├─ a2a-broadcast                          └─ Agent Card     │
│  ├─ a2a-chain                                               │
│  ├─ a2a-server                                              │
│  └─ a2a-config                                              │
├─────────────────────────────────────────────────────────────┤
│  Components                                                  │
│  ├─ A2AClient        (HTTP client for A2A protocol)          │
│  ├─ A2AServer        (HTTP server exposing pi as A2A agent) │
│  ├─ AgentDiscovery   (Agent card discovery & caching)         │
│  ├─ TaskManager      (Task orchestration & lifecycle)         │
│  └─ ConfigManager    (Configuration persistence)              │
└─────────────────────────────────────────────────────────────┘
```

## A2A Protocol Compliance

This extension implements the A2A Protocol v1.0 specification:

- ✅ Agent Card discovery (`/.well-known/agent-card`)
- ✅ JSON-RPC 2.0 over HTTP
- ✅ SendMessage (sync & async)
- ✅ SendStreamingMessage (SSE)
- ✅ Task lifecycle management
- ✅ Task cancellation
- ✅ Task subscription (SSE)
- ✅ Push notifications (client)
- ✅ Security schemes (Bearer, API Key, OAuth2, mTLS)

## Contributing

Contributions are welcome! Please ensure:

1. Code follows TypeScript best practices
2. All new features include error handling
3. Documentation is updated
4. Changes are backward compatible

## License

MIT License - Same as pi coding agent

## See Also

- [A2A Protocol Specification](https://a2a-protocol.org/latest/specification/)
- [A2A GitHub Repository](https://github.com/a2aproject/A2A)
- [pi Coding Agent Documentation](https://pi.dev/docs)
