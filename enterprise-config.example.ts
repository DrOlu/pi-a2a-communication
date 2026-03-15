/**
 * Enterprise A2A Configuration Example
 * 
 * This file demonstrates configuration for a production enterprise deployment
 * with multiple teams, security policies, and high availability.
 */

export const enterpriseConfig = {
  // Client configuration for high-throughput environments
  client: {
    // Extended timeout for long-running analysis tasks
    timeout: 120000, // 2 minutes
    
    // Aggressive retry policy for reliability
    retryAttempts: 5,
    retryDelay: 2000,
    
    // High concurrency for parallel operations
    maxConcurrentTasks: 50,
    
    // Enable streaming for all operations
    streamingEnabled: true,
    
    // HTTP/2 for better performance
    http2: true,
    
    // Keep connections alive
    keepAlive: true,
  },

  // Server configuration for production
  server: {
    enabled: true,
    port: process.env.A2A_PORT ? parseInt(process.env.A2A_PORT) : 443,
    host: "0.0.0.0",
    basePath: "/a2a/v1",
    
    // TLS configuration (required for production)
    ssl: {
      cert: process.env.A2A_TLS_CERT || "/etc/ssl/certs/a2a.crt",
      key: process.env.A2A_TLS_KEY || "/etc/ssl/private/a2a.key",
      ca: process.env.A2A_TLS_CA || "/etc/ssl/certs/ca.crt",
    },
    
    // CORS configuration
    cors: {
      origins: [
        "https://team-a.company.com",
        "https://team-b.company.com",
        "https://internal.company.com",
      ],
      methods: ["GET", "POST", "OPTIONS"],
    },
  },

  // Discovery with extended caching
  discovery: {
    cacheEnabled: true,
    // 15 minute cache for stable environments
    cacheTtl: 900000,
    agentCardPath: "/.well-known/agent-card",
    // Extended timeout for slow networks
    timeout: 15000,
  },

  // Security configuration for enterprise
  security: {
    // Use OAuth2 for service-to-service auth
    defaultScheme: "oauth2" as const,
    
    // Always verify SSL in production
    verifySsl: true,
    
    // OAuth2 configuration for service account
    oauth2Config: {
      clientId: process.env.A2A_OAUTH_CLIENT_ID || "",
      clientSecret: process.env.A2A_OAUTH_CLIENT_SECRET || "",
      tokenUrl: process.env.A2A_OAUTH_TOKEN_URL || 
        "https://auth.company.com/oauth2/token",
      scopes: ["a2a:invoke", "a2a:read"],
    },
  },
};

/**
 * Team-specific agent registry
 */
export const teamAgents = {
  // Platform Engineering Team
  platform: [
    {
      name: "infra-validator",
      url: "https://infra-agent.platform.company.com",
      description: "Infrastructure validation and compliance",
    },
    {
      name: "terraform-generator",
      url: "https://tf-agent.platform.company.com",
      description: "Terraform code generation and review",
    },
    {
      name: "k8s-expert",
      url: "https://k8s-agent.platform.company.com",
      description: "Kubernetes configuration and troubleshooting",
    },
  ],

  // Security Team
  security: [
    {
      name: "vulnerability-scanner",
      url: "https://vuln-agent.security.company.com",
      description: "Vulnerability scanning and assessment",
    },
    {
      name: "compliance-checker",
      url: "https://compliance-agent.security.company.com",
      description: "SOC2, GDPR, HIPAA compliance verification",
    },
    {
      name: "threat-analyzer",
      url: "https://threat-agent.security.company.com",
      description: "Threat modeling and analysis",
    },
  ],

  // Development Teams
  engineering: [
    {
      name: "code-reviewer",
      url: "https://reviewer.eng.company.com",
      description: "Code review and best practices",
    },
    {
      name: "test-generator",
      url: "https://test-agent.eng.company.com",
      description: "Test case and scenario generation",
    },
    {
      name: "docs-writer",
      url: "https://docs-agent.eng.company.com",
      description: "Documentation generation and maintenance",
    },
    {
      name: "performance-analyzer",
      url: "https://perf-agent.eng.company.com",
      description: "Performance analysis and optimization",
    },
  ],

  // Data Science Team
  dataScience: [
    {
      name: "ml-validator",
      url: "https://ml-validator.ds.company.com",
      description: "ML model validation and testing",
    },
    {
      name: "data-quality",
      url: "https://dq-agent.ds.company.com",
      description: "Data quality assessment",
    },
    {
      name: "feature-engineer",
      url: "https://feature-agent.ds.company.com",
      description: "Feature engineering assistance",
    },
  ],
};

/**
 * Load balancing configuration
 */
export const loadBalancing = {
  // Strategy: round_robin, least_connections, random, weighted
  strategy: "least_connections" as const,
  
  // Health check configuration
  healthCheck: true,
  healthCheckInterval: 60000, // 1 minute
  
  // Failover configuration
  maxFailures: 3,
  failoverTimeout: 30000,
};

/**
 * Monitoring and observability
 */
export const observability = {
  // Enable metrics collection
  metrics: true,
  
  // Metrics endpoint
  metricsPort: 9090,
  
  // Distributed tracing
  tracing: {
    enabled: true,
    jaegerEndpoint: "https://jaeger.company.com",
    sampleRate: 0.1, // 10% sampling
  },
  
  // Logging
  logging: {
    level: "info",
    format: "json",
    destination: "stdout",
  },
};

/**
 * Common workflow definitions
 */
export const workflows = {
  // Security review pipeline
  securityReview: {
    name: "Security Review Pipeline",
    steps: [
      { agent: "vulnerability-scanner", task: "Scan for known vulnerabilities" },
      { agent: "code-reviewer", task: "Review security aspects of {previous}" },
      { agent: "compliance-checker", task: "Verify compliance requirements for {previous}" },
    ],
  },

  // Code review pipeline
  codeReview: {
    name: "Code Review Pipeline",
    steps: [
      { agent: "code-reviewer", task: "Review code for quality and best practices" },
      { agent: "test-generator", task: "Generate tests based on {previous} recommendations" },
      { agent: "docs-writer", task: "Update documentation based on changes" },
    ],
  },

  // Infrastructure validation
  infraValidation: {
    name: "Infrastructure Validation",
    steps: [
      { agent: "infra-validator", task: "Validate infrastructure configuration" },
      { agent: "security-scanner", task: "Scan {previous} for security issues" },
      { agent: "compliance-checker", task: "Check compliance for {previous}" },
    ],
  },

  // Performance optimization
  performanceOptimization: {
    name: "Performance Optimization",
    steps: [
      { agent: "performance-analyzer", task: "Analyze performance bottlenecks" },
      { agent: "code-reviewer", task: "Review optimization recommendations from {previous}" },
      { agent: "test-generator", task: "Generate performance tests for optimizations" },
    ],
  },
};

/**
 * Environment-specific configurations
 */
export const environments = {
  development: {
    client: {
      timeout: 60000,
      retryAttempts: 2,
      verifySsl: false,
    },
    security: {
      defaultScheme: "none" as const,
    },
  },
  
  staging: {
    client: {
      timeout: 90000,
      retryAttempts: 3,
      verifySsl: true,
    },
    security: {
      defaultScheme: "bearer" as const,
    },
  },
  
  production: enterpriseConfig,
};
