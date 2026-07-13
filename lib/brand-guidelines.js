function normalizePixelSize(value, { min, max, fallback }) {
  const match = String(value || '').trim().match(/^(\d+(?:\.\d+)?)px$/i);
  if (!match) return fallback;
  const pixels = Number(match[1]);
  return pixels >= min && pixels <= max ? `${pixels}px` : fallback;
}

/** @param {Record<string, any>} guidelines */
export function normalizeBrandGuidelines(guidelines = {}) {
  const normalized = JSON.parse(JSON.stringify(guidelines));
  normalized.typography ||= {};
  normalized.typography.fontSizes ||= {};

  const sizes = normalized.typography.fontSizes;
  sizes.h1 = normalizePixelSize(sizes.h1, { min: 28, max: 96, fallback: '56px' });
  sizes.h2 = normalizePixelSize(sizes.h2, { min: 24, max: 72, fallback: '40px' });
  sizes.body = normalizePixelSize(sizes.body, { min: 12, max: 24, fallback: '16px' });

  return normalized;
}

