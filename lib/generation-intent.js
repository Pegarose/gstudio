const VALID_INTENTS = new Set(['clone', 'inspire', 'scratch']);
const inspirationPattern = /\b(inspir(?:e|ed|ation)?|brand(?:ing)?|visual language|look and feel|design language)\b|ilham\s*al|esinlen|marka\s*(?:dili|kimliği)|tasarım\s*dili|stil(?:ini|inden)\s*(?:al|kullan)/i;
const clonePattern = /\b(clone|recreate|reproduce|replicate)\b|klonla|kopyala|aynısını|birebir/i;

/**
 * @param {{ explicitIntent?: string, instructions?: string, url?: string }} options
 * `clone` is retained as an accepted legacy input, but all reference-based
 * work now enters the original inspiration flow.
 *
 * @returns {'inspire' | 'scratch'}
 */
export function resolveGenerationIntent({ explicitIntent, instructions = '', url = '' } = {}) {
  if (VALID_INTENTS.has(explicitIntent)) {
    return explicitIntent === 'scratch' ? 'scratch' : 'inspire';
  }
  if (String(url).trim().toLowerCase().startsWith('scratch://')) return 'scratch';
  if (inspirationPattern.test(instructions)) return 'inspire';
  if (clonePattern.test(instructions)) return 'inspire';
  return String(url).trim() ? 'inspire' : 'scratch';
}
