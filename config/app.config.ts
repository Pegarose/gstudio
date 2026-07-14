import type { ModelRole, ModelRoute } from '@/lib/models/contracts';

// Application Configuration
// This file contains all configurable settings for the application

const teamModelDefaults = {
  planning: "auto/best-reasoning",
  coder: "auto/best-coding",
  qa: "auto/best-reasoning",
} as const;

const teamModelOptions = {
  planning: [
    "auto/best-reasoning",
    "auto/pro-reasoning",
    "auto/best-fast",
  ],
  coder: [
    "auto/best-coding",
    "auto/pro-coding",
    "auto/best-coding-fast",
  ],
  qa: [
    "auto/best-reasoning",
    "auto/best-coding",
    "auto/best-fast",
  ],
} as const;

const availableModels: string[] = [...new Set(Object.values(teamModelOptions).flat())];

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
    defaultModel: teamModelDefaults.coder,
    
    // Available models
    availableModels,

    teamModelDefaults,
    teamModelOptions,

    modelRoutes: [
      {
        id: 'intent-omniroute', provider: 'omniroute', model: 'auto/best-fast',
        capabilities: { vision: false, structuredOutput: true, reasoning: true, toolUse: false },
        timeoutMs: 30_000, fallbacks: [],
      },
      {
        id: 'vision-omniroute', provider: 'omniroute', model: 'auto/best-vision',
        capabilities: { vision: true, structuredOutput: true, reasoning: true, toolUse: false },
        timeoutMs: 45_000, fallbacks: [],
      },
      {
        id: 'design-omniroute', provider: 'omniroute', model: 'auto/best-reasoning',
        capabilities: { vision: false, structuredOutput: true, reasoning: true, toolUse: false },
        timeoutMs: 45_000, fallbacks: [],
      },
      {
        id: 'planning-omniroute', provider: 'omniroute', model: 'auto/best-reasoning',
        capabilities: { vision: false, structuredOutput: true, reasoning: true, toolUse: false },
        timeoutMs: 60_000, fallbacks: [],
      },
      {
        id: 'coder-omniroute', provider: 'omniroute', model: 'auto/best-coding',
        capabilities: { vision: false, structuredOutput: true, reasoning: true, toolUse: false },
        timeoutMs: 180_000, fallbacks: [],
      },
      {
        id: 'qa-omniroute', provider: 'omniroute', model: 'auto/best-reasoning',
        capabilities: { vision: false, structuredOutput: true, reasoning: true, toolUse: false },
        timeoutMs: 90_000, fallbacks: [],
      },
      {
        id: 'repair-omniroute', provider: 'omniroute', model: 'auto/best-coding',
        capabilities: { vision: false, structuredOutput: true, reasoning: true, toolUse: false },
        timeoutMs: 180_000, fallbacks: [],
      },
    ] satisfies readonly ModelRoute[],

    modelRoleRoutes: {
      intent: 'intent-omniroute',
      'vision-planner': 'vision-omniroute',
      'design-planner': 'design-omniroute',
      planning: 'planning-omniroute',
      coder: 'coder-omniroute',
      qa: 'qa-omniroute',
      repair: 'repair-omniroute',
    } satisfies Record<ModelRole, string>,
    
    // Model display names
    modelDisplayNames: {
      'auto/best-fast': 'OmniRoute · Best Fast',
      'auto/best-reasoning': 'OmniRoute · Best Reasoning',
      'auto/pro-reasoning': 'OmniRoute · Pro Reasoning',
      'auto/best-coding': 'OmniRoute · Best Coding',
      'auto/pro-coding': 'OmniRoute · Pro Coding',
      'auto/best-coding-fast': 'OmniRoute · Best Coding Fast',
      'auto/best-vision': 'OmniRoute · Best Vision',
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
