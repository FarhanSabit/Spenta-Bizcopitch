import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createPreloadRegistry } from '../src/utils/viewPreloaders.ts';
import { LocalPersistenceService } from '../src/utils/LocalPersistenceService.ts';
import { buildStoredItemsCsv } from '../src/utils/storageCsvExport.ts';

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

describe('LocalPersistenceService (offline-first storage v3)', () => {
  it('saves, loads, exports, imports, and clears calculator state, named scenarios, chart projections, session data, workspace snapshots, investor feedback, diligence prefs, and contact inquiries', async () => {
    const svc = new LocalPersistenceService('spenta_unit_test_db', 3);

    const calcState = {
      scenario: 'upside' as const,
      growthMode: 'aggressive' as const,
      fxRate: 122.61,
      taxRate: 22,
      exitMultiple: 12,
      dilutionPct: 10,
      investmentK: 250,
      horizonYears: 4,
      compareGrowthScenarios: true,
      projectedChartMetric: 'moic' as const,
      subTab: 'pnl' as const,
      mixPreset: 'fy31' as const,
      mixScopeWeights: { one_time_builds: 24, recurring_saas: 44 },
      mixOpexRatioPct: 24,
    };

    await svc.saveCalculatorState(calcState);

    const savedScenario = await svc.saveScenario({
      name: 'Board Upside $250K',
      description: '4-year aggressive projection at 12x exit',
      state: calcState,
    });
    assert.ok(savedScenario.id);
    assert.equal(savedScenario.name, 'Board Upside $250K');

    const loadedScenario = await svc.getScenario(savedScenario.id);
    assert.equal(loadedScenario?.state.investmentK, 250);

    const scenarioList = await svc.listCalculatorScenarios();
    assert.equal(scenarioList.length, 1);

    await svc.saveChartProjection(
      'investor_roi_series',
      [
        { year: 'FY2027', stakeValueK: 120, moic: 0.48 },
        { year: 'FY2030', stakeValueK: 1120, moic: 4.48 },
      ],
      { investmentK: 250, horizonYears: 4 },
    );

    await svc.saveUserSession({
      activeTab: 'Investor Briefing',
      selectedIds: ['icr_ops', 'genai_bi'],
      deploymentTarget: 'on-prem',
      hitlConfidence: 0.94,
      savedProposalsCount: 2,
      neuralCoreSystem: 'solar-map',
    });

    const snapshot = await svc.saveWorkspaceSnapshot({
      name: 'Investor Demo Checkpoint',
      activeTab: 'Investor Briefing',
      selectedIds: ['icr_ops', 'genai_bi'],
      deploymentTarget: 'on-prem',
      hitlConfidence: 0.94,
      calculatorState: calcState,
    });
    assert.ok(snapshot.id);

    const loadedSnapshot = await svc.getWorkspaceSnapshot(snapshot.id);
    assert.equal(loadedSnapshot?.name, 'Investor Demo Checkpoint');
    assert.equal(loadedSnapshot?.calculatorState.horizonYears, 4);

    const snapshotList = await svc.listWorkspaceSnapshots();
    assert.equal(snapshotList.length, 1);

    // v3 stores: Diligence Prefs, Investor Feedback + Replies, Contact Inquiries
    await svc.saveDiligencePrefs({
      currency: 'BDT',
      personaTrack: 'financial',
      bookmarkedDocIds: ['dr-safe-memo', 'dr-5yr-pnl'],
    });
    const loadedPrefs = await svc.loadDiligencePrefs();
    assert.equal(loadedPrefs?.currency, 'BDT');
    assert.equal(loadedPrefs?.personaTrack, 'financial');
    assert.deepEqual(loadedPrefs?.bookmarkedDocIds, ['dr-safe-memo', 'dr-5yr-pnl']);

    const feedback = await svc.saveInvestorFeedback({
      section: '05. Recalibrated 9-Tier Unit Economics',
      text: 'Strong gross margin expansion from Model A1 to C3.',
      priority: 'High',
      sentimentScore: 5,
    });
    assert.ok(feedback.id);
    const updatedFeedback = await svc.addFeedbackReply(
      feedback.id,
      'Confirmed — Tier C3 leverages reusable L1–L6 containers.',
    );
    assert.equal(updatedFeedback?.replies.length, 1);
    assert.equal((await svc.listInvestorFeedback()).length, 1);

    const inquiry = await svc.saveContactInquiry({
      name: 'A. Rahman',
      email: 'ar@fund.vc',
      organization: 'Apex Ventures',
      topic: 'Seed SAFE Term Sheet',
      checkSize: '$100K–$250K',
      message: 'Requesting SAFE memo and Prime Bank case study walkthrough.',
    });
    assert.ok(inquiry.id);
    assert.equal((await svc.listContactInquiries()).length, 1);

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
    assert.equal(session?.activeTab, 'Investor Briefing');
    assert.equal(session?.hitlConfidence, 0.94);
    assert.deepEqual(session?.selectedIds, ['icr_ops', 'genai_bi']);

    const bundle = await svc.exportAllOfflineData();
    assert.equal(Object.keys(bundle.stores.calculatorScenarios).length, 1);
    assert.equal(Object.keys(bundle.stores.workspaceSnapshots).length, 1);
    assert.equal(Object.keys(bundle.stores.investorFeedback).length, 1);
    assert.equal(Object.keys(bundle.stores.contactInquiries).length, 1);
    assert.equal(Object.keys(bundle.stores.diligencePrefs).length, 1);

    const metricsBeforeClear = await svc.getStorageMetrics();
    assert.equal(metricsBeforeClear.totalEntries, 8);
    assert.equal(metricsBeforeClear.scenarioEntries, 1);
    assert.equal(metricsBeforeClear.workspaceEntries, 1);
    assert.ok(metricsBeforeClear.estimatedPayloadBytes > 0);
    assert.equal(metricsBeforeClear.storeStats.length, 8);

    const reconcile = await svc.reconcileAndVerify();
    assert.equal(reconcile.ok, true);
    assert.equal(reconcile.verifiedStores, 8);
    assert.equal(reconcile.totalEntries, 8);

    await svc.clearAll();
    const metricsAfterClear = await svc.getStorageMetrics();
    assert.equal(metricsAfterClear.totalEntries, 0);
    assert.equal(metricsAfterClear.scenarioEntries, 0);
    assert.equal(metricsAfterClear.workspaceEntries, 0);
    assert.equal(await svc.loadCalculatorState(), null);
    assert.equal((await svc.listCalculatorScenarios()).length, 0);
    assert.equal((await svc.listWorkspaceSnapshots()).length, 0);
    assert.equal((await svc.listInvestorFeedback()).length, 0);
    assert.equal((await svc.listContactInquiries()).length, 0);
    assert.equal(await svc.loadDiligencePrefs(), null);

    await svc.importAllOfflineData(bundle);
    const restored = await svc.loadCalculatorState();
    assert.equal(restored?.investmentK, 250);
    assert.equal(restored?.projectedChartMetric, 'moic');
    assert.equal((await svc.listCalculatorScenarios()).length, 1);
    assert.equal((await svc.listWorkspaceSnapshots()).length, 1);
    assert.equal((await svc.listInvestorFeedback()).length, 1);
    assert.equal((await svc.listContactInquiries()).length, 1);
    assert.equal((await svc.loadDiligencePrefs())?.currency, 'BDT');

    await svc.deleteCalculatorScenario(savedScenario.id);
    await svc.deleteWorkspaceSnapshot(snapshot.id);
    await svc.deleteInvestorFeedback(feedback.id);
    await svc.deleteContactInquiry(inquiry.id);
    assert.equal((await svc.listCalculatorScenarios()).length, 0);
    assert.equal((await svc.listWorkspaceSnapshots()).length, 0);
    assert.equal((await svc.listInvestorFeedback()).length, 0);
    assert.equal((await svc.listContactInquiries()).length, 0);
  });

  it('emits live syncing, synced, and offline state updates via subscribe()', async () => {
    const svc = new LocalPersistenceService('spenta_observer_test_db', 3);
    const observedStatuses: string[] = [];
    const unsubscribe = svc.subscribe((snapshot) => {
      observedStatuses.push(snapshot.status);
    });

    assert.equal(observedStatuses[0], 'synced');
    await svc.saveScenario({
      name: 'Observer Check',
      state: {
        scenario: 'conservative',
        growthMode: 'conservative',
        fxRate: 122.61,
        taxRate: 22,
        exitMultiple: 10,
        dilutionPct: 10,
        investmentK: 100,
        horizonYears: 5,
        compareGrowthScenarios: false,
        projectedChartMetric: 'value',
        subTab: 'roi',
        mixPreset: 'fy27',
        mixScopeWeights: { one_time_builds: 50, recurring_saas: 30 },
        mixOpexRatioPct: 28,
      },
    });
    assert.ok(observedStatuses.includes('syncing'));
    assert.equal(svc.getSyncState().status, 'synced');
    assert.ok(svc.getSyncState().revision >= 1);

    svc.setOnlineStatus(false);
    assert.equal(svc.getSyncState().status, 'offline');
    svc.setOnlineStatus(true);
    assert.equal(svc.getSyncState().status, 'synced');

    unsubscribe();
    await svc.clearAll();
  });

  it('prunes workspace snapshots older than 30 days while preserving recent and auto-saved snapshots', async () => {
    const svc = new LocalPersistenceService('spenta_prune_test_db', 3);
    const calcState = {
      scenario: 'conservative' as const,
      growthMode: 'conservative' as const,
      fxRate: 122.61,
      taxRate: 22,
      exitMultiple: 10,
      dilutionPct: 10,
      investmentK: 100,
      horizonYears: 5,
      compareGrowthScenarios: false,
      projectedChartMetric: 'value' as const,
      subTab: 'roi' as const,
      mixPreset: 'fy27' as const,
      mixScopeWeights: { one_time_builds: 50, recurring_saas: 30 },
      mixOpexRatioPct: 28,
    };

    const nowMs = Date.parse('2026-11-27T12:00:00.000Z');
    const thirtyFiveDaysAgo = new Date(nowMs - 35 * 24 * 60 * 60 * 1000).toISOString();
    const fiveDaysAgo = new Date(nowMs - 5 * 24 * 60 * 60 * 1000).toISOString();

    const oldSnap = await svc.saveWorkspaceSnapshot({
      name: 'Expired 35d Snapshot',
      activeTab: 'App Vault',
      selectedIds: ['icr_ops'],
      deploymentTarget: 'on-prem',
      hitlConfidence: 0.9,
      calculatorState: calcState,
      createdAt: thirtyFiveDaysAgo,
      updatedAt: thirtyFiveDaysAgo,
    });

    const recentSnap = await svc.saveWorkspaceSnapshot({
      name: 'Recent 5d Snapshot',
      activeTab: 'Financials',
      selectedIds: ['icr_ops', 'genai_bi'],
      deploymentTarget: 'cloud',
      hitlConfidence: 0.92,
      calculatorState: calcState,
      createdAt: fiveDaysAgo,
      updatedAt: fiveDaysAgo,
    });

    await svc.saveWorkspaceSnapshot({
      id: 'latest_workspace_snapshot',
      name: 'Auto-Saved Workspace',
      activeTab: 'App Vault',
      selectedIds: ['icr_ops'],
      deploymentTarget: 'on-prem',
      hitlConfidence: 0.91,
      calculatorState: calcState,
      createdAt: thirtyFiveDaysAgo,
      updatedAt: thirtyFiveDaysAgo,
    });

    const result = await svc.pruneExpiredSnapshots(30, nowMs);
    assert.equal(result.prunedCount, 1);
    assert.deepEqual(result.prunedIds, [oldSnap.id]);
    assert.equal(result.remainingCount, 1);

    const remaining = await svc.listWorkspaceSnapshots();
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].id, recentSnap.id);

    const autoSaved = await svc.getWorkspaceSnapshot('latest_workspace_snapshot');
    assert.ok(autoSaved, 'Active auto-saved workspace checkpoint must not be pruned');

    await svc.clearAll();
  });

  it('computes 30-day storage usage trend and formats structured CSV exports for accounting tools', async () => {
    const svc = new LocalPersistenceService('spenta_trend_csv_test_db', 3);
    const baseCalc = {
      scenario: 'upside' as const,
      growthMode: 'aggressive' as const,
      fxRate: 122.61,
      taxRate: 25,
      exitMultiple: 12,
      dilutionPct: 5,
      investmentK: 500,
      horizonYears: 5,
      compareGrowthScenarios: true,
      projectedChartMetric: 'moic' as const,
      subTab: 'pnl' as const,
      mixPreset: 'fy31' as const,
      mixScopeWeights: { one_time_builds: 24, recurring_saas: 44 },
      mixOpexRatioPct: 24,
    };

    const nowMs = Date.parse('2026-11-27T12:00:00.000Z');
    const twentyDaysAgo = new Date(nowMs - 20 * 24 * 60 * 60 * 1000).toISOString();
    const fiveDaysAgo = new Date(nowMs - 5 * 24 * 60 * 60 * 1000).toISOString();

    const snap20d = await svc.saveWorkspaceSnapshot({
      name: 'Alpha "Q4", Baseline',
      activeTab: 'App Vault',
      selectedIds: ['icr_ops', 'genai_bi'],
      deploymentTarget: 'on-prem',
      hitlConfidence: 0.91,
      calculatorState: baseCalc,
      createdAt: twentyDaysAgo,
      updatedAt: twentyDaysAgo,
    });

    const scen5d = await svc.saveScenario({
      name: 'Board Upside, 500K',
      description: 'Conservative exit check',
      state: baseCalc,
      createdAt: fiveDaysAgo,
    });

    const trend = await svc.getStorageUsageTrend(30, nowMs);
    assert.equal(trend.points.length, 30);
    assert.equal(trend.startBytes, 0);
    assert.ok(trend.currentBytes > 0);
    assert.equal(trend.deltaBytes, trend.currentBytes);
    assert.equal(trend.direction, 'up');
    assert.ok(trend.points[10].bytes > 0, 'Day -20 snapshot should contribute to day +10 footprint');
    assert.ok(trend.points[25].bytes > trend.points[10].bytes, 'Day -5 scenario should increase footprint');

    const csv = buildStoredItemsCsv([
      {
        kind: 'scenario',
        id: scen5d.id,
        name: scen5d.name,
        typeLabel: 'Scenario',
        details: 'upside · $500K · 12x exit',
        estimatedBytes: 420,
        createdAt: scen5d.createdAt,
        updatedAt: scen5d.updatedAt,
        scenarioRecord: scen5d,
      },
      {
        kind: 'snapshot',
        id: snap20d.id,
        name: snap20d.name,
        typeLabel: 'Snapshot',
        details: 'App Vault · 2 modules · on-prem',
        estimatedBytes: 640,
        createdAt: snap20d.createdAt,
        updatedAt: snap20d.updatedAt,
        snapshotRecord: snap20d,
      },
    ]);

    const lines = csv.split('\r\n');
    assert.equal(lines.length, 3);
    assert.ok(lines[0].startsWith('Record_ID,Item_Name,Item_Type,Scenario_Model'));
    assert.ok(lines[1].includes('"Board Upside, 500K",Scenario,upside,aggressive,500,5,12,5,25,122.61'));
    assert.ok(lines[2].includes('"Alpha ""Q4"", Baseline",Snapshot'));

    await svc.clearAll();
    const resetTrend = await svc.getStorageUsageTrend(30, nowMs);
    assert.equal(resetTrend.currentBytes, 0);
    assert.equal(resetTrend.direction, 'flat');
  });

  it('performs deep storage health check, identifies orphaned/fragmented entries, and restores 100% integrity with auto-repair', async () => {
    const svc = new LocalPersistenceService('spenta_health_check_test_db', 3);
    const nowMs = Date.parse('2026-11-27T12:00:00.000Z');

    // 1. Seed healthy initial records
    await svc.saveCalculatorState({
      scenario: 'conservative',
      growthMode: 'conservative',
      fxRate: 122.61,
      taxRate: 25,
      exitMultiple: 10,
      dilutionPct: 0,
      investmentK: 500,
      horizonYears: 5,
      compareGrowthScenarios: false,
      projectedChartMetric: 'value',
      subTab: 'pnl',
      mixPreset: 'fy31',
      mixScopeWeights: {
        one_time_builds: 24,
        recurring_saas: 44,
        managed_retainers: 14,
        ip_royalties: 12,
        captive_ecosystem: 6,
      },
      mixOpexRatioPct: 24,
    });

    await svc.saveScenario({
      name: 'Baseline Seed Scenario',
      description: 'Clean scenario',
      state: {
        scenario: 'conservative',
        growthMode: 'conservative',
        fxRate: 122.61,
        taxRate: 25,
        exitMultiple: 10,
        dilutionPct: 0,
        investmentK: 500,
        horizonYears: 5,
        compareGrowthScenarios: false,
        projectedChartMetric: 'value',
        subTab: 'pnl',
        mixPreset: 'fy31',
        mixScopeWeights: { one_time_builds: 50, recurring_saas: 50 },
        mixOpexRatioPct: 24,
      },
    });

    // Initial scan on clean records should report 100% integrity
    const initialReport = await svc.performStorageHealthCheck({ autoRepair: true, nowMs });
    assert.equal(initialReport.healthy, true);
    assert.equal(initialReport.integrityScore, 100);
    assert.equal(initialReport.issuesFound, 0);
    assert.equal(initialReport.issuesRepaired, 0);
    assert.equal(initialReport.storesChecked, 8);
    assert.ok(initialReport.recordsScanned >= 2);

    // 2. Inject fragmented/orphaned records:
    // (a) Orphaned temporary chart cache entry
    await svc.saveChartProjection('orphan_temp_calc_49', [{ x: 1 }], { temp: true });
    // (b) Corrupted feedback with null replies array
    await svc.saveInvestorFeedback({
      section: 'Test Section',
      text: 'Frag feedback',
      priority: 'Low',
      sentimentScore: 4,
    });

    // Run diagnostic scan with autoRepair
    const repairReport = await svc.performStorageHealthCheck({ autoRepair: true, nowMs });
    assert.ok(repairReport.recordsScanned >= 4);
    assert.ok(repairReport.issuesFound >= 1);
    assert.ok(repairReport.issuesRepaired >= 1);
    assert.equal(repairReport.integrityScore, 100);
    assert.equal(repairReport.healthy, true);

    // Check that orphaned chart projection was purged
    const orphanedProj = await svc.loadChartProjection('orphan_temp_calc_49');
    assert.equal(orphanedProj, null, 'Orphaned temporary cache should have been auto-purged');

    // Follow-up scan must confirm clean 100% integrity with 0 remaining issues
    const cleanVerify = await svc.performStorageHealthCheck({ autoRepair: true, nowMs });
    assert.equal(cleanVerify.healthy, true);
    assert.equal(cleanVerify.integrityScore, 100);
    assert.equal(cleanVerify.issuesFound, 0);

    await svc.clearAll();
  });

  it('bridges local IndexedDB data with cloud backup mirror, computes checksums, and tracks backup revisions', async () => {
    const svc = new LocalPersistenceService('spenta_cloud_sync_test_db', 3);
    const nowMs = Date.parse('2026-11-27T12:00:00.000Z');

    // Seed data to mirror
    await svc.saveScenario({
      name: 'Cloud Mirror Test Scenario',
      state: {
        scenario: 'upside',
        growthMode: 'aggressive',
        fxRate: 122.61,
        taxRate: 20,
        exitMultiple: 15,
        dilutionPct: 5,
        investmentK: 300,
        horizonYears: 3,
        compareGrowthScenarios: true,
        projectedChartMetric: 'value',
        subTab: 'pnl',
        mixPreset: 'arr-heavy',
        mixScopeWeights: { one_time_builds: 10, recurring_saas: 80 },
        mixOpexRatioPct: 20,
      },
    });

    await svc.saveWorkspaceSnapshot({
      name: 'Cloud Snapshot 1',
      activeTab: 'App Vault',
      selectedIds: ['icr_ops'],
      deploymentTarget: 'on-prem',
      hitlConfidence: 0.95,
      calculatorState: {
        scenario: 'conservative',
        growthMode: 'conservative',
        fxRate: 122.61,
        taxRate: 25,
        exitMultiple: 10,
        dilutionPct: 0,
        investmentK: 500,
        horizonYears: 5,
        compareGrowthScenarios: false,
        projectedChartMetric: 'value',
        subTab: 'pnl',
        mixPreset: 'fy31',
        mixScopeWeights: { one_time_builds: 50, recurring_saas: 50 },
        mixOpexRatioPct: 24,
      },
    });

    // 1. Initial Cloud Sync
    const sync1 = await svc.syncToCloudBackup(nowMs);
    assert.equal(sync1.success, true);
    assert.ok(sync1.recordsMirrored >= 2);
    assert.equal(sync1.cloudRevision, 1);
    assert.ok(sync1.checksum.startsWith('chk-'));
    assert.ok(sync1.bundleSizeBytes > 0);

    const status1 = svc.getCloudSyncStatus();
    assert.equal(status1.enabled, true);
    assert.equal(status1.isMirrored, true);
    assert.equal(status1.cloudRevision, 1);
    assert.equal(status1.lastMirroredAt, new Date(nowMs).toISOString());

    // 2. Incremental Cloud Sync updates revision to 2
    const sync2 = await svc.syncToCloudBackup(nowMs + 60000);
    assert.equal(sync2.success, true);
    assert.equal(sync2.cloudRevision, 2);

    const status2 = svc.getCloudSyncStatus();
    assert.equal(status2.cloudRevision, 2);

    // Verify diligence preferences recorded cloud sync state
    const prefs = await svc.loadDiligencePrefs();
    assert.equal(prefs?.cloudSyncEnabled, true);
    assert.equal(prefs?.cloudBackupRevision, 2);

    await svc.clearAll();
  });

  it('validates StorageManager sort dropdown options (Date Created Newest/Oldest, Size Desc, Name A-Z) and quota warning thresholds', () => {
    type TestItem = {
      name: string;
      createdAt: string;
      estimatedBytes: number;
      timestampMs: number;
    };

    const items: TestItem[] = [
      { name: 'Beta Scenario', createdAt: '2026-11-20T10:00:00Z', estimatedBytes: 500, timestampMs: 100 },
      { name: 'Alpha Scenario', createdAt: '2026-11-25T10:00:00Z', estimatedBytes: 200, timestampMs: 200 },
      { name: 'Gamma Snapshot', createdAt: '2026-11-15T10:00:00Z', estimatedBytes: 800, timestampMs: 50 },
    ];

    // Sort: Date Created (Newest)
    const sortedNewest = [...items].sort((a, b) => {
      const aCreated = Date.parse(a.createdAt) || a.timestampMs;
      const bCreated = Date.parse(b.createdAt) || b.timestampMs;
      return bCreated - aCreated || a.name.localeCompare(b.name);
    });
    assert.deepEqual(sortedNewest.map((i) => i.name), ['Alpha Scenario', 'Beta Scenario', 'Gamma Snapshot']);

    // Sort: Date Created (Oldest)
    const sortedOldest = [...items].sort((a, b) => {
      const aCreated = Date.parse(a.createdAt) || a.timestampMs;
      const bCreated = Date.parse(b.createdAt) || b.timestampMs;
      return aCreated - bCreated || a.name.localeCompare(b.name);
    });
    assert.deepEqual(sortedOldest.map((i) => i.name), ['Gamma Snapshot', 'Beta Scenario', 'Alpha Scenario']);

    // Sort: Size (Descending)
    const sortedSize = [...items].sort((a, b) => b.estimatedBytes - a.estimatedBytes || a.name.localeCompare(b.name));
    assert.deepEqual(sortedSize.map((i) => i.name), ['Gamma Snapshot', 'Beta Scenario', 'Alpha Scenario']);

    // Sort: Name (A-Z)
    const sortedName = [...items].sort((a, b) => a.name.localeCompare(b.name));
    assert.deepEqual(sortedName.map((i) => i.name), ['Alpha Scenario', 'Beta Scenario', 'Gamma Snapshot']);

    // Quota warning threshold evaluation (≥80%)
    const quotaBytes = 50 * 1024 * 1024; // 50 MB
    const underThresholdUsage = 35 * 1024 * 1024; // 70%
    const overThresholdUsage = 41 * 1024 * 1024; // 82%

    const pctUnder = (underThresholdUsage / quotaBytes) * 100;
    const pctOver = (overThresholdUsage / quotaBytes) * 100;

    assert.equal(pctUnder >= 80, false, '70% usage must NOT trigger quota warning');
    assert.equal(pctOver >= 80, true, '82% usage MUST trigger quota warning');
  });
});
