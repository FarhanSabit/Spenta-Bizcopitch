import React, { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Calculator,
  Check,
  ExternalLink,
  Globe2,
  Layers,
  Loader2,
  RotateCcw,
  Server,
  TrendingUp,
} from 'lucide-react';
import { SERVER_TIERS, SPENTA_APPS, ServerTierId } from '../data/spentaManifest';
import {
  PRODUCT_ROI_PROFILES,
  REVENUE_SCOPES,
  RevenueScopeId,
  computeProductRoi,
} from '../data/roiModel';
import { useStack } from '../store/StackContext';

interface SearchGroundingResult {
  text: string;
  sources: Array<{ title: string; uri: string; domain?: string }>;
  searchQueries: string[];
}

interface RoiRevenueModelerProps {
  initialAppId?: string;
}

function formatUsd(amount: number): string {
  if (Math.abs(amount) >= 1_000_000) return `$${(amount / 1_000_000).toFixed(2)}M`;
  if (Math.abs(amount) >= 1_000) return `$${(amount / 1_000).toFixed(1)}K`;
  return `$${Math.round(amount).toLocaleString()}`;
}

function renderMarkdownLines(text: string) {
  const lines = text.split('\n').filter((line) => line.trim().length > 0);
  return (
    <div className="space-y-2 text-xs leading-relaxed text-[#334155] dark:text-[#C8D0E4]">
      {lines.map((raw, idx) => {
        const cleaned = raw.replace(/^[-*•]\s*/, '').trim();
        const parts = cleaned.split(/(\*\*[^*]+\*\*)/g);
        const isBullet = /^[-*•]\s/.test(raw.trim());
        return (
          <p key={idx} className={isBullet ? 'pl-3 relative' : ''}>
            {isBullet && (
              <span
                aria-hidden="true"
                className="absolute left-0 top-0 text-[#1C6E46] dark:text-[#6FCB9F] font-bold"
              >
                ·
              </span>
            )}
            {parts.map((part, pIdx) =>
              part.startsWith('**') && part.endsWith('**') ? (
                <strong key={pIdx} className="font-semibold text-[#16213A] dark:text-[#E7EBF5]">
                  {part.slice(2, -2)}
                </strong>
              ) : (
                <React.Fragment key={pIdx}>{part}</React.Fragment>
              ),
            )}
          </p>
        );
      })}
    </div>
  );
}

