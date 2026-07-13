'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import Image from 'next/image';
import { appConfig } from '@/config/app.config';
import { normalizeTeamModel } from '@/lib/models/team-model-policy';
import HeroInput from '@/components/HeroInput';
import HeaderBrandKit from '@/components/shared/header/BrandKit/BrandKit';
import { HeaderProvider } from '@/components/shared/header/HeaderContext';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
// Import icons from centralized module to avoid Turbopack chunk issues
import { 
  FiFile, 
  FiChevronRight, 
  FiChevronDown,
  FiGithub,
  BsFolderFill, 
  BsFolder2Open,
  SiJavascript, 
  SiReact, 
  SiCss3, 
  SiJson 
} from '@/lib/icons';
import { motion } from 'framer-motion';
import CodeApplicationProgress, { type CodeApplicationState } from '@/components/CodeApplicationProgress';
import { resolveGenerationIntent } from '@/lib/generation-intent.js';
import styles from './builder.module.css';

interface SandboxData {
  sandboxId: string;
  url: string;
  [key: string]: any;
}

interface ChatMessage {
  content: string;
  type: 'user' | 'ai' | 'system' | 'file-update' | 'command' | 'error';
  timestamp: Date;
  metadata?: {
    scrapedUrl?: string;
    scrapedContent?: any;
    generatedCode?: string;
    appliedFiles?: string[];
    commandType?: 'input' | 'output' | 'error' | 'success';
    brandingData?: any;
    sourceUrl?: string;
  };
}

interface ScrapeData {
  success: boolean;
  content?: string;
  url?: string;
  title?: string;
  source?: string;
  screenshot?: string;
  structured?: any;
  metadata?: any;
  message?: string;
  error?: string;
}

