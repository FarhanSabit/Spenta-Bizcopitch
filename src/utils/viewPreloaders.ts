import type { NavTab } from '../data/spentaManifest';

export const viewImporters = {
  'App Vault': () =>
    import('../components/SpentaBrainVault').then((m) => ({ default: m.SpentaBrainVault })),
  Infographics: () =>
    import('../components/InfographicsView').then((m) => ({ default: m.InfographicsView })),
  Financials: () =>
    import('../components/FinancialsView').then((m) => ({ default: m.FinancialsView })),
  'Spenta Core': () =>
    import('../components/SpentaCoreView').then((m) => ({ default: m.SpentaCoreView })),
  'The Brain': () =>
    import('../components/TheBrainView').then((m) => ({ default: m.TheBrainView })),
  'Pitch Deck': () =>
    import('../components/PitchDeckView').then((m) => ({ default: m.PitchDeckView })),
  Resources: () =>
    import('../components/ResourcesView').then((m) => ({ default: m.ResourcesView })),
} as const;

export const stackComposerImporter = () =>
  import('../components/StackComposerDrawer').then((m) => ({ default: m.StackComposerDrawer }));

export const aiAssistantImporter = () =>
  import('../components/SpentaAiAssistant').then((m) => ({ default: m.SpentaAiAssistant }));

const preloadCache = new Map<string, Promise<unknown>>();

function runPreload(key: string, loader: () => Promise<unknown>): void {
  if (preloadCache.has(key)) return;
  const pending = loader().catch(() => {
    // Allow future hover/click attempts to retry if a transient network glitch occurs
    preloadCache.delete(key);
  });
  preloadCache.set(key, pending);
}

/**
 * Prefetches a tab's code-split bundle on hover/focus so tab switches feel instant.
 */
export function preloadTabView(tab: NavTab): void {
  const loader = viewImporters[tab];
  if (loader) {
    runPreload(`tab:${tab}`, loader);
  }
}

export function preloadStackComposer(): void {
  runPreload('panel:stack-composer', stackComposerImporter);
}

export function preloadAiAssistant(): void {
  runPreload('panel:ai-assistant', aiAssistantImporter);
}
