import type {
  InvestorCalculatorScenario,
  UserWorkspaceSnapshot,
} from './LocalPersistenceService';

export interface CsvExportableStoredItem {
  kind: 'scenario' | 'snapshot';
  id: string;
  name: string;
  typeLabel: 'Scenario' | 'Snapshot';
  details: string;
  estimatedBytes: number;
  createdAt: string;
  updatedAt: string;
  scenarioRecord?: InvestorCalculatorScenario;
  snapshotRecord?: UserWorkspaceSnapshot;
}

export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export const STORED_ITEMS_CSV_HEADERS = [
  'Record_ID',
  'Item_Name',
  'Item_Type',
  'Scenario_Model',
  'Growth_Mode',
  'Investment_USD_K',
  'Horizon_Years',
  'Exit_Multiple',
  'Dilution_Pct',
  'Tax_Rate_Pct',
  'FX_Rate_BDT',
  'Active_Workspace_Tab',
  'Selected_Modules_Count',
  'Deployment_Target',
  'HITL_Confidence',
  'Estimated_Size_Bytes',
  'Created_At',
  'Updated_At',
  'Summary_Details',
] as const;

export function buildStoredItemsCsv(
  items: CsvExportableStoredItem[],
  options?: { includeBom?: boolean },
): string {
  const rows: string[] = [STORED_ITEMS_CSV_HEADERS.join(',')];

  for (const item of items) {
    const calcState =
      item.kind === 'scenario'
        ? item.scenarioRecord?.state
        : item.snapshotRecord?.calculatorState;
    const snap = item.snapshotRecord;

    const cells: unknown[] = [
      item.id,
      item.name,
      item.typeLabel,
      calcState?.scenario ?? '',
      calcState?.growthMode ?? '',
      calcState?.investmentK ?? '',
      calcState?.horizonYears ?? '',
      calcState?.exitMultiple ?? '',
      calcState?.dilutionPct ?? '',
      calcState?.taxRate ?? '',
      calcState?.fxRate ?? '',
      snap ? snap.activeTab : 'Investor Calculator',
      snap ? snap.selectedIds.length : '',
      snap ? snap.deploymentTarget : '',
      snap ? snap.hitlConfidence : '',
      item.estimatedBytes,
      item.createdAt,
      item.updatedAt,
      item.details,
    ];

    rows.push(cells.map(escapeCsvCell).join(','));
  }

  const csvBody = rows.join('\r\n');
  return options?.includeBom ? `\uFEFF${csvBody}` : csvBody;
}
