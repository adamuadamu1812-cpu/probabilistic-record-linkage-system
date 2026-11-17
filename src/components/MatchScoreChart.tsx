import React, { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { CandidatePair } from '../types/linkage';

interface MatchScoreChartProps {
  pairs: CandidatePair[];
  priorMatch: number;
  lowerThreshold: number;
  upperThreshold: number;
  hasGroundTruth: boolean;
}

type ChartColorMode = 'decision' | 'ground_truth';

interface ScoreBin {
  label: string;
  minPct: number;
  maxPct: number;
  matchCount: number;
  clericalCount: number;
  nonMatchCount: number;
  trueMatchCount: number;
  trueNonMatchCount: number;
  total: number;
}

function posteriorFromWeight(weight: number, priorMatch: number): number {
  const p = Math.min(0.9995, Math.max(0.0005, priorMatch));
  const logPriorOdds = Math.log(p / (1 - p));
  const logOdds = logPriorOdds + weight * Math.LN2;
  return 1 / (1 + Math.exp(-Math.min(30, Math.max(-30, logOdds))));
}

interface ScoreTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: ScoreBin }>;
  mode: ChartColorMode;
}

const ScoreTooltip: React.FC<ScoreTooltipProps> = ({ active, payload, mode }) => {
  if (!active || !payload || payload.length === 0) return null;
  const bin = payload[0].payload;

  return (
    <div className="bg-white border border-slate-200 rounded-md px-3 py-2 shadow-sm text-xs">
      <div className="font-mono font-semibold text-slate-900 tabular-nums">
        Match Score: {bin.label}
      </div>
      <div className="mt-1 space-y-0.5 font-mono tabular-nums text-slate-700">
        {mode === 'decision' ? (
          <>
            <div className="flex justify-between gap-4">
              <span className="text-emerald-700">Match:</span>
              <span>{bin.matchCount}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-amber-700">Clerical:</span>
              <span>{bin.clericalCount}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-red-700">Non-Match:</span>
              <span>{bin.nonMatchCount}</span>
            </div>
          </>
        ) : (
          <>
            <div className="flex justify-between gap-4">
              <span className="text-blue-700">True Same Entity:</span>
              <span>{bin.trueMatchCount}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-slate-600">Distinct Entities:</span>
              <span>{bin.trueNonMatchCount}</span>
            </div>
          </>
        )}
        <div className="pt-1 mt-1 border-t border-slate-100 flex justify-between gap-4 text-slate-500">
          <span>Total Pairs:</span>
          <span>{bin.total}</span>
        </div>
      </div>
    </div>
  );
};

