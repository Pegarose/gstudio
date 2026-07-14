import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { generateObject } from 'ai';
import { z } from 'zod';
import { parseMorphEdits, applyMorphEditToFile } from '@/lib/morph-fast-apply';
// Sandbox import not needed - using global sandbox from sandbox-manager
import type { SandboxState } from '@/types/sandbox';
import type { ConversationState } from '@/types/conversation';
import { sandboxManager } from '@/lib/sandbox/sandbox-manager';
import { getLanguageModel } from '@/lib/ai/provider-manager';
import { resolveModelRoute } from '@/lib/models/registry';
import { createGenerationOrchestrator } from '@/lib/generation/orchestration/generation-orchestrator';
import type { GenerationRepairPersistence } from '@/lib/generation/orchestration/generation-orchestrator';
import { createLiveValidationActivation } from '@/lib/generation/live/live-validation-activation';
import { createProductionValidationDependencies } from '@/lib/generation/live/production-validation';
import {
  createLiveCandidateMutationBarrier,
  emitLiveActivationTerminalEvents,
  writeLiveCandidateFile,
} from '@/lib/generation/live/live-apply-terminal';
import { GenerationArtifactSchema, type GenerationArtifact, type ValidationReport } from '@/lib/generation/contracts/validation';
import { createGeneration, getGeneration, claimGenerationRepairAttempt, persistGenerationTerminalValidation, saveGenerationPayload, setGenerationSandboxId, updateGenerationStage } from '@/lib/generation/repository';
import { createSandboxService } from '@/lib/sandbox/service/sandbox-service';
import type { SandboxProvider } from '@/lib/sandbox/types';

declare global {
  var conversationState: ConversationState | null;
  var activeSandboxProvider: any;
  var existingFiles: Set<string>;
  var sandboxState: SandboxState;
}

interface ParsedResponse {
  explanation: string;
  template: string;
  files: Array<{ path: string; content: string }>;
  packages: string[];
  commands: string[];
  structure: string | null;
}

