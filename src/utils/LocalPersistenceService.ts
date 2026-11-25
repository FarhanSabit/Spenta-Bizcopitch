export type PersistenceStoreName = 'investorCalculator' | 'chartProjections' | 'userSession';

export const PERSISTENCE_DB_NAME = 'spenta_sovereign_offline_db';
export const PERSISTENCE_DB_VERSION = 1;
export const PERSISTENCE_STORES: readonly PersistenceStoreName[] = [
  'investorCalculator',
  'chartProjections',
  'userSession',
] as const;

export const DEFAULT_CALCULATOR_KEY = 'active_investor_calculator';
export const DEFAULT_SESSION_KEY = 'active_user_session';

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
  savedProposalsCount: number;
  neuralCoreSystem?: string;
  updatedAt: string;
}

export interface OfflinePersistenceBundle {
  schemaVersion: number;
  exportedAt: string;
  stores: {
    investorCalculator: Record<string, unknown>;
    chartProjections: Record<string, unknown>;
    userSession: Record<string, unknown>;
  };
}

interface StoredRow<T = unknown> {
  id: string;
  value: T;
  updatedAt: string;
}

const FALLBACK_STORAGE_PREFIX = 'spenta_idb_fallback_v1:';

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

/**
 * Offline-first IndexedDB persistence engine for Spenta Sovereign OS.
 * Persists Investor ROI Calculator state, computed chart projection snapshots,
 * and user session metadata locally with zero server dependency.
 * Automatically falls back to localStorage / in-memory storage when IndexedDB
 * is unavailable (e.g., restricted iframes or headless test environments).
 */
export class LocalPersistenceService {
  private readonly dbName: string;
  private readonly dbVersion: number;
  private dbPromise: Promise<IDBDatabase | null> | null = null;
  private readonly memoryFallback: Record<PersistenceStoreName, Map<string, StoredRow>> = {
    investorCalculator: new Map(),
    chartProjections: new Map(),
    userSession: new Map(),
  };

  constructor(dbName = PERSISTENCE_DB_NAME, dbVersion = PERSISTENCE_DB_VERSION) {
    this.dbName = dbName;
    this.dbVersion = dbVersion;
  }

  private openDatabase(): Promise<IDBDatabase | null> {
    if (!hasIndexedDb()) {
      return Promise.resolve(null);
    }
    if (this.dbPromise) {
      return this.dbPromise;
    }

    this.dbPromise = new Promise<IDBDatabase | null>((resolve) => {
      try {
        const request = indexedDB.open(this.dbName, this.dbVersion);

        request.onupgradeneeded = () => {
          const db = request.result;
          for (const storeName of PERSISTENCE_STORES) {
            if (!db.objectStoreNames.contains(storeName)) {
              db.createObjectStore(storeName, { keyPath: 'id' });
            }
          }
        };

        request.onsuccess = () => {
          const db = request.result;
          db.onversionchange = () => {
            db.close();
            this.dbPromise = null;
          };
          resolve(db);
        };

        request.onerror = () => {
          this.dbPromise = null;
          resolve(null);
        };

        request.onblocked = () => {
          resolve(null);
        };
      } catch {
        this.dbPromise = null;
        resolve(null);
      }
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

    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(store, 'readwrite');
        tx.objectStore(store).put(row);
        tx.oncomplete = () => resolve();
        tx.onerror = () => {
          this.writeFallback(store, key, row);
          resolve();
        };
        tx.onabort = () => {
          this.writeFallback(store, key, row);
          resolve();
        };
      } catch {
        this.writeFallback(store, key, row);
        resolve();
      }
    });
  }

  async getRecord<T>(store: PersistenceStoreName, key: string): Promise<T | null> {
    const db = await this.openDatabase();
    if (!db) {
      const row = this.readFallback<T>(store, key);
      return row ? row.value : null;
    }

    return new Promise<T | null>((resolve) => {
      try {
        const tx = db.transaction(store, 'readonly');
        const req = tx.objectStore(store).get(key);
        req.onsuccess = () => {
          const row = req.result as StoredRow<T> | undefined;
          if (row && 'value' in row) {
            resolve(row.value);
            return;
          }
          const fallback = this.readFallback<T>(store, key);
          resolve(fallback ? fallback.value : null);
        };
        req.onerror = () => {
          const fallback = this.readFallback<T>(store, key);
          resolve(fallback ? fallback.value : null);
        };
      } catch {
        const fallback = this.readFallback<T>(store, key);
        resolve(fallback ? fallback.value : null);
      }
    });
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

    return new Promise<Record<string, T>>((resolve) => {
      try {
        const tx = db.transaction(store, 'readonly');
        const req = tx.objectStore(store).getAll();
        req.onsuccess = () => {
          const rows = (req.result as StoredRow<T>[]) || [];
          const out: Record<string, T> = {};
          for (const row of rows) {
            if (row && typeof row.id === 'string') {
              out[row.id] = row.value;
            }
          }
          resolve(out);
        };
        req.onerror = () => {
          const rows = this.listFallback(store);
          const out: Record<string, T> = {};
          for (const row of rows) {
            out[row.id] = row.value as T;
          }
          resolve(out);
        };
      } catch {
        const rows = this.listFallback(store);
        const out: Record<string, T> = {};
        for (const row of rows) {
          out[row.id] = row.value as T;
        }
        resolve(out);
      }
    });
  }

  async deleteRecord(store: PersistenceStoreName, key: string): Promise<void> {
    this.deleteFallback(store, key);
    const db = await this.openDatabase();
    if (!db) return;

    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(store, 'readwrite');
        tx.objectStore(store).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

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

  async exportAllOfflineData(): Promise<OfflinePersistenceBundle> {
    const [investorCalculator, chartProjections, userSession] = await Promise.all([
      this.getAllRecords('investorCalculator'),
      this.getAllRecords('chartProjections'),
      this.getAllRecords('userSession'),
    ]);

    return {
      schemaVersion: this.dbVersion,
      exportedAt: new Date().toISOString(),
      stores: {
        investorCalculator,
        chartProjections,
        userSession,
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
    for (const storeName of PERSISTENCE_STORES) {
      this.memoryFallback[storeName].clear();
    }

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
    if (!db) return;

    await Promise.all(
      PERSISTENCE_STORES.map(
        (storeName) =>
          new Promise<void>((resolve) => {
            try {
              const tx = db.transaction(storeName, 'readwrite');
              tx.objectStore(storeName).clear();
              tx.oncomplete = () => resolve();
              tx.onerror = () => resolve();
            } catch {
              resolve();
            }
          }),
      ),
    );
  }

  getStorageBackend(): 'indexeddb' | 'fallback' {
    return hasIndexedDb() ? 'indexeddb' : 'fallback';
  }
}

export const localPersistenceService = new LocalPersistenceService();
