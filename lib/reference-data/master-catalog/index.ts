import type { MasterCatalogNode } from "./types.ts";
import { partsCatalogOverlays, transportCatalogOverlays } from "./transport.ts";
import { jobsCatalogOverlays, realEstateCatalogOverlays } from "./jobs-real-estate.ts";
import { servicesCatalogOverlays } from "./services.ts";
import { goodsCatalogOverlays } from "./goods.ts";
import {
  animalCatalogOverlays,
  businessCatalogOverlays,
  communityCatalogOverlays,
  fashionCatalogOverlays,
  hobbyCatalogOverlays,
  homeGardenCatalogOverlays,
  kidsCatalogOverlays,
} from "./lifestyle.ts";

const masterCatalogOverlays: MasterCatalogNode[] = [
  ...transportCatalogOverlays,
  ...partsCatalogOverlays,
  ...realEstateCatalogOverlays,
  ...jobsCatalogOverlays,
  ...servicesCatalogOverlays,
  ...goodsCatalogOverlays,
  ...homeGardenCatalogOverlays,
  ...fashionCatalogOverlays,
  ...kidsCatalogOverlays,
  ...hobbyCatalogOverlays,
  ...animalCatalogOverlays,
  ...businessCatalogOverlays,
  ...communityCatalogOverlays,
];

function mergeNode<T extends MasterCatalogNode>(base: T, patch: MasterCatalogNode): T {
  const baseChildren = base.children ?? [];
  const patchChildren = patch.children ?? [];
  const patchBySlug = new Map(patchChildren.map((child) => [child.slug, child]));
  const mergedChildren = baseChildren.map((child) => {
    const childPatch = patchBySlug.get(child.slug);
    if (!childPatch) return child;
    patchBySlug.delete(child.slug);
    return mergeNode(child, childPatch);
  });
  mergedChildren.push(...patchBySlug.values());

  return {
    ...base,
    ...patch,
    name: patch.name ?? base.name,
    children: mergedChildren.length ? mergedChildren : undefined,
  } as T;
}

export function applyMasterCatalogExtensions<T extends MasterCatalogNode>(base: T[]): T[] {
  const patchBySlug = new Map(masterCatalogOverlays.map((node) => [node.slug, node]));
  const merged = base.map((node) => {
    const patch = patchBySlug.get(node.slug);
    if (!patch) return node;
    patchBySlug.delete(node.slug);
    return mergeNode(node, patch);
  });
  merged.push(...([...patchBySlug.values()] as T[]));
  return merged;
}

function collectProfileAssignments(
  nodes: MasterCatalogNode[],
  inherited: readonly string[] = [],
  target: Record<string, string[]> = {},
) {
  for (const node of nodes) {
    const profiles = node.schemaProfiles ?? inherited;
    if (profiles.length) target[node.slug] = [...profiles];
    if (node.children?.length) collectProfileAssignments(node.children, profiles, target);
  }
  return target;
}

export const masterCatalogProfileAssignments = collectProfileAssignments(masterCatalogOverlays);
export { masterCatalogOverlays };
export type { MasterCatalogNode } from "./types.ts";
