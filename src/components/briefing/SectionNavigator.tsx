import React from 'react';
import { BRIEFING_CHAPTERS, InvestorPersonaTrack } from '../../data/unifiedSsotData';

interface SectionNavigatorProps {
  chapters: readonly (typeof BRIEFING_CHAPTERS)[number][];
  activeChapterId: string;
  personaTrack: InvestorPersonaTrack;
  onSelectChapter: (chapterId: string) => void;
}

export function SectionNavigator({
  chapters,
  activeChapterId,
  personaTrack,
  onSelectChapter,
}: SectionNavigatorProps) {
  const activeIndex = Math.max(
    0,
    chapters.findIndex((c) => c.id === activeChapterId),
  );

  return (
    <nav
      aria-label="Investor Briefing section navigator"
      data-testid="section-navigator"
      className="sm:sticky sm:top-14 z-20 -mx-1 px-2.5 py-2.5 bg-[#FAF8F4]/95 dark:bg-[#0B1020]/95 backdrop-blur-sm border-y border-[#E4DFD6] dark:border-[#232B4A] flex items-center gap-1.5 overflow-x-auto no-scrollbar"
    >
      {chapters.map((ch, idx) => {
        const isActive = ch.id === activeChapterId;
        const isPassed = idx < activeIndex;
        const isPrioritized = ch.recommendedFor.includes(personaTrack);

        return (
          <React.Fragment key={ch.id}>
            <button
              type="button"
              onClick={() => onSelectChapter(ch.id)}
              aria-current={isActive ? 'location' : undefined}
              data-testid={`section-node-${ch.id}`}
              data-active={isActive ? 'true' : 'false'}
              title={`${ch.num}. ${ch.title}`}
              className={`group relative inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs whitespace-nowrap shrink-0 cursor-pointer origin-center transition-[transform,background-color,border-color,color,box-shadow] duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] hover:scale-[1.06] focus-visible:scale-[1.05] active:scale-[0.99] motion-reduce:transform-none motion-reduce:hover:scale-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1F3863] dark:focus-visible:ring-[#8FA6E8] ${
                isActive
                  ? 'spenta-section-node-active bg-[#1F3863] dark:bg-[#141A32] text-white dark:text-[#E7EBF5] border border-[#1C6E46] dark:border-[#6FCB9F] font-semibold'
                  : isPrioritized
                    ? 'bg-white dark:bg-[#141A32] border border-[#1F3863]/30 dark:border-[#8FA6E8]/35 text-[#16213A] dark:text-[#E7EBF5] font-medium hover:border-[#1F3863] dark:hover:border-[#8FA6E8]'
                    : 'bg-transparent border border-transparent text-[#5F6576] dark:text-[#8E96B0] font-medium hover:text-[#16213A] dark:hover:text-[#E7EBF5] hover:bg-white/80 dark:hover:bg-[#141A32]/80 hover:border-[#E4DFD6] dark:hover:border-[#232B4A]'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full shrink-0 transition-transform duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-125 motion-reduce:transition-none motion-reduce:group-hover:scale-100 ${
                  isActive
                    ? 'bg-[#6FCB9F]'
                    : isPassed
                      ? 'bg-[#1C6E46] dark:bg-[#6FCB9F]/80'
                      : isPrioritized
                        ? 'bg-[#1F3863]/65 dark:bg-[#8FA6E8]/75'
                        : 'bg-[#CFC8BC] dark:bg-[#333F69]'
                }`}
                aria-hidden="true"
              />
              <span className="font-mono text-[11px] tabular-nums opacity-75">
                {ch.num}
              </span>
              <span>{ch.shortTitle}</span>
            </button>

            {idx < chapters.length - 1 && (
              <span
                aria-hidden="true"
                className={`hidden xl:block h-px w-2.5 shrink-0 transition-colors ${
                  idx < activeIndex
                    ? 'bg-[#1C6E46]/60 dark:bg-[#6FCB9F]/60'
                    : 'bg-[#E4DFD6] dark:bg-[#232B4A]'
                }`}
              />
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
