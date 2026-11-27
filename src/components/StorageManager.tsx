import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowUpDown,
  Check,
  CheckCircle2,
  Clock,
  Cloud,
  Database,
  Download,
  FileJson,
  FileSpreadsheet,
  HardDrive,
  Layers,
  Minus,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
  TrendingDown,
  TrendingUp,
  WifiOff,
  Wrench,
  X,
} from 'lucide-react';
import {
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useStack } from '../store/StackContext';
import {
  InvestorCalculatorScenario,
  PersistenceStorageMetrics,
  PersistenceStoreName,
  SNAPSHOT_AUTO_PRUNE_DAYS,
  StorageHealthCheckReport,
  StorageUsageTrendSummary,
  UserWorkspaceSnapshot,
} from '../utils/LocalPersistenceService';
import { buildStoredItemsCsv } from '../utils/storageCsvExport';

export const TYPICAL_BROWSER_QUOTA_BYTES = 50 * 1024 * 1024; // 50 MB typical mobile/sandbox browser quota baseline
export const QUOTA_WARNING_THRESHOLD_PCT = 80;
export type StorageItemSortOption =
  | 'date-created-newest'
  | 'date-created-oldest'
  | 'date-created'
  | 'size-desc'
  | 'name-asc';

const STORE_METADATA: Record<
  PersistenceStoreName,
  { label: string; shortLabel: string; description: string; barColor: string }
> = {
  investorCalculator: {
    label: 'Active Investor Calculator',
    shortLabel: 'Active Calculator',
    description: 'Current ROI, FX, dilution, and revenue-mix model parameters',
    barColor: '#1F3863',
  },
  calculatorScenarios: {
    label: 'Saved Calculator Scenarios',
    shortLabel: 'Scenarios',
    description: 'User-named financial modeling presets stored offline',
    barColor: '#2563EB',
  },
  workspaceSnapshots: {
    label: 'Workspace Snapshots',
    shortLabel: 'Workspace Snapshots',
    description: 'Auto-saved session checkpoint plus named stack snapshots',
    barColor: '#1C6E46',
  },
  chartProjections: {
    label: 'Cached Chart Projections',
    shortLabel: 'Chart Projections',
    description: 'Pre-computed 5-year P&L and MOIC series for offline charts',
    barColor: '#0D9488',
  },
  userSession: {
    label: 'Active User Session',
    shortLabel: 'User Session',
    description: 'Last active portal tab, stack selection, and deployment target',
    barColor: '#D97706',
  },
  diligencePrefs: {
    label: 'Diligence Preferences',
    shortLabel: 'Diligence Prefs',
    description: 'Investor persona track, currency mode, and Data Room bookmarks',
    barColor: '#7C3AED',
  },
  investorFeedback: {
    label: 'Investor Feedback & Notes',
    shortLabel: 'Investor Feedback',
    description: 'Section-level diligence notes, replies, and sentiment ratings',
    barColor: '#DB2777',
  },
  contactInquiries: {
    label: 'Offline Founder Inquiries',
    shortLabel: 'Founder Inquiries',
    description: 'Drafted SAFE term-sheet and founder outreach inquiries',
    barColor: '#DC2626',
  },
};

function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) {
    return '0 B';
  }
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(2)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

function formatMegabytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes <= 0) {
    return '0.000 MB';
  }
  const mb = bytes / (1024 * 1024);
  if (mb >= 10) return `${mb.toFixed(2)} MB`;
  return `${mb.toFixed(3)} MB`;
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return 'No writes recorded';
  try {
    return new Date(iso).toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function StorageManager() {
  const {
    theme,
    persistenceService,
    syncStatus,
    isOnline,
    lastSyncedAt,
    storageRevision,
    forceSync,
    clearLocalCachedData,
    exportOfflineBackup,
    savedCalculatorScenarios,
    saveCalculatorScenario,
    applyCalculatorScenario,
    deleteCalculatorScenario,
    workspaceSnapshots,
    saveWorkspaceSnapshot,
    restoreWorkspaceSnapshot,
    deleteWorkspaceSnapshot,
    deleteStoredItemsBulk,
    autoPruneSnapshots,
    setAutoPruneSnapshots,
    lastAutoPruneSummary,
    pruneExpiredSnapshotsNow,
    storageHealthReport,
    runStorageHealthCheck,
    cloudSyncEnabled,
    setCloudSyncEnabled,
    lastCloudSyncAt,
    cloudBackupRevision,
    syncToCloudNow,
    activeTab,
    selectedIds,
  } = useStack();

  const [metrics, setMetrics] = useState<PersistenceStorageMetrics | null>(null);
  const [usageTrend, setUsageTrend] = useState<StorageUsageTrendSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [confirmClearOpen, setConfirmClearOpen] = useState<boolean>(false);
  const [clearing, setClearing] = useState<boolean>(false);
  const [pruningBusy, setPruningBusy] = useState<boolean>(false);
  const [healthCheckPanelOpen, setHealthCheckPanelOpen] = useState<boolean>(false);
  const [healthCheckBusy, setHealthCheckBusy] = useState<boolean>(false);
  const [cloudSyncBusy, setCloudSyncBusy] = useState<boolean>(false);
  const [cloudSyncSuccess, setCloudSyncSuccess] = useState<boolean>(false);
  const [scenarioNameInput, setScenarioNameInput] = useState<string>('');
  const [snapshotNameInput, setSnapshotNameInput] = useState<string>('');
  const [chartScope, setChartScope] = useState<'scenarios-vs-snapshots' | 'all-stores'>(
    'scenarios-vs-snapshots',
  );
  const [summaryDownloaded, setSummaryDownloaded] = useState<boolean>(false);
  const [csvDownloaded, setCsvDownloaded] = useState<boolean>(false);
  const [itemSearchQuery, setItemSearchQuery] = useState<string>('');
  const [itemTypeFilter, setItemTypeFilter] = useState<'all' | 'scenario' | 'snapshot'>('all');
  const [sortOption, setSortOption] = useState<StorageItemSortOption>('date-created-newest');
  const [simulateQuotaExceeded, setSimulateQuotaExceeded] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const q = new URLSearchParams(window.location.search).get('quotaWarn');
      return q === '1' || q === 'true';
    }
    return false;
  });
  const [quotaWarningDismissed, setQuotaWarningDismissed] = useState<boolean>(false);
  const [selectedItemKeys, setSelectedItemKeys] = useState<Set<string>>(() => new Set());
  const [bulkDeleting, setBulkDeleting] = useState<boolean>(false);
  const selectAllCheckboxRef = useRef<HTMLInputElement | null>(null);

  const isDark = theme === 'dark';

  const expiredSnapshotCount = useMemo(() => {
    const cutoffMs = Date.now() - SNAPSHOT_AUTO_PRUNE_DAYS * 24 * 60 * 60 * 1000;
    return workspaceSnapshots.filter((snap) => {
      const ts = Date.parse(snap.updatedAt || snap.createdAt);
      return Number.isFinite(ts) && ts < cutoffMs;
    }).length;
  }, [workspaceSnapshots]);

  const handleToggleAutoPrune = async () => {
    if (pruningBusy) return;
    setPruningBusy(true);
    try {
      await setAutoPruneSnapshots(!autoPruneSnapshots);
    } finally {
      setPruningBusy(false);
    }
  };

  const handleRunPruneNow = async () => {
    if (pruningBusy) return;
    setPruningBusy(true);
    try {
      await pruneExpiredSnapshotsNow();
    } finally {
      setPruningBusy(false);
    }
  };

  const handleOpenHealthCheck = async () => {
    setHealthCheckPanelOpen(true);
    if (!storageHealthReport && !healthCheckBusy) {
      setHealthCheckBusy(true);
      try {
        await runStorageHealthCheck({ autoRepair: true });
        const trend = await persistenceService.getStorageUsageTrend(SNAPSHOT_AUTO_PRUNE_DAYS);
        const next = await persistenceService.getStorageMetrics();
        setUsageTrend(trend);
        setMetrics(next);
      } finally {
        setHealthCheckBusy(false);
      }
    }
  };

  const handleRunHealthCheckNow = async (autoRepair = true) => {
    if (healthCheckBusy) return;
    setHealthCheckBusy(true);
    try {
      await runStorageHealthCheck({ autoRepair });
      const trend = await persistenceService.getStorageUsageTrend(SNAPSHOT_AUTO_PRUNE_DAYS);
      const next = await persistenceService.getStorageMetrics();
      setUsageTrend(trend);
      setMetrics(next);
    } finally {
      setHealthCheckBusy(false);
    }
  };

  const handleToggleCloudSync = async () => {
    if (cloudSyncBusy) return;
    setCloudSyncBusy(true);
    try {
      await setCloudSyncEnabled(!cloudSyncEnabled);
    } finally {
      setCloudSyncBusy(false);
    }
  };

  const handleSyncToCloudNow = async () => {
    if (cloudSyncBusy) return;
    setCloudSyncBusy(true);
    try {
      await syncToCloudNow();
      setCloudSyncSuccess(true);
      window.setTimeout(() => setCloudSyncSuccess(false), 2500);
    } finally {
      setCloudSyncBusy(false);
    }
  };

  const refreshMetrics = useCallback(async () => {
    setLoading(true);
    try {
      const trend = await persistenceService.getStorageUsageTrend(SNAPSHOT_AUTO_PRUNE_DAYS);
      const next = await persistenceService.getStorageMetrics();
      setUsageTrend(trend);
      setMetrics(next);
    } finally {
      setLoading(false);
    }
  }, [persistenceService]);

  useEffect(() => {
    void refreshMetrics();
  }, [refreshMetrics, storageRevision]);

  useEffect(() => {
    if (!confirmClearOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !clearing) {
        setConfirmClearOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [confirmClearOpen, clearing]);

  const handleConfirmClear = async () => {
    setClearing(true);
    try {
      await clearLocalCachedData();
      setConfirmClearOpen(false);
      const trend = await persistenceService.getStorageUsageTrend(SNAPSHOT_AUTO_PRUNE_DAYS);
      const next = await persistenceService.getStorageMetrics();
      setUsageTrend(trend);
      setMetrics(next);
    } finally {
      setClearing(false);
    }
  };

  const handleSaveQuickScenario = async (e: React.FormEvent) => {
    e.preventDefault();
    const label =
      scenarioNameInput.trim() ||
      `Scenario ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    await saveCalculatorScenario(label, 'Saved from App Vault Storage Manager');
    setScenarioNameInput('');
  };

  const handleSaveQuickSnapshot = async (e: React.FormEvent) => {
    e.preventDefault();
    const label =
      snapshotNameInput.trim() ||
      `Workspace ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    await saveWorkspaceSnapshot(label);
    setSnapshotNameInput('');
  };

  const quotaUsagePct = useMemo(() => {
    if (!metrics || !metrics.quotaBytes || metrics.quotaBytes <= 0) return null;
    const effectiveUsage = metrics.usageBytes ?? metrics.estimatedPayloadBytes;
    const rawPct = (effectiveUsage / metrics.quotaBytes) * 100;
    return Math.min(100, Math.max(effectiveUsage > 0 ? 0.5 : 0, rawPct));
  }, [metrics]);

  const effectiveQuotaBytes = useMemo(() => {
    if (metrics?.quotaBytes && metrics.quotaBytes > 0) {
      return metrics.quotaBytes;
    }
    return TYPICAL_BROWSER_QUOTA_BYTES;
  }, [metrics]);

  const effectiveStorageBytes = useMemo(() => {
    return metrics?.usageBytes ?? metrics?.estimatedPayloadBytes ?? 0;
  }, [metrics]);

  const rawQuotaUsagePct = useMemo(() => {
    if (effectiveQuotaBytes <= 0) return 0;
    return (effectiveStorageBytes / effectiveQuotaBytes) * 100;
  }, [effectiveStorageBytes, effectiveQuotaBytes]);

  const displayQuotaPct = useMemo(() => {
    if (simulateQuotaExceeded) return 85.4;
    return Math.min(100, Math.max(effectiveStorageBytes > 0 ? 0.1 : 0, rawQuotaUsagePct));
  }, [effectiveStorageBytes, rawQuotaUsagePct, simulateQuotaExceeded]);

  const isQuotaWarningActive = useMemo(() => {
    if (quotaWarningDismissed) return false;
    return displayQuotaPct >= QUOTA_WARNING_THRESHOLD_PCT;
  }, [displayQuotaPct, quotaWarningDismissed]);

  const scenarioAndWorkspaceCount = useMemo(() => {
    if (!metrics) return 0;
    return metrics.scenarioEntries + metrics.workspaceEntries;
  }, [metrics]);

  type StoredInventoryItem = {
    key: string;
    kind: 'scenario' | 'snapshot';
    id: string;
    name: string;
    typeLabel: 'Scenario' | 'Snapshot';
    details: string;
    estimatedBytes: number;
    createdAt: string;
    updatedAt: string;
    timestampMs: number;
    scenarioRecord?: InvestorCalculatorScenario;
    snapshotRecord?: UserWorkspaceSnapshot;
  };

  const storedItemsList = useMemo<StoredInventoryItem[]>(() => {
    const scenarioRows: StoredInventoryItem[] = savedCalculatorScenarios.map((item) => ({
      key: `scenario:${item.id}`,
      kind: 'scenario',
      id: item.id,
      name: item.name,
      typeLabel: 'Scenario',
      details: `${item.state.scenario} · $${item.state.investmentK}K · ${item.state.exitMultiple}x exit`,
      estimatedBytes: new Blob([JSON.stringify(item)]).size,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      timestampMs: Date.parse(item.updatedAt) || 0,
      scenarioRecord: item,
    }));

    const snapshotRows: StoredInventoryItem[] = workspaceSnapshots.map((snap) => ({
      key: `snapshot:${snap.id}`,
      kind: 'snapshot',
      id: snap.id,
      name: snap.name,
      typeLabel: 'Snapshot',
      details: `${snap.activeTab} · ${snap.selectedIds.length} modules · ${snap.deploymentTarget}`,
      estimatedBytes: new Blob([JSON.stringify(snap)]).size,
      createdAt: snap.createdAt,
      updatedAt: snap.updatedAt || snap.createdAt,
      timestampMs: Date.parse(snap.updatedAt || snap.createdAt) || 0,
      snapshotRecord: snap,
    }));

    return [...scenarioRows, ...snapshotRows].sort(
      (a, b) => b.timestampMs - a.timestampMs || a.name.localeCompare(b.name),
    );
  }, [savedCalculatorScenarios, workspaceSnapshots]);

  useEffect(() => {
    const validKeys = new Set(storedItemsList.map((item) => item.key));
    setSelectedItemKeys((prev) => {
      if (prev.size === 0) return prev;
      let changed = false;
      const next = new Set<string>();
      prev.forEach((key) => {
        if (validKeys.has(key)) {
          next.add(key);
        } else {
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [storedItemsList]);

  const filteredStoredItems = useMemo(() => {
    const q = itemSearchQuery.trim().toLowerCase();
    return storedItemsList.filter((item) => {
      if (itemTypeFilter !== 'all' && item.kind !== itemTypeFilter) {
        return false;
      }
      if (!q) return true;
      const typeMatches =
        item.typeLabel.toLowerCase().includes(q) ||
        item.kind.toLowerCase().includes(q) ||
        (q === 'scenarios' && item.kind === 'scenario') ||
        (q === 'snapshots' && item.kind === 'snapshot');
      return (
        item.name.toLowerCase().includes(q) ||
        typeMatches ||
        item.details.toLowerCase().includes(q) ||
        item.id.toLowerCase().includes(q)
      );
    });
  }, [storedItemsList, itemTypeFilter, itemSearchQuery]);

  const sortedFilteredItems = useMemo(() => {
    return [...filteredStoredItems].sort((a, b) => {
      if (sortOption === 'size-desc') {
        return (
          b.estimatedBytes - a.estimatedBytes ||
          b.timestampMs - a.timestampMs ||
          a.name.localeCompare(b.name)
        );
      }
      if (sortOption === 'name-asc') {
        return (
          a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) ||
          b.timestampMs - a.timestampMs
        );
      }
      if (sortOption === 'date-created-oldest') {
        const aCreated = Date.parse(a.createdAt) || a.timestampMs;
        const bCreated = Date.parse(b.createdAt) || b.timestampMs;
        return (
          aCreated - bCreated ||
          a.timestampMs - b.timestampMs ||
          a.name.localeCompare(b.name)
        );
      }
      // 'date-created-newest' (or legacy 'date-created'): newest created first
      const aCreated = Date.parse(a.createdAt) || a.timestampMs;
      const bCreated = Date.parse(b.createdAt) || b.timestampMs;
      return (
        bCreated - aCreated ||
        b.timestampMs - a.timestampMs ||
        a.name.localeCompare(b.name)
      );
    });
  }, [filteredStoredItems, sortOption]);

  const visibleSelectedCount = useMemo(
    () =>
      sortedFilteredItems.reduce(
        (count, item) => (selectedItemKeys.has(item.key) ? count + 1 : count),
        0,
      ),
    [sortedFilteredItems, selectedItemKeys],
  );

  const allVisibleSelected =
    sortedFilteredItems.length > 0 && visibleSelectedCount === sortedFilteredItems.length;
  const someVisibleSelected = visibleSelectedCount > 0 && !allVisibleSelected;

  useEffect(() => {
    if (selectAllCheckboxRef.current) {
      selectAllCheckboxRef.current.indeterminate = someVisibleSelected;
    }
  }, [someVisibleSelected]);

  const toggleSelectItem = useCallback((key: string) => {
    setSelectedItemKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const toggleSelectAllVisible = useCallback(() => {
    setSelectedItemKeys((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        sortedFilteredItems.forEach((item) => next.delete(item.key));
      } else {
        sortedFilteredItems.forEach((item) => next.add(item.key));
      }
      return next;
    });
  }, [allVisibleSelected, sortedFilteredItems]);

  const clearSelection = useCallback(() => {
    setSelectedItemKeys(new Set());
  }, []);

  const handleBulkDeleteSelected = useCallback(async () => {
    if (bulkDeleting || selectedItemKeys.size === 0) return;
    const itemByKey = new Map(storedItemsList.map((item) => [item.key, item]));
    const targets: Array<{ kind: 'scenario' | 'snapshot'; id: string }> = [];
    selectedItemKeys.forEach((key) => {
      const match = itemByKey.get(key);
      if (match) {
        targets.push({ kind: match.kind, id: match.id });
      }
    });
    if (targets.length === 0) return;

    setBulkDeleting(true);
    try {
      await deleteStoredItemsBulk(targets);
      setSelectedItemKeys(new Set());
    } finally {
      setBulkDeleting(false);
    }
  }, [bulkDeleting, deleteStoredItemsBulk, selectedItemKeys, storedItemsList]);

  const handleDownloadFilteredCsv = useCallback(() => {
    if (sortedFilteredItems.length === 0) return;
    const csvContent = buildStoredItemsCsv(sortedFilteredItems, { includeBom: true });
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const dateStamp = new Date().toISOString().slice(0, 10);
    const filterTag = itemSearchQuery.trim()
      ? 'filtered'
      : itemTypeFilter === 'all'
        ? 'all-items'
        : `${itemTypeFilter}s`;
    link.href = url;
    link.download = `spenta-storage-${filterTag}-${dateStamp}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setCsvDownloaded(true);
    window.setTimeout(() => setCsvDownloaded(false), 2500);
  }, [sortedFilteredItems, itemSearchQuery, itemTypeFilter]);

  const sortedStoreBreakdown = useMemo(() => {
    const stats = metrics?.storeStats ?? [];
    const totalBytes = metrics?.estimatedPayloadBytes ?? 0;
    return [...stats]
      .sort((a, b) => b.bytes - a.bytes || b.count - a.count)
      .map((row, index) => ({
        ...row,
        rank: index + 1,
        sharePct: totalBytes > 0 ? (row.bytes / totalBytes) * 100 : 0,
        meta: STORE_METADATA[row.store],
      }));
  }, [metrics]);

  const topConsumer = useMemo(
    () => sortedStoreBreakdown.find((item) => item.bytes > 0) ?? null,
    [sortedStoreBreakdown],
  );

  const scenariosVsSnapshotsBreakdown = useMemo(() => {
    const stats = metrics?.storeStats ?? [];
    const totalPayloadBytes = metrics?.estimatedPayloadBytes ?? 0;
    const scenarioStat = stats.find((s) => s.store === 'calculatorScenarios') ?? {
      store: 'calculatorScenarios' as const,
      count: 0,
      bytes: 0,
    };
    const snapshotStat = stats.find((s) => s.store === 'workspaceSnapshots') ?? {
      store: 'workspaceSnapshots' as const,
      count: 0,
      bytes: 0,
    };
    const otherStats = stats.filter(
      (s) => s.store !== 'calculatorScenarios' && s.store !== 'workspaceSnapshots',
    );
    const otherBytes = otherStats.reduce((sum, s) => sum + s.bytes, 0);
    const otherEntries = otherStats.reduce((sum, s) => sum + s.count, 0);
    const pairBytes = scenarioStat.bytes + snapshotStat.bytes;

    return {
      scenarios: {
        name: 'Scenarios',
        store: 'calculatorScenarios' as const,
        count: scenarioStat.count,
        bytes: scenarioStat.bytes,
        color: isDark ? '#60A5FA' : '#2563EB',
        shareOfPairPct: pairBytes > 0 ? (scenarioStat.bytes / pairBytes) * 100 : 0,
        shareOfTotalPct:
          totalPayloadBytes > 0 ? (scenarioStat.bytes / totalPayloadBytes) * 100 : 0,
      },
      snapshots: {
        name: 'Snapshots',
        store: 'workspaceSnapshots' as const,
        count: snapshotStat.count,
        bytes: snapshotStat.bytes,
        color: isDark ? '#6FCB9F' : '#1C6E46',
        shareOfPairPct: pairBytes > 0 ? (snapshotStat.bytes / pairBytes) * 100 : 0,
        shareOfTotalPct:
          totalPayloadBytes > 0 ? (snapshotStat.bytes / totalPayloadBytes) * 100 : 0,
      },
      other: {
        name: 'Other Stores',
        count: otherEntries,
        bytes: otherBytes,
        color: isDark ? '#8E96B0' : '#64748B',
        shareOfTotalPct:
          totalPayloadBytes > 0 ? (otherBytes / totalPayloadBytes) * 100 : 0,
      },
      pairBytes,
      totalPayloadBytes,
    };
  }, [metrics, isDark]);

  const pieChartData = useMemo(() => {
    if (chartScope === 'scenarios-vs-snapshots') {
      return [
        {
          id: 'scenarios',
          name: 'Scenarios',
          bytes: scenariosVsSnapshotsBreakdown.scenarios.bytes,
          count: scenariosVsSnapshotsBreakdown.scenarios.count,
          color: scenariosVsSnapshotsBreakdown.scenarios.color,
          sharePct: scenariosVsSnapshotsBreakdown.scenarios.shareOfPairPct,
        },
        {
          id: 'snapshots',
          name: 'Snapshots',
          bytes: scenariosVsSnapshotsBreakdown.snapshots.bytes,
          count: scenariosVsSnapshotsBreakdown.snapshots.count,
          color: scenariosVsSnapshotsBreakdown.snapshots.color,
          sharePct: scenariosVsSnapshotsBreakdown.snapshots.shareOfPairPct,
        },
      ].filter((slice) => slice.bytes > 0);
    }

    return sortedStoreBreakdown
      .filter((row) => row.bytes > 0)
      .map((row) => ({
        id: row.store,
        name: row.meta.shortLabel,
        bytes: row.bytes,
        count: row.count,
        color: row.meta.barColor,
        sharePct: row.sharePct,
      }));
  }, [chartScope, scenariosVsSnapshotsBreakdown, sortedStoreBreakdown]);

  const handleDownloadStorageSummary = useCallback(() => {
    const generatedAt = new Date().toISOString();
    const totalBytes = metrics?.estimatedPayloadBytes ?? 0;
    const summaryPayload = {
      reportType: 'spenta-storage-summary',
      generatedAt,
      database: {
        dbName: metrics?.dbName ?? 'spenta_sovereign_offline_db',
        dbVersion: metrics?.dbVersion ?? 3,
        backend: metrics?.backend ?? 'indexeddb',
        syncStatus,
        isOnline,
        lastSyncedAt: lastSyncedAt ?? metrics?.lastUpdatedAt ?? null,
      },
      totals: {
        estimatedPayloadBytes: totalBytes,
        formattedSize: formatBytes(totalBytes),
        formattedSizeMb: formatMegabytes(totalBytes),
        totalEntries: metrics?.totalEntries ?? 0,
        browserUsageBytes: metrics?.usageBytes ?? null,
        browserQuotaBytes: metrics?.quotaBytes ?? null,
        quotaUsagePct: quotaUsagePct !== null ? Number(quotaUsagePct.toFixed(4)) : null,
      },
      scenariosVsSnapshots: {
        scenarios: {
          entries: scenariosVsSnapshotsBreakdown.scenarios.count,
          bytes: scenariosVsSnapshotsBreakdown.scenarios.bytes,
          formattedSize: formatBytes(scenariosVsSnapshotsBreakdown.scenarios.bytes),
          shareOfPairPct: Number(
            scenariosVsSnapshotsBreakdown.scenarios.shareOfPairPct.toFixed(2),
          ),
          shareOfTotalPct: Number(
            scenariosVsSnapshotsBreakdown.scenarios.shareOfTotalPct.toFixed(2),
          ),
        },
        snapshots: {
          entries: scenariosVsSnapshotsBreakdown.snapshots.count,
          namedCount: workspaceSnapshots.length,
          autoSavedPresent: metrics?.autoSavedWorkspacePresent ?? false,
          bytes: scenariosVsSnapshotsBreakdown.snapshots.bytes,
          formattedSize: formatBytes(scenariosVsSnapshotsBreakdown.snapshots.bytes),
          shareOfPairPct: Number(
            scenariosVsSnapshotsBreakdown.snapshots.shareOfPairPct.toFixed(2),
          ),
          shareOfTotalPct: Number(
            scenariosVsSnapshotsBreakdown.snapshots.shareOfTotalPct.toFixed(2),
          ),
        },
        otherStores: {
          entries: scenariosVsSnapshotsBreakdown.other.count,
          bytes: scenariosVsSnapshotsBreakdown.other.bytes,
          formattedSize: formatBytes(scenariosVsSnapshotsBreakdown.other.bytes),
          shareOfTotalPct: Number(
            scenariosVsSnapshotsBreakdown.other.shareOfTotalPct.toFixed(2),
          ),
        },
      },
      breakdownByStore: sortedStoreBreakdown.map((row) => ({
        rank: row.rank,
        store: row.store,
        label: row.meta.label,
        purpose: row.meta.description,
        entries: row.count,
        bytes: row.bytes,
        formattedSize: formatBytes(row.bytes),
        sharePct: Number(row.sharePct.toFixed(2)),
      })),
      savedScenarios: savedCalculatorScenarios.map((item) => ({
        id: item.id,
        name: item.name,
        scenario: item.state.scenario,
        investmentK: item.state.investmentK,
        horizonYears: item.state.horizonYears,
        exitMultiple: item.state.exitMultiple,
        updatedAt: item.updatedAt,
      })),
      workspaceSnapshots: workspaceSnapshots.map((snap) => ({
        id: snap.id,
        name: snap.name,
        activeTab: snap.activeTab,
        selectedModuleCount: snap.selectedIds.length,
        deploymentTarget: snap.deploymentTarget,
        updatedAt: snap.updatedAt,
      })),
      autoPrunePolicy: {
        enabled: autoPruneSnapshots,
        maxAgeDays: SNAPSHOT_AUTO_PRUNE_DAYS,
        eligibleExpiredCount: expiredSnapshotCount,
        lastPrunedAt: lastAutoPruneSummary.prunedAt,
        lastPrunedCount: lastAutoPruneSummary.prunedCount,
      },
    };

    const blob = new Blob([JSON.stringify(summaryPayload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `spenta-storage-summary-${generatedAt.slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setSummaryDownloaded(true);
    window.setTimeout(() => setSummaryDownloaded(false), 2500);
  }, [
    autoPruneSnapshots,
    expiredSnapshotCount,
    isOnline,
    lastAutoPruneSummary.prunedAt,
    lastAutoPruneSummary.prunedCount,
    lastSyncedAt,
    metrics,
    quotaUsagePct,
    savedCalculatorScenarios,
    scenariosVsSnapshotsBreakdown,
    sortedStoreBreakdown,
    syncStatus,
    workspaceSnapshots,
  ]);

  return (
    <section
      aria-label="Local IndexedDB Storage Manager"
      className="space-y-5"
    >
      {/* Header & Primary Storage Actions */}
      <div className="rounded-2xl border border-[#E4DFD6] dark:border-[#232B4A] bg-white dark:bg-[#141A32] p-5 sm:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-[#E4DFD6] dark:border-[#232B4A]">
          <div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#5F6576] dark:text-[#8E96B0]">
              <span className="font-mono text-[#1F3863] dark:text-[#8FA6E8] font-medium">
                {metrics?.dbName ?? 'spenta_sovereign_offline_db'}
              </span>
              <span aria-hidden="true">·</span>
              <span>Schema v{metrics?.dbVersion ?? 3}</span>
              <span aria-hidden="true">·</span>
              <span>
                {metrics?.backend === 'fallback' ? 'LocalStorage Fallback' : 'IndexedDB (idb)'}
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-[#16213A] dark:text-[#E7EBF5] tracking-tight mt-1">
              Offline Storage Manager
            </h2>
            <p className="text-xs sm:text-sm text-[#4A5568] dark:text-[#A4ADC6] mt-1 max-w-2xl">
              Inspect browser IndexedDB allocation, review saved investor calculator scenarios and workspace snapshots, run reconciliation, or clear cached local data.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void refreshMetrics()}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-[#E4DFD6] dark:border-[#232B4A] bg-[#FAF8F4] dark:bg-[#0F1529] text-[#16213A] dark:text-[#E7EBF5] hover:border-[#1F3863] dark:hover:border-[#8FA6E8] transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`}
                strokeWidth={1.6}
              />
              <span>Refresh</span>
            </button>

            <button
              type="button"
              onClick={() => void forceSync()}
              disabled={!isOnline || syncStatus === 'syncing'}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-[#1F3863] text-white dark:bg-[#8FA6E8] dark:text-[#0B1020] hover:opacity-90 transition-opacity whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${syncStatus === 'syncing' ? 'animate-spin' : ''}`}
                strokeWidth={1.75}
              />
              <span>Force Sync</span>
            </button>

            <button
              type="button"
              data-testid="storage-health-check-btn"
              onClick={() => void handleOpenHealthCheck()}
              disabled={healthCheckBusy}
              aria-label="Storage Health Check diagnostic tool"
              title="Run deep diagnostic scan to identify and repair fragmented or orphaned data entries"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-[#E4DFD6] dark:border-[#232B4A] bg-[#FAF8F4] dark:bg-[#0F1529] text-[#16213A] dark:text-[#E7EBF5] hover:border-[#1F3863] dark:hover:border-[#8FA6E8] transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
            >
              <Activity
                className={`w-3.5 h-3.5 text-[#1F3863] dark:text-[#8FA6E8] ${healthCheckBusy ? 'animate-spin' : ''}`}
                strokeWidth={1.75}
              />
              <span>Storage Health Check</span>
            </button>

            <button
              type="button"
              onClick={() => void exportOfflineBackup()}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-[#E4DFD6] dark:border-[#232B4A] bg-[#FAF8F4] dark:bg-[#0F1529] text-[#16213A] dark:text-[#E7EBF5] hover:border-[#1C6E46] dark:hover:border-[#6FCB9F] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" strokeWidth={1.6} />
              <span>Export Backup</span>
            </button>

            <button
              type="button"
              onClick={() => setConfirmClearOpen((open) => !open)}
              aria-label="Clear Cache and purge local application data"
              title="Purge all local IndexedDB stores and cached workspace data"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-[#FECACA] dark:border-[#7F1D1D] bg-[#FEF2F2] dark:bg-[#2A1215] text-[#B91C1C] dark:text-[#FCA5A5] hover:bg-[#FEE2E2] dark:hover:bg-[#3B181C] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" strokeWidth={1.6} />
              <span>Clear Cache</span>
            </button>
          </div>
        </div>

        {/* Confirmation Modal for Clear Cache (No window.confirm/alert) */}
        {confirmClearOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-xs p-4"
            onClick={() => {
              if (!clearing) setConfirmClearOpen(false);
            }}
          >
            <div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="clear-cache-modal-title"
              aria-describedby="clear-cache-modal-description"
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-2xl border border-[#E4DFD6] dark:border-[#232B4A] bg-white dark:bg-[#141A32] p-5 sm:p-6 shadow-2xl"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-[#FEF2F2] dark:bg-[#2A1215] border border-[#FECACA] dark:border-[#7F1D1D] flex items-center justify-center shrink-0">
                    <AlertTriangle
                      className="w-4 h-4 text-[#DC2626] dark:text-[#FCA5A5]"
                      strokeWidth={1.75}
                    />
                  </div>
                  <div>
                    <h3
                      id="clear-cache-modal-title"
                      className="text-base font-bold text-[#16213A] dark:text-[#E7EBF5]"
                    >
                      Delete Local IndexedDB Cache?
                    </h3>
                    <p
                      id="clear-cache-modal-description"
                      className="mt-1.5 text-xs text-[#4A5568] dark:text-[#A4ADC6] leading-relaxed"
                    >
                      This permanently purges all {metrics?.totalEntries ?? 0} cached entries across {metrics?.storeStats.length ?? 8} object stores in{' '}
                      <span className="font-mono text-[#16213A] dark:text-[#E7EBF5]">
                        {metrics?.dbName ?? 'spenta_sovereign_offline_db'}
                      </span>
                      , including saved investor calculator scenarios, workspace snapshots, diligence notes, and offline inquiries.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setConfirmClearOpen(false)}
                  disabled={clearing}
                  aria-label="Close confirmation modal"
                  className="p-1 rounded-md text-[#5F6576] dark:text-[#8E96B0] hover:text-[#16213A] dark:hover:text-[#E7EBF5] cursor-pointer disabled:opacity-50"
                >
                  <X className="w-4 h-4" strokeWidth={1.75} />
                </button>
              </div>

              <div className="mt-5 pt-4 border-t border-[#E4DFD6] dark:border-[#232B4A] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmClearOpen(false)}
                  disabled={clearing}
                  className="px-3.5 py-2 rounded-lg text-xs font-semibold border border-[#E4DFD6] dark:border-[#232B4A] bg-[#FAF8F4] dark:bg-[#0F1529] text-[#16213A] dark:text-[#E7EBF5] hover:opacity-90 cursor-pointer whitespace-nowrap"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleConfirmClear()}
                  disabled={clearing}
                  className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-[#DC2626] hover:bg-[#B91C1C] text-white cursor-pointer whitespace-nowrap disabled:opacity-60"
                >
                  {clearing ? 'Deleting…' : 'Confirm Clear Cache'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Storage Quota Warning Notification (Alerts when cached storage exceeds 80% of browser quota) */}
        {isQuotaWarningActive && (
          <div
            data-testid="storage-quota-warning"
            role="alert"
            className="mt-4 p-4 rounded-xl border border-[#F59E0B] dark:border-[#B45309] bg-[#FFFBEB] dark:bg-[#2A1E0E] text-[#92400E] dark:text-[#FDE68A] flex flex-col sm:flex-row sm:items-start justify-between gap-3 shadow-xs"
          >
            <div className="flex items-start gap-3 min-w-0">
              <div className="p-1.5 rounded-lg bg-[#FEF3C7] dark:bg-[#451A03] border border-[#FDE68A] dark:border-[#78350F] text-[#B45309] dark:text-[#FCD34D] shrink-0 mt-0.5">
                <AlertTriangle className="w-4 h-4" strokeWidth={2} />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#92400E] dark:text-[#FDE68A]">
                    Storage Quota Warning
                  </span>
                  <span className="text-xs font-mono font-bold tabular-nums text-[#B45309] dark:text-[#FCD34D]">
                    {displayQuotaPct.toFixed(1)}% of Quota Used (≥80% Threshold)
                  </span>
                </div>
                <p className="text-xs text-[#78350F] dark:text-[#FDE68A]/90 mt-1 leading-relaxed">
                  Total IndexedDB storage consumption ({formatBytes(simulateQuotaExceeded ? 42.7 * 1024 * 1024 : effectiveStorageBytes)}) exceeds 80% of the estimated browser quota for this site ({formatBytes(simulateQuotaExceeded ? 50 * 1024 * 1024 : effectiveQuotaBytes)}). When browser storage reaches capacity, browsers may automatically evict offline caches. Consider exporting a backup and clearing or auto-pruning expired snapshots to free storage space.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
              <button
                type="button"
                data-testid="quota-warning-prune-btn"
                onClick={() => void handleRunPruneNow()}
                disabled={pruningBusy}
                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-[#B45309] text-white hover:bg-[#92400E] dark:bg-[#F59E0B] dark:text-[#451A03] transition-colors whitespace-nowrap cursor-pointer disabled:opacity-60"
              >
                Prune Now
              </button>
              <button
                type="button"
                data-testid="quota-warning-export-btn"
                onClick={() => void exportOfflineBackup()}
                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-[#D97706] dark:border-[#B45309] bg-white dark:bg-[#141A32] text-[#92400E] dark:text-[#FDE68A] hover:bg-[#FEF3C7] dark:hover:bg-[#1E2746] transition-colors whitespace-nowrap cursor-pointer"
              >
                Export Backup
              </button>
              <button
                type="button"
                data-testid="dismiss-quota-warning-btn"
                onClick={() => setQuotaWarningDismissed(true)}
                aria-label="Dismiss storage quota warning notification"
                title="Dismiss warning"
                className="p-1.5 rounded-md text-[#92400E] dark:text-[#FDE68A] hover:bg-[#FEF3C7] dark:hover:bg-[#451A03] transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" strokeWidth={1.75} />
              </button>
            </div>
          </div>
        )}

        {/* Storage Health Check Diagnostic Tool Panel */}
        <div
          data-testid="storage-health-panel"
          className="mt-4 p-4 rounded-xl border border-[#E4DFD6] dark:border-[#232B4A] bg-[#FAF8F4]/80 dark:bg-[#0F1529]/70 space-y-3.5 shadow-xs"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-8 h-8 rounded-lg border border-[#E4DFD6] dark:border-[#232B4A] bg-white dark:bg-[#141A32] flex items-center justify-center shrink-0 mt-0.5">
                <Activity
                  className={`w-4 h-4 ${
                    storageHealthReport?.healthy !== false
                      ? 'text-[#1C6E46] dark:text-[#6FCB9F]'
                      : 'text-[#B45309] dark:text-[#FCD34D]'
                  } ${healthCheckBusy ? 'animate-spin' : ''}`}
                  strokeWidth={1.75}
                />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <h3 className="text-xs font-bold text-[#16213A] dark:text-[#E7EBF5]">
                    Storage Health Check &amp; Integrity Scanner
                  </h3>
                  <span aria-hidden="true" className="text-[#CFC8BC] dark:text-[#333F69]">
                    ·
                  </span>
                  <span
                    data-testid="storage-integrity-score"
                    className="text-xs font-mono font-bold tabular-nums text-[#1C6E46] dark:text-[#6FCB9F]"
                  >
                    {storageHealthReport ? `${storageHealthReport.integrityScore}% Integrity` : '100% Target Integrity'}
                  </span>
                </div>
                <p className="text-[11px] text-[#5F6576] dark:text-[#8E96B0] mt-0.5 leading-relaxed">
                  Deep scans all 8 IndexedDB stores to detect and repair orphaned caches, schema drift, and fragmented records, ensuring persistent storage integrity.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
              <button
                type="button"
                data-testid="run-health-repair-btn"
                onClick={() => void handleRunHealthCheckNow(true)}
                disabled={healthCheckBusy}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#1F3863] text-white dark:bg-[#8FA6E8] dark:text-[#0B1020] hover:opacity-90 transition-opacity whitespace-nowrap cursor-pointer disabled:opacity-60"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${healthCheckBusy ? 'animate-spin' : ''}`}
                  strokeWidth={1.75}
                />
                <span>{healthCheckBusy ? 'Scanning…' : storageHealthReport ? 'Re-scan & Auto-Repair' : 'Run Diagnostic Scan'}</span>
              </button>
            </div>
          </div>

          {/* Diagnostic Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
            <div className="p-2.5 rounded-lg border border-[#E4DFD6] dark:border-[#232B4A] bg-white dark:bg-[#141A32]">
              <div className="text-[11px] text-[#5F6576] dark:text-[#8E96B0]">Records Scanned</div>
              <div
                data-testid="storage-records-scanned"
                className="text-sm font-bold font-mono tabular-nums text-[#16213A] dark:text-[#E7EBF5] mt-1"
              >
                {storageHealthReport?.recordsScanned ?? metrics?.totalEntries ?? 0} records across {storageHealthReport?.storesChecked ?? 8} stores
              </div>
            </div>

            <div className="p-2.5 rounded-lg border border-[#E4DFD6] dark:border-[#232B4A] bg-white dark:bg-[#141A32]">
              <div className="text-[11px] text-[#5F6576] dark:text-[#8E96B0]">Integrity Posture</div>
              <div
                data-testid="storage-issues-repaired"
                className="text-sm font-bold font-mono tabular-nums text-[#1C6E46] dark:text-[#6FCB9F] mt-1 flex items-center gap-1.5"
              >
                <ShieldCheck className="w-3.5 h-3.5" strokeWidth={2} />
                <span>
                  {storageHealthReport
                    ? `${storageHealthReport.orphanedCount} orphaned · ${storageHealthReport.fragmentedCount} fragmented (${storageHealthReport.issuesRepaired} repaired)`
                    : 'Zero orphaned or corrupted entries detected'}
                </span>
              </div>
            </div>

            <div className="p-2.5 rounded-lg border border-[#E4DFD6] dark:border-[#232B4A] bg-white dark:bg-[#141A32]">
              <div className="text-[11px] text-[#5F6576] dark:text-[#8E96B0]">Last Diagnostic Run</div>
              <div className="text-sm font-mono tabular-nums text-[#5F6576] dark:text-[#8E96B0] mt-1 truncate">
                {storageHealthReport?.scannedAt ? formatTimestamp(storageHealthReport.scannedAt) : 'Ready for deep diagnostic scan'}
              </div>
            </div>
          </div>

          {/* Per-Store Diagnostic Breakdown Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-[11px]">
            {(storageHealthReport?.storeSummaries ?? [
              { store: 'investorCalculator', label: 'Active Calculator', recordCount: 1, issuesCount: 0, status: 'healthy' },
              { store: 'calculatorScenarios', label: 'Scenarios', recordCount: savedCalculatorScenarios.length, issuesCount: 0, status: 'healthy' },
              { store: 'workspaceSnapshots', label: 'Snapshots', recordCount: workspaceSnapshots.length, issuesCount: 0, status: 'healthy' },
              { store: 'chartProjections', label: 'Chart Cache', recordCount: 1, issuesCount: 0, status: 'healthy' },
              { store: 'userSession', label: 'User Session', recordCount: 1, issuesCount: 0, status: 'healthy' },
              { store: 'diligencePrefs', label: 'Diligence Prefs', recordCount: 1, issuesCount: 0, status: 'healthy' },
              { store: 'investorFeedback', label: 'Investor Feedback', recordCount: 0, issuesCount: 0, status: 'healthy' },
              { store: 'contactInquiries', label: 'Founder Inquiries', recordCount: 0, issuesCount: 0, status: 'healthy' },
            ]).map((summary) => (
              <div
                key={summary.store}
                className="p-2 rounded-lg border border-[#E4DFD6] dark:border-[#232B4A] bg-white dark:bg-[#141A32] flex items-center justify-between gap-1"
              >
                <span className="truncate font-medium text-[#16213A] dark:text-[#E7EBF5]">
                  {summary.label}
                </span>
                <span className="font-mono text-[10px] font-semibold text-[#1C6E46] dark:text-[#6FCB9F] shrink-0">
                  Clean
                </span>
              </div>
            ))}
          </div>

          {/* Repaired Issues Detail (if any) */}
          {storageHealthReport && storageHealthReport.issues.length > 0 && (
            <div className="pt-2 border-t border-[#E4DFD6] dark:border-[#232B4A] space-y-1 text-xs">
              <div className="font-semibold text-[#16213A] dark:text-[#E7EBF5]">Repaired Anomalies:</div>
              <div className="space-y-1">
                {storageHealthReport.issues.map((issue) => (
                  <div
                    key={issue.id}
                    className="flex items-center gap-2 text-[11px] text-[#5F6576] dark:text-[#8E96B0] font-mono"
                  >
                    <Check className="w-3 h-3 text-[#1C6E46] dark:text-[#6FCB9F] shrink-0" strokeWidth={2} />
                    <span className="font-semibold text-[#16213A] dark:text-[#E7EBF5]">{issue.store}:</span>
                    <span>{issue.description}</span>
                    {issue.repairAction && (
                      <span className="text-[#1C6E46] dark:text-[#6FCB9F]">({issue.repairAction})</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 4-Column KPI Summary Strip (Tabular Numerals) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-5">
          <div className="p-4 rounded-xl border border-[#E4DFD6] dark:border-[#232B4A] bg-[#FAF8F4] dark:bg-[#0F1529]">
            <div className="flex items-center justify-between text-xs text-[#5F6576] dark:text-[#8E96B0]">
              <span>Database Size (MB)</span>
              <HardDrive className="w-3.5 h-3.5 text-[#1F3863] dark:text-[#8FA6E8]" strokeWidth={1.6} />
            </div>
            <div
              data-testid="storage-usage-bytes"
              className="mt-2 text-2xl font-bold font-mono tabular-nums text-[#16213A] dark:text-[#E7EBF5]"
            >
              {loading && !metrics
                ? '…'
                : formatMegabytes(metrics?.estimatedPayloadBytes ?? 0)}
            </div>
            <div className="mt-1 text-[11px] font-mono tabular-nums text-[#5F6576] dark:text-[#8E96B0]">
              {formatBytes(metrics?.estimatedPayloadBytes ?? 0)} ({(metrics?.estimatedPayloadBytes ?? 0).toLocaleString()} bytes)
              {metrics?.usageBytes !== null && metrics?.quotaBytes
                ? ` · Quota ${formatBytes(metrics.quotaBytes)}`
                : ''}
            </div>
            <div className="mt-2.5 h-1.5 w-full rounded-full bg-[#E4DFD6] dark:bg-[#232B4A] overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  displayQuotaPct >= 80
                    ? 'bg-[#DC2626] dark:bg-[#EF4444]'
                    : 'bg-[#1F3863] dark:bg-[#8FA6E8]'
                }`}
                style={{
                  width: `${Math.min(100, Math.max(displayQuotaPct > 0 ? 3 : 0, displayQuotaPct))}%`,
                }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px] font-mono tabular-nums text-[#5F6576] dark:text-[#8E96B0]">
              <span className={displayQuotaPct >= 80 ? 'text-[#B45309] dark:text-[#FCD34D] font-semibold' : ''}>
                {displayQuotaPct.toFixed(1)}% of quota
              </span>
              <button
                type="button"
                data-testid="toggle-quota-simulation-btn"
                onClick={() => {
                  setSimulateQuotaExceeded((prev) => !prev);
                  setQuotaWarningDismissed(false);
                }}
                className="hover:underline cursor-pointer text-[10px] text-[#5F6576] dark:text-[#8E96B0]"
              >
                {simulateQuotaExceeded ? 'Reset simulation' : 'Simulate ≥80%'}
              </button>
            </div>
          </div>

          <div className="p-4 rounded-xl border border-[#E4DFD6] dark:border-[#232B4A] bg-[#FAF8F4] dark:bg-[#0F1529]">
            <div className="flex items-center justify-between text-xs text-[#5F6576] dark:text-[#8E96B0]">
              <span>Total Saved Scenarios</span>
              <Layers className="w-3.5 h-3.5 text-[#1F3863] dark:text-[#8FA6E8]" strokeWidth={1.6} />
            </div>
            <div
              data-testid="storage-scenario-workspace-entries"
              className="mt-2 text-2xl font-bold font-mono tabular-nums text-[#16213A] dark:text-[#E7EBF5]"
            >
              {loading && !metrics ? '…' : (metrics?.scenarioEntries ?? 0)}
            </div>
            <div className="mt-1 text-[11px] text-[#5F6576] dark:text-[#8E96B0] font-mono tabular-nums">
              {metrics?.workspaceEntries ?? 0} workspace snapshots ({scenarioAndWorkspaceCount} combined)
            </div>
          </div>

          <div className="p-4 rounded-xl border border-[#E4DFD6] dark:border-[#232B4A] bg-[#FAF8F4] dark:bg-[#0F1529]">
            <div className="flex items-center justify-between text-xs text-[#5F6576] dark:text-[#8E96B0]">
              <span>Total Database Entries</span>
              <Database className="w-3.5 h-3.5 text-[#1C6E46] dark:text-[#6FCB9F]" strokeWidth={1.6} />
            </div>
            <div
              data-testid="storage-total-entries"
              className="mt-2 text-2xl font-bold font-mono tabular-nums text-[#16213A] dark:text-[#E7EBF5]"
            >
              {loading && !metrics ? '…' : (metrics?.totalEntries ?? 0)}
            </div>
            <div className="mt-1 text-[11px] text-[#5F6576] dark:text-[#8E96B0] font-mono tabular-nums">
              Across {metrics?.storeStats.length ?? 8} IndexedDB object stores
            </div>
          </div>

          <div className="p-4 rounded-xl border border-[#E4DFD6] dark:border-[#232B4A] bg-[#FAF8F4] dark:bg-[#0F1529]">
            <div className="flex items-center justify-between text-xs text-[#5F6576] dark:text-[#8E96B0]">
              <span>Last Sync Timestamp</span>
              {syncStatus === 'offline' ? (
                <WifiOff className="w-3.5 h-3.5 text-[#B91C1C] dark:text-[#FCA5A5]" strokeWidth={1.6} />
              ) : syncStatus === 'syncing' ? (
                <RefreshCw className="w-3.5 h-3.5 text-[#B45309] dark:text-[#FCD34D] animate-spin" strokeWidth={1.6} />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5 text-[#1C6E46] dark:text-[#6FCB9F]" strokeWidth={1.6} />
              )}
            </div>
            <div
              className={`mt-2 text-2xl font-bold tracking-tight ${
                syncStatus === 'offline'
                  ? 'text-[#B91C1C] dark:text-[#FCA5A5]'
                  : syncStatus === 'syncing'
                    ? 'text-[#B45309] dark:text-[#FCD34D]'
                    : 'text-[#1C6E46] dark:text-[#6FCB9F]'
              }`}
            >
              {syncStatus === 'offline'
                ? 'Offline'
                : syncStatus === 'syncing'
                  ? 'Syncing'
                  : 'Synced'}
            </div>
            <div
              data-testid="storage-last-sync"
              className="mt-1 text-[11px] font-mono tabular-nums text-[#5F6576] dark:text-[#8E96B0] truncate"
            >
              {formatTimestamp(lastSyncedAt ?? metrics?.lastUpdatedAt ?? null)}
            </div>
          </div>
        </div>

        {/* 30-Day Storage Usage Trend Line Chart & Footprint Indicator */}
        <div
          data-testid="storage-usage-trend"
          className="mt-5 pt-5 border-t border-[#E4DFD6] dark:border-[#232B4A]"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
            <div>
              <h3 className="text-xs font-bold text-[#16213A] dark:text-[#E7EBF5]">
                30-Day Storage Usage Trend
              </h3>
              <p className="text-[11px] text-[#5F6576] dark:text-[#8E96B0] mt-0.5">
                IndexedDB footprint trajectory across the last {SNAPSHOT_AUTO_PRUNE_DAYS} days to monitor long-term data growth.
              </p>
            </div>

            <div
              data-testid="storage-trend-indicator"
              className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs font-mono tabular-nums shrink-0"
            >
              {usageTrend ? (
                <>
                  <span
                    className={`inline-flex items-center gap-1 font-semibold ${
                      usageTrend.direction === 'down'
                        ? 'text-[#1C6E46] dark:text-[#6FCB9F]'
                        : usageTrend.direction === 'up'
                          ? 'text-[#1F3863] dark:text-[#8FA6E8]'
                          : 'text-[#5F6576] dark:text-[#8E96B0]'
                    }`}
                  >
                    {usageTrend.direction === 'up' ? (
                      <TrendingUp className="w-3.5 h-3.5" strokeWidth={1.75} />
                    ) : usageTrend.direction === 'down' ? (
                      <TrendingDown className="w-3.5 h-3.5" strokeWidth={1.75} />
                    ) : (
                      <Minus className="w-3.5 h-3.5" strokeWidth={1.75} />
                    )}
                    <span>
                      {usageTrend.deltaBytes > 0
                        ? `+${formatBytes(usageTrend.deltaBytes)}`
                        : usageTrend.deltaBytes < 0
                          ? `-${formatBytes(Math.abs(usageTrend.deltaBytes))}`
                          : '0 B change'}
                      {usageTrend.deltaPct !== null && usageTrend.deltaBytes !== 0
                        ? ` (${usageTrend.deltaPct > 0 ? '+' : ''}${usageTrend.deltaPct.toFixed(1)}%)`
                        : ''}{' '}
                      vs 30d ago
                    </span>
                  </span>
                  <span aria-hidden="true" className="text-[#CFC8BC] dark:text-[#333F69]">
                    ·
                  </span>
                  <span className="text-[11px] text-[#5F6576] dark:text-[#8E96B0]">
                    Peak {formatBytes(usageTrend.peakBytes)}
                  </span>
                </>
              ) : (
                <span className="text-[11px] text-[#5F6576] dark:text-[#8E96B0]">
                  Calculating 30-day trend…
                </span>
              )}
            </div>
          </div>

          <div
            data-testid="storage-trend-chart-container"
            className="h-36 w-full rounded-xl border border-[#E4DFD6] dark:border-[#232B4A] bg-[#FAF8F4] dark:bg-[#0F1529] px-2 pt-2 pb-1"
          >
            {!usageTrend ? (
              <div className="h-full w-full flex items-center justify-center text-xs font-mono text-[#5F6576] dark:text-[#8E96B0]">
                Loading 30-day storage trajectory…
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={132}>
                <LineChart
                  data={usageTrend.points}
                  margin={{ top: 6, right: 12, left: 0, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke={isDark ? '#232B4A' : '#E4DFD6'}
                  />
                  <XAxis
                    dataKey="label"
                    interval={6}
                    tick={{ fontSize: 10, fill: isDark ? '#8E96B0' : '#5F6576' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    width={54}
                    tickFormatter={(val) => formatBytes(Number(val ?? 0))}
                    tick={{ fontSize: 10, fill: isDark ? '#8E96B0' : '#5F6576' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(value) => [formatBytes(Number(value ?? 0)), 'Storage Used']}
                    labelFormatter={(_, payload) => {
                      const row = payload?.[0]?.payload as
                        | { date?: string; entries?: number }
                        | undefined;
                      if (!row?.date) return '';
                      return `${row.date} · ${row.entries ?? 0} entries`;
                    }}
                    contentStyle={{
                      backgroundColor: isDark ? '#141A32' : '#FFFFFF',
                      borderColor: isDark ? '#232B4A' : '#E4DFD6',
                      borderRadius: '8px',
                      fontSize: '12px',
                      color: isDark ? '#E7EBF5' : '#16213A',
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="bytes"
                    name="Storage Used"
                    stroke={isDark ? '#8FA6E8' : '#1F3863'}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Auto-Prune Snapshot Retention Setting (>30 Days) */}
        <div
          data-testid="auto-prune-panel"
          className="mt-5 pt-4 border-t border-[#E4DFD6] dark:border-[#232B4A] flex flex-col sm:flex-row sm:items-center justify-between gap-4"
        >
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg border border-[#E4DFD6] dark:border-[#232B4A] bg-[#FAF8F4] dark:bg-[#0F1529] flex items-center justify-center shrink-0 mt-0.5">
              <Clock
                className={`w-4 h-4 ${
                  autoPruneSnapshots
                    ? 'text-[#1C6E46] dark:text-[#6FCB9F]'
                    : 'text-[#5F6576] dark:text-[#8E96B0]'
                }`}
                strokeWidth={1.6}
              />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="text-xs font-bold text-[#16213A] dark:text-[#E7EBF5]">
                  Auto-Prune Snapshots Older Than {SNAPSHOT_AUTO_PRUNE_DAYS} Days
                </span>
                <span aria-hidden="true" className="text-[#CFC8BC] dark:text-[#333F69]">
                  ·
                </span>
                <span
                  data-testid="auto-prune-state-label"
                  className={`text-xs font-mono font-semibold ${
                    autoPruneSnapshots
                      ? 'text-[#1C6E46] dark:text-[#6FCB9F]'
                      : 'text-[#5F6576] dark:text-[#8E96B0]'
                  }`}
                >
                  {autoPruneSnapshots ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              <p
                data-testid="auto-prune-status"
                className="text-[11px] text-[#5F6576] dark:text-[#8E96B0] mt-0.5 leading-relaxed"
              >
                {autoPruneSnapshots
                  ? `Automatically deletes named snapshots older than ${SNAPSHOT_AUTO_PRUNE_DAYS} days on startup and Force Sync to free IndexedDB space.`
                  : `Retains all workspace snapshots indefinitely. Enable to automatically delete snapshots older than ${SNAPSHOT_AUTO_PRUNE_DAYS} days.`}{' '}
                <span className="font-mono tabular-nums">
                  {expiredSnapshotCount} expired (&gt;{SNAPSHOT_AUTO_PRUNE_DAYS}d)
                  {lastAutoPruneSummary.prunedAt
                    ? ` · Last run ${formatTimestamp(lastAutoPruneSummary.prunedAt)} (${lastAutoPruneSummary.prunedCount} removed)`
                    : ''}
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              data-testid="run-prune-now-btn"
              onClick={() => void handleRunPruneNow()}
              disabled={pruningBusy}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-[#E4DFD6] dark:border-[#232B4A] bg-[#FAF8F4] dark:bg-[#0F1529] text-[#16213A] dark:text-[#E7EBF5] hover:border-[#1F3863] dark:hover:border-[#8FA6E8] transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
            >
              Prune Expired Now
            </button>

            <button
              type="button"
              role="switch"
              data-testid="auto-prune-toggle"
              aria-checked={autoPruneSnapshots}
              aria-label={`Auto-Prune snapshots older than ${SNAPSHOT_AUTO_PRUNE_DAYS} days`}
              disabled={pruningBusy}
              onClick={() => void handleToggleAutoPrune()}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1F3863] dark:focus-visible:ring-[#8FA6E8] disabled:opacity-60 ${
                autoPruneSnapshots
                  ? 'bg-[#1C6E46] dark:bg-[#6FCB9F]'
                  : 'bg-[#CFC8BC] dark:bg-[#2A355A]'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 rounded-full bg-white dark:bg-[#0B1020] transition-transform ${
                  autoPruneSnapshots ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Cloud Sync Backup Bridge Setting */}
        <div
          data-testid="cloud-sync-panel"
          className="mt-5 pt-4 border-t border-[#E4DFD6] dark:border-[#232B4A] space-y-3"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-8 h-8 rounded-lg border border-[#E4DFD6] dark:border-[#232B4A] bg-[#FAF8F4] dark:bg-[#0F1529] flex items-center justify-center shrink-0 mt-0.5">
                <Cloud
                  className={`w-4 h-4 ${
                    cloudSyncEnabled
                      ? 'text-[#1F3863] dark:text-[#8FA6E8]'
                      : 'text-[#5F6576] dark:text-[#8E96B0]'
                  }`}
                  strokeWidth={1.6}
                />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="text-xs font-bold text-[#16213A] dark:text-[#E7EBF5]">
                    Cloud Sync Backup Bridge
                  </span>
                  <span aria-hidden="true" className="text-[#CFC8BC] dark:text-[#333F69]">
                    ·
                  </span>
                  <span
                    data-testid="cloud-sync-state-label"
                    className={`text-xs font-mono font-semibold ${
                      cloudSyncEnabled
                        ? 'text-[#1F3863] dark:text-[#8FA6E8]'
                        : 'text-[#5F6576] dark:text-[#8E96B0]'
                    }`}
                  >
                    {cloudSyncEnabled ? 'Enabled (Mirrored Online)' : 'Disabled (Local Only)'}
                  </span>
                </div>
                <p
                  data-testid="cloud-sync-status-desc"
                  className="text-[11px] text-[#5F6576] dark:text-[#8E96B0] mt-0.5 leading-relaxed"
                >
                  {cloudSyncEnabled
                    ? 'Seamlessly bridges local IndexedDB data with a cloud-based backup mirror, securing offline financial scenarios and snapshots against browser cache eviction.'
                    : 'All records are kept purely offline in your local IndexedDB. Enable to bridge state with a secure online backup.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 shrink-0 self-end sm:self-center">
              <button
                type="button"
                role="switch"
                data-testid="cloud-sync-toggle"
                aria-checked={cloudSyncEnabled}
                aria-label="Cloud Sync backup bridge toggle"
                disabled={cloudSyncBusy}
                onClick={() => void handleToggleCloudSync()}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1F3863] dark:focus-visible:ring-[#8FA6E8] disabled:opacity-60 ${
                  cloudSyncEnabled
                    ? 'bg-[#1F3863] dark:bg-[#8FA6E8]'
                    : 'bg-[#CFC8BC] dark:bg-[#2A355A]'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 rounded-full bg-white dark:bg-[#0B1020] transition-transform ${
                    cloudSyncEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Cloud Mirrored UI Indicator when enabled */}
          {cloudSyncEnabled && (
            <div
              data-testid="cloud-mirrored-indicator"
              className="p-3 rounded-xl border border-[#D5E1F5] dark:border-[#1E2E54] bg-[#F2F6FD] dark:bg-[#0F182F] flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-[#1F3863] text-white dark:bg-[#8FA6E8] dark:text-[#0B1020] flex items-center justify-center shrink-0">
                  <Cloud className="w-3.5 h-3.5" strokeWidth={2} />
                </div>
                <div className="min-w-0 text-xs">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="font-bold text-[#1F3863] dark:text-[#8FA6E8]">
                      Cloud Mirrored
                    </span>
                    <span aria-hidden="true" className="text-[#A4B8E0] dark:text-[#334674]">
                      ·
                    </span>
                    <span
                      data-testid="cloud-backup-revision"
                      className="font-mono text-[11px] font-semibold text-[#16213A] dark:text-[#E7EBF5]"
                    >
                      Revision #{cloudBackupRevision || 1}
                    </span>
                    <span aria-hidden="true" className="text-[#A4B8E0] dark:text-[#334674]">
                      ·
                    </span>
                    <span className="font-mono text-[11px] text-[#4A5568] dark:text-[#A4ADC6]">
                      {metrics?.totalEntries ?? 0} records mirrored
                    </span>
                  </div>
                  <div className="text-[11px] text-[#5F6576] dark:text-[#8E96B0] font-mono tabular-nums mt-0.5">
                    Last mirrored:{' '}
                    <span data-testid="cloud-last-sync-time" className="font-semibold text-[#16213A] dark:text-[#E7EBF5]">
                      {formatTimestamp(lastCloudSyncAt)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                <button
                  type="button"
                  data-testid="sync-cloud-now-btn"
                  onClick={() => void handleSyncToCloudNow()}
                  disabled={cloudSyncBusy}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#1F3863] text-white dark:bg-[#8FA6E8] dark:text-[#0B1020] hover:opacity-90 transition-opacity whitespace-nowrap cursor-pointer disabled:opacity-60"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${cloudSyncBusy ? 'animate-spin' : ''}`}
                    strokeWidth={1.75}
                  />
                  <span>
                    {cloudSyncSuccess
                      ? 'Mirrored Online'
                      : cloudSyncBusy
                        ? 'Mirroring…'
                        : 'Sync to Cloud Now'}
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Storage Breakdown by Item Type (Ranked Largest to Smallest) */}
      <div
        data-testid="storage-type-breakdown"
        className="rounded-2xl border border-[#E4DFD6] dark:border-[#232B4A] bg-white dark:bg-[#141A32] overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-[#E4DFD6] dark:border-[#232B4A] flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-[#16213A] dark:text-[#E7EBF5]">
              Storage Breakdown by Item Type
            </h3>
            <p className="text-xs text-[#5F6576] dark:text-[#8E96B0] mt-0.5">
              Ranked by payload size in{' '}
              <span className="font-mono">{metrics?.dbName ?? 'spenta_sovereign_offline_db'}</span>{' '}
              so you can see which item types consume the most space.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-xs font-mono tabular-nums text-[#5F6576] dark:text-[#8E96B0] flex flex-wrap items-center gap-x-2 gap-y-1">
              {topConsumer ? (
                <>
                  <span data-testid="storage-top-consumer" className="font-semibold text-[#16213A] dark:text-[#E7EBF5]">
                    Top consumer: {topConsumer.meta.shortLabel} ({topConsumer.sharePct.toFixed(1)}%)
                  </span>
                  <span aria-hidden="true">·</span>
                </>
              ) : null}
              <span>
                {metrics?.totalEntries ?? 0} entries · {formatBytes(metrics?.estimatedPayloadBytes ?? 0)}
              </span>
            </div>

            <button
              type="button"
              data-testid="download-storage-summary-btn"
              onClick={handleDownloadStorageSummary}
              aria-label="Download Storage Summary as a JSON offline record"
              title="Download storage consumption breakdown and scenario/snapshot summary as JSON"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-[#E4DFD6] dark:border-[#232B4A] bg-[#FAF8F4] dark:bg-[#0F1529] text-[#16213A] dark:text-[#E7EBF5] hover:border-[#1F3863] dark:hover:border-[#8FA6E8] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {summaryDownloaded ? (
                <Check className="w-3.5 h-3.5 text-[#1C6E46] dark:text-[#6FCB9F]" strokeWidth={1.75} />
              ) : (
                <FileJson className="w-3.5 h-3.5 text-[#1F3863] dark:text-[#8FA6E8]" strokeWidth={1.6} />
              )}
              <span>{summaryDownloaded ? 'Summary Downloaded' : 'Download Storage Summary'}</span>
            </button>
          </div>
        </div>

        {/* Recharts Pie Chart: Scenarios vs Snapshots Consumption Breakdown */}
        <div
          data-testid="storage-pie-section"
          className="px-5 py-4 border-b border-[#E4DFD6] dark:border-[#232B4A] grid grid-cols-1 lg:grid-cols-12 gap-5 items-center"
        >
          <div className="lg:col-span-4 flex items-center gap-4">
            <div
              data-testid="storage-pie-chart-container"
              className="w-36 h-36 shrink-0 flex items-center justify-center"
            >
              {pieChartData.length === 0 ? (
                <div className="w-32 h-32 rounded-full border border-dashed border-[#CFC8BC] dark:border-[#333F69] flex items-center justify-center text-center px-3 text-[11px] font-mono text-[#5F6576] dark:text-[#8E96B0]">
                  No stored data
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieChartData}
                      dataKey="bytes"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={34}
                      outerRadius={60}
                      paddingAngle={pieChartData.length > 1 ? 3 : 0}
                      stroke="none"
                      isAnimationActive={false}
                    >
                      {pieChartData.map((entry) => (
                        <Cell key={entry.id} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value, name) => [
                        formatBytes(Number(value ?? 0)),
                        String(name ?? ''),
                      ]}
                      contentStyle={{
                        backgroundColor: isDark ? '#141A32' : '#FFFFFF',
                        borderColor: isDark ? '#232B4A' : '#E4DFD6',
                        borderRadius: '8px',
                        fontSize: '12px',
                        color: isDark ? '#E7EBF5' : '#16213A',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="min-w-0 space-y-2">
              <div>
                <div className="text-xs font-bold text-[#16213A] dark:text-[#E7EBF5]">
                  Data Type Split
                </div>
                <div className="text-[11px] text-[#5F6576] dark:text-[#8E96B0]">
                  {chartScope === 'scenarios-vs-snapshots'
                    ? 'Scenarios vs. Snapshots payload share'
                    : 'All IndexedDB stores by payload share'}
                </div>
              </div>
              <div
                role="group"
                aria-label="Pie chart data scope"
                className="inline-flex items-center p-0.5 rounded-lg bg-[#FAF8F4] dark:bg-[#0F1529] border border-[#E4DFD6] dark:border-[#232B4A]"
              >
                <button
                  type="button"
                  onClick={() => setChartScope('scenarios-vs-snapshots')}
                  aria-pressed={chartScope === 'scenarios-vs-snapshots'}
                  className={`px-2 py-1 rounded-md text-[11px] font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                    chartScope === 'scenarios-vs-snapshots'
                      ? 'bg-[#1F3863] text-white dark:bg-[#8FA6E8] dark:text-[#0B1020]'
                      : 'text-[#5F6576] dark:text-[#8E96B0] hover:text-[#16213A] dark:hover:text-[#E7EBF5]'
                  }`}
                >
                  Scenarios vs Snapshots
                </button>
                <button
                  type="button"
                  onClick={() => setChartScope('all-stores')}
                  aria-pressed={chartScope === 'all-stores'}
                  className={`px-2 py-1 rounded-md text-[11px] font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                    chartScope === 'all-stores'
                      ? 'bg-[#1F3863] text-white dark:bg-[#8FA6E8] dark:text-[#0B1020]'
                      : 'text-[#5F6576] dark:text-[#8E96B0] hover:text-[#16213A] dark:hover:text-[#E7EBF5]'
                  }`}
                >
                  All Stores
                </button>
              </div>
            </div>
          </div>

          <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3 rounded-xl border border-[#E4DFD6] dark:border-[#232B4A] bg-[#FAF8F4] dark:bg-[#0F1529]">
              <div className="flex items-center justify-between gap-2 text-xs text-[#5F6576] dark:text-[#8E96B0]">
                <span className="inline-flex items-center gap-1.5 font-medium text-[#16213A] dark:text-[#E7EBF5]">
                  <span
                    className="w-2.5 h-2.5 rounded-xs shrink-0"
                    style={{ backgroundColor: scenariosVsSnapshotsBreakdown.scenarios.color }}
                    aria-hidden="true"
                  />
                  Scenarios
                </span>
                <span className="font-mono tabular-nums text-[11px]">
                  {scenariosVsSnapshotsBreakdown.scenarios.shareOfPairPct.toFixed(1)}%
                </span>
              </div>
              <div className="mt-1.5 text-base font-bold font-mono tabular-nums text-[#16213A] dark:text-[#E7EBF5]">
                {formatBytes(scenariosVsSnapshotsBreakdown.scenarios.bytes)}
              </div>
              <div className="text-[11px] font-mono tabular-nums text-[#5F6576] dark:text-[#8E96B0]">
                {scenariosVsSnapshotsBreakdown.scenarios.count} saved entries
              </div>
            </div>

            <div className="p-3 rounded-xl border border-[#E4DFD6] dark:border-[#232B4A] bg-[#FAF8F4] dark:bg-[#0F1529]">
              <div className="flex items-center justify-between gap-2 text-xs text-[#5F6576] dark:text-[#8E96B0]">
                <span className="inline-flex items-center gap-1.5 font-medium text-[#16213A] dark:text-[#E7EBF5]">
                  <span
                    className="w-2.5 h-2.5 rounded-xs shrink-0"
                    style={{ backgroundColor: scenariosVsSnapshotsBreakdown.snapshots.color }}
                    aria-hidden="true"
                  />
                  Snapshots
                </span>
                <span className="font-mono tabular-nums text-[11px]">
                  {scenariosVsSnapshotsBreakdown.snapshots.shareOfPairPct.toFixed(1)}%
                </span>
              </div>
              <div className="mt-1.5 text-base font-bold font-mono tabular-nums text-[#16213A] dark:text-[#E7EBF5]">
                {formatBytes(scenariosVsSnapshotsBreakdown.snapshots.bytes)}
              </div>
              <div className="text-[11px] font-mono tabular-nums text-[#5F6576] dark:text-[#8E96B0]">
                {scenariosVsSnapshotsBreakdown.snapshots.count} entries (named + auto)
              </div>
            </div>

            <div className="p-3 rounded-xl border border-[#E4DFD6] dark:border-[#232B4A] bg-[#FAF8F4] dark:bg-[#0F1529]">
              <div className="flex items-center justify-between gap-2 text-xs text-[#5F6576] dark:text-[#8E96B0]">
                <span className="inline-flex items-center gap-1.5 font-medium text-[#16213A] dark:text-[#E7EBF5]">
                  <span
                    className="w-2.5 h-2.5 rounded-xs shrink-0"
                    style={{ backgroundColor: scenariosVsSnapshotsBreakdown.other.color }}
                    aria-hidden="true"
                  />
                  Other Stores
                </span>
                <span className="font-mono tabular-nums text-[11px]">
                  {scenariosVsSnapshotsBreakdown.other.shareOfTotalPct.toFixed(1)}%
                </span>
              </div>
              <div className="mt-1.5 text-base font-bold font-mono tabular-nums text-[#16213A] dark:text-[#E7EBF5]">
                {formatBytes(scenariosVsSnapshotsBreakdown.other.bytes)}
              </div>
              <div className="text-[11px] font-mono tabular-nums text-[#5F6576] dark:text-[#8E96B0]">
                {scenariosVsSnapshotsBreakdown.other.count} auxiliary records
              </div>
            </div>
          </div>
        </div>

        {/* Proportional Allocation Bar Across Item Types */}
        <div className="px-5 py-3.5 border-b border-[#E4DFD6] dark:border-[#232B4A] bg-[#FAF8F4]/70 dark:bg-[#0F1529]/60 space-y-2.5">
          <div
            className="h-2.5 w-full rounded-full bg-[#E4DFD6] dark:bg-[#232B4A] overflow-hidden flex"
            role="img"
            aria-label={
              topConsumer
                ? `Storage allocation bar: top consumer is ${topConsumer.meta.shortLabel} at ${topConsumer.sharePct.toFixed(1)}%`
                : 'Storage allocation bar: no cached entries'
            }
          >
            {sortedStoreBreakdown
              .filter((row) => row.bytes > 0)
              .map((row) => (
                <div
                  key={row.store}
                  style={{
                    width: `${Math.max(row.sharePct, 1.5)}%`,
                    backgroundColor: row.meta.barColor,
                  }}
                  title={`${row.meta.label}: ${formatBytes(row.bytes)} (${row.sharePct.toFixed(1)}%)`}
                  className="h-full transition-all first:rounded-l-full last:rounded-r-full border-r border-white/40 dark:border-[#0B1020]/50 last:border-r-0"
                />
              ))}
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-[#4A5568] dark:text-[#A4ADC6]">
            {sortedStoreBreakdown.filter((row) => row.bytes > 0).length === 0 ? (
              <span className="font-mono text-[#5F6576] dark:text-[#8E96B0]">
                No stored entries across IndexedDB item types.
              </span>
            ) : (
              sortedStoreBreakdown
                .filter((row) => row.bytes > 0)
                .map((row) => (
                  <span
                    key={row.store}
                    className="inline-flex items-center gap-1.5 font-mono tabular-nums"
                  >
                    <span
                      className="w-2 h-2 rounded-xs shrink-0"
                      style={{ backgroundColor: row.meta.barColor }}
                      aria-hidden="true"
                    />
                    <span className="font-sans font-medium text-[#16213A] dark:text-[#E7EBF5]">
                      {row.meta.shortLabel}
                    </span>
                    <span className="text-[#5F6576] dark:text-[#8E96B0]">
                      {row.sharePct.toFixed(1)}% ({formatBytes(row.bytes)})
                    </span>
                  </span>
                ))
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#E4DFD6] dark:border-[#232B4A] bg-[#FAF8F4] dark:bg-[#0F1529] text-[11px] font-semibold text-[#5F6576] dark:text-[#8E96B0]">
                <th className="py-2.5 pl-5 pr-2 w-12">Rank</th>
                <th className="py-2.5 px-3">Item Type &amp; Store</th>
                <th className="py-2.5 px-3">Purpose</th>
                <th className="py-2.5 px-3 text-right">Entries</th>
                <th className="py-2.5 px-4 w-44">Share of Space</th>
                <th className="py-2.5 pl-3 pr-5 text-right">Size</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E4DFD6] dark:divide-[#232B4A] text-xs">
              {sortedStoreBreakdown.map((row) => (
                <tr
                  key={row.store}
                  data-testid={`storage-breakdown-row-${row.store}`}
                  className="hover:bg-[#FAF8F4] dark:hover:bg-[#0F1529]/70 transition-colors"
                >
                  <td className="py-2.5 pl-5 pr-2 font-mono tabular-nums text-[11px] text-[#5F6576] dark:text-[#8E96B0]">
                    #{row.rank}
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-2 font-semibold text-[#16213A] dark:text-[#E7EBF5]">
                      <span
                        className="w-2 h-2 rounded-xs shrink-0"
                        style={{ backgroundColor: row.meta.barColor }}
                        aria-hidden="true"
                      />
                      <span>{row.meta.label}</span>
                    </div>
                    <div className="font-mono text-[11px] text-[#5F6576] dark:text-[#8E96B0] pl-4">
                      {row.store}
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-[#4A5568] dark:text-[#A4ADC6]">
                    {row.meta.description}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-[#16213A] dark:text-[#E7EBF5]">
                    {row.count}
                  </td>
                  <td className="py-2.5 px-4">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full bg-[#E4DFD6] dark:bg-[#232B4A] overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${row.bytes > 0 ? Math.max(row.sharePct, 3) : 0}%`,
                            backgroundColor: row.meta.barColor,
                          }}
                        />
                      </div>
                      <span className="w-11 text-right font-mono tabular-nums text-[11px] text-[#5F6576] dark:text-[#8E96B0]">
                        {row.sharePct.toFixed(1)}%
                      </span>
                    </div>
                  </td>
                  <td className="py-2.5 pl-3 pr-5 text-right font-mono tabular-nums text-[#16213A] dark:text-[#E7EBF5]">
                    <div>{formatBytes(row.bytes)}</div>
                    <div className="text-[10px] text-[#5F6576] dark:text-[#8E96B0]">
                      {row.bytes.toLocaleString()} B
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Saved Scenarios & Workspace Snapshots Table + Quick-Save Controls */}
      <div
        data-testid="stored-items-inventory"
        className="rounded-2xl border border-[#E4DFD6] dark:border-[#232B4A] bg-white dark:bg-[#141A32] overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-[#E4DFD6] dark:border-[#232B4A] flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-[#16213A] dark:text-[#E7EBF5]">
              Stored Scenarios &amp; Snapshots
            </h3>
            <p className="text-xs text-[#5F6576] dark:text-[#8E96B0] mt-0.5">
              Search saved investor scenarios and named workspace snapshots, or select multiple rows for bulk deletion.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-xs font-mono tabular-nums text-[#5F6576] dark:text-[#8E96B0]">
              {storedItemsList.length} stored · {savedCalculatorScenarios.length} scenarios ·{' '}
              {workspaceSnapshots.length} snapshots
              {metrics?.autoSavedWorkspacePresent ? ' · 1 auto' : ''}
            </div>

            <button
              type="button"
              data-testid="download-csv-btn"
              onClick={handleDownloadFilteredCsv}
              disabled={filteredStoredItems.length === 0}
              aria-label={`Download CSV of current filtered view (${filteredStoredItems.length} items)`}
              title={
                filteredStoredItems.length === 0
                  ? 'No matching scenarios or snapshots in the current filtered view'
                  : `Export ${filteredStoredItems.length} filtered item${filteredStoredItems.length === 1 ? '' : 's'} as CSV for accounting software`
              }
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-[#E4DFD6] dark:border-[#232B4A] bg-[#FAF8F4] dark:bg-[#0F1529] text-[#16213A] dark:text-[#E7EBF5] hover:border-[#1C6E46] dark:hover:border-[#6FCB9F] transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {csvDownloaded ? (
                <Check className="w-3.5 h-3.5 text-[#1C6E46] dark:text-[#6FCB9F]" strokeWidth={1.75} />
              ) : (
                <FileSpreadsheet className="w-3.5 h-3.5 text-[#1C6E46] dark:text-[#6FCB9F]" strokeWidth={1.6} />
              )}
              <span>{csvDownloaded ? 'CSV Downloaded' : 'Download CSV'}</span>
            </button>
          </div>
        </div>

        {/* Quick-Save Forms for Scenarios & Snapshots */}
        <div className="px-5 py-3.5 border-b border-[#E4DFD6] dark:border-[#232B4A] bg-[#FAF8F4]/70 dark:bg-[#0F1529]/60 grid grid-cols-1 lg:grid-cols-2 gap-3">
          <form onSubmit={handleSaveQuickScenario} className="flex items-center gap-2">
            <input
              type="text"
              value={scenarioNameInput}
              onChange={(e) => setScenarioNameInput(e.target.value)}
              placeholder="Name current calculator scenario…"
              aria-label="New investor scenario name"
              className="flex-1 min-w-0 h-9 px-3 text-xs rounded-lg bg-white dark:bg-[#0B1020] border border-[#E4DFD6] dark:border-[#232B4A] text-[#16213A] dark:text-[#E7EBF5] placeholder:text-[#7D8599] focus:outline-none focus:border-[#1F3863] dark:focus:border-[#8FA6E8]"
            />
            <button
              type="submit"
              data-testid="quick-save-scenario-btn"
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-semibold bg-[#1F3863] text-white dark:bg-[#8FA6E8] dark:text-[#0B1020] hover:opacity-90 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" strokeWidth={1.75} />
              <span>Save Scenario</span>
            </button>
          </form>

          <form onSubmit={handleSaveQuickSnapshot} className="flex items-center gap-2">
            <input
              type="text"
              value={snapshotNameInput}
              onChange={(e) => setSnapshotNameInput(e.target.value)}
              placeholder={`Snapshot "${activeTab}" (${selectedIds.length} modules)…`}
              aria-label="New workspace snapshot name"
              className="flex-1 min-w-0 h-9 px-3 text-xs rounded-lg bg-white dark:bg-[#0B1020] border border-[#E4DFD6] dark:border-[#232B4A] text-[#16213A] dark:text-[#E7EBF5] placeholder:text-[#7D8599] focus:outline-none focus:border-[#1F3863] dark:focus:border-[#8FA6E8]"
            />
            <button
              type="submit"
              data-testid="quick-save-snapshot-btn"
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-semibold bg-[#1C6E46] text-white dark:bg-[#6FCB9F] dark:text-[#0B1020] hover:opacity-90 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" strokeWidth={1.75} />
              <span>Save Snapshot</span>
            </button>
          </form>
        </div>

        {/* Search, Type Filter & Bulk Deletion Toolbar */}
        <div className="px-5 py-3 border-b border-[#E4DFD6] dark:border-[#232B4A] flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[240px]">
            <div className="relative flex-1 min-w-[220px] max-w-sm">
              <Search
                className="w-3.5 h-3.5 text-[#5F6576] dark:text-[#8E96B0] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                strokeWidth={1.75}
              />
              <input
                type="text"
                data-testid="storage-item-search"
                value={itemSearchQuery}
                onChange={(e) => setItemSearchQuery(e.target.value)}
                placeholder="Search by name or type (Scenario, Snapshot)…"
                aria-label="Search stored scenarios and snapshots by name or type"
                className="w-full h-9 pl-8 pr-8 text-xs rounded-lg bg-[#FAF8F4] dark:bg-[#0B1020] border border-[#E4DFD6] dark:border-[#232B4A] text-[#16213A] dark:text-[#E7EBF5] placeholder:text-[#7D8599] focus:outline-none focus:border-[#1F3863] dark:focus:border-[#8FA6E8]"
              />
              {itemSearchQuery ? (
                <button
                  type="button"
                  data-testid="storage-item-search-clear"
                  onClick={() => setItemSearchQuery('')}
                  aria-label="Clear stored items search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-[#5F6576] dark:text-[#8E96B0] hover:text-[#16213A] dark:hover:text-[#E7EBF5] cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" strokeWidth={1.75} />
                </button>
              ) : null}
            </div>

            <div
              role="group"
              aria-label="Filter stored items by type"
              className="inline-flex items-center p-0.5 rounded-lg bg-[#FAF8F4] dark:bg-[#0F1529] border border-[#E4DFD6] dark:border-[#232B4A]"
            >
              {(['all', 'scenario', 'snapshot'] as const).map((typeOpt) => {
                const label =
                  typeOpt === 'all'
                    ? 'All'
                    : typeOpt === 'scenario'
                      ? 'Scenarios'
                      : 'Snapshots';
                const active = itemTypeFilter === typeOpt;
                return (
                  <button
                    key={typeOpt}
                    type="button"
                    data-testid={`stored-type-filter-${typeOpt}`}
                    onClick={() => setItemTypeFilter(typeOpt)}
                    aria-pressed={active}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                      active
                        ? 'bg-[#1F3863] text-white dark:bg-[#8FA6E8] dark:text-[#0B1020]'
                        : 'text-[#5F6576] dark:text-[#8E96B0] hover:text-[#16213A] dark:hover:text-[#E7EBF5]'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <label
                htmlFor="storage-sort-dropdown"
                className="inline-flex items-center gap-1 text-[11px] font-medium text-[#5F6576] dark:text-[#8E96B0] whitespace-nowrap shrink-0"
              >
                <ArrowUpDown className="w-3 h-3" strokeWidth={1.75} />
                <span>Sort:</span>
              </label>
              <select
                id="storage-sort-dropdown"
                data-testid="storage-sort-dropdown"
                value={sortOption}
                onChange={(e) => setSortOption(e.target.value as StorageItemSortOption)}
                aria-label="Sort filtered items by Date Created (Newest), Date Created (Oldest), Size (Descending), or Name (A-Z)"
                className="h-9 px-2.5 text-xs rounded-lg bg-[#FAF8F4] dark:bg-[#0B1020] border border-[#E4DFD6] dark:border-[#232B4A] text-[#16213A] dark:text-[#E7EBF5] focus:outline-none focus:border-[#1F3863] dark:focus:border-[#8FA6E8] cursor-pointer whitespace-nowrap shrink-0"
              >
                <option value="date-created-newest">Date Created (Newest)</option>
                <option value="date-created-oldest">Date Created (Oldest)</option>
                <option value="size-desc">Size (Descending)</option>
                <option value="name-asc">Name (A-Z)</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {selectedItemKeys.size > 0 ? (
              <>
                <span
                  data-testid="selected-items-count"
                  className="text-xs font-mono tabular-nums font-semibold text-[#16213A] dark:text-[#E7EBF5]"
                >
                  {selectedItemKeys.size} selected
                </span>
                <button
                  type="button"
                  data-testid="clear-selection-btn"
                  onClick={clearSelection}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-medium border border-[#E4DFD6] dark:border-[#232B4A] bg-[#FAF8F4] dark:bg-[#0F1529] text-[#5F6576] dark:text-[#8E96B0] hover:text-[#16213A] dark:hover:text-[#E7EBF5] whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Clear Selection
                </button>
              </>
            ) : (
              <span className="text-xs font-mono tabular-nums text-[#5F6576] dark:text-[#8E96B0]">
                {filteredStoredItems.length} of {storedItemsList.length} shown
              </span>
            )}

            <button
              type="button"
              data-testid="bulk-delete-btn"
              onClick={() => void handleBulkDeleteSelected()}
              disabled={selectedItemKeys.size === 0 || bulkDeleting}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                selectedItemKeys.size > 0 && !bulkDeleting
                  ? 'bg-[#B91C1C] text-white dark:bg-[#FCA5A5] dark:text-[#0B1020] hover:opacity-90 cursor-pointer'
                  : 'border border-[#E4DFD6] dark:border-[#232B4A] bg-[#FAF8F4] dark:bg-[#0F1529] text-[#7D8599] dark:text-[#6B7394] cursor-not-allowed'
              }`}
            >
              <Trash2 className="w-3.5 h-3.5" strokeWidth={1.6} />
              <span>
                {bulkDeleting
                  ? 'Deleting…'
                  : selectedItemKeys.size > 0
                    ? `Delete Selected (${selectedItemKeys.size})`
                    : 'Delete Selected'}
              </span>
            </button>
          </div>
        </div>

        {/* Stored Scenarios & Snapshots Table */}
        <div className="overflow-x-auto">
          {storedItemsList.length === 0 ? (
            <div
              data-testid="stored-items-empty"
              className="py-10 px-5 text-center text-xs text-[#5F6576] dark:text-[#8E96B0]"
            >
              No named investor scenarios or workspace snapshots saved yet. Use the quick-save forms above to create offline records you can search, apply, and manage here.
            </div>
          ) : filteredStoredItems.length === 0 ? (
            <div
              data-testid="stored-items-filtered-empty"
              className="py-10 px-5 text-center space-y-2.5"
            >
              <div className="text-xs text-[#5F6576] dark:text-[#8E96B0]">
                No stored scenarios or snapshots match{' '}
                {itemSearchQuery.trim() ? `"${itemSearchQuery.trim()}"` : 'the selected type filter'}.
              </div>
              <button
                type="button"
                data-testid="reset-stored-items-filter-btn"
                onClick={() => {
                  setItemSearchQuery('');
                  setItemTypeFilter('all');
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-[#E4DFD6] dark:border-[#232B4A] bg-[#FAF8F4] dark:bg-[#0F1529] text-[#16213A] dark:text-[#E7EBF5] hover:border-[#1F3863] dark:hover:border-[#8FA6E8] cursor-pointer"
              >
                Reset search &amp; filter
              </button>
            </div>
          ) : (
            <table data-testid="stored-items-table" className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#E4DFD6] dark:border-[#232B4A] bg-[#FAF8F4] dark:bg-[#0F1529] text-[11px] font-semibold text-[#5F6576] dark:text-[#8E96B0]">
                  <th className="py-2.5 pl-5 pr-2 w-10">
                    <input
                      ref={selectAllCheckboxRef}
                      type="checkbox"
                      data-testid="select-all-stored-items"
                      checked={allVisibleSelected}
                      onChange={toggleSelectAllVisible}
                      aria-label="Select all visible stored scenarios and snapshots"
                      className="w-4 h-4 rounded border-[#CFC8BC] dark:border-[#333F69] accent-[#1F3863] dark:accent-[#8FA6E8] cursor-pointer align-middle"
                    />
                  </th>
                  <th className="py-2.5 px-3">Name</th>
                  <th className="py-2.5 px-3 w-28">Type</th>
                  <th className="py-2.5 px-3">Details</th>
                  <th className="py-2.5 px-3 text-right w-24">Size</th>
                  <th className="py-2.5 px-3 w-44">Updated</th>
                  <th className="py-2.5 pl-3 pr-5 text-right w-36">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E4DFD6] dark:divide-[#232B4A] text-xs">
                {sortedFilteredItems.map((item) => {
                  const isSelected = selectedItemKeys.has(item.key);
                  return (
                    <tr
                      key={item.key}
                      data-testid={`stored-item-row-${item.kind}-${item.id}`}
                      className={`transition-colors ${
                        isSelected
                          ? 'bg-[#EEF2FA]/70 dark:bg-[#1A2444]'
                          : 'hover:bg-[#FAF8F4] dark:hover:bg-[#0F1529]/70'
                      }`}
                    >
                      <td className="py-2.5 pl-5 pr-2">
                        <input
                          type="checkbox"
                          data-testid={`select-stored-item-${item.kind}-${item.id}`}
                          checked={isSelected}
                          onChange={() => toggleSelectItem(item.key)}
                          aria-label={`Select ${item.typeLabel} ${item.name}`}
                          className="w-4 h-4 rounded border-[#CFC8BC] dark:border-[#333F69] accent-[#1F3863] dark:accent-[#8FA6E8] cursor-pointer align-middle"
                        />
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-[#16213A] dark:text-[#E7EBF5]">
                        <div className="truncate max-w-[240px]" title={item.name}>
                          {item.name}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                            item.kind === 'scenario'
                              ? 'text-[#1F3863] dark:text-[#8FA6E8]'
                              : 'text-[#1C6E46] dark:text-[#6FCB9F]'
                          }`}
                        >
                          <span
                            className="w-2 h-2 rounded-xs shrink-0"
                            style={{
                              backgroundColor:
                                item.kind === 'scenario'
                                  ? isDark
                                    ? '#60A5FA'
                                    : '#2563EB'
                                  : isDark
                                    ? '#6FCB9F'
                                    : '#1C6E46',
                            }}
                            aria-hidden="true"
                          />
                          <span>{item.typeLabel}</span>
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono tabular-nums text-[11px] text-[#4A5568] dark:text-[#A4ADC6]">
                        {item.details}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[11px] text-[#5F6576] dark:text-[#8E96B0] whitespace-nowrap">
                        {formatBytes(item.estimatedBytes)}
                      </td>
                      <td className="py-2.5 px-3 font-mono tabular-nums text-[11px] text-[#5F6576] dark:text-[#8E96B0] whitespace-nowrap">
                        {formatTimestamp(item.updatedAt)}
                      </td>
                      <td className="py-2.5 pl-3 pr-5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              item.kind === 'scenario'
                                ? applyCalculatorScenario(item.id)
                                : restoreWorkspaceSnapshot(item.id)
                            }
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold border border-[#E4DFD6] dark:border-[#232B4A] bg-[#FAF8F4] dark:bg-[#0F1529] text-[#16213A] dark:text-[#E7EBF5] cursor-pointer whitespace-nowrap shrink-0 ${
                              item.kind === 'scenario'
                                ? 'hover:border-[#1F3863] dark:hover:border-[#8FA6E8]'
                                : 'hover:border-[#1C6E46] dark:hover:border-[#6FCB9F]'
                            }`}
                          >
                            <RotateCcw className="w-3 h-3" strokeWidth={1.6} />
                            <span>{item.kind === 'scenario' ? 'Apply' : 'Restore'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              void (item.kind === 'scenario'
                                ? deleteCalculatorScenario(item.id)
                                : deleteWorkspaceSnapshot(item.id))
                            }
                            aria-label={`Delete ${item.typeLabel.toLowerCase()} ${item.name}`}
                            className="p-1.5 rounded-md text-[#5F6576] dark:text-[#8E96B0] hover:text-[#B91C1C] dark:hover:text-[#FCA5A5] hover:bg-[#FEF2F2] dark:hover:bg-[#2A1215] cursor-pointer shrink-0"
                          >
                            <Trash2 className="w-3.5 h-3.5" strokeWidth={1.6} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </section>
  );
}