function AISandboxPage() {
  const [sandboxData, setSandboxData] = useState<SandboxData | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({ text: 'Not connected', active: false });
  const [responseArea, setResponseArea] = useState<string[]>([]);
  const [structureContent, setStructureContent] = useState('No sandbox created yet');
  const [promptInput, setPromptInput] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [aiChatInput, setAiChatInput] = useState('');
  const [aiEnabled] = useState(true);
  const searchParams = useSearchParams();
  const router = useRouter();
  const [aiModel, setAiModel] = useState(() => {
    const modelParam = searchParams.get('model');
    return appConfig.ai.availableModels.includes(modelParam || '') ? modelParam! : appConfig.ai.defaultModel;
  });
  const [planningModel, setPlanningModel] = useState(() => normalizeTeamModel('planning', searchParams.get('planningModel')));
  const [coderModel, setCoderModel] = useState(() => normalizeTeamModel('coder', searchParams.get('coderModel')));
  const [qaModel, setQaModel] = useState(() => normalizeTeamModel('qa', searchParams.get('qaModel')));
  const [urlOverlayVisible, setUrlOverlayVisible] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [urlStatus, setUrlStatus] = useState<string[]>([]);
  const [showHomeScreen, setShowHomeScreen] = useState(true);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['app', 'src', 'src/components']));
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [homeScreenFading, setHomeScreenFading] = useState(false);
  const [homeUrlInput, setHomeUrlInput] = useState('');
  const [homeContextInput, setHomeContextInput] = useState('');
  const [activeTab, setActiveTab] = useState<'generation' | 'preview'>('preview');
  
  // Premium Workspace Controls State
  const [generationMode, setGenerationMode] = useState<'build' | 'plan'>('build');
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [historyLog, setHistoryLog] = useState<Array<{ id: number; version_title: string; created_at: string }>>([]);
  const [seoAuditing, setSeoAuditing] = useState(false);
  const [seoResult, setSeoResult] = useState<{
    title: string;
    metaDesc: string;
    viewport: string;
    h1Count: number;
    imagesWithoutAlt: number;
    score: number;
  } | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const [activeProjectId, setActiveProjectId] = useState<number | null>(null);
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  
  const [showStyleSelector, setShowStyleSelector] = useState(false);
  const [selectedStyle, setSelectedStyle] = useState<string | null>(null);
  const [showLoadingBackground, setShowLoadingBackground] = useState(false);
  const [urlScreenshot, setUrlScreenshot] = useState<string | null>(null);
  const [isScreenshotLoaded, setIsScreenshotLoaded] = useState(false);
  const [isCapturingScreenshot, setIsCapturingScreenshot] = useState(false);
  const [screenshotError, setScreenshotError] = useState<string | null>(null);
  const [isPreparingDesign, setIsPreparingDesign] = useState(false);
  const [targetUrl, setTargetUrl] = useState<string>('');
  const [sidebarScrolled, setSidebarScrolled] = useState(false);
  const [screenshotCollapsed, setScreenshotCollapsed] = useState(false);
  const [loadingStage, setLoadingStage] = useState<'gathering' | 'planning' | 'generating' | null>(null);
  const [isStartingNewGeneration, setIsStartingNewGeneration] = useState(false);
  const [sandboxFiles, setSandboxFiles] = useState<Record<string, string>>({});
  const [hasInitialSubmission, setHasInitialSubmission] = useState<boolean>(false);
  const [fileStructure, setFileStructure] = useState<string>('');
  
  const [conversationContext, setConversationContext] = useState<{
    scrapedWebsites: Array<{ url: string; content: any; timestamp: Date }>;
    generatedComponents: Array<{ name: string; path: string; content: string }>;
    appliedCode: Array<{ files: string[]; timestamp: Date }>;
    currentProject: string;
    lastGeneratedCode?: string;
  }>({
    scrapedWebsites: [],
    generatedComponents: [],
    appliedCode: [],
    currentProject: '',
    lastGeneratedCode: undefined
  });
  
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const chatMessagesRef = useRef<HTMLDivElement>(null);
  const codeDisplayRef = useRef<HTMLDivElement>(null);
  const activeGenerationStreamRef = useRef<AbortController | null>(null);
  const activeApplyStreamRef = useRef<AbortController | null>(null);
  
  const [codeApplicationState, setCodeApplicationState] = useState<CodeApplicationState>({
    stage: null
  });
  
  const [generationProgress, setGenerationProgress] = useState<{
    isGenerating: boolean;
    status: string;
    components: Array<{ name: string; path: string; completed: boolean }>;
    currentComponent: number;
    streamedCode: string;
    isStreaming: boolean;
    isThinking: boolean;
    thinkingText?: string;
    thinkingDuration?: number;
    currentFile?: { path: string; content: string; type: string };
    files: Array<{ path: string; content: string; type: string; completed: boolean; edited?: boolean }>;
    lastProcessedPosition: number;
    isEdit?: boolean;
  }>({
    isGenerating: false,
    status: '',
    components: [],
    currentComponent: 0,
    streamedCode: '',
    isStreaming: false,
    isThinking: false,
    files: [],
    lastProcessedPosition: 0
  });

  const [isRestoring, setIsRestoring] = useState(false);

  // Clear old conversation data on component mount and create/restore sandbox
  useEffect(() => {
    let isMounted = true;
    let sandboxCreated = false; // Track if sandbox was created in this effect

    const initializePage = async () => {
      // Prevent double execution in React StrictMode
      if (sandboxCreated) return;
      
      // First check URL parameters (from home page navigation)
      const urlParam = searchParams.get('url');
      const templateParam = searchParams.get('template');
      const detailsParam = searchParams.get('details');
      
      // Then check session storage as fallback
      const storedUrl = urlParam || sessionStorage.getItem('targetUrl');
      const storedStyle = templateParam || sessionStorage.getItem('selectedStyle');
      const storedModel = sessionStorage.getItem('selectedModel');
      const storedPlanningModel = sessionStorage.getItem('selectedPlanningModel');
      const storedCoderModel = sessionStorage.getItem('selectedCoderModel');
      const storedQaModel = sessionStorage.getItem('selectedQaModel');
      const storedInstructions = sessionStorage.getItem('additionalInstructions');
      const storedGenerationIntent = sessionStorage.getItem('generationIntent');
      let projectIdForSandbox = sessionStorage.getItem('projectId');
      
      if (storedUrl) {
        // Mark that we have an initial submission since we're loading with a URL
        setHasInitialSubmission(true);
        
        // Clear sessionStorage after reading  
        sessionStorage.removeItem('targetUrl');
        sessionStorage.removeItem('selectedStyle');
        sessionStorage.removeItem('selectedModel');
        sessionStorage.removeItem('selectedPlanningModel');
        sessionStorage.removeItem('selectedCoderModel');
        sessionStorage.removeItem('selectedQaModel');
        sessionStorage.removeItem('additionalInstructions');
        // Note: Don't clear siteMarkdown here, it will be cleared when used
        
        // Set the values in the component state
        setHomeUrlInput(storedUrl);
        setSelectedStyle(storedStyle || 'modern');
        if (storedPlanningModel) setPlanningModel(normalizeTeamModel('planning', storedPlanningModel));
        if (storedCoderModel) setCoderModel(normalizeTeamModel('coder', storedCoderModel));
        if (storedQaModel) setQaModel(normalizeTeamModel('qa', storedQaModel));

        // Register or load project in PostgreSQL database
        const storedProjectId = projectIdForSandbox;
        if (storedProjectId) {
          const pid = Number(storedProjectId);
          setActiveProjectId(pid);
          console.log('[database] Re-using existing project ID:', pid);
          fetch(`/api/projects/${pid}`)
            .then(res => res.json())
            .then(data => {
              if (data.success && data.project) {
                if (data.project.planning_model) setPlanningModel(normalizeTeamModel('planning', data.project.planning_model));
                if (data.project.coder_model) setCoderModel(normalizeTeamModel('coder', data.project.coder_model));
                if (data.project.qa_model) setQaModel(normalizeTeamModel('qa', data.project.qa_model));
              }
            })
            .catch(err => console.error('[database] Failed to load project models:', err));
        } else {
          const projectNameStr = sessionStorage.getItem('projectName') || 'New Project';
          const registrationResponse = await fetch('/api/projects', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: projectNameStr,
              targetUrl: storedUrl,
              style: storedStyle || '',
              planningModel: normalizeTeamModel('planning', storedPlanningModel || planningModel),
              coderModel: normalizeTeamModel('coder', storedCoderModel || coderModel),
              qaModel: normalizeTeamModel('qa', storedQaModel || qaModel)
            })
          });
          const regData = await registrationResponse.json();
          if (!registrationResponse.ok || !regData.success || !regData.project) {
            throw new Error(regData.error || 'Failed to register project');
          }

          projectIdForSandbox = String(regData.project.id);
          sessionStorage.setItem('projectId', String(regData.project.id));
          setActiveProjectId(regData.project.id);
          console.log('[database] Project registered with ID:', regData.project.id);
          if (regData.project.planning_model) setPlanningModel(normalizeTeamModel('planning', regData.project.planning_model));
          if (regData.project.coder_model) setCoderModel(normalizeTeamModel('coder', regData.project.coder_model));
          if (regData.project.qa_model) setQaModel(normalizeTeamModel('qa', regData.project.qa_model));
        }
        
        // Add details to context if provided
        if (detailsParam) {
          setHomeContextInput(detailsParam);
        } else if (storedGenerationIntent !== 'inspire' && storedStyle && !urlParam) {
          // Only apply stored style if no screenshot URL is provided
          // This prevents unwanted style inheritance when using screenshot search
          const styleNames: Record<string, string> = {
            '1': 'Glassmorphism',
            '2': 'Neumorphism',
            '3': 'Brutalism',
            '4': 'Minimalist',
            '5': 'Dark Mode',
            '6': 'Gradient Rich',
            '7': '3D Depth',
            '8': 'Retro Wave',
            'modern': 'Modern clean and minimalist',
            'playful': 'Fun colorful and playful',
            'professional': 'Corporate professional and sleek',
            'artistic': 'Creative artistic and unique'
          };
          const styleName = styleNames[storedStyle] || storedStyle;
          let contextString = `${styleName} style design`;
          
          // Add additional instructions if provided
          if (storedInstructions) {
            contextString += `. ${storedInstructions}`;
          }
          
          setHomeContextInput(contextString);
        } else if (storedInstructions && !urlParam) {
          // Apply only instructions if no style but instructions are provided
          // and no screenshot URL is provided
          setHomeContextInput(storedInstructions);
        }
        
        if (storedModel) {
          setAiModel(storedModel);
        }
        if (storedPlanningModel) {
          setPlanningModel(normalizeTeamModel('planning', storedPlanningModel));
        }
        if (storedCoderModel) {
          setCoderModel(normalizeTeamModel('coder', storedCoderModel));
        }
        
        // Skip the home screen and go directly to builder
        setShowHomeScreen(false);
        setHomeScreenFading(false);
        
        if (!storedProjectId) {
          // Trigger exactly one generation after component state is ready.
          sessionStorage.setItem('autoStart', 'true');
        } else {
          // Resuming an existing project - do not trigger new generation
          sessionStorage.removeItem('autoStart');
        }
      }
      
      // Clear old conversation
      try {
        await fetch('/api/conversation-state', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'clear-old' })
        });
        console.log('[home] Cleared old conversation data on mount');
      } catch (error) {
        console.error('[ai-sandbox] Failed to clear old conversation:', error);
        if (isMounted) {
          addChatMessage('Failed to clear old conversation data.', 'error');
        }
      }
      
      if (!isMounted) return;

      // Check if sandbox ID is in URL
      const sandboxIdParam = searchParams.get('sandbox');
      
      setLoading(true);
      try {
        if (sandboxIdParam) {
          console.log('[home] Attempting to restore sandbox:', sandboxIdParam);
          // For now, just create a new sandbox - you could enhance this to actually restore
          // the specific sandbox if your backend supports it
          sandboxCreated = true;
          await createSandbox(true, projectIdForSandbox);
        } else {
          console.log('[home] No sandbox in URL, creating new sandbox automatically...');
          sandboxCreated = true;
          await createSandbox(true, projectIdForSandbox);
        }
        
        // If we have a URL from the home page, mark for automatic start
        if (storedUrl && isMounted && !sessionStorage.getItem('projectId')) {
          // We'll trigger the generation after the component is fully mounted
          // and the startGeneration function is defined
          sessionStorage.setItem('autoStart', 'true');
        }
      } catch (error) {
        console.error('[ai-sandbox] Failed to create or restore sandbox:', error);
        if (isMounted) {
          addChatMessage('Failed to create or restore sandbox.', 'error');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };
    
    initializePage();

    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run only on mount
  
  useEffect(() => {
    // Handle Escape key for home screen
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showHomeScreen) {
        setHomeScreenFading(true);
        setTimeout(() => {
          setShowHomeScreen(false);
          setHomeScreenFading(false);
        }, 500);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showHomeScreen]);

  // Premium controls key listeners & postMessage handlers
  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.altKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setGenerationMode(prev => {
          const next = prev === 'build' ? 'plan' : 'build';
          toast.info(`Switched to ${next === 'build' ? 'Build Mode' : 'Plan Mode'}`);
          return next;
        });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    const handleIframeMessage = (e: MessageEvent) => {
      if (e.data && e.data.type === 'ELEMENT_SELECTED') {
        const promptTemplate = `Modify the ${e.data.tag} element containing: "${e.data.text}" `;
        setAiChatInput(promptTemplate);
        toast.info(`Selected element: ${e.data.tag}`);
      }
      
      if (e.data && e.data.type === 'SEO_AUDIT_RESULTS') {
        const { title, metaDesc, viewport, h1Count, imagesWithoutAlt } = e.data;
        let score = 100;
        if (!title) score -= 25;
        if (!metaDesc) score -= 25;
        if (!viewport) score -= 20;
        if (h1Count !== 1) score -= 15;
        if (imagesWithoutAlt > 0) score -= Math.min(15, imagesWithoutAlt * 5);
        
        setSeoResult({
          title,
          metaDesc,
          viewport,
          h1Count,
          imagesWithoutAlt,
          score: Math.max(0, score)
        });
        setSeoAuditing(false);
        toast.success("SEO Audit completed!");
      }
    };
    
    window.addEventListener('message', handleIframeMessage);
    return () => window.removeEventListener('message', handleIframeMessage);
  }, []);

  // Sync inspector state to iframe
  useEffect(() => {
    const timer = setTimeout(() => {
      if (iframeRef.current && iframeRef.current.contentWindow) {
        iframeRef.current.contentWindow.postMessage({
          type: 'TOGGLE_INSPECTOR',
          active: inspecting
        }, '*');
      }
    }, 1000); // Small timeout to ensure iframe loading has stabilized
    return () => clearTimeout(timer);
  }, [inspecting, activeTab, sandboxData]);
  
  // Start capturing screenshot if URL is provided on mount (from home screen)
  useEffect(() => {
    if (!showHomeScreen && homeUrlInput && !urlScreenshot && !isCapturingScreenshot) {
      let screenshotUrl = homeUrlInput.trim();
      if (!screenshotUrl.match(/^https?:\/\//i)) {
        screenshotUrl = 'https://' + screenshotUrl;
      }
      captureUrlScreenshot(screenshotUrl);
    }
  }, [showHomeScreen, homeUrlInput]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-start generation if flagged
  useEffect(() => {
    const autoStart = sessionStorage.getItem('autoStart');
    if (autoStart === 'true' && !showHomeScreen && homeUrlInput && sandboxData) {
      sessionStorage.removeItem('autoStart');
      // Small delay to ensure everything is ready
      setTimeout(() => {
        console.log('[generation] Auto-starting generation for URL:', homeUrlInput);
        startGeneration();
      }, 1000);
    }
  }, [showHomeScreen, homeUrlInput, sandboxData]); // eslint-disable-line react-hooks/exhaustive-deps


  useEffect(() => {
    // Only check sandbox status on mount if we don't already have sandboxData
    // AND we're not auto-starting a new generation (which would create a new sandbox)
    const autoStart = sessionStorage.getItem('autoStart');
    if (!sandboxData && autoStart !== 'true') {
      checkSandboxStatus();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (chatMessagesRef.current) {
      chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const updateStatus = (text: string, active: boolean) => {
    setStatus({ text, active });
  };

  const log = (message: string, type: 'info' | 'error' | 'command' = 'info') => {
    setResponseArea(prev => [...prev, `[${type}] ${message}`]);
  };

  const addChatMessage = (content: string, type: ChatMessage['type'], metadata?: ChatMessage['metadata']) => {
    setChatMessages(prev => {
      // Skip duplicate consecutive system messages
      if (type === 'system' && prev.length > 0) {
        const lastMessage = prev[prev.length - 1];
        if (lastMessage.type === 'system' && lastMessage.content === content) {
          return prev; // Skip duplicate
        }
      }
      return [...prev, { content, type, timestamp: new Date(), metadata }];
    });
  };

  const appendTokensToLastAiMessage = (text: string) => {
    setChatMessages(prev => {
      if (prev.length === 0) {
        return [{ content: text, type: 'ai', timestamp: new Date() }];
      }
      const last = prev[prev.length - 1];
      if (last.type === 'ai') {
        const newContent = last.content === 'Thinking...' ? text : last.content + text;
        return [
          ...prev.slice(0, -1),
          { ...last, content: newContent }
        ];
      } else {
        return [...prev, { content: text, type: 'ai', timestamp: new Date() }];
      }
    });
  };
  
  const checkAndInstallPackages = async () => {
    // This function is only called when user explicitly requests it
    // Don't show error if no sandbox - it's likely being created
    if (!sandboxData) {
      console.log('[checkAndInstallPackages] No sandbox data available yet');
      return;
    }
    
    // Vite error checking removed - handled by template setup
    addChatMessage('Checking packages... Sandbox is ready with Vite configuration.', 'system');
  };
  
  const handleSurfaceError = (_errors: any[]) => {
    // Function kept for compatibility but Vite errors are now handled by template
    
    // Focus the input
    const textarea = document.querySelector('textarea') as HTMLTextAreaElement;
    if (textarea) {
      textarea.focus();
    }
  };
  
  const installPackages = async (packages: string[]) => {
    if (!sandboxData) {
      addChatMessage('No active sandbox. Create a sandbox first!', 'system');
      return;
    }
    
    try {
      const response = await fetch('/api/install-packages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packages })
      });
      
      if (!response.ok) {
        throw new Error(`Failed to install packages: ${response.statusText}`);
      }
      
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      
      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              switch (data.type) {
                case 'command':
                  // Don't show npm install commands - they're handled by info messages
                  if (!data.command.includes('npm install')) {
                    addChatMessage(data.command, 'command', { commandType: 'input' });
                  }
                  break;
                case 'output':
                  addChatMessage(data.message, 'command', { commandType: 'output' });
                  break;
                case 'error':
                  if (data.message && data.message !== 'undefined') {
                    addChatMessage(data.message, 'command', { commandType: 'error' });
                  }
                  break;
                case 'warning':
                  addChatMessage(data.message, 'command', { commandType: 'output' });
                  break;
                case 'success':
                  addChatMessage(`${data.message}`, 'system');
                  break;
                case 'status':
                  addChatMessage(data.message, 'system');
                  break;
              }
            } catch (e) {
              console.error('Failed to parse SSE data:', e);
            }
          }
        }
      }
    } catch (error: any) {
      addChatMessage(`Failed to install packages: ${error.message}`, 'system');
    }
  };

  const checkSandboxStatus = async () => {
    try {
      const response = await fetch('/api/sandbox-status');
      const data = await response.json();
      
      if (data.active && data.healthy && data.sandboxData) {
        console.log('[checkSandboxStatus] Setting sandboxData from API:', data.sandboxData);
        setSandboxData(data.sandboxData);
        updateStatus('Sandbox active', true);
      } else if (data.active && !data.healthy) {
        // Sandbox exists but not responding
        updateStatus('Sandbox not responding', false);
        // Keep existing sandboxData if we have it - don't clear it
      } else {
        // Only clear sandboxData if we don't already have it or if we're explicitly checking from a fresh state
        // This prevents clearing sandboxData during normal operation when it should persist
        if (!sandboxData) {
          console.log('[checkSandboxStatus] No existing sandboxData, clearing state');
          setSandboxData(null);
          updateStatus('No sandbox', false);
        } else {
          // Keep existing sandboxData and just update status
          console.log('[checkSandboxStatus] Keeping existing sandboxData, sandbox inactive but data preserved');
          updateStatus('Sandbox status unknown', false);
        }
      }
    } catch (error) {
      console.error('Failed to check sandbox status:', error);
      // Only clear on error if we don't have existing sandboxData
      if (!sandboxData) {
        setSandboxData(null);
        updateStatus('Error', false);
      } else {
        updateStatus('Status check failed', false);
      }
    }
  };

  const restoreLatestVersion = async (projectId: number, sId: string) => {
    setIsRestoring(true);
    updateStatus('Restoring project files...', false);
    try {
      console.log(`[restore] Fetching versions for project ${projectId}...`);
      const res = await fetch(`/api/projects/${projectId}/versions`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.versions && data.versions.length > 0) {
          const latestVersion = data.versions[0];
          console.log(`[restore] Restoring latest version: ${latestVersion.version_title} (ID: ${latestVersion.id})`);
          
          const revRes = await fetch(`/api/projects/${projectId}/versions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'revert',
              versionId: latestVersion.id
            })
          });
          
          if (revRes.ok) {
            const revData = await revRes.json();
            if (revData.success && revData.files) {
              console.log(`[restore] Writing ${Object.keys(revData.files).length} files to sandbox...`);
              const writeRes = await fetch('/api/write-sandbox-files', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  files: revData.files,
                  sandboxId: sId
                })
              });
              
              if (writeRes.ok) {
                console.log('[restore] Project files restored successfully!');
                toast.success(`Restored latest snapshot of project`);
                
                // Refresh iframe
                if (iframeRef.current) {
                  iframeRef.current.src = iframeRef.current.src;
                }
                
                setIsRestoring(false);
                await fetchSandboxFiles();
                return true;
              }
            }
          }
        } else {
          console.log('[restore] No versions found to restore');
        }
      }
    } catch (err) {
      console.error('[restore] Error restoring latest version:', err);
    }
    setIsRestoring(false);
    return false;
  };

  const sandboxCreationRef = useRef<boolean>(false);
  
  const createSandbox = async (fromHomeScreen = false, projectIdOverride?: string | number | null) => {
    // Prevent duplicate sandbox creation
    if (sandboxCreationRef.current) {
      console.log('[createSandbox] Sandbox creation already in progress, skipping...');
      return null;
    }

    const projectId = projectIdOverride ?? activeProjectId ?? sessionStorage.getItem('projectId');
    if (!projectId) {
      throw new Error('A project must be registered before creating a sandbox');
    }
    
    sandboxCreationRef.current = true;
    console.log('[createSandbox] Starting sandbox creation...');
    setLoading(true);
    setShowLoadingBackground(true);
    updateStatus('Creating sandbox...', false);
    setResponseArea([]);
    setScreenshotError(null);
    
    try {
      const response = await fetch('/api/create-ai-sandbox-v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: String(projectId),
          generationId: null,
          provider: 'e2b'
        })
      });
      
      const data = await response.json();
      console.log('[createSandbox] Response data:', data);
      
      if (data.success) {
        sandboxCreationRef.current = false; // Reset the ref on success
        console.log('[createSandbox] Setting sandboxData from creation:', data);
        setSandboxData(data);
        updateStatus('Sandbox active', true);
        log('Sandbox created successfully!');
        log(`Sandbox ID: ${data.sandboxId}`);
        log(`URL: ${data.url}`);
        
        // Update URL with sandbox ID
        const newParams = new URLSearchParams(searchParams.toString());
        newParams.set('sandbox', data.sandboxId);
        newParams.set('model', aiModel);
        router.push(`/generation?${newParams.toString()}`, { scroll: false });
        
        // Fade out loading background after sandbox loads
        setTimeout(() => {
          setShowLoadingBackground(false);
        }, 3000);
        
        if (data.structure) {
          displayStructure(data.structure);
        }
        
        // Fetch sandbox files or restore existing project
        const storedProjectId = sessionStorage.getItem('projectId');
        if (storedProjectId) {
          const pid = Number(storedProjectId);
          restoreLatestVersion(pid, data.sandboxId);
        } else {
          // Fetch sandbox files after creation
          setTimeout(fetchSandboxFiles, 1000);
        }
        
        // For Vercel sandboxes, Vite is already started during setupViteApp
        // No need to restart it immediately after creation
        // Only restart if there's an actual issue later
        console.log('[createSandbox] Sandbox ready with Vite server running');
        
        // Only add welcome message if not coming from home screen
        if (!fromHomeScreen) {
          addChatMessage(`Sandbox created! ID: ${data.sandboxId}. I now have context of your sandbox and can help you build your app. Just ask me to create components and I'll automatically apply them!

Tip: I automatically detect and install npm packages from your code imports (like react-router-dom, axios, etc.)`, 'system');
        }
        
        setTimeout(() => {
          if (iframeRef.current) {
            iframeRef.current.src = data.url;
          }
        }, 100);
        
        // Return the sandbox data so it can be used immediately
        return data;
      } else {
        throw new Error(data.error || 'Unknown error');
      }
    } catch (error: any) {
      console.error('[createSandbox] Error:', error);
      updateStatus('Error', false);
      log(`Failed to create sandbox: ${error.message}`, 'error');
      addChatMessage(`Failed to create sandbox: ${error.message}`, 'system');
      throw error;
    } finally {
      setLoading(false);
      sandboxCreationRef.current = false; // Reset the ref
    }
  };

  const displayStructure = (structure: any) => {
    if (typeof structure === 'object') {
      setStructureContent(JSON.stringify(structure, null, 2));
    } else {
      setStructureContent(structure || 'No structure available');
    }
  };

  const applyGeneratedCode = async (code: string, isEdit: boolean = false, overrideSandboxData?: SandboxData) => {
    setLoading(true);
    log('Applying AI-generated code...');
    
    // Abort any active apply stream
    if (activeApplyStreamRef.current) {
      activeApplyStreamRef.current.abort();
    }
    const abortController = new AbortController();
    activeApplyStreamRef.current = abortController;
    
    try {
      // Show progress component instead of individual messages
      setCodeApplicationState({ stage: 'analyzing' });
      
      // Get pending packages from tool calls
      const pendingPackages = ((window as any).pendingPackages || []).filter((pkg: any) => pkg && typeof pkg === 'string');
      if (pendingPackages.length > 0) {
        console.log('[applyGeneratedCode] Sending packages from tool calls:', pendingPackages);
        // Clear pending packages after use
        (window as any).pendingPackages = [];
      }
      
      // Use streaming endpoint for real-time feedback
      const effectiveSandboxData = overrideSandboxData || sandboxData;
      const response = await fetch('/api/apply-ai-code-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortController.signal,
        body: JSON.stringify({ 
          response: code,
          isEdit: isEdit,
          packages: pendingPackages,
          sandboxId: effectiveSandboxData?.sandboxId // Pass the sandbox ID to ensure proper connection
        })
      });
      
      if (!response.ok) {
        throw new Error(`Failed to apply code: ${response.statusText}`);
      }
      
      // Handle streaming response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let finalData: any = null;
      
      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              switch (data.type) {
                case 'start':
                  // Don't add as chat message, just update state
                  setCodeApplicationState({ stage: 'analyzing' });
                  break;
                  
                case 'step':
                  // Update progress state based on step
                  if (data.message.includes('Installing') && data.packages) {
                    setCodeApplicationState({ 
                      stage: 'installing', 
                      packages: data.packages 
                    });
                  } else if (data.message.includes('Creating files') || data.message.includes('Applying')) {
                    setCodeApplicationState({ 
                      stage: 'applying',
                      filesGenerated: [] // Files will be populated when complete
                    });
                  }
                  break;
                  
                case 'package-progress':
                  // Handle package installation progress
                  if (data.installedPackages) {
                    setCodeApplicationState(prev => ({ 
                      ...prev,
                      installedPackages: data.installedPackages 
                    }));
                  }
                  break;
                  
                case 'command':
                  // Don't show npm install commands - they're handled by info messages
                  if (data.command && !data.command.includes('npm install')) {
                    addChatMessage(data.command, 'command', { commandType: 'input' });
                  }
                  break;
                  
                case 'success':
                  if (data.installedPackages) {
                    setCodeApplicationState(prev => ({ 
                      ...prev,
                      installedPackages: data.installedPackages 
                    }));
                  }
                  break;
                  
                case 'file-progress':
                  // Skip file progress messages, they're noisy
                  break;
                  
                case 'file-complete':
                  // Could add individual file completion messages if desired
                  break;
                  
                case 'command-progress':
                  addChatMessage(`${data.action} command: ${data.command}`, 'command', { commandType: 'input' });
                  break;
                  
                case 'command-output':
                  addChatMessage(data.output, 'command', { 
                    commandType: data.stream === 'stderr' ? 'error' : 'output' 
                  });
                  break;
                  
                case 'command-complete':
                  if (data.success) {
                    addChatMessage(`Command completed successfully`, 'system');
                  } else {
                    addChatMessage(`Command failed with exit code ${data.exitCode}`, 'system');
                  }
                  break;
                  
                case 'complete':
                  finalData = data;
                  setCodeApplicationState({ stage: 'complete' });
                  // Clear the state after a delay
                  setTimeout(() => {
                    setCodeApplicationState({ stage: null });
                  }, 3000);
                  // Reset loading state when complete
                  setLoading(false);
                  break;
                  
                case 'error':
                  addChatMessage(`Error: ${data.message || data.error || 'Unknown error'}`, 'system');
                  // Reset loading state on error
                  setLoading(false);
                  break;
                  
                case 'warning':
                  addChatMessage(`${data.message}`, 'system');
                  break;
                  
                case 'info':
                  // Show info messages, especially for package installation
                  if (data.message) {
                    addChatMessage(data.message, 'system');
                  }
                  break;
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
      }
      
      // Process final data
      if (finalData && finalData.type === 'complete') {
        const data: any = {
          success: true,
          results: finalData.results,
          explanation: finalData.explanation,
          structure: finalData.structure,
          message: finalData.message,
          autoCompleted: finalData.autoCompleted,
          autoCompletedComponents: finalData.autoCompletedComponents,
          warning: finalData.warning,
          missingImports: finalData.missingImports,
          debug: finalData.debug
        };
        
        if (data.success) {
          const { results } = data;
        
        // Log package installation results without duplicate messages
        if (results.packagesInstalled?.length > 0) {
          log(`Packages installed: ${results.packagesInstalled.join(', ')}`);
        }
        
        if (results.filesCreated?.length > 0) {
          log('Files created:');
          results.filesCreated.forEach((file: string) => {
            log(`  ${file}`, 'command');
          });
          
          // Verify files were actually created by refreshing the sandbox if needed
          if (sandboxData?.sandboxId && results.filesCreated.length > 0) {
            // Small delay to ensure files are written
            setTimeout(() => {
              // Force refresh the iframe to show new files
              if (iframeRef.current) {
                iframeRef.current.src = iframeRef.current.src;
              }
            }, 1000);
          }
        }
        
        if (results.filesUpdated?.length > 0) {
          log('Files updated:');
          results.filesUpdated.forEach((file: string) => {
            log(`  ${file}`, 'command');
          });
        }
        
        // Update conversation context with applied code
        setConversationContext(prev => ({
          ...prev,
          appliedCode: [...prev.appliedCode, {
            files: [...(results.filesCreated || []), ...(results.filesUpdated || [])],
            timestamp: new Date()
          }]
        }));
        
        if (results.commandsExecuted?.length > 0) {
          log('Commands executed:');
          results.commandsExecuted.forEach((cmd: string) => {
            log(`  $ ${cmd}`, 'command');
          });
        }
        
        if (results.errors?.length > 0) {
          results.errors.forEach((err: string) => {
            log(err, 'error');
          });
        }
        
        if (data.structure) {
          displayStructure(data.structure);
        }
        
        if (data.explanation) {
          log(data.explanation);
        }
        
        if (data.autoCompleted) {
          log('Auto-generating missing components...', 'command');
          
          if (data.autoCompletedComponents) {
            setTimeout(() => {
              log('Auto-generated missing components:', 'info');
              data.autoCompletedComponents.forEach((comp: string) => {
                log(`  ${comp}`, 'command');
              });
            }, 1000);
          }
        } else if (data.warning) {
          log(data.warning, 'error');
          
          if (data.missingImports && data.missingImports.length > 0) {
            const missingList = data.missingImports.join(', ');
            addChatMessage(
              `Ask me to "create the missing components: ${missingList}" to fix these import errors.`,
              'system'
            );
          }
        }
        
        log('Code applied successfully!');
        console.log('[applyGeneratedCode] Response data:', data);
        console.log('[applyGeneratedCode] Debug info:', data.debug);
        console.log('[applyGeneratedCode] Current sandboxData:', sandboxData);
        console.log('[applyGeneratedCode] Current iframe element:', iframeRef.current);
        console.log('[applyGeneratedCode] Current iframe src:', iframeRef.current?.src);
        
        // Set applying code state for edits to show loading overlay
        // Removed overlay - changes apply directly
        
        if (results.filesCreated?.length > 0) {
          setConversationContext(prev => ({
            ...prev,
            appliedCode: [...prev.appliedCode, {
              files: results.filesCreated,
              timestamp: new Date()
            }]
          }));
          
          // Update the chat message to show success
          // Only show file list if not in edit mode
          if (isEdit) {
            addChatMessage(`Edit applied successfully!`, 'system');
          } else {
            // Check if this is part of a generation flow (has recent AI recreation message)
            const recentMessages = chatMessages.slice(-5);
            const isPartOfGeneration = recentMessages.some(m => 
              m.content.includes('AI recreation generated') || 
              m.content.includes('Code generated')
            );
            
            // Don't show files if part of generation flow to avoid duplication
            if (isPartOfGeneration) {
              addChatMessage(`Applied ${results.filesCreated.length} files successfully!`, 'system');
            } else {
              addChatMessage(`Applied ${results.filesCreated.length} files successfully!`, 'system', {
                appliedFiles: results.filesCreated
              });
            }
          }
          
          // If there are failed packages, add a message about checking for errors
          if (results.packagesFailed?.length > 0) {
            addChatMessage(`⚠️ Some packages failed to install. Check the error banner above for details.`, 'system');
          }
          
          // Fetch updated file structure
          await fetchSandboxFiles();
          
          // Skip automatic package check - it's not needed here and can cause false "no sandbox" messages
          // Packages are already installed during the apply-ai-code-stream process
          
          // Test build to ensure everything compiles correctly
          // Skip build test for now - it's causing errors with undefined activeSandbox
          // The build test was trying to access global.activeSandbox from the frontend,
          // but that's only available in the backend API routes
          console.log('[build-test] Skipping build test - would need API endpoint');
          
          // Force iframe refresh after applying code
          const refreshDelay = appConfig.codeApplication.defaultRefreshDelay; // Allow Vite to process changes
          
          setTimeout(() => {
            const currentSandboxData = effectiveSandboxData;
            if (iframeRef.current && currentSandboxData?.url) {
              console.log('[home] Refreshing iframe after code application...');
              
              // Method 1: Change src with timestamp
              const urlWithTimestamp = `${currentSandboxData.url}?t=${Date.now()}&applied=true`;
              iframeRef.current.src = urlWithTimestamp;
              
              // Method 2: Force reload after a short delay
              setTimeout(() => {
                try {
                  if (iframeRef.current?.contentWindow) {
                    iframeRef.current.contentWindow.location.reload();
                    console.log('[home] Force reloaded iframe content');
                  }
                } catch (e) {
                  console.log('[home] Could not reload iframe (cross-origin):', e);
                }
                // Reload completed
              }, 1000);
            }
          }, refreshDelay);
          
          // Vite error checking removed - handled by template setup
        }
        
          // Give Vite HMR a moment to detect changes, then ensure refresh
          const currentSandboxData = effectiveSandboxData;
          if (iframeRef.current && currentSandboxData?.url) {
            // Wait for Vite to process the file changes
            // If packages were installed, wait longer for Vite to restart
            const packagesInstalled = results?.packagesInstalled?.length > 0 || data.results?.packagesInstalled?.length > 0;
            const refreshDelay = packagesInstalled ? appConfig.codeApplication.packageInstallRefreshDelay : appConfig.codeApplication.defaultRefreshDelay;
            console.log(`[applyGeneratedCode] Packages installed: ${packagesInstalled}, refresh delay: ${refreshDelay}ms`);
            
            setTimeout(async () => {
            if (iframeRef.current && currentSandboxData?.url) {
              console.log('[applyGeneratedCode] Starting iframe refresh sequence...');
              console.log('[applyGeneratedCode] Current iframe src:', iframeRef.current.src);
              console.log('[applyGeneratedCode] Sandbox URL:', currentSandboxData.url);
              
              // Method 1: Try direct navigation first
              try {
                const urlWithTimestamp = `${currentSandboxData.url}?t=${Date.now()}&force=true`;
                console.log('[applyGeneratedCode] Attempting direct navigation to:', urlWithTimestamp);
                
                // Remove any existing onload handler
                iframeRef.current.onload = null;
                
                // Navigate directly
                iframeRef.current.src = urlWithTimestamp;
                
                // Wait a bit and check if it loaded
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                // Try to access the iframe content to verify it loaded
                try {
                  const iframeDoc = iframeRef.current.contentDocument || iframeRef.current.contentWindow?.document;
                  if (iframeDoc && iframeDoc.readyState === 'complete') {
                    console.log('[applyGeneratedCode] Iframe loaded successfully');
                    return;
                  }
                } catch {
                  console.log('[applyGeneratedCode] Cannot access iframe content (CORS), assuming loaded');
                  return;
                }
              } catch (e) {
                console.error('[applyGeneratedCode] Direct navigation failed:', e);
              }
              
              // Method 2: Force complete iframe recreation if direct navigation failed
              console.log('[applyGeneratedCode] Falling back to iframe recreation...');
              const parent = iframeRef.current.parentElement;
              const newIframe = document.createElement('iframe');
              
              // Copy attributes
              newIframe.className = iframeRef.current.className;
              newIframe.title = iframeRef.current.title;
              newIframe.allow = iframeRef.current.allow;
              // Copy sandbox attributes
              const sandboxValue = iframeRef.current.getAttribute('sandbox');
              if (sandboxValue) {
                newIframe.setAttribute('sandbox', sandboxValue);
              }
              
              // Remove old iframe
              iframeRef.current.remove();
              
              // Add new iframe
              newIframe.src = `${currentSandboxData.url}?t=${Date.now()}&recreated=true`;
              parent?.appendChild(newIframe);
              
              // Update ref
              (iframeRef as any).current = newIframe;
              
              console.log('[applyGeneratedCode] Iframe recreated with new content');
            } else {
              console.error('[applyGeneratedCode] No iframe or sandbox URL available for refresh');
            }
          }, refreshDelay); // Dynamic delay based on whether packages were installed
        }
        
        } else {
          throw new Error(finalData?.error || 'Failed to apply code');
        }
      } else {
        // If no final data was received, still close loading
        addChatMessage('Code application may have partially succeeded. Check the preview.', 'system');
      }
    } catch (error: any) {
      log(`Failed to apply code: ${error.message}`, 'error');
    } finally {
      setLoading(false);
      // Clear isEdit flag after applying code
      setGenerationProgress(prev => ({
        ...prev,
        isEdit: false
      }));
    }
  };

  const fetchHistory = async () => {
    if (!activeProjectId) return;
    try {
      const res = await fetch(`/api/projects/${activeProjectId}/versions`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setHistoryLog(data.versions || []);
        }
      }
    } catch (err) {
      console.error('Failed to fetch history list:', err);
    }
  };

  useEffect(() => {
    if (activeProjectId) {
      fetchHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProjectId]);

  const fetchSandboxFiles = async () => {
    if (!sandboxData) return;
    
    try {
      const response = await fetch('/api/get-sandbox-files', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setSandboxFiles(data.files || {});
          setFileStructure(data.structure || '');
          console.log('[fetchSandboxFiles] Updated file list:', Object.keys(data.files || {}).length, 'files');

          // PostgreSQL Snapshot Integration
          if (activeProjectId && data.files && Object.keys(data.files).length > 0 && !isRestoring) {
            const versionTitle = `Update - ${new Date().toLocaleTimeString()}`;
            fetch(`/api/projects/${activeProjectId}/versions`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'save',
                title: versionTitle,
                files: data.files
              })
            })
              .then(res => res.json())
              .then(saveRes => {
                if (saveRes.success) {
                  console.log('[database] Snapshot version saved to db:', saveRes.versionId);
                  fetchHistory();
                }
              })
              .catch(dbErr => console.error('[database] Failed to save snapshot:', dbErr));
          }
        }
      }
    } catch (error) {
      console.error('[fetchSandboxFiles] Error fetching files:', error);
    }
  };

  const handleRevertVersion = async (versionId: number, versionTitle: string) => {
    if (!activeProjectId || !sandboxData?.sandboxId) return;
    
    const loadingToast = toast.loading(`Reverting to ${versionTitle}...`);
    try {
      const response = await fetch(`/api/projects/${activeProjectId}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'revert',
          versionId
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.files) {
          // Write files back to sandbox
          const writeResponse = await fetch('/api/write-sandbox-files', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              files: data.files,
              sandboxId: sandboxData.sandboxId
            })
          });
          
          if (writeResponse.ok) {
            toast.dismiss(loadingToast);
            toast.success(`Successfully reverted to ${versionTitle}`);
            
            // Refresh iframe
            if (iframeRef.current) {
              iframeRef.current.src = iframeRef.current.src;
            }
            
            // Fetch updated files
            fetchSandboxFiles();
          } else {
            throw new Error("Failed to apply reverted files");
          }
        } else {
          throw new Error(data.error || "Failed to retrieve snapshot");
        }
      } else {
        throw new Error("API call failed");
      }
    } catch (err: any) {
      toast.dismiss(loadingToast);
      toast.error(`Revert failed: ${err.message}`);
    }
  };
  