function parseAIResponse(response: string): ParsedResponse {
  const sections = {
    files: [] as Array<{ path: string; content: string }>,
    commands: [] as string[],
    packages: [] as string[],
    structure: null as string | null,
    explanation: '',
    template: ''
  };

  // Function to extract packages from import statements
  function extractPackagesFromCode(content: string): string[] {
    const packages: string[] = [];
    // Match ES6 imports
    const importRegex = /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)(?:\s*,\s*(?:\{[^}]*\}|\*\s+as\s+\w+|\w+))*\s+from\s+)?['"]([^'"]+)['"]/g;
    let importMatch;

    while ((importMatch = importRegex.exec(content)) !== null) {
      const importPath = importMatch[1];
      // Skip relative imports and built-in React
      if (!importPath.startsWith('.') && !importPath.startsWith('/') &&
        importPath !== 'react' && importPath !== 'react-dom' &&
        !importPath.startsWith('@/')) {
        // Extract package name (handle scoped packages like @heroicons/react)
        const packageName = importPath.startsWith('@')
          ? importPath.split('/').slice(0, 2).join('/')
          : importPath.split('/')[0];

        if (!packages.includes(packageName)) {
          packages.push(packageName);

          // Log important packages for debugging
          if (packageName === 'react-router-dom' || packageName.includes('router') || packageName.includes('icon')) {
            console.log(`[apply-ai-code-stream] Detected package from imports: ${packageName}`);
          }
        }
      }
    }

    return packages;
  }

  // Parse file sections - handle duplicates and prefer complete versions
  const fileMap = new Map<string, { content: string; isComplete: boolean }>();

  // First pass: Find all file declarations
  const fileRegex = /<file path="([^"]+)">([\s\S]*?)(?:<\/file>|$)/g;
  let match;
  while ((match = fileRegex.exec(response)) !== null) {
    const filePath = match[1];
    const content = match[2].trim();
    const hasClosingTag = response.substring(match.index, match.index + match[0].length).includes('</file>');

    // Check if this file already exists in our map
    const existing = fileMap.get(filePath);

    // Decide whether to keep this version
    let shouldReplace = false;
    if (!existing) {
      shouldReplace = true; // First occurrence
    } else if (!existing.isComplete && hasClosingTag) {
      shouldReplace = true; // Replace incomplete with complete
      console.log(`[apply-ai-code-stream] Replacing incomplete ${filePath} with complete version`);
    } else if (existing.isComplete && hasClosingTag && content.length > existing.content.length) {
      shouldReplace = true; // Replace with longer complete version
      console.log(`[apply-ai-code-stream] Replacing ${filePath} with longer complete version`);
    } else if (!existing.isComplete && !hasClosingTag && content.length > existing.content.length) {
      shouldReplace = true; // Both incomplete, keep longer one
    }

    if (shouldReplace) {
      // Additional validation: reject obviously broken content
      if (content.includes('...') && !content.includes('...props') && !content.includes('...rest')) {
        console.warn(`[apply-ai-code-stream] Warning: ${filePath} contains ellipsis, may be truncated`);
        // Still use it if it's the only version we have
        if (!existing) {
          fileMap.set(filePath, { content, isComplete: hasClosingTag });
        }
      } else {
        fileMap.set(filePath, { content, isComplete: hasClosingTag });
      }
    }
  }

  // Convert map to array for sections.files
  for (const [path, { content, isComplete }] of fileMap.entries()) {
    if (!isComplete) {
      console.log(`[apply-ai-code-stream] Warning: File ${path} appears to be truncated (no closing tag)`);
    }

    sections.files.push({
      path,
      content
    });

    // Extract packages from file content
    const filePackages = extractPackagesFromCode(content);
    for (const pkg of filePackages) {
      if (!sections.packages.includes(pkg)) {
        sections.packages.push(pkg);
        console.log(`[apply-ai-code-stream] 📦 Package detected from imports: ${pkg}`);
      }
    }
  }

  // Also parse markdown code blocks with file paths
  const markdownFileRegex = /```(?:file )?path="([^"]+)"\n([\s\S]*?)```/g;
  while ((match = markdownFileRegex.exec(response)) !== null) {
    const filePath = match[1];
    const content = match[2].trim();
    sections.files.push({
      path: filePath,
      content: content
    });

    // Extract packages from file content
    const filePackages = extractPackagesFromCode(content);
    for (const pkg of filePackages) {
      if (!sections.packages.includes(pkg)) {
        sections.packages.push(pkg);
        console.log(`[apply-ai-code-stream] 📦 Package detected from imports: ${pkg}`);
      }
    }
  }

  // Parse plain text format like "Generated Files: Header.jsx, index.css"
  const generatedFilesMatch = response.match(/Generated Files?:\s*([^\n]+)/i);
  if (generatedFilesMatch) {
    // Split by comma first, then trim whitespace, to preserve filenames with dots
    const filesList = generatedFilesMatch[1]
      .split(',')
      .map(f => f.trim())
      .filter(f => f.endsWith('.jsx') || f.endsWith('.js') || f.endsWith('.tsx') || f.endsWith('.ts') || f.endsWith('.css') || f.endsWith('.json') || f.endsWith('.html'));
    console.log(`[apply-ai-code-stream] Detected generated files from plain text: ${filesList.join(', ')}`);

    // Try to extract the actual file content if it follows
    for (const fileName of filesList) {
      // Look for the file content after the file name
      const fileContentRegex = new RegExp(`${fileName}[\\s\\S]*?(?:import[\\s\\S]+?)(?=Generated Files:|Applying code|$)`, 'i');
      const fileContentMatch = response.match(fileContentRegex);
      if (fileContentMatch) {
        // Extract just the code part (starting from import statements)
        const codeMatch = fileContentMatch[0].match(/^(import[\s\S]+)$/m);
        if (codeMatch) {
          const filePath = fileName.includes('/') ? fileName : `src/components/${fileName}`;
          sections.files.push({
            path: filePath,
            content: codeMatch[1].trim()
          });
          console.log(`[apply-ai-code-stream] Extracted content for ${filePath}`);

          // Extract packages from this file
          const filePackages = extractPackagesFromCode(codeMatch[1]);
          for (const pkg of filePackages) {
            if (!sections.packages.includes(pkg)) {
              sections.packages.push(pkg);
              console.log(`[apply-ai-code-stream] Package detected from imports: ${pkg}`);
            }
          }
        }
      }
    }
  }

  // Also try to parse if the response contains raw JSX/JS code blocks
  const codeBlockRegex = /```(?:jsx?|tsx?|javascript|typescript)?\n([\s\S]*?)```/g;
  while ((match = codeBlockRegex.exec(response)) !== null) {
    const content = match[1].trim();
    // Try to detect the file name from comments or context
    const fileNameMatch = content.match(/\/\/\s*(?:File:|Component:)\s*([^\n]+)/);
    if (fileNameMatch) {
      const fileName = fileNameMatch[1].trim();
      const filePath = fileName.includes('/') ? fileName : `src/components/${fileName}`;

      // Don't add duplicate files
      if (!sections.files.some(f => f.path === filePath)) {
        sections.files.push({
          path: filePath,
          content: content
        });

        // Extract packages
        const filePackages = extractPackagesFromCode(content);
        for (const pkg of filePackages) {
          if (!sections.packages.includes(pkg)) {
            sections.packages.push(pkg);
          }
        }
      }
    }
  }

  // Parse commands
  const cmdRegex = /<command>(.*?)<\/command>/g;
  while ((match = cmdRegex.exec(response)) !== null) {
    sections.commands.push(match[1].trim());
  }

  // Parse packages - support both <package> and <packages> tags
  const pkgRegex = /<package>(.*?)<\/package>/g;
  while ((match = pkgRegex.exec(response)) !== null) {
    sections.packages.push(match[1].trim());
  }

  // Also parse <packages> tag with multiple packages
  const packagesRegex = /<packages>([\s\S]*?)<\/packages>/;
  const packagesMatch = response.match(packagesRegex);
  if (packagesMatch) {
    const packagesContent = packagesMatch[1].trim();
    // Split by newlines or commas
    const packagesList = packagesContent.split(/[\n,]+/)
      .map(pkg => pkg.trim())
      .filter(pkg => pkg.length > 0);
    sections.packages.push(...packagesList);
  }

  // Parse structure
  const structureMatch = /<structure>([\s\S]*?)<\/structure>/;
  const structResult = response.match(structureMatch);
  if (structResult) {
    sections.structure = structResult[1].trim();
  }

  // Parse explanation
  const explanationMatch = /<explanation>([\s\S]*?)<\/explanation>/;
  const explResult = response.match(explanationMatch);
  if (explResult) {
    sections.explanation = explResult[1].trim();
  }

  // Parse template
  const templateMatch = /<template>(.*?)<\/template>/;
  const templResult = response.match(templateMatch);
  if (templResult) {
    sections.template = templResult[1].trim();
  }

  return sections;
}

