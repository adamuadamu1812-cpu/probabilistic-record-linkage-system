import React, { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { CandidatePair } from '../types/linkage';

interface WeightHistogramProps {
  pairs: CandidatePair[];
  upperThreshold: number;
  lowerThreshold: number;
}

interface HistogramBin {
  start: number;
  end: number;
  mid: number;
  rangeLabel: string;
  matchCount: number;
  clericalCount: number;
  nonMatchCount: number;
  total: number;
  avgPosteriorPct: number;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: HistogramBin }>;
}

const HistogramTooltip: React.FC<CustomTooltipProps> = ({ active, payload }) => {
  if (!active || !payload || payload.length === 0) return null;
  const bin = payload[0].payload;

  return (
    <div className="bg-white border border-slate-200 rounded-md px-3 py-2 shadow-sm text-xs">
      <div className="font-mono font-semibold text-slate-900 tabular-nums">
        Weight W(γ): [{bin.start.toFixed(1)}, {bin.end.toFixed(1)})
      </div>
      <div className="mt-1 space-y-0.5 font-mono tabular-nums text-slate-700">
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
        <div className="pt-1 mt-1 border-t border-slate-100 flex justify-between gap-4 text-slate-500">
          <span>Mean P(M|γ):</span>
          <span>{bin.total > 0 ? `${bin.avgPosteriorPct.toFixed(1)}%` : '—'}</span>
        </div>
      </div>
    </div>
  );
};

