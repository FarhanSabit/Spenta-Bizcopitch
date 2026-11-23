import React from 'react';
import {
  BenchmarkVerifyPayload,
  InteractiveRoiCalculator,
  SharedSearchBenchmarkState,
} from './InteractiveRoiCalculator';
import { RevenueMixModeler, SharedRevenueMixProps } from './RevenueMixModeler';

export type {
  BenchmarkVerifyPayload,
  SearchGroundingResult,
  SharedSearchBenchmarkState,
} from './InteractiveRoiCalculator';
export type { MixPresetId, SharedRevenueMixProps } from './RevenueMixModeler';

interface RoiRevenueModelerProps {
  initialAppId?: string;
  sharedBenchmark?: SharedSearchBenchmarkState;
  onVerifyBenchmarks?: (payload: BenchmarkVerifyPayload) => Promise<void>;
  revenueMixProps?: SharedRevenueMixProps;
}

export function RoiRevenueModeler({
  initialAppId,
  sharedBenchmark,
  onVerifyBenchmarks,
  revenueMixProps,
}: RoiRevenueModelerProps) {
  return (
    <div className="space-y-6">
      <InteractiveRoiCalculator
        initialAppId={initialAppId}
        sharedBenchmark={sharedBenchmark}
        onVerifyBenchmarks={onVerifyBenchmarks}
      />
      <RevenueMixModeler {...revenueMixProps} />
    </div>
  );
}