export async function POST(request: NextRequest) {
  try {
    const requestBody = await request.json();
    const { response, isEdit = false, packages = [], sandboxId } = requestBody;
    const generationContextResult = GenerationContextSchema.safeParse(requestBody.generationContext);

    if (!generationContextResult.success) {
      return NextResponse.json({
        error: 'A validated generation context is required before applying generated code.',
        issues: generationContextResult.error.issues,
      }, { status: 400 });
    }
    const generationContext = generationContextResult.data;

    if (typeof response !== 'string' || !response.trim()) {
      return NextResponse.json({
        error: 'response is required'
      }, { status: 400 });
    }

    // Debug log the response
    console.log('[apply-ai-code-stream] Received response to parse:');
    console.log('[apply-ai-code-stream] Response length:', response.length);
    console.log('[apply-ai-code-stream] Response preview:', response.substring(0, 500));
    console.log('[apply-ai-code-stream] isEdit:', isEdit);
    console.log('[apply-ai-code-stream] packages:', packages);

    // Parse the AI response
    const parsed = parseAIResponse(response);
    const artifact = toValidationArtifact(parsed);
    if (artifact.files.length === 0) {
      return NextResponse.json({
        error: 'The generated candidate contains no safe application files.',
      }, { status: 400 });
    }
    // Morph edits can target files outside the parsed artifact. Keep the live
    // rollback boundary exact by applying only the validated full-file candidate.
    const morphEnabled = false;
    const morphEdits = morphEnabled ? parseMorphEdits(response) : [];
    console.log('[apply-ai-code-stream] Morph Fast Apply mode:', morphEnabled);
    if (morphEnabled) {
      console.log('[apply-ai-code-stream] Morph edits found:', morphEdits.length);
    }
    
    // Log what was parsed
    console.log('[apply-ai-code-stream] Parsed result:');
    console.log('[apply-ai-code-stream] Files found:', parsed.files.length);
    if (parsed.files.length > 0) {
      parsed.files.forEach(f => {
        console.log(`[apply-ai-code-stream] - ${f.path} (${f.content.length} chars)`);
      });
    }
    console.log('[apply-ai-code-stream] Packages found:', parsed.packages);

    // Initialize existingFiles if not already
    if (!global.existingFiles) {
      global.existingFiles = new Set<string>();
    }

    // Try to get provider from sandbox manager first
    let provider = sandboxId ? sandboxManager.getProvider(sandboxId) : sandboxManager.getActiveProvider();

    // Fall back to global state if not found in manager
    if (!provider) {
      provider = global.activeSandboxProvider;
    }

    // If we have a sandboxId but no provider, try to get or create one
    if (!provider && sandboxId) {
      console.log(`[apply-ai-code-stream] No provider found for sandbox ${sandboxId}, attempting to get or create...`);

      try {
        provider = await sandboxManager.getOrCreateProvider(sandboxId);

        // If we got a new provider (not reconnected), we need to create a new sandbox
        if (!provider.getSandboxInfo()) {
          console.log(`[apply-ai-code-stream] Creating new sandbox since reconnection failed for ${sandboxId}`);
          await provider.createSandbox();
          await provider.setupViteApp();
          sandboxManager.registerSandbox(sandboxId, provider);
        }

        // Update legacy global state
        global.activeSandboxProvider = provider;
        console.log(`[apply-ai-code-stream] Successfully got provider for sandbox ${sandboxId}`);
      } catch (providerError) {
        console.error(`[apply-ai-code-stream] Failed to get or create provider for sandbox ${sandboxId}:`, providerError);
        return NextResponse.json({
          success: false,
          error: `Failed to create sandbox provider for ${sandboxId}. The sandbox may have expired.`,
          results: {
            filesCreated: [],
            packagesInstalled: [],
            commandsExecuted: [],
            errors: [`Sandbox provider creation failed: ${(providerError as Error).message}`]
          },
          explanation: parsed.explanation,
          structure: parsed.structure,
          parsedFiles: parsed.files,
          message: `Parsed ${parsed.files.length} files but couldn't apply them - sandbox reconnection failed.`
        }, { status: 500 });
      }
    }

    // If we still don't have a provider, create a new one
    if (!provider) {
      console.log(`[apply-ai-code-stream] No active provider found, creating new sandbox...`);
      try {
        const { SandboxFactory } = await import('@/lib/sandbox/factory');
        provider = SandboxFactory.create();
        const sandboxInfo = await provider.createSandbox();
        await provider.setupViteApp();

        // Register with sandbox manager
        sandboxManager.registerSandbox(sandboxInfo.sandboxId, provider);

        // Store in legacy global state
        global.activeSandboxProvider = provider;
        global.sandboxData = {
          sandboxId: sandboxInfo.sandboxId,
          url: sandboxInfo.url
        };

        console.log(`[apply-ai-code-stream] Created new sandbox successfully`);
      } catch (createError) {
        console.error(`[apply-ai-code-stream] Failed to create new sandbox:`, createError);
        return NextResponse.json({
          success: false,
          error: `Failed to create new sandbox: ${createError instanceof Error ? createError.message : 'Unknown error'}`,
          results: {
            filesCreated: [],
            packagesInstalled: [],
            commandsExecuted: [],
            errors: [`Sandbox creation failed: ${createError instanceof Error ? createError.message : 'Unknown error'}`]
          },
          explanation: parsed.explanation,
          structure: parsed.structure,
          parsedFiles: parsed.files,
          message: `Parsed ${parsed.files.length} files but couldn't apply them - sandbox creation failed.`
        }, { status: 500 });
      }
    }

    const providerInfo = provider.getSandboxInfo();
    if (!providerInfo) {
      return NextResponse.json({
        error: 'The sandbox provider has no active sandbox information.',
      }, { status: 500 });
    }

    const liveSandboxId = providerInfo.sandboxId;
    const generation = await resolveGeneration(generationContext);
    const brief = { contentFacts: [], allowedPlaceholders: [] };
    const plan = { primaryCta: null, declaredPackages: artifact.packages };
    await Promise.all([
      setGenerationSandboxId(generation.id, liveSandboxId),
      saveGenerationPayload(generation.id, 'artifact_json', artifact),
      saveGenerationPayload(generation.id, 'brief_json', brief),
      saveGenerationPayload(generation.id, 'plan_json', plan),
      updateGenerationStage(generation.id, 'applying', 'running'),
    ]);

    // Create a response stream for real-time updates
    const encoder = new TextEncoder();
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();

    // Function to send progress updates
    const sendProgress = async (data: any) => {
      const message = `data: ${JSON.stringify(data)}\n\n`;
      await writer.write(encoder.encode(message));
    };

    // Start processing in background (pass provider and request to the async function)
    (async (providerInstance, req) => {
      const results = {
        filesCreated: [] as string[],
        filesUpdated: [] as string[],
        packagesInstalled: [] as string[],
        packagesAlreadyInstalled: [] as string[],
        packagesFailed: [] as string[],
        commandsExecuted: [] as string[],
        errors: [] as string[]
      };
      let candidateMutation: ReturnType<typeof createLiveCandidateMutationBarrier> | undefined;
      let activationPromise: ReturnType<ReturnType<typeof createLiveValidationActivation>['activate']> | undefined;

      try {
        await sendProgress({
          type: 'start',
          message: 'Starting code application...',
          totalSteps: 3
        });
        if (morphEnabled) {
          await sendProgress({ type: 'info', message: 'Morph Fast Apply enabled' });
          await sendProgress({ type: 'info', message: `Parsed ${morphEdits.length} Morph edits` });
          if (morphEdits.length === 0) {
            console.warn('[apply-ai-code-stream] Morph enabled but no <edit> blocks found; falling back to full-file flow');
            await sendProgress({ type: 'warning', message: 'Morph enabled but no <edit> blocks found; falling back to full-file flow' });
          }
        }
        
        // Step 1: Install packages
        const packagesArray = Array.isArray(packages) ? packages : [];
        const parsedPackages = Array.isArray(parsed.packages) ? parsed.packages : [];

        // Combine and deduplicate packages
        const allPackages = [...packagesArray.filter(pkg => pkg && typeof pkg === 'string'), ...parsedPackages];

        // Use Set to remove duplicates, then filter out pre-installed packages
        const uniquePackages = [...new Set(allPackages)]
          .filter(pkg => pkg && typeof pkg === 'string' && pkg.trim() !== '') // Remove empty strings
          .filter(pkg => pkg !== 'react' && pkg !== 'react-dom'); // Filter pre-installed

        // Log if we found duplicates
        if (allPackages.length !== uniquePackages.length) {
          console.log(`[apply-ai-code-stream] Removed ${allPackages.length - uniquePackages.length} duplicate packages`);
          console.log(`[apply-ai-code-stream] Original packages:`, allPackages);
          console.log(`[apply-ai-code-stream] Deduplicated packages:`, uniquePackages);
        }

        if (uniquePackages.length > 0) {
          await sendProgress({
            type: 'step',
            step: 1,
            message: `Installing ${uniquePackages.length} packages...`,
            packages: uniquePackages
          });

          // Use streaming package installation
          try {
            // Construct the API URL properly for both dev and production
            const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
            const host = req.headers.get('host') || 'localhost:3000';
            const apiUrl = `${protocol}://${host}/api/install-packages`;

            const installResponse = await fetch(apiUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                packages: uniquePackages,
                sandboxId: sandboxId || providerInstance.getSandboxInfo()?.sandboxId
              })
            });

            if (installResponse.ok && installResponse.body) {
              const reader = installResponse.body.getReader();
              const decoder = new TextDecoder();

              while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value);
                if (!chunk) continue;
                const lines = chunk.split('\n');

                for (const line of lines) {
                  if (line.startsWith('data: ')) {
                    try {
                      const data = JSON.parse(line.slice(6));

                      // Forward package installation progress
                      await sendProgress({
                        type: 'package-progress',
                        ...data
                      });

                      // Track results
                      if (data.type === 'success' && data.installedPackages) {
                        results.packagesInstalled = data.installedPackages;
                      }
                    } catch (parseError) {
                      console.debug('Error parsing terminal output:', parseError);
                    }
                  }
                }
              }
            }
          } catch (error) {
            console.error('[apply-ai-code-stream] Error installing packages:', error);
            await sendProgress({
              type: 'warning',
              message: `Package installation skipped (${(error as Error).message}). Continuing with file creation...`
            });
            results.errors.push(`Package installation failed: ${(error as Error).message}`);
          }
        } else {
          await sendProgress({
            type: 'step',
            step: 1,
            message: 'No additional packages to install, skipping...'
          });
        }

        // Step 2: create/update only the validated candidate paths. Package
        // installation deliberately remains outside the rollback boundary.
        const filesArray = artifact.files;
        await sendProgress({
          type: 'step',
          step: 2,
          message: `Creating ${filesArray.length} files...`
        });

        // The durable artifact parser already excludes configuration files.
        const configFiles: string[] = [];
        let filteredFiles = [...filesArray];

        const sandboxService = createProviderBackedSandboxService(providerInstance as SandboxProvider, liveSandboxId);
        const repository: GenerationRepairPersistence = {
          persistValidation: async ({ generationId, report, status }) => {
            await persistGenerationTerminalValidation(generationId, report);
            await updateGenerationStage(generationId, 'completed', status);
          },
          claimRepairAttempt: async (generationId) => {
            const claimed = await claimGenerationRepairAttempt(generationId);
            return claimed ? { id: claimed.id, repairCount: claimed.repairCount } : null;
          },
        };
        const repairModel = getLanguageModel(resolveModelRoute('repair'));
        const orchestrator = createGenerationOrchestrator({
          validation: createProductionValidationDependencies({
            sandbox: sandboxService,
            captureOutput: async () => ({ output: { kind: 'live-output-capture-not-retained' } }),
            readPng: async () => {
              throw new Error('Durable screenshot artifacts are unavailable for this live apply.');
            },
          }),
          repository,
          repair: {
            generatePatch: async (context) => {
              const result = await generateObject({
                model: repairModel,
                schema: GenerationArtifactSchema,
                system: 'You are G Studio\'s scoped repair worker. Return only a structured patch for the supplied failed files and safe npm packages.',
                prompt: context.prompt,
              });
              return result.object;
            },
            applyPatch: async ({ sandboxId, patch }) => {
              await sandboxService.writeFiles(sandboxId, patch.files);
              const repairPackages = patch.packages ?? [];
              if (repairPackages.length > 0) {
                const installResult = await providerInstance.installPackages(repairPackages);
                if (!installResult.success) {
                  throw new Error('The scoped repair dependencies could not be installed.');
                }
              }
              await providerInstance.restartViteServer();
            },
          },
        });
        const activation = createLiveValidationActivation({ sandbox: sandboxService, orchestrator });
        candidateMutation = createLiveCandidateMutationBarrier();
        activationPromise = activation.activate({
          artifact,
          brief,
          plan,
          mode: generationContext.mode,
          sandboxId: liveSandboxId,
          sandboxUrl: providerInfo.url,
          desktopWidth: 1440,
          generation: {
            id: generation.id,
            projectId: generation.projectId,
            repairCount: generation.repairCount,
          },
          snapshotPaths: artifact.files.map((file) => file.path),
          applyCandidate: candidateMutation.applyCandidate,
        });
        await candidateMutation.waitUntilStarted();

        // If Morph is enabled and we have edits, apply them before file writes
        const morphUpdatedPaths = new Set<string>();
        if (morphEnabled && morphEdits.length > 0) {
          const morphSandbox = (global as any).activeSandbox || providerInstance;
          if (!morphSandbox) {
            console.warn('[apply-ai-code-stream] No sandbox available to apply Morph edits');
            await sendProgress({ type: 'warning', message: 'No sandbox available to apply Morph edits' });
          } else {
            await sendProgress({ type: 'info', message: `Applying ${morphEdits.length} fast edits via Morph...` });
            for (const [idx, edit] of morphEdits.entries()) {
              try {
                await sendProgress({ type: 'file-progress', current: idx + 1, total: morphEdits.length, fileName: edit.targetFile, action: 'morph-applying' });
                const result = await applyMorphEditToFile({
                  sandbox: morphSandbox,
                  targetPath: edit.targetFile,
                  instructions: edit.instructions,
                  updateSnippet: edit.update
                });
                if (result.success && result.normalizedPath) {
                  console.log('[apply-ai-code-stream] Morph updated', result.normalizedPath);
                  morphUpdatedPaths.add(result.normalizedPath);
                  if (results.filesUpdated) results.filesUpdated.push(result.normalizedPath);
                  await sendProgress({ type: 'file-complete', fileName: result.normalizedPath, action: 'morph-updated' });
                } else {
                  const msg = result.error || 'Unknown Morph error';
                  console.error('[apply-ai-code-stream] Morph apply failed for', edit.targetFile, msg);
                  if (results.errors) results.errors.push(`Morph apply failed for ${edit.targetFile}: ${msg}`);
                  await sendProgress({ type: 'file-error', fileName: edit.targetFile, error: msg });
                }
              } catch (err) {
                const msg = (err as Error).message;
                console.error('[apply-ai-code-stream] Morph apply exception for', edit.targetFile, msg);
                if (results.errors) results.errors.push(`Morph apply exception for ${edit.targetFile}: ${msg}`);
                await sendProgress({ type: 'file-error', fileName: edit.targetFile, error: msg });
              }
            }
          }
        }

        // Avoid overwriting Morph-updated files in the file write loop
        if (morphUpdatedPaths.size > 0) {
          filteredFiles = filteredFiles.filter(file => {
            if (!file?.path) return true;
            let normalizedPath = file.path.startsWith('/') ? file.path.slice(1) : file.path;
            const fileName = normalizedPath.split('/').pop() || '';
            if (!normalizedPath.startsWith('src/') &&
                !normalizedPath.startsWith('public/') &&
                normalizedPath !== 'index.html' &&
                !configFiles.includes(fileName)) {
              normalizedPath = 'src/' + normalizedPath;
            }
            return !morphUpdatedPaths.has(normalizedPath);
          });
        }
        
        for (const [index, file] of filteredFiles.entries()) {
          try {
            // Send progress for each file
            await sendProgress({
              type: 'file-progress',
              current: index + 1,
              total: filteredFiles.length,
              fileName: file.path,
              action: 'creating'
            });

            // Normalize the file path
            let normalizedPath = file.path;
            if (normalizedPath.startsWith('/')) {
              normalizedPath = normalizedPath.substring(1);
            }
            if (!normalizedPath.startsWith('src/') &&
              !normalizedPath.startsWith('public/') &&
              normalizedPath !== 'index.html' &&
              !configFiles.includes(normalizedPath.split('/').pop() || '')) {
              normalizedPath = 'src/' + normalizedPath;
            }

            const isUpdate = global.existingFiles.has(normalizedPath);

            // Remove any CSS imports from JSX/JS files (we're using Tailwind)
            let fileContent = file.content;
            if (file.path.endsWith('.jsx') || file.path.endsWith('.js') || file.path.endsWith('.tsx') || file.path.endsWith('.ts')) {
              fileContent = fileContent.replace(/import\s+['"]\.\/[^'"]+\.css['"];?\s*\n?/g, '');
            }

            // Fix common Tailwind CSS errors in CSS files
            if (file.path.endsWith('.css')) {
              // Replace shadow-3xl with shadow-2xl (shadow-3xl doesn't exist)
              fileContent = fileContent.replace(/shadow-3xl/g, 'shadow-2xl');
              // Replace any other non-existent shadow utilities
              fileContent = fileContent.replace(/shadow-4xl/g, 'shadow-2xl');
              fileContent = fileContent.replace(/shadow-5xl/g, 'shadow-2xl');
            }

            // A provider write rejection must reach the activation boundary so
            // the candidate is rolled back and persisted as terminally failed.
            await writeLiveCandidateFile({
              provider: providerInstance,
              path: normalizedPath,
              content: fileContent,
            });

            // Update file cache
            if (global.sandboxState?.fileCache) {
              global.sandboxState.fileCache.files[normalizedPath] = {
                content: fileContent,
                lastModified: Date.now()
              };
            }

            if (isUpdate) {
              if (results.filesUpdated) results.filesUpdated.push(normalizedPath);
            } else {
              if (results.filesCreated) results.filesCreated.push(normalizedPath);
              if (global.existingFiles) global.existingFiles.add(normalizedPath);
            }

            await sendProgress({
              type: 'file-complete',
              fileName: normalizedPath,
              action: isUpdate ? 'updated' : 'created'
            });
          } catch (error) {
            if (results.errors) {
              results.errors.push(`Failed to create ${file.path}: ${(error as Error).message}`);
            }
            await sendProgress({
              type: 'file-error',
              fileName: file.path,
              error: (error as Error).message
            });
            throw error;
          }
        }

        // Generated shell commands are not inside the validated file artifact,
        // so they are intentionally not executed by the rollbackable live apply.
        if (parsed.commands.length > 0) {
          await sendProgress({
            type: 'warning',
            message: 'Generated shell commands were skipped because live validation only applies the scoped file artifact.',
          });
        }

        await providerInstance.restartViteServer();
        await sendProgress({ type: 'validation-started', message: 'Running deterministic live validation...' });
        candidateMutation.complete();
        const activationResult = await activationPromise;
        const applicationPassed = await emitLiveActivationTerminalEvents({
          result: activationResult,
          send: sendProgress,
          failureMessage: safeValidationReason(activationResult.report),
        });
        if (!applicationPassed) {
          return;
        }

        await sendProgress({
          type: 'complete',
          results,
          explanation: parsed.explanation,
          structure: parsed.structure,
          validation: activationResult.report,
          message: `Successfully applied and validated ${results.filesCreated.length + results.filesUpdated.length} files`,
        });

        // Track applied files in conversation state
        if (global.conversationState && results.filesCreated.length > 0) {
          const messages = global.conversationState.context.messages;
          if (messages.length > 0) {
            const lastMessage = messages[messages.length - 1];
            if (lastMessage.role === 'user') {
              lastMessage.metadata = {
                ...lastMessage.metadata,
                editedFiles: results.filesCreated
              };
            }
          }

          // Track applied code in project evolution
          if (global.conversationState.context.projectEvolution) {
            global.conversationState.context.projectEvolution.majorChanges.push({
              timestamp: Date.now(),
              description: parsed.explanation || 'Code applied',
              filesAffected: results.filesCreated || []
            });
          }

          global.conversationState.lastUpdated = Date.now();
        }

      } catch (error) {
        candidateMutation?.fail(error);
        let emittedTerminalFailure = false;
        if (activationPromise) {
          try {
            const activationResult = await activationPromise;
            if (activationResult.status === 'failed') {
              await emitLiveActivationTerminalEvents({
                result: activationResult,
                send: sendProgress,
                failureMessage: safeValidationReason(activationResult.report),
              });
              emittedTerminalFailure = true;
            }
          } catch (activationError) {
            console.error('[apply-ai-code-stream] Live activation failed:', activationError);
          }
        }
        if (!emittedTerminalFailure) {
          await sendProgress({
            type: 'error',
            error: 'The candidate could not be applied and validated safely.'
          });
        }
      } finally {
        await writer.close();
      }
    })(provider, request);

    // Return the stream
    return new Response(stream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error('Apply AI code stream error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to parse AI code' },
      { status: 500 }
    );
  }
}

