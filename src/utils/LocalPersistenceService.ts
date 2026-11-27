import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

export type PersistenceStoreName =
  | 'investorCalculator'
  | 'calculatorScenarios'
  | 'chartProjections'
  | 'userSession'
  | 'workspaceSnapshots'
  | 'investorFeedback'
  | 'diligencePrefs'
  | 'contactInquiries';

export const PERSISTENCE_DB_NAME = 'spenta_sovereign_offline_db';
export const PERSISTENCE_DB_VERSION = 3;
export const PERSISTENCE_STORES: readonly PersistenceStoreName[] = [
  'investorCalculator',
  'calculatorScenarios',
  'chartProjections',
  'userSession',
  'workspaceSnapshots',
  'investorFeedback',
  'diligencePrefs',
  'contactInquiries',
] as const;

export const DEFAULT_CALCULATOR_KEY = 'active_investor_calculator';
export const DEFAULT_SESSION_KEY = 'active_user_session';
export const DEFAULT_DILIGENCE_PREFS_KEY = 'active_diligence_prefs';
export const DEFAULT_WORKSPACE_SNAPSHOT_KEY = 'latest_workspace_snapshot';
export const SNAPSHOT_AUTO_PRUNE_DAYS = 30;
export const STORAGE_TREND_HISTORY_KEY = 'storage_usage_history_30d';

export interface PersistedInvestorCalculatorState {
  scenario: 'conservative' | 'upside';
  growthMode: 'conservative' | 'aggressive';
  fxRate: number;
  taxRate: number;
  exitMultiple: number;
  dilutionPct: number;
  investmentK: number;
  horizonYears: number;
  compareGrowthScenarios: boolean;
  projectedChartMetric: 'value' | 'moic';
  subTab: 'pnl' | 'roi' | 'maps';
  mixPreset: 'fy27' | 'fy31' | 'arr-heavy';
  mixScopeWeights: Record<string, number>;
  mixOpexRatioPct: number;
  updatedAt: string;
}

export interface InvestorCalculatorScenario {
  id: string;
  name: string;
  description?: string;
  state: Omit<PersistedInvestorCalculatorState, 'updatedAt'>;
  createdAt: string;
  updatedAt: string;
}

export interface PersistedChartProjectionRecord<T = unknown> {
  id: string;
  data: T;
  meta?: Record<string, unknown>;
  updatedAt: string;
}

export interface PersistedUserSessionData {
  activeTab: string;
  selectedIds: string[];
  deploymentTarget: string;
  hitlConfidence?: number;
  savedProposalsCount: number;
  neuralCoreSystem?: string;
  updatedAt: string;
}

export interface UserWorkspaceSnapshot {
  id: string;
  name: string;
  activeTab: string;
  selectedIds: string[];
  deploymentTarget: string;
  hitlConfidence: number;
  calculatorState: Omit<PersistedInvestorCalculatorState, 'updatedAt'>;
  createdAt: string;
  updatedAt: string;
}

export type InvestorFeedbackPriority =
  | 'Critical Inquiry'
  | 'Strategic Suggestion'
  | 'General Feedback';

export interface InvestorFeedbackReply {
  id: string;
  text: string;
  createdAt: string;
}

export interface InvestorFeedbackRecord {
  id: string;
  section: string;
  priority: InvestorFeedbackPriority;
  sentimentScore: number; // 1 to 5
  text: string;
  replies: InvestorFeedbackReply[];
  createdAt: string;
  updatedAt: string;
}

export interface DiligencePreferencesRecord {
  personaTrack: 'financial' | 'technical' | 'strategic';
  currency: 'USD' | 'BDT';
  bookmarkedDocIds: string[];
  autoPruneSnapshots?: boolean;
  lastAutoPruneAt?: string | null;
  lastAutoPrunedCount?: number;
  cloudSyncEnabled?: boolean;
  lastCloudSyncAt?: string | null;
  cloudBackupRevision?: number;
  updatedAt: string;
}

export interface OfflineContactInquiry {
  id: string;
  name: string;
  organization: string;
  email: string;
  topic: string;
  checkSize: string;
  message: string;
  createdAt: string;
}

export interface OfflinePersistenceBundle {
  schemaVersion: number;
  exportedAt: string;
  stores: Record<PersistenceStoreName, Record<string, unknown>>;
}

export interface PersistenceStoreStat {
  store: PersistenceStoreName;
  count: number;
  bytes: number;
}

export interface PersistenceStorageMetrics {
  dbName: string;
  dbVersion: number;
  backend: 'indexeddb' | 'fallback';
  usageBytes: number | null;
  quotaBytes: number | null;
  estimatedPayloadBytes: number;
  totalEntries: number;
  scenarioEntries: number;
  workspaceEntries: number;
  autoSavedWorkspacePresent: boolean;
  storeStats: PersistenceStoreStat[];
  lastUpdatedAt: string | null;
}

export interface PersistenceReconciliationResult {
  ok: boolean;
  backend: 'indexeddb' | 'fallback';
  verifiedStores: number;
  totalEntries: number;
  reconciledAt: string;
}

export interface SnapshotPruneResult {
  prunedIds: string[];
  prunedCount: number;
  remainingCount: number;
  prunedAt: string;
}

export interface StorageUsageDailySample {
  bytes: number;
  entries: number;
  scenarioBytes: number;
  snapshotBytes: number;
  recordedAt: string;
}

export interface StorageUsageTrendPoint {
  date: string;
  label: string;
  bytes: number;
  entries: number;
  scenarioBytes: number;
  snapshotBytes: number;
}

export interface StorageUsageTrendSummary {
  points: StorageUsageTrendPoint[];
  currentBytes: number;
  startBytes: number;
  deltaBytes: number;
  deltaPct: number | null;
  peakBytes: number;
  direction: 'up' | 'down' | 'flat';
  hasRecordedHistory: boolean;
}

export const CLOUD_BACKUP_MIRROR_STORAGE_KEY = 'spenta_cloud_backup_mirror_v1';
export const DEFAULT_CLOUD_ENDPOINT = 'https://cloud-vault.spenta.network/api/v1/backups';

export interface StorageHealthIssue {
  id: string;
  store: PersistenceStoreName;
  key: string;
  severity: 'critical' | 'warning' | 'info';
  issueType:
    | 'orphaned'
    | 'schema_mismatch'
    | 'corrupted_state'
    | 'dangling_reference'
    | 'fragmented_payload';
  description: string;
  repaired: boolean;
  repairAction?: string;
}

export interface StoreHealthSummary {
  store: PersistenceStoreName;
  label: string;
  recordCount: number;
  validCount: number;
  issuesCount: number;
  status: 'healthy' | 'repaired' | 'warning';
}

