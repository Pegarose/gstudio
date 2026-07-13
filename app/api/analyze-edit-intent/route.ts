import { NextRequest, NextResponse } from 'next/server';
import { createGroq } from '@ai-sdk/groq';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateObject } from 'ai';
import { z } from 'zod';
// import type { FileManifest } from '@/types/file-manifest'; // Type is used implicitly through manifest parameter

// Check if we're using Vercel AI Gateway
const isUsingAIGateway = !!process.env.AI_GATEWAY_API_KEY;
const aiGatewayBaseURL = 'https://ai-gateway.vercel.sh/v1';

const groq = createGroq({
  apiKey: process.env.AI_GATEWAY_API_KEY ?? process.env.GROQ_API_KEY,
  baseURL: isUsingAIGateway ? aiGatewayBaseURL : undefined,
});

const anthropic = createAnthropic({
  apiKey: process.env.AI_GATEWAY_API_KEY ?? process.env.ANTHROPIC_API_KEY,
  baseURL: isUsingAIGateway ? aiGatewayBaseURL : (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com/v1'),
});

const openai = createOpenAI({
  apiKey: process.env.AI_GATEWAY_API_KEY ?? process.env.OPENAI_API_KEY,
  baseURL: isUsingAIGateway ? aiGatewayBaseURL : process.env.OPENAI_BASE_URL,
});

const opencodeClient = process.env.OPENCODEGO_API_KEY ? createOpenAI({
  apiKey: process.env.OPENCODEGO_API_KEY,
  baseURL: process.env.OPENCODEGO_API_BASE?.endsWith('/v1') || process.env.OPENCODEGO_API_BASE?.endsWith('/v1/')
    ? process.env.OPENCODEGO_API_BASE
    : `${process.env.OPENCODEGO_API_BASE?.replace(/\/$/, '')}/v1`,
}) : null;

const tr4Client = process.env.TR4_API_KEY ? createOpenAI({
  apiKey: process.env.TR4_API_KEY,
  baseURL: process.env.TR4_API_BASE?.endsWith('/v1') || process.env.TR4_API_BASE?.endsWith('/v1/')
    ? process.env.TR4_API_BASE
    : `${process.env.TR4_API_BASE?.replace(/\/$/, '')}/v1`,
}) : null;

const googleGenerativeAI = createGoogleGenerativeAI({
  apiKey: process.env.AI_GATEWAY_API_KEY ?? process.env.GEMINI_API_KEY,
  baseURL: isUsingAIGateway ? aiGatewayBaseURL : undefined,
});

// Schema for the AI's search plan - not file selection!
const searchPlanSchema = z.object({
  editType: z.enum([
    'UPDATE_COMPONENT',
    'ADD_FEATURE', 
    'FIX_ISSUE',
    'UPDATE_STYLE',
    'REFACTOR',
    'ADD_DEPENDENCY',
    'REMOVE_ELEMENT'
  ]).describe('The type of edit being requested'),
  
  reasoning: z.string().describe('Explanation of the search strategy'),
  
  searchTerms: z.array(z.string()).describe('Specific text to search for (case-insensitive). Be VERY specific - exact button text, class names, etc.'),
  
  regexPatterns: z.array(z.string()).optional().describe('Regex patterns for finding code structures (e.g., "className=[\\"\\\'].*header.*[\\"\\\']")'),
  
  fileTypesToSearch: z.array(z.string()).default(['.jsx', '.tsx', '.js', '.ts']).describe('File extensions to search'),
  
  expectedMatches: z.number().min(1).max(10).default(1).describe('Expected number of matches (helps validate search worked)'),
  
  fallbackSearch: z.object({
    terms: z.array(z.string()),
    patterns: z.array(z.string()).optional()
  }).optional().describe('Backup search if primary fails')
});

interface CustomRouteInfo {
  client: any;
  name: string;
  provider: 'opencode' | 'tr4' | 'agentrouter';
}

const tr4SharedModels = new Set([
  'kimi-k2.5',
  'kimi-k2-thinking',
  'kimi-k2.7-code',
  'kimi-k2',
  'kimi-k2.6',
]);
const tr4FallbackModel = 'gpt-5.6-sol';

function getModelProvider(model: string): CustomRouteInfo | null {
  const m = model.toLowerCase();
  
  // TR4 Exclusive models from user screenshot
  const tr4Exclusive = [
    'gpt-5.4', 'gpt-5.4-mini', 'gpt-5.6-sol', 'gpt-image-1.5', 'gpt-image-2',
    'gpt-oss-120b-medium', 'gpt-5.3-codex-spark', 'gpt-5.5', 'gpt-5.6-terra', 'gpt-5.6-luna',
    'claude-sonnet-4-6', 'claude-opus-4-6-thinking',
    'gemini-3.1-flash-lite', 'gemini-pro-agent', 'gemini-3.5-flash-low', 'gemini-3.5-flash-extra-low',
    'gemini-3-flash-agent', 'gemini-3.1-pro-low', 'gemini-3-flash', 'gemini-3.1-flash-image',
    'kimi-k2.7-code-highspeed', 'codex-auto-review'
  ];

  // Opencode Exclusive models
  const opencodeExclusive = [
    'minimax-m3', 'minimax-m2.7', 'minimax-m2.5',
    'glm-5.2', 'glm-5.1', 'glm-5',
    'deepseek-v4-pro', 'deepseek-v4-flash',
    'qwen3.7-max', 'qwen3.7-plus', 'qwen3.6-plus', 'qwen3.5-plus',
    'mimo-v2-pro', 'mimo-v2-omni', 'mimo-v2.5-pro', 'mimo-v2.5',
    'hy3-preview'
  ];

  // 1. Route TR4 exclusive models
  if (tr4Exclusive.includes(m) && process.env.TR4_API_KEY && tr4Client) {
    return { client: tr4Client, name: model, provider: 'tr4' };
  }
  
  // 2. Route Opencode exclusive models
  if (opencodeExclusive.includes(m) && process.env.OPENCODEGO_API_KEY && opencodeClient) {
    return { client: opencodeClient, name: model, provider: 'opencode' };
  }
  
  // 3. Route shared or other models (e.g., kimi-k2.5, kimi-k2-thinking, kimi-k2.7-code, kimi-k2, kimi-k2.6)
  // Try Opencode first; shared Kimi models may fall back to TR4.
  if (process.env.OPENCODEGO_API_KEY && opencodeClient) {
    return { client: opencodeClient, name: model, provider: 'opencode' };
  }
  
  // Try TR4 next
  if (process.env.TR4_API_KEY && tr4Client) {
    return { client: tr4Client, name: model, provider: 'tr4' };
  }

  return null;
}

export async function POST(request: NextRequest) {
  try {
    const { prompt, manifest, model = 'openai/gpt-oss-20b' } = await request.json();
    
    console.log('[analyze-edit-intent] Request received');
    console.log('[analyze-edit-intent] Prompt:', prompt);
    console.log('[analyze-edit-intent] Model:', model);
    console.log('[analyze-edit-intent] Manifest files count:', manifest?.files ? Object.keys(manifest.files).length : 0);
    
    if (!prompt || !manifest) {
      return NextResponse.json({
        error: 'prompt and manifest are required'
      }, { status: 400 });
    }
    
    // Create a summary of available files for the AI
    const validFiles = Object.entries(manifest.files as Record<string, any>)
      .filter(([path]) => {
        // Filter out invalid paths
        return path.includes('.') && !path.match(/\/\d+$/);
      });
    
    const fileSummary = validFiles
      .map(([path, info]: [string, any]) => {
        const componentName = info.componentInfo?.name || path.split('/').pop();
        // const hasImports = info.imports?.length > 0; // Kept for future use
        const childComponents = info.componentInfo?.childComponents?.join(', ') || 'none';
        return `- ${path} (${componentName}, renders: ${childComponents})`;
      })
      .join('\n');
    
    console.log('[analyze-edit-intent] Valid files found:', validFiles.length);
    
    if (validFiles.length === 0) {
      console.error('[analyze-edit-intent] No valid files found in manifest');
      return NextResponse.json({
        success: false,
        error: 'No valid files found in manifest'
      }, { status: 400 });
    }
    
    console.log('[analyze-edit-intent] Analyzing prompt:', prompt);
    console.log('[analyze-edit-intent] File summary preview:', fileSummary.split('\n').slice(0, 5).join('\n'));
    
    // Select the appropriate AI model based on the request
    let aiModel: any;
    const customRoute = getModelProvider(model);

    if (customRoute) {
      aiModel = customRoute.client.chat ? customRoute.client.chat(customRoute.name) : customRoute.client(customRoute.name);
      console.log(`[analyze-edit-intent] Intercepting request: Using ${customRoute.provider.toUpperCase()} with model: ${customRoute.name}`);
    } else {
      if (model.startsWith('anthropic/')) {
        aiModel = anthropic(model.replace('anthropic/', ''));
      } else if (model.startsWith('openai/')) {
        if (model.includes('gpt-oss')) {
          aiModel = groq(model);
        } else {
          aiModel = openai.chat ? openai.chat(model.replace('openai/', '')) : openai(model.replace('openai/', ''));
        }
      } else if (model.startsWith('google/')) {
        aiModel = googleGenerativeAI(model.replace('google/', ''));
      } else {
        aiModel = groq(model);
      }
      console.log('[analyze-edit-intent] Using standard model:', model);
    }
    
    // Use AI to create a search plan
    let result;
    const messages = [
      {
        role: 'system' as const,
        content: `You are an expert at planning code searches. Your job is to create a search strategy to find the exact code that needs to be edited.

DO NOT GUESS which files to edit. Instead, provide specific search terms that will locate the code.

SEARCH STRATEGY RULES:
1. For text changes (e.g., "change 'Start Deploying' to 'Go Now'"):
   - Search for the EXACT text: "Start Deploying"
   
2. For style changes (e.g., "make header black"):
   - Search for component names: "Header", "<header"
   - Search for class names: "header", "navbar"
   - Search for className attributes containing relevant words
   
3. For removing elements (e.g., "remove the deploy button"):
   - Search for the button text or aria-label
   - Search for relevant IDs or data-testids
   
4. For navigation/header issues:
   - Search for: "navigation", "nav", "Header", "navbar"
   - Look for Link components or href attributes
   
5. Be SPECIFIC:
   - Use exact capitalization for user-visible text
   - Include multiple search terms for redundancy
   - Add regex patterns for structural searches

Current project structure for context:
${fileSummary}`
      },
      {
        role: 'user' as const,
        content: `User request: "${prompt}"

Create a search plan to find the exact code that needs to be modified. Include specific search terms and patterns.`
      }
    ];

    try {
      result = await generateObject({
        model: aiModel,
        schema: searchPlanSchema,
        messages
      });
    } catch (generateError: any) {
      console.error('[analyze-edit-intent] Error in generateObject:', generateError);
      
      // Shared Kimi models may fall back from OpenCode to the configured TR4 API.
      if (customRoute?.provider === 'opencode' && tr4SharedModels.has(model.toLowerCase()) && process.env.TR4_API_KEY && tr4Client) {
        console.log('[analyze-edit-intent] Opencode failed. Falling back to TR4 API with model:', tr4FallbackModel);
        try {
          result = await generateObject({
            model: tr4Client.chat ? tr4Client.chat(tr4FallbackModel) : tr4Client(tr4FallbackModel),
            schema: searchPlanSchema,
            messages
          });
        } catch (tr4Error) {
          console.error('[analyze-edit-intent] TR4 fallback also failed:', tr4Error);
          throw generateError;
        }
      } else {
        throw generateError;
      }
    }
    
    console.log('[analyze-edit-intent] Search plan created:', {
      editType: result.object.editType,
      searchTerms: result.object.searchTerms,
      patterns: result.object.regexPatterns?.length || 0,
      reasoning: result.object.reasoning
    });
    
    // Return the search plan, not file matches
    return NextResponse.json({
      success: true,
      searchPlan: result.object
    });
    
  } catch (error) {
    console.error('[analyze-edit-intent] Error:', error);
    return NextResponse.json({
      success: false,
      error: (error as Error).message
    }, { status: 500 });
  }
}