/** A candidate cannot mutate a sandbox without a durable generation record. */
const GenerationContextSchema = z.object({
  generationId: z.string().uuid().optional(),
  projectId: z.string().min(1),
  mode: z.enum(['scratch', 'edit', 'inspiration', 'clone']),
  prompt: z.string().min(1),
  targetUrl: z.string().url().nullable(),
});

type GenerationContext = z.infer<typeof GenerationContextSchema>;

function safeValidationReason(report: ValidationReport): string {
  if (report.repairEligibility?.failureClass === 'capture-policy') {
    return 'Reference evidence is required before this candidate can be applied.';
  }
  if (report.repairEligibility?.failureClass === 'sandbox-infrastructure') {
    return 'The sandbox could not complete deterministic validation.';
  }
  return 'The candidate did not pass deterministic validation.';
}

function toValidationArtifact(parsed: ParsedResponse): GenerationArtifact {
  return GenerationArtifactSchema.parse({
    files: parsed.files.filter((file) => /^(?:src|public)\/[A-Za-z0-9][A-Za-z0-9._/-]*$|^index\.html$/.test(file.path)),
    packages: parsed.packages,
  });
}

function createProviderBackedSandboxService(provider: SandboxProvider, sandboxId: string) {
  return createSandboxService({
    providers: {
      allocate: async () => {
        throw new Error('Live apply uses an existing sandbox and cannot allocate a second sandbox.');
      },
      connect: async (requestedSandboxId) => {
        if (requestedSandboxId !== sandboxId) {
          throw new Error('Live apply attempted to validate a different sandbox.');
        }
        return provider;
      },
    },
    leases: {},
  });
}

async function resolveGeneration(context: GenerationContext) {
  if (context.generationId) {
    const existing = await getGeneration(context.generationId);
    if (!existing) {
      throw new Error('The requested generation record does not exist.');
    }
    if (existing.projectId !== context.projectId) {
      throw new Error('The requested generation does not belong to this project.');
    }
    return existing;
  }

  return createGeneration({
    id: randomUUID(),
    projectId: context.projectId,
    mode: context.mode,
    prompt: context.prompt,
    targetUrl: context.targetUrl,
    userId: null,
  });
}
