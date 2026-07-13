const VALID_INTENTS = new Set(['clone', 'inspire', 'scratch']);
const inspirationPattern = /\b(inspir(?:e|ed|ation)?|brand(?:ing)?|visual language|look and feel|design language)\b|ilham\s*al|esinlen|marka\s*(?:dili|kimliği)|tasarım\s*dili|stil(?:ini|inden)\s*(?:al|kullan)/i;
const clonePattern = /\b(clone|recreate|reproduce|replicate)\b|klonla|kopyala|aynısını|birebir/i;

/**
 * @param {{ explicitIntent?: string, instructions?: string, url?: string }} options
 * @returns {'clone' | 'inspire' | 'scratch'}
 */
export function resolveGenerationIntent({ explicitIntent, instructions = '', url = '' } = {}) {
  if (VALID_INTENTS.has(explicitIntent)) return explicitIntent;
  if (String(url).startsWith('scratch://')) return 'scratch';
  if (inspirationPattern.test(instructions)) return 'inspire';
  if (clonePattern.test(instructions)) return 'clone';
  return url ? 'clone' : 'scratch';
}
