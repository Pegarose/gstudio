type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

const REDACTED = "[redacted]";
const secretKeyPattern = /api[_-]?key|secret|password|passwd|token|credential|authorization|cookie|private[_-]?key|database[_-]?url|connection[_-]?string/i;
const filesystemPathPattern = /^(?:[a-z]:[\\/]|\\\\|~[\\/]|\/(?:Users|home|var|tmp|etc|private|opt|root|mnt|srv|Volumes)(?:\/|$))/i;
const secretValuePattern = /(?:\b(?:sk|rk|pk)-[a-z0-9_-]{8,}|\bgh[pous]_[a-z0-9_-]{8,}|\bgithub_pat_[a-z0-9_-]{8,}|\bAKIA[A-Z0-9]{16}\b|\bBearer\s+\S+|[a-z][a-z0-9+.-]*:\/\/[^\s/@:]+:[^\s/@]+@)/i;

function isSensitiveEnvironmentKey(key: string): boolean {
  return secretKeyPattern.test(key);
}

function sensitiveEnvironmentValues(): string[] {
  return Object.entries(process.env)
    .filter(([key, value]) => isSensitiveEnvironmentKey(key) && Boolean(value))
    .map(([, value]) => value as string)
    .filter(value => value.length >= 8);
}

function isSensitiveString(value: string, environmentValues: string[]): boolean {
  return isSensitiveEnvironmentKey(value)
    || filesystemPathPattern.test(value)
    || secretValuePattern.test(value)
    || environmentValues.some(environmentValue => value.includes(environmentValue));
}

export function redactProjectContext(value: JsonValue): JsonValue {
  const environmentValues = sensitiveEnvironmentValues();

  function redact(current: JsonValue): JsonValue {
    if (typeof current === "string") {
      return isSensitiveString(current, environmentValues) ? REDACTED : current;
    }
    if (Array.isArray(current)) {
      return current.map(redact);
    }
    if (current !== null && typeof current === "object") {
      return Object.fromEntries(
        Object.entries(current)
          .filter(([key]) => !isSensitiveEnvironmentKey(key))
          .map(([key, nestedValue]) => [key, redact(nestedValue)]),
      );
    }
    return current;
  }

  return redact(value);
}

function toJson(value: unknown, label: string): string {
  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) {
      throw new TypeError(`${label} must be JSON serializable`);
    }
    return serialized;
  } catch (error) {
    if (error instanceof TypeError && error.message.includes(label)) {
      throw error;
    }
    throw new TypeError(`${label} must be JSON serializable`, { cause: error });
  }
}

export function formatProjectFacts(projectFacts: JsonValue[]): string {
  return `<project-facts>\n${toJson(redactProjectContext(projectFacts), "projectFacts")}\n</project-facts>`;
}

export function formatDesignPlan(designPlan: JsonValue | null): string | null {
  if (designPlan === null) return null;
  return `<design-plan>\n${toJson(redactProjectContext(designPlan), "designPlan")}\n</design-plan>`;
}

export type { JsonValue };