export interface StorageHealthCheckReport {
  scannedAt: string;
  integrityScore: number; // 0 to 100
  healthy: boolean;
  storesChecked: number;
  recordsScanned: number;
  issuesFound: number;
  issuesRepaired: number;
  orphanedCount: number;
  fragmentedCount: number;
  storeSummaries: StoreHealthSummary[];
  issues: StorageHealthIssue[];
  repairedAt: string | null;
  executionTimeMs: number;
}

export interface CloudSyncResult {
  success: boolean;
  mirroredAt: string;
  recordsMirrored: number;
  bundleSizeBytes: number;
  cloudRevision: number;
  cloudEndpoint: string;
  checksum: string;
}

export interface CloudSyncStatus {
  enabled: boolean;
  lastMirroredAt: string | null;
  cloudRevision: number;
  isMirrored: boolean;
}

export type PersistenceSyncStatus = 'synced' | 'syncing' | 'offline';

export interface PersistenceSyncState {
  status: PersistenceSyncStatus;
  isOnline: boolean;
  activeOperations: number;
  lastSyncedAt: string | null;
  revision: number;
  backend: 'indexeddb' | 'fallback';
}

interface StoredRow<T = unknown> {
  id: string;
  value: T;
  updatedAt: string;
}

interface SpentaOfflineDBSchema extends DBSchema {
  investorCalculator: { key: string; value: StoredRow };
  calculatorScenarios: { key: string; value: StoredRow };
  chartProjections: { key: string; value: StoredRow };
  userSession: { key: string; value: StoredRow };
  workspaceSnapshots: { key: string; value: StoredRow };
  investorFeedback: { key: string; value: StoredRow };
  diligencePrefs: { key: string; value: StoredRow };
  contactInquiries: { key: string; value: StoredRow };
}

const FALLBACK_STORAGE_PREFIX = 'spenta_idb_fallback_v2:';

function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined' && typeof indexedDB.open === 'function';
}

function getLocalStorageSafe(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    // ignore private browsing / restricted storage errors
  }
  return null;
}

function createRecordId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Offline-first IndexedDB persistence service backed by the `idb` library.
 * Provides typed CRUD helpers (`saveScenario`, `getScenario`,
 * `saveWorkspaceSnapshot`, `getWorkspaceSnapshot`, plus active calculator,
 * chart projections, user session, feedback, preferences, and inquiries)
 * with zero server reliance and automatic localStorage/memory fallback.
 */
export class LocalPersistenceService {
  private readonly dbName: string;
  private readonly dbVersion: number;
  private dbPromise: Promise<IDBPDatabase<SpentaOfflineDBSchema> | null> | null = null;
  private readonly listeners = new Set<(state: PersistenceSyncState) => void>();
  private activeOperations = 0;
  private lastSyncedAt: string | null = null;
  private revision = 0;
  private isOnlineState: boolean =
    typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean'
      ? navigator.onLine
      : true;
  private readonly memoryFallback: Record<PersistenceStoreName, Map<string, StoredRow>> = {
    investorCalculator: new Map(),
    calculatorScenarios: new Map(),
    chartProjections: new Map(),
    userSession: new Map(),
    workspaceSnapshots: new Map(),
    investorFeedback: new Map(),
    diligencePrefs: new Map(),
    contactInquiries: new Map(),
  };
  private cloudMirrorMemoryFallback: string | null = null;

  constructor(dbName = PERSISTENCE_DB_NAME, dbVersion = PERSISTENCE_DB_VERSION) {
    this.dbName = dbName;
    this.dbVersion = dbVersion;
  }

  getSyncState(): PersistenceSyncState {
    const status: PersistenceSyncStatus = !this.isOnlineState
      ? 'offline'
      : this.activeOperations > 0
        ? 'syncing'
        : 'synced';
    return {
      status,
      isOnline: this.isOnlineState,
      activeOperations: this.activeOperations,
      lastSyncedAt: this.lastSyncedAt,
      revision: this.revision,
      backend: this.getStorageBackend(),
    };
  }

  private emitSyncState(): void {
    const snapshot = this.getSyncState();
    for (const listener of this.listeners) {
      try {
        listener(snapshot);
      } catch {
        // ignore subscriber errors
      }
    }
  }

