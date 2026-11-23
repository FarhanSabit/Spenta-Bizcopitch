import React, { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ArrowUpDown,
  Calculator,
  Check,
  Copy,
  Download,
  FileText,
  MapPin,
  Plus,
  Printer,
  ShieldCheck,
  SlidersHorizontal,
  TrendingUp,
  X,
} from 'lucide-react';
import {
  FINANCIAL_TRAJECTORY,
  SERVER_TIERS,
  SPENTA_APPS,
  SPENTA_LOGO_URL,
} from '../data/spentaManifest';
import { computeProductRoi } from '../data/roiModel';
import { useStack } from '../store/StackContext';
import {
  QuarterRow,
  QuarterlyExecutiveSummaryData,
  exportQuarterlySummaryToPdf,
} from '../utils/exportQuarterlySummaryPdf';
import { copyTextWithFallback } from '../utils/shareUrlCodec';
import { RoiRevenueModeler } from './RoiRevenueModeler';
import { RegionalMarketMapsView } from './RegionalMarketMapsView';

type ScenarioMode = 'conservative' | 'upside';
type SortField = 'gmPct' | 'setupUsd' | 'minServerTier' | 'name';
type QuarterKey = 'Q1' | 'Q2' | 'Q3' | 'Q4';
type FinancialsSubTab = 'pnl' | 'roi' | 'maps';

const QUARTER_WEIGHTS: { quarter: QuarterKey; weight: number }[] = [
  { quarter: 'Q1', weight: 0.21 },
  { quarter: 'Q2', weight: 0.24 },
  { quarter: 'Q3', weight: 0.26 },
  { quarter: 'Q4', weight: 0.29 },
];

function formatCompactUsdK(valK: number): string {
  if (valK >= 1000) return `$${(valK / 1000).toFixed(2)}M`;
  return `$${valK.toFixed(1)}K`;
}

