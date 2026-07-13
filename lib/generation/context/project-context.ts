type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

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
  return `<project-facts>\n${toJson(projectFacts, "projectFacts")}\n</project-facts>`;
}

export function formatDesignPlan(designPlan: JsonValue | null): string | null {
  if (designPlan === null) return null;
  return `<design-plan>\n${toJson(designPlan, "designPlan")}\n</design-plan>`;
}

export type { JsonValue };
