# pi.dev/packages Gallery Submission

## Package Information

**Name:** pi-a2a-communication  
**Version:** 1.0.1  
**Category:** Communication / Orchestration  
**License:** MIT  
**Author:** pi-extensions  

## Description

Enterprise-grade A2A (Agent2Agent) protocol implementation for pi coding agent. Enables multi-node, multi-agent collaboration across enterprise environments.

Transform pi from a single-node tool into a distributed multi-agent orchestration platform compatible with any A2A-compliant agent.

## Installation

```bash
# Via npm (recommended)
pi install npm:pi-a2a-communication

# Via git
pi install git:github.com/DrOlu/pi-a2a-communication

# Temporary try
pi -e npm:pi-a2a-communication
```

## Features

### Agent Discovery & Registry
- Automatic agent discovery via `.well-known/agent-card`
- Persistent agent registry with health monitoring
- Capability-based agent search

### Task Execution Modes
- **Single** - Direct agent invocation
- **Parallel** - Map-reduce operations, voting systems
- **Chain** - Pipelines, refinement workflows
- **Async** - Long-running operations
- **Streaming** - Real-time progress updates

### Enterprise Security
- Bearer token authentication
- API key authentication
- OAuth2 / OIDC support
- mTLS (mutual TLS)

### Commands
```
/a2a-discover <url>              # Discover agent
/a2a-agents                      # List agents
/a2a-send <agent> <message>       # Send task
/a2a-broadcast <msg> --agents     # Parallel execution
/a2a-chain <agent1> <task1> |... # Sequential workflow
/a2a-status <task-id>            # Get status
/a2a-cancel <task-id>            # Cancel task
/a2a-server start|stop          # Server mode
/a2a-config <key> <value>        # Configure
/a2a-help                        # Show help
```

### Programmatic Tools
- `a2a_call` - Call remote A2A agent
- `a2a_parallel` - Parallel agent execution

## Use Cases

1. **Microservices Orchestration** - pi as client to service mesh
2. **Cross-Organization Collaboration** - Secure agent-to-agent across companies
3. **Distributed CI/CD** - Parallel testing, security scanning, documentation
4. **AI Mesh / Agent Swarms** - pi orchestrating specialized agent clusters
5. **Multi-Team DevOps** - Platform, Security, Engineering, Data Science teams

## Compatibility

- **pi:** >= 1.0.0
- **Node.js:** >= 18.0.0
- **A2A Protocol:** v1.0

## Links

- **GitHub:** https://github.com/DrOlu/pi-a2a-communication
- **npm:** https://www.npmjs.com/package/pi-a2a-communication
- **Documentation:** https://github.com/DrOlu/pi-a2a-communication/blob/main/README.md
- **Issues:** https://github.com/DrOlu/pi-a2a-communication/issues

## Gallery Metadata

```json
{
  "name": "pi-a2a-communication",
  "version": "1.0.1",
  "keywords": ["pi-package", "a2a", "multi-agent", "enterprise"],
  "author": "pi-extensions",
  "description": "Enterprise-grade A2A protocol implementation for multi-agent collaboration",
  "license": "MIT",
  "repository": "https://github.com/DrOlu/pi-a2a-communication",
  "homepage": "https://github.com/DrOlu/pi-a2a-communication#readme",
  "npm": "https://www.npmjs.com/package/pi-a2a-communication",
  "category": "communication",
  "commands": [
    "/a2a-discover",
    "/a2a-agents",
    "/a2a-send",
    "/a2a-broadcast",
    "/a2a-chain",
    "/a2a-status",
    "/a2a-cancel",
    "/a2a-server",
    "/a2a-config",
    "/a2a-help"
  ],
  "tools": ["a2a_call", "a2a_parallel"],
  "installation": "pi install npm:pi-a2a-communication"
}
```

## Verification

Package has been:
- ✅ Published to npm
- ✅ Built with TypeScript declarations
- ✅ Tested with pi extension system
- ✅ Includes proper pi manifest
- ✅ Includes README documentation
- ✅ MIT licensed

---

**Submitted by:** DrOlu  
**Date:** 2026-03-15  
**Status:** Ready for gallery inclusion