export function FinancialsView() {
  const { theme, selectedIds, selectedApps, stackMetrics, toggleApp } = useStack();
  const [scenario, setScenario] = useState<ScenarioMode>('conservative');
  const [fxRate, setFxRate] = useState<number>(120);
  const [taxRate, setTaxRate] = useState<number>(25);
  const [exitMultiple, setExitMultiple] = useState<number>(10);
  const [dilutionPct, setDilutionPct] = useState<number>(0);
  const [sortField, setSortField] = useState<SortField>('gmPct');
  const [sortAsc, setSortAsc] = useState<boolean>(false);
  const [subTab, setSubTab] = useState<FinancialsSubTab>('pnl');
  const [roiInitialAppId, setRoiInitialAppId] = useState<string>(SPENTA_APPS[0].id);

  const [summaryOpen, setSummaryOpen] = useState<boolean>(false);
  const [summaryYearIndex, setSummaryYearIndex] = useState<number>(0);
  const [summaryQuarter, setSummaryQuarter] = useState<QuarterKey>('Q4');
  const [copiedSummary, setCopiedSummary] = useState<boolean>(false);

  const isDark = theme === 'dark';

  useEffect(() => {
    if (!summaryOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSummaryOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [summaryOpen]);

  const modeledSeries = useMemo(() => {
    const baseBdtBurnRatio = 0.65;
    const fxDeltaFactor = 120 / fxRate - 1;

    let cumEbitda = 0;
    let cumNet = 0;

    return FINANCIAL_TRAJECTORY.map((row) => {
      const revK = scenario === 'conservative' ? row.conservativeRevK : row.upsideRevK;
      const baseEbitdaK = scenario === 'conservative' ? row.conservativeEbitdaK : row.upsideEbitdaK;
      const impliedOpexK = revK - baseEbitdaK;
      const fxCostAdjustmentK = impliedOpexK * baseBdtBurnRatio * fxDeltaFactor;
      const ebitdaK = Math.max(0, Number((baseEbitdaK - fxCostAdjustmentK).toFixed(1)));
      const netProfitK = Number((ebitdaK * (1 - taxRate / 100)).toFixed(1));

      cumEbitda += ebitdaK;
      cumNet += netProfitK;

      return {
        ...row,
        revK,
        ebitdaK,
        netProfitK,
        cumEbitdaK: Number(cumEbitda.toFixed(1)),
        cumNetK: Number(cumNet.toFixed(1)),
        capitalEfficiencyMultiple: Number((cumNet / 500).toFixed(2)),
      };
    });
  }, [scenario, fxRate, taxRate]);

  const y1 = modeledSeries[0];
  const y4 = modeledSeries[3];
  const y5 = modeledSeries[4];
  const dhakaY1UsdK = Number((64800 / fxRate).toFixed(1));
  const dhakaLoadedHourlyUsd = Number(((dhakaY1UsdK * 1000) / 41600).toFixed(2));
  // $500K SAFE at $4.5M post-money cap = 11.11% pre-dilution; adjusted for subsequent round dilution
  const preDilutionOwnership = 500 / 4500;
  const effectiveOwnership = preDilutionOwnership * (1 - dilutionPct / 100);
  const effectiveOwnershipPct = Number((effectiveOwnership * 100).toFixed(2));
  const impliedExitEvM = Number(((y5.ebitdaK * exitMultiple) / 1000).toFixed(2));
  const safeExitProceedsM = Number(((y5.ebitdaK * exitMultiple * effectiveOwnership) / 1000).toFixed(2));
  const safeEquityRoiMultiple = Number(
    ((y5.ebitdaK * exitMultiple * effectiveOwnership) / 500).toFixed(2),
  );
  const safeRoiAt10xPreDil = Number(((y5.ebitdaK * 10 * preDilutionOwnership) / 500).toFixed(2));
  const safeRoiAt10xSeriesA = Number(
    ((y5.ebitdaK * 10 * preDilutionOwnership * 0.8) / 500).toFixed(2),
  );
  const safeRoiAt15xPreDil = Number(((y5.ebitdaK * 15 * preDilutionOwnership) / 500).toFixed(2));

  const summaryData = useMemo<QuarterlyExecutiveSummaryData>(() => {
    const activeRow = modeledSeries[summaryYearIndex] ?? modeledSeries[0];
    const quarters: QuarterRow[] = QUARTER_WEIGHTS.map(({ quarter, weight }) => {
      const revK = Number((activeRow.revK * weight).toFixed(1));
      const ebitdaK = Number((activeRow.ebitdaK * weight).toFixed(1));
      const netProfitK = Number((activeRow.netProfitK * weight).toFixed(1));
      const ebitdaMarginPct = revK > 0 ? Number(((ebitdaK / revK) * 100).toFixed(1)) : 0;
      return {
        quarter,
        weightPct: Math.round(weight * 100),
        revK,
        ebitdaK,
        netProfitK,
        ebitdaMarginPct,
      };
    });

    const selectedQuarterRow =
      quarters.find((q) => q.quarter === summaryQuarter) ?? quarters[3];
    const tierSpec = SERVER_TIERS[stackMetrics.tier];

    return {
      fiscalYear: activeRow.year,
      fiscalLabel: activeRow.label,
      quarter: summaryQuarter,
      scenarioLabel:
        scenario === 'conservative'
          ? 'Conservative Base (~0.5825x 5Y avg)'
          : 'Healthcare Upside ($4.80M Y3)',
      fxRate,
      taxRate,
      dhakaY1UsdK,
      annualRevK: activeRow.revK,
      annualEbitdaK: activeRow.ebitdaK,
      annualNetProfitK: activeRow.netProfitK,
      cumNetK: activeRow.cumNetK,
      capitalEfficiencyMultiple: activeRow.capitalEfficiencyMultiple,
      fiveYearCapitalEfficiency: y5.capitalEfficiencyMultiple,
      fiveYearCumNetM: Number((y5.cumNetK / 1000).toFixed(3)),
      exitEbitdaMultiple: exitMultiple,
      dilutionPct,
      effectiveOwnershipPct,
      safeEquityRoiMultiple,
      impliedExitEvM,
      milestone: scenario === 'conservative' ? activeRow.milestone : activeRow.upsideMilestone,
      quarters,
      selectedQuarterRow,
      stackModuleCount: selectedApps.length,
      stackModuleNames: selectedApps.map((a) => a.shortName),
      stackSetupUsd: stackMetrics.oneTimeBuildUsd,
      stackQuarterlyRetainerUsd: stackMetrics.quarterlyRetainerUsd,
      stackBlendedGmPct: stackMetrics.blendedGmPct,
      recommendedTierCode: tierSpec.code,
      recommendedTierName: tierSpec.name,
      recommendedTierCapex: tierSpec.capex,
      generatedAtLabel: new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
      }),
    };
  }, [
    modeledSeries,
    summaryYearIndex,
    summaryQuarter,
    scenario,
    fxRate,
    taxRate,
    dhakaY1UsdK,
    y5,
    exitMultiple,
    dilutionPct,
    effectiveOwnershipPct,
    safeEquityRoiMultiple,
    impliedExitEvM,
    selectedApps,
    stackMetrics,
  ]);

  const handleCopySummaryText = async () => {
    const q = summaryData.selectedQuarterRow;
    const text = [
      `SPENTA SOVEREIGN OS — ${summaryData.quarter} ${summaryData.fiscalYear} (${summaryData.fiscalLabel}) EXECUTIVE SUMMARY`,
      '========================================================================',
      `Scenario: ${summaryData.scenarioLabel} | FX: ${summaryData.fxRate} BDT/USD | Tax: ${summaryData.taxRate.toFixed(1)}% | Dilution: ${dilutionPct}%`,
      '',
      `[${summaryData.quarter} ${summaryData.fiscalYear} HEADLINE PERFORMANCE — ${q.weightPct}% ANNUAL SHARE]`,
      `  • Quarterly Revenue:   ${formatCompactUsdK(q.revK)} (Annualized Run-Rate: ${formatCompactUsdK(q.revK * 4)}/yr)`,
      `  • Quarterly EBITDA:    ${formatCompactUsdK(q.ebitdaK)} (${q.ebitdaMarginPct.toFixed(1)}% margin)`,
      `  • Quarterly Net Profit:${formatCompactUsdK(q.netProfitK)} (after ${summaryData.taxRate.toFixed(1)}% corp. tax)`,
      `  • Modeled SAFE Exit:   ${summaryData.safeEquityRoiMultiple.toFixed(2)}x at ${summaryData.exitEbitdaMultiple}x Y5 EBITDA (EV $${summaryData.impliedExitEvM.toFixed(2)}M · ${effectiveOwnershipPct.toFixed(2)}% ownership)`,
      `  • Capital Efficiency:  ${summaryData.capitalEfficiencyMultiple.toFixed(2)}x through ${summaryData.fiscalYear} (5-Yr Cum. Net / $500K: ${summaryData.fiveYearCapitalEfficiency.toFixed(2)}x — company operating metric)`,
      '',
      `[FULL-YEAR ${summaryData.fiscalYear} RECONCILIATION]`,
      `  • Revenue: ${formatCompactUsdK(summaryData.annualRevK)} | EBITDA: ${formatCompactUsdK(summaryData.annualEbitdaK)} | Net Profit: ${formatCompactUsdK(summaryData.annualNetProfitK)}`,
      `  • 20-FTE Dhaka Hub (64.8M BDT): $${summaryData.dhakaY1UsdK}K/yr`,
      `  • Operating Milestone: ${summaryData.milestone}`,
      '',
      `[COMPOSED STACK CONTEXT]`,
      `  • Modules (${summaryData.stackModuleCount}/13): ${summaryData.stackModuleNames.join(', ') || 'None selected'}`,
      `  • One-Time Build: $${(summaryData.stackSetupUsd / 1000).toFixed(1)}K${
        summaryData.stackQuarterlyRetainerUsd && summaryData.stackQuarterlyRetainerUsd > 0
          ? ` + $${(summaryData.stackQuarterlyRetainerUsd / 1000).toFixed(1)}K/qtr retainers`
          : ''
      } | Rev-Weighted GM (Y1): ${summaryData.stackBlendedGmPct.toFixed(1)}% | Hardware: ${summaryData.recommendedTierCode} (${summaryData.recommendedTierCapex})`,
      '',
      'Spenta Technology (spenta.tech) · hello@spenta.tech',
    ].join('\n');

    const ok = await copyTextWithFallback(text);
    if (ok) {
      setCopiedSummary(true);
      window.setTimeout(() => setCopiedSummary(false), 2200);
    }
  };

  const sortedApps = useMemo(() => {
    return [...SPENTA_APPS].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'name') cmp = a.name.localeCompare(b.name);
      else cmp = a[sortField] - b[sortField];
      return sortAsc ? cmp : -cmp;
    });
  }, [sortField, sortAsc]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc((v) => !v);
    } else {
      setSortField(field);
      setSortAsc(field === 'name' || field === 'minServerTier');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <section className="rounded-2xl border border-[#E4DFD6] dark:border-[#232B4A] bg-white dark:bg-[#141A32] p-5 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div>
          <div className="text-[11px] font-mono uppercase tracking-[0.14em] text-[#1C6E46] dark:text-[#6FCB9F]">
            RECONCILED 5-YEAR MODEL (FY2027–FY2031) · $500K POST-MONEY SAFE ($4.5M CAP · 20% DISC.)
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-[#16213A] dark:text-[#E7EBF5] tracking-tight mt-1">
            Financials — P&amp;L Trajectory, 13-Product ROI &amp; Regional Market Intelligence
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 self-start xl:self-auto">
          {subTab === 'pnl' && (
            <div className="inline-flex flex-wrap rounded-xl bg-[#F2EFE9] dark:bg-[#0F1529] p-1 border border-[#E4DFD6] dark:border-[#232B4A]">
              <button
                type="button"
                onClick={() => setScenario('conservative')}
                className={`px-3 py-2 sm:py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                  scenario === 'conservative'
                    ? 'bg-[#1F3863] text-white dark:bg-[#8FA6E8] dark:text-[#0B1020]'
                    : 'text-[#5F6576] dark:text-[#8E96B0] hover:text-[#16213A] dark:hover:text-[#E7EBF5]'
                }`}
              >
                Conservative Base (~0.5825×)
              </button>
              <button
                type="button"
                onClick={() => setScenario('upside')}
                className={`px-3 py-2 sm:py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                  scenario === 'upside'
                    ? 'bg-[#1C6E46] text-white dark:bg-[#6FCB9F] dark:text-[#0B1020]'
                    : 'text-[#5F6576] dark:text-[#8E96B0] hover:text-[#16213A] dark:hover:text-[#E7EBF5]'
                }`}
              >
                Healthcare Upside ($4.80M Y3)
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => setSummaryOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 sm:py-2 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-white text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5" strokeWidth={1.75} />
            <span>Quick Generate</span>
          </button>
        </div>
      </section>

      {/* Financials Workspace Sub-Tab Bar */}
      <nav
        aria-label="Financials workspace views"
        className="flex flex-wrap items-center gap-2 border-b border-[#E4DFD6] dark:border-[#232B4A] pb-3"
      >
        {(
          [
            { id: 'pnl', label: 'P&L & Trajectory', icon: TrendingUp },
            { id: 'roi', label: '13-Product ROI & Revenue Scopes', icon: Calculator },
            { id: 'maps', label: 'Market & Regional Hubs (Maps)', icon: MapPin },
          ] as const
        ).map(({ id, label, icon: Icon }) => {
          const active = subTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setSubTab(id)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                active
                  ? 'bg-[#1F3863] text-white dark:bg-[#8FA6E8] dark:text-[#0B1020]'
                  : 'bg-white dark:bg-[#141A32] text-[#4A5568] dark:text-[#C8D0E4] border border-[#E4DFD6] dark:border-[#232B4A] hover:border-[#1C6E46] dark:hover:border-[#6FCB9F]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" strokeWidth={1.75} />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>

      {subTab === 'roi' && <RoiRevenueModeler key={roiInitialAppId} initialAppId={roiInitialAppId} />}

      {subTab === 'maps' && <RegionalMarketMapsView />}

      {subTab === 'pnl' && (
        <>
      {/* Monospace KPI Strip */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="rounded-2xl p-5 bg-[#1F3863] dark:bg-[#141A32] text-white border border-[#1F3863] dark:border-[#6FCB9F]/40">
          <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-[#A7E6C6] dark:text-[#6FCB9F]">
            Capital Ask · {dilutionPct === 0 ? 'Post-Money Cap' : `${dilutionPct}% Post-Seed Dil.`}
          </div>
          <div className="font-mono text-2xl sm:text-3xl font-extrabold mt-1 tabular-nums">
            $500K SAFE
          </div>
          <div className="text-xs text-[#C6D2EE] dark:text-[#8E96B0] font-mono mt-1 tabular-nums">
            $4.5M Post-Cap ({effectiveOwnershipPct.toFixed(2)}% eff.) · 20% Disc.
          </div>
        </div>

        <div className="rounded-2xl p-5 bg-white dark:bg-[#141A32] border border-[#1C6E46]/35 dark:border-[#6FCB9F]/35">
          <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-[#1C6E46] dark:text-[#6FCB9F]">
            Investor SAFE Equity ROI ({exitMultiple}× EV)
          </div>
          <div className="font-mono text-2xl sm:text-3xl font-extrabold text-[#1C6E46] dark:text-[#6FCB9F] mt-1 tabular-nums">
            {safeEquityRoiMultiple.toFixed(2)}×
          </div>
          <div className="text-xs text-[#4A5568] dark:text-[#8E96B0] font-mono mt-1 tabular-nums">
            ${safeExitProceedsM.toFixed(2)}M proceeds · EV ${impliedExitEvM.toFixed(2)}M
          </div>
        </div>

        <div className="rounded-2xl p-5 bg-white dark:bg-[#141A32] border border-[#E4DFD6] dark:border-[#232B4A]">
          <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-[#5F6576] dark:text-[#8E96B0]">
            Operating Capital Efficiency (Co. Net ÷ $500K)
          </div>
          <div className="font-mono text-2xl sm:text-3xl font-extrabold text-[#16213A] dark:text-[#E7EBF5] mt-1 tabular-nums">
            {y5.capitalEfficiencyMultiple.toFixed(2)}×
          </div>
          <div className="text-xs text-[#4A5568] dark:text-[#8E96B0] font-mono mt-1 tabular-nums">
            Company Cum. Net ${(y5.cumNetK / 1000).toFixed(3)}M · Y4: {y4.capitalEfficiencyMultiple.toFixed(2)}×
          </div>
        </div>

        <div className="rounded-2xl p-5 bg-white dark:bg-[#141A32] border border-[#E4DFD6] dark:border-[#232B4A]">
          <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-[#5F6576] dark:text-[#8E96B0]">
            FY2031 (Y5) Revenue &amp; Client ROI
          </div>
          <div className="font-mono text-2xl sm:text-3xl font-extrabold text-[#16213A] dark:text-[#E7EBF5] mt-1 tabular-nums">
            ${(y5.revK / 1000).toFixed(2)}M
          </div>
          <div className="text-xs text-[#4A5568] dark:text-[#8E96B0] font-mono mt-1 tabular-nums">
            Y1: ${y1.revK}K · Client ROI 250–350% (Bank: 450%+)
          </div>
        </div>
      </section>

      {/* Main Chart + Live FX, Tax & Exit Sensitivity Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <section className="lg:col-span-8 min-w-0 rounded-2xl border border-[#E4DFD6] dark:border-[#232B4A] bg-white dark:bg-[#141A32] p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div className="inline-flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[#1C6E46] dark:text-[#6FCB9F]" strokeWidth={1.5} />
              <h2 className="font-bold text-sm sm:text-base text-[#16213A] dark:text-[#E7EBF5]">
                FY2027–FY2031 Revenue, EBITDA &amp; Net Profit ($K USD)
              </h2>
            </div>
            <span className="text-xs font-mono text-[#5F6576] dark:text-[#8E96B0] tabular-nums">
              FX: {fxRate} BDT/USD · Tax: {taxRate.toFixed(1)}% · Exit: {exitMultiple}× · Dil: {dilutionPct}%
            </span>
          </div>

          <div className="h-[250px] sm:h-[320px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={modeledSeries} margin={{ top: 10, right: 14, left: 2, bottom: 8 }}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke={isDark ? '#232B4A' : '#E4DFD6'}
                  vertical={false}
                />
                <XAxis
                  dataKey="year"
                  tick={{
                    fontSize: 11,
                    fontFamily: 'JetBrains Mono, monospace',
                    fill: isDark ? '#8E96B0' : '#5F6576',
                  }}
                  axisLine={{ stroke: isDark ? '#232B4A' : '#E4DFD6' }}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(v) => `$${v >= 1000 ? `${(v / 1000).toFixed(1)}M` : `${v}K`}`}
                  tick={{
                    fontSize: 11,
                    fontFamily: 'JetBrains Mono, monospace',
                    fill: isDark ? '#8E96B0' : '#5F6576',
                  }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(value: unknown, name: unknown) => [
                    `$${Number(value).toLocaleString()}K`,
                    String(name),
                  ]}
                  contentStyle={{
                    borderRadius: '10px',
                    backgroundColor: isDark ? '#141A32' : '#FFFFFF',
                    border: isDark ? '1px solid #232B4A' : '1px solid #E4DFD6',
                    color: isDark ? '#E7EBF5' : '#16213A',
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: '12px',
                  }}
                  itemStyle={{ color: isDark ? '#E7EBF5' : '#16213A' }}
                />
                <Legend
                  wrapperStyle={{
                    fontSize: '11px',
                    fontFamily: 'JetBrains Mono, monospace',
                    color: isDark ? '#8E96B0' : '#5F6576',
                  }}
                />
                <Bar
                  dataKey="revK"
                  name="Revenue ($K)"
                  fill={isDark ? '#8FA6E8' : '#1F3863'}
                  radius={[5, 5, 0, 0]}
                  barSize={34}
                />
                <Line
                  type="monotone"
                  dataKey="ebitdaK"
                  name="EBITDA ($K)"
                  stroke={isDark ? '#38BDF8' : '#0D9488'}
                  strokeWidth={2.5}
                  dot={{ r: 3.5, fill: isDark ? '#38BDF8' : '#0D9488' }}
                />
                <Line
                  type="monotone"
                  dataKey="netProfitK"
                  name="Net Profit ($K)"
                  stroke={isDark ? '#6FCB9F' : '#1C6E46'}
                  strokeWidth={2.5}
                  dot={{ r: 3.5, fill: isDark ? '#6FCB9F' : '#1C6E46' }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-4 pt-4 border-t border-[#E4DFD6] dark:border-[#232B4A] overflow-x-auto">
            <table className="w-full min-w-[520px] text-left font-mono text-xs tabular-nums">
              <thead>
                <tr className="text-[#5F6576] dark:text-[#8E96B0] border-b border-[#E4DFD6] dark:border-[#232B4A]">
                  <th className="py-2 pr-3">Fiscal Year</th>
                  <th className="py-2 px-3 text-right">Revenue</th>
                  <th className="py-2 px-3 text-right">EBITDA</th>
                  <th className="py-2 px-3 text-right">Net Profit</th>
                  <th className="py-2 pl-3 text-right">Capital Eff.</th>
                </tr>
              </thead>
              <tbody>
                {modeledSeries.map((r) => (
                  <tr
                    key={r.year}
                    className="border-b border-[#EFEBE3] dark:border-[#1E2642] last:border-0"
                  >
                    <td className="py-2 pr-3 font-bold text-[#16213A] dark:text-[#E7EBF5]">
                      {r.year}{' '}
                      <span className="text-[#7D8599] dark:text-[#707B9C] font-normal">({r.label})</span>
                    </td>
                    <td className="py-2 px-3 text-right text-[#334155] dark:text-[#C9D2E6]">
                      ${r.revK.toLocaleString()}K
                    </td>
                    <td className="py-2 px-3 text-right text-[#0D9488] dark:text-sky-400">
                      ${r.ebitdaK.toLocaleString()}K
                    </td>
                    <td className="py-2 px-3 text-right text-[#1C6E46] dark:text-[#6FCB9F] font-semibold">
                      ${r.netProfitK.toLocaleString()}K
                    </td>
                    <td className="py-2 pl-3 text-right font-bold text-[#16213A] dark:text-[#E7EBF5]">
                      {r.capitalEfficiencyMultiple.toFixed(2)}×
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2.5 text-[11px] font-mono text-[#5F6576] dark:text-[#8E96B0] leading-relaxed">
            Audit Separation: <strong className="text-[#16213A] dark:text-[#E7EBF5]">Capital Eff.</strong> = Cumulative Company Net Profit ÷ $500K Raised (company productivity, not investor cash-out).{' '}
            <strong className="text-[#1C6E46] dark:text-[#6FCB9F]">SAFE Equity ROI</strong> = (Y5 EBITDA × {exitMultiple}× EV × {effectiveOwnershipPct.toFixed(2)}% ownership) ÷ $500K ={' '}
            <strong className="text-[#1C6E46] dark:text-[#6FCB9F]">{safeEquityRoiMultiple.toFixed(2)}×</strong>.
          </p>
        </section>

        {/* Live Sensitivity Controls */}
        <section className="lg:col-span-4 min-w-0 rounded-2xl border border-[#E4DFD6] dark:border-[#232B4A] bg-white dark:bg-[#141A32] p-4 sm:p-5 flex flex-col justify-between gap-4">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 text-[11px] font-mono font-bold uppercase tracking-wider text-[#1C6E46] dark:text-[#6FCB9F]">
              <SlidersHorizontal className="w-3.5 h-3.5" strokeWidth={1.5} />
              <span>FX, Tax &amp; Exit Multiple Stress Test</span>
            </div>

            <div className="rounded-xl bg-[#FAF8F4] dark:bg-[#0F1529] border border-[#E4DFD6] dark:border-[#232B4A] p-3.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-semibold text-[#16213A] dark:text-[#E7EBF5]">
                  BDT / USD Exchange Rate
                </span>
                <span className="font-mono text-base sm:text-lg font-extrabold text-[#16213A] dark:text-[#E7EBF5] tabular-nums">
                  {fxRate} BDT
                </span>
              </div>
              <input
                type="range"
                min={115}
                max={130}
                step={1}
                value={fxRate}
                onChange={(e) => setFxRate(Number(e.target.value))}
                aria-label="BDT per USD exchange rate"
                className="w-full spenta-slider mt-2.5"
              />
              <div className="flex justify-between text-[10px] font-mono text-[#5F6576] dark:text-[#8E96B0] mt-1">
                <span>115 BDT</span>
                <span className="font-bold text-[#1C6E46] dark:text-[#6FCB9F]">120 Base</span>
                <span>130 BDT</span>
              </div>
              <div className="mt-2 text-[11px] font-mono text-[#4A5568] dark:text-[#8E96B0] tabular-nums">
                20-FTE Dhaka Hub (64.8M BDT):{' '}
                <strong className="text-[#16213A] dark:text-[#E7EBF5]">${dhakaY1UsdK}K/yr</strong>
              </div>
            </div>

            <div className="rounded-xl bg-[#FAF8F4] dark:bg-[#0F1529] border border-[#E4DFD6] dark:border-[#232B4A] p-3.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-semibold text-[#16213A] dark:text-[#E7EBF5]">
                  Effective Corporate Tax
                </span>
                <span className="font-mono text-base sm:text-lg font-extrabold text-[#16213A] dark:text-[#E7EBF5] tabular-nums">
                  {taxRate.toFixed(1)}%
                </span>
              </div>
              <input
                type="range"
                min={20}
                max={30}
                step={0.5}
                value={taxRate}
                onChange={(e) => setTaxRate(Number(e.target.value))}
                aria-label="Effective corporate tax rate"
                className="w-full spenta-slider mt-2.5"
              />
              <div className="flex justify-between text-[10px] font-mono text-[#5F6576] dark:text-[#8E96B0] mt-1">
                <span>20.0%</span>
                <span className="font-bold text-[#1C6E46] dark:text-[#6FCB9F]">25.0% Base</span>
                <span>30.0%</span>
              </div>
            </div>

            <div className="rounded-xl bg-[#FAF8F4] dark:bg-[#0F1529] border border-[#1C6E46]/30 dark:border-[#6FCB9F]/30 p-3.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-semibold text-[#16213A] dark:text-[#E7EBF5]">
                  Y5 Exit Multiple (EV / EBITDA)
                </span>
                <span className="font-mono text-base sm:text-lg font-extrabold text-[#1C6E46] dark:text-[#6FCB9F] tabular-nums">
                  {exitMultiple.toFixed(1)}×
                </span>
              </div>
              <input
                type="range"
                min={8}
                max={15}
                step={0.5}
                value={exitMultiple}
                onChange={(e) => setExitMultiple(Number(e.target.value))}
                aria-label="Year 5 Exit EV to EBITDA Multiple"
                className="w-full spenta-slider mt-2.5"
              />
              <div className="flex justify-between text-[10px] font-mono text-[#5F6576] dark:text-[#8E96B0] mt-1">
                <span>8.0×</span>
                <span className="font-bold text-[#1C6E46] dark:text-[#6FCB9F]">10.0× Base</span>
                <span>15.0×</span>
              </div>
              <div className="mt-2 text-[11px] font-mono text-[#4A5568] dark:text-[#8E96B0] tabular-nums">
                SAFE Exit ROI:{' '}
                <strong className="text-[#1C6E46] dark:text-[#6FCB9F]">
                  {safeEquityRoiMultiple.toFixed(2)}×
                </strong>{' '}
                (${safeExitProceedsM.toFixed(2)}M on ${impliedExitEvM.toFixed(2)}M EV)
              </div>
            </div>

            <div className="rounded-xl bg-[#FAF8F4] dark:bg-[#0F1529] border border-[#E4DFD6] dark:border-[#232B4A] p-3.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-semibold text-[#16213A] dark:text-[#E7EBF5]">
                  Post-Seed Round Dilution
                </span>
                <span className="font-mono text-base sm:text-lg font-extrabold text-[#16213A] dark:text-[#E7EBF5] tabular-nums">
                  {dilutionPct}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={25}
                step={5}
                value={dilutionPct}
                onChange={(e) => setDilutionPct(Number(e.target.value))}
                aria-label="Post-seed equity dilution percentage"
                className="w-full spenta-slider mt-2.5"
              />
              <div className="flex items-center justify-between gap-1.5 mt-2">
                <button
                  type="button"
                  onClick={() => setDilutionPct(0)}
                  className={`flex-1 py-1 px-2 rounded-md text-[10px] font-mono font-semibold border cursor-pointer transition-colors ${
                    dilutionPct === 0
                      ? 'bg-[#1F3863] text-white border-[#1F3863] dark:bg-[#8FA6E8] dark:text-[#0B1020] dark:border-[#8FA6E8]'
                      : 'bg-white dark:bg-[#141A32] border-[#E4DFD6] dark:border-[#232B4A] text-[#5F6576] dark:text-[#8E96B0]'
                  }`}
                >
                  0% Pre-Dil. (11.1%)
                </button>
                <button
                  type="button"
                  onClick={() => setDilutionPct(20)}
                  className={`flex-1 py-1 px-2 rounded-md text-[10px] font-mono font-semibold border cursor-pointer transition-colors ${
                    dilutionPct === 20
                      ? 'bg-[#1C6E46] text-white border-[#1C6E46] dark:bg-[#6FCB9F] dark:text-[#0B1020] dark:border-[#6FCB9F]'
                      : 'bg-white dark:bg-[#141A32] border-[#E4DFD6] dark:border-[#232B4A] text-[#5F6576] dark:text-[#8E96B0]'
                  }`}
                >
                  20% Series A (8.9%)
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setFxRate(120);
                setTaxRate(25);
                setExitMultiple(10);
                setDilutionPct(0);
                setScenario('conservative');
              }}
              className="w-full min-h-[38px] py-2 rounded-lg border border-[#E4DFD6] dark:border-[#232B4A] bg-[#FAF8F4] dark:bg-[#0F1529] hover:border-[#1F3863]/50 dark:hover:border-[#8FA6E8]/50 text-xs font-semibold text-[#16213A] dark:text-[#E7EBF5] cursor-pointer transition-colors"
            >
              Reset Baseline (120 BDT · 25% Tax · 10× EV · 0% Dil.)
            </button>
          </div>

          <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-3.5 text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
            <div className="font-mono text-[10px] font-bold uppercase mb-1">
              Natural Hard-Currency FX Hedge
            </div>
            Enterprise contracts billed in USD/AUD/EUR naturally hedge BDT engineering payroll—a move from 120 to 125 BDT/USD reduces Dhaka USD OpEx while lifting 5-year net profit and exit EV.
          </div>
        </section>
      </div>

      {/* Financial & ROI Audit Reconciliation Ledger */}
      <section className="rounded-2xl border border-[#E4DFD6] dark:border-[#232B4A] bg-white dark:bg-[#141A32] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="inline-flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#1C6E46] dark:text-[#6FCB9F]" strokeWidth={1.75} />
            <h2 className="font-bold text-base sm:text-lg text-[#16213A] dark:text-[#E7EBF5]">
              Financial Model &amp; ROI Audit Reconciliation
            </h2>
          </div>
          <span className="text-[11px] font-mono uppercase tracking-[0.12em] text-[#1C6E46] dark:text-[#6FCB9F]">
            CAPITAL EFFICIENCY ≠ SAFE INVESTOR RETURN
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Formula 1: Operating Capital Efficiency */}
          <div className="rounded-xl bg-[#FAF8F4] dark:bg-[#0F1529] border border-[#E4DFD6] dark:border-[#232B4A] p-4 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-mono font-bold uppercase tracking-[0.14em] text-[#5F6576] dark:text-[#8E96B0]">
                01 · Operating Capital Efficiency (Company Metric)
              </span>
              <span className="font-mono text-sm font-extrabold text-[#16213A] dark:text-[#E7EBF5] tabular-nums">
                {y5.capitalEfficiencyMultiple.toFixed(2)}×
              </span>
            </div>
            <div className="font-mono text-xs text-[#16213A] dark:text-[#E7EBF5] bg-white dark:bg-[#141A32] border border-[#E4DFD6] dark:border-[#232B4A] rounded-lg px-3 py-2 tabular-nums">
              Cum. 5-Yr Net Profit (${(y5.cumNetK / 1000).toFixed(3)}M) ÷ $500K Raised ={' '}
              <strong>{y5.capitalEfficiencyMultiple.toFixed(2)}×</strong>
            </div>
            <p className="text-xs text-[#4A5568] dark:text-[#A4ADC6] leading-relaxed">
              Measures internal business cash productivity per dollar of seed capital. Retained earnings belong to the corporate balance sheet and are not distributed 1:1 to a minority SAFE holder.
            </p>
          </div>

          {/* Formula 2: Investor SAFE Equity ROI */}
          <div className="rounded-xl bg-[#1C6E46]/[0.05] dark:bg-[#6FCB9F]/[0.07] border border-[#1C6E46]/35 dark:border-[#6FCB9F]/35 p-4 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-mono font-bold uppercase tracking-[0.14em] text-[#1C6E46] dark:text-[#6FCB9F]">
                02 · Modeled Investor SAFE Exit ROI (Equity Return)
              </span>
              <span className="font-mono text-sm font-extrabold text-[#1C6E46] dark:text-[#6FCB9F] tabular-nums">
                {safeEquityRoiMultiple.toFixed(2)}×
              </span>
            </div>
            <div className="font-mono text-xs text-[#16213A] dark:text-[#E7EBF5] bg-white dark:bg-[#141A32] border border-[#1C6E46]/30 dark:border-[#6FCB9F]/30 rounded-lg px-3 py-2 tabular-nums">
              (Y5 EBITDA ${y5.ebitdaK.toLocaleString()}K × {exitMultiple}× EV × {effectiveOwnershipPct.toFixed(2)}%) ÷ $500K ={' '}
              <strong className="text-[#1C6E46] dark:text-[#6FCB9F]">{safeEquityRoiMultiple.toFixed(2)}×</strong>
            </div>
            <div className="grid grid-cols-3 gap-2 text-[11px] font-mono tabular-nums pt-0.5">
              <div className="rounded-lg bg-white dark:bg-[#141A32] border border-[#E4DFD6] dark:border-[#232B4A] px-2.5 py-1.5">
                <div className="text-[10px] text-[#5F6576] dark:text-[#8E96B0]">10× EV (0% Dil.)</div>
                <div className="font-bold text-[#16213A] dark:text-[#E7EBF5]">{safeRoiAt10xPreDil.toFixed(2)}×</div>
              </div>
              <div className="rounded-lg bg-white dark:bg-[#141A32] border border-[#E4DFD6] dark:border-[#232B4A] px-2.5 py-1.5">
                <div className="text-[10px] text-[#5F6576] dark:text-[#8E96B0]">10× EV (-20% Ser.A)</div>
                <div className="font-bold text-[#16213A] dark:text-[#E7EBF5]">{safeRoiAt10xSeriesA.toFixed(2)}×</div>
              </div>
              <div className="rounded-lg bg-white dark:bg-[#141A32] border border-[#E4DFD6] dark:border-[#232B4A] px-2.5 py-1.5">
                <div className="text-[10px] text-[#5F6576] dark:text-[#8E96B0]">15× EV (0% Dil.)</div>
                <div className="font-bold text-[#1C6E46] dark:text-[#6FCB9F]">{safeRoiAt15xPreDil.toFixed(2)}×</div>
              </div>
            </div>
          </div>
        </div>

        {/* Audited Unit-Economics Normalization Strip */}
        <div className="mt-4 pt-4 border-t border-[#E4DFD6] dark:border-[#232B4A] grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div className="rounded-xl bg-[#FAF8F4] dark:bg-[#0F1529] border border-[#E4DFD6] dark:border-[#232B4A] p-3">
            <div className="font-mono text-[10px] uppercase tracking-wider text-[#5F6576] dark:text-[#8E96B0]">
              20-FTE Dhaka Hub Rate Reconciliation
            </div>
            <div className="font-mono font-bold text-[#16213A] dark:text-[#E7EBF5] mt-1 tabular-nums">
              ${dhakaLoadedHourlyUsd.toFixed(2)}/hr Loaded · ${dhakaY1UsdK}K/yr
            </div>
            <p className="text-[11px] text-[#4A5568] dark:text-[#8E96B0] mt-1 leading-relaxed">
              64.8M BDT ÷ {fxRate} FX ÷ 41,600 hrs/yr ($11.50/hr base + $1.48/hr enclave overhead; ~${(dhakaLoadedHourlyUsd / 0.7).toFixed(2)}/hr at 70% billable utilization vs. $4.78M/yr US/AU pod).
            </p>
          </div>

          <div className="rounded-xl bg-[#FAF8F4] dark:bg-[#0F1529] border border-[#E4DFD6] dark:border-[#232B4A] p-3">
            <div className="font-mono text-[10px] uppercase tracking-wider text-[#5F6576] dark:text-[#8E96B0]">
              Reconciled On-Prem Server BOM
            </div>
            <div className="font-mono font-bold text-[#16213A] dark:text-[#E7EBF5] mt-1">
              T3 $8.5K–$10.5K · T2 $12.0K–$14.5K
            </div>
            <p className="text-[11px] text-[#4A5568] dark:text-[#8E96B0] mt-1 leading-relaxed">
              Tier 3 baseline uses refurbished 4× RTX 3090 (96GB), 256GB DDR5, 10TB NVMe &amp; 50TB HDD; Tier 2 unified strictly below Flagship Tier 1 ($14.1K–$15.3K).
            </p>
          </div>

          <div className="rounded-xl bg-[#FAF8F4] dark:bg-[#0F1529] border border-[#E4DFD6] dark:border-[#232B4A] p-3">
            <div className="font-mono text-[10px] uppercase tracking-wider text-[#5F6576] dark:text-[#8E96B0]">
              Revenue-Weighted GM &amp; Separate Retainers
            </div>
            <div className="font-mono font-bold text-[#16213A] dark:text-[#E7EBF5] mt-1">
              Build CapEx ≠ Quarterly SLAs
            </div>
            <p className="text-[11px] text-[#4A5568] dark:text-[#8E96B0] mt-1 leading-relaxed">
              Quarterly retainers ($8.6K/qtr Cyber SLA, $6.9K/qtr WebAR/GEO) are tracked strictly apart from one-time builds; composite GM is revenue-weighted across Year-1 contract value.
            </p>
          </div>
        </div>
      </section>

      {/* Sortable 13-Product Gross Margin Matrix */}
      <section className="rounded-2xl border border-[#E4DFD6] dark:border-[#232B4A] bg-white dark:bg-[#141A32] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="font-bold text-base sm:text-lg text-[#16213A] dark:text-[#E7EBF5]">
              13-Product Conservative Gross Margin Matrix
            </h2>
            <p className="text-xs text-[#4A5568] dark:text-[#A4ADC6]">
              High-Margin IP &amp; SaaS (&gt;=55% GM highlighted in Spenta Green) paired with predictable Enterprise Delivery Pods (29%–35% GM).
            </p>
          </div>
          <div className="flex items-center gap-3 text-[11px] font-mono">
            <span className="inline-flex items-center gap-1.5 text-[#1C6E46] dark:text-[#6FCB9F]">
              <span className="w-2 h-2 rounded-full bg-[#1C6E46] dark:bg-[#6FCB9F]" /> High-Margin IP (&gt;=55%)
            </span>
            <span className="inline-flex items-center gap-1.5 text-[#5F6576] dark:text-[#8E96B0]">
              <span className="w-2 h-2 rounded-full bg-[#B9B2A5] dark:bg-[#3A456B]" /> Delivery Pods (29%–35%)
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[740px] text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#E4DFD6] dark:border-[#232B4A] text-[10px] font-mono uppercase text-[#5F6576] dark:text-[#8E96B0]">
                <th className="py-2.5 pr-3">
                  <button
                    type="button"
                    onClick={() => handleSort('name')}
                    className="inline-flex items-center gap-1 hover:text-[#16213A] dark:hover:text-[#E7EBF5] cursor-pointer"
                  >
                    Product Line <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="py-2.5 px-3">Category</th>
                <th className="py-2.5 px-3 text-right">
                  <button
                    type="button"
                    onClick={() => handleSort('setupUsd')}
                    className="inline-flex items-center gap-1 hover:text-[#16213A] dark:hover:text-[#E7EBF5] cursor-pointer"
                  >
                    Setup / Build <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="py-2.5 px-3">Recurring / License Model</th>
                <th className="py-2.5 px-3 text-right">
                  <button
                    type="button"
                    onClick={() => handleSort('gmPct')}
                    className="inline-flex items-center gap-1 hover:text-[#16213A] dark:hover:text-[#E7EBF5] cursor-pointer"
                  >
                    Cons. GM% <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="py-2.5 px-3 text-right">12-Mo ROI / Payback</th>
                <th className="py-2.5 px-3 text-center">
                  <button
                    type="button"
                    onClick={() => handleSort('minServerTier')}
                    className="inline-flex items-center gap-1 hover:text-[#16213A] dark:hover:text-[#E7EBF5] cursor-pointer"
                  >
                    Min Tier <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="py-2.5 pl-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EFEBE3] dark:divide-[#1E2642]">
              {sortedApps.map((app) => {
                const isHighMargin = app.gmPct >= 55;
                const inStack = selectedIds.includes(app.id);
                const roi = computeProductRoi(app.id);
                return (
                  <tr
                    key={app.id}
                    className={`transition-colors ${
                      inStack
                        ? 'bg-[#1C6E46]/[0.06] dark:bg-[#6FCB9F]/[0.08]'
                        : 'hover:bg-[#FAF8F4] dark:hover:bg-[#192140]'
                    }`}
                  >
                    <td className="py-3 pr-3">
                      <div className="font-bold text-[#16213A] dark:text-[#E7EBF5]">{app.name}</div>
                      <div className="text-[11px] text-[#5F6576] dark:text-[#8E96B0]">
                        {app.proofClient}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-[#4A5568] dark:text-[#A4ADC6]">{app.category}</td>
                    <td className="py-3 px-3 text-right font-mono font-semibold text-[#16213A] dark:text-[#E7EBF5] tabular-nums whitespace-nowrap">
                      ${(app.setupUsd / 1000).toFixed(1)}K
                      {app.billingCadence === 'quarterly-retainer' && (
                        <span className="ml-1 text-[10px] text-[#5F6576] dark:text-[#8E96B0]">/qtr</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-[#4A5568] dark:text-[#A4ADC6]">
                      {app.recurringLabel}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-extrabold tabular-nums">
                      <span
                        className={`px-2 py-0.5 rounded ${
                          isHighMargin
                            ? 'bg-[#1C6E46]/12 dark:bg-[#6FCB9F]/15 text-[#1C6E46] dark:text-[#6FCB9F]'
                            : 'bg-[#F2EFE9] dark:bg-[#1D2545] text-[#4A5568] dark:text-[#C9D2E6]'
                        }`}
                      >
                        {app.gmPct.toFixed(1)}%
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                      <div className="font-bold text-[#1C6E46] dark:text-[#6FCB9F]">
                        {roi.client12MoRoiPct}% ROI
                      </div>
                      <div className="text-[10px] text-[#5F6576] dark:text-[#8E96B0]">
                        {roi.paybackMonths} mo payback
                      </div>
                    </td>
                    <td className="py-3 px-3 text-center font-mono text-[#4A5568] dark:text-[#C9D2E6]">
                      T{app.minServerTier}
                    </td>
                    <td className="py-3 pl-3 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setRoiInitialAppId(app.id);
                            setSubTab('roi');
                          }}
                          className="px-2 py-1.5 sm:py-1 rounded-lg font-mono text-[11px] font-semibold border border-[#E4DFD6] dark:border-[#232B4A] bg-white dark:bg-[#0B1020] text-[#1F3863] dark:text-[#8FA6E8] hover:border-[#1F3863] whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          ROI
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleApp(app.id)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1.5 sm:py-1 rounded-lg font-mono text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                            inStack
                              ? 'bg-[#1C6E46] text-white dark:bg-[#6FCB9F] dark:text-[#0B1020]'
                              : 'bg-[#F2EFE9] dark:bg-[#1D2545] text-[#16213A] dark:text-[#E7EBF5] hover:bg-[#1F3863] hover:text-white dark:hover:bg-[#8FA6E8] dark:hover:text-[#0B1020]'
                          }`}
                        >
                          {inStack ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                          <span>{inStack ? 'Added' : 'Add'}</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
        </>
      )}

      {/* One-Page Quarterly Executive Summary Modal */}
      {summaryOpen && (
        <div
          className="fixed inset-0 z-50 bg-[#0B1020]/80 backdrop-blur-sm flex items-center justify-center p-2.5 sm:p-6 overflow-y-auto"
          onClick={() => setSummaryOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="One-Page Quarterly Executive Summary"
        >
          <div
            className="w-full max-w-4xl bg-[#FAF8F4] dark:bg-[#0B1020] rounded-2xl border border-[#E4DFD6] dark:border-[#232B4A] shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Control Bar */}
            <div className="bg-white dark:bg-[#141A32] border-b border-[#E4DFD6] dark:border-[#232B4A] px-4 sm:px-5 py-3 flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#1C6E46] dark:text-[#6FCB9F]">
                  One-Page Brief
                </span>

                <div className="inline-flex flex-wrap rounded-lg bg-[#F2EFE9] dark:bg-[#0F1529] p-0.5 border border-[#E4DFD6] dark:border-[#232B4A]">
                  {modeledSeries.map((row, idx) => (
                    <button
                      key={row.year}
                      type="button"
                      onClick={() => setSummaryYearIndex(idx)}
                      className={`px-2 py-1 rounded-md font-mono text-[11px] font-bold transition-colors cursor-pointer ${
                        summaryYearIndex === idx
                          ? 'bg-[#1F3863] text-white dark:bg-[#8FA6E8] dark:text-[#0B1020]'
                          : 'text-[#5F6576] dark:text-[#8E96B0] hover:text-[#16213A] dark:hover:text-[#E7EBF5]'
                      }`}
                    >
                      {row.year}
                    </button>
                  ))}
                </div>

                <div className="inline-flex rounded-lg bg-[#F2EFE9] dark:bg-[#0F1529] p-0.5 border border-[#E4DFD6] dark:border-[#232B4A]">
                  {QUARTER_WEIGHTS.map(({ quarter }) => (
                    <button
                      key={quarter}
                      type="button"
                      onClick={() => setSummaryQuarter(quarter)}
                      className={`px-2 py-1 rounded-md font-mono text-[11px] font-bold transition-colors cursor-pointer ${
                        summaryQuarter === quarter
                          ? 'bg-[#1C6E46] text-white dark:bg-[#6FCB9F] dark:text-[#0B1020]'
                          : 'text-[#5F6576] dark:text-[#8E96B0] hover:text-[#16213A] dark:hover:text-[#E7EBF5]'
                      }`}
                    >
                      {quarter}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopySummaryText}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#E4DFD6] dark:border-[#232B4A] bg-white dark:bg-[#0F1529] hover:border-[#1F3863]/50 dark:hover:border-[#8FA6E8]/50 text-xs font-semibold text-[#16213A] dark:text-[#E7EBF5] whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {copiedSummary ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-[#1C6E46] dark:text-[#6FCB9F]" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" strokeWidth={1.5} />
                      <span>Copy</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#E4DFD6] dark:border-[#232B4A] bg-white dark:bg-[#0F1529] hover:border-[#1F3863]/50 dark:hover:border-[#8FA6E8]/50 text-xs font-semibold text-[#16213A] dark:text-[#E7EBF5] whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" strokeWidth={1.5} />
                  <span>Print</span>
                </button>
                <button
                  type="button"
                  onClick={() => exportQuarterlySummaryToPdf(summaryData)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#1C6E46] hover:bg-[#175B3A] dark:bg-[#6FCB9F] dark:hover:bg-[#5EC092] text-white dark:text-[#0B1020] text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" strokeWidth={1.75} />
                  <span>Export 1-Page PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSummaryOpen(false)}
                  aria-label="Close executive summary"
                  className="p-1.5 rounded-lg text-[#5F6576] hover:text-[#16213A] dark:hover:text-white hover:bg-[#F2EFE9] dark:hover:bg-[#1D2545] cursor-pointer"
                >
                  <X className="w-4 h-4" strokeWidth={1.5} />
                </button>
              </div>
            </div>

            {/* One-Page Executive Brief Sheet */}
            <div className="p-3 sm:p-6 overflow-y-auto">
              <div className="bg-white dark:bg-[#141A32] rounded-xl border border-[#E4DFD6] dark:border-[#232B4A] overflow-hidden">
                <div className="bg-[#0F1529] text-white px-5 sm:px-6 py-5 border-b border-[#6FCB9F]/35">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <img
                        src={SPENTA_LOGO_URL}
                        alt="Spenta Technology"
                        className="h-7 w-auto object-contain"
                      />
                      <span className="font-mono text-[10px] font-bold tracking-wider uppercase text-[#6FCB9F] bg-[#6FCB9F]/10 border border-[#6FCB9F]/30 px-2 py-0.5 rounded">
                        QUARTERLY EXECUTIVE BRIEF
                      </span>
                    </div>
                    <span className="font-mono text-xs font-extrabold bg-[#6FCB9F] text-[#0B1020] px-3 py-1 rounded-md">
                      {summaryData.quarter} {summaryData.fiscalYear} ({summaryData.fiscalLabel})
                    </span>
                  </div>

                  <h2 className="text-lg sm:text-xl font-extrabold tracking-tight mt-3">
                    {summaryData.quarter} {summaryData.fiscalYear} Financial &amp; Sovereign Deployment Summary
                  </h2>
                  <p className="font-mono text-[11px] text-[#8E96B0] mt-1 tabular-nums">
                    Scenario: {summaryData.scenarioLabel} · FX: {summaryData.fxRate} BDT/USD · Tax:{' '}
                    {summaryData.taxRate.toFixed(1)}% · Generated {summaryData.generatedAtLabel}
                  </p>
                </div>

                <div className="p-4 sm:p-6 space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="rounded-xl bg-[#FAF8F4] dark:bg-[#0F1529] border border-[#E4DFD6] dark:border-[#232B4A] p-3.5">
                      <div className="text-[10px] font-mono uppercase text-[#5F6576] dark:text-[#8E96B0]">
                        {summaryData.quarter} Revenue ({summaryData.selectedQuarterRow.weightPct}%)
                      </div>
                      <div className="font-mono text-xl font-extrabold text-[#16213A] dark:text-[#E7EBF5] mt-1 tabular-nums">
                        {formatCompactUsdK(summaryData.selectedQuarterRow.revK)}
                      </div>
                      <div className="text-[11px] font-mono text-[#5F6576] dark:text-[#8E96B0] mt-0.5 tabular-nums">
                        Run-rate: {formatCompactUsdK(summaryData.selectedQuarterRow.revK * 4)}/yr
                      </div>
                    </div>

                    <div className="rounded-xl bg-[#FAF8F4] dark:bg-[#0F1529] border border-[#E4DFD6] dark:border-[#232B4A] p-3.5">
                      <div className="text-[10px] font-mono uppercase text-[#5F6576] dark:text-[#8E96B0]">
                        {summaryData.quarter} EBITDA
                      </div>
                      <div className="font-mono text-xl font-extrabold text-[#0D9488] dark:text-sky-400 mt-1 tabular-nums">
                        {formatCompactUsdK(summaryData.selectedQuarterRow.ebitdaK)}
                      </div>
                      <div className="text-[11px] font-mono text-[#5F6576] dark:text-[#8E96B0] mt-0.5 tabular-nums">
                        Margin: {summaryData.selectedQuarterRow.ebitdaMarginPct.toFixed(1)}%
                      </div>
                    </div>

                    <div className="rounded-xl bg-[#1C6E46]/10 dark:bg-[#6FCB9F]/10 border border-[#1C6E46]/30 dark:border-[#6FCB9F]/35 p-3.5">
                      <div className="text-[10px] font-mono uppercase text-[#1C6E46] dark:text-[#6FCB9F]">
                        {summaryData.quarter} Net Profit
                      </div>
                      <div className="font-mono text-xl font-extrabold text-[#1C6E46] dark:text-[#6FCB9F] mt-1 tabular-nums">
                        {formatCompactUsdK(summaryData.selectedQuarterRow.netProfitK)}
                      </div>
                      <div className="text-[11px] font-mono text-[#4A5568] dark:text-[#8E96B0] mt-0.5 tabular-nums">
                        After {summaryData.taxRate.toFixed(1)}% corp. tax
                      </div>
                    </div>

                    <div className="rounded-xl bg-[#FAF8F4] dark:bg-[#0F1529] border border-[#E4DFD6] dark:border-[#232B4A] p-3.5">
                      <div className="text-[10px] font-mono uppercase text-[#5F6576] dark:text-[#8E96B0]">
                        SAFE Exit ROI ({summaryData.exitEbitdaMultiple}× EV)
                      </div>
                      <div className="font-mono text-xl font-extrabold text-[#16213A] dark:text-[#E7EBF5] mt-1 tabular-nums">
                        {summaryData.safeEquityRoiMultiple.toFixed(2)}×
                      </div>
                      <div className="text-[11px] font-mono text-[#5F6576] dark:text-[#8E96B0] mt-0.5 tabular-nums">
                        Cap. Eff: {summaryData.fiveYearCapitalEfficiency.toFixed(2)}× · EV ${summaryData.impliedExitEvM.toFixed(2)}M
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                      <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#1C6E46] dark:text-[#6FCB9F]">
                        {summaryData.fiscalYear} Quarterly Phasing &amp; Full-Year Reconciliation
                      </span>
                      <span className="font-mono text-[10px] text-[#5F6576] dark:text-[#8E96B0]">
                        Seasonal ramp: 21% / 24% / 26% / 29%
                      </span>
                    </div>
                    <div className="overflow-x-auto rounded-xl border border-[#E4DFD6] dark:border-[#232B4A]">
                      <table className="w-full min-w-[520px] text-left font-mono text-xs tabular-nums">
                        <thead className="bg-[#0F1529] text-[#6FCB9F]">
                          <tr>
                            <th className="py-2 px-3">Quarter</th>
                            <th className="py-2 px-3 text-right">Share</th>
                            <th className="py-2 px-3 text-right">Revenue</th>
                            <th className="py-2 px-3 text-right">EBITDA</th>
                            <th className="py-2 px-3 text-right">EBITDA %</th>
                            <th className="py-2 px-3 text-right">Net Profit</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#EFEBE3] dark:divide-[#1E2642]">
                          {summaryData.quarters.map((qRow) => {
                            const active = qRow.quarter === summaryData.quarter;
                            return (
                              <tr
                                key={qRow.quarter}
                                onClick={() => setSummaryQuarter(qRow.quarter)}
                                className={`cursor-pointer transition-colors ${
                                  active
                                    ? 'bg-[#1C6E46]/10 dark:bg-[#6FCB9F]/15 font-bold text-[#16213A] dark:text-white'
                                    : 'hover:bg-[#FAF8F4] dark:hover:bg-[#192140] text-[#334155] dark:text-[#C9D2E6]'
                                }`}
                              >
                                <td className="py-2 px-3">
                                  {qRow.quarter} {summaryData.fiscalYear}
                                  {active && (
                                    <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-[#1C6E46] dark:bg-[#6FCB9F] text-white dark:text-[#0B1020]">
                                      ACTIVE
                                    </span>
                                  )}
                                </td>
                                <td className="py-2 px-3 text-right">{qRow.weightPct}%</td>
                                <td className="py-2 px-3 text-right">{formatCompactUsdK(qRow.revK)}</td>
                                <td className="py-2 px-3 text-right text-[#0D9488] dark:text-sky-400">
                                  {formatCompactUsdK(qRow.ebitdaK)}
                                </td>
                                <td className="py-2 px-3 text-right">
                                  {qRow.ebitdaMarginPct.toFixed(1)}%
                                </td>
                                <td className="py-2 px-3 text-right text-[#1C6E46] dark:text-[#6FCB9F] font-semibold">
                                  {formatCompactUsdK(qRow.netProfitK)}
                                </td>
                              </tr>
                            );
                          })}
                          <tr className="bg-[#F2EFE9] dark:bg-[#0F1529] font-bold text-[#16213A] dark:text-[#E7EBF5]">
                            <td className="py-2.5 px-3">
                              Total {summaryData.fiscalYear} ({summaryData.fiscalLabel})
                            </td>
                            <td className="py-2.5 px-3 text-right">100%</td>
                            <td className="py-2.5 px-3 text-right">
                              {formatCompactUsdK(summaryData.annualRevK)}
                            </td>
                            <td className="py-2.5 px-3 text-right text-[#0D9488] dark:text-sky-400">
                              {formatCompactUsdK(summaryData.annualEbitdaK)}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              {summaryData.annualRevK > 0
                                ? `${((summaryData.annualEbitdaK / summaryData.annualRevK) * 100).toFixed(1)}%`
                                : '0.0%'}
                            </td>
                            <td className="py-2.5 px-3 text-right text-[#1C6E46] dark:text-[#6FCB9F]">
                              {formatCompactUsdK(summaryData.annualNetProfitK)}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="rounded-xl bg-[#FAF8F4] dark:bg-[#0F1529] border border-[#E4DFD6] dark:border-[#232B4A] p-4">
                      <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#1C6E46] dark:text-[#6FCB9F] mb-2.5">
                        Model Assumptions &amp; FX Hedge
                      </div>
                      <dl className="space-y-1.5 text-xs">
                        <div className="flex justify-between gap-2">
                          <dt className="text-[#5F6576] dark:text-[#8E96B0]">Active Scenario</dt>
                          <dd className="font-mono font-bold text-[#16213A] dark:text-[#E7EBF5] text-right">
                            {summaryData.scenarioLabel}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-2">
                          <dt className="text-[#5F6576] dark:text-[#8E96B0]">BDT / USD FX Rate</dt>
                          <dd className="font-mono font-bold text-[#16213A] dark:text-[#E7EBF5] tabular-nums">
                            {summaryData.fxRate} BDT (120 base)
                          </dd>
                        </div>
                        <div className="flex justify-between gap-2">
                          <dt className="text-[#5F6576] dark:text-[#8E96B0]">Effective Corp. Tax</dt>
                          <dd className="font-mono font-bold text-[#16213A] dark:text-[#E7EBF5] tabular-nums">
                            {summaryData.taxRate.toFixed(1)}% (25.0% base)
                          </dd>
                        </div>
                        <div className="flex justify-between gap-2">
                          <dt className="text-[#5F6576] dark:text-[#8E96B0]">20-FTE Dhaka Burn</dt>
                          <dd className="font-mono font-bold text-[#16213A] dark:text-[#E7EBF5] tabular-nums">
                            ${summaryData.dhakaY1UsdK}K/yr (64.8M BDT)
                          </dd>
                        </div>
                        <div className="flex justify-between gap-2">
                          <dt className="text-[#5F6576] dark:text-[#8E96B0]">SAFE Capital Ask</dt>
                          <dd className="font-mono font-bold text-[#1C6E46] dark:text-[#6FCB9F] tabular-nums">
                            $500K · $4.5M Cap ({effectiveOwnershipPct.toFixed(2)}% eff.)
                          </dd>
                        </div>
                        <div className="flex justify-between gap-2">
                          <dt className="text-[#5F6576] dark:text-[#8E96B0]">Exit Multiple (Y5)</dt>
                          <dd className="font-mono font-bold text-[#16213A] dark:text-[#E7EBF5] tabular-nums">
                            {summaryData.exitEbitdaMultiple}× EBITDA → EV ${summaryData.impliedExitEvM.toFixed(2)}M ({dilutionPct}% dil.)
                          </dd>
                        </div>
                      </dl>
                    </div>

                    <div className="rounded-xl bg-[#FAF8F4] dark:bg-[#0F1529] border border-[#E4DFD6] dark:border-[#232B4A] p-4">
                      <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#1C6E46] dark:text-[#6FCB9F] mb-2.5">
                        Composed Sovereign Stack Snapshot
                      </div>
                      <dl className="space-y-1.5 text-xs">
                        <div className="flex justify-between gap-2">
                          <dt className="text-[#5F6576] dark:text-[#8E96B0]">Selected Modules</dt>
                          <dd className="font-mono font-bold text-[#16213A] dark:text-[#E7EBF5] tabular-nums">
                            {summaryData.stackModuleCount} / 13 Spenta Apps
                          </dd>
                        </div>
                        <div className="flex justify-between gap-2">
                          <dt className="text-[#5F6576] dark:text-[#8E96B0]">One-Time + Retainers</dt>
                          <dd className="font-mono font-bold text-[#16213A] dark:text-[#E7EBF5] tabular-nums text-right">
                            ${(summaryData.stackSetupUsd / 1000).toFixed(1)}K
                            {summaryData.stackQuarterlyRetainerUsd && summaryData.stackQuarterlyRetainerUsd > 0
                              ? ` + $${(summaryData.stackQuarterlyRetainerUsd / 1000).toFixed(1)}K/qtr`
                              : ' one-time'}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-2">
                          <dt className="text-[#5F6576] dark:text-[#8E96B0]">Rev-Weighted GM (Y1)</dt>
                          <dd className="font-mono font-bold text-[#1C6E46] dark:text-[#6FCB9F] tabular-nums">
                            {summaryData.stackBlendedGmPct.toFixed(1)}%
                          </dd>
                        </div>
                        <div className="flex justify-between gap-2">
                          <dt className="text-[#5F6576] dark:text-[#8E96B0]">Server PC Tier</dt>
                          <dd className="font-mono font-bold text-[#16213A] dark:text-[#E7EBF5]">
                            {summaryData.recommendedTierCode} ({summaryData.recommendedTierCapex})
                          </dd>
                        </div>
                      </dl>
                      {summaryData.stackModuleNames.length > 0 && (
                        <div className="mt-2.5 pt-2 border-t border-[#E4DFD6] dark:border-[#232B4A] text-[11px] text-[#5F6576] dark:text-[#8E96B0]">
                          <strong className="text-[#16213A] dark:text-[#E7EBF5]">Modules:</strong>{' '}
                          {summaryData.stackModuleNames.join(' · ')}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl bg-[#0F1529] text-white border border-[#232B4A] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="font-mono text-[10px] uppercase tracking-wider text-[#6FCB9F]">
                        {summaryData.fiscalYear} Operating Milestone &amp; Governance
                      </div>
                      <p className="text-xs text-[#C6D2EE] mt-1 leading-relaxed">
                        {summaryData.milestone}. Backed by L1–L6 Sovereign Core (OPA ≥0.88 HITL gate, zero external LLM cloud egress) and 250%–350% enterprise client ROI.
                      </p>
                    </div>
                    <span className="font-mono text-[11px] text-[#8E96B0] shrink-0">
                      spenta.tech · hello@spenta.tech
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
