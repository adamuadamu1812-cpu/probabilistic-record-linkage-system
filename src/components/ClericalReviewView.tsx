import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, RotateCcw, Search, X } from 'lucide-react';
import type { CandidatePair, LinkageDecision } from '../types/linkage';

interface ClericalReviewViewProps {
  pairs: CandidatePair[];
  dbAName: string;
  dbBName: string;
  onAdjudicate: (pairId: string, decision: 'match' | 'non_match' | null) => void;
  onBulkAdjudicate?: (pairIds: string[], decision: 'match' | 'non_match' | null) => void;
}

type FilterMode = 'clerical' | 'all' | 'match' | 'non_match';

const DECISION_LABEL: Record<LinkageDecision, { text: string; colorClass: string }> = {
  match: { text: 'Match', colorClass: 'text-emerald-700' },
  clerical: { text: 'Clerical Review', colorClass: 'text-amber-700' },
  non_match: { text: 'Non-Match', colorClass: 'text-red-700' },
};

function getConfidenceBadgeMeta(posteriorProb: number): {
  badgeClass: string;
  uncertaintyText: string;
  isUncertain: boolean;
} {
  const pct = posteriorProb * 100;
  if (pct >= 80) {
    return {
      badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      uncertaintyText: 'High match confidence',
      isUncertain: false,
    };
  }
  if (pct >= 25) {
    return {
      badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
      uncertaintyText: 'High uncertainty',
      isUncertain: true,
    };
  }
  return {
    badgeClass: 'bg-red-50 text-red-700 border-red-200',
    uncertaintyText: 'Low match likelihood',
    isUncertain: false,
  };
}

