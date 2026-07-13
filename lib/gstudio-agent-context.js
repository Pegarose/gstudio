import fs from 'node:fs';
import path from 'node:path';
import { resolveGenerationIntent } from './generation-intent.js';

export { resolveGenerationIntent } from './generation-intent.js';

/** @param {{ intent?: string, prompt?: string, isEdit?: boolean }} options */
export function selectSkillsForGeneration({ intent, prompt = '', isEdit = false } = {}) {
  const resolvedIntent = resolveGenerationIntent({ explicitIntent: intent, instructions: prompt });
  const lower = String(prompt).toLowerCase();
  const explicitSingleComponent = /\b(single|isolated)\s+(button|input|component|element)\b|tek bir\s+(buton|input|bileşen|öğe)|^(create|build)\s+(a|an)\s+(button|input)\b/.test(lower.trim());
  const singleComponent = resolvedIntent === 'scratch' && explicitSingleComponent;
  const skills = singleComponent ? ['component-scope'] : ['design-core', 'design-intelligence'];

  if (!singleComponent && resolvedIntent === 'clone') skills.push('clone-fidelity');
  if (!singleComponent && resolvedIntent === 'inspire') skills.push('brand-extract');
  if (/\b(error|bug|fail)\b|hata|derleme|bozuk/.test(lower)) skills.push('auto-debug');
  if (/\b(screenshot|visual reference)\b|görsel referans|bunun gibi/.test(lower)) skills.push('design-study');

  return [...new Set(skills)];
}

function readRequired(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing canonical G Studio agent context file: ${filePath}`);
  }
  return fs.readFileSync(filePath, 'utf8');
}

function extractLiteralPrompt(markdown) {
  const blocks = [...markdown.matchAll(/```(?:[^\n]*)\n([\s\S]*?)```/g)].map(match => match[1].trim());
  return blocks.length > 0 ? blocks.join('\n\n') : markdown;
}

/** @param {{ intent?: string, prompt?: string, isEdit?: boolean, cwd?: string }} options */
export function loadAgentContext({ intent, prompt = '', isEdit = false, cwd = process.cwd() } = {}) {
  const sourceRoot = path.resolve(cwd, 'gstudio-agent-context');
  const resolvedIntent = resolveGenerationIntent({ explicitIntent: intent, instructions: prompt });
  const coreMarkdown = readRequired(path.join(sourceRoot, '00-core-system-prompt.md'));
  const skills = selectSkillsForGeneration({ intent: resolvedIntent, prompt, isEdit });

  const skillPrompt = skills.map(skill => {
    const filename = skill === 'auto-debug' ? 'auto-debug_md.md' : `${skill}.md`;
    const content = readRequired(path.join(sourceRoot, 'skills', filename));
    return `=== G STUDIO SKILL: ${skill.toUpperCase()} ===\n${content}`;
  }).join('\n\n');

  const resources = [];
  if (skills.includes('design-intelligence')) {
    resources.push(`=== DESIGN INTELLIGENCE DATA ===\n${readRequired(path.join(sourceRoot, 'data', 'design-intelligence.json'))}`);
  }
  if (isEdit) {
    resources.push(`=== EDIT MODE EXAMPLES ===\n${readRequired(path.join(sourceRoot, 'data', 'edit-examples.md'))}`);
  }

  return {
    intent: resolvedIntent,
    skills,
    systemPrompt: extractLiteralPrompt(coreMarkdown),
    skillPrompt: [skillPrompt, ...resources].filter(Boolean).join('\n\n')
  };
}