export const WeightHistogram: React.FC<WeightHistogramProps> = ({
  pairs,
  upperThreshold,
  lowerThreshold,
}) => {
  const { bins, domainMin, domainMax } = useMemo(() => {
    if (pairs.length === 0) {
      return { bins: [] as HistogramBin[], domainMin: -15, domainMax: 30 };
    }

    const weights = pairs.map((p) => p.totalWeight);
    const minVal = Math.floor(Math.min(...weights, lowerThreshold - 3));
    const maxVal = Math.ceil(Math.max(...weights, upperThreshold + 3));
    const numBins = 22;
    const span = Math.max(1, maxVal - minVal);
    const binWidth = span / numBins;

    const buckets: Array<HistogramBin & { posteriorSum: number }> = Array.from(
      { length: numBins },
      (_, i) => {
        const start = minVal + i * binWidth;
        const end = start + binWidth;
        const mid = Number(((start + end) / 2).toFixed(2));
        return {
          start,
          end,
          mid,
          rangeLabel: `${start.toFixed(1)} to ${end.toFixed(1)}`,
          matchCount: 0,
          clericalCount: 0,
          nonMatchCount: 0,
          total: 0,
          posteriorSum: 0,
          avgPosteriorPct: 0,
        };
      }
    );

    for (const p of pairs) {
      const idx = Math.min(
        numBins - 1,
        Math.max(0, Math.floor((p.totalWeight - minVal) / binWidth))
      );
      const b = buckets[idx];
      b.total += 1;
      b.posteriorSum += p.posteriorProb * 100;
      if (p.finalDecision === 'match') b.matchCount += 1;
      else if (p.finalDecision === 'clerical') b.clericalCount += 1;
      else b.nonMatchCount += 1;
    }

    const finalized: HistogramBin[] = buckets.map(({ posteriorSum, ...rest }) => ({
      ...rest,
      avgPosteriorPct: rest.total > 0 ? posteriorSum / rest.total : 0,
    }));

    return {
      bins: finalized,
      domainMin: minVal - binWidth * 0.5,
      domainMax: maxVal + binWidth * 0.5,
    };
  }, [pairs, upperThreshold, lowerThreshold]);

  if (pairs.length === 0) {
    return (
      <div className="h-[240px] flex items-center justify-center border border-dashed border-slate-200 rounded-md text-sm text-slate-500">
        No candidate pairs generated. Enable at least one blocking pass or load records.
      </div>
    );
  }

  return (
    <div className="w-full">
      <div
        className="w-full h-[240px]"
        role="img"
        aria-label="Recharts histogram of candidate pair confidence weights with lower and upper thresholds"
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={bins}
            margin={{ top: 24, right: 16, left: -12, bottom: 16 }}
            barCategoryGap={2}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />

            {/* Threshold Decision Zones */}
            <ReferenceArea
              x1={domainMin}
              x2={lowerThreshold}
              fill="#FEF2F2"
              fillOpacity={0.65}
              ifOverflow="extendDomain"
            />
            <ReferenceArea
              x1={lowerThreshold}
              x2={upperThreshold}
              fill="#FFFBEB"
              fillOpacity={0.8}
              ifOverflow="extendDomain"
            />
            <ReferenceArea
              x1={upperThreshold}
              x2={domainMax}
              fill="#F0FDF4"
              fillOpacity={0.7}
              ifOverflow="extendDomain"
            />

            <XAxis
              dataKey="mid"
              type="number"
              domain={[domainMin, domainMax]}
              tickCount={8}
              tickFormatter={(v) => Number(v).toFixed(0)}
              tick={{ fill: '#475569', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
              stroke="#94A3B8"
              label={{
                value: 'Composite Confidence Weight W(γ)',
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

            <Tooltip content={<HistogramTooltip />} cursor={{ fill: 'rgba(148, 163, 184, 0.12)' }} />

            <Bar
              dataKey="nonMatchCount"
              stackId="pairs"
              fill="#DC2626"
              fillOpacity={0.85}
              isAnimationActive={false}
              radius={[0, 0, 0, 0]}
            />
            <Bar
              dataKey="clericalCount"
              stackId="pairs"
              fill="#D97706"
              fillOpacity={0.88}
              isAnimationActive={false}
              radius={[0, 0, 0, 0]}
            />
            <Bar
              dataKey="matchCount"
              stackId="pairs"
              fill="#16A34A"
              fillOpacity={0.88}
              isAnimationActive={false}
              radius={[2, 2, 0, 0]}
            />

            {/* Lower and Upper Threshold Cut-Off Lines */}
            <ReferenceLine
              x={lowerThreshold}
              stroke="#B45309"
              strokeWidth={2}
              strokeDasharray="4 3"
              ifOverflow="extendDomain"
              label={{
                value: `T_λ = ${lowerThreshold.toFixed(1)}`,
                position: 'top',
                fill: '#92400E',
                fontSize: 11,
                fontWeight: 600,
                fontFamily: 'JetBrains Mono, monospace',
              }}
            />
            <ReferenceLine
              x={upperThreshold}
              stroke="#15803D"
              strokeWidth={2}
              strokeDasharray="4 3"
              ifOverflow="extendDomain"
              label={{
                value: `T_μ = ${upperThreshold.toFixed(1)}`,
                position: 'top',
                fill: '#166534',
                fontSize: 11,
                fontWeight: 600,
                fontFamily: 'JetBrains Mono, monospace',
              }}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-600">
        <div className="flex flex-wrap items-center gap-5">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-xs bg-red-600/85" />
            Non-Match (&lt; T_λ)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-xs bg-amber-600/88" />
            Clerical Review [T_λ, T_μ)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-xs bg-emerald-600/88" />
            Linked Match (≥ T_μ)
          </span>
        </div>
        <span className="font-mono tabular-nums text-slate-500">
          n = {pairs.length} candidate pairs
        </span>
      </div>
    </div>
  );
};

interface EMConvergenceChartProps {
  history: number[];
}

export const EMConvergenceChart: React.FC<EMConvergenceChartProps> = ({ history }) => {
  if (history.length < 2) {
    return null;
  }

  const width = 320;
  const height = 104;
  const padL = 48;
  const padR = 12;
  const padT = 10;
  const padB = 22;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const minLL = Math.min(...history);
  const maxLL = Math.max(...history);
  const span = Math.max(0.001, maxLL - minLL);

  const points = history
    .map((val, idx) => {
      const x = padL + (idx / Math.max(1, history.length - 1)) * plotW;
      const y = padT + plotH - ((val - minLL) / span) * plotH;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-auto"
      role="img"
      aria-label="EM Log-Likelihood Convergence"
    >
      <line x1={padL} y1={padT} x2={padL} y2={padT + plotH} stroke="#CBD5E1" strokeWidth={1} />
      <line
        x1={padL}
        y1={padT + plotH}
        x2={padL + plotW}
        y2={padT + plotH}
        stroke="#CBD5E1"
        strokeWidth={1}
      />
      <polyline fill="none" stroke="#1D4ED8" strokeWidth={1.75} points={points} />
      <text x={padL - 6} y={padT + 8} textAnchor="end" className="fill-slate-500 text-[9px] font-mono tabular-nums">
        {maxLL.toFixed(0)}
      </text>
      <text x={padL - 6} y={padT + plotH} textAnchor="end" className="fill-slate-500 text-[9px] font-mono tabular-nums">
        {minLL.toFixed(0)}
      </text>
      <text x={padL} y={height - 5} className="fill-slate-500 text-[9px] font-mono tabular-nums">
        Iter 1
      </text>
      <text
        x={padL + plotW}
        y={height - 5}
        textAnchor="end"
        className="fill-slate-500 text-[9px] font-mono tabular-nums"
      >
        Iter {history.length}
      </text>
    </svg>
  );
};
