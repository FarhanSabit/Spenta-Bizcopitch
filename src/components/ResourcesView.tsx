import React, { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  Check,
  CheckCircle2,
  Copy,
  Download,
  Layers,
  Mail,
  Send,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import {
  CASE_STUDIES,
  COMPLIANCE_FRAMEWORKS,
  SERVER_TIERS,
  SPENTA_CONTACT_EMAIL,
} from '../data/spentaManifest';
import { SavedProposal, useStack } from '../store/StackContext';
import { copyTextWithFallback } from '../utils/shareUrlCodec';
import { DesignComparisonTable } from './DesignComparisonTable';
import { PromptThemeStudio } from './PromptThemeStudio';

const SECTORS = [
  'All',
  'Healthcare & Biopharma',
  'Banking & Fintech',
  'Enterprise Core & BI',
  'Retail & Commerce',
  'Energy & Mobility',
] as const;

export function ResourcesView() {
  const {
    selectedApps,
    selectedIds,
    toggleApp,
    stackMetrics,
    savedProposals,
    saveProposal,
    deleteProposal,
    exportStackJson,
    buildExecutiveBrief,
    buildMailtoHref,
    setDrawerOpen,
    pendingNavFocus,
    clearPendingNavFocus,
    deploymentTarget,
    deploymentProfile,
  } = useStack();

  const [resourcesMode, setResourcesMode] = useState<'proofs' | 'studio'>('proofs');
  const [sectorFilter, setSectorFilter] = useState<(typeof SECTORS)[number]>('All');
  const [organization, setOrganization] = useState('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [deployment, setDeployment] = useState<'On-Prem' | 'Private VPC' | 'Air-Gap' | 'SaaS'>(
    () =>
      deploymentTarget === 'private-vpc'
        ? 'Private VPC'
        : deploymentTarget === 'air-gapped'
          ? 'Air-Gap'
          : 'On-Prem',
  );
  const [timeline, setTimeline] = useState('Q2–Q3 Pilot (60–90 Days)');
  const [notes, setNotes] = useState('');
  const [lastSubmitted, setLastSubmitted] = useState<SavedProposal | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    setDeployment(
      deploymentTarget === 'private-vpc'
        ? 'Private VPC'
        : deploymentTarget === 'air-gapped'
          ? 'Air-Gap'
          : 'On-Prem',
    );
  }, [deploymentTarget]);

  useEffect(() => {
    if (pendingNavFocus?.type === 'studio') {
      setResourcesMode('studio');
      clearPendingNavFocus();
    } else if (pendingNavFocus?.type === 'case') {
      setResourcesMode('proofs');
      const match = SECTORS.find((s) => s === pendingNavFocus.id);
      if (match) setSectorFilter(match);
      clearPendingNavFocus();
    }
  }, [pendingNavFocus, clearPendingNavFocus]);

  const filteredCases = useMemo(() => {
    if (sectorFilter === 'All') return CASE_STUDIES;
    return CASE_STUDIES.filter((c) => c.sector === sectorFilter);
  }, [sectorFilter]);

  const handleLoadCaseStudyApps = (appIds: string[]) => {
    appIds.forEach((id) => {
      if (!selectedIds.includes(id)) {
        toggleApp(id);
      }
    });
    setDrawerOpen(true);
  };

  const handleSubmitProposal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization.trim() || !contactName.trim() || !email.trim()) return;
    const saved = saveProposal({
      organization: organization.trim(),
      contactName: contactName.trim(),
      email: email.trim(),
      deployment,
      timeline,
      notes: notes.trim(),
    });
    setLastSubmitted(saved);
    setOrganization('');
    setContactName('');
    setEmail('');
    setNotes('');
  };

  const downloadProposalJson = (proposal: SavedProposal) => {
    const blob = new Blob([JSON.stringify(proposal, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `spenta-proposal-${proposal.organization
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const copyBrief = async (key: string, text: string) => {
    const ok = await copyTextWithFallback(text);
    if (ok) {
      setCopiedId(key);
      window.setTimeout(() => setCopiedId(null), 2000);
    }
  };

  const tierSpec = SERVER_TIERS[stackMetrics.tier];

  return (
    <div className="space-y-6">
      {/* Header */}
      <section className="rounded-2xl border border-[#E4DFD6] dark:border-[#232B4A] bg-white dark:bg-[#141A32] p-5 flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <div className="text-[11px] font-mono text-[#1C6E46] dark:text-[#6FCB9F] uppercase tracking-[0.14em]">
            ENTERPRISE PROOFS · REGULATORY COMPLIANCE · AGENT PROMPT PACK
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-[#16213A] dark:text-[#E7EBF5] tracking-tight mt-1">
            Resources — Case Studies, Proposals &amp; Prompt Studio
          </h1>
          <p className="text-xs sm:text-sm text-[#4A5568] dark:text-[#A4ADC6] mt-1 max-w-3xl">
            Inspect verified deployments and compliance controls, build a stack-aware proposal routed to{' '}
            <span className="font-mono text-[#16213A] dark:text-[#E7EBF5]">{SPENTA_CONTACT_EMAIL}</span>, or download the P0/P1/P2 coding-agent Markdown prompt pack and 4-theme design studio.
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Resources workspace view"
          className="inline-flex flex-wrap items-center gap-1 p-1 rounded-lg bg-[#F2EFE9] dark:bg-[#0F1529] border border-[#E4DFD6] dark:border-[#232B4A] self-start lg:self-auto"
        >
          <button
            type="button"
            role="tab"
            aria-selected={resourcesMode === 'proofs'}
            onClick={() => setResourcesMode('proofs')}
            className={`min-h-[36px] px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              resourcesMode === 'proofs'
                ? 'bg-[#1F3863] text-white dark:bg-[#8FA6E8] dark:text-[#0B1020]'
                : 'text-[#4A5568] dark:text-[#A4ADC6] hover:text-[#16213A] dark:hover:text-[#E7EBF5]'
            }`}
          >
            Proofs &amp; Proposals
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={resourcesMode === 'studio'}
            onClick={() => setResourcesMode('studio')}
            className={`min-h-[36px] px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              resourcesMode === 'studio'
                ? 'bg-[#1F3863] text-white dark:bg-[#8FA6E8] dark:text-[#0B1020]'
                : 'text-[#4A5568] dark:text-[#A4ADC6] hover:text-[#16213A] dark:hover:text-[#E7EBF5]'
            }`}
          >
            Prompt Pack &amp; Theme Studio
          </button>
        </div>
      </section>

      {resourcesMode === 'studio' ? (
        <PromptThemeStudio />
      ) : (
        <>
          {/* Enterprise Case Studies */}
          <section className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="inline-flex items-center gap-2">
            <Building2 className="w-4 h-4 text-[#1C6E46] dark:text-[#6FCB9F]" strokeWidth={1.5} />
            <h2 className="text-base sm:text-lg font-bold text-[#16213A] dark:text-[#E7EBF5]">
              Verified Enterprise Case Studies ({filteredCases.length})
            </h2>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {SECTORS.map((sec) => (
              <button
                key={sec}
                type="button"
                onClick={() => setSectorFilter(sec)}
                className={`min-h-[34px] px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  sectorFilter === sec
                    ? 'bg-[#1F3863] text-white dark:bg-[#8FA6E8] dark:text-[#0B1020]'
                    : 'bg-white dark:bg-[#141A32] text-[#4A5568] dark:text-[#A4ADC6] border border-[#E4DFD6] dark:border-[#232B4A] hover:border-[#1F3863]/45 dark:hover:border-[#8FA6E8]/45'
                }`}
              >
                {sec}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredCases.map((cs) => (
            <article
              key={cs.id}
              className="rounded-2xl border border-[#E4DFD6] dark:border-[#232B4A] bg-white dark:bg-[#141A32] p-5 flex flex-col justify-between hover:border-[#1F3863]/45 dark:hover:border-[#8FA6E8]/45 transition-colors"
            >
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono">
                  <span className="text-[#1C6E46] dark:text-[#6FCB9F] font-bold uppercase">
                    {cs.sector}
                  </span>
                  <span className="text-[#5F6576] dark:text-[#8E96B0]">
                    {cs.region} · {cs.deployment}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 mt-1.5">
                  <h3 className="text-base sm:text-lg font-extrabold text-[#16213A] dark:text-[#E7EBF5]">
                    {cs.client}
                  </h3>
                  <span className="text-[10px] font-mono uppercase text-[#5F6576] dark:text-[#8E96B0] shrink-0">
                    Verified Production
                  </span>
                </div>
                <div className="text-xs font-semibold text-[#4A5568] dark:text-[#A4ADC6] mt-0.5">
                  {cs.solution}
                </div>

                <div className="mt-3 px-3 py-2 rounded-lg bg-[#1C6E46]/10 dark:bg-[#6FCB9F]/12 border border-[#1C6E46]/25 dark:border-[#6FCB9F]/30 font-mono text-xs font-bold text-[#1C6E46] dark:text-[#6FCB9F]">
                  {cs.headlineMetric}
                </div>

                <p className="text-xs text-[#4A5568] dark:text-[#A4ADC6] leading-relaxed mt-3">
                  {cs.summary}
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-[#E4DFD6] dark:border-[#232B4A] flex items-center justify-between gap-2">
                <span className="text-[11px] font-mono text-[#5F6576] dark:text-[#8E96B0] truncate">
                  {cs.metrics[0]}
                </span>
                <button
                  type="button"
                  onClick={() => handleLoadCaseStudyApps(cs.appIds)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#1C6E46] dark:text-[#6FCB9F] hover:underline shrink-0 cursor-pointer"
                >
                  <Layers className="w-3.5 h-3.5" strokeWidth={1.5} />
                  <span>Load Pattern ({cs.appIds.length})</span>
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Compliance Readiness Badges */}
      <section className="rounded-2xl border border-[#E4DFD6] dark:border-[#232B4A] bg-white dark:bg-[#141A32] p-5">
        <div className="inline-flex items-center gap-2 mb-4">
          <ShieldCheck className="w-4 h-4 text-[#1C6E46] dark:text-[#6FCB9F]" strokeWidth={1.5} />
          <h2 className="text-base sm:text-lg font-bold text-[#16213A] dark:text-[#E7EBF5]">
            Sovereign Compliance &amp; Regulatory Readiness
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {COMPLIANCE_FRAMEWORKS.map((fw) => (
            <article
              key={fw.id}
              className="rounded-xl bg-[#FAF8F4] dark:bg-[#0F1529] border border-[#E4DFD6] dark:border-[#232B4A] p-4 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-extrabold bg-[#1C6E46]/12 dark:bg-[#6FCB9F]/15 text-[#1C6E46] dark:text-[#6FCB9F] border border-[#1C6E46]/30 dark:border-[#6FCB9F]/35 px-2.5 py-0.5 rounded">
                    {fw.code}
                  </span>
                  <span className="text-[10px] font-mono uppercase text-[#5F6576] dark:text-[#8E96B0]">
                    SLA Compliant
                  </span>
                </div>
                <h3 className="font-bold text-sm text-[#16213A] dark:text-[#E7EBF5] mt-2.5">
                  {fw.name}
                </h3>
                <p className="text-[11px] text-[#4A5568] dark:text-[#A4ADC6] mt-1">{fw.scope}</p>
                <ul className="mt-3 space-y-1.5 text-xs text-[#4A5568] dark:text-[#A4ADC6]">
                  {fw.controls.map((ctrl) => (
                    <li key={ctrl} className="flex items-start gap-1.5">
                      <Check className="w-3.5 h-3.5 text-[#1C6E46] dark:text-[#6FCB9F] shrink-0 mt-0.5" />
                      <span>{ctrl}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* 4-Way Design & Theme Comparison Table */}
      <DesignComparisonTable />

      {/* Stack-Aware Proposal Request Form */}
      <section
        id="spenta-proposal-form"
        className="rounded-2xl border border-[#E4DFD6] dark:border-[#232B4A] bg-white dark:bg-[#141A32] p-5 sm:p-6 scroll-mt-20"
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Pre-Populated Stack Context */}
          <div className="lg:col-span-5 space-y-4">
            <div>
              <div className="text-[11px] font-mono font-bold uppercase tracking-[0.14em] text-[#E11D48]">
                STACK-AWARE ENTERPRISE BRIEF
              </div>
              <h2 className="text-lg sm:text-xl font-extrabold text-[#16213A] dark:text-[#E7EBF5] mt-1">
                Request a Tailored Sovereign Architecture Proposal
              </h2>
              <p className="text-xs text-[#4A5568] dark:text-[#A4ADC6] mt-1 leading-relaxed">
                Automatically attaches your live Stack Composer selection, hardware tier sizing, and verified integrations. Submissions save locally with instant JSON export and a ready-to-send{' '}
                <span className="font-mono text-[#16213A] dark:text-[#E7EBF5]">
                  {SPENTA_CONTACT_EMAIL}
                </span>{' '}
                email draft.
              </p>
            </div>

            <div className="rounded-xl bg-[#0F1529] border border-[#6FCB9F]/35 text-[#E7EBF5] p-4 space-y-3">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-[#6FCB9F]">
                  PRE-POPULATED STACK · {deploymentProfile.switcherLabel.toUpperCase()}
                </span>
                <span className="tabular-nums text-[#A4ADC6]">{selectedApps.length} / 13 Modules</span>
              </div>

              {selectedApps.length === 0 ? (
                <p className="text-xs text-[#8E96B0]">
                  No modules currently selected. Open App Vault or Stack Composer to pick modules.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {selectedApps.map((app) => (
                    <span
                      key={app.id}
                      className="text-[11px] font-mono bg-[#6FCB9F]/15 border border-[#6FCB9F]/30 text-[#A7E6C7] px-2 py-0.5 rounded"
                    >
                      {app.shortName}
                    </span>
                  ))}
                </div>
              )}

              <div className="pt-2 border-t border-[#232B4A] grid grid-cols-2 gap-2 text-xs font-mono tabular-nums">
                <div>
                  <span className="text-[#8E96B0] block text-[10px]">ONE-TIME BUILD</span>
                  <span className="text-base font-bold text-white">
                    ${(stackMetrics.oneTimeBuildUsd / 1000).toFixed(1)}K
                  </span>
                  {stackMetrics.quarterlyRetainerUsd > 0 && (
                    <span className="block text-[10px] text-[#6FCB9F]">
                      + ${(stackMetrics.quarterlyRetainerUsd / 1000).toFixed(1)}K/qtr
                    </span>
                  )}
                </div>
                <div>
                  <span className="text-[#8E96B0] block text-[10px]">RECOMMENDED SERVER</span>
                  <span className="text-base font-bold text-amber-300">{tierSpec.code}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={selectedApps.length === 0}
                onClick={() => exportStackJson()}
                className="inline-flex items-center gap-1.5 min-h-[38px] px-3 py-2 rounded-lg border border-[#E4DFD6] dark:border-[#232B4A] bg-[#FAF8F4] dark:bg-[#0F1529] hover:border-[#1F3863]/50 dark:hover:border-[#8FA6E8]/50 disabled:opacity-50 text-xs font-semibold text-[#16213A] dark:text-[#E7EBF5] whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" strokeWidth={1.5} />
                <span>Export Stack JSON</span>
              </button>
              <button
                type="button"
                disabled={selectedApps.length === 0}
                onClick={() => copyBrief('current', buildExecutiveBrief())}
                className="inline-flex items-center gap-1.5 min-h-[38px] px-3 py-2 rounded-lg border border-[#E4DFD6] dark:border-[#232B4A] bg-[#FAF8F4] dark:bg-[#0F1529] hover:border-[#1F3863]/50 dark:hover:border-[#8FA6E8]/50 disabled:opacity-50 text-xs font-semibold text-[#16213A] dark:text-[#E7EBF5] whitespace-nowrap shrink-0 cursor-pointer"
              >
                {copiedId === 'current' ? (
                  <Check className="w-3.5 h-3.5 text-[#1C6E46] dark:text-[#6FCB9F]" />
                ) : (
                  <Copy className="w-3.5 h-3.5" strokeWidth={1.5} />
                )}
                <span>{copiedId === 'current' ? 'Copied Brief' : 'Copy Brief'}</span>
              </button>
            </div>
          </div>

          {/* Right: Proposal Form */}
          <div className="lg:col-span-7">
            <form onSubmit={handleSubmitProposal} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#16213A] dark:text-[#E7EBF5] mb-1">
                    Organization / Institution *
                  </label>
                  <input
                    type="text"
                    required
                    value={organization}
                    onChange={(e) => setOrganization(e.target.value)}
                    placeholder="e.g., Bank / Apollo Hospital Group"
                    className="w-full min-h-[40px] px-3 py-2 text-sm bg-[#FAF8F4] dark:bg-[#0F1529] border border-[#E4DFD6] dark:border-[#232B4A] rounded-lg text-[#16213A] dark:text-[#E7EBF5] placeholder:text-[#5F6576] dark:placeholder:text-[#8E96B0] focus:outline-none focus:border-[#1F3863] dark:focus:border-[#8FA6E8]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#16213A] dark:text-[#E7EBF5] mb-1">
                    Contact Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    placeholder="Your full name"
                    className="w-full min-h-[40px] px-3 py-2 text-sm bg-[#FAF8F4] dark:bg-[#0F1529] border border-[#E4DFD6] dark:border-[#232B4A] rounded-lg text-[#16213A] dark:text-[#E7EBF5] placeholder:text-[#5F6576] dark:placeholder:text-[#8E96B0] focus:outline-none focus:border-[#1F3863] dark:focus:border-[#8FA6E8]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#16213A] dark:text-[#E7EBF5] mb-1">
                    Work Email *
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.com"
                    className="w-full min-h-[40px] px-3 py-2 text-sm bg-[#FAF8F4] dark:bg-[#0F1529] border border-[#E4DFD6] dark:border-[#232B4A] rounded-lg text-[#16213A] dark:text-[#E7EBF5] placeholder:text-[#5F6576] dark:placeholder:text-[#8E96B0] focus:outline-none focus:border-[#1F3863] dark:focus:border-[#8FA6E8]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#16213A] dark:text-[#E7EBF5] mb-1">
                    Deployment Preference
                  </label>
                  <select
                    value={deployment}
                    onChange={(e) =>
                      setDeployment(
                        e.target.value as 'On-Prem' | 'Private VPC' | 'Air-Gap' | 'SaaS',
                      )
                    }
                    className="w-full min-h-[40px] px-3 py-2 text-sm bg-[#FAF8F4] dark:bg-[#0F1529] border border-[#E4DFD6] dark:border-[#232B4A] rounded-lg text-[#16213A] dark:text-[#E7EBF5] focus:outline-none focus:border-[#1F3863] dark:focus:border-[#8FA6E8]"
                  >
                    <option value="On-Prem">On-Prem Server PC (Tier 1–4)</option>
                    <option value="Private VPC">Private Sovereign VPC</option>
                    <option value="Air-Gap">Air-Gapped Enclave (Zero-Internet)</option>
                    <option value="SaaS">Managed Sovereign SaaS</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#16213A] dark:text-[#E7EBF5] mb-1">
                    Target Timeline
                  </label>
                  <select
                    value={timeline}
                    onChange={(e) => setTimeline(e.target.value)}
                    className="w-full min-h-[40px] px-3 py-2 text-sm bg-[#FAF8F4] dark:bg-[#0F1529] border border-[#E4DFD6] dark:border-[#232B4A] rounded-lg text-[#16213A] dark:text-[#E7EBF5] focus:outline-none focus:border-[#1F3863] dark:focus:border-[#8FA6E8]"
                  >
                    <option>Immediate Discovery (30 Days)</option>
                    <option>Q2–Q3 Pilot (60–90 Days)</option>
                    <option>Enterprise Multi-Site Rollout</option>
                    <option>Investor / SAFE Diligence Call</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#16213A] dark:text-[#E7EBF5] mb-1">
                  Compliance Scope, Site Count or Custom Requirements
                </label>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Share bed count, branch count, BB ICT v4.0 / HIPAA needs, or SAFE diligence questions..."
                  className="w-full px-3 py-2 text-sm bg-[#FAF8F4] dark:bg-[#0F1529] border border-[#E4DFD6] dark:border-[#232B4A] rounded-lg text-[#16213A] dark:text-[#E7EBF5] placeholder:text-[#5F6576] dark:placeholder:text-[#8E96B0] focus:outline-none focus:border-[#1F3863] dark:focus:border-[#8FA6E8]"
                />
              </div>

              <button
                type="submit"
                className="inline-flex items-center justify-center gap-2 min-h-[44px] bg-[#E11D48] hover:bg-[#BE123C] text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors cursor-pointer"
              >
                <Send className="w-4 h-4" strokeWidth={1.75} />
                <span>Save Proposal &amp; Prepare Email Draft</span>
              </button>
            </form>

            {lastSubmitted && (
              <div className="mt-4 rounded-xl bg-[#1C6E46]/10 dark:bg-[#6FCB9F]/12 border border-[#1C6E46]/30 dark:border-[#6FCB9F]/35 p-4 text-xs text-[#16213A] dark:text-[#E7EBF5] space-y-2.5">
                <div className="flex items-center gap-2 font-bold text-sm">
                  <CheckCircle2 className="w-4 h-4 text-[#1C6E46] dark:text-[#6FCB9F]" />
                  <span>Proposal saved locally for {lastSubmitted.organization}</span>
                </div>
                <p className="text-[#4A5568] dark:text-[#A4ADC6]">
                  Your architecture brief ({lastSubmitted.appIds.length} modules · $
                  {(lastSubmitted.estimatedBuildUsd / 1000).toFixed(1)}K build
                  {lastSubmitted.quarterlyRetainerUsd && lastSubmitted.quarterlyRetainerUsd > 0
                    ? ` + $${(lastSubmitted.quarterlyRetainerUsd / 1000).toFixed(1)}K/qtr`
                    : ''}{' '}
                  · Tier {lastSubmitted.recommendedTier}) is saved in your browser. Export JSON or open your email draft to{' '}
                  <span className="font-mono text-[#16213A] dark:text-[#E7EBF5]">{SPENTA_CONTACT_EMAIL}</span>:
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => downloadProposalJson(lastSubmitted)}
                    className="inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 rounded-lg bg-[#1F3863] dark:bg-[#8FA6E8] text-white dark:text-[#0B1020] font-semibold cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Proposal JSON</span>
                  </button>
                  <a
                    href={buildMailtoHref(
                      `Spenta Proposal Request — ${lastSubmitted.organization} (${lastSubmitted.appIds.length} Modules)`,
                      `Organization: ${lastSubmitted.organization}\nContact: ${lastSubmitted.contactName} (${lastSubmitted.email})\nDeployment: ${lastSubmitted.deployment}\nTimeline: ${lastSubmitted.timeline}\nNotes: ${lastSubmitted.notes || 'None'}`,
                    )}
                    className="inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 rounded-lg bg-[#1C6E46] dark:bg-[#6FCB9F] text-white dark:text-[#0B1020] font-bold"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    <span>Open Email Draft ({SPENTA_CONTACT_EMAIL})</span>
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Locally Saved Proposals History */}
        {savedProposals.length > 0 && (
          <div className="mt-6 pt-5 border-t border-[#E4DFD6] dark:border-[#232B4A]">
            <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#5F6576] dark:text-[#8E96B0] mb-3">
              Locally Saved Proposal Briefs ({savedProposals.length})
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {savedProposals.map((prop) => (
                <div
                  key={prop.id}
                  className="rounded-xl bg-[#FAF8F4] dark:bg-[#0F1529] border border-[#E4DFD6] dark:border-[#232B4A] p-3.5 flex items-start justify-between gap-3 text-xs"
                >
                  <div className="min-w-0">
                    <div className="font-bold text-[#16213A] dark:text-[#E7EBF5] truncate">
                      {prop.organization} · {prop.contactName}
                    </div>
                    <div className="font-mono text-[11px] text-[#1C6E46] dark:text-[#6FCB9F] mt-0.5 tabular-nums">
                      {prop.appIds.length} apps · ${(prop.estimatedBuildUsd / 1000).toFixed(1)}K build
                      {prop.quarterlyRetainerUsd && prop.quarterlyRetainerUsd > 0
                        ? ` + $${(prop.quarterlyRetainerUsd / 1000).toFixed(1)}K/qtr`
                        : ''}{' '}
                      · Tier {prop.recommendedTier} · {prop.deployment}
                    </div>
                    <div className="text-[11px] text-[#5F6576] dark:text-[#8E96B0] mt-0.5 truncate">
                      {prop.appNames.join(', ') || 'Custom Inquiry'}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => downloadProposalJson(prop)}
                      className="p-2 rounded bg-white dark:bg-[#141A32] border border-[#E4DFD6] dark:border-[#232B4A] text-[#4A5568] dark:text-[#A4ADC6] hover:border-[#1F3863]/50 dark:hover:border-[#8FA6E8]/50 cursor-pointer"
                      title="Download JSON"
                      aria-label={`Download JSON for ${prop.organization}`}
                    >
                      <Download className="w-3.5 h-3.5" strokeWidth={1.5} />
                    </button>
                    <a
                      href={buildMailtoHref(
                        `Spenta Proposal Request — ${prop.organization}`,
                        `Organization: ${prop.organization}\nContact: ${prop.contactName} (${prop.email})\nDeployment: ${prop.deployment}\nTimeline: ${prop.timeline}\nNotes: ${prop.notes || 'None'}`,
                      )}
                      className="p-2 rounded bg-white dark:bg-[#141A32] border border-[#E4DFD6] dark:border-[#232B4A] text-[#4A5568] dark:text-[#A4ADC6] hover:border-[#1F3863]/50 dark:hover:border-[#8FA6E8]/50"
                      title="Open email draft"
                      aria-label={`Email draft for ${prop.organization}`}
                    >
                      <Mail className="w-3.5 h-3.5" strokeWidth={1.5} />
                    </a>
                    <button
                      type="button"
                      onClick={() => deleteProposal(prop.id)}
                      className="p-2 rounded bg-white dark:bg-[#141A32] border border-[#E4DFD6] dark:border-[#232B4A] text-[#5F6576] dark:text-[#8E96B0] hover:text-[#E11D48] cursor-pointer"
                      title="Delete saved brief"
                      aria-label={`Delete ${prop.organization}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
        </>
      )}
    </div>
  );
}