//   const restartViteServer = async () => {
//     try {
//       addChatMessage('Restarting Vite dev server...', 'system');
//       
//       const response = await fetch('/api/restart-vite', {
//         method: 'POST',
//         headers: { 'Content-Type': 'application/json' }
//       });
//       
//       if (response.ok) {
//         const data = await response.json();
//         if (data.success) {
//           addChatMessage('✓ Vite dev server restarted successfully!', 'system');
//           
//           // Refresh the iframe after a short delay
//           setTimeout(() => {
//             if (iframeRef.current && sandboxData?.url) {
//               iframeRef.current.src = `${sandboxData.url}?t=${Date.now()}`;
//             }
//           }, 2000);
//         } else {
//           addChatMessage(`Failed to restart Vite: ${data.error}`, 'error');
//         }
//       } else {
//         addChatMessage('Failed to restart Vite server', 'error');
//       }
//     } catch (error) {
//       console.error('[restartViteServer] Error:', error);
//       addChatMessage(`Error restarting Vite: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
//     }
//   };

//   const applyCode = async () => {
//     const code = promptInput.trim();
//     if (!code) {
//       log('Please enter some code first', 'error');
//       addChatMessage('No code to apply. Please generate code first.', 'system');
//       return;
//     }
//     
//     // Prevent double clicks
//     if (loading) {
//       console.log('[applyCode] Already loading, skipping...');
//       return;
//     }
//     
//     // Determine if this is an edit based on whether we have applied code before
//     const isEdit = conversationContext.appliedCode.length > 0;
//     await applyGeneratedCode(code, isEdit);
//   };

  const hasProjectPreview = generationProgress.files.length > 0 || conversationContext.appliedCode.length > 0;

  const renderMainContent = () => {

    if (activeTab === 'generation' && (generationProgress.isGenerating || generationProgress.files.length > 0)) {
      return (
        /* Generation Tab Content */
        <div className="absolute inset-0 flex overflow-hidden">
          {/* File Explorer - Hide during edits */}
          {!generationProgress.isEdit && (
            <div className="w-[250px] border-r border-gray-200 bg-white flex flex-col flex-shrink-0">
            <div className="p-4 bg-gray-100 text-gray-900 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BsFolderFill style={{ width: '16px', height: '16px' }} />
                <span className="text-sm font-medium">Explorer</span>
              </div>
            </div>
            
            {/* File Tree */}
            <div className="flex-1 overflow-y-auto p-4 scrollbar-hide">
              <div className="text-sm">
                {/* Root app folder */}
                <div 
                  className="flex items-center gap-2 py-0.5 px-3 hover:bg-gray-100 rounded cursor-pointer text-gray-700"
                  onClick={() => toggleFolder('app')}
                >
                  {expandedFolders.has('app') ? (
                    <FiChevronDown style={{ width: '16px', height: '16px' }} className="text-gray-600" />
                  ) : (
                    <FiChevronRight style={{ width: '16px', height: '16px' }} className="text-gray-600" />
                  )}
                  {expandedFolders.has('app') ? (
                    <BsFolder2Open style={{ width: '16px', height: '16px' }} className="text-blue-500" />
                  ) : (
                    <BsFolderFill style={{ width: '16px', height: '16px' }} className="text-blue-500" />
                  )}
                  <span className="font-medium text-gray-800">app</span>
                </div>
                
                {expandedFolders.has('app') && (
                  <div className="ml-6">
                    {/* Group files by directory */}
                    {(() => {
                      const fileTree: { [key: string]: Array<{ name: string; edited?: boolean }> } = {};
                      
                      // Create a map of edited files
                      // const editedFiles = new Set(
                      //   generationProgress.files
                      //     .filter(f => f.edited)
                      //     .map(f => f.path)
                      // );
                      
                      // Process all files from generation progress
                      generationProgress.files.forEach(file => {
                        const parts = file.path.split('/');
                        const dir = parts.length > 1 ? parts.slice(0, -1).join('/') : '';
                        const fileName = parts[parts.length - 1];
                        
                        if (!fileTree[dir]) fileTree[dir] = [];
                        fileTree[dir].push({
                          name: fileName,
                          edited: file.edited || false
                        });
                      });
                      
                      return Object.entries(fileTree).map(([dir, files]) => (
                        <div key={dir} className="mb-1">
                          {dir && (
                            <div 
                              className="flex items-center gap-2 py-0.5 px-3 hover:bg-gray-100 rounded cursor-pointer text-gray-700"
                              onClick={() => toggleFolder(dir)}
                            >
                              {expandedFolders.has(dir) ? (
                                <FiChevronDown style={{ width: '16px', height: '16px' }} className="text-gray-600" />
                              ) : (
                                <FiChevronRight style={{ width: '16px', height: '16px' }} className="text-gray-600" />
                              )}
                              {expandedFolders.has(dir) ? (
                                <BsFolder2Open style={{ width: '16px', height: '16px' }} className="text-yellow-600" />
                              ) : (
                                <BsFolderFill style={{ width: '16px', height: '16px' }} className="text-yellow-600" />
                              )}
                              <span className="text-gray-700">{dir.split('/').pop()}</span>
                            </div>
                          )}
                          {(!dir || expandedFolders.has(dir)) && (
                            <div className={dir ? 'ml-8' : ''}>
                              {files.sort((a, b) => a.name.localeCompare(b.name)).map(fileInfo => {
                                const fullPath = dir ? `${dir}/${fileInfo.name}` : fileInfo.name;
                                const isSelected = selectedFile === fullPath;
                                
                                return (
                                  <div 
                                    key={fullPath} 
                                    className={`flex items-center gap-2 py-0.5 px-3 rounded cursor-pointer transition-all ${
                                      isSelected 
                                        ? 'bg-blue-500 text-white' 
                                        : 'text-gray-700 hover:bg-gray-100'
                                    }`}
                                    onClick={() => handleFileClick(fullPath)}
                                  >
                                    {getFileIcon(fileInfo.name)}
                                    <span className={`text-xs flex items-center gap-1 ${isSelected ? 'font-medium' : ''}`}>
                                      {fileInfo.name}
                                      {fileInfo.edited && (
                                        <span className={`text-[10px] px-1 rounded ${
                                          isSelected ? 'bg-blue-400' : 'bg-orange-500 text-white'
                                        }`}>✓</span>
                                      )}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      ));
                    })()}
                  </div>
                )}
              </div>
            </div>
          </div>
          )}
          
          {/* Code Content */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Thinking Mode Display - Only show during active generation */}
            {generationProgress.isGenerating && (generationProgress.isThinking || generationProgress.thinkingText) && (
              <div className="px-6 pb-6">
                <div className="flex items-center gap-2 mb-2">
                  <div className="text-purple-600 font-medium flex items-center gap-2">
                    {generationProgress.isThinking ? (
                      <>
                        <div className="w-3 h-3 bg-purple-600 rounded-full animate-pulse" />
                        AI is thinking...
                      </>
                    ) : (
                      <>
                        <span className="text-purple-600">✓</span>
                        Thought for {generationProgress.thinkingDuration || 0} seconds
                      </>
                    )}
                  </div>
                </div>
                {generationProgress.thinkingText && (
                  <div className="bg-purple-950 border border-purple-700 rounded-lg p-4 max-h-48 overflow-y-auto scrollbar-hide">
                    <pre className="text-xs font-mono text-purple-300 whitespace-pre-wrap">
                      {generationProgress.thinkingText}
                    </pre>
                  </div>
                )}
              </div>
            )}
            
            {/* Live Code Display */}
            <div className="flex-1 rounded-lg p-6 flex flex-col min-h-0 overflow-hidden">
              <div className="flex-1 overflow-y-auto min-h-0 scrollbar-hide" ref={codeDisplayRef}>
                {/* Show selected file if one is selected */}
                {selectedFile ? (
                  <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="bg-black border border-gray-200 rounded-lg overflow-hidden shadow-sm">
                      <div className="px-4 py-2 bg-[#36322F] text-white flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {getFileIcon(selectedFile)}
                          <span className="font-mono text-sm">{selectedFile}</span>
                        </div>
                        <button
                          onClick={() => setSelectedFile(null)}
                          className="hover:bg-black/20 p-1 rounded transition-colors"
                        >
                          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                      <div className="bg-gray-900 border border-gray-700 rounded">
                        <SyntaxHighlighter
                          language={(() => {
                            const ext = selectedFile.split('.').pop()?.toLowerCase();
                            if (ext === 'css') return 'css';
                            if (ext === 'json') return 'json';
                            if (ext === 'html') return 'html';
                            return 'jsx';
                          })()}
                          style={vscDarkPlus}
                          customStyle={{
                            margin: 0,
                            padding: '1rem',
                            fontSize: '0.875rem',
                            background: 'transparent',
                          }}
                          showLineNumbers={true}
                        >
                          {(() => {
                            // Find the file content from generated files
                            const file = generationProgress.files.find(f => f.path === selectedFile);
                            return file?.content || '// File content will appear here';
                          })()}
                        </SyntaxHighlighter>
                      </div>
                    </div>
                  </div>
                ) : /* If no files parsed yet, show loading or raw stream */
                generationProgress.files.length === 0 && !generationProgress.currentFile ? (
                  generationProgress.isThinking ? (
                    // Beautiful loading state while thinking
                    <div className="flex items-center justify-center h-full">
                      <div className="text-center">
                        <div className="mb-8 relative">
                          <div className="w-48 h-48 mx-auto">
                            <div className="absolute inset-0 border-8 border-gray-800 rounded-full"></div>
                            <div className="absolute inset-0 border-8 border-green-500 rounded-full animate-spin border-t-transparent"></div>
                          </div>
                        </div>
                        <h3 className="text-xl font-medium text-white mb-2">AI is analyzing your request</h3>
                        <p className="text-gray-400 text-sm">{generationProgress.status || 'Preparing to generate code...'}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-black border border-gray-200 rounded-lg overflow-hidden">
                      <div className="px-4 py-2 bg-gray-100 text-gray-900 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-16 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                          <span className="font-mono text-sm">Streaming code...</span>
                        </div>
                      </div>
                      <div className="p-4 bg-gray-900 rounded">
                        <SyntaxHighlighter
                          language="jsx"
                          style={vscDarkPlus}
                          customStyle={{
                            margin: 0,
                            padding: '1rem',
                            fontSize: '0.875rem',
                            background: 'transparent',
                          }}
                          showLineNumbers={true}
                        >
                          {generationProgress.streamedCode || 'Starting code generation...'}
                        </SyntaxHighlighter>
                        <span className="inline-block w-3 h-5 bg-orange-400 ml-1 animate-pulse" />
                      </div>
                    </div>
                  )
                ) : (
                  <div className="space-y-4">
                    {/* Show current file being generated */}
                    {generationProgress.currentFile && (
                      <div className="bg-black border-2 border-gray-400 rounded-lg overflow-hidden shadow-sm">
                        <div className="px-4 py-2 bg-[#36322F] text-white flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-16 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            <span className="font-mono text-sm">{generationProgress.currentFile.path}</span>
                            <span className={`px-2 py-0.5 text-xs rounded ${
                              generationProgress.currentFile.type === 'css' ? 'bg-blue-600 text-white' :
                              generationProgress.currentFile.type === 'javascript' ? 'bg-yellow-600 text-white' :
                              generationProgress.currentFile.type === 'json' ? 'bg-green-600 text-white' :
                              'bg-gray-200 text-gray-700'
                            }`}>
                              {generationProgress.currentFile.type === 'javascript' ? 'JSX' : generationProgress.currentFile.type.toUpperCase()}
                            </span>
                          </div>
                        </div>
                        <div className="bg-gray-900 border border-gray-700 rounded">
                          <SyntaxHighlighter
                            language={
                              generationProgress.currentFile.type === 'css' ? 'css' :
                              generationProgress.currentFile.type === 'json' ? 'json' :
                              generationProgress.currentFile.type === 'html' ? 'html' :
                              'jsx'
                            }
                            style={vscDarkPlus}
                            customStyle={{
                              margin: 0,
                              padding: '1rem',
                              fontSize: '0.75rem',
                              background: 'transparent',
                            }}
                            showLineNumbers={true}
                          >
                            {generationProgress.currentFile.content}
                          </SyntaxHighlighter>
                          <span className="inline-block w-3 h-4 bg-orange-400 ml-4 mb-4 animate-pulse" />
                        </div>
                      </div>
                    )}
                    
                    {/* Show completed files */}
                    {generationProgress.files.map((file, idx) => (
                      <div key={idx} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                        <div className="px-4 py-2 bg-[#36322F] text-white flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-green-500">✓</span>
                            <span className="font-mono text-sm">{file.path}</span>
                          </div>
                          <span className={`px-2 py-0.5 text-xs rounded ${
                            file.type === 'css' ? 'bg-blue-600 text-white' :
                            file.type === 'javascript' ? 'bg-yellow-600 text-white' :
                            file.type === 'json' ? 'bg-green-600 text-white' :
                            'bg-gray-200 text-gray-700'
                          }`}>
                            {file.type === 'javascript' ? 'JSX' : file.type.toUpperCase()}
                          </span>
                        </div>
                        <div className="bg-gray-900 border border-gray-700  max-h-48 overflow-y-auto scrollbar-hide">
                          <SyntaxHighlighter
                            language={
                              file.type === 'css' ? 'css' :
                              file.type === 'json' ? 'json' :
                              file.type === 'html' ? 'html' :
                              'jsx'
                            }
                            style={vscDarkPlus}
                            customStyle={{
                              margin: 0,
                              padding: '1rem',
                              fontSize: '0.75rem',
                              background: 'transparent',
                            }}
                            showLineNumbers={true}
                            wrapLongLines={true}
                          >
                            {file.content}
                          </SyntaxHighlighter>
                        </div>
                      </div>
                    ))}
                    
                    {/* Show remaining raw stream if there's content after the last file */}
                    {!generationProgress.currentFile && generationProgress.streamedCode.length > 0 && (
                      <div className="bg-black border border-gray-200 rounded-lg overflow-hidden">
                        <div className="px-4 py-2 bg-[#36322F] text-white flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-16 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                            <span className="font-mono text-sm">Processing...</span>
                          </div>
                        </div>
                        <div className="bg-gray-900 border border-gray-700 rounded">
                          <SyntaxHighlighter
                            language="jsx"
                            style={vscDarkPlus}
                            customStyle={{
                              margin: 0,
                              padding: '1rem',
                              fontSize: '0.75rem',
                              background: 'transparent',
                            }}
                            showLineNumbers={false}
                          >
                            {(() => {
                              // Show only the tail of the stream after the last file
                              const lastFileEnd = generationProgress.files.length > 0 
                                ? generationProgress.streamedCode.lastIndexOf('</file>') + 7
                                : 0;
                              let remainingContent = generationProgress.streamedCode.slice(lastFileEnd).trim();
                              
                              // Remove explanation tags and content
                              remainingContent = remainingContent.replace(/<explanation>[\s\S]*?<\/explanation>/g, '').trim();

                              // If only whitespace or nothing left, show loading message
                              // Use "Loading sandbox..." instead of "Waiting for next file..." for better UX
                              return remainingContent || 'Loading sandbox...';
                            })()}
                          </SyntaxHighlighter>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            
            {/* Progress indicator */}
            {generationProgress.components.length > 0 && (
              <div className="mx-6 mb-6">
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-orange-500 to-orange-400 transition-all duration-300"
                    style={{
                      width: `${(generationProgress.currentComponent / Math.max(generationProgress.components.length, 1)) * 100}%`
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      );
    } else if (activeTab === 'preview') {
      // Show loading state for initial generation or when starting a new generation with existing sandbox
      const isInitialGeneration = !sandboxData?.url && (urlScreenshot || isCapturingScreenshot || isPreparingDesign || loadingStage);
      const isNewGenerationWithSandbox = isStartingNewGeneration && sandboxData?.url;
      const shouldShowLoadingOverlay = (isInitialGeneration || isNewGenerationWithSandbox) && 
        (loading || generationProgress.isGenerating || isPreparingDesign || loadingStage || isCapturingScreenshot || isStartingNewGeneration);
      
      if (isInitialGeneration || isNewGenerationWithSandbox) {
        return (
          <div className="relative w-full h-full bg-gray-900">
            {/* Screenshot as background when available */}
            {urlScreenshot && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img 
                src={urlScreenshot} 
                alt="Website preview" 
                className="absolute inset-0 w-full h-full object-cover transition-opacity duration-700"
                style={{ 
                  opacity: isScreenshotLoaded ? 1 : 0,
                  willChange: 'opacity'
                }}
                onLoad={() => setIsScreenshotLoaded(true)}
                loading="eager"
              />
            )}
            
            {/* Loading overlay - only show when actively processing initial generation */}
            {shouldShowLoadingOverlay && (
              <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center backdrop-blur-sm">
                {/* Loading animation with skeleton */}
                <div className="text-center max-w-md">
                  {/* Animated skeleton lines */}
                  <div className="mb-6 space-y-3">
                    <div className="h-2 bg-gradient-to-r from-transparent via-white/20 to-transparent rounded animate-pulse" 
                         style={{ animationDuration: '1.5s', animationDelay: '0s' }} />
                    <div className="h-2 bg-gradient-to-r from-transparent via-white/20 to-transparent rounded animate-pulse w-4/5 mx-auto" 
                         style={{ animationDuration: '1.5s', animationDelay: '0.2s' }} />
                    <div className="h-2 bg-gradient-to-r from-transparent via-white/20 to-transparent rounded animate-pulse w-3/5 mx-auto" 
                         style={{ animationDuration: '1.5s', animationDelay: '0.4s' }} />
                  </div>
                  
                  {/* Status text */}
                  <p className="text-white text-lg font-medium">
                    {isCapturingScreenshot ? 'Analyzing website...' :
                     isPreparingDesign ? 'Preparing design...' :
                     generationProgress.isGenerating ? 'Generating code...' :
                     'Loading...'}
                  </p>
                  
                  {/* Subtle progress hint */}
                  <p className="text-white/60 text-sm mt-2">
                    {isCapturingScreenshot ? 'Taking a screenshot of the site' :
                     isPreparingDesign ? 'Understanding the layout and structure' :
                     generationProgress.isGenerating ? 'Writing React components' :
                     'Please wait...'}
                  </p>
                </div>
              </div>
            )}
          </div>
        );
      }
      
      if (!hasProjectPreview && !generationProgress.isGenerating) {
        return (
          <div className={styles.emptyPreview}>
            <div className={styles.emptyPreviewContent}>
              <span className={styles.emptyPreviewEyebrow}>Live canvas</span>
              <h2>Your product takes shape here.</h2>
              <p>Describe the first useful flow in chat. G Studio will build it, preview it, and keep each revision in context.</p>
              <div className={styles.emptyPreviewFlow} aria-label="Builder workflow">
                <span>Describe</span>
                <span aria-hidden="true">→</span>
                <span>Build</span>
                <span aria-hidden="true">→</span>
                <span>Refine</span>
              </div>
            </div>
          </div>
        );
      }

      // Show sandbox iframe - keep showing during edits, only hide during initial loading
      if (sandboxData?.url) {
        return (
          <div className="relative w-full h-full bg-neutral-50 dark:bg-neutral-950 flex items-center justify-center p-16 overflow-auto">
            <div 
              style={{
                width: previewDevice === 'mobile' ? '375px' : previewDevice === 'tablet' ? '768px' : '100%',
                height: previewDevice === 'desktop' ? '100%' : 'calc(100% - 32px)',
                maxHeight: '100%',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
              }}
              className="relative shadow-2xl rounded-2xl overflow-hidden border border-neutral-200/80 dark:border-neutral-800 bg-white"
            >
              <iframe
                ref={iframeRef}
                src={sandboxData.url}
                className="w-full h-full border-none"
                title="G Studio Sandbox"
                allow="clipboard-write"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
              />
            </div>

            {/* Iframe Floating Editor Toolbar Overlay */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-white border border-gray-200 rounded-full px-4 py-2 shadow-lg flex items-center gap-3 z-20">
              <button
                type="button"
                onClick={() => {
                  setInspecting(!inspecting);
                  toast.success(!inspecting ? "Inspector mode enabled. Hover and click elements in preview to select." : "Inspector mode disabled");
                }}
                className={`p-2 rounded-full transition-all flex items-center justify-center gap-1.5 ${
                  inspecting 
                    ? 'bg-orange-500 text-white shadow-md' 
                    : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                }`}
                title="Inspect / Edit Element"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                </svg>
                <span className="text-[10px] font-bold pr-1">Inspect</span>
              </button>
              <div className="h-4 w-[1px] bg-gray-200" />
              <button
                type="button"
                onClick={() => {
                  if (iframeRef.current) {
                    iframeRef.current.src = iframeRef.current.src;
                    toast.success("Preview reloaded");
                  }
                }}
                className="p-2 rounded-full text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-all flex items-center justify-center gap-1.5"
                title="Reload Preview"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 7.89M9 11l3 3m0 0l3-3m-3 3V8" />
                </svg>
                <span className="text-[10px] font-bold pr-1">Reload</span>
              </button>
            </div>
            
            {/* Package installation overlay - shows when installing packages or applying code */}
            {codeApplicationState.stage && codeApplicationState.stage !== 'complete' && (
              <div className="absolute inset-0 bg-white/95 backdrop-blur-sm flex items-center justify-center z-10">
                <div className="text-center max-w-md">
                  <div className="mb-6">
                    {/* Animated icon based on stage */}
                    {codeApplicationState.stage === 'installing' ? (
                      <div className="w-16 h-16 mx-auto">
                        <svg className="w-full h-full animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                      </div>
                    ) : null}
                  </div>
                  
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    {codeApplicationState.stage === 'analyzing' && 'Analyzing code...'}
                    {codeApplicationState.stage === 'installing' && 'Installing packages...'}
                    {codeApplicationState.stage === 'applying' && 'Applying changes...'}
                  </h3>
                  
                  {/* Package list during installation */}
                  {codeApplicationState.stage === 'installing' && codeApplicationState.packages && (
                    <div className="mb-4">
                      <div className="flex flex-wrap gap-2 justify-center">
                        {codeApplicationState.packages.map((pkg, index) => (
                          <span 
                            key={index}
                            className={`px-2 py-1 text-xs rounded-full transition-all ${
                              codeApplicationState.installedPackages?.includes(pkg)
                                ? 'bg-green-100 text-green-700'
                                : 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {pkg}
                            {codeApplicationState.installedPackages?.includes(pkg) && (
                              <span className="ml-1">✓</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Files being generated */}
                  {codeApplicationState.stage === 'applying' && codeApplicationState.filesGenerated && (
                    <div className="text-sm text-gray-600">
                      Creating {codeApplicationState.filesGenerated.length} files...
                    </div>
                  )}
                  
                  <p className="text-sm text-gray-500 mt-2">
                    {codeApplicationState.stage === 'analyzing' && 'Parsing generated code and detecting dependencies...'}
                    {codeApplicationState.stage === 'installing' && 'This may take a moment while npm installs the required packages...'}
                    {codeApplicationState.stage === 'applying' && 'Writing files to your sandbox environment...'}
                  </p>
                </div>
              </div>
            )}
            
            {/* Show a subtle indicator when code is being edited/generated */}
            {generationProgress.isGenerating && generationProgress.isEdit && !codeApplicationState.stage && (
              <div className="absolute top-4 right-4 inline-flex items-center gap-2 px-3 py-1.5 bg-black/80 backdrop-blur-sm rounded-lg">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                <span className="text-white text-xs font-medium">Generating code...</span>
              </div>
            )}
            
            {/* Refresh button */}
            <button
              onClick={() => {
                if (iframeRef.current && sandboxData?.url) {
                  console.log('[Manual Refresh] Forcing iframe reload...');
                  const newSrc = `${sandboxData.url}?t=${Date.now()}&manual=true`;
                  iframeRef.current.src = newSrc;
                }
              }}
              className="absolute bottom-4 right-4 bg-white/90 hover:bg-white text-gray-700 p-2 rounded-lg shadow-lg transition-all duration-200 hover:scale-105"
              title="Refresh sandbox"
            >
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        );
      }
      
      // Default state when no sandbox and no screenshot
      return (
        <div className="flex items-center justify-center h-full bg-gray-50 text-gray-600 text-lg">
          {screenshotError ? (
            <div className="text-center">
              <p className="mb-2">Failed to capture screenshot</p>
              <p className="text-sm text-gray-500">{screenshotError}</p>
            </div>
          ) : sandboxData ? (
            <div className="text-gray-500">
              <div className="w-16 h-16 border-2 border-gray-300 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-sm">Loading preview...</p>
            </div>
          ) : (
            <div className="text-gray-500 text-center">
              <p className="text-sm">Start chatting to create your first app</p>
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  const sendChatMessage = async () => {
    const message = aiChatInput.trim();
    if (!message) return;
    
    if (!aiEnabled) {
      addChatMessage('AI is disabled. Please enable it first.', 'system');
      return;
    }
    
    addChatMessage(message, 'user');
    setAiChatInput('');

    // If we have no files in sandbox, treat any message as a retry trigger for initial generation
    if (Object.keys(sandboxFiles).length === 0 && homeUrlInput) {
      addChatMessage(`Retrying initial generation...`, 'system');
      if (message.toLowerCase() !== 'etsene yine' && message.toLowerCase() !== 'retry' && message.toLowerCase() !== 'neden faild oluyor') {
        setHomeContextInput(prev => prev ? `${prev}\n\nAdditional instructions: ${message}` : message);
      }
      startGeneration();
      return;
    }
    
    // Check for special commands
    const lowerMessage = message.toLowerCase().trim();
    if (lowerMessage === 'check packages' || lowerMessage === 'install packages' || lowerMessage === 'npm install') {
      if (!sandboxData) {
        // More helpful message - user might be trying to run this too early
        addChatMessage('The sandbox is still being set up. Please wait for the generation to complete, then try again.', 'system');
        return;
      }
      await checkAndInstallPackages();
      return;
    }
    
    // Start sandbox creation in parallel if needed
    let sandboxPromise: Promise<void> | null = null;
    let sandboxCreating = false;
    
    if (!sandboxData) {
      sandboxCreating = true;
      addChatMessage('Creating sandbox while I plan your app...', 'system');
      sandboxPromise = createSandbox(true).catch((error: any) => {
        addChatMessage(`Failed to create sandbox: ${error.message}`, 'system');
        throw error;
      });
    }
    
    // Determine if this is an edit
    const isEdit = conversationContext.appliedCode.length > 0;
    
    try {
      // Generation tab is already active from scraping phase
      setGenerationProgress(prev => ({
        ...prev,  // Preserve all existing state
        isGenerating: true,
        status: 'Starting AI generation...',
        components: [],
        currentComponent: 0,
        streamedCode: '',
        isStreaming: false,
        isThinking: true,
        thinkingText: 'Analyzing your request...',
        thinkingDuration: undefined,
        currentFile: undefined,
        lastProcessedPosition: 0,
        // Add isEdit flag to generation progress
        isEdit: isEdit,
        // Keep existing files for edits - we'll mark edited ones differently
        files: prev.files
      }));
      
      // Backend now manages file state - no need to fetch from frontend
      console.log('[chat] Using backend file cache for context');
      
      const fullContext = {
        sandboxId: sandboxData?.sandboxId || (sandboxCreating ? 'pending' : null),
        structure: structureContent,
        recentMessages: chatMessages.slice(-20),
        conversationContext: conversationContext,
        currentCode: promptInput,
        sandboxUrl: sandboxData?.url,
        sandboxCreating: sandboxCreating
      };
      
      // Debug what we're sending
      console.log('[chat] Sending context to AI:');
      console.log('[chat] - sandboxId:', fullContext.sandboxId);
      console.log('[chat] - isEdit:', conversationContext.appliedCode.length > 0);
      
      const finalPrompt = generationMode === 'plan'
        ? `${message}\n\nIMPORTANT: Do NOT perform any code edits or file writes. Only provide a detailed structural plan of the requested changes and ask for my confirmation before modifying any files.`
        : message;

      addChatMessage('Thinking...', 'ai');

      // Abort any active generation stream
      if (activeGenerationStreamRef.current) {
        activeGenerationStreamRef.current.abort();
      }
      const abortController = new AbortController();
      activeGenerationStreamRef.current = abortController;

      const response = await fetch('/api/generate-ai-code-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortController.signal,
        body: JSON.stringify({
          prompt: finalPrompt,
          model: generationMode === 'plan' ? planningModel : coderModel,
          context: fullContext,
          isEdit: conversationContext.appliedCode.length > 0,
          generationMode,
          planningModel,
          coderModel,
          qaModel
        })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let generatedCode = '';
      let explanation = '';
      let buffer = ''; // Buffer for incomplete lines
      
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value, { stream: true });
          console.log('[chat] Received chunk:', chunk.length, 'bytes');
          buffer += chunk;
          const lines = buffer.split('\n');
          
          // Keep the last line in buffer if it's incomplete
          buffer = lines.pop() || '';
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              let data: any;
              try {
                data = JSON.parse(line.slice(6));
              } catch (e) {
                console.error('Failed to parse SSE data:', e);
                continue;
              }

              if (data.type === 'error') {
                throw new Error(data.error || data.message || 'Generation provider failed');
              }

              if (data.type === 'status') {
                  setGenerationProgress(prev => ({ ...prev, status: data.message }));
                } else if (data.type === 'thinking') {
                  setGenerationProgress(prev => ({ 
                    ...prev, 
                    isThinking: true,
                    thinkingText: (prev.thinkingText || '') + data.text
                  }));
                } else if (data.type === 'thinking_complete') {
                  setGenerationProgress(prev => ({ 
                    ...prev, 
                    isThinking: false,
                    thinkingDuration: data.duration
                  }));
                } else if (data.type === 'conversation') {
                  // Add conversational text to chat only if it's not code
                  let text = data.text || '';
                  
                  // Remove package tags from the text
                  text = text.replace(/<package>[^<]*<\/package>/g, '');
                  text = text.replace(/<packages>[^<]*<\/packages>/g, '');
                  
                  // Filter out any XML tags and file content that slipped through
                  if (!text.includes('<file') && !text.includes('import React') && 
                      !text.includes('export default') && !text.includes('className=') &&
                      text.length > 0) {
                    explanation += text;
                    appendTokensToLastAiMessage(text);
                  }
                } else if (data.type === 'stream' && data.raw) {
                  setGenerationProgress(prev => {
                    const newStreamedCode = prev.streamedCode + data.text;
                    
                    // Tab is already switched after scraping
                    
                    const updatedState = { 
                      ...prev, 
                      streamedCode: newStreamedCode,
                      isStreaming: true,
                      isThinking: false,
                      status: 'Generating code...'
                    };
                    
                    // Process complete files from the accumulated stream
                    const fileRegex = /<file path="([^"]+)">([^]*?)<\/file>/g;
                    let match;
                    const processedFiles = new Set(prev.files.map(f => f.path));
                    
                    while ((match = fileRegex.exec(newStreamedCode)) !== null) {
                      const filePath = match[1];
                      const fileContent = match[2];
                      
                      // Only add if we haven't processed this file yet
                      if (!processedFiles.has(filePath)) {
                        const fileExt = filePath.split('.').pop() || '';
                        const fileType = fileExt === 'jsx' || fileExt === 'js' ? 'javascript' :
                                        fileExt === 'css' ? 'css' :
                                        fileExt === 'json' ? 'json' :
                                        fileExt === 'html' ? 'html' : 'text';
                        
                        // Check if file already exists
                        const existingFileIndex = updatedState.files.findIndex(f => f.path === filePath);
                        
                        if (existingFileIndex >= 0) {
                          // Update existing file and mark as edited
                          updatedState.files = [
                            ...updatedState.files.slice(0, existingFileIndex),
                            {
                              ...updatedState.files[existingFileIndex],
                              content: fileContent.trim(),
                              type: fileType,
                              completed: true,
                              edited: true
                            },
                            ...updatedState.files.slice(existingFileIndex + 1)
                          ];
                        } else {
                          // Add new file
                          updatedState.files = [...updatedState.files, {
                            path: filePath,
                            content: fileContent.trim(),
                            type: fileType,
                            completed: true,
                            edited: false
                          }];
                        }
                        
                        // Only show file status if not in edit mode
                        if (!prev.isEdit) {
                          updatedState.status = `Completed ${filePath}`;
                        }
                        processedFiles.add(filePath);
                      }
                    }
                    
                    // Check for current file being generated (incomplete file at the end)
                    const lastFileMatch = newStreamedCode.match(/<file path="([^"]+)">([^]*?)$/);
                    if (lastFileMatch && !lastFileMatch[0].includes('</file>')) {
                      const filePath = lastFileMatch[1];
                      const partialContent = lastFileMatch[2];
                      
                      if (!processedFiles.has(filePath)) {
                        const fileExt = filePath.split('.').pop() || '';
                        const fileType = fileExt === 'jsx' || fileExt === 'js' ? 'javascript' :
                                        fileExt === 'css' ? 'css' :
                                        fileExt === 'json' ? 'json' :
                                        fileExt === 'html' ? 'html' : 'text';
                        
                        updatedState.currentFile = { 
                          path: filePath, 
                          content: partialContent, 
                          type: fileType 
                        };
                        // Only show file status if not in edit mode
                        if (!prev.isEdit) {
                          updatedState.status = `Generating ${filePath}`;
                        }
                      }
                    } else {
                      updatedState.currentFile = undefined;
                    }
                    
                    return updatedState;
                  });
                } else if (data.type === 'app') {
                  setGenerationProgress(prev => ({ 
                    ...prev, 
                    status: 'Generated App.jsx structure'
                  }));
                } else if (data.type === 'component') {
                  setGenerationProgress(prev => ({
                    ...prev,
                    status: `Generated ${data.name}`,
                    components: [...prev.components, { 
                      name: data.name, 
                      path: data.path, 
                      completed: true 
                    }],
                    currentComponent: data.index
                  }));
                } else if (data.type === 'package') {
                  // Handle package installation from tool calls
                  setGenerationProgress(prev => ({
                    ...prev,
                    status: data.message || `Installing ${data.name}`
                  }));
                } else if (data.type === "validation") {
                  setGenerationProgress((previous) => ({
                    ...previous,
                    status: data.repairCount > 0
                      ? `Quality gate passed after ${data.repairCount} repair`
                      : "Quality gate passed",
                  }));
                } else if (data.type === 'complete') {
                  generatedCode = data.generatedCode;
                  explanation = data.explanation;
                  
                  // Save the last generated code
                  setConversationContext(prev => ({
                    ...prev,
                    lastGeneratedCode: generatedCode
                  }));
                  
                  // Clear thinking state when generation completes
                  setGenerationProgress(prev => ({
                    ...prev,
                    isThinking: false,
                    thinkingText: undefined,
                    thinkingDuration: undefined
                  }));
                  
                  // Store packages to install from tool calls
                  if (data.packagesToInstall && data.packagesToInstall.length > 0) {
                    console.log('[generate-code] Packages to install from tools:', data.packagesToInstall);
                    // Store packages globally for later installation
                    (window as any).pendingPackages = data.packagesToInstall;
                  }
                  
                  // Parse all files from the completed code if not already done
                  const fileRegex = /<file path="([^"]+)">([^]*?)<\/file>/g;
                  const parsedFiles: Array<{path: string; content: string; type: string; completed: boolean}> = [];
                  let fileMatch;
                  
                  while ((fileMatch = fileRegex.exec(data.generatedCode)) !== null) {
                    const filePath = fileMatch[1];
                    const fileContent = fileMatch[2];
                    const fileExt = filePath.split('.').pop() || '';
                    const fileType = fileExt === 'jsx' || fileExt === 'js' ? 'javascript' :
                                    fileExt === 'css' ? 'css' :
                                    fileExt === 'json' ? 'json' :
                                    fileExt === 'html' ? 'html' : 'text';
                    
                    parsedFiles.push({
                      path: filePath,
                      content: fileContent.trim(),
                      type: fileType,
                      completed: true
                    });
                  }
                  
                  setGenerationProgress(prev => ({
                    ...prev,
                    status: `Generated ${parsedFiles.length > 0 ? parsedFiles.length : prev.files.length} file${(parsedFiles.length > 0 ? parsedFiles.length : prev.files.length) !== 1 ? 's' : ''}!`,
                    isGenerating: false,
                    isStreaming: false,
                    isEdit: prev.isEdit,
                    // Keep the files that were already parsed during streaming
                    files: prev.files.length > 0 ? prev.files : parsedFiles
                  }));
              }
            }
          }
        }
      }
      
      if (generatedCode) {
        // Parse files from generated code for metadata
        const fileRegex = /<file path="([^"]+)">([^]*?)<\/file>/g;
        const generatedFiles: string[] = [];
        let match;
        while ((match = fileRegex.exec(generatedCode)) !== null) {
          generatedFiles.push(match[1]);
        }
        
        // Update the last AI message with the final explanation and metadata
        setChatMessages(prev => {
          if (prev.length === 0) return prev;
          const newMessages = [...prev];
          for (let i = newMessages.length - 1; i >= 0; i--) {
            if (newMessages[i].type === 'ai') {
              const defaultText = isEdit && generatedFiles.length > 0
                ? `Updated ${generatedFiles.map(f => f.split('/').pop()).join(', ')}`
                : 'Code generated!';
              newMessages[i] = {
                ...newMessages[i],
                content: explanation || newMessages[i].content || defaultText,
                metadata: {
                  ...newMessages[i].metadata,
                  appliedFiles: isEdit && generatedFiles.length > 0 ? [generatedFiles[0]] : generatedFiles
                }
              };
              break;
            }
          }
          return newMessages;
        });
        
        setPromptInput(generatedCode);
        // Don't show the Generated Code panel by default
        // setLeftPanelVisible(true);
        
        // Wait for sandbox creation if it's still in progress
        let activeSandboxData = sandboxData;
        if (sandboxPromise) {
          addChatMessage('Waiting for sandbox to be ready...', 'system');
          try {
            const newSandboxData = await sandboxPromise;
            if (newSandboxData != null) {
              activeSandboxData = newSandboxData;
              // Also update the state for future use
              setSandboxData(newSandboxData);
            }
            // Remove the waiting message
            setChatMessages(prev => prev.filter(msg => msg.content !== 'Waiting for sandbox to be ready...'));
          } catch {
            addChatMessage('Sandbox creation failed. Cannot apply code.', 'system');
            return;
          }
        }
        
        if (activeSandboxData && generatedCode) {
          // For new sandbox creations (especially Vercel), add a delay to ensure Vite is ready
          if (sandboxCreating) {
            console.log('[startGeneration] New sandbox created, waiting for services to be ready...');
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
          
          // Use isEdit flag that was determined at the start
          // Pass the sandbox data from the promise if it's different from the state
          await applyGeneratedCode(generatedCode, isEdit, activeSandboxData !== sandboxData ? activeSandboxData : undefined);
        }
      }
      
      // Show completion status briefly then switch to preview
      setGenerationProgress(prev => ({
        ...prev,
        isGenerating: false,
        isStreaming: false,
        status: 'Generation complete!',
        isEdit: prev.isEdit,
        // Clear thinking state on completion
        isThinking: false,
        thinkingText: undefined,
        thinkingDuration: undefined
      }));
      
      setTimeout(() => {
        // Switch to preview but keep files for display
        setActiveTab('preview');
      }, 1000); // Reduced from 3000ms to 1000ms
    } catch (error: any) {
      setChatMessages(prev => prev.filter(msg => msg.content !== 'Thinking...'));
      addChatMessage(`Error: ${error.message}`, 'system');
      // Reset generation progress and switch back to preview on error
      setGenerationProgress({
        isGenerating: false,
        status: '',
        components: [],
        currentComponent: 0,
        streamedCode: '',
        isStreaming: false,
        isThinking: false,
        thinkingText: undefined,
        thinkingDuration: undefined,
        files: [],
        currentFile: undefined,
        lastProcessedPosition: 0
      });
      setActiveTab('preview');
    }
  };


  const downloadZip = async () => {
    if (!sandboxData) {
      addChatMessage('Please wait for the sandbox to be created before downloading.', 'system');
      return;
    }
    
    setLoading(true);
    log('Creating zip file...');
    addChatMessage('Creating ZIP file of your Vite app...', 'system');
    
    try {
      const response = await fetch('/api/create-zip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      const data = await response.json();
      
      if (data.success) {
        log('Zip file created!');
        addChatMessage('ZIP file created! Download starting...', 'system');
        
        const link = document.createElement('a');
        link.href = data.dataUrl;
        link.download = data.fileName || 'e2b-project.zip';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        addChatMessage(
          'Your Vite app has been downloaded! To run it locally:\n' +
          '1. Unzip the file\n' +
          '2. Run: npm install\n' +
          '3. Run: npm run dev\n' +
          '4. Open http://localhost:5173',
          'system'
        );
      } else {
        throw new Error(data.error);
      }
    } catch (error: any) {
      log(`Failed to create zip: ${error.message}`, 'error');
      addChatMessage(`Failed to create ZIP: ${error.message}`, 'system');
    } finally {
      setLoading(false);
    }
  };

  const reapplyLastGeneration = async () => {
    if (!conversationContext.lastGeneratedCode) {
      addChatMessage('No previous generation to re-apply', 'system');
      return;
    }
    
    if (!sandboxData) {
      addChatMessage('Please create a sandbox first', 'system');
      return;
    }
    
    addChatMessage('Re-applying last generation...', 'system');
    const isEdit = conversationContext.appliedCode.length > 0;
    await applyGeneratedCode(conversationContext.lastGeneratedCode, isEdit);
  };

  // Auto-scroll code display to bottom when streaming
  useEffect(() => {
    if (codeDisplayRef.current && generationProgress.isStreaming) {
      codeDisplayRef.current.scrollTop = codeDisplayRef.current.scrollHeight;
    }
  }, [generationProgress.streamedCode, generationProgress.isStreaming]);

  const toggleFolder = (folderPath: string) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(folderPath)) {
      newExpanded.delete(folderPath);
    } else {
      newExpanded.add(folderPath);
    }
    setExpandedFolders(newExpanded);
  };

  const handleFileClick = async (filePath: string) => {
    setSelectedFile(filePath);
    // TODO: Add file content fetching logic here
  };

  const getFileIcon = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    
    if (ext === 'jsx' || ext === 'js') {
      return <SiJavascript style={{ width: '16px', height: '16px' }} className="text-yellow-500" />;
    } else if (ext === 'tsx' || ext === 'ts') {
      return <SiReact style={{ width: '16px', height: '16px' }} className="text-blue-500" />;
    } else if (ext === 'css') {
      return <SiCss3 style={{ width: '16px', height: '16px' }} className="text-blue-500" />;
    } else if (ext === 'json') {
      return <SiJson style={{ width: '16px', height: '16px' }} className="text-gray-600" />;
    } else {
      return <FiFile style={{ width: '16px', height: '16px' }} className="text-gray-600" />;
    }
  };

//   const clearChatHistory = () => {
//     setChatMessages([{
//       content: 'Chat history cleared. How can I help you?',
//       type: 'system',
//       timestamp: new Date()
//     }]);
//   };
// 

//   const cloneWebsite = async () => {
//     let url = urlInput.trim();
//     if (!url) {
//       setUrlStatus(prev => [...prev, 'Please enter a URL']);
//       return;
//     }
//     
//     if (!url.match(/^https?:\/\//i)) {
//       url = 'https://' + url;
//     }
//     
//     setUrlStatus([`Using: ${url}`, 'Starting to scrape...']);
//     
//     setUrlOverlayVisible(false);
//     
//     // Remove protocol for cleaner display
//     const cleanUrl = url.replace(/^https?:\/\//i, '');
//     addChatMessage(`Starting to clone ${cleanUrl}...`, 'system');
//     
//     // Capture screenshot immediately and switch to preview tab
//     captureUrlScreenshot(url);
//     
//     try {
//       addChatMessage('Scraping website content...', 'system');
//       const scrapeResponse = await fetch('/api/scrape-url-enhanced', {
//         method: 'POST',
//         headers: { 'Content-Type': 'application/json' },
//         body: JSON.stringify({ url })
//       });
//       
//       if (!scrapeResponse.ok) {
//         throw new Error(`Scraping failed: ${scrapeResponse.status}`);
//       }
//       
//       const scrapeData = await scrapeResponse.json();
//       
//       if (!scrapeData.success) {
//         throw new Error(scrapeData.error || 'Failed to scrape website');
//       }
//       
//       addChatMessage(`Scraped ${scrapeData.content.length} characters from ${url}`, 'system');
//       
//       // Clear preparing design state and switch to generation tab
//       setIsPreparingDesign(false);
//       setActiveTab('generation');
//       
//       setConversationContext(prev => ({
//         ...prev,
//         scrapedWebsites: [...prev.scrapedWebsites, {
//           url,
//           content: scrapeData,
//           timestamp: new Date()
//         }],
//         currentProject: `Clone of ${url}`
//       }));
//       
//       // Start sandbox creation in parallel with code generation
//       let sandboxPromise: Promise<any> | null = null;
//       if (!sandboxData) {
//         addChatMessage('Creating sandbox while generating your React app...', 'system');
//         sandboxPromise = createSandbox(true);
//       }
//       
//       addChatMessage('Analyzing and generating React recreation...', 'system');
//       
//       const recreatePrompt = `I scraped this website and want you to recreate it as a modern React application.
// 
// URL: ${url}
// 
// SCRAPED CONTENT:
// ${scrapeData.content}
// 
// ${homeContextInput ? `ADDITIONAL CONTEXT/REQUIREMENTS FROM USER:
// ${homeContextInput}
// 
// Please incorporate these requirements into the design and implementation.` : ''}
// 
// REQUIREMENTS:
// 1. Create a COMPLETE React application with App.jsx as the main component
// 2. App.jsx MUST import and render all other components
// 3. Recreate the main sections and layout from the scraped content
// 4. ${homeContextInput ? `Apply the user's context/theme: "${homeContextInput}"` : `Use a modern dark theme with excellent contrast:
//    - Background: #0a0a0a
//    - Text: #ffffff
//    - Links: #60a5fa
//    - Accent: #3b82f6`}
// 5. Make it fully responsive
// 6. Include hover effects and smooth transitions
// 7. Create separate components for major sections (Header, Hero, Features, etc.)
// 8. Use semantic HTML5 elements
// 
// IMPORTANT CONSTRAINTS:
// - DO NOT use React Router or any routing libraries
// - Use regular <a> tags with href="#section" for navigation, NOT Link or NavLink components
// - This is a single-page application, no routing needed
// - ALWAYS create src/App.jsx that imports ALL components
// - Each component should be in src/components/
// - Use Tailwind CSS for ALL styling (no custom CSS files)
// - Make sure the app actually renders visible content
// - Create ALL components that you reference in imports
// 
// IMAGE HANDLING RULES:
// - When the scraped content includes images, USE THE ORIGINAL IMAGE URLS whenever appropriate
// - Keep existing images from the scraped site (logos, product images, hero images, icons, etc.)
// - Use the actual image URLs provided in the scraped content, not placeholders
// - Only use placeholder images or generic services when no real images are available
// - For company logos and brand images, ALWAYS use the original URLs to maintain brand identity
// - If scraped data contains image URLs, include them in your img tags
// - Example: If you see "https://example.com/logo.png" in the scraped content, use that exact URL
// 
// Focus on the key sections and content, making it clean and modern while preserving visual assets.`;
//       
//       setGenerationProgress(prev => ({
//         isGenerating: true,
//         status: 'Initializing AI...',
//         components: [],
//         currentComponent: 0,
//         streamedCode: '',
//         isStreaming: true,
//         isThinking: false,
//         thinkingText: undefined,
//         thinkingDuration: undefined,
//         // Keep previous files until new ones are generated
//         files: prev.files || [],
//         currentFile: undefined,
//         lastProcessedPosition: 0
//       }));
//       
//       // Switch to generation tab when starting
//       setActiveTab('generation');
//       
//       const aiResponse = await fetch('/api/generate-ai-code-stream', {
//         method: 'POST',
//         headers: { 'Content-Type': 'application/json' },
//         body: JSON.stringify({
//           prompt: recreatePrompt,
//           model: aiModel,
//           context: {
//             sandboxId: sandboxData?.id,
//             structure: structureContent,
//             conversationContext: conversationContext
//           }
//         })
//       });
//       
//       if (!aiResponse.ok) {
//         throw new Error(`AI generation failed: ${aiResponse.status}`);
//       }
//       
//       const reader = aiResponse.body?.getReader();
//       const decoder = new TextDecoder();
//       let generatedCode = '';
//       let explanation = '';
//       
//       if (reader) {
//         while (true) {
//           const { done, value } = await reader.read();
//           if (done) break;
//           
//           const chunk = decoder.decode(value);
//           const lines = chunk.split('\n');
//           
//           for (const line of lines) {
//             if (line.startsWith('data: ')) {
//               try {
//                 const data = JSON.parse(line.slice(6));
//                 
//                 if (data.type === 'status') {
//                   setGenerationProgress(prev => ({ ...prev, status: data.message }));
//                 } else if (data.type === 'thinking') {
//                   setGenerationProgress(prev => ({ 
//                     ...prev, 
//                     isThinking: true,
//                     thinkingText: (prev.thinkingText || '') + data.text
//                   }));
//                 } else if (data.type === 'thinking_complete') {
//                   setGenerationProgress(prev => ({ 
//                     ...prev, 
//                     isThinking: false,
//                     thinkingDuration: data.duration
//                   }));
//                 } else if (data.type === 'conversation') {
//                   // Add conversational text to chat only if it's not code
//                   let text = data.text || '';
//                   
//                   // Remove package tags from the text
//                   text = text.replace(/<package>[^<]*<\/package>/g, '');
//                   text = text.replace(/<packages>[^<]*<\/packages>/g, '');
//                   
//                   // Filter out any XML tags and file content that slipped through
//                   if (!text.includes('<file') && !text.includes('import React') && 
//                       !text.includes('export default') && !text.includes('className=') &&
//                       text.trim().length > 0) {
//                     addChatMessage(text.trim(), 'ai');
//                   }
//                 } else if (data.type === 'stream' && data.raw) {
//                   setGenerationProgress(prev => ({ 
//                     ...prev, 
//                     streamedCode: prev.streamedCode + data.text,
//                     lastProcessedPosition: prev.lastProcessedPosition || 0
//                   }));
//                 } else if (data.type === 'component') {
//                   setGenerationProgress(prev => ({
//                     ...prev,
//                     status: `Generated ${data.name}`,
//                     components: [...prev.components, { 
//                       name: data.name,
//                       path: data.path,
//                       completed: true
//                     }],
//                     currentComponent: prev.currentComponent + 1
//                   }));
//                 } else if (data.type === 'complete') {
//                   generatedCode = data.generatedCode;
//                   explanation = data.explanation;
//                   
//                   // Save the last generated code
//                   setConversationContext(prev => ({
//                     ...prev,
//                     lastGeneratedCode: generatedCode
//                   }));
//                 }
//               } catch (e) {
//                 console.error('Error parsing streaming data:', e);
//               }
//             }
//           }
//         }
//       }
//       
//       setGenerationProgress(prev => ({
//         ...prev,
//         isGenerating: false,
//         isStreaming: false,
//         status: 'Generation complete!',
//         isEdit: prev.isEdit
//       }));
//       
//       if (generatedCode) {
//         addChatMessage('AI recreation generated!', 'system');
//         
//         // Add the explanation to chat if available
//         if (explanation && explanation.trim()) {
//           addChatMessage(explanation, 'ai');
//         }
//         
//         setPromptInput(generatedCode);
//         // Don't show the Generated Code panel by default
//         // setLeftPanelVisible(true);
//         
//         // Wait for sandbox creation if it's still in progress
//         let activeSandboxData = sandboxData;
//         if (sandboxPromise) {
//           addChatMessage('Waiting for sandbox to be ready...', 'system');
//           try {
//             const newSandboxData = await sandboxPromise;
//             if (newSandboxData) {
//               activeSandboxData = newSandboxData;
//             }
//             // Remove the waiting message
//             setChatMessages(prev => prev.filter(msg => msg.content !== 'Waiting for sandbox to be ready...'));
//           } catch (error: any) {
//             addChatMessage('Sandbox creation failed. Cannot apply code.', 'system');
//             throw error;
//           }
//         }
//         
//         // Only apply code if we have sandbox data
//         if (activeSandboxData) {
//           // First application for cloned site should not be in edit mode
//           await applyGeneratedCode(generatedCode, false);
//         }
//         
//         addChatMessage(
//           `Successfully recreated ${url} as a modern React app${homeContextInput ? ` with your requested context: "${homeContextInput}"` : ''}! The scraped content is now in my context, so you can ask me to modify specific sections or add features based on the original site.`, 
//           'ai',
//           {
//             scrapedUrl: url,
//             scrapedContent: scrapeData,
//             generatedCode: generatedCode
//           }
//         );
//         
//         setUrlInput('');
//         setUrlStatus([]);
//         setHomeContextInput('');
//         
//         // Clear generation progress and all screenshot/design states
//         setGenerationProgress(prev => ({
//           ...prev,
//           isGenerating: false,
//           isStreaming: false,
//           status: 'Generation complete!'
//         }));
//         
//         // Clear screenshot and preparing design states to prevent them from showing on next run
//         setUrlScreenshot(null);
//         setIsPreparingDesign(false);
//         setTargetUrl('');
//         setScreenshotError(null);
//         setLoadingStage(null); // Clear loading stage
//         setShowLoadingBackground(false); // Clear loading background
//         
//         setTimeout(() => {
//           // Switch back to preview tab but keep files
//           setActiveTab('preview');
//         }, 1000); // Show completion briefly then switch
//       } else {
//         throw new Error('Failed to generate recreation');
//       }
//       
//     } catch (error: any) {
//       addChatMessage(`Clone generation failed: ${error.message}`, 'system');
//       setUrlStatus([]);
//       setIsPreparingDesign(false);
//       // Clear all states on error
//       setUrlScreenshot(null);
//       setTargetUrl('');
//       setScreenshotError(null);
//       setLoadingStage(null);
//       setGenerationProgress(prev => ({
//         ...prev,
//         isGenerating: false,
//         isStreaming: false,
//         status: '',
//         // Keep files to display in sidebar
//         files: prev.files
//       }));
//       setActiveTab('preview');
//     }
//   };

  const captureUrlScreenshot = async (url: string) => {
    setIsCapturingScreenshot(true);
    setScreenshotError(null);
    try {
      const response = await fetch('/api/scrape-screenshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      
      const data = await response.json();
      if (data.success && data.screenshot) {
        setIsScreenshotLoaded(false); // Reset loaded state for new screenshot
        setUrlScreenshot(data.screenshot);
        // Set preparing design state
        setIsPreparingDesign(true);
        // Store the clean URL for display
        const cleanUrl = url.replace(/^https?:\/\//i, '');
        setTargetUrl(cleanUrl);
        // Switch to preview tab to show the screenshot
        if (activeTab !== 'preview') {
          setActiveTab('preview');
        }
      } else {
        setScreenshotError(data.error || 'Failed to capture screenshot');
      }
    } catch (error) {
      console.error('Failed to capture screenshot:', error);
      setScreenshotError('Network error while capturing screenshot');
    } finally {
      setIsCapturingScreenshot(false);
    }
  };

  const handleHomeScreenSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await startGeneration();
  };

  const startGeneration = async () => {
    if (!homeUrlInput.trim()) return;
    
    setHomeScreenFading(true);
    
    // Set immediate loading state for better UX
    setIsStartingNewGeneration(true);
    setLoadingStage('gathering');
    
    // Immediately switch to preview tab to show loading
    setActiveTab('preview');
    
    // Set loading background to ensure proper visual feedback
    setShowLoadingBackground(true);
    
    // Clear messages and immediately show the initial message
    setChatMessages([]);
    let displayUrl = homeUrlInput.trim();
    if (!displayUrl.match(/^https?:\/\//i)) {
      displayUrl = 'https://' + displayUrl;
    }
    // Remove protocol for cleaner display
    const cleanUrl = displayUrl.replace(/^https?:\/\//i, '');

    const storedIntent = sessionStorage.getItem('generationIntent') || undefined;
    const generationIntent = resolveGenerationIntent({
      explicitIntent: storedIntent,
      instructions: homeContextInput,
      url: homeUrlInput
    });
    const isInspirationMode = generationIntent === 'inspire';
    sessionStorage.removeItem('generationIntent');

    addChatMessage(
      generationIntent === 'scratch'
        ? 'Starting a new project from scratch...'
        : isInspirationMode
          ? `Analyzing ${cleanUrl} for visual direction...`
          : `Starting a faithful recreation of ${cleanUrl}...`,
      'system'
    );
    
    // Start creating sandbox and capturing screenshot immediately in parallel
    const sandboxPromise = !sandboxData ? createSandbox(true) : Promise.resolve(sandboxData);
    
    // Set loading stage immediately before hiding home screen
    setLoadingStage('gathering');
    // Also ensure we're on preview tab to show the loading overlay
    setActiveTab('preview');
    
    // Always capture screenshot for new URLs, even if sandbox exists
    // This ensures the loading screen shows properly
    captureUrlScreenshot(displayUrl);
    
    setTimeout(async () => {
      setShowHomeScreen(false);
      setHomeScreenFading(false);
      
      // Clear the starting flag after transition
      setTimeout(() => {
        setIsStartingNewGeneration(false);
      }, 1000);
      
      // Wait for sandbox to be ready (if it's still creating)
      const createdSandbox = await sandboxPromise;
      const activeSandboxData = createdSandbox || sandboxData;
      
      // Now start the clone process which will stream the generation
      setUrlInput(homeUrlInput);
      setUrlOverlayVisible(false); // Make sure overlay is closed
      setUrlStatus(['Scraping website content...']);
      
      const isFromScratch = generationIntent === 'scratch';
      const filesBeforeGeneration = generationProgress.files;

      try {
        // Scrape the website
        let url = homeUrlInput.trim();
        if (!url.match(/^https?:\/\//i)) {
          url = 'https://' + url;
        }

        const inspirationPrompt = homeContextInput.trim();

        // Screenshot is already being captured in parallel above

        let scrapeData: ScrapeData | undefined;
        let brandGuidelines: any;

        if (isInspirationMode) {
          // === INSPIRATION / BRAND EXTENSION MODE ===
          addChatMessage('Extracting brand styles from the website...', 'system');

          // Call the brand extraction endpoint
          const extractResponse = await fetch('/api/extract-brand-styles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              url,
              prompt: inspirationPrompt
            })
          });

          if (!extractResponse.ok) {
            throw new Error('Failed to extract brand styles');
          }

          brandGuidelines = await extractResponse.json();

          if (!brandGuidelines.success) {
            throw new Error(brandGuidelines.error || 'Failed to extract brand styles');
          }

          // Display branding summary with visual UI
          addChatMessage(`Acquired branding format from ${cleanUrl}`, 'system', {
            brandingData: brandGuidelines.guidelines,
            sourceUrl: cleanUrl
          });
          addChatMessage(`Building your custom component using these brand guidelines...`, 'system');

        } else if (url.startsWith('scratch://')) {
          // === BUILD FROM SCRATCH MODE ===
          scrapeData = {
            success: true,
            content: 'Starting a blank canvas project from scratch.',
            title: sessionStorage.getItem('projectName') || 'Blank Canvas',
            source: 'blank-canvas'
          };
          addChatMessage('Initializing a brand new project from scratch...', 'system');
        } else {
          // === NORMAL CLONE MODE ===
          // Check if we have pre-scraped markdown content from search results
          const storedMarkdown = sessionStorage.getItem('siteMarkdown');
          if (storedMarkdown) {
            // Use the pre-scraped content
            scrapeData = {
              success: true,
              content: storedMarkdown,
              title: new URL(url).hostname,
              source: 'search-result'
            };
            sessionStorage.removeItem('siteMarkdown'); // Clear after use
            addChatMessage('Using cached content from search results...', 'system');
          } else {
            // Perform fresh scraping
            const scrapeResponse = await fetch('/api/scrape-url-enhanced', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ url })
            });
            
            if (!scrapeResponse.ok) {
              throw new Error('Failed to scrape website');
            }
            
            scrapeData = await scrapeResponse.json() as ScrapeData;
            
            if (!scrapeData.success) {
              throw new Error(scrapeData.error || 'Failed to scrape website');
            }
          }
        }

        setUrlStatus(isInspirationMode ? ['Visual system extracted!', 'Building an original application...'] : ['Website scraped successfully!', 'Generating React app...']);

        // Clear preparing design state and switch to generation tab
        setIsPreparingDesign(false);
        setIsScreenshotLoaded(false); // Reset loaded state
        setUrlScreenshot(null); // Clear screenshot when starting generation
        setTargetUrl(''); // Clear target URL

        // Update loading stage to planning
        setLoadingStage('planning');

        // Brief pause before switching to generation tab
        setTimeout(() => {
          setLoadingStage('generating');
          setActiveTab('generation');
        }, 1500);

        // Build the appropriate prompt based on mode
        let prompt;

        if (isInspirationMode && brandGuidelines) {
          // === BRAND EXTENSION PROMPT ===
          // Store brand guidelines in conversation context
          setConversationContext(prev => ({
            ...prev,
            scrapedWebsites: [...prev.scrapedWebsites, {
              url: url,
              content: { brandGuidelines },
              timestamp: new Date()
            }],
            currentProject: `Custom build using ${url} brand`
          }));

          // Extract comprehensive brand data
          const branding = brandGuidelines.guidelines;

          // Build detailed brand instruction string
          const brandInstructions = `
BRAND GUIDELINES FROM ${url}:

COLOR SYSTEM:
- Color Scheme: ${branding.colorScheme || 'light'} mode
- Primary Color: ${branding.colors?.primary || 'not specified'}
- Accent Color: ${branding.colors?.accent || 'not specified'}
- Background: ${branding.colors?.background || 'not specified'}
- Text Primary: ${branding.colors?.textPrimary || 'not specified'}
- Link Color: ${branding.colors?.link || 'not specified'}

TYPOGRAPHY:
- Primary Font: ${branding.typography?.fontFamilies?.primary || 'system default'}
- Heading Font: ${branding.typography?.fontFamilies?.heading || 'system default'}
- Font Stack (Body): ${branding.typography?.fontStacks?.body?.join(', ') || 'system-ui, sans-serif'}
- Font Stack (Heading): ${branding.typography?.fontStacks?.heading?.join(', ') || 'system-ui, sans-serif'}
- H1 Size: ${branding.typography?.fontSizes?.h1 || '36px'}
- H2 Size: ${branding.typography?.fontSizes?.h2 || '30px'}
- Body Size: ${branding.typography?.fontSizes?.body || '16px'}

SPACING & LAYOUT:
- Base Spacing Unit: ${branding.spacing?.baseUnit || '4'}px
- Border Radius: ${branding.spacing?.borderRadius || '6px'}

BUTTON STYLES:
Primary Button:
  - Background: ${branding.components?.buttonPrimary?.background || branding.colors?.primary}
  - Text Color: ${branding.components?.buttonPrimary?.textColor || '#FFFFFF'}
  - Border Radius: ${branding.components?.buttonPrimary?.borderRadius || branding.spacing?.borderRadius || '8px'}
  - Shadow: ${branding.components?.buttonPrimary?.shadow || 'none'}

Secondary Button:
  - Background: ${branding.components?.buttonSecondary?.background || '#F9F9F9'}
  - Text Color: ${branding.components?.buttonSecondary?.textColor || branding.colors?.textPrimary}
  - Border Radius: ${branding.components?.buttonSecondary?.borderRadius || branding.spacing?.borderRadius || '8px'}
  - Shadow: ${branding.components?.buttonSecondary?.shadow || 'none'}

INPUT FIELDS:
- Border Color: ${branding.components?.input?.borderColor || '#CCCCCC'}
- Border Radius: ${branding.components?.input?.borderRadius || branding.spacing?.borderRadius || '6px'}

BRAND PERSONALITY:
- Tone: ${branding.personality?.tone || 'professional'}
- Energy: ${branding.personality?.energy || 'medium'}
- Target Audience: ${branding.personality?.targetAudience || 'general'}

DESIGN SYSTEM:
- Framework: ${branding.designSystem?.framework || 'tailwind'}
- Component Library: ${branding.designSystem?.componentLibrary || 'custom'}

ASSETS:
${branding.images?.logo ? `- Logo Available: Yes (use carefully if needed)` : '- Logo: Not available'}
${branding.images?.favicon ? `- Favicon: ${branding.images.favicon}` : ''}`;

          prompt = `I want you to build a NEW React component/application based on these brand guidelines and the user's requirements.

<branding-format source="${url}">
${brandInstructions}

RAW BRAND DATA (for reference):
${JSON.stringify(branding, null, 2)}
</branding-format>

USER'S REQUEST:
${inspirationPrompt || 'Build an original, premium application using these brand guidelines'}

IMPORTANT: The content above in the <branding-format> tags contains the extracted brand guidelines from ${url}.
Use these guidelines (colors, fonts, spacing, design patterns) to build what the user requested.

CRITICAL REQUIREMENTS:
- DO NOT recreate the original website at ${url}
- DO create a COMPLETELY NEW component that fulfills the user's request
- The user wants: "${inspirationPrompt}"
- DO NOT invent analytics, reach, sentiment, percentages, or performance metrics. Use qualitative labels or clearly marked unavailable states unless the user supplied real data.
- Build ONLY what the user requested - nothing more
- App.jsx should render ONLY the requested component - no extra Header/Footer/Hero unless specifically requested
- Make it a minimal, focused implementation of the user's request

STYLING REQUIREMENTS:
- Apply the EXACT colors from the brand palette (primary, accent, background, text colors)
- Use the EXACT typography (font families, font sizes for h1, h2, body)
- Apply the spacing system (base unit: ${branding.spacing?.baseUnit || '4'}px)
- Use the specified border radius (${branding.spacing?.borderRadius || '6px'}) consistently
- Implement button styles EXACTLY as specified (colors, shadows, border radius)
- Style input fields with the exact border color and border radius
- Match the brand's ${branding.colorScheme || 'light'} color scheme
- Apply the brand personality: ${branding.personality?.tone || 'professional'} tone with ${branding.personality?.energy || 'medium'} energy
- Use Tailwind CSS with inline color values matching the brand palette EXACTLY
- If fonts need to be imported, add @import or @font-face rules to index.css
- Create custom CSS classes in index.css for complex shadows/effects that can't be done with Tailwind

FONT SETUP:
${branding.typography?.fontFamilies?.primary ? `
- Add font family "${branding.typography.fontFamilies.primary}" to your CSS
- Use font stack: ${branding.typography?.fontStacks?.body?.join(', ') || 'system-ui, sans-serif'}
- Set body font size to ${branding.typography?.fontSizes?.body || '16px'}` : '- Use system fonts'}

COMPONENT STRUCTURE:
- src/index.css - Include brand fonts, custom shadows/effects, and base styling
- src/App.jsx - Should ONLY render the requested component (e.g., just <PricingPage /> if user wants pricing)
- src/components/[RequestedComponent].jsx - The actual component fulfilling the user's request

TECHNICAL REQUIREMENTS:
- Create a WORKING, self-contained application
- DO NOT import components that don't exist
- Make sure the app renders immediately with visible content
- All colors must match the brand palette EXACTLY
- All spacing must use the ${branding.spacing?.baseUnit || '4'}px base unit
- Buttons must have the exact styling specified in the guidelines

Focus on building something NEW, minimal, and functional that perfectly matches the ${brandGuidelines.styleName || 'brand'} aesthetic and design system.`;

        } else {
          // === NORMAL CLONE MODE PROMPT OR BUILD FROM SCRATCH PROMPT ===
          if (!scrapeData && !isFromScratch) {
            throw new Error('Scrape data is missing');
          }
          
          setConversationContext(prev => ({
            ...prev,
            scrapedWebsites: [...prev.scrapedWebsites, {
              url: url,
              content: scrapeData || { success: true, title: 'Blank App', content: 'From Scratch' },
              timestamp: new Date()
            }],
            currentProject: isFromScratch ? (sessionStorage.getItem('projectName') || 'New Project') : `${url} Clone`
          }));

          // Filter out style-related context when using screenshot/URL-based generation
          // Only keep user's explicit instructions, not inherited styles
          let filteredContext = homeContextInput;
          if (homeUrlInput && homeContextInput) {
            // Check if the context contains default style names that shouldn't be inherited
            const stylePatterns = [
              'Glassmorphism style design',
              'Neumorphism style design',
              'Brutalism style design',
              'Minimalist style design',
              'Dark Mode style design',
              'Gradient Rich style design',
              '3D Depth style design',
              'Retro Wave style design',
              'Modern clean and minimalist style design',
              'Fun colorful and playful style design',
              'Corporate professional and sleek style design',
              'Creative artistic and unique style design'
            ];

            // If the context exactly matches or starts with a style pattern, filter it out
            const startsWithStyle = stylePatterns.some(pattern =>
              homeContextInput.trim().startsWith(pattern)
            );

            if (startsWithStyle) {
              // Extract only the additional instructions part after the style
              const additionalMatch = homeContextInput.match(/\. (.+)$/);
              filteredContext = additionalMatch ? additionalMatch[1] : '';
            }
          }

          if (isFromScratch) {
            const styleName = sessionStorage.getItem('selectedStyle') || 'Minimalist';
            prompt = `Create a brand new React application from scratch.

PROJECT NAME: ${sessionStorage.getItem('projectName') || 'Blank Canvas'}
DESIGN PREFERENCE / STYLE: ${styleName}

USER SPECIFICATIONS / REQUIREMENTS:
${filteredContext || 'Create a premium, modern dashboard landing page.'}

IMPORTANT INSTRUCTIONS:
- Create a COMPLETE, working React application
- Implement a modern, premium UI/UX following the requested style
- Use Tailwind CSS for all styling (no custom CSS files)
- Write clean React components, utilizing standard hook imports
- Avoid placeholders; write real, working code.
- Make sure the app renders immediately with visible content.`;
          } else {
            prompt = `I want to recreate the ${url} website as a complete React application based on the scraped content below.

${JSON.stringify(scrapeData, null, 2)}

${filteredContext ? `ADDITIONAL CONTEXT/REQUIREMENTS FROM USER:
${filteredContext}

Please incorporate these requirements into the design and implementation.` : ''}

IMPORTANT INSTRUCTIONS:
- Create a COMPLETE, working React application
- Implement ALL sections and features from the original site
- Use Tailwind CSS for all styling (no custom CSS files)
- Make it responsive and modern
- Ensure all text content matches the original
- Create proper component structure
- Make sure the app actually renders visible content
- Create ALL components that you reference in imports
${filteredContext ? '- Apply the user\'s context/theme requirements throughout the application' : ''}

Focus on the key sections and content, making it clean and modern.`;
          }
        }

        setGenerationProgress(prev => ({
          isGenerating: true,
          status: 'Initializing AI...',
          components: [],
          currentComponent: 0,
          streamedCode: '',
          isStreaming: true,
          isThinking: false,
          thinkingText: undefined,
          thinkingDuration: undefined,
          // Keep previous files until new ones are generated
          files: prev.files || [],
          currentFile: undefined,
          lastProcessedPosition: 0
        }));
        
        // Abort any active generation stream
        if (activeGenerationStreamRef.current) {
          activeGenerationStreamRef.current.abort();
        }
        const abortController = new AbortController();
        activeGenerationStreamRef.current = abortController;
        addChatMessage('Thinking...', 'ai');

        const aiResponse = await fetch('/api/generate-ai-code-stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: abortController.signal,
          body: JSON.stringify({ 
            prompt,
            model: generationMode === 'plan' ? planningModel : coderModel,
            generationMode,
            planningModel,
            coderModel,
            qaModel,
            generationIntent,
            context: {
              sandboxId: activeSandboxData?.sandboxId,
              structure: structureContent,
              conversationContext: conversationContext
            }
          })
        });
        
        if (!aiResponse.ok) {
          throw new Error(`HTTP error! status: ${aiResponse.status}`);
        }
        
        const reader = aiResponse.body?.getReader();
        const decoder = new TextDecoder();
        let generatedCode = '';
        let explanation = '';
        let buffer = ''; // Buffer for incomplete lines
        
        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value, { stream: true });
            console.log('[startGeneration] Received chunk:', chunk.length, 'bytes');
            buffer += chunk;
            const lines = buffer.split('\n');
            
            // Keep the last line in buffer if it's incomplete
            buffer = lines.pop() || '';
            
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                let data: any;
                try {
                  data = JSON.parse(line.slice(6));
                } catch (e) {
                  console.error('Failed to parse SSE data:', e);
                  continue;
                }

                if (data.type === 'error') {
                  throw new Error(data.error || data.message || 'Generation provider failed');
                }

                if (data.type === 'status') {
                    setGenerationProgress(prev => ({ ...prev, status: data.message }));
                  } else if (data.type === 'thinking') {
                    setGenerationProgress(prev => ({ 
                      ...prev, 
                      isThinking: true,
                      thinkingText: (prev.thinkingText || '') + data.text
                    }));
                  } else if (data.type === 'thinking_complete') {
                    setGenerationProgress(prev => ({ 
                      ...prev, 
                      isThinking: false,
                      thinkingDuration: data.duration
                    }));
                  } else if (data.type === 'conversation') {
                    // Add conversational text to chat only if it's not code
                    let text = data.text || '';
                    
                    // Remove package tags from the text
                    text = text.replace(/<package>[^<]*<\/package>/g, '');
                    text = text.replace(/<packages>[^<]*<\/packages>/g, '');
                    
                    // Filter out any XML tags and file content that slipped through
                    if (!text.includes('<file') && !text.includes('import React') && 
                        !text.includes('export default') && !text.includes('className=') &&
                        text.length > 0) {
                      explanation += text;
                      appendTokensToLastAiMessage(text);
                    }
                  } else if (data.type === 'stream' && data.raw) {
                  setGenerationProgress(prev => {
                    const newStreamedCode = prev.streamedCode + data.text;
                    
                    // Tab is already switched after scraping
                    
                    const updatedState = { 
                      ...prev, 
                      streamedCode: newStreamedCode,
                      isStreaming: true,
                      isThinking: false,
                      status: 'Generating code...'
                    };
                    
                    // Process complete files from the accumulated stream
                    const fileRegex = /<file path="([^"]+)">([^]*?)<\/file>/g;
                    let match;
                    const processedFiles = new Set(prev.files.map(f => f.path));
                    
                    while ((match = fileRegex.exec(newStreamedCode)) !== null) {
                      const filePath = match[1];
                      const fileContent = match[2];
                      
                      // Only add if we haven't processed this file yet
                      if (!processedFiles.has(filePath)) {
                        const fileExt = filePath.split('.').pop() || '';
                        const fileType = fileExt === 'jsx' || fileExt === 'js' ? 'javascript' :
                                        fileExt === 'css' ? 'css' :
                                        fileExt === 'json' ? 'json' :
                                        fileExt === 'html' ? 'html' : 'text';
                        
                        // Check if file already exists
                        const existingFileIndex = updatedState.files.findIndex(f => f.path === filePath);
                        
                        if (existingFileIndex >= 0) {
                          // Update existing file and mark as edited
                          updatedState.files = [
                            ...updatedState.files.slice(0, existingFileIndex),
                            {
                              ...updatedState.files[existingFileIndex],
                              content: fileContent.trim(),
                              type: fileType,
                              completed: true,
                              edited: true
                            },
                            ...updatedState.files.slice(existingFileIndex + 1)
                          ];
                        } else {
                          // Add new file
                          updatedState.files = [...updatedState.files, {
                            path: filePath,
                            content: fileContent.trim(),
                            type: fileType,
                            completed: true,
                            edited: false
                          }];
                        }
                        
                        // Only show file status if not in edit mode
                        if (!prev.isEdit) {
                          updatedState.status = `Completed ${filePath}`;
                        }
                        processedFiles.add(filePath);
                      }
                    }
                    
                    // Check for current file being generated (incomplete file at the end)
                    const lastFileMatch = newStreamedCode.match(/<file path="([^"]+)">([^]*?)$/);
                    if (lastFileMatch && !lastFileMatch[0].includes('</file>')) {
                      const filePath = lastFileMatch[1];
                      const partialContent = lastFileMatch[2];
                      
                      if (!processedFiles.has(filePath)) {
                        const fileExt = filePath.split('.').pop() || '';
                        const fileType = fileExt === 'jsx' || fileExt === 'js' ? 'javascript' :
                                        fileExt === 'css' ? 'css' :
                                        fileExt === 'json' ? 'json' :
                                        fileExt === 'html' ? 'html' : 'text';
                        
                        updatedState.currentFile = { 
                          path: filePath, 
                          content: partialContent, 
                          type: fileType 
                        };
                        // Only show file status if not in edit mode
                        if (!prev.isEdit) {
                          updatedState.status = `Generating ${filePath}`;
                        }
                      }
                    } else {
                      updatedState.currentFile = undefined;
                    }
                    
                    return updatedState;
                  });
                  } else if (data.type === "validation") {
                    setGenerationProgress((previous) => ({
                      ...previous,
                      status: data.repairCount > 0
                        ? `Quality gate passed after ${data.repairCount} repair`
                        : "Quality gate passed",
                    }));
                  } else if (data.type === 'complete') {
                    generatedCode = data.generatedCode;
                    explanation = data.explanation;
                  
                  // Save the last generated code
                  setConversationContext(prev => ({
                    ...prev,
                      lastGeneratedCode: generatedCode
                    }));
                  }
              }
            }
        }
      }
        
        setGenerationProgress(prev => ({
          ...prev,
          isGenerating: false,
          isStreaming: false,
          status: 'Generation complete!'
        }));
        
        if (generatedCode) {
          addChatMessage('AI recreation generated!', 'system');
          
          setPromptInput(generatedCode);

          // Apply the code (first time is not edit mode)
          await applyGeneratedCode(generatedCode, false, activeSandboxData);

          const successContent = isInspirationMode
            ? `Built an original application using visual direction extracted from ${cleanUrl}. You can now refine the layout, content, or interactions.`
            : `Successfully recreated ${url} as a modern React app${homeContextInput ? ` with your requested context: "${homeContextInput}"` : ''}! The scraped content is now in my context, so you can ask me to modify specific sections or add features based on the original site.`;

          setChatMessages(prev => {
            if (prev.length === 0) return prev;
            const newMessages = [...prev];
            for (let i = newMessages.length - 1; i >= 0; i--) {
              if (newMessages[i].type === 'ai') {
                newMessages[i] = {
                  ...newMessages[i],
                  content: explanation || successContent,
                  metadata: {
                    ...newMessages[i].metadata,
                    scrapedUrl: url,
                    scrapedContent: isInspirationMode ? { brandGuidelines } : scrapeData,
                    generatedCode: generatedCode
                  }
                };
                break;
              }
            }
            return newMessages;
          });
          
          setConversationContext(prev => ({
            ...prev,
            generatedComponents: [],
            appliedCode: [...prev.appliedCode, {
              files: [],
              timestamp: new Date()
            }]
          }));
        } else {
          throw new Error('Failed to generate recreation');
        }
        
        setUrlInput('');
        setUrlStatus([]);
        setHomeContextInput('');
        
        // Clear generation progress and all screenshot/design states
        setGenerationProgress(prev => ({
          ...prev,
          isGenerating: false,
          isStreaming: false,
          status: 'Generation complete!'
        }));
        
        // Clear screenshot and preparing design states to prevent them from showing on next run
        setIsScreenshotLoaded(false); // Reset loaded state
        setUrlScreenshot(null);
        setIsPreparingDesign(false);
        setTargetUrl('');
        setScreenshotError(null);
        setLoadingStage(null); // Clear loading stage
        setIsStartingNewGeneration(false); // Clear new generation flag
        setShowLoadingBackground(false); // Clear loading background
        
        setTimeout(() => {
          // Switch back to preview tab but keep files
          setActiveTab('preview');
        }, 1000); // Show completion briefly then switch
      } catch (error: any) {
        const failurePrefix = isFromScratch
          ? 'Generation failed'
          : isInspirationMode
            ? 'Inspiration build failed'
            : 'Clone generation failed';
        const failureMessage = `${failurePrefix}: ${error.message}`;
        setChatMessages(prev => {
          const next = [...prev];
          let replacedThinkingMessage = false;
          for (let index = next.length - 1; index >= 0; index--) {
            if (next[index].type === 'ai' && next[index].content === 'Thinking...') {
              next[index] = {
                ...next[index],
                type: 'error',
                content: failureMessage
              };
              replacedThinkingMessage = true;
              break;
            }
          }
          if (!replacedThinkingMessage) {
            next.push({ content: failureMessage, type: 'error', timestamp: new Date() });
          }
          return next;
        });
        setUrlStatus([]);
        setIsPreparingDesign(false);
        setIsStartingNewGeneration(false); // Clear new generation flag on error
        setLoadingStage(null);
        // Also clear generation progress on error
        setGenerationProgress(prev => ({
          ...prev,
          isGenerating: false,
          isStreaming: false,
          isThinking: false,
          status: '',
          streamedCode: '',
          currentFile: undefined,
          files: filesBeforeGeneration
        }));
      }
    }, 500);
  };

  return (
    <HeaderProvider>
      <div data-testid="generation-workspace" className={`${styles.workspace} font-sans dark:bg-neutral-950 text-foreground h-screen flex flex-col`}>
      <div className={`${styles.topbar} backdrop-blur-md px-16 py-10 border-b flex items-center justify-between shadow-sm z-30`}>
        <div className="flex items-center gap-12">
          <button 
            type="button"
            onClick={() => router.push('/')} 
            className="hover:opacity-85 transition-all focus:outline-none flex-shrink-0"
            title="Back to home dashboard"
          >
            <HeaderBrandKit />
          </button>
          <div className="h-16 w-[1px] bg-neutral-200 dark:bg-neutral-800 flex-shrink-0" />
          
          {/* Lovable Title and Settings Dropdown Menu */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowProjectDropdown(!showProjectDropdown)}
              aria-label="Open project actions"
              className={`${styles.projectSwitcher} flex items-center gap-6 text-xs font-bold text-neutral-800 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800 px-10 py-6 rounded-lg transition-all border border-neutral-200/40 dark:border-neutral-800/40 shadow-sm`}
            >
              <span>{sessionStorage.getItem('projectName') || 'Active Project'}</span>
              <svg className="w-3.5 h-3.5 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showProjectDropdown && (
              <div className="absolute left-0 mt-8 w-260 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl shadow-xl z-50 p-16 text-xs text-neutral-755 dark:text-neutral-300 animate-fade-in-up">
                {/* Active Project & Sandbox Header */}
                <div className="pb-12 border-b border-neutral-100 dark:border-neutral-805 mb-12">
                  <div className="flex items-center gap-8 mb-8">
                    <div className="w-24 h-24 bg-orange-655 rounded-full flex items-center justify-center text-white text-[10px] font-extrabold shadow-sm select-none">
                      {sessionStorage.getItem('projectName') ? sessionStorage.getItem('projectName')!.charAt(0).toUpperCase() : 'P'}
                    </div>
                    <div className="font-bold text-neutral-900 dark:text-white truncate flex-1">
                      {sessionStorage.getItem('projectName') || 'Active Project'}
                    </div>
                    <span className="text-[8px] font-bold px-6 py-2 bg-green-500/10 text-green-600 rounded-full uppercase tracking-wider select-none">
                      Active
                    </span>
                  </div>
                  
                  {/* Sandbox Info */}
                  <div className="space-y-4 text-[10px] text-neutral-500 dark:text-neutral-400">
                    <div className="flex justify-between">
                      <span className="font-semibold">Sandbox ID:</span>
                      <span className="font-mono text-neutral-850 dark:text-neutral-200 truncate max-w-[120px]" title={sandboxData?.sandboxId || 'None'}>
                        {sandboxData?.sandboxId || 'Creating...'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-semibold">Vite Server:</span>
                      <span className={`font-bold ${sandboxData?.url ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400'}`}>
                        {sandboxData?.url ? 'Running' : 'Offline'}
                      </span>
                    </div>
                    {sandboxData?.url && (
                      <a 
                        href={sandboxData.url} 
                        target="_blank" 
                        rel="noreferrer" 
                        className="block text-center mt-6 py-4 text-orange-600 hover:text-orange-755 dark:text-orange-400 dark:hover:text-orange-350 font-bold border border-orange-100 dark:border-orange-950/30 hover:border-orange-200 dark:hover:border-orange-900 rounded-lg hover:bg-orange-50/50 dark:hover:bg-orange-950/10 transition-all text-[10px]"
                      >
                        Open Sandbox URL
                      </a>
                    )}
                  </div>
                </div>
                
                {/* Actions List */}
                <div className="space-y-4">
                  {sandboxData && (
                    <button 
                      type="button" 
                      onClick={() => {
                        setShowProjectDropdown(false);
                        toast.loading("Restarting Vite dev server...");
                        fetch('/api/restart-vite', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ sandboxId: sandboxData.sandboxId })
                        })
                          .then(res => res.json())
                          .then(data => {
                            toast.dismiss();
                            if (data.success) {
                              toast.success("Vite dev server restarted successfully!");
                              if (iframeRef.current) {
                                iframeRef.current.src = iframeRef.current.src; // Reload iframe
                              }
                            } else {
                              toast.error(`Failed to restart Vite: ${data.message || data.error}`);
                            }
                          })
                          .catch(err => {
                            toast.dismiss();
                            toast.error(`Error restarting Vite: ${err.message}`);
                          });
                      }}
                      className="w-full text-left py-8 px-8 hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-lg font-semibold flex items-center gap-8 text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white transition-all"
                    >
                      <svg className="w-3.5 h-3.5 text-neutral-450" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 6H16" />
                      </svg>
                      Restart Dev Server
                    </button>
                  )}
                  
                  <button type="button" onClick={() => { setShowProjectDropdown(false); setShowHistoryPanel(true); }} className="w-full text-left py-8 px-8 hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-lg font-semibold flex items-center gap-8 text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white transition-all">
                    <svg className="w-3.5 h-3.5 text-neutral-455" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    Version History
                  </button>
 
                  <div className="h-[1px] w-full bg-neutral-100 dark:bg-neutral-800 my-4" />
                  
                  <button 
                    type="button" 
                    onClick={() => {
                      if (window.confirm("Are you sure you want to delete this project? This will permanently remove all file history and versions.")) {
                        setShowProjectDropdown(false);
                        if (activeProjectId) {
                          toast.loading("Deleting project...");
                          fetch(`/api/projects/${activeProjectId}`, { method: 'DELETE' })
                            .then(res => res.json())
                            .then(data => {
                              toast.dismiss();
                              if (data.success) {
                                toast.success("Project deleted successfully");
                                router.push('/');
                              } else {
                                toast.error(`Failed to delete project: ${data.error}`);
                              }
                            })
                            .catch(err => {
                              toast.dismiss();
                              toast.error(`Error deleting project: ${err.message}`);
                            });
                        } else {
                          toast.success("Project reset successfully");
                          router.push('/');
                        }
                      }
                    }} 
                    className="w-full text-left py-8 px-8 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg font-semibold flex items-center gap-8 text-red-600 hover:text-red-700 dark:text-red-400 transition-all"
                  >
                    <svg className="w-3.5 h-3.5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    Delete Project
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-8">
          {/* AI Agent Team Button */}
          <button
            type="button"
            onClick={() => setShowTeamModal(true)}
            className={styles.agentButton}
            title="Configure AI agent models & settings"
          >
            <svg className="w-4 h-4 text-orange-550" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            <span>AI team</span>
          </button>
          
          <button 
            onClick={() => createSandbox()}
            className="p-8 rounded-full transition-all bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-350 hover:bg-neutral-50 dark:hover:bg-neutral-805 shadow-sm active:scale-95"
            title="Create new sandbox"
          >
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </button>
          <button 
            onClick={reapplyLastGeneration}
            className="p-8 rounded-full transition-all bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-350 hover:bg-neutral-50 dark:hover:bg-neutral-805 shadow-sm active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Re-apply last generation"
            disabled={!conversationContext.lastGeneratedCode || !sandboxData}
          >
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          <button 
            onClick={downloadZip}
            disabled={!sandboxData}
            className="p-8 rounded-full transition-all bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-355 hover:bg-neutral-50 dark:hover:bg-neutral-805 shadow-sm active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Download your Vite app as ZIP"
          >
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
            </svg>
          </button>
        </div>
      </div>
      

      <div className={`${styles.workspaceBody} flex-1 flex overflow-hidden`}>
        {/* Left Panel - AI Chat & Visual Editor */}
        <div className={`${styles.sidebar} ${styles.chatShell} flex flex-col border-r`}>
          {conversationContext.scrapedWebsites.length > 0 && (
            <div className="p-16 bg-neutral-50/50 dark:bg-neutral-900/30 border-b border-neutral-200/50 dark:border-neutral-800/60">
              <div className="flex flex-col gap-12">
                {Array.from(new Map(conversationContext.scrapedWebsites.map(s => [s.url, s])).values()).map((site, idx) => {
                  // Extract favicon and site info from the scraped data
                  const metadata = site.content?.metadata || {};
                  const sourceURL = metadata.sourceURL || site.url;
                  const favicon = metadata.favicon || `https://www.google.com/s2/favicons?domain=${new URL(sourceURL).hostname}&sz=128`;
                  const siteName = metadata.ogSiteName || metadata.title || new URL(sourceURL).hostname;
                  const screenshot = site.content?.screenshot || sessionStorage.getItem('websiteScreenshot');
                  
                  return (
                    <div key={idx} className="flex flex-col gap-12">
                      {/* Site info with favicon */}
                      <div className="flex items-center gap-10 text-xs">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img 
                          src={favicon} 
                          alt={siteName}
                          className="w-5 h-5 rounded-md shadow-sm"
                          onError={(e) => {
                            e.currentTarget.src = `https://www.google.com/s2/favicons?domain=${new URL(sourceURL).hostname}&sz=128`;
                          }}
                        />
                        <a 
                          href={sourceURL} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-neutral-800 dark:text-neutral-200 hover:text-orange-500 dark:hover:text-orange-400 truncate max-w-[250px] font-bold transition-all"
                          title={sourceURL}
                        >
                          {siteName}
                        </a>
                      </div>
                      
                      {/* Pinned screenshot */}
                      {screenshot && (
                        <div className="w-full">
                          <div className="flex items-center justify-between mb-8">
                            <span className="text-[10px] font-bold text-neutral-450 uppercase tracking-wider">Screenshot Preview</span>
                            <button
                              onClick={() => setScreenshotCollapsed(!screenshotCollapsed)}
                              className="text-neutral-400 hover:text-neutral-600 dark:hover:text-white transition-colors p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800"
                              aria-label={screenshotCollapsed ? 'Expand screenshot' : 'Collapse screenshot'}
                            >
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 16 16"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg"
                                className={`transition-transform duration-350 ${screenshotCollapsed ? 'rotate-180' : ''}`}
                              >
                                <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            </button>
                          </div>
                          <div
                            className="w-full rounded-xl overflow-hidden border border-neutral-200/60 dark:border-neutral-800/80 transition-all duration-355 shadow-sm"
                            style={{
                              opacity: screenshotCollapsed ? 0 : 1,
                              transform: screenshotCollapsed ? 'translateY(-10px)' : 'translateY(0)',
                              pointerEvents: screenshotCollapsed ? 'none' : 'auto',
                              maxHeight: screenshotCollapsed ? '0' : '200px'
                            }}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={screenshot}
                              alt={`${siteName} preview`}
                              className="w-full h-auto object-cover"
                              style={{ maxHeight: '200px' }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {showHistoryPanel ? (
            <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-neutral-900 p-16">
              <div className="flex justify-between items-center pb-12 border-b border-neutral-200 dark:border-neutral-800 mb-16">
                <h3 className="text-[11px] font-bold text-neutral-800 dark:text-white uppercase tracking-wider font-sans">Version History</h3>
                <button
                  type="button"
                  onClick={() => setShowHistoryPanel(false)}
                  className="text-neutral-455 hover:text-neutral-600 dark:hover:text-white text-[10px] font-bold px-8 py-4 rounded hover:bg-neutral-50 dark:hover:bg-neutral-805 transition-all"
                >
                  Close
                </button>
              </div>
              <div className="flex-1 overflow-y-auto space-y-12 pr-4 scrollbar-hide">
                {historyLog.length === 0 ? (
                  <div className="text-center text-xs text-neutral-400 py-24">
                    No versions saved yet. Make edits to create snapshot versions.
                  </div>
                ) : (
                  historyLog.map((ver) => (
                    <div
                      key={ver.id}
                      className="p-12 bg-neutral-50/50 dark:bg-neutral-850/40 border border-neutral-200 dark:border-neutral-800/80 rounded-xl hover:border-neutral-300 dark:hover:border-neutral-700 transition-all flex justify-between items-center"
                    >
                      <div className="space-y-4">
                        <div className="text-xs font-bold text-neutral-855 dark:text-neutral-200">{ver.version_title}</div>
                        <div className="text-[9px] text-neutral-400 dark:text-neutral-500">{new Date(ver.created_at).toLocaleString()}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRevertVersion(ver.id, ver.version_title)}
                        className="px-10 py-5 bg-neutral-900 dark:bg-neutral-100 hover:bg-black dark:hover:bg-white text-white dark:text-neutral-900 text-[10px] font-bold rounded-lg transition-all shadow-sm"
                      >
                        Revert
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div
              className={`${styles.conversation} flex-1 overflow-y-auto p-24 flex flex-col gap-20 scrollbar-hide dark:bg-neutral-950`}
              ref={chatMessagesRef}>
            {chatMessages.length === 0 && (
              <div className={styles.emptyThread}>
                <div className={styles.emptyThreadHeading}>
                  <div className={styles.emptyThreadMark} aria-hidden="true">G</div>
                  <div>
                    <span className={styles.emptyThreadAuthor}>G Studio</span>
                    <h2>What should we build?</h2>
                  </div>
                </div>
                <p>Give me the product, audience, and first useful flow. I’ll keep the conversation and live preview in sync.</p>
                <div className={styles.starterPrompts}>
                  {[
                    'Build a focused product landing page',
                    'Create an operations dashboard workflow',
                    'Recreate a public website from its URL'
                  ].map(prompt => (
                    <button
                      key={prompt}
                      type="button"
                      className={styles.starterPrompt}
                      onClick={() => setAiChatInput(prompt)}
                    >
                      <span>{prompt}</span>
                      <span aria-hidden="true">→</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {chatMessages.map((msg, idx) => {
              // Check if this message is from a successful generation
              const isGenerationComplete = msg.content.includes('Successfully recreated') || 
                                         msg.content.includes('AI recreation generated!') ||
                                         msg.content.includes('Code generated!');
              
              // Get the files from metadata if this is a completion message
              // const completedFiles = msg.metadata?.appliedFiles || [];
              
              return (
                <div key={idx} className={`${styles.messageRow} animate-fade-in-up`}>
                  <div className={`${styles.messageAlignment} ${msg.type === 'user' ? styles.messageAlignmentUser : ''}`}>
                    <div className={styles.messageLine}>
                      {msg.type === 'user' ? (
                        <div className={styles.messageAvatar}>
                          U
                        </div>
                      ) : msg.type === 'ai' ? (
                        <div className={styles.messageAvatar}>
                          G
                        </div>
                      ) : null}

                      <div className={`${styles.messageBody} ${
                        msg.type === 'user' ? styles.userMessage :
                        msg.type === 'ai' ? styles.aiMessage :
                        msg.type === 'system' ? styles.systemMessage :
                        msg.type === 'command' ? styles.commandMessage :
                        msg.type === 'error' ? styles.errorMessage :
                        styles.aiMessage
                      }`}>
                    {msg.type === 'ai' && <span className={styles.messageAuthor}>G Studio</span>}
                    {msg.type === 'command' ? (
                       <div className="flex items-start gap-8">
                         <span className={`text-xs ${
                           msg.metadata?.commandType === 'input' ? 'text-blue-400' :
                           msg.metadata?.commandType === 'error' ? 'text-red-400' :
                           msg.metadata?.commandType === 'success' ? 'text-green-400' :
                           'text-gray-400'
                         }`}>
                           {msg.metadata?.commandType === 'input' ? '$' : '>'}
                         </span>
                         <span className="flex-1 whitespace-pre-wrap text-neutral-200">{msg.content}</span>
                       </div>
                    ) : msg.type === 'system' ? (
                      <div className="flex items-center gap-8">
                        <div className="w-10 h-10 border-2 border-orange-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                        <span className="font-semibold">{msg.content}</span>
                      </div>
                    ) : msg.type === 'error' ? (
                       <div className="flex items-start gap-12">
                         <div className="flex-shrink-0">
                           <div className="w-32 h-32 bg-red-100 dark:bg-red-900/50 rounded-full flex items-center justify-center">
                             <svg className="w-20 h-20 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                             </svg>
                           </div>
                         </div>
                         <div className="flex-1">
                           <div className="font-semibold mb-4">Build Errors Detected</div>
                           <div className="whitespace-pre-wrap text-sm">{msg.content}</div>
                           <div className="mt-8 text-xs opacity-70">Press 'F' or click the Fix button above to resolve</div>
                         </div>
                       </div>
                    ) : (
                      <div className="whitespace-pre-wrap">{msg.content}</div>
                    )}
                      </div>

                      {/* View History button under AI message */}
                      {msg.type === 'ai' && idx === chatMessages.length - 1 && historyLog.length > 0 && (
                        <div className="mt-2 flex justify-start">
                          <button
                            type="button"
                            onClick={() => setShowHistoryPanel(true)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 hover:text-gray-900 rounded-lg text-[10px] font-bold transition-all shadow-sm"
                          >
                            <svg className="w-3 h-3 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            View History
                          </button>
                        </div>
                      )}
                  
                      {/* Show branding data if this is a brand extraction message */}
                      {msg.metadata?.brandingData && (
                        <div className="mt-3 bg-gradient-to-br from-gray-50 to-white border-2 border-gray-200 rounded-xl overflow-hidden max-w-[500px] shadow-sm">
                          <div className="bg-[#36322F] px-16 py-12">
                            <div className="flex items-center gap-8">
                              <Image
                                src={`https://www.google.com/s2/favicons?domain=${msg.metadata.sourceUrl}&sz=32`}
                                alt=""
                                width={64}
                                height={64}
                                className="w-16 h-16"
                              />
                              <div className="text-sm font-semibold text-white">
                                Brand Guidelines
                              </div>
                            </div>
                          </div>

                          <div className="p-16">
                            {/* Color Scheme Mode */}
                            {msg.metadata.brandingData.colorScheme && (
                              <div className="mb-16">
                                <div className="text-sm">
                                  <span className="text-gray-600 font-medium">Mode:</span>{' '}
                                  <span className="font-semibold text-gray-900 capitalize">{msg.metadata.brandingData.colorScheme}</span>
                                </div>
                              </div>
                            )}

                            {/* Colors */}
                            {msg.metadata.brandingData.colors && (
                              <div className="mb-16">
                                <div className="text-sm font-semibold text-gray-900 mb-8">Colors</div>
                                <div className="flex flex-wrap gap-12">
                                  {msg.metadata.brandingData.colors.primary && (
                                    <div className="flex items-center gap-8">
                                      <div className="w-32 h-32 rounded border border-gray-300" style={{ backgroundColor: msg.metadata.brandingData.colors.primary }} />
                                      <div className="text-sm">
                                        <div className="font-semibold text-gray-900">Primary</div>
                                        <div className="text-gray-600 font-mono text-xs">{msg.metadata.brandingData.colors.primary}</div>
                                      </div>
                                    </div>
                                  )}
                                  {msg.metadata.brandingData.colors.accent && (
                                    <div className="flex items-center gap-8">
                                      <div className="w-32 h-32 rounded border border-gray-300" style={{ backgroundColor: msg.metadata.brandingData.colors.accent }} />
                                      <div className="text-sm">
                                        <div className="font-semibold text-gray-900">Accent</div>
                                        <div className="text-gray-600 font-mono text-xs">{msg.metadata.brandingData.colors.accent}</div>
                                      </div>
                                    </div>
                                  )}
                                  {msg.metadata.brandingData.colors.background && (
                                    <div className="flex items-center gap-8">
                                      <div className="w-32 h-32 rounded border border-gray-300" style={{ backgroundColor: msg.metadata.brandingData.colors.background }} />
                                      <div className="text-sm">
                                        <div className="font-semibold text-gray-900">Background</div>
                                        <div className="text-gray-600 font-mono text-xs">{msg.metadata.brandingData.colors.background}</div>
                                      </div>
                                    </div>
                                  )}
                                  {msg.metadata.brandingData.colors.textPrimary && (
                                    <div className="flex items-center gap-8">
                                      <div className="w-32 h-32 rounded border border-gray-300" style={{ backgroundColor: msg.metadata.brandingData.colors.textPrimary }} />
                                      <div className="text-sm">
                                        <div className="font-semibold text-gray-900">Text</div>
                                        <div className="text-gray-600 font-mono text-xs">{msg.metadata.brandingData.colors.textPrimary}</div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Typography */}
                            {msg.metadata.brandingData.typography && (
                              <div className="mb-16">
                                <div className="text-sm font-semibold text-gray-900 mb-8">Typography</div>
                                <div className="grid grid-cols-2 gap-12 text-sm">
                                  {msg.metadata.brandingData.typography.fontFamilies?.primary && (
                                    <div>
                                      <span className="text-gray-600 font-medium">Primary:</span>{' '}
                                      <span className="font-semibold text-gray-900">{msg.metadata.brandingData.typography.fontFamilies.primary}</span>
                                    </div>
                                  )}
                                  {msg.metadata.brandingData.typography.fontFamilies?.heading && (
                                    <div>
                                      <span className="text-gray-600 font-medium">Heading:</span>{' '}
                                      <span className="font-semibold text-gray-900">{msg.metadata.brandingData.typography.fontFamilies.heading}</span>
                                    </div>
                                  )}
                                  {msg.metadata.brandingData.typography.fontSizes?.h1 && (
                                    <div>
                                      <span className="text-gray-600 font-medium">H1 Size:</span>{' '}
                                      <span className="font-semibold text-gray-900">{msg.metadata.brandingData.typography.fontSizes.h1}</span>
                                    </div>
                                  )}
                                  {msg.metadata.brandingData.typography.fontSizes?.h2 && (
                                    <div>
                                      <span className="text-gray-600 font-medium">H2 Size:</span>{' '}
                                      <span className="font-semibold text-gray-900">{msg.metadata.brandingData.typography.fontSizes.h2}</span>
                                    </div>
                                  )}
                                  {msg.metadata.brandingData.typography.fontSizes?.body && (
                                    <div>
                                      <span className="text-gray-600 font-medium">Body Size:</span>{' '}
                                      <span className="font-semibold text-gray-900">{msg.metadata.brandingData.typography.fontSizes.body}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Spacing */}
                            {msg.metadata.brandingData.spacing && (
                              <div className="mb-16">
                                <div className="text-sm font-semibold text-gray-900 mb-8">Spacing</div>
                                <div className="flex flex-wrap gap-16 text-sm">
                                  {msg.metadata.brandingData.spacing.baseUnit && (
                                    <div>
                                      <span className="text-gray-600 font-medium">Base Unit:</span>{' '}
                                      <span className="font-semibold text-gray-900">{msg.metadata.brandingData.spacing.baseUnit}px</span>
                                    </div>
                                  )}
                                  {msg.metadata.brandingData.spacing.borderRadius && (
                                    <div>
                                      <span className="text-gray-600 font-medium">Border Radius:</span>{' '}
                                      <span className="font-semibold text-gray-900">{msg.metadata.brandingData.spacing.borderRadius}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Button Styles */}
                            {msg.metadata.brandingData.components?.buttonPrimary && (
                              <div className="mb-16">
                                <div className="text-sm font-semibold text-gray-900 mb-8">Button Styles</div>
                                <div className="flex flex-wrap gap-12">
                                  <div>
                                    <div className="text-xs text-gray-600 mb-6 font-medium">Primary Button</div>
                                    <button
                                      className="px-16 py-8 text-sm font-medium"
                                      style={{
                                        backgroundColor: msg.metadata.brandingData.components.buttonPrimary.background,
                                        color: msg.metadata.brandingData.components.buttonPrimary.textColor,
                                        borderRadius: msg.metadata.brandingData.components.buttonPrimary.borderRadius,
                                        boxShadow: msg.metadata.brandingData.components.buttonPrimary.shadow
                                      }}
                                    >
                                      Sample Button
                                    </button>
                                  </div>
                                  {msg.metadata.brandingData.components?.buttonSecondary && (
                                    <div>
                                      <div className="text-xs text-gray-600 mb-6 font-medium">Secondary Button</div>
                                      <button
                                        className="px-16 py-8 text-sm font-medium"
                                        style={{
                                          backgroundColor: msg.metadata.brandingData.components.buttonSecondary.background,
                                          color: msg.metadata.brandingData.components.buttonSecondary.textColor,
                                          borderRadius: msg.metadata.brandingData.components.buttonSecondary.borderRadius,
                                          boxShadow: msg.metadata.brandingData.components.buttonSecondary.shadow
                                        }}
                                      >
                                        Sample Button
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Personality */}
                            {msg.metadata.brandingData.personality && (
                              <div className="text-sm">
                                <span className="text-gray-600 font-medium">Personality:</span>{' '}
                                <span className="font-semibold text-gray-900 capitalize">
                                  {msg.metadata.brandingData.personality.tone} tone, {msg.metadata.brandingData.personality.energy} energy
                                </span>
                              </div>
                            )}

                            {/* Target Audience */}
                            {msg.metadata.brandingData.personality?.targetAudience && (
                              <div className="text-sm mt-8">
                                <span className="text-gray-600 font-medium">Target:</span>{' '}
                                <span className="text-gray-900">{msg.metadata.brandingData.personality.targetAudience}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Show applied files if this is an apply success message */}
                      {msg.metadata?.appliedFiles && msg.metadata.appliedFiles.length > 0 && (
                    <div className="mt-3 inline-block bg-gray-100 rounded-[10px] p-5">
                      <div className="text-sm font-medium mb-3 text-gray-700">
                        {msg.content.includes('Applied') ? 'Files Updated:' : 'Generated Files:'}
                      </div>
                      <div className="flex flex-wrap items-start gap-2">
                        {msg.metadata.appliedFiles.map((filePath, fileIdx) => {
                          const fileName = filePath.split('/').pop() || filePath;
                          const fileExt = fileName.split('.').pop() || '';
                          const fileType = fileExt === 'jsx' || fileExt === 'js' ? 'javascript' :
                                          fileExt === 'css' ? 'css' :
                                          fileExt === 'json' ? 'json' : 'text';

                          return (
                            <div
                              key={`applied-${fileIdx}`}
                              className="inline-flex items-center gap-1.5 px-6 py-1.5 bg-[#36322F] text-white rounded-[10px] text-sm animate-fade-in-up"
                              style={{ animationDelay: `${fileIdx * 30}ms` }}
                            >
                              <span className={`inline-block w-1.5 h-1.5 rounded-full ${
                                fileType === 'css' ? 'bg-blue-400' :
                                fileType === 'javascript' ? 'bg-yellow-400' :
                                fileType === 'json' ? 'bg-green-400' :
                                'bg-gray-400'
                              }`} />
                              {fileName}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  
                      {/* Show generated files for completion messages - but only if no appliedFiles already shown */}
                      {isGenerationComplete && generationProgress.files.length > 0 && idx === chatMessages.length - 1 && !msg.metadata?.appliedFiles && !chatMessages.some(m => m.metadata?.appliedFiles) && (
                    <div className="mt-2 inline-block bg-gray-100 rounded-[10px] p-3">
                      <div className="text-xs font-medium mb-1 text-gray-700">Generated Files:</div>
                      <div className="flex flex-wrap items-start gap-1">
                        {generationProgress.files.map((file, fileIdx) => (
                          <div
                            key={`complete-${fileIdx}`}
                            className="inline-flex items-center gap-1.5 px-6 py-1.5 bg-[#36322F] text-white rounded-[10px] text-xs animate-fade-in-up"
                            style={{ animationDelay: `${fileIdx * 30}ms` }}
                          >
                            <span className={`inline-block w-1.5 h-1.5 rounded-full ${
                              file.type === 'css' ? 'bg-blue-400' :
                              file.type === 'javascript' ? 'bg-yellow-400' :
                              file.type === 'json' ? 'bg-green-400' :
                              'bg-gray-400'
                            }`} />
                            {file.path.split('/').pop()}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                    </div>
                    </div>
                  </div>
              );
            })}
            
            {/* Code application progress */}
            {codeApplicationState.stage && (
              <CodeApplicationProgress state={codeApplicationState} />
            )}
            
            {/* File generation progress - inline display (during generation) */}
            {generationProgress.isGenerating && (
              <div className="inline-block bg-gray-100 rounded-lg p-3">
                <div className="text-sm font-medium mb-2 text-gray-700">
                  {generationProgress.status}
                </div>
                <div className="flex flex-wrap items-start gap-1">
                  {/* Show completed files */}
                  {generationProgress.files.map((file, idx) => (
                    <div
                      key={`file-${idx}`}
                      className="inline-flex items-center gap-1.5 px-6 py-1.5 bg-[#36322F] text-white rounded-[10px] text-xs animate-fade-in-up"
                      style={{ animationDelay: `${idx * 30}ms` }}
                    >
                      <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                      {file.path.split('/').pop()}
                    </div>
                  ))}
                  
                  {/* Show current file being generated */}
                  {generationProgress.currentFile && (
                    <div className="flex items-center gap-1 px-2 py-1 bg-[#36322F]/70 text-white rounded-[10px] text-sm animate-pulse"
                      style={{ animationDelay: `${generationProgress.files.length * 30}ms` }}>
                      <div className="w-16 h-16 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      {generationProgress.currentFile.path.split('/').pop()}
                    </div>
                  )}
                </div>
                
                {/* Live streaming response display */}
                {generationProgress.streamedCode && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.3 }}
                    className="mt-3 border-t border-gray-300 pt-3"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div className="flex items-center gap-1">
                        <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
                        <span className="text-xs font-medium text-gray-600">AI Response Stream</span>
                      </div>
                      <div className="flex-1 h-px bg-gradient-to-r from-gray-300 to-transparent" />
                    </div>
                    <div className="bg-gray-900 border border-gray-700 rounded max-h-128 overflow-y-auto scrollbar-hide">
                      <SyntaxHighlighter
                        language="jsx"
                        style={vscDarkPlus}
                        customStyle={{
                          margin: 0,
                          padding: '0.75rem',
                          fontSize: '11px',
                          lineHeight: '1.5',
                          background: 'transparent',
                          maxHeight: '8rem',
                          overflow: 'hidden'
                        }}
                      >
                        {(() => {
                          const lastContent = generationProgress.streamedCode.slice(-1000);
                          // Show the last part of the stream, starting from a complete tag if possible
                          const startIndex = lastContent.indexOf('<');
                          return startIndex !== -1 ? lastContent.slice(startIndex) : lastContent;
                        })()}
                      </SyntaxHighlighter>
                      <span className="inline-block w-3 h-4 bg-orange-400 ml-3 mb-3 animate-pulse" />
                    </div>
                  </motion.div>
                )}
              </div>
            )}
            </div>
          )}

          <div className={styles.composerDock}>
            <div data-testid="generation-composer" className={`${styles.composer} relative bg-white dark:bg-neutral-900 border dark:border-neutral-800 transition-all p-3`}>
              <textarea
                value={aiChatInput}
                onChange={(e) => {
                  setAiChatInput(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = e.target.scrollHeight + 'px';
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendChatMessage();
                  }
                }}
                placeholder={generationMode === 'build' ? "Ask G Studio..." : "Discuss the plan first..."}
                rows={1}
                className="w-full bg-transparent text-sm text-neutral-800 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 resize-none outline-none border-none focus:ring-0 max-h-[160px] min-h-[24px]"
                style={{ height: 'auto', overflowY: 'auto' }}
              />
              <div className={`${styles.composerFooter} flex items-center justify-between mt-8 pt-6 border-t border-neutral-100 dark:border-neutral-800/80`}>
                <div className="flex items-center gap-8">
                  <div className={styles.modeSwitch}>
                    <button
                      type="button"
                      onClick={() => setGenerationMode('build')}
                      className={`${styles.modeButton} ${
                        generationMode === 'build'
                          ? styles.modeButtonActive
                          : ''
                      }`}
                    >
                      Build
                    </button>
                    <button
                      type="button"
                      onClick={() => setGenerationMode('plan')}
                      className={`${styles.modeButton} ${
                        generationMode === 'plan'
                          ? styles.modeButtonActive
                          : ''
                      }`}
                    >
                      Plan
                    </button>
                  </div>
                  {hasProjectPreview && (
                    <button
                      type="button"
                      className={styles.visualEditButton}
                      onClick={() => setInspecting(!inspecting)}
                      aria-pressed={inspecting}
                    >
                      Visual edits
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={sendChatMessage}
                  disabled={!aiChatInput.trim()}
                  aria-label="Send build instruction"
                  className={`${styles.composerSubmit} flex items-center justify-center transition-all ${
                    aiChatInput.trim()
                      ? styles.composerSubmitReady
                      : styles.composerSubmitDisabled
                  }`}
                >
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right Panel - Preview or Generation (2/3 of remaining width) */}
        <div className={`${styles.previewPanel} flex-1 flex flex-col overflow-hidden dark:bg-neutral-950`}>
          <div className={`${styles.previewToolbar} px-16 py-10 border-b flex justify-between items-center z-20 shadow-sm gap-12`}>
            <div className="flex items-center gap-12 flex-shrink-0">
              <div className={styles.previewIdentity}>
                <span className={styles.previewPulse} aria-hidden="true" />
                <span>{activeTab === 'preview' ? hasProjectPreview ? 'Live preview' : 'Project canvas' : 'Generated files'}</span>
              </div>

              {/* Toggle-style Code/View switcher */}
              <div className="inline-flex bg-neutral-100 dark:bg-neutral-800 rounded-lg p-2 border border-neutral-200/50 dark:border-neutral-850">
                <button
                  onClick={() => setActiveTab('generation')}
                  aria-label="Switch to code"
                  className={`px-12 py-4 rounded-md transition-all text-xs font-semibold ${
                    activeTab === 'generation' 
                      ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm' 
                      : 'bg-transparent text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-200'
                  }`}
                >
                  <div className="flex items-center gap-6">
                    <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                    </svg>
                    <span>Code</span>
                  </div>
                </button>
                <button
                  onClick={() => setActiveTab('preview')}
                  aria-label="Switch to preview"
                  className={`px-12 py-4 rounded-md transition-all text-xs font-semibold ${
                    activeTab === 'preview' 
                      ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm' 
                      : 'bg-transparent text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-200'
                  }`}
                >
                  <div className="flex items-center gap-6">
                    <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    <span>View</span>
                  </div>
                </button>
              </div>
            </div>

            {/* Preview destination */}
            {activeTab === 'preview' && hasProjectPreview && (
              sandboxData?.url ? (
                <a href={sandboxData.url} target="_blank" rel="noreferrer" className={styles.previewLink} title="Open live preview">
                  {sandboxData.url}
                </a>
              ) : <span className={styles.previewLink}>Preview appears here after your first build</span>
            )}

            <div className="flex gap-8 items-center flex-shrink-0">
              {historyLog.length > 0 && (<button
                type="button"
                onClick={() => setShowHistoryPanel(true)}
                aria-label="Open version history"
                title="Open version history"
                className={`${styles.toolbarButton} p-6 rounded-lg transition-all text-neutral-500 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800`}
              >
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>)}

              {activeTab === 'preview' && hasProjectPreview && (
                <button
                  type="button"
                  onClick={() => {
                    setInspecting(!inspecting);
                    toast.success(!inspecting ? 'Visual edit mode enabled. Select an element in the preview.' : 'Visual edit mode disabled.');
                  }}
                  aria-label="Turn on visual edit mode"
                  aria-pressed={inspecting}
                  title={inspecting ? 'Turn off visual edit mode' : 'Turn on visual edit mode'}
                  className={`${styles.toolbarButton} p-6 rounded-lg transition-all ${
                    inspecting
                      ? 'bg-orange-500 text-white shadow-sm'
                      : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800'
                  }`}
                >
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 15l-2 5L9 9l11 4-5 2zm0 0 5 5" />
                  </svg>
                </button>
              )}

              {/* Device Selector */}
              {activeTab === 'preview' && hasProjectPreview && (
                <div className="flex items-center bg-neutral-100 dark:bg-neutral-800 rounded-lg p-2 border border-neutral-200/60 dark:border-neutral-850 animate-fade-in">
                  <button
                    onClick={() => setPreviewDevice('desktop')}
                    aria-label="Desktop preview"
                    className={`p-4 rounded transition-all text-xs font-semibold ${
                      previewDevice === 'desktop'
                        ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm'
                        : 'bg-transparent text-neutral-450 hover:text-neutral-800 dark:hover:text-white'
                    }`}
                    title="Desktop view"
                  >
                    🖥️
                  </button>
                  <button
                    onClick={() => setPreviewDevice('tablet')}
                    aria-label="Tablet preview"
                    className={`p-4 rounded transition-all text-xs font-semibold ${
                      previewDevice === 'tablet'
                        ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm'
                        : 'bg-transparent text-neutral-455 hover:text-neutral-800 dark:hover:text-white'
                    }`}
                    title="Tablet view"
                  >
                    📱
                  </button>
                  <button
                    onClick={() => setPreviewDevice('mobile')}
                    aria-label="Mobile preview"
                    className={`p-4 rounded transition-all text-xs font-semibold ${
                      previewDevice === 'mobile'
                        ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm'
                        : 'bg-transparent text-neutral-455 hover:text-neutral-800 dark:hover:text-white'
                    }`}
                    title="Mobile view"
                  >
                    📞
                  </button>
                </div>
              )}

              {/* Files generated count */}
              {activeTab === 'generation' && !generationProgress.isEdit && generationProgress.files.length > 0 && (
                <div className="text-neutral-500 text-xs font-medium">
                  {generationProgress.files.length} files generated
                </div>
              )}
              
              {/* Live Code Generation Status */}
              {activeTab === 'generation' && generationProgress.isGenerating && (
                <div className="inline-flex items-center gap-1.5 px-10 py-4 bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-800 rounded-lg text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                  <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                  {generationProgress.isEdit ? 'Editing code' : 'Live generation'}
                </div>
              )}
              
              {/* Sandbox Status Indicator */}
              {hasProjectPreview && sandboxData && (
                <div className="inline-flex items-center gap-1.5 px-10 py-4 bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-800 rounded-lg text-xs font-semibold text-neutral-700 dark:text-neutral-305 animate-fade-in">
                  <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                  Sandbox active
                </div>
              )}
              
              {/* Open in new tab button */}
              {hasProjectPreview && sandboxData && (
                <a 
                  href={sandboxData.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  title="Open in new tab"
                  className="p-6 rounded-lg transition-all text-neutral-500 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800"
                >
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              )}
            </div>
          </div>
          <div className="flex-1 relative overflow-hidden">
            {renderMainContent()}
          </div>
        </div>
      {showTeamModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-16 animate-fade-in">
          <div className="bg-white rounded-16 shadow-2xl w-full max-w-[500px] border border-gray-150 overflow-hidden flex flex-col max-h-[90vh] animate-scale-up">
            {/* Header */}
            <div className="bg-[#36322F] text-white px-20 py-16 flex justify-between items-center">
              <div className="flex items-center gap-8">
                <svg className="w-20 h-20 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                <span className="font-bold text-sm tracking-wide">Configure AI Agent Team</span>
              </div>
              <button 
                type="button" 
                onClick={() => setShowTeamModal(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <svg className="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="p-20 overflow-y-auto space-y-16 text-xs text-gray-700">
              <p className="text-gray-500 mb-8">
                Assign specialized LLM models to different tasks to maximize the performance of your AI developer team.
              </p>

              {/* Specialist 1: Planner */}
              <div className="bg-gray-50 border border-gray-200 rounded-12 p-16 space-y-12">
                <div className="flex justify-between items-start gap-8">
                  <div>
                    <h4 className="font-bold text-gray-900 flex items-center gap-6">
                      <span className="w-6 h-6 rounded-full bg-blue-500 inline-block" />
                      Planning Specialist
                    </h4>
                    <p className="text-[10px] text-gray-400 mt-2">
                      Analyzes requirements, suggests project architectures, and conducts structural discussions under Plan Mode.
                    </p>
                  </div>
                  <span className="text-[9px] font-bold bg-blue-50 text-blue-700 px-8 py-2 rounded-full uppercase tracking-wider">
                    Plan Agent
                  </span>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-4">
                    Assigned Model
                  </label>
                  <select
                    value={planningModel}
                    onChange={(e) => setPlanningModel(e.target.value)}
                    className="w-full bg-white border border-gray-200 text-gray-700 rounded-8 px-12 py-8 focus:outline-none cursor-pointer focus:border-blue-400 transition-all font-medium"
                  >
                    {appConfig.ai.teamModelOptions.planning.map(model => (
                      <option key={model} value={model}>
                        {appConfig.ai.modelDisplayNames?.[model] || model}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Specialist 2: Coder */}
              <div className="bg-gray-50 border border-gray-200 rounded-12 p-16 space-y-12">
                <div className="flex justify-between items-start gap-8">
                  <div>
                    <h4 className="font-bold text-gray-900 flex items-center gap-6">
                      <span className="w-6 h-6 rounded-full bg-green-500 inline-block" />
                      Coding Specialist
                    </h4>
                    <p className="text-[10px] text-gray-400 mt-2">
                      Applies code changes, designs file structures, installs packages, and builds components under Build Mode.
                    </p>
                  </div>
                  <span className="text-[9px] font-bold bg-green-50 text-green-700 px-8 py-2 rounded-full uppercase tracking-wider">
                    Build Agent
                  </span>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-4">
                    Assigned Model
                  </label>
                  <select
                    value={coderModel}
                    onChange={(e) => setCoderModel(e.target.value)}
                    className="w-full bg-white border border-gray-200 text-gray-700 rounded-8 px-12 py-8 focus:outline-none cursor-pointer focus:border-green-400 transition-all font-medium"
                  >
                    {appConfig.ai.teamModelOptions.coder.map(model => (
                      <option key={model} value={model}>
                        {appConfig.ai.modelDisplayNames?.[model] || model}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Specialist 3: Quality Assurance (Reviewer) */}
              <div className="bg-gray-50 border border-gray-200 rounded-12 p-16 space-y-12">
                <div className="flex justify-between items-start gap-8">
                  <div>
                    <h4 className="font-bold text-gray-900 flex items-center gap-6">
                      <span className="w-6 h-6 rounded-full bg-orange-500 inline-block" />
                      Quality Assurance Specialist
                    </h4>
                    <p className="text-[10px] text-gray-400 mt-2">
                      Performs real-time HTML/DOM SEO audits, tracks compilation logs, and suggests hotfixes for sandbox build errors.
                    </p>
                  </div>
                  <span className="text-[9px] font-bold bg-orange-50 text-orange-700 px-8 py-2 rounded-full uppercase tracking-wider">
                    QA Agent
                  </span>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-4">
                    Assigned Model
                  </label>
                  <select
                    value={qaModel}
                    onChange={(e) => setQaModel(e.target.value)}
                    className="w-full bg-white border border-gray-200 text-gray-700 rounded-8 px-12 py-8 focus:outline-none cursor-pointer focus:border-orange-400 transition-all font-medium"
                  >
                    {appConfig.ai.teamModelOptions.qa.map(model => (
                      <option key={model} value={model}>
                        {appConfig.ai.modelDisplayNames?.[model] || model}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="bg-gray-50 px-20 py-12 border-t border-gray-150 flex justify-end gap-8">
              <button
                type="button"
                onClick={() => setShowTeamModal(false)}
                className="px-12 py-8 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 rounded-8 font-semibold transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (activeProjectId) {
                    toast.loading("Saving agent team configuration...");
                    fetch(`/api/projects/${activeProjectId}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        planningModel,
                        coderModel,
                        qaModel
                      })
                    })
                      .then(res => res.json())
                      .then(data => {
                        toast.dismiss();
                        if (data.success) {
                          toast.success("Agent team configuration saved successfully!");
                          setShowTeamModal(false);
                        } else {
                          toast.error(`Failed to save configuration: ${data.error}`);
                        }
                      })
                      .catch(err => {
                        toast.dismiss();
                        toast.error(`Error saving configuration: ${err.message}`);
                      });
                  } else {
                    toast.success("Agent team configuration updated!");
                    setShowTeamModal(false);
                  }
                }}
                className="px-12 py-8 bg-gray-900 hover:bg-black text-white rounded-8 font-semibold transition-all shadow-sm"
              >
                Save Configuration
              </button>
            </div>
          </div>
        </div>
      )}

      </div>
    </div>
    </HeaderProvider>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen">Loading...</div>}>
      <AISandboxPage />
    </Suspense>
  );
}