export const ClericalReviewView: React.FC<ClericalReviewViewProps> = ({
  pairs,
  dbAName,
  dbBName,
  onAdjudicate,
  onBulkAdjudicate,
}) => {
  const [filterMode, setFilterMode] = useState<FilterMode>('clerical');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPairId, setSelectedPairId] = useState<string | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(() => new Set());
  const selectAllRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const counts = useMemo(() => {
    let clerical = 0;
    let match = 0;
    let non_match = 0;
    for (const p of pairs) {
      if (p.finalDecision === 'clerical') clerical++;
      else if (p.finalDecision === 'match') match++;
      else non_match++;
    }
    return { clerical, match, non_match, all: pairs.length };
  }, [pairs]);

  const filteredPairs = useMemo(() => {
    const tokens = searchQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return pairs.filter((p) => {
      if (filterMode !== 'all' && p.finalDecision !== filterMode) return false;
      if (tokens.length === 0) return true;
      const haystack = [
        p.pairId,
        p.recordA.id,
        p.recordB.id,
        ...Object.values(p.recordA.fields),
        ...Object.values(p.recordB.fields),
      ]
        .map((v) => String(v ?? '').toLowerCase())
        .join(' ');
      return tokens.every((token) => haystack.includes(token));
    });
  }, [pairs, filterMode, searchQuery]);

  const visiblePairs = useMemo(() => filteredPairs.slice(0, 120), [filteredPairs]);

  const activeCheckedIds = useMemo(
    () => visiblePairs.filter((p) => checkedIds.has(p.pairId)).map((p) => p.pairId),
    [visiblePairs, checkedIds]
  );

  const allVisibleChecked =
    visiblePairs.length > 0 && activeCheckedIds.length === visiblePairs.length;
  const someVisibleChecked =
    activeCheckedIds.length > 0 && activeCheckedIds.length < visiblePairs.length;

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someVisibleChecked;
    }
  }, [someVisibleChecked]);

  // Keep selectedPairId valid when filters or data change
  useEffect(() => {
    if (filteredPairs.length === 0) {
      setSelectedPairId(null);
      return;
    }
    if (!selectedPairId || !filteredPairs.some((p) => p.pairId === selectedPairId)) {
      setSelectedPairId(filteredPairs[0].pairId);
    }
  }, [filteredPairs, selectedPairId]);

  const activeIndex = filteredPairs.findIndex((p) => p.pairId === selectedPairId);
  const activePair = activeIndex >= 0 ? filteredPairs[activeIndex] : null;

  const advanceSelection = (nextIdx: number) => {
    if (filteredPairs.length === 0) return;
    const bounded = Math.max(0, Math.min(filteredPairs.length - 1, nextIdx));
    setSelectedPairId(filteredPairs[bounded].pairId);
  };

  const handleDecision = (decision: 'match' | 'non_match' | null) => {
    if (!activePair) return;
    const nextCandidate =
      filteredPairs[activeIndex + 1]?.pairId ??
      filteredPairs[activeIndex - 1]?.pairId ??
      null;
    onAdjudicate(activePair.pairId, decision);
    if (filterMode === 'clerical' && decision !== null && nextCandidate) {
      setSelectedPairId(nextCandidate);
    }
  };

  const togglePairChecked = (pairId: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(pairId)) next.delete(pairId);
      else next.add(pairId);
      return next;
    });
  };

  const toggleSelectAllVisible = () => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleChecked) {
        for (const p of visiblePairs) next.delete(p.pairId);
      } else {
        for (const p of visiblePairs) next.add(p.pairId);
      }
      return next;
    });
  };

  const handleBulkDecision = (decision: 'match' | 'non_match') => {
    if (activeCheckedIds.length === 0) return;
    if (onBulkAdjudicate) {
      onBulkAdjudicate(activeCheckedIds, decision);
    } else {
      for (const id of activeCheckedIds) {
        onAdjudicate(id, decision);
      }
    }
    setCheckedIds((prev) => {
      const next = new Set(prev);
      for (const id of activeCheckedIds) next.delete(id);
      return next;
    });
  };

  // Scroll active pair into view when selection changes
  useEffect(() => {
    if (!selectedPairId) return;
    rowRefs.current[selectedPairId]?.scrollIntoView({ block: 'nearest' });
  }, [selectedPairId]);

  const keyStateRef = useRef({
    visiblePairs,
    activePair,
    selectedPairId,
    setSelectedPairId,
    togglePairChecked,
    handleDecision,
  });
  keyStateRef.current = {
    visiblePairs,
    activePair,
    selectedPairId,
    setSelectedPairId,
    togglePairChecked,
    handleDecision,
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const isTextInput =
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        target?.isContentEditable ||
        (tag === 'INPUT' && (target as HTMLInputElement).type !== 'checkbox');

      if (isTextInput) return;

      const {
        visiblePairs: list,
        activePair: currentPair,
        selectedPairId: currentId,
        setSelectedPairId: selectPair,
        togglePairChecked: toggleCheck,
        handleDecision: adjudicate,
      } = keyStateRef.current;

      if (list.length === 0) return;

      const currentIdx = list.findIndex((p) => p.pairId === currentId);

      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault();
        const nextIdx = currentIdx < 0 ? 0 : Math.min(list.length - 1, currentIdx + 1);
        selectPair(list[nextIdx].pairId);
        return;
      }

      if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault();
        const prevIdx = currentIdx < 0 ? 0 : Math.max(0, currentIdx - 1);
        selectPair(list[prevIdx].pairId);
        return;
      }

      if (!currentPair) return;

      const isQueueButton = target?.getAttribute('data-queue-item') === 'true';
      const isOtherInteractive =
        (tag === 'BUTTON' && !isQueueButton) ||
        tag === 'A' ||
        (tag === 'INPUT' && (target as HTMLInputElement).type === 'checkbox');

      if (e.key === ' ') {
        if (isOtherInteractive) return;
        e.preventDefault();
        toggleCheck(currentPair.pairId);
        return;
      }

      if (e.key === 'Enter') {
        if (isOtherInteractive) return;
        e.preventDefault();
        adjudicate('match');
        return;
      }

      if (e.key === 'x' || e.key === 'X') {
        if (tag === 'BUTTON' && !isQueueButton) return;
        e.preventDefault();
        adjudicate('non_match');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">
            04. Clerical Review &amp; Pair Adjudication
          </h2>
          <p className="mt-1 text-sm text-slate-600 max-w-3xl">
            Inspect candidate pairs falling in the uncertain gray zone [T_λ, T_μ) or audit automated links side-by-side with attribute log-odds contributions.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md">
            {(
              [
                ['clerical', `Clerical (${counts.clerical})`],
                ['match', `Matches (${counts.match})`],
                ['non_match', `Non-Matches (${counts.non_match})`],
                ['all', `All (${counts.all})`],
              ] as Array<[FilterMode, string]>
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setFilterMode(mode)}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                  filterMode === mode
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter by name or ID..."
              aria-label="Filter candidate pairs by name or ID"
              className="pl-8 pr-7 py-1.5 w-52 text-xs border border-slate-300 rounded-md bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Queue */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between text-xs font-semibold text-slate-600">
            <span>Candidate Queue</span>
            <span className="font-mono tabular-nums">{filteredPairs.length} pairs</span>
          </div>

          <div className="px-4 py-2 border-b border-slate-200 bg-white flex items-center justify-between gap-2">
            <label className="inline-flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none min-w-0">
              <input
                ref={selectAllRef}
                type="checkbox"
                checked={allVisibleChecked}
                onChange={toggleSelectAllVisible}
                disabled={visiblePairs.length === 0}
                aria-label="Select all visible pairs"
                className="h-3.5 w-3.5 rounded border-slate-300 text-blue-700 accent-blue-700 focus:ring-blue-600 disabled:opacity-40"
              />
              <span className="truncate font-medium">
                {activeCheckedIds.length > 0
                  ? `${activeCheckedIds.length} selected`
                  : 'Select all'}
              </span>
            </label>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => handleBulkDecision('match')}
                disabled={activeCheckedIds.length === 0}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-white bg-emerald-700 rounded hover:bg-emerald-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Check className="w-3 h-3" />
                <span>Accept</span>
              </button>
              <button
                type="button"
                onClick={() => handleBulkDecision('non_match')}
                disabled={activeCheckedIds.length === 0}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-red-700 bg-white border border-red-300 rounded hover:bg-red-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <X className="w-3 h-3" />
                <span>Reject</span>
              </button>
            </div>
          </div>

          <div className="divide-y divide-slate-100 max-h-[540px] overflow-y-auto">
            {filteredPairs.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 space-y-2">
                <p>
                  {searchQuery.trim()
                    ? `No candidate pairs match "${searchQuery.trim()}".`
                    : filterMode === 'clerical'
                      ? 'No candidate pairs currently remain in the clerical gray zone. Switch filter to inspect Matches or All Candidates.'
                      : 'No candidate pairs match the current filter.'}
                </p>
                {searchQuery.trim() && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-blue-700 hover:text-blue-800 hover:underline"
                  >
                    Clear search
                  </button>
                )}
              </div>
            ) : (
              visiblePairs.map((pair) => {
                const isSelected = pair.pairId === activePair?.pairId;
                const isChecked = checkedIds.has(pair.pairId);
                const badge = DECISION_LABEL[pair.finalDecision];
                const confidencePct = (pair.posteriorProb * 100).toFixed(1);
                const confidenceMeta = getConfidenceBadgeMeta(pair.posteriorProb);
                const summaryA = Object.values(pair.recordA.fields).slice(0, 2).join(' ');
                const summaryB = Object.values(pair.recordB.fields).slice(0, 2).join(' ');

                return (
                  <div
                    key={pair.pairId}
                    ref={(el) => {
                      rowRefs.current[pair.pairId] = el;
                    }}
                    className={`flex items-start gap-2.5 px-4 py-3 transition-colors ${
                      isSelected ? 'bg-blue-50/70' : 'hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => togglePairChecked(pair.pairId)}
                      aria-label={`Select pair ${pair.recordA.id} and ${pair.recordB.id}`}
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-slate-300 text-blue-700 accent-blue-700 focus:ring-blue-600 cursor-pointer"
                    />
                    <button
                      type="button"
                      data-queue-item="true"
                      aria-current={isSelected ? 'true' : undefined}
                      onClick={() => setSelectedPairId(pair.pairId)}
                      className="flex-1 min-w-0 text-left focus:outline-none"
                    >
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-mono font-medium text-slate-800 tabular-nums truncate">
                          {pair.recordA.id} ↔ {pair.recordB.id}
                        </span>
                        <span className="inline-flex items-center gap-1.5 shrink-0">
                          <span
                            title={`Match confidence P(M|γ) = ${confidencePct}%`}
                            aria-label={`Match confidence ${confidencePct} percent`}
                            className={`px-1.5 py-0.5 text-[10px] font-mono font-semibold tabular-nums rounded border ${confidenceMeta.badgeClass}`}
                          >
                            {confidencePct}%
                          </span>
                          <span className={`font-medium ${badge.colorClass}`}>
                            {badge.text}
                          </span>
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-slate-600 truncate">
                        {summaryA} / {summaryB}
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[11px] tabular-nums text-slate-500">
                        <span className="font-mono">W = {pair.totalWeight.toFixed(2)}</span>
                        <span
                          className={
                            confidenceMeta.isUncertain
                              ? 'text-amber-700 font-medium'
                              : 'text-slate-500'
                          }
                        >
                          {confidenceMeta.uncertaintyText}
                        </span>
                      </div>
                    </button>
                  </div>
                );
              })
            )}
          </div>

          <div className="px-4 py-2 border-t border-slate-200 bg-slate-50 text-[11px] text-slate-500 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>
              <kbd className="px-1 py-0.5 font-mono text-[10px] bg-white border border-slate-300 rounded text-slate-700">
                ↑/↓
              </kbd>{' '}
              Navigate
            </span>
            <span>
              <kbd className="px-1 py-0.5 font-mono text-[10px] bg-white border border-slate-300 rounded text-slate-700">
                Space
              </kbd>{' '}
              Check
            </span>
            <span>
              <kbd className="px-1 py-0.5 font-mono text-[10px] bg-white border border-slate-300 rounded text-slate-700">
                Enter
              </kbd>{' '}
              Accept
            </span>
            <span>
              <kbd className="px-1 py-0.5 font-mono text-[10px] bg-white border border-slate-300 rounded text-slate-700">
                X
              </kbd>{' '}
              Reject
            </span>
          </div>
        </div>

        {/* Right Side-by-Side Comparison Inspector */}
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-lg overflow-hidden">
          {!activePair ? (
            <div className="p-12 text-center text-sm text-slate-500">
              Select a candidate pair from the queue to inspect attribute comparisons and composite weights.
            </div>
          ) : (
            <div>
              <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="font-mono tabular-nums">
                      {activePair.recordA.id} ↔ {activePair.recordB.id}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>Blocking: {activePair.matchedBlockPasses.join(', ')}</span>
                    {activePair.humanDecision && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-blue-700 font-medium">
                          Human Adjudicated
                        </span>
                      </>
                    )}
                  </div>
                  <div className="mt-1 flex items-baseline gap-4">
                    <span className="text-lg font-semibold text-slate-900 font-mono tabular-nums">
                      Composite Weight: {activePair.totalWeight.toFixed(2)}
                    </span>
                    <span className="text-sm text-slate-600 font-mono tabular-nums">
                      Posterior P(M|γ): {(activePair.posteriorProb * 100).toFixed(2)}%
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => advanceSelection(activeIndex - 1)}
                    disabled={activeIndex <= 0}
                    className="px-2.5 py-1.5 text-xs font-medium text-slate-700 border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-40"
                  >
                    Prev
                  </button>
                  <button
                    type="button"
                    onClick={() => advanceSelection(activeIndex + 1)}
                    disabled={activeIndex >= filteredPairs.length - 1}
                    className="px-2.5 py-1.5 text-xs font-medium text-slate-700 border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600">
                    <tr>
                      <th className="py-2.5 px-4">Attribute</th>
                      <th className="py-2.5 px-4">{dbAName} (A)</th>
                      <th className="py-2.5 px-4">{dbBName} (B)</th>
                      <th className="py-2.5 px-4 text-right">Similarity</th>
                      <th className="py-2.5 px-4">Level</th>
                      <th className="py-2.5 px-4 text-right">Weight w_i</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {activePair.comparisons.map((comp) => {
                      const levelText =
                        comp.level === 'agree'
                          ? 'Agree'
                          : comp.level === 'partial'
                            ? 'Partial'
                            : comp.level === 'disagree'
                              ? 'Disagree'
                              : 'Missing';
                      const levelColor =
                        comp.level === 'agree'
                          ? 'text-emerald-700'
                          : comp.level === 'partial'
                            ? 'text-amber-700'
                            : comp.level === 'disagree'
                              ? 'text-red-700'
                              : 'text-slate-400';

                      const barPct = Math.min(100, Math.abs(comp.weight) * 10);

                      return (
                        <tr key={comp.field} className="hover:bg-slate-50/70">
                          <td className="py-2.5 px-4 font-medium text-slate-900 whitespace-nowrap">
                            {comp.label}
                          </td>
                          <td className="py-2.5 px-4 font-mono text-slate-800">
                            {comp.valueA || <span className="text-slate-400 italic">missing</span>}
                          </td>
                          <td className="py-2.5 px-4 font-mono text-slate-800">
                            {comp.valueB || <span className="text-slate-400 italic">missing</span>}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700">
                            {comp.level === 'missing'
                              ? '—'
                              : `${(comp.similarity * 100).toFixed(0)}%`}
                          </td>
                          <td className={`py-2.5 px-4 font-medium ${levelColor}`}>
                            {levelText}
                          </td>
                          <td className="py-2.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-14 h-1.5 bg-slate-100 rounded-full overflow-hidden hidden sm:block">
                                <div
                                  className={`h-full ${
                                    comp.weight >= 0 ? 'bg-emerald-600' : 'bg-red-600'
                                  }`}
                                  style={{ width: `${barPct}%` }}
                                />
                              </div>
                              <span
                                className={`font-mono tabular-nums font-semibold w-12 text-right ${
                                  comp.weight > 0
                                    ? 'text-emerald-700'
                                    : comp.weight < 0
                                      ? 'text-red-700'
                                      : 'text-slate-400'
                                }`}
                              >
                                {comp.weight > 0 ? `+${comp.weight.toFixed(2)}` : comp.weight.toFixed(2)}
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Adjudication Action Bar */}
              <div className="px-5 py-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-slate-600">
                  Final Classification:{' '}
                  <span
                    className={`font-semibold ${
                      DECISION_LABEL[activePair.finalDecision].colorClass
                    }`}
                  >
                    {DECISION_LABEL[activePair.finalDecision].text}
                  </span>
                  {activePair.recordA.groundTruthId && activePair.recordB.groundTruthId && (
                    <span className="ml-3 text-slate-500">
                      (Ground Truth:{' '}
                      {activePair.recordA.groundTruthId === activePair.recordB.groundTruthId
                        ? 'True Same Entity'
                        : 'Distinct Entities'}
                      )
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {activePair.humanDecision !== null && (
                    <button
                      type="button"
                      onClick={() => handleDecision(null)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-100 transition-colors"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Revert to Model</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleDecision('non_match')}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-red-700 bg-white border border-red-300 rounded-md hover:bg-red-50 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Reject Non-Match</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDecision('match')}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-emerald-700 rounded-md hover:bg-emerald-800 transition-colors"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Confirm Duplicate</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