export function RoiRevenueModeler({ initialAppId }: RoiRevenueModelerProps) {
  const { theme, selectedApps, stackMetrics, toggleApp, selectedIds } = useStack();
  const isDark = theme === 'dark';

  const [mode, setMode] = useState<'single' | 'stack'>('single');
  const [activeAppId, setActiveAppId] = useState<string>(initialAppId || SPENTA_APPS[0].id);
  const [scaleMap, setScaleMap] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      SPENTA_APPS.map((a) => [a.id, PRODUCT_ROI_PROFILES[a.id]?.driver.defaultValue ?? 50]),
    ),
  );
  const [serverTierOverride, setServerTierOverride] = useState<ServerTierId | null>(null);
  const [includeHardware, setIncludeHardware] = useState<boolean>(true);

  // Live Google Search Benchmark state
  const [benchmarkLoading, setBenchmarkLoading] = useState(false);
  const [benchmarkError, setBenchmarkError] = useState<string | null>(null);
  const [benchmarkData, setBenchmarkData] = useState<SearchGroundingResult | null>(null);
  const [benchmarkSubject, setBenchmarkSubject] = useState<string>('');

  // 5-Scope Revenue Mix Modeler state (FY2031 target mix by default)
  const [scopeWeights, setScopeWeights] = useState<Record<RevenueScopeId, number>>(() => ({
    one_time_builds: 24,
    recurring_saas: 44,
    managed_retainers: 14,
    ip_royalties: 12,
    captive_ecosystem: 6,
  }));
  const [targetOpexRatioPct, setTargetOpexRatioPct] = useState<number>(24);

  const activeApp = useMemo(
    () => SPENTA_APPS.find((a) => a.id === activeAppId) ?? SPENTA_APPS[0],
    [activeAppId],
  );
  const activeProfile = PRODUCT_ROI_PROFILES[activeApp.id];
  const currentScale = scaleMap[activeApp.id] ?? activeProfile.driver.defaultValue;
  const effectiveTier: ServerTierId =
    mode === 'stack'
      ? serverTierOverride ?? stackMetrics.tier
      : serverTierOverride ?? activeApp.minServerTier;

  const singleResult = useMemo(
    () => computeProductRoi(activeApp.id, currentScale, effectiveTier, includeHardware),
    [activeApp.id, currentScale, effectiveTier, includeHardware],
  );

  // Aggregate Composed Stack ROI (sharing one sovereign server tier)
  const stackResult = useMemo(() => {
    const apps = selectedApps.length > 0 ? selectedApps : [SPENTA_APPS[0]];
    const tierCapex = includeHardware ? SERVER_TIERS[effectiveTier].capexMidUsd : 0;
    let oneTimeBuildUsd = 0;
    let annualRecurringUsd = 0;
    let year1ClientValueUsd = 0;
    let western3YrTcoUsd = 0;
    let grossProfit3Yr = 0;

    apps.forEach((app) => {
      const r = computeProductRoi(app.id, scaleMap[app.id], effectiveTier, false);
      oneTimeBuildUsd += r.oneTimeBuildUsd;
      annualRecurringUsd += r.annualRecurringUsd;
      year1ClientValueUsd += r.year1ClientValueUsd;
      western3YrTcoUsd += r.western3YrTcoUsd;
      const prof = PRODUCT_ROI_PROFILES[app.id];
      grossProfit3Yr +=
        r.oneTimeBuildUsd * (app.gmPct / 100) +
        r.annualRecurringUsd * 3 * ((prof?.recurringGmPct ?? app.gmPct) / 100);
    });

    const year1ClientInvestmentUsd = oneTimeBuildUsd + annualRecurringUsd + tierCapex;
    const year1NetBenefitUsd = year1ClientValueUsd - year1ClientInvestmentUsd;
    const client12MoRoiPct =
      year1ClientInvestmentUsd > 0
        ? Math.round((year1NetBenefitUsd / year1ClientInvestmentUsd) * 100)
        : 0;
    const paybackMonths =
      year1ClientValueUsd > 0
        ? Math.max(1.2, Number((year1ClientInvestmentUsd / (year1ClientValueUsd / 12)).toFixed(1)))
        : 12;
    const spenta3YrTcoUsd = oneTimeBuildUsd + tierCapex + annualRecurringUsd * 3;
    const spenta3YrLtvUsd = oneTimeBuildUsd + annualRecurringUsd * 3;
    const spenta3YrBlendedGmPct =
      spenta3YrLtvUsd > 0 ? Number(((grossProfit3Yr / spenta3YrLtvUsd) * 100).toFixed(1)) : 0;

    return {
      moduleCount: apps.length,
      oneTimeBuildUsd,
      serverCapexUsd: tierCapex,
      annualRecurringUsd,
      year1ClientInvestmentUsd,
      year1ClientValueUsd,
      year1NetBenefitUsd,
      client12MoRoiPct,
      paybackMonths,
      spenta3YrTcoUsd,
      western3YrTcoUsd,
      threeYrSavingsUsd: Math.max(0, western3YrTcoUsd - spenta3YrTcoUsd),
      spenta3YrLtvUsd,
      spenta3YrBlendedGmPct,
    };
  }, [selectedApps, scaleMap, effectiveTier, includeHardware]);

  const activeResult = mode === 'stack' ? stackResult : singleResult;

  const tcoChartData = useMemo(
    () => [
      {
        label: 'Spenta Sovereign (3-Yr)',
        amountK: Number((activeResult.spenta3YrTcoUsd / 1000).toFixed(1)),
        color: isDark ? '#6FCB9F' : '#1C6E46',
      },
      {
        label: 'Western Agency / Cloud (3-Yr)',
        amountK: Number((activeResult.western3YrTcoUsd / 1000).toFixed(1)),
        color: isDark ? '#8FA6E8' : '#1F3863',
      },
    ],
    [activeResult.spenta3YrTcoUsd, activeResult.western3YrTcoUsd, isDark],
  );

  // Normalized 5-Scope Revenue Mix calculations
  const revenueMixMetrics = useMemo(() => {
    const totalWeight = Object.values(scopeWeights).reduce((s, v) => s + v, 0) || 1;
    const normalized = REVENUE_SCOPES.map((scope) => {
      const sharePct = (scopeWeights[scope.id] / totalWeight) * 100;
      const gmContribution = (sharePct / 100) * scope.grossMarginPct;
      return {
        ...scope,
        normalizedSharePct: Number(sharePct.toFixed(1)),
        gmContributionPct: Number(gmContribution.toFixed(1)),
      };
    });
    const consolidatedGmPct = normalized.reduce((s, row) => s + row.gmContributionPct, 0);
    const impliedEbitdaMarginPct = consolidatedGmPct - targetOpexRatioPct;
    const fy27BaselineGmPct = REVENUE_SCOPES.reduce(
      (s, sc) => s + (sc.fy27SharePct / 100) * sc.grossMarginPct,
      0,
    );
    return {
      rows: normalized,
      consolidatedGmPct,
      impliedEbitdaMarginPct,
      fy27BaselineGmPct,
    };
  }, [scopeWeights, targetOpexRatioPct]);

  const applyMixPreset = (preset: 'fy27' | 'fy31' | 'arr-heavy') => {
    if (preset === 'fy27') {
      setScopeWeights({
        one_time_builds: 52,
        recurring_saas: 20,
        managed_retainers: 16,
        ip_royalties: 6,
        captive_ecosystem: 6,
      });
      setTargetOpexRatioPct(32);
    } else if (preset === 'fy31') {
      setScopeWeights({
        one_time_builds: 24,
        recurring_saas: 44,
        managed_retainers: 14,
        ip_royalties: 12,
        captive_ecosystem: 6,
      });
      setTargetOpexRatioPct(24);
    } else {
      setScopeWeights({
        one_time_builds: 15,
        recurring_saas: 52,
        managed_retainers: 11,
        ip_royalties: 16,
        captive_ecosystem: 6,
      });
      setTargetOpexRatioPct(21);
    }
  };

  const handleVerifyBenchmarks = async () => {
    const subjectLabel =
      mode === 'stack'
        ? `Composed Stack (${selectedApps.map((a) => a.shortName).join(', ')})`
        : activeApp.name;
    setBenchmarkLoading(true);
    setBenchmarkError(null);
    setBenchmarkSubject(subjectLabel);

    const query =
      mode === 'stack'
        ? `Compare current 2026 enterprise software & on-premises AI ROI, payback period, and 3-year TCO benchmarks for a multi-module stack (${selectedApps
            .map((a) => a.shortName)
            .join(', ')}) against Spenta Sovereign OS modeled metrics: Year-1 investment ${formatUsd(
            activeResult.year1ClientInvestmentUsd,
          )}, modeled 12-month ROI ${activeResult.client12MoRoiPct}%, payback ${
            activeResult.paybackMonths
          } months, and 3-year TCO ${formatUsd(activeResult.spenta3YrTcoUsd)} vs Western equivalent ${formatUsd(
            activeResult.western3YrTcoUsd,
          )}.`
        : `Verify 2026 enterprise industry ROI, implementation cost, and payback period benchmarks for ${activeApp.name} (${activeApp.tagline}) compared to Spenta Sovereign OS pricing (${activeApp.setupLabel}, ${activeApp.recurringLabel}, ${activeProfile.driver.label}: ${currentScale} ${activeProfile.driver.unit}, modeled 12-month client ROI ${activeResult.client12MoRoiPct}%, payback ${activeResult.paybackMonths} months, 3-year TCO ${formatUsd(
            activeResult.spenta3YrTcoUsd,
          )} vs Western equivalent ${formatUsd(activeResult.western3YrTcoUsd)}).`;

    try {
      const res = await fetch('/api/gemini/search-grounding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload?.error || 'Live benchmark verification failed.');
      }
      setBenchmarkData({
        text: payload.text || '',
        sources: Array.isArray(payload.sources) ? payload.sources : [],
        searchQueries: Array.isArray(payload.searchQueries) ? payload.searchQueries : [],
      });
    } catch (err) {
      setBenchmarkError(err instanceof Error ? err.message : 'Unable to reach benchmark service.');
    } finally {
      setBenchmarkLoading(false);
    }
  };

  const chartTickColor = isDark ? '#8E96B0' : '#5F6576';
  const chartGridColor = isDark ? '#232B4A' : '#E4DFD6';
  const inStack = selectedIds.includes(activeApp.id);

  return (
    <div className="space-y-6">
      {/* SECTION 1: 13-PRODUCT EVIDENCE-DRIVEN ROI CALCULATOR */}
      <section className="rounded-xl bg-white dark:bg-[#141A32] border border-[#E4DFD6] dark:border-[#232B4A] p-5 sm:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-[#E4DFD6] dark:border-[#232B4A]">
          <div>
            <div className="text-xs font-mono text-[#1C6E46] dark:text-[#6FCB9F] font-semibold">
              Evidence-Driven Unit Economics · 13 Sovereign Solutions
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-[#16213A] dark:text-[#E7EBF5] tracking-tight mt-0.5">
              Client ROI, Payback Period &amp; 3-Year Sovereign TCO Calculator
            </h2>
            <p className="text-xs text-[#5F6576] dark:text-[#8E96B0] mt-1">
              Model bottom-up 12-month client ROI, on-premises hardware amortization, and Spenta 3-year account LTV per solution or across your composed stack.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div className="inline-flex rounded-lg bg-[#F2EFE9] dark:bg-[#0B1020] p-1 border border-[#E4DFD6] dark:border-[#232B4A]">
              <button
                type="button"
                onClick={() => {
                  setMode('single');
                  setServerTierOverride(null);
                }}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  mode === 'single'
                    ? 'bg-[#1F3863] text-white dark:bg-[#8FA6E8] dark:text-[#0B1020]'
                    : 'text-[#5F6576] dark:text-[#8E96B0] hover:text-[#16213A] dark:hover:text-[#E7EBF5]'
                }`}
              >
                Single Solution
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('stack');
                  setServerTierOverride(null);
                }}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  mode === 'stack'
                    ? 'bg-[#1C6E46] text-white dark:bg-[#6FCB9F] dark:text-[#0B1020]'
                    : 'text-[#5F6576] dark:text-[#8E96B0] hover:text-[#16213A] dark:hover:text-[#E7EBF5]'
                }`}
              >
                Active Stack ({selectedApps.length})
              </button>
            </div>
          </div>
        </div>

        {/* Main 2-column split */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-5">
          {/* Left Controls */}
          <div className="lg:col-span-5 space-y-5">
            {mode === 'single' ? (
              <>
                <div>
                  <label
                    htmlFor="roi-product-select"
                    className="block text-xs font-semibold text-[#16213A] dark:text-[#E7EBF5] mb-1.5"
                  >
                    Digital Solution (13 Composable Modules)
                  </label>
                  <select
                    id="roi-product-select"
                    value={activeApp.id}
                    onChange={(e) => {
                      setActiveAppId(e.target.value);
                      setServerTierOverride(null);
                    }}
                    className="w-full rounded-lg bg-[#FAF8F4] dark:bg-[#0B1020] border border-[#E4DFD6] dark:border-[#232B4A] px-3 py-2.5 text-sm font-semibold text-[#16213A] dark:text-[#E7EBF5] focus:outline-none focus:border-[#1C6E46] dark:focus:border-[#6FCB9F]"
                  >
                    {SPENTA_APPS.map((app) => (
                      <option key={app.id} value={app.id}>
                        {app.shortName} — {app.setupLabel} ({app.gmPct.toFixed(1)}% GM)
                      </option>
                    ))}
                  </select>
                  <div className="flex items-center justify-between gap-2 mt-2 text-xs text-[#5F6576] dark:text-[#8E96B0]">
                    <span>
                      {activeApp.category} · Proof: {activeApp.proofClient}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleApp(activeApp.id)}
                      className="text-xs font-semibold text-[#1C6E46] dark:text-[#6FCB9F] hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {inStack ? 'In Stack ✓' : '+ Add to Stack'}
                    </button>
                  </div>
                </div>

                <div className="pt-4 border-t border-[#E4DFD6] dark:border-[#232B4A]">
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="font-semibold text-[#16213A] dark:text-[#E7EBF5]">
                      {activeProfile.driver.label}
                    </span>
                    <span className="font-mono font-bold text-[#1C6E46] dark:text-[#6FCB9F] tabular-nums">
                      {currentScale} {activeProfile.driver.unit}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={activeProfile.driver.min}
                    max={activeProfile.driver.max}
                    step={activeProfile.driver.step}
                    value={currentScale}
                    onChange={(e) =>
                      setScaleMap((prev) => ({
                        ...prev,
                        [activeApp.id]: Number(e.target.value),
                      }))
                    }
                    className="w-full accent-[#1C6E46] dark:accent-[#6FCB9F] cursor-pointer"
                  />
                  <div className="flex justify-between text-[11px] font-mono text-[#5F6576] dark:text-[#8E96B0] mt-1 tabular-nums">
                    <span>
                      {activeProfile.driver.min} {activeProfile.driver.unit}
                    </span>
                    <span>
                      Default: {activeProfile.driver.defaultValue} {activeProfile.driver.unit}
                    </span>
                    <span>
                      {activeProfile.driver.max} {activeProfile.driver.unit}
                    </span>
                  </div>
                  <p className="text-xs text-[#5F6576] dark:text-[#8E96B0] mt-2 leading-relaxed">
                    {activeProfile.driver.description}
                  </p>
                </div>
              </>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#16213A] dark:text-[#E7EBF5]">
                    Composed Sovereign Stack Modules ({selectedApps.length})
                  </span>
                  <span className="font-mono text-xs text-[#1C6E46] dark:text-[#6FCB9F] tabular-nums">
                    Shared {SERVER_TIERS[effectiveTier].code}
                  </span>
                </div>
                {selectedApps.length === 0 ? (
                  <p className="text-xs text-[#5F6576] dark:text-[#8E96B0]">
                    No modules in Stack Composer yet—defaulting preview to AI Healthcare ERP. Add modules from the table below to model a multi-app stack.
                  </p>
                ) : (
                  <div className="divide-y divide-[#EFEBE3] dark:divide-[#1E2642] border-y border-[#E4DFD6] dark:border-[#232B4A]">
                    {selectedApps.map((app) => {
                      const prof = PRODUCT_ROI_PROFILES[app.id];
                      const val = scaleMap[app.id] ?? prof.driver.defaultValue;
                      return (
                        <div key={app.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                          <div className="min-w-0">
                            <div className="font-semibold text-[#16213A] dark:text-[#E7EBF5] truncate">
                              {app.shortName}
                            </div>
                            <div className="text-[11px] text-[#5F6576] dark:text-[#8E96B0] font-mono tabular-nums">
                              {app.setupLabel} · {prof.driver.label}: {val} {prof.driver.unit}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setActiveAppId(app.id);
                              setMode('single');
                            }}
                            className="text-[11px] font-semibold text-[#1F3863] dark:text-[#8FA6E8] hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            Tune scale
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Sovereign Server Tier & Hardware CapEx Controls */}
            <div className="pt-4 border-t border-[#E4DFD6] dark:border-[#232B4A] space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#16213A] dark:text-[#E7EBF5]">
                  <Server className="w-3.5 h-3.5 text-[#1C6E46] dark:text-[#6FCB9F]" />
                  <span>On-Premises Server PC Tier</span>
                </span>
                <label className="inline-flex items-center gap-1.5 text-xs text-[#5F6576] dark:text-[#8E96B0] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeHardware}
                    onChange={(e) => setIncludeHardware(e.target.checked)}
                    className="accent-[#1C6E46] dark:accent-[#6FCB9F]"
                  />
                  <span>Include CapEx</span>
                </label>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {([4, 3, 2, 1] as ServerTierId[]).map((tid) => {
                  const tier = SERVER_TIERS[tid];
                  const active = effectiveTier === tid;
                  return (
                    <button
                      key={tid}
                      type="button"
                      onClick={() => setServerTierOverride(tid)}
                      className={`px-2 py-2 rounded-lg border text-center transition-colors cursor-pointer ${
                        active
                          ? 'bg-[#1F3863] text-white border-[#1F3863] dark:bg-[#8FA6E8] dark:text-[#0B1020] dark:border-[#8FA6E8]'
                          : 'bg-[#FAF8F4] dark:bg-[#0B1020] text-[#16213A] dark:text-[#E7EBF5] border-[#E4DFD6] dark:border-[#232B4A] hover:border-[#1F3863]/50'
                      }`}
                    >
                      <div className="font-mono text-[11px] font-bold">{tier.code}</div>
                      <div className="font-mono text-[10px] opacity-85 tabular-nums">
                        {formatUsd(tier.capexMidUsd)}
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="text-[11px] text-[#5F6576] dark:text-[#8E96B0]">
                {SERVER_TIERS[effectiveTier].name} · {SERVER_TIERS[effectiveTier].capex} ({SERVER_TIERS[effectiveTier].speed})
              </div>
            </div>

            {/* Adjacent Proof Evidence */}
            <div className="pt-4 border-t border-[#E4DFD6] dark:border-[#232B4A] space-y-1.5">
              <div className="text-xs font-semibold text-[#16213A] dark:text-[#E7EBF5]">
                Evidence Basis &amp; Value Mechanism
              </div>
              <p className="text-xs text-[#4A5568] dark:text-[#C8D0E4] leading-relaxed">
                {mode === 'stack'
                  ? 'Multi-module Sovereign OS deployments amortize one shared on-prem server tier and L5 OPA governance bus across every selected vertical module.'
                  : activeProfile.evidenceBasis}
              </p>
              {mode === 'single' && (
                <p className="text-xs text-[#5F6576] dark:text-[#8E96B0] leading-relaxed">
                  {activeProfile.valueMechanism}
                </p>
              )}
            </div>
          </div>

          {/* Right Computed KPIs + 3-Yr TCO Chart + Google Search Verification */}
          <div className="lg:col-span-7 space-y-5">
            {/* 4 Key ROI Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-lg bg-[#FAF8F4] dark:bg-[#0B1020] border border-[#E4DFD6] dark:border-[#232B4A] p-3.5">
                <div className="text-[11px] text-[#5F6576] dark:text-[#8E96B0]">Client 12-Mo ROI</div>
                <div className="font-mono text-2xl font-bold text-[#1C6E46] dark:text-[#6FCB9F] mt-1 tabular-nums">
                  {activeResult.client12MoRoiPct}%
                </div>
                <div className="text-[11px] font-mono text-[#5F6576] dark:text-[#8E96B0] mt-0.5 tabular-nums">
                  Net +{formatUsd(activeResult.year1NetBenefitUsd)}
                </div>
              </div>

              <div className="rounded-lg bg-[#FAF8F4] dark:bg-[#0B1020] border border-[#E4DFD6] dark:border-[#232B4A] p-3.5">
                <div className="text-[11px] text-[#5F6576] dark:text-[#8E96B0]">Payback Period</div>
                <div className="font-mono text-2xl font-bold text-[#16213A] dark:text-[#E7EBF5] mt-1 tabular-nums">
                  {activeResult.paybackMonths} mo
                </div>
                <div className="text-[11px] font-mono text-[#5F6576] dark:text-[#8E96B0] mt-0.5 tabular-nums">
                  Y1 Cost {formatUsd(activeResult.year1ClientInvestmentUsd)}
                </div>
              </div>

              <div className="rounded-lg bg-[#FAF8F4] dark:bg-[#0B1020] border border-[#E4DFD6] dark:border-[#232B4A] p-3.5">
                <div className="text-[11px] text-[#5F6576] dark:text-[#8E96B0]">3-Yr TCO Savings</div>
                <div className="font-mono text-2xl font-bold text-[#1F3863] dark:text-[#8FA6E8] mt-1 tabular-nums">
                  {formatUsd(activeResult.threeYrSavingsUsd)}
                </div>
                <div className="text-[11px] font-mono text-[#5F6576] dark:text-[#8E96B0] mt-0.5 tabular-nums">
                  vs. Western Cloud
                </div>
              </div>

              <div className="rounded-lg bg-[#FAF8F4] dark:bg-[#0B1020] border border-[#E4DFD6] dark:border-[#232B4A] p-3.5">
                <div className="text-[11px] text-[#5F6576] dark:text-[#8E96B0]">Spenta 3-Yr LTV</div>
                <div className="font-mono text-2xl font-bold text-[#16213A] dark:text-[#E7EBF5] mt-1 tabular-nums">
                  {formatUsd(activeResult.spenta3YrLtvUsd)}
                </div>
                <div className="text-[11px] font-mono text-[#1C6E46] dark:text-[#6FCB9F] mt-0.5 tabular-nums">
                  {activeResult.spenta3YrBlendedGmPct}% 3-Yr GM
                </div>
              </div>
            </div>

            {/* Breakdown Row (Strictly Separated One-Time vs Annual Recurring vs Hardware) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono tabular-nums border-y border-[#E4DFD6] dark:border-[#232B4A] py-3">
              <div>
                <span className="text-[#5F6576] dark:text-[#8E96B0]">One-Time Build: </span>
                <strong className="text-[#16213A] dark:text-[#E7EBF5]">
                  {formatUsd(activeResult.oneTimeBuildUsd)}
                </strong>
              </div>
              <div>
                <span className="text-[#5F6576] dark:text-[#8E96B0]">Annual Recurring ARR/SLA: </span>
                <strong className="text-[#1C6E46] dark:text-[#6FCB9F]">
                  {formatUsd(activeResult.annualRecurringUsd)}/yr
                </strong>
              </div>
              <div>
                <span className="text-[#5F6576] dark:text-[#8E96B0]">Server CapEx ({SERVER_TIERS[effectiveTier].code}): </span>
                <strong className="text-[#16213A] dark:text-[#E7EBF5]">
                  {formatUsd(activeResult.serverCapexUsd)}
                </strong>
              </div>
            </div>

            {/* 3-Year TCO Comparison Chart */}
            <div className="rounded-lg bg-[#FAF8F4] dark:bg-[#0B1020] border border-[#E4DFD6] dark:border-[#232B4A] p-4">
              <div className="flex items-center justify-between gap-2 mb-3">
                <span className="text-xs font-semibold text-[#16213A] dark:text-[#E7EBF5]">
                  3-Year Total Cost of Ownership ($K USD)
                </span>
                <span className="font-mono text-[11px] text-[#1C6E46] dark:text-[#6FCB9F] tabular-nums">
                  {activeResult.western3YrTcoUsd > 0
                    ? `${Math.round(
                        ((activeResult.western3YrTcoUsd - activeResult.spenta3YrTcoUsd) /
                          activeResult.western3YrTcoUsd) *
                          100,
                      )}% client TCO reduction`
                    : '—'}
                </span>
              </div>
              <div className="h-[155px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={tcoChartData}
                    layout="vertical"
                    margin={{ top: 4, right: 24, left: 10, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} horizontal={false} />
                    <XAxis
                      type="number"
                      tick={{ fill: chartTickColor, fontSize: 11, fontFamily: 'JetBrains Mono' }}
                      tickFormatter={(v) => `$${v}K`}
                    />
                    <YAxis
                      type="category"
                      dataKey="label"
                      width={165}
                      tick={{ fill: chartTickColor, fontSize: 11 }}
                    />
                    <Tooltip
                      formatter={(val) => [`$${Number(val ?? 0).toFixed(1)}K`, '3-Yr TCO']}
                      contentStyle={{
                        backgroundColor: isDark ? '#141A32' : '#FFFFFF',
                        borderColor: chartGridColor,
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                    />
                    <Bar dataKey="amountK" radius={[0, 6, 6, 0]} barSize={24}>
                      {tcoChartData.map((entry, index) => (
                        <Cell key={`tco-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Live Google Search Grounding Benchmark Box */}
            <div className="rounded-lg bg-[#FAF8F4] dark:bg-[#0B1020] border border-[#E4DFD6] dark:border-[#232B4A] p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-[#16213A] dark:text-[#E7EBF5] flex items-center gap-1.5">
                    <Globe2 className="w-3.5 h-3.5 text-[#1C6E46] dark:text-[#6FCB9F]" />
                    <span>Live Google Search ROI &amp; TCO Benchmark Check</span>
                  </div>
                  <p className="text-[11px] text-[#5F6576] dark:text-[#8E96B0] mt-0.5">
                    Cross-verify this product’s modeled ROI and payback against current external industry data with live web citations.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={benchmarkLoading}
                  onClick={handleVerifyBenchmarks}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#1F3863] hover:bg-[#162848] dark:bg-[#8FA6E8] dark:hover:bg-[#A6B9F0] text-white dark:text-[#0B1020] text-xs font-semibold transition-colors whitespace-nowrap shrink-0 disabled:opacity-60 cursor-pointer"
                >
                  {benchmarkLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Calculator className="w-3.5 h-3.5" />
                  )}
                  <span>{benchmarkLoading ? 'Verifying…' : 'Verify Live Benchmarks'}</span>
                </button>
              </div>

              {benchmarkError && (
                <div className="text-xs text-[#E11D48] dark:text-[#FDA4AF] bg-[#E11D48]/10 border border-[#E11D48]/25 rounded-lg px-3 py-2">
                  {benchmarkError}
                </div>
              )}

              {benchmarkLoading && (
                <div className="space-y-2 py-2 animate-pulse">
                  <div className="h-3 bg-[#E4DFD6] dark:bg-[#232B4A] rounded w-3/4" />
                  <div className="h-3 bg-[#E4DFD6] dark:bg-[#232B4A] rounded w-full" />
                  <div className="h-3 bg-[#E4DFD6] dark:bg-[#232B4A] rounded w-5/6" />
                </div>
              )}

              {!benchmarkLoading && benchmarkData && (
                <div className="pt-3 border-t border-[#E4DFD6] dark:border-[#232B4A] space-y-3">
                  <div className="text-[11px] font-mono text-[#1C6E46] dark:text-[#6FCB9F]">
                    Verified via Google Search · Subject: {benchmarkSubject}
                  </div>
                  {renderMarkdownLines(benchmarkData.text)}
                  {benchmarkData.sources.length > 0 && (
                    <div className="pt-2 border-t border-[#E4DFD6] dark:border-[#232B4A]">
                      <div className="text-[11px] font-semibold text-[#5F6576] dark:text-[#8E96B0] mb-1.5">
                        Cited Web Sources ({benchmarkData.sources.length})
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {benchmarkData.sources.slice(0, 6).map((src, idx) => (
                          <a
                            key={`${src.uri}-${idx}`}
                            href={src.uri}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-[#1F3863] dark:text-[#8FA6E8] hover:underline bg-white dark:bg-[#141A32] border border-[#E4DFD6] dark:border-[#232B4A] rounded-md px-2.5 py-1 max-w-[260px] truncate"
                          >
                            <span className="truncate">{src.title}</span>
                            <ExternalLink className="w-3 h-3 shrink-0" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 2: 5-SCOPE REVENUE GENERATION & MARGIN BRIDGE MODELER */}
      <section className="rounded-xl bg-white dark:bg-[#141A32] border border-[#E4DFD6] dark:border-[#232B4A] p-5 sm:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-[#E4DFD6] dark:border-[#232B4A]">
          <div>
            <div className="text-xs font-mono text-[#1C6E46] dark:text-[#6FCB9F] font-semibold">
              Margin Bridge Analysis · 5 Planned Revenue Generation Scopes
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-[#16213A] dark:text-[#E7EBF5] tracking-tight mt-0.5">
              Revenue Scope Mix &amp; FY2031 EBITDA Sustainability Modeler
            </h2>
            <p className="text-xs text-[#5F6576] dark:text-[#8E96B0] mt-1">
              Test how shifting mix from one-time builds (34% GM) into recurring sovereign SaaS ARR (72% GM) and 3D/Dataset IP (78% GM) bridges to 32%–43% FY2031 EBITDA.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => applyMixPreset('fy27')}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-[#E4DFD6] dark:border-[#232B4A] bg-[#FAF8F4] dark:bg-[#0B1020] text-[#16213A] dark:text-[#E7EBF5] hover:border-[#1F3863] whitespace-nowrap shrink-0 cursor-pointer"
            >
              FY2027 Baseline
            </button>
            <button
              type="button"
              onClick={() => applyMixPreset('fy31')}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#1C6E46] dark:bg-[#6FCB9F] text-white dark:text-[#0B1020] whitespace-nowrap shrink-0 cursor-pointer"
            >
              FY2031 Target Mix
            </button>
            <button
              type="button"
              onClick={() => applyMixPreset('arr-heavy')}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-[#E4DFD6] dark:border-[#232B4A] bg-[#FAF8F4] dark:bg-[#0B1020] text-[#16213A] dark:text-[#E7EBF5] hover:border-[#1C6E46] whitespace-nowrap shrink-0 cursor-pointer"
            >
              Upside ARR Mix
            </button>
            <button
              type="button"
              onClick={() => applyMixPreset('fy31')}
              aria-label="Reset revenue mix"
              className="p-1.5 rounded-lg border border-[#E4DFD6] dark:border-[#232B4A] text-[#5F6576] dark:text-[#8E96B0] hover:text-[#16213A] dark:hover:text-white cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-5">
          {/* Scope Sliders */}
          <div className="lg:col-span-7 space-y-4">
            {revenueMixMetrics.rows.map((scope) => (
              <div
                key={scope.id}
                className="pb-3.5 border-b border-[#EFEBE3] dark:border-[#1E2642] last:border-b-0 last:pb-0"
              >
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-[#16213A] dark:text-[#E7EBF5]">
                    {scope.name}
                  </span>
                  <div className="font-mono tabular-nums flex items-center gap-2 shrink-0">
                    <span className="text-[#16213A] dark:text-[#E7EBF5] font-bold">
                      {scope.normalizedSharePct.toFixed(1)}% share
                    </span>
                    <span className="text-[#5F6576] dark:text-[#8E96B0]">·</span>
                    <span className="text-[#1C6E46] dark:text-[#6FCB9F] font-semibold">
                      {scope.grossMarginPct}% GM
                    </span>
                  </div>
                </div>
                <input
                  type="range"
                  min={0}
                  max={70}
                  step={1}
                  value={scopeWeights[scope.id]}
                  onChange={(e) =>
                    setScopeWeights((prev) => ({
                      ...prev,
                      [scope.id]: Number(e.target.value),
                    }))
                  }
                  className="w-full mt-2 accent-[#1C6E46] dark:accent-[#6FCB9F] cursor-pointer"
                />
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#5F6576] dark:text-[#8E96B0] mt-1">
                  <span>{scope.examples}</span>
                  <span className="font-mono tabular-nums">
                    +{scope.gmContributionPct.toFixed(1)} pts GM
                  </span>
                </div>
              </div>
            ))}

            {/* SG&A / OpEx Ratio Slider */}
            <div className="pt-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-[#16213A] dark:text-[#E7EBF5]">
                  Operating SG&amp;A + Core Enclave OpEx Ratio (% of Revenue)
                </span>
                <span className="font-mono font-bold text-[#1F3863] dark:text-[#8FA6E8] tabular-nums">
                  {targetOpexRatioPct}% of Rev
                </span>
              </div>
              <input
                type="range"
                min={16}
                max={38}
                step={1}
                value={targetOpexRatioPct}
                onChange={(e) => setTargetOpexRatioPct(Number(e.target.value))}
                className="w-full mt-1.5 accent-[#1F3863] dark:accent-[#8FA6E8] cursor-pointer"
              />
            </div>
          </div>

          {/* Live Margin Bridge Output */}
          <div className="lg:col-span-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-[#FAF8F4] dark:bg-[#0B1020] border border-[#E4DFD6] dark:border-[#232B4A] p-4">
                <div className="text-[11px] text-[#5F6576] dark:text-[#8E96B0]">
                  Consolidated Gross Margin
                </div>
                <div className="font-mono text-2xl font-bold text-[#1C6E46] dark:text-[#6FCB9F] mt-1 tabular-nums">
                  {revenueMixMetrics.consolidatedGmPct.toFixed(1)}%
                </div>
                <div className="text-[11px] font-mono text-[#5F6576] dark:text-[#8E96B0] mt-0.5 tabular-nums">
                  vs {revenueMixMetrics.fy27BaselineGmPct.toFixed(1)}% FY27 base
                </div>
              </div>

              <div className="rounded-lg bg-[#FAF8F4] dark:bg-[#0B1020] border border-[#E4DFD6] dark:border-[#232B4A] p-4">
                <div className="text-[11px] text-[#5F6576] dark:text-[#8E96B0]">
                  Implied EBITDA Margin
                </div>
                <div
                  className={`font-mono text-2xl font-bold mt-1 tabular-nums ${
                    revenueMixMetrics.impliedEbitdaMarginPct >= 32
                      ? 'text-[#1C6E46] dark:text-[#6FCB9F]'
                      : 'text-[#D97706] dark:text-[#F5C57B]'
                  }`}
                >
                  {revenueMixMetrics.impliedEbitdaMarginPct.toFixed(1)}%
                </div>
                <div className="text-[11px] font-mono text-[#5F6576] dark:text-[#8E96B0] mt-0.5 tabular-nums">
                  Target: 32.0%–42.9% FY31
                </div>
              </div>
            </div>

            <div className="rounded-lg bg-[#FAF8F4] dark:bg-[#0B1020] border border-[#E4DFD6] dark:border-[#232B4A] p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-[#16213A] dark:text-[#E7EBF5] flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-[#1C6E46] dark:text-[#6FCB9F]" />
                  <span>Gross Margin Contribution by Scope (pts)</span>
                </span>
              </div>
              <div className="h-[190px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={revenueMixMetrics.rows}
                    margin={{ top: 8, right: 12, left: -12, bottom: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} vertical={false} />
                    <XAxis
                      dataKey="shortName"
                      tick={{ fill: chartTickColor, fontSize: 10 }}
                      interval={0}
                      angle={-15}
                      textAnchor="end"
                      height={44}
                    />
                    <YAxis
                      tick={{ fill: chartTickColor, fontSize: 10, fontFamily: 'JetBrains Mono' }}
                      tickFormatter={(v) => `${v}%`}
                    />
                    <Tooltip
                      formatter={(val) => [`${Number(val ?? 0).toFixed(1)} pts`, 'GM Contribution']}
                      contentStyle={{
                        backgroundColor: isDark ? '#141A32' : '#FFFFFF',
                        borderColor: chartGridColor,
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                    />
                    <Bar dataKey="gmContributionPct" radius={[5, 5, 0, 0]} barSize={28}>
                      {revenueMixMetrics.rows.map((entry) => (
                        <Cell key={entry.id} fill={entry.accent} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 pt-2 border-t border-[#E4DFD6] dark:border-[#232B4A] flex items-center gap-2 text-xs text-[#4A5568] dark:text-[#C8D0E4]">
                {revenueMixMetrics.impliedEbitdaMarginPct >= 32 ? (
                  <>
                    <Check className="w-4 h-4 text-[#1C6E46] dark:text-[#6FCB9F] shrink-0" />
                    <span>
                      Sustains Spenta’s reconciled FY2031 EBITDA target (32.0% Conservative / 42.9% Upside).
                    </span>
                  </>
                ) : (
                  <>
                    <Layers className="w-4 h-4 text-[#D97706] dark:text-[#F5C57B] shrink-0" />
                    <span>
                      Increase Recurring SaaS ARR or 3D/Dataset IP share to bridge above the 32.0% FY2031 EBITDA threshold.
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