export const MatchScoreChart: React.FC<MatchScoreChartProps> = ({
  pairs,
  priorMatch,
  lowerThreshold,
  upperThreshold,
  hasGroundTruth,
}) => {
  const [colorMode, setColorMode] = useState<ChartColorMode>('decision');
  const activeMode: ChartColorMode = hasGroundTruth ? colorMode : 'decision';

  const bins = useMemo<ScoreBin[]>(() => {
    const deciles: ScoreBin[] = Array.from({ length: 10 }, (_, i) => {
      const minPct = i * 10;
      const maxPct = (i + 1) * 10;
      return {
        label: `${minPct}–${maxPct}%`,
        minPct,
        maxPct,
        matchCount: 0,
        clericalCount: 0,
        nonMatchCount: 0,
        trueMatchCount: 0,
        trueNonMatchCount: 0,
        total: 0,
      };
    });

    for (const pair of pairs) {
      const pct = Math.min(99.9999, Math.max(0, pair.posteriorProb * 100));
      const idx = Math.min(9, Math.max(0, Math.floor(pct / 10)));
      const b = deciles[idx];
      b.total += 1;

      if (pair.finalDecision === 'match') b.matchCount += 1;
      else if (pair.finalDecision === 'clerical') b.clericalCount += 1;
      else b.nonMatchCount += 1;

      if (pair.recordA.groundTruthId && pair.recordB.groundTruthId) {
        if (pair.recordA.groundTruthId === pair.recordB.groundTruthId) {
          b.trueMatchCount += 1;
        } else {
          b.trueNonMatchCount += 1;
        }
      }
    }

    return deciles;
  }, [pairs]);

  const lowerScorePct = posteriorFromWeight(lowerThreshold, priorMatch) * 100;
  const upperScorePct = posteriorFromWeight(upperThreshold, priorMatch) * 100;
  const lowerBinIdx = Math.min(9, Math.max(0, Math.floor(Math.min(99.9999, lowerScorePct) / 10)));
  const upperBinIdx = Math.min(9, Math.max(0, Math.floor(Math.min(99.9999, upperScorePct) / 10)));
  const lowerBinLabel = bins[lowerBinIdx]?.label;
  const upperBinLabel = bins[upperBinIdx]?.label;
  const sameThresholdBin = lowerBinIdx === upperBinIdx;

  return (
    <div className="p-5 bg-white border border-slate-200 rounded-lg">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            Posterior Match Score Distribution P(M|γ)
          </h3>
          <p className="text-xs text-slate-500">
            Candidate pairs bucketed by calibrated match probability (0%–100%) with threshold cutoffs
          </p>
        </div>

        {hasGroundTruth && (
          <div className="inline-flex items-center gap-1 p-0.5 bg-slate-100 rounded-md self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setColorMode('decision')}
              className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors ${
                activeMode === 'decision'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Decisions
            </button>
            <button
              type="button"
              onClick={() => setColorMode('ground_truth')}
              className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors ${
                activeMode === 'ground_truth'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Ground Truth
            </button>
          </div>
        )}
      </div>

      {pairs.length === 0 ? (
        <div className="h-[220px] flex items-center justify-center border border-dashed border-slate-200 rounded-md text-sm text-slate-500">
          No candidate pairs available to plot match scores.
        </div>
      ) : (
        <>
          <div
            className="w-full h-[220px]"
            role="img"
            aria-label="Bar chart showing distribution of candidate pair posterior match scores"
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={bins}
                margin={{ top: 22, right: 16, left: -12, bottom: 16 }}
                barCategoryGap="18%"
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis
                  dataKey="label"
                  tick={{ fill: '#475569', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
                  stroke="#94A3B8"
                  label={{
                    value: 'Posterior Match Score P(M|γ)',
                    position: 'insideBottom',
                    offset: -10,
                    fill: '#64748B',
                    fontSize: 11,
                  }}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: '#64748B', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
                  stroke="#CBD5E1"
                />
                <Tooltip
                  content={<ScoreTooltip mode={activeMode} />}
                  cursor={{ fill: 'rgba(148, 163, 184, 0.12)' }}
                />

                {activeMode === 'decision' ? (
                  <>
                    <Bar
                      dataKey="nonMatchCount"
                      stackId="score"
                      fill="#DC2626"
                      fillOpacity={0.85}
                      isAnimationActive={false}
                    />
                    <Bar
                      dataKey="clericalCount"
                      stackId="score"
                      fill="#D97706"
                      fillOpacity={0.88}
                      isAnimationActive={false}
                    />
                    <Bar
                      dataKey="matchCount"
                      stackId="score"
                      fill="#16A34A"
                      fillOpacity={0.88}
                      isAnimationActive={false}
                      radius={[3, 3, 0, 0]}
                    />
                  </>
                ) : (
                  <>
                    <Bar
                      dataKey="trueNonMatchCount"
                      stackId="truth"
                      fill="#94A3B8"
                      fillOpacity={0.75}
                      isAnimationActive={false}
                    />
                    <Bar
                      dataKey="trueMatchCount"
                      stackId="truth"
                      fill="#1D4ED8"
                      fillOpacity={0.88}
                      isAnimationActive={false}
                      radius={[3, 3, 0, 0]}
                    />
                  </>
                )}

                {lowerBinLabel && (
                  <ReferenceLine
                    x={lowerBinLabel}
                    stroke="#B45309"
                    strokeWidth={1.75}
                    strokeDasharray="4 3"
                    label={{
                      value: sameThresholdBin
                        ? `T_λ ${lowerScorePct.toFixed(0)}% · T_μ ${upperScorePct.toFixed(0)}%`
                        : `T_λ (${lowerScorePct.toFixed(0)}%)`,
                      position: 'top',
                      fill: '#92400E',
                      fontSize: 10,
                      fontWeight: 600,
                      fontFamily: 'JetBrains Mono, monospace',
                    }}
                  />
                )}
                {!sameThresholdBin && upperBinLabel && (
                  <ReferenceLine
                    x={upperBinLabel}
                    stroke="#15803D"
                    strokeWidth={1.75}
                    strokeDasharray="4 3"
                    label={{
                      value: `T_μ (${upperScorePct.toFixed(0)}%)`,
                      position: 'top',
                      fill: '#166534',
                      fontSize: 10,
                      fontWeight: 600,
                      fontFamily: 'JetBrains Mono, monospace',
                    }}
                  />
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-600">
            {activeMode === 'decision' ? (
              <div className="flex flex-wrap items-center gap-5">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-2.5 h-2.5 rounded-xs bg-red-600/85" />
                  Non-Match
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-2.5 h-2.5 rounded-xs bg-amber-600/88" />
                  Clerical Review
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-2.5 h-2.5 rounded-xs bg-emerald-600/88" />
                  Linked Match
                </span>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-5">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-2.5 h-2.5 rounded-xs bg-blue-700/88" />
                  True Same Entity
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-2.5 h-2.5 rounded-xs bg-slate-400/75" />
                  Distinct Entities
                </span>
              </div>
            )}
            <span className="font-mono tabular-nums text-slate-500">
              Cutoffs: T_λ → {lowerScorePct.toFixed(1)}% · T_μ → {upperScorePct.toFixed(1)}%
            </span>
          </div>
        </>
      )}
    </div>
  );
};