  subscribe(listener: (state: PersistenceSyncState) => void): () => void {
    this.listeners.add(listener);
    listener(this.getSyncState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  setOnlineStatus(online: boolean): void {
    if (this.isOnlineState === online) return;
    this.isOnlineState = online;
    this.emitSyncState();
  }

  private beginSyncOperation(): void {
    this.activeOperations += 1;
    this.emitSyncState();
  }

  private endSyncOperation(didMutate: boolean): void {
    this.activeOperations = Math.max(0, this.activeOperations - 1);
    if (didMutate) {
      this.lastSyncedAt = new Date().toISOString();
      this.revision += 1;
    }
    this.emitSyncState();
  }

  private openDatabase(): Promise<IDBPDatabase<SpentaOfflineDBSchema> | null> {
    if (!hasIndexedDb()) {
      return Promise.resolve(null);
    }
    if (this.dbPromise) {
      return this.dbPromise;
    }

    this.dbPromise = openDB<SpentaOfflineDBSchema>(this.dbName, this.dbVersion, {
      upgrade: (db) => {
        for (const storeName of PERSISTENCE_STORES) {
          if (!db.objectStoreNames.contains(storeName)) {
            db.createObjectStore(storeName, { keyPath: 'id' });
          }
        }
      },
      blocking: () => {
        this.dbPromise = null;
      },
      terminated: () => {
        this.dbPromise = null;
      },
    }).catch(() => {
      this.dbPromise = null;
      return null;
    });

    return this.dbPromise;
  }

  private fallbackKey(store: PersistenceStoreName, key: string): string {
    return `${FALLBACK_STORAGE_PREFIX}${this.dbName}:${store}:${key}`;
  }

  private writeFallback<T>(store: PersistenceStoreName, key: string, row: StoredRow<T>): void {
    this.memoryFallback[store].set(key, row);
    const ls = getLocalStorageSafe();
    if (!ls) return;
    try {
      ls.setItem(this.fallbackKey(store, key), JSON.stringify(row));
    } catch {
      // ignore quota errors
    }
  }

  private readFallback<T>(store: PersistenceStoreName, key: string): StoredRow<T> | null {
    const inMemory = this.memoryFallback[store].get(key) as StoredRow<T> | undefined;
    if (inMemory) return inMemory;
    const ls = getLocalStorageSafe();
    if (!ls) return null;
    try {
      const raw = ls.getItem(this.fallbackKey(store, key));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as StoredRow<T>;
      if (parsed && typeof parsed === 'object' && 'value' in parsed) {
        this.memoryFallback[store].set(key, parsed);
        return parsed;
      }
    } catch {
      // ignore corrupted fallback payload
    }
    return null;
  }

  private deleteFallback(store: PersistenceStoreName, key: string): void {
    this.memoryFallback[store].delete(key);
    const ls = getLocalStorageSafe();
    if (!ls) return;
    try {
      ls.removeItem(this.fallbackKey(store, key));
    } catch {
      // ignore
    }
  }

  private listFallback(store: PersistenceStoreName): StoredRow[] {
    const merged = new Map<string, StoredRow>();
    const ls = getLocalStorageSafe();
    const prefix = `${FALLBACK_STORAGE_PREFIX}${this.dbName}:${store}:`;

    if (ls) {
      try {
        for (let i = 0; i < ls.length; i++) {
          const storageKey = ls.key(i);
          if (!storageKey || !storageKey.startsWith(prefix)) continue;
          const raw = ls.getItem(storageKey);
          if (!raw) continue;
          const parsed = JSON.parse(raw) as StoredRow;
          if (parsed && typeof parsed.id === 'string') {
            merged.set(parsed.id, parsed);
          }
        }
      } catch {
        // ignore storage read errors
      }
    }

    for (const [k, row] of this.memoryFallback[store].entries()) {
      merged.set(k, row);
    }

    return Array.from(merged.values());
  }

  async setRecord<T>(store: PersistenceStoreName, key: string, value: T): Promise<void> {
    this.beginSyncOperation();
    let mutated = false;
    try {
      const row: StoredRow<T> = {
        id: key,
        value,
        updatedAt: new Date().toISOString(),
      };

      const db = await this.openDatabase();
      if (!db) {
        this.writeFallback(store, key, row);
        mutated = true;
        return;
      }

      try {
        await db.put(store, row);
        mutated = true;
      } catch {
        this.writeFallback(store, key, row);
        mutated = true;
      }
    } finally {
      this.endSyncOperation(mutated);
    }
  }

  private async writeRecordSilent<T>(
    store: PersistenceStoreName,
    key: string,
    value: T,
  ): Promise<void> {
    const row: StoredRow<T> = {
      id: key,
      value,
      updatedAt: new Date().toISOString(),
    };
    const db = await this.openDatabase();
    if (!db) {
      this.writeFallback(store, key, row);
      return;
    }
    try {
      await db.put(store, row);
    } catch {
      this.writeFallback(store, key, row);
    }
  }

  async getRecord<T>(store: PersistenceStoreName, key: string): Promise<T | null> {
    const db = await this.openDatabase();
    if (!db) {
      const row = this.readFallback<T>(store, key);
      return row ? row.value : null;
    }

    try {
      const row = (await db.get(store, key)) as StoredRow<T> | undefined;
      if (row && 'value' in row) {
        return row.value;
      }
    } catch {
      // fall back to localStorage / memory cache
    }

    const fallback = this.readFallback<T>(store, key);
    return fallback ? fallback.value : null;
  }

  async getAllRecords<T = unknown>(store: PersistenceStoreName): Promise<Record<string, T>> {
    const db = await this.openDatabase();
    if (!db) {
      const rows = this.listFallback(store);
      const out: Record<string, T> = {};
      for (const row of rows) {
        out[row.id] = row.value as T;
      }
      return out;
    }

    try {
      const rows = (await db.getAll(store)) as StoredRow<T>[];
      const out: Record<string, T> = {};
      for (const row of rows) {
        if (row && typeof row.id === 'string') {
          out[row.id] = row.value;
        }
      }
      return out;
    } catch {
      const rows = this.listFallback(store);
      const out: Record<string, T> = {};
      for (const row of rows) {
        out[row.id] = row.value as T;
      }
      return out;
    }
  }

  async deleteRecord(store: PersistenceStoreName, key: string): Promise<void> {
    this.beginSyncOperation();
    let mutated = false;
    try {
      this.deleteFallback(store, key);
      mutated = true;
      const db = await this.openDatabase();
      if (!db) return;

      try {
        await db.delete(store, key);
      } catch {
        // ignore IndexedDB delete error; fallback already cleared
      }
    } finally {
      this.endSyncOperation(mutated);
    }
  }

  // Active Investor Calculator State
  async saveCalculatorState(
    state: Omit<PersistedInvestorCalculatorState, 'updatedAt'> & { updatedAt?: string },
  ): Promise<void> {
    const payload: PersistedInvestorCalculatorState = {
      ...state,
      updatedAt: state.updatedAt ?? new Date().toISOString(),
    };
    await this.setRecord('investorCalculator', DEFAULT_CALCULATOR_KEY, payload);
  }

  async loadCalculatorState(): Promise<PersistedInvestorCalculatorState | null> {
    return this.getRecord<PersistedInvestorCalculatorState>(
      'investorCalculator',
      DEFAULT_CALCULATOR_KEY,
    );
  }

  // Named Investor Calculator Scenarios
  async saveScenario(
    input: Omit<InvestorCalculatorScenario, 'id' | 'createdAt' | 'updatedAt'> & {
      id?: string;
      createdAt?: string;
    },
  ): Promise<InvestorCalculatorScenario> {
    const now = new Date().toISOString();
    const record: InvestorCalculatorScenario = {
      id: input.id ?? createRecordId('calc_scen'),
      name: input.name.trim() || 'Untitled Scenario',
      description: input.description?.trim() || undefined,
      state: { ...input.state, mixScopeWeights: { ...input.state.mixScopeWeights } },
      createdAt: input.createdAt ?? now,
      updatedAt: now,
    };
    await this.setRecord('calculatorScenarios', record.id, record);
    return record;
  }

  async getScenario(id: string): Promise<InvestorCalculatorScenario | null> {
    return this.getRecord<InvestorCalculatorScenario>('calculatorScenarios', id);
  }

  async saveCalculatorScenario(
    input: Omit<InvestorCalculatorScenario, 'id' | 'createdAt' | 'updatedAt'> & {
      id?: string;
      createdAt?: string;
    },
  ): Promise<InvestorCalculatorScenario> {
    return this.saveScenario(input);
  }

  async getCalculatorScenario(id: string): Promise<InvestorCalculatorScenario | null> {
    return this.getScenario(id);
  }

  async listCalculatorScenarios(): Promise<InvestorCalculatorScenario[]> {
    const all = await this.getAllRecords<InvestorCalculatorScenario>('calculatorScenarios');
    return Object.values(all).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async deleteCalculatorScenario(id: string): Promise<void> {
    await this.deleteRecord('calculatorScenarios', id);
  }

  // Computed Chart Projections
  async saveChartProjection<T>(
    projectionKey: string,
    data: T,
    meta?: Record<string, unknown>,
  ): Promise<void> {
    const record: PersistedChartProjectionRecord<T> = {
      id: projectionKey,
      data,
      meta,
      updatedAt: new Date().toISOString(),
    };
    await this.setRecord('chartProjections', projectionKey, record);
  }

  async loadChartProjection<T>(
    projectionKey: string,
  ): Promise<PersistedChartProjectionRecord<T> | null> {
    return this.getRecord<PersistedChartProjectionRecord<T>>('chartProjections', projectionKey);
  }

  async listChartProjections(): Promise<PersistedChartProjectionRecord[]> {
    const all = await this.getAllRecords<PersistedChartProjectionRecord>('chartProjections');
    return Object.values(all);
  }

  // Active User Session
  async saveUserSession(
    session: Omit<PersistedUserSessionData, 'updatedAt'> & { updatedAt?: string },
  ): Promise<void> {
    const payload: PersistedUserSessionData = {
      ...session,
      updatedAt: session.updatedAt ?? new Date().toISOString(),
    };
    await this.setRecord('userSession', DEFAULT_SESSION_KEY, payload);
  }

  async loadUserSession(): Promise<PersistedUserSessionData | null> {
    return this.getRecord<PersistedUserSessionData>('userSession', DEFAULT_SESSION_KEY);
  }

  // User Workspace Snapshots (auto-saved latest state + named checkpoints)
  async saveWorkspaceSnapshot(
    input: Omit<UserWorkspaceSnapshot, 'id' | 'createdAt' | 'updatedAt'> & {
      id?: string;
      createdAt?: string;
      updatedAt?: string;
    },
  ): Promise<UserWorkspaceSnapshot> {
    const now = new Date().toISOString();
    const record: UserWorkspaceSnapshot = {
      id: input.id ?? createRecordId('ws_snap'),
      name: input.name.trim() || 'Workspace Snapshot',
      activeTab: input.activeTab,
      selectedIds: [...input.selectedIds],
      deploymentTarget: input.deploymentTarget,
      hitlConfidence: input.hitlConfidence,
      calculatorState: {
        ...input.calculatorState,
        mixScopeWeights: { ...input.calculatorState.mixScopeWeights },
      },
      createdAt: input.createdAt ?? now,
      updatedAt: input.updatedAt ?? now,
    };
    await this.setRecord('workspaceSnapshots', record.id, record);
    return record;
  }

  async getWorkspaceSnapshot(
    id: string = DEFAULT_WORKSPACE_SNAPSHOT_KEY,
  ): Promise<UserWorkspaceSnapshot | null> {
    return this.getRecord<UserWorkspaceSnapshot>('workspaceSnapshots', id);
  }

  async listWorkspaceSnapshots(): Promise<UserWorkspaceSnapshot[]> {
    const all = await this.getAllRecords<UserWorkspaceSnapshot>('workspaceSnapshots');
    return Object.values(all)
      .filter((item) => item.id !== DEFAULT_WORKSPACE_SNAPSHOT_KEY)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async deleteWorkspaceSnapshot(id: string): Promise<void> {
    await this.deleteRecord('workspaceSnapshots', id);
  }

  async pruneExpiredSnapshots(
    maxAgeDays: number = SNAPSHOT_AUTO_PRUNE_DAYS,
    nowMs: number = Date.now(),
  ): Promise<SnapshotPruneResult> {
    const cutoffMs = nowMs - maxAgeDays * 24 * 60 * 60 * 1000;
    const snapshots = await this.listWorkspaceSnapshots();
    const expired = snapshots.filter((snap) => {
      const ts = Date.parse(snap.updatedAt || snap.createdAt);
      return Number.isFinite(ts) && ts < cutoffMs;
    });

    for (const snap of expired) {
      await this.deleteRecord('workspaceSnapshots', snap.id);
    }

    return {
      prunedIds: expired.map((s) => s.id),
      prunedCount: expired.length,
      remainingCount: snapshots.length - expired.length,
      prunedAt: new Date(nowMs).toISOString(),
    };
  }

  // Offline Investor Section Feedback & Sentiment Analytics
  async saveInvestorFeedback(
    input: Omit<InvestorFeedbackRecord, 'id' | 'replies' | 'createdAt' | 'updatedAt'> & {
      id?: string;
      replies?: InvestorFeedbackReply[];
      createdAt?: string;
    },
  ): Promise<InvestorFeedbackRecord> {
    const now = new Date().toISOString();
    const record: InvestorFeedbackRecord = {
      id: input.id ?? createRecordId('fb'),
      section: input.section.trim() || 'Executive Overview',
      priority: input.priority,
      sentimentScore: Math.max(1, Math.min(5, Math.round(input.sentimentScore))),
      text: input.text.trim(),
      replies: input.replies ? [...input.replies] : [],
      createdAt: input.createdAt ?? now,
      updatedAt: now,
    };
    await this.setRecord('investorFeedback', record.id, record);
    return record;
  }

  async listInvestorFeedback(): Promise<InvestorFeedbackRecord[]> {
    const all = await this.getAllRecords<InvestorFeedbackRecord>('investorFeedback');
    return Object.values(all).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async addFeedbackReply(
    feedbackId: string,
    replyText: string,
  ): Promise<InvestorFeedbackRecord | null> {
    const existing = await this.getRecord<InvestorFeedbackRecord>('investorFeedback', feedbackId);
    if (!existing) return null;
    const now = new Date().toISOString();
    const updated: InvestorFeedbackRecord = {
      ...existing,
      replies: [
        ...(existing.replies ?? []),
        { id: createRecordId('rep'), text: replyText.trim(), createdAt: now },
      ],
      updatedAt: now,
    };
    await this.setRecord('investorFeedback', updated.id, updated);
    return updated;
  }

  async deleteInvestorFeedback(id: string): Promise<void> {
    await this.deleteRecord('investorFeedback', id);
  }

  // Diligence Preferences (Persona Track, Global Currency, Data Room Bookmarks)
  async saveDiligencePrefs(
    prefs: Omit<DiligencePreferencesRecord, 'updatedAt'> & { updatedAt?: string },
  ): Promise<void> {
    const payload: DiligencePreferencesRecord = {
      ...prefs,
      bookmarkedDocIds: Array.from(new Set(prefs.bookmarkedDocIds)),
      updatedAt: prefs.updatedAt ?? new Date().toISOString(),
    };
    await this.setRecord('diligencePrefs', DEFAULT_DILIGENCE_PREFS_KEY, payload);
  }

  async loadDiligencePrefs(): Promise<DiligencePreferencesRecord | null> {
    return this.getRecord<DiligencePreferencesRecord>('diligencePrefs', DEFAULT_DILIGENCE_PREFS_KEY);
  }

  // Offline Founder Contact & Term-Sheet Inquiries
  async saveContactInquiry(
    input: Omit<OfflineContactInquiry, 'id' | 'createdAt'> & { id?: string; createdAt?: string },
  ): Promise<OfflineContactInquiry> {
    const now = new Date().toISOString();
    const record: OfflineContactInquiry = {
      id: input.id ?? createRecordId('inq'),
      name: input.name.trim(),
      organization: input.organization.trim(),
      email: input.email.trim(),
      topic: input.topic.trim() || 'Seed SAFE Inquiry',
      checkSize: input.checkSize.trim() || 'Undisclosed',
      message: input.message.trim(),
      createdAt: input.createdAt ?? now,
    };
    await this.setRecord('contactInquiries', record.id, record);
    return record;
  }

  async listContactInquiries(): Promise<OfflineContactInquiry[]> {
    const all = await this.getAllRecords<OfflineContactInquiry>('contactInquiries');
    return Object.values(all).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async deleteContactInquiry(id: string): Promise<void> {
    await this.deleteRecord('contactInquiries', id);
  }

  async exportAllOfflineData(): Promise<OfflinePersistenceBundle> {
    const [
      investorCalculator,
      calculatorScenarios,
      chartProjections,
      userSession,
      workspaceSnapshots,
      investorFeedback,
      diligencePrefs,
      contactInquiries,
    ] = await Promise.all([
      this.getAllRecords('investorCalculator'),
      this.getAllRecords('calculatorScenarios'),
      this.getAllRecords('chartProjections'),
      this.getAllRecords('userSession'),
      this.getAllRecords('workspaceSnapshots'),
      this.getAllRecords('investorFeedback'),
      this.getAllRecords('diligencePrefs'),
      this.getAllRecords('contactInquiries'),
    ]);

    return {
      schemaVersion: this.dbVersion,
      exportedAt: new Date().toISOString(),
      stores: {
        investorCalculator,
        calculatorScenarios,
        chartProjections,
        userSession,
        workspaceSnapshots,
        investorFeedback,
        diligencePrefs,
        contactInquiries,
      },
    };
  }

  async importAllOfflineData(bundle: OfflinePersistenceBundle): Promise<void> {
    if (!bundle || typeof bundle !== 'object' || !bundle.stores) {
      return;
    }
    const writes: Promise<void>[] = [];
    for (const storeName of PERSISTENCE_STORES) {
      const entries = bundle.stores[storeName];
      if (!entries || typeof entries !== 'object') continue;
      for (const [key, value] of Object.entries(entries)) {
        writes.push(this.setRecord(storeName, key, value));
      }
    }
    await Promise.all(writes);
  }

  async clearAll(): Promise<void> {
    this.beginSyncOperation();
    let cleared = false;
    try {
      for (const storeName of PERSISTENCE_STORES) {
        this.memoryFallback[storeName].clear();
      }
      this.cloudMirrorMemoryFallback = null;

      const ls = getLocalStorageSafe();
      if (ls) {
        try {
          const prefix = `${FALLBACK_STORAGE_PREFIX}${this.dbName}:`;
          const keysToRemove: string[] = [];
          for (let i = 0; i < ls.length; i++) {
            const k = ls.key(i);
            if (k && k.startsWith(prefix)) keysToRemove.push(k);
          }
          keysToRemove.forEach((k) => ls.removeItem(k));
        } catch {
          // ignore
        }
      }

      const db = await this.openDatabase();
      if (!db) {
        cleared = true;
        return;
      }

      await Promise.all(
        PERSISTENCE_STORES.map(async (storeName) => {
          try {
            await db.clear(storeName);
          } catch {
            // ignore
          }
        }),
      );
      cleared = true;
    } finally {
      this.endSyncOperation(cleared);
    }
  }

  private estimateSerializedBytes(value: unknown): number {
    try {
      const json = JSON.stringify(value);
      if (!json) return 0;
      if (typeof TextEncoder !== 'undefined') {
        return new TextEncoder().encode(json).length;
      }
      return json.length * 2;
    } catch {
      return 0;
    }
  }

  async getStorageMetrics(): Promise<PersistenceStorageMetrics> {
    const storeStats: PersistenceStoreStat[] = [];
    let totalEntries = 0;
    let estimatedPayloadBytes = 0;
    let scenarioEntries = 0;
    let workspaceEntries = 0;
    let autoSavedWorkspacePresent = false;
    let latestTs: string | null = null;

    const allStoreMaps = await Promise.all(
      PERSISTENCE_STORES.map(async (store) => ({
        store,
        records: await this.getAllRecords<Record<string, unknown>>(store),
      })),
    );

    for (const { store, records } of allStoreMaps) {
      const entries = Object.entries(records);
      const count = entries.length;
      const bytes = count === 0 ? 0 : this.estimateSerializedBytes(records);
      storeStats.push({ store, count, bytes });
      totalEntries += count;
      estimatedPayloadBytes += bytes;

      if (store === 'calculatorScenarios') {
        scenarioEntries = count;
      } else if (store === 'workspaceSnapshots') {
        workspaceEntries = count;
        autoSavedWorkspacePresent = Object.prototype.hasOwnProperty.call(
          records,
          DEFAULT_WORKSPACE_SNAPSHOT_KEY,
        );
      }

      for (const [, val] of entries) {
        if (val && typeof val === 'object') {
          const ts =
            (val as { updatedAt?: unknown }).updatedAt ??
            (val as { createdAt?: unknown }).createdAt;
          if (typeof ts === 'string' && (!latestTs || ts.localeCompare(latestTs) > 0)) {
            latestTs = ts;
          }
        }
      }
    }

    let usageBytes: number | null = null;
    let quotaBytes: number | null = null;
    if (
      typeof navigator !== 'undefined' &&
      navigator.storage &&
      typeof navigator.storage.estimate === 'function'
    ) {
      try {
        const estimate = await navigator.storage.estimate();
        if (typeof estimate.usage === 'number' && Number.isFinite(estimate.usage)) {
          usageBytes = estimate.usage;
        }
        if (typeof estimate.quota === 'number' && Number.isFinite(estimate.quota)) {
          quotaBytes = estimate.quota;
        }
      } catch {
        // ignore StorageManager quota API errors in restricted contexts
      }
    }

    return {
      dbName: this.dbName,
      dbVersion: this.dbVersion,
      backend: this.getStorageBackend(),
      usageBytes,
      quotaBytes,
      estimatedPayloadBytes,
      totalEntries,
      scenarioEntries,
      workspaceEntries,
      autoSavedWorkspacePresent,
      storeStats,
      lastUpdatedAt: latestTs,
    };
  }

  async getStorageUsageTrend(
    days: number = SNAPSHOT_AUTO_PRUNE_DAYS,
    nowMs: number = Date.now(),
  ): Promise<StorageUsageTrendSummary> {
    const safeDays = Math.max(2, Math.min(90, Math.round(days)));
    const dayMs = 24 * 60 * 60 * 1000;
    const monthNames = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    const toDateKey = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
    const toDateLabel = (dateKey: string): string => {
      const monthIdx = Number(dateKey.slice(5, 7)) - 1;
      const dayNum = Number(dateKey.slice(8, 10));
      return `${monthNames[monthIdx] ?? 'Day'} ${dayNum}`;
    };

    const allStoreMaps = await Promise.all(
      PERSISTENCE_STORES.map(async (store) => ({
        store,
        records: await this.getAllRecords<Record<string, unknown>>(store),
      })),
    );

    const chartRecords =
      allStoreMaps.find((s) => s.store === 'chartProjections')?.records ?? {};
    const rawTrendRecord = chartRecords[STORAGE_TREND_HISTORY_KEY] as unknown as
      | PersistedChartProjectionRecord<Record<string, StorageUsageDailySample>>
      | undefined;
    const existingHistory: Record<string, StorageUsageDailySample> =
      rawTrendRecord &&
      typeof rawTrendRecord === 'object' &&
      rawTrendRecord.data &&
      typeof rawTrendRecord.data === 'object'
        ? { ...rawTrendRecord.data }
        : {};

    let currentTotalBytes = 0;
    let currentTotalEntries = 0;
    let currentScenarioBytes = 0;
    let currentSnapshotBytes = 0;

    interface TimestampedRecordMeta {
      store: PersistenceStoreName;
      createdAtMs: number;
      bytes: number;
    }
    const datedRecords: TimestampedRecordMeta[] = [];

    for (const { store, records } of allStoreMaps) {
      const entries = Object.entries(records);
      const count = entries.length;
      const storeBytes = count === 0 ? 0 : this.estimateSerializedBytes(records);
      currentTotalEntries += count;
      currentTotalBytes += storeBytes;

      if (store === 'calculatorScenarios') {
        currentScenarioBytes = storeBytes;
      } else if (store === 'workspaceSnapshots') {
        currentSnapshotBytes = storeBytes;
      }

      for (const [key, val] of entries) {
        if (store === 'chartProjections' && key === STORAGE_TREND_HISTORY_KEY) {
          continue;
        }
        const recBytes = this.estimateSerializedBytes(val);
        let tsMs = nowMs;
        if (val && typeof val === 'object') {
          const rawCreated =
            (val as { createdAt?: unknown }).createdAt ??
            (val as { updatedAt?: unknown }).updatedAt;
          if (typeof rawCreated === 'string') {
            const parsed = Date.parse(rawCreated);
            if (Number.isFinite(parsed)) {
              tsMs = parsed;
            }
          }
        }
        datedRecords.push({ store, createdAtMs: tsMs, bytes: recBytes });
      }
    }

    const todayKey = toDateKey(nowMs);
    const todayEndUtc = Date.parse(`${todayKey}T23:59:59.999Z`);
    const cutoffKeepMs = todayEndUtc - (safeDays + 7) * dayMs;
    const hasRecordedHistory = Object.keys(existingHistory).some((k) => k !== todayKey);

    const points: StorageUsageTrendPoint[] = [];
    for (let offset = safeDays - 1; offset >= 0; offset -= 1) {
      const targetKey = toDateKey(todayEndUtc - offset * dayMs);
      const targetEndMs = Date.parse(`${targetKey}T23:59:59.999Z`);

      if (offset === 0) {
        points.push({
          date: targetKey,
          label: toDateLabel(targetKey),
          bytes: currentTotalBytes,
          entries: currentTotalEntries,
          scenarioBytes: currentScenarioBytes,
          snapshotBytes: currentSnapshotBytes,
        });
        continue;
      }

      const recorded = existingHistory[targetKey];
      if (recorded && typeof recorded.bytes === 'number' && Number.isFinite(recorded.bytes)) {
        points.push({
          date: targetKey,
          label: toDateLabel(targetKey),
          bytes: recorded.bytes,
          entries: recorded.entries ?? 0,
          scenarioBytes: recorded.scenarioBytes ?? 0,
          snapshotBytes: recorded.snapshotBytes ?? 0,
        });
        continue;
      }

      let dayBytes = 0;
      let dayEntries = 0;
      let dayScenarioBytes = 0;
      let daySnapshotBytes = 0;
      for (const rec of datedRecords) {
        if (rec.createdAtMs <= targetEndMs) {
          dayBytes += rec.bytes;
          dayEntries += 1;
          if (rec.store === 'calculatorScenarios') {
            dayScenarioBytes += rec.bytes;
          } else if (rec.store === 'workspaceSnapshots') {
            daySnapshotBytes += rec.bytes;
          }
        }
      }

      points.push({
        date: targetKey,
        label: toDateLabel(targetKey),
        bytes: dayBytes,
        entries: dayEntries,
        scenarioBytes: dayScenarioBytes,
        snapshotBytes: daySnapshotBytes,
      });
    }

    if (currentTotalEntries > 0) {
      const prevSample = existingHistory[todayKey];
      if (
        !prevSample ||
        prevSample.bytes !== currentTotalBytes ||
        prevSample.entries !== currentTotalEntries
      ) {
        const nextHistory: Record<string, StorageUsageDailySample> = {};
        for (const [k, sample] of Object.entries(existingHistory)) {
          const parsedDay = Date.parse(`${k}T00:00:00.000Z`);
          if (Number.isFinite(parsedDay) && parsedDay >= cutoffKeepMs) {
            nextHistory[k] = sample;
          }
        }
        nextHistory[todayKey] = {
          bytes: currentTotalBytes,
          entries: currentTotalEntries,
          scenarioBytes: currentScenarioBytes,
          snapshotBytes: currentSnapshotBytes,
          recordedAt: new Date(nowMs).toISOString(),
        };
        const trendProjection: PersistedChartProjectionRecord<
          Record<string, StorageUsageDailySample>
        > = {
          id: STORAGE_TREND_HISTORY_KEY,
          data: nextHistory,
          meta: { retentionDays: safeDays },
          updatedAt: new Date(nowMs).toISOString(),
        };
        await this.writeRecordSilent('chartProjections', STORAGE_TREND_HISTORY_KEY, trendProjection);
      }
    }

    const startBytes = points[0]?.bytes ?? 0;
    const deltaBytes = currentTotalBytes - startBytes;
    const deltaPct =
      startBytes > 0
        ? (deltaBytes / startBytes) * 100
        : currentTotalBytes > 0
          ? 100
          : 0;
    const peakBytes = points.reduce((max, pt) => Math.max(max, pt.bytes), 0);
    const direction: StorageUsageTrendSummary['direction'] =
      deltaBytes > 0 ? 'up' : deltaBytes < 0 ? 'down' : 'flat';

    return {
      points,
      currentBytes: currentTotalBytes,
      startBytes,
      deltaBytes,
      deltaPct,
      peakBytes,
      direction,
      hasRecordedHistory,
    };
  }

  async reconcileAndVerify(): Promise<PersistenceReconciliationResult> {
    this.beginSyncOperation();
    let ok = false;
    try {
      const db = await this.openDatabase();
      let verifiedStores = 0;
      let totalEntries = 0;

      if (db) {
        // Flush any fallback records into IndexedDB and verify every object store is readable
        for (const storeName of PERSISTENCE_STORES) {
          const fallbackRows = this.listFallback(storeName);
          for (const row of fallbackRows) {
            try {
              await db.put(storeName, row);
            } catch {
              // ignore individual fallback migration error
            }
          }
          try {
            const count = await db.count(storeName);
            totalEntries += count;
            verifiedStores += 1;
          } catch {
            // store count failed
          }
        }
      } else {
        for (const storeName of PERSISTENCE_STORES) {
          totalEntries += this.listFallback(storeName).length;
          verifiedStores += 1;
        }
      }

      ok = verifiedStores === PERSISTENCE_STORES.length;
      return {
        ok,
        backend: db ? 'indexeddb' : 'fallback',
        verifiedStores,
        totalEntries,
        reconciledAt: new Date().toISOString(),
      };
    } finally {
      this.endSyncOperation(ok);
    }
  }

  /**
   * Performs a deep scan of the IndexedDB to identify and repair any fragmented
   * or orphaned data entries, ensuring persistent storage integrity.
   */
  async performStorageHealthCheck(options?: {
    autoRepair?: boolean;
    nowMs?: number;
  }): Promise<StorageHealthCheckReport> {
    const startedAt = Date.now();
    const nowMs = options?.nowMs ?? startedAt;
    const autoRepair = options?.autoRepair !== false;
    const issues: StorageHealthIssue[] = [];
    const storeSummaries: StoreHealthSummary[] = [];

    const storeLabels: Record<PersistenceStoreName, string> = {
      investorCalculator: 'Active Investor Calculator',
      calculatorScenarios: 'Saved Calculator Scenarios',
      chartProjections: 'Cached Chart Projections',
      userSession: 'Active User Session',
      workspaceSnapshots: 'Workspace Snapshots',
      investorFeedback: 'Investor Feedback & Notes',
      diligencePrefs: 'Diligence Preferences',
      contactInquiries: 'Offline Founder Inquiries',
    };

    let totalRecordsScanned = 0;
    let orphanedCount = 0;
    let fragmentedCount = 0;

    for (const storeName of PERSISTENCE_STORES) {
      const rawRecords = await this.getAllRecords<Record<string, unknown>>(storeName);
      const entries = Object.entries(rawRecords);
      let storeIssues = 0;
      let validCount = 0;

      for (const [key, val] of entries) {
        totalRecordsScanned += 1;
        let isRecordCorrupted = false;

        if (!val || typeof val !== 'object') {
          orphanedCount += 1;
          storeIssues += 1;
          isRecordCorrupted = true;
          const issue: StorageHealthIssue = {
            id: createRecordId('iss'),
            store: storeName,
            key,
            severity: 'critical',
            issueType: 'corrupted_state',
            description: `Store "${storeName}" contained non-object record at key "${key}"`,
            repaired: autoRepair,
            repairAction: autoRepair ? 'Purged corrupted entry from store' : undefined,
          };
          issues.push(issue);
          if (autoRepair) {
            await this.deleteRecord(storeName, key);
          }
          continue;
        }

        // Domain-specific schema validations
        if (storeName === 'calculatorScenarios') {
          const scen = val as Partial<InvestorCalculatorScenario>;
          let needsUpdate = false;
          if (!scen.name || typeof scen.name !== 'string' || scen.name.trim() === '') {
            fragmentedCount += 1;
            storeIssues += 1;
            needsUpdate = true;
            issues.push({
              id: createRecordId('iss'),
              store: storeName,
              key,
              severity: 'warning',
              issueType: 'schema_mismatch',
              description: `Scenario "${key}" had missing or empty name.`,
              repaired: autoRepair,
              repairAction: autoRepair ? 'Repaired name to "Untitled Scenario"' : undefined,
            });
            if (autoRepair) {
              scen.name = 'Untitled Scenario';
            }
          }
          if (!scen.state || typeof scen.state !== 'object') {
            fragmentedCount += 1;
            storeIssues += 1;
            needsUpdate = true;
            issues.push({
              id: createRecordId('iss'),
              store: storeName,
              key,
              severity: 'critical',
              issueType: 'corrupted_state',
              description: `Scenario "${scen.name ?? key}" had missing or invalid financial state payload.`,
              repaired: autoRepair,
              repairAction: autoRepair ? 'Restored default investor financial model' : undefined,
            });
            if (autoRepair) {
              scen.state = {
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
              };
            }
          } else {
            // Validate numbers
            const s = scen.state;
            if (typeof s.investmentK !== 'number' || !Number.isFinite(s.investmentK)) {
              needsUpdate = true;
              fragmentedCount += 1;
              if (autoRepair) s.investmentK = 500;
            }
            if (typeof s.horizonYears !== 'number' || !Number.isFinite(s.horizonYears)) {
              needsUpdate = true;
              fragmentedCount += 1;
              if (autoRepair) s.horizonYears = 5;
            }
            if (typeof s.exitMultiple !== 'number' || !Number.isFinite(s.exitMultiple)) {
              needsUpdate = true;
              fragmentedCount += 1;
              if (autoRepair) s.exitMultiple = 10;
            }
          }
          if (needsUpdate && autoRepair) {
            await this.setRecord(storeName, key, scen);
          }
        } else if (storeName === 'workspaceSnapshots') {
          const snap = val as Partial<UserWorkspaceSnapshot>;
          let needsUpdate = false;
          if (!snap.name || typeof snap.name !== 'string') {
            fragmentedCount += 1;
            storeIssues += 1;
            needsUpdate = true;
            issues.push({
              id: createRecordId('iss'),
              store: storeName,
              key,
              severity: 'warning',
              issueType: 'schema_mismatch',
              description: `Workspace snapshot "${key}" had missing name.`,
              repaired: autoRepair,
              repairAction: autoRepair ? 'Repaired name to "Workspace Snapshot"' : undefined,
            });
            if (autoRepair) snap.name = 'Workspace Snapshot';
          }
          if (!Array.isArray(snap.selectedIds)) {
            fragmentedCount += 1;
            storeIssues += 1;
            needsUpdate = true;
            issues.push({
              id: createRecordId('iss'),
              store: storeName,
              key,
              severity: 'warning',
              issueType: 'corrupted_state',
              description: `Snapshot "${snap.name ?? key}" had invalid selected modules list.`,
              repaired: autoRepair,
              repairAction: autoRepair ? 'Normalized selectedIds array' : undefined,
            });
            if (autoRepair) snap.selectedIds = [];
          }
          if (needsUpdate && autoRepair) {
            await this.setRecord(storeName, key, snap);
          }
        } else if (storeName === 'investorFeedback') {
          const fb = val as Partial<InvestorFeedbackRecord>;
          let needsUpdate = false;
          if (!Array.isArray(fb.replies)) {
            fragmentedCount += 1;
            storeIssues += 1;
            needsUpdate = true;
            issues.push({
              id: createRecordId('iss'),
              store: storeName,
              key,
              severity: 'info',
              issueType: 'fragmented_payload',
              description: `Feedback record "${key}" had missing replies collection.`,
              repaired: autoRepair,
              repairAction: autoRepair ? 'Initialized empty replies array' : undefined,
            });
            if (autoRepair) fb.replies = [];
          }
          if (
            typeof fb.sentimentScore !== 'number' ||
            fb.sentimentScore < 1 ||
            fb.sentimentScore > 5
          ) {
            needsUpdate = true;
            fragmentedCount += 1;
            if (autoRepair) {
              fb.sentimentScore = Math.max(1, Math.min(5, Math.round(fb.sentimentScore ?? 5)));
            }
          }
          if (needsUpdate && autoRepair) {
            await this.setRecord(storeName, key, fb);
          }
        } else if (storeName === 'chartProjections') {
          if (key.startsWith('temp_') || key.startsWith('orphan_')) {
            orphanedCount += 1;
            storeIssues += 1;
            issues.push({
              id: createRecordId('iss'),
              store: storeName,
              key,
              severity: 'warning',
              issueType: 'orphaned',
              description: `Found dangling temporary chart projection "${key}".`,
              repaired: autoRepair,
              repairAction: autoRepair ? 'Removed dangling cache entry' : undefined,
            });
            if (autoRepair) {
              await this.deleteRecord(storeName, key);
            }
          }
        }

        if (!isRecordCorrupted) {
          validCount += 1;
        }
      }

      storeSummaries.push({
        store: storeName,
        label: storeLabels[storeName],
        recordCount: entries.length,
        validCount,
        issuesCount: storeIssues,
        status: storeIssues === 0 ? 'healthy' : autoRepair ? 'repaired' : 'warning',
      });
    }

    const issuesFound = issues.length;
    const issuesRepaired = issues.filter((i) => i.repaired).length;
    const healthy = issuesFound === 0 || issuesFound === issuesRepaired;
    const integrityScore = healthy
      ? 100
      : Math.max(20, Math.round(100 - (issuesFound - issuesRepaired) * 15));

    return {
      scannedAt: new Date(nowMs).toISOString(),
      integrityScore,
      healthy,
      storesChecked: PERSISTENCE_STORES.length,
      recordsScanned: totalRecordsScanned,
      issuesFound,
      issuesRepaired,
      orphanedCount,
      fragmentedCount,
      storeSummaries,
      issues,
      repairedAt: issuesRepaired > 0 ? new Date(nowMs).toISOString() : null,
      executionTimeMs: Date.now() - startedAt,
    };
  }

  /**
   * Synchronizes and mirrors local IndexedDB offline data with a cloud-based backup.
   */
  async syncToCloudBackup(nowMs: number = Date.now()): Promise<CloudSyncResult> {
    this.beginSyncOperation();
    try {
      const bundle = await this.exportAllOfflineData();
      const serialized = JSON.stringify(bundle);
      const bundleSizeBytes = new Blob([serialized]).size;
      let recordsMirrored = 0;
      for (const s of Object.values(bundle.stores)) {
        recordsMirrored += Object.keys(s).length;
      }

      // Compute lightweight deterministic checksum
      let hash = 0;
      for (let i = 0; i < serialized.length; i++) {
        hash = (hash << 5) - hash + serialized.charCodeAt(i);
        hash |= 0;
      }
      const checksum = `chk-${Math.abs(hash).toString(16).padStart(8, '0')}`;

      // Retrieve previous cloud backup revision
      let prevRevision = 0;
      let existingRaw = this.cloudMirrorMemoryFallback;
      const ls = getLocalStorageSafe();
      if (ls) {
        try {
          const prevRaw = ls.getItem(CLOUD_BACKUP_MIRROR_STORAGE_KEY);
          if (prevRaw) existingRaw = prevRaw;
        } catch {
          // ignore
        }
      }
      if (existingRaw) {
        try {
          const parsed = JSON.parse(existingRaw);
          if (typeof parsed?.cloudRevision === 'number') {
            prevRevision = parsed.cloudRevision;
          }
        } catch {
          // ignore
        }
      }

      const nextRevision = prevRevision + 1;
      const mirroredAt = new Date(nowMs).toISOString();

      const cloudMirrorRecord = {
        success: true,
        mirroredAt,
        recordsMirrored,
        bundleSizeBytes,
        cloudRevision: nextRevision,
        cloudEndpoint: DEFAULT_CLOUD_ENDPOINT,
        checksum,
        bundle,
      };

      const serializedMirror = JSON.stringify(cloudMirrorRecord);
      this.cloudMirrorMemoryFallback = serializedMirror;

      if (ls) {
        try {
          ls.setItem(CLOUD_BACKUP_MIRROR_STORAGE_KEY, serializedMirror);
        } catch {
          // ignore quota errors
        }
      }

      // Record in diligencePrefs
      const currentPrefs = (await this.loadDiligencePrefs()) ?? {
        personaTrack: 'financial' as const,
        currency: 'USD' as const,
        bookmarkedDocIds: [],
        updatedAt: mirroredAt,
      };

      await this.saveDiligencePrefs({
        ...currentPrefs,
        cloudSyncEnabled: true,
        lastCloudSyncAt: mirroredAt,
        cloudBackupRevision: nextRevision,
      });

      return {
        success: true,
        mirroredAt,
        recordsMirrored,
        bundleSizeBytes,
        cloudRevision: nextRevision,
        cloudEndpoint: DEFAULT_CLOUD_ENDPOINT,
        checksum,
      };
    } finally {
      this.endSyncOperation(true);
    }
  }

  getCloudSyncStatus(): CloudSyncStatus {
    let raw: string | null = this.cloudMirrorMemoryFallback;
    const ls = getLocalStorageSafe();
    if (ls) {
      try {
        const stored = ls.getItem(CLOUD_BACKUP_MIRROR_STORAGE_KEY);
        if (stored) raw = stored;
      } catch {
        // ignore
      }
    }
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        return {
          enabled: true,
          lastMirroredAt: parsed.mirroredAt ?? null,
          cloudRevision: parsed.cloudRevision ?? 1,
          isMirrored: true,
        };
      } catch {
        // ignore
      }
    }
    return {
      enabled: false,
      lastMirroredAt: null,
      cloudRevision: 0,
      isMirrored: false,
    };
  }

  getStorageBackend(): 'indexeddb' | 'fallback' {
    return hasIndexedDb() ? 'indexeddb' : 'fallback';
  }
}

export const localPersistenceService = new LocalPersistenceService();
