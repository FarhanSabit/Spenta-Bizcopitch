import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createPreloadRegistry } from '../src/utils/viewPreloaders.ts';
import { LocalPersistenceService } from '../src/utils/LocalPersistenceService.ts';

describe('createPreloadRegistry (once-only speculative preloading)', () => {
  it('invokes the dynamic loader strictly once across repeated hover/focus triggers', async () => {
    const registry = createPreloadRegistry({ shouldSkipSpeculative: () => false });
    let calls = 0;
    const loader = async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 15));
      return { default: 'FinancialsView' };
    };

    const p1 = registry.preloadOnce('tab:Financials', loader);
    const p2 = registry.preloadOnce('tab:Financials', loader);
    assert.equal(registry.getStatus('tab:Financials'), 'loading');
    assert.equal(p1, p2, 'In-flight preload calls must share the same promise');

    await p1;
    assert.equal(registry.getStatus('tab:Financials'), 'loaded');

    const p3 = registry.preloadOnce('tab:Financials', loader);
    assert.equal(p3, null, 'Already-loaded view must not trigger another fetch');
    assert.equal(calls, 1, 'Loader must be called strictly once');
  });

  it('skips preloading when a view is already marked loaded', () => {
    const registry = createPreloadRegistry({ shouldSkipSpeculative: () => false });
    let calls = 0;
    registry.markLoaded('tab:The Brain');
    const result = registry.preloadOnce('tab:The Brain', async () => {
      calls += 1;
      return {};
    });
    assert.equal(result, null);
    assert.equal(calls, 0);
  });

  it('allows retry after a transient failure and respects Data Saver skip check', async () => {
    let skip = true;
    const registry = createPreloadRegistry({ shouldSkipSpeculative: () => skip });
    let attempts = 0;

    assert.equal(
      registry.preloadOnce('tab:Pitch Deck', async () => {
        attempts += 1;
        return {};
      }),
      null,
    );
    assert.equal(attempts, 0);

    skip = false;
    await registry.preloadOnce('tab:Pitch Deck', async () => {
      attempts += 1;
      throw new Error('offline');
    });
    assert.equal(registry.getStatus('tab:Pitch Deck'), 'idle');

    await registry.preloadOnce('tab:Pitch Deck', async () => {
      attempts += 1;
      return { ok: true };
    });
    assert.equal(registry.getStatus('tab:Pitch Deck'), 'loaded');
    assert.equal(attempts, 2);
  });
});

describe('LocalPersistenceService (offline-first storage)', () => {
  it('saves, loads, exports, imports, and clears calculator state, chart projections, and session data', async () => {
    const svc = new LocalPersistenceService('spenta_unit_test_db', 1);

    await svc.saveCalculatorState({
      scenario: 'upside',
      growthMode: 'aggressive',
      fxRate: 125,
      taxRate: 22,
      exitMultiple: 12,
      dilutionPct: 10,
      investmentK: 250,
      horizonYears: 4,
      compareGrowthScenarios: true,
      projectedChartMetric: 'moic',
      subTab: 'pnl',
      mixPreset: 'fy31',
      mixScopeWeights: { custom_ai: 40, recurring_saas: 60 },
      mixOpexRatioPct: 24,
    });

    await svc.saveChartProjection(
      'investor_roi_series',
      [
        { year: 'FY2027', stakeValueK: 120, moic: 0.48 },
        { year: 'FY2030', stakeValueK: 1120, moic: 4.48 },
      ],
      { investmentK: 250, horizonYears: 4 },
    );

    await svc.saveUserSession({
      activeTab: 'Financials',
      selectedIds: ['icr_ops', 'genai_bi'],
      deploymentTarget: 'on-prem',
      savedProposalsCount: 2,
      neuralCoreSystem: 'solar-map',
    });

    const calc = await svc.loadCalculatorState();
    assert.equal(calc?.investmentK, 250);
    assert.equal(calc?.horizonYears, 4);
    assert.equal(calc?.compareGrowthScenarios, true);
    assert.ok(calc?.updatedAt);

    const proj = await svc.loadChartProjection<{ year: string; moic: number }[]>(
      'investor_roi_series',
    );
    assert.equal(proj?.data.length, 2);
    assert.equal(proj?.data[1].moic, 4.48);

    const session = await svc.loadUserSession();
    assert.equal(session?.activeTab, 'Financials');
    assert.deepEqual(session?.selectedIds, ['icr_ops', 'genai_bi']);

    const bundle = await svc.exportAllOfflineData();
    await svc.clearAll();
    assert.equal(await svc.loadCalculatorState(), null);

    await svc.importAllOfflineData(bundle);
    const restored = await svc.loadCalculatorState();
    assert.equal(restored?.investmentK, 250);
    assert.equal(restored?.projectedChartMetric, 'moic');
  });
});
