import type { ModelRole, ModelRoute } from '@/lib/models/contracts';

// Application Configuration
// This file contains all configurable settings for the application

export const appConfig = {
  // Vercel Sandbox Configuration
  vercelSandbox: {
    // Sandbox timeout in minutes
    timeoutMinutes: 15,

    // Convert to milliseconds for Vercel Sandbox API
    get timeoutMs() {
      return this.timeoutMinutes * 60 * 1000;
    },

    // Development server port (Vercel Sandbox typically uses 3000 for Next.js/React)
    devPort: 3000,

    // Time to wait for dev server to be ready (in milliseconds)
    devServerStartupDelay: 7000,

    // Time to wait for CSS rebuild (in milliseconds)
    cssRebuildDelay: 2000,

    // Working directory in sandbox
    workingDirectory: '/app',

    // Default runtime for sandbox
    runtime: 'node22' // Available: node22, python3.13, v0-next-shadcn, cua-ubuntu-xfce
  },

  // E2B Sandbox Configuration
  e2b: {
    // Sandbox timeout in minutes
    timeoutMinutes: 30,

    // Convert to milliseconds for E2B API
    get timeoutMs() {
      return this.timeoutMinutes * 60 * 1000;
    },

    // Development server port (E2B uses 5173 for Vite)
    vitePort: 5173,

    // Time to wait for Vite dev server to be ready (in milliseconds)
    viteStartupDelay: 10000,

    // Working directory in sandbox
    workingDirectory: '/home/user/app',
  },
  
  // AI Model Configuration
  ai: {
    // Default AI model
    defaultModel: 'deepseek-v4-pro',
    
    // Available models
    availableModels: [
      // --- TR4 GPT Models ---
      'gpt-5.4',
      'gpt-5.4-mini',
      'gpt-5.6-sol',
      'gpt-image-1.5',
      'gpt-image-2',
      'gpt-oss-120b-medium',
      'gpt-5.3-codex-spark',
      'gpt-5.5',
      'gpt-5.6-terra',
      'gpt-5.6-luna',
      
      // --- TR4 Claude Models ---
      'claude-sonnet-4-6',
      'claude-opus-4-6-thinking',
      
      // --- TR4 Gemini Models ---
      'gemini-3.1-flash-lite',
      'gemini-pro-agent',
      'gemini-3.5-flash-low',
      'gemini-3.5-flash-extra-low',
      'gemini-3-flash-agent',
      'gemini-3.1-pro-low',
      'gemini-3-flash',
      'gemini-3.1-flash-image',
      
      // --- TR4 / Opencode Kimi Models ---
      'kimi-k2.5',
      'kimi-k2-thinking',
      'kimi-k2.7-code',
      'kimi-k2.7-code-highspeed',
      'kimi-k2',
      'kimi-k2.6',
      
      // --- Opencode Models ---
      'deepseek-v4-pro',
      'deepseek-v4-flash',
      'qwen3.7-max',
      'qwen3.7-plus',
      'qwen3.6-plus',
      'qwen3.5-plus',
      'minimax-m3',
      'minimax-m2.7',
      'minimax-m2.5',
      'glm-5.2',
      'glm-5.1',
      'glm-5',
      'mimo-v2-pro',
      'mimo-v2-omni',
      'mimo-v2.5-pro',
      'mimo-v2.5',
      'hy3-preview',
      
      // --- Other ---
      'codex-auto-review',
      
      // Fallback
      'google/gemini-3-pro-preview'
    ],

    modelRoutes: [
      {
        id: 'intent-tr4', provider: 'tr4', model: 'gpt-5.4-mini',
        capabilities: { vision: false, structuredOutput: true, reasoning: true, toolUse: false },
        timeoutMs: 30_000, fallbacks: ['intent-agentrouter'],
      },
      {
        id: 'intent-agentrouter', provider: 'agentrouter', model: 'gpt-5.4-mini',
        capabilities: { vision: false, structuredOutput: true, reasoning: true, toolUse: false },
        timeoutMs: 30_000, fallbacks: [],
      },
      {
        id: 'vision-tr4', provider: 'tr4', model: 'gemini-3.1-flash-image',
        capabilities: { vision: true, structuredOutput: true, reasoning: true, toolUse: false },
        timeoutMs: 45_000, fallbacks: ['vision-google'],
      },
      {
        id: 'vision-google', provider: 'google', model: 'gemini-3-pro-preview',
        capabilities: { vision: true, structuredOutput: true, reasoning: true, toolUse: false },
        timeoutMs: 45_000, fallbacks: [],
      },
      {
        id: 'design-tr4', provider: 'tr4', model: 'gpt-5.5',
        capabilities: { vision: false, structuredOutput: true, reasoning: true, toolUse: false },
        timeoutMs: 45_000, fallbacks: ['design-opencode'],
      },
      {
        id: 'design-opencode', provider: 'opencode', model: 'deepseek-v4-pro',
        capabilities: { vision: false, structuredOutput: true, reasoning: true, toolUse: false },
        timeoutMs: 45_000, fallbacks: ['cline-code'],
      },
      {
        id: 'opencode-code', provider: 'opencode', model: 'kimi-k2.7-code',
        capabilities: { vision: false, structuredOutput: true, reasoning: true, toolUse: false },
        timeoutMs: 45_000, fallbacks: ['cline-code', 'agentrouter-code'],
      },
      {
        id: 'cline-code', provider: 'cline', model: 'x-ai/grok-code-fast-1',
        capabilities: { vision: false, structuredOutput: true, reasoning: true, toolUse: false },
        timeoutMs: 45_000, fallbacks: ['agentrouter-code'],
      },
      {
        id: 'agentrouter-code', provider: 'agentrouter', model: 'gpt-5.3-codex-spark',
        capabilities: { vision: false, structuredOutput: true, reasoning: true, toolUse: false },
        timeoutMs: 45_000, fallbacks: [],
      },
      {
        id: 'repair-opencode', provider: 'opencode', model: 'qwen3.7-max',
        capabilities: { vision: false, structuredOutput: true, reasoning: true, toolUse: false },
        timeoutMs: 45_000, fallbacks: ['cline-code', 'agentrouter-code'],
      },
    ] satisfies readonly ModelRoute[],

    modelRoleRoutes: {
      intent: 'intent-tr4',
      'vision-planner': 'vision-tr4',
      'design-planner': 'design-tr4',
      coder: 'opencode-code',
      repair: 'repair-opencode',
    } satisfies Record<ModelRole, string>,
    
    // Model display names
    modelDisplayNames: {
      // GPT
      'gpt-5.4': 'GPT-5.4 (TR4)',
      'gpt-5.4-mini': 'GPT-5.4 Mini (TR4)',
      'gpt-5.6-sol': 'GPT-5.6 Sol (TR4)',
      'gpt-image-1.5': 'GPT Image 1.5 (TR4)',
      'gpt-image-2': 'GPT Image 2 (TR4)',
      'gpt-oss-120b-medium': 'GPT OSS 120B (TR4)',
      'gpt-5.3-codex-spark': 'GPT-5.3 Codex Spark (TR4)',
      'gpt-5.5': 'GPT-5.5 (TR4)',
      'gpt-5.6-terra': 'GPT-5.6 Terra (TR4)',
      'gpt-5.6-luna': 'GPT-5.6 Luna (TR4)',
      
      // Claude
      'claude-sonnet-4-6': 'Claude Sonnet 4.6 (TR4)',
      'claude-opus-4-6-thinking': 'Claude Opus 4.6 Thinking (TR4)',
      
      // Gemini
      'gemini-3.1-flash-lite': 'Gemini 3.1 Flash Lite (TR4)',
      'gemini-pro-agent': 'Gemini Pro Agent (TR4)',
      'gemini-3.5-flash-low': 'Gemini 3.5 Flash Low (TR4)',
      'gemini-3.5-flash-extra-low': 'Gemini 3.5 Flash Extra Low (TR4)',
      'gemini-3-flash-agent': 'Gemini 3 Flash Agent (TR4)',
      'gemini-3.1-pro-low': 'Gemini 3.1 Pro Low (TR4)',
      'gemini-3-flash': 'Gemini 3 Flash (TR4)',
      'gemini-3.1-flash-image': 'Gemini 3.1 Flash Image (TR4)',
      
      // Kimi
      'kimi-k2.5': 'Kimi K2.5 (Opencode/TR4)',
      'kimi-k2-thinking': 'Kimi K2 Thinking (Opencode/TR4)',
      'kimi-k2.7-code': 'Kimi K2.7 Code (Opencode/TR4)',
      'kimi-k2.7-code-highspeed': 'Kimi K2.7 Code Highspeed (TR4)',
      'kimi-k2': 'Kimi K2 (Opencode/TR4)',
      'kimi-k2.6': 'Kimi K2.6 (Opencode/TR4)',
      
      // Opencode
      'deepseek-v4-pro': 'DeepSeek V4 Pro (Opencode)',
      'deepseek-v4-flash': 'DeepSeek V4 Flash (Opencode)',
      'qwen3.7-max': 'Qwen 3.7 Max (Opencode)',
      'qwen3.7-plus': 'Qwen 3.7 Plus (Opencode)',
      'qwen3.6-plus': 'Qwen 3.6 Plus (Opencode)',
      'qwen3.5-plus': 'Qwen 3.5 Plus (Opencode)',
      'minimax-m3': 'MiniMax M3 (Opencode)',
      'minimax-m2.7': 'MiniMax M2.7 (Opencode)',
      'minimax-m2.5': 'MiniMax M2.5 (Opencode)',
      'glm-5.2': 'GLM 5.2 (Opencode)',
      'glm-5.1': 'GLM 5.1 (Opencode)',
      'glm-5': 'GLM 5 (Opencode)',
      'mimo-v2-pro': 'Mimo v2 Pro (Opencode)',
      'mimo-v2-omni': 'Mimo v2 Omni (Opencode)',
      'mimo-v2.5-pro': 'Mimo v2.5 Pro (Opencode)',
      'mimo-v2.5': 'Mimo v2.5 (Opencode)',
      'hy3-preview': 'HY3 Preview (Opencode)',
      
      // Other
      'codex-auto-review': 'Codex Auto Review (TR4)',
      'google/gemini-3-pro-preview': 'Gemini 3 Pro (Preview)'
    } as Record<string, string>,
    
    // Model API configuration
    modelApiConfig: {
      'moonshotai/kimi-k2-instruct-0905': {
        provider: 'groq',
        model: 'moonshotai/kimi-k2-instruct-0905'
      }
    },
    
    // Temperature settings for non-reasoning models
    defaultTemperature: 0.7,
    
    // Max tokens for code generation
    maxTokens: 8000,
    
    // Max tokens for truncation recovery
    truncationRecoveryMaxTokens: 4000,
  },
  
  // Code Application Configuration
  codeApplication: {
    // Delay after applying code before refreshing iframe (milliseconds)
    defaultRefreshDelay: 2000,
    
    // Delay when packages are installed (milliseconds)
    packageInstallRefreshDelay: 5000,
    
    // Enable/disable automatic truncation recovery
    enableTruncationRecovery: false, // Disabled - too many false positives
    
    // Maximum number of truncation recovery attempts per file
    maxTruncationRecoveryAttempts: 1,
  },
  
  // UI Configuration
  ui: {
    // Show/hide certain UI elements
    showModelSelector: true,
    showStatusIndicator: true,
    
    // Animation durations (milliseconds)
    animationDuration: 200,
    
    // Toast notification duration (milliseconds)
    toastDuration: 3000,
    
    // Maximum chat messages to keep in memory
    maxChatMessages: 100,
    
    // Maximum recent messages to send as context
    maxRecentMessagesContext: 20,
  },
  
  // Development Configuration
  dev: {
    // Enable debug logging
    enableDebugLogging: true,
    
    // Enable performance monitoring
    enablePerformanceMonitoring: false,
    
    // Log API responses
    logApiResponses: true,
  },
  
  // Package Installation Configuration
  packages: {
    // Use --legacy-peer-deps flag for npm install
    useLegacyPeerDeps: true,
    
    // Package installation timeout (milliseconds)
    installTimeout: 60000,
    
    // Auto-restart Vite after package installation
    autoRestartVite: true,
  },
  
  // File Management Configuration
  files: {
    // Excluded file patterns (files to ignore)
    excludePatterns: [
      'node_modules/**',
      '.git/**',
      '.next/**',
      'dist/**',
      'build/**',
      '*.log',
      '.DS_Store'
    ],
    
    // Maximum file size to read (bytes)
    maxFileSize: 1024 * 1024, // 1MB
    
    // File extensions to treat as text
    textFileExtensions: [
      '.js', '.jsx', '.ts', '.tsx',
      '.css', '.scss', '.sass',
      '.html', '.xml', '.svg',
      '.json', '.yml', '.yaml',
      '.md', '.txt', '.env',
      '.gitignore', '.dockerignore'
    ],
  },
  
  // API Endpoints Configuration (for external services)
  api: {
    // Retry configuration
    maxRetries: 3,
    retryDelay: 1000, // milliseconds
    
    // Request timeout (milliseconds)
    requestTimeout: 30000,
  }
};

// Type-safe config getter
export function getConfig<K extends keyof typeof appConfig>(key: K): typeof appConfig[K] {
  return appConfig[key];
}

// Helper to get nested config values
export function getConfigValue(path: string): any {
  return path.split('.').reduce((obj, key) => obj?.[key], appConfig as any);
}

export default appConfig;
