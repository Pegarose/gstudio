import type { CapabilityRequirement, ModelRoute } from "./contracts";

function matches(route: ModelRoute, requirement: CapabilityRequirement): boolean {
  return Object.entries(requirement).every(([capability, required]) =>
    route.capabilities[capability as keyof ModelRoute["capabilities"]] === required,
  );
}

export interface ModelRouter {
  resolve(requirement: CapabilityRequirement, preferredId?: string): ModelRoute;
  fallbacksFor(routeId: string, requirement: CapabilityRequirement): ModelRoute[];
}

export function createModelRouter(routes: readonly ModelRoute[]): ModelRouter {
  const byId = new Map(routes.map((route) => [route.id, route]));

  function fallbacksFor(routeId: string, requirement: CapabilityRequirement): ModelRoute[] {
    const route = byId.get(routeId);
    if (!route) return [];

    return route.fallbacks
      .map((fallbackId) => byId.get(fallbackId))
      .filter((fallback): fallback is ModelRoute => fallback !== undefined)
      .filter((fallback) => matches(fallback, requirement));
  }

  function resolve(requirement: CapabilityRequirement, preferredId?: string): ModelRoute {
    const preferred = preferredId ? byId.get(preferredId) : undefined;
    if (preferred && matches(preferred, requirement)) return preferred;

    if (preferred) {
      const fallback = fallbacksFor(preferred.id, requirement)[0];
      if (fallback) return fallback;
    }

    const route = routes.find((candidate) => matches(candidate, requirement));
    if (route) return route;

    throw new Error(`No model route satisfies required capabilities: ${JSON.stringify(requirement)}`);
  }

  return { resolve, fallbacksFor };
}
