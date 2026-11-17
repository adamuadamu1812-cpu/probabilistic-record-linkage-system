import { useMemo, useState } from 'react';
import {
  Database,
  FileCheck2,
  GitCompare,
  Layers,
  Menu,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import {
  BENCHMARK_PRESETS,
  generateSyntheticDataset,
} from './data/benchmarkDatasets';
import {
  buildEntityClusters,
  computeFieldWeights,
  evaluateLinkage,
  extractComparisonVectors,
  generateCandidatePairs,
  runExpectationMaximization,
  scoreAndClassifyPairs,
} from './engine/fellegiSunter';
import type {
  BlockingRule,
  ComparatorType,
  DatabaseRecord,
  DatasetPreset,
  EMResult,
  FieldSchema,
  LearnedFieldParams,
} from './types/linkage';
import { DataSourcesView } from './components/DataSourcesView';
import { BlockingView } from './components/BlockingView';
import { ModelWeightsView } from './components/ModelWeightsView';
import { ClericalReviewView } from './components/ClericalReviewView';
import { ResultsExportView } from './components/ResultsExportView';

type StageKey = 'sources' | 'blocking' | 'model' | 'review' | 'results';

function buildInitialFieldParams(fields: FieldSchema[]): Record<string, LearnedFieldParams> {
  const out: Record<string, LearnedFieldParams> = {};
  for (const f of fields) {
    out[f.key] = computeFieldWeights({
      mAgree: f.mAgree,
      uAgree: f.uAgree,
      mPartial: f.mPartial,
      uPartial: f.uPartial,
    });
  }
  return out;
}

function inferComparator(colName: string): ComparatorType {
  const lower = colName.toLowerCase();
  if (/dob|birth|date/.test(lower)) return 'date_tolerance';
  if (/address|street|addr|location/.test(lower)) return 'token_jaccard';
  if (/gender|sex|_id$|^id$|ssn|tin/.test(lower)) return 'exact';
  if (/zip|postal|code|phone/.test(lower)) return 'levenshtein';
  return 'jaro_winkler';
}

function inferFieldSchema(columns: string[]): FieldSchema[] {
  return columns.map((col) => {
    const comparator = inferComparator(col);
    const label = col
      .replace(/[_-]+/g, ' ')
      .replace(/\b\w/g, (ch) => ch.toUpperCase());
    return {
      key: col,
      label,
      comparator,
      agreeThreshold: comparator === 'token_jaccard' ? 0.85 : 0.92,
      partialThreshold: comparator === 'token_jaccard' ? 0.6 : 0.78,
      mAgree: 0.9,
      uAgree: comparator === 'exact' ? 0.05 : 0.02,
      mPartial: 0.06,
      uPartial: 0.05,
      enabled: true,
    };
  });
}

export default function App() {
  const initialPreset = BENCHMARK_PRESETS[0];

  const [activeStage, setActiveStage] = useState<StageKey>('model');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [activePresetId, setActivePresetId] = useState<string>(initialPreset.id);
  const [dbAName, setDbAName] = useState<string>(initialPreset.dbAName);
  const [dbBName, setDbBName] = useState<string>(initialPreset.dbBName);
  const [recordsA, setRecordsA] = useState<DatabaseRecord[]>(initialPreset.recordsA);
  const [recordsB, setRecordsB] = useState<DatabaseRecord[]>(initialPreset.recordsB);
  const [fields, setFields] = useState<FieldSchema[]>(initialPreset.fields);
  const [blockingRules, setBlockingRules] = useState<BlockingRule[]>(
    initialPreset.blockingRules
  );

  const [emResult, setEmResult] = useState<EMResult | null>(null);
  const [customLearnedParams, setCustomLearnedParams] = useState<Record<
    string,
    LearnedFieldParams
  > | null>(null);
  const [priorMatch, setPriorMatch] = useState<number>(0.25);

  const [lowerThreshold, setLowerThreshold] = useState<number>(4.5);
  const [upperThreshold, setUpperThreshold] = useState<number>(11.0);
  const [enforceOneToOne, setEnforceOneToOne] = useState<boolean>(true);
  const [humanDecisions, setHumanDecisions] = useState<
    Record<string, 'match' | 'non_match'>
  >({});

  // Stage 1 -> 2: Multi-pass Blocking
  const blockingOutput = useMemo(
    () => generateCandidatePairs(recordsA, recordsB, blockingRules),
    [recordsA, recordsB, blockingRules]
  );

  // Stage 2 -> 3: Extract comparison vectors
  const comparisonVectors = useMemo(
    () => extractComparisonVectors(blockingOutput.candidateMap, fields),
    [blockingOutput.candidateMap, fields]
  );

  // Active parameter table (either EM-learned or derived from field priors)
  const effectiveFieldParams = useMemo(() => {
    if (customLearnedParams) return customLearnedParams;
    return buildInitialFieldParams(fields);
  }, [customLearnedParams, fields]);

  // Stage 3 -> 4: Score and classify candidate pairs
  const scoredPairs = useMemo(
    () =>
      scoreAndClassifyPairs(
        comparisonVectors,
        fields,
        effectiveFieldParams,
        priorMatch,
        upperThreshold,
        lowerThreshold,
        humanDecisions,
        enforceOneToOne
      ),
    [
      comparisonVectors,
      fields,
      effectiveFieldParams,
      priorMatch,
      upperThreshold,
      lowerThreshold,
      humanDecisions,
      enforceOneToOne,
    ]
  );

  // Stage 5: Evaluation & Cluster Resolution
  const evaluation = useMemo(
    () => evaluateLinkage(recordsA, recordsB, scoredPairs),
    [recordsA, recordsB, scoredPairs]
  );

  const entityClusters = useMemo(
    () => buildEntityClusters(scoredPairs, fields),
    [scoredPairs, fields]
  );

  const clericalCount = useMemo(
    () => scoredPairs.filter((p) => p.finalDecision === 'clerical').length,
    [scoredPairs]
  );

  const matchCount = useMemo(
    () => scoredPairs.filter((p) => p.finalDecision === 'match').length,
    [scoredPairs]
  );

  // Handlers
  const handleSelectPreset = (preset: DatasetPreset) => {
    setActivePresetId(preset.id);
    setDbAName(preset.dbAName);
    setDbBName(preset.dbBName);
    setRecordsA(preset.recordsA);
    setRecordsB(preset.recordsB);
    setFields(preset.fields);
    setBlockingRules(preset.blockingRules);
    setEmResult(null);
    setCustomLearnedParams(null);
    setPriorMatch(0.25);
    setHumanDecisions({});
  };

  const handleGenerateSynthetic = (opts: {
    sizePerDb: number;
    overlapRate: number;
    noiseRate: number;
  }) => {
    const syn = generateSyntheticDataset(opts);
    setActivePresetId('synthetic');
    setDbAName(`Synthetic Registry A (${opts.sizePerDb})`);
    setDbBName(`Synthetic Registry B (${opts.sizePerDb})`);
    setRecordsA(syn.recordsA);
    setRecordsB(syn.recordsB);
    setFields(syn.fields);
    setBlockingRules(syn.blockingRules);
    setEmResult(null);
    setCustomLearnedParams(null);
    setPriorMatch(opts.overlapRate);
    setHumanDecisions({});
  };

  const handleUploadCSV = (
    source: 'A' | 'B',
    newRecords: DatabaseRecord[],
    columns: string[],
    fileName: string
  ) => {
    setActivePresetId('custom-csv');
    if (source === 'A') {
      setDbAName(fileName);
      setRecordsA(newRecords);
    } else {
      setDbBName(fileName);
      setRecordsB(newRecords);
    }

    const otherCols = Object.keys(
      (source === 'A' ? recordsB[0]?.fields : recordsA[0]?.fields) ?? {}
    );
    const sharedCols =
      otherCols.length > 0
        ? columns.filter((c) => otherCols.includes(c))
        : columns;
    const colsToUse = sharedCols.length > 0 ? sharedCols : columns;

    const currentFieldKeys = fields.map((f) => f.key);
    const schemaChanged =
      colsToUse.length !== currentFieldKeys.length ||
      colsToUse.some((c, i) => c !== currentFieldKeys[i]);

    if (schemaChanged) {
      const nextFields = inferFieldSchema(colsToUse);
      setFields(nextFields);
      const firstKey = nextFields[0]?.key;
      const secondKey = nextFields[1]?.key;
      const nextRules: BlockingRule[] = [];
      if (secondKey) {
        nextRules.push({
          id: 'blk_auto_1',
          label: `Prefix(3)(${secondKey})`,
          keyParts: [{ field: secondKey, transform: 'prefix_3' }],
          enabled: true,
        });
      }
      if (firstKey) {
        nextRules.push({
          id: 'blk_auto_2',
          label: `Prefix(3)(${firstKey})`,
          keyParts: [{ field: firstKey, transform: 'prefix_3' }],
          enabled: true,
        });
      }
      setBlockingRules(nextRules);
    }

    setEmResult(null);
    setCustomLearnedParams(null);
    setHumanDecisions({});
  };

  const handleAddRecord = (source: 'A' | 'B', record: DatabaseRecord) => {
    if (source === 'A') setRecordsA((prev) => [record, ...prev]);
    else setRecordsB((prev) => [record, ...prev]);
  };

  const handleRemoveRecord = (source: 'A' | 'B', id: string) => {
    if (source === 'A') setRecordsA((prev) => prev.filter((r) => r.id !== id));
    else setRecordsB((prev) => prev.filter((r) => r.id !== id));
  };

  const handleToggleRule = (ruleId: string) => {
    setBlockingRules((prev) =>
      prev.map((r) => (r.id === ruleId ? { ...r, enabled: !r.enabled } : r))
    );
  };

  const handleAddRule = (rule: BlockingRule) => {
    setBlockingRules((prev) => [...prev, rule]);
  };

  const handleRemoveRule = (ruleId: string) => {
    setBlockingRules((prev) => prev.filter((r) => r.id !== ruleId));
  };

  const handleUpdateField = (key: string, patch: Partial<FieldSchema>) => {
    setFields((prev) => prev.map((f) => (f.key === key ? { ...f, ...patch } : f)));
  };

  const handleRunEM = () => {
    const res = runExpectationMaximization(comparisonVectors, fields);
    setEmResult(res);
    setCustomLearnedParams(res.fieldParams);
    setPriorMatch(res.priorMatch);
  };

  const handleResetManualParams = () => {
    setEmResult(null);
    setCustomLearnedParams(null);
    setPriorMatch(0.25);
  };

  const handleAdjudicate = (pairId: string, decision: 'match' | 'non_match' | null) => {
    setHumanDecisions((prev) => {
      const next = { ...prev };
      if (decision === null) delete next[pairId];
      else next[pairId] = decision;
      return next;
    });
  };

  const handleBulkAdjudicate = (
    pairIds: string[],
    decision: 'match' | 'non_match' | null
  ) => {
    if (pairIds.length === 0) return;
    setHumanDecisions((prev) => {
      const next = { ...prev };
      for (const pairId of pairIds) {
        if (decision === null) delete next[pairId];
        else next[pairId] = decision;
      }
      return next;
    });
  };

  const navItems: Array<{
    key: StageKey;
    shortLabel: string;
    sidebarLabel: string;
    count: string;
    Icon: typeof Database;
  }> = [
    {
      key: 'sources',
      shortLabel: 'Data Sources',
      sidebarLabel: '01. Data Sources',
      count: `${recordsA.length}×${recordsB.length}`,
      Icon: Database,
    },
    {
      key: 'blocking',
      shortLabel: 'Blocking',
      sidebarLabel: '02. Blocking & Keys',
      count: `${blockingOutput.candidateMap.size}`,
      Icon: Layers,
    },
    {
      key: 'model',
      shortLabel: 'Fellegi-Sunter',
      sidebarLabel: '03. Fellegi-Sunter Model',
      count: `${fields.filter((f) => f.enabled).length} attr`,
      Icon: SlidersHorizontal,
    },
    {
      key: 'review',
      shortLabel: 'Clerical Review',
      sidebarLabel: '04. Clerical Review',
      count: `${clericalCount}`,
      Icon: GitCompare,
    },
    {
      key: 'results',
      shortLabel: 'Entities & Export',
      sidebarLabel: '05. Linked Entities',
      count: `${entityClusters.length}`,
      Icon: FileCheck2,
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Top Bar Contract: Brand wordmark — 5 single-line nav links — 1 primary CTA */}
      <header className="print:hidden sticky top-0 z-30 bg-white border-b border-slate-200 px-6 h-14 flex items-center justify-between gap-8">
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setMobileNavOpen((v) => !v)}
            className="lg:hidden p-1.5 -ml-1.5 text-slate-600 hover:text-slate-900"
            aria-label="Toggle workspace navigation"
          >
            {mobileNavOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setActiveStage('sources');
            }}
            className="text-base font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            RecordLinkage
          </a>
        </div>

        <nav className="hidden lg:flex items-center gap-7 text-sm font-medium text-slate-600">
          {navItems.map((item) => {
            const isActive = activeStage === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setActiveStage(item.key)}
                className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                  isActive
                    ? 'text-slate-900 border-blue-700'
                    : 'text-slate-600 border-transparent hover:text-slate-900 hover:border-slate-300'
                }`}
              >
                {item.shortLabel}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={() => {
              handleRunEM();
              setActiveStage('model');
            }}
            className="px-4 py-2 text-xs font-medium text-white bg-blue-700 rounded-md hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0"
          >
            Calibrate EM Model
          </button>
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        {/* Left Sidebar */}
        <aside
          className={`print:hidden ${
            mobileNavOpen ? 'fixed inset-y-14 left-0 z-20 block' : 'hidden'
          } lg:static lg:block w-64 shrink-0 bg-white border-r border-slate-200 flex flex-col justify-between`}
        >
          <div className="p-4 space-y-6">
            <div>
              <div className="px-2 text-xs font-semibold text-slate-500 mb-2">
                Linkage Pipeline
              </div>
              <div className="space-y-1">
                {navItems.map((item) => {
                  const isActive = activeStage === item.key;
                  const Icon = item.Icon;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => {
                        setActiveStage(item.key);
                        setMobileNavOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2.5 text-xs font-medium rounded-md transition-colors ${
                        isActive
                          ? 'bg-blue-50 text-blue-800'
                          : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                      }`}
                    >
                      <span className="flex items-center gap-2.5 truncate">
                        <Icon className="w-4 h-4 shrink-0" />
                        <span className="truncate">{item.sidebarLabel}</span>
                      </span>
                      <span className="font-mono tabular-nums text-[11px] text-slate-500 ml-2 shrink-0">
                        {item.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200 px-2 space-y-2.5 text-xs">
              <div className="font-semibold text-slate-700">Active Databases</div>
              <div className="space-y-1 text-slate-600">
                <div className="flex justify-between gap-2">
                  <span className="truncate">A: {dbAName}</span>
                  <span className="font-mono tabular-nums shrink-0">{recordsA.length}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="truncate">B: {dbBName}</span>
                  <span className="font-mono tabular-nums shrink-0">{recordsB.length}</span>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 space-y-1.5 text-slate-600">
                <div className="flex justify-between">
                  <span>Reduction Ratio</span>
                  <span className="font-mono tabular-nums text-slate-900 font-medium">
                    {(evaluation.reductionRatio * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Linked Matches</span>
                  <span className="font-mono tabular-nums text-emerald-700 font-medium">
                    {matchCount}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Clerical Queue</span>
                  <span className="font-mono tabular-nums text-amber-700 font-medium">
                    {clericalCount}
                  </span>
                </div>
                {evaluation.hasGroundTruth && (
                  <div className="flex justify-between">
                    <span>F1 Score</span>
                    <span className="font-mono tabular-nums text-blue-700 font-semibold">
                      {(evaluation.f1 * 100).toFixed(1)}%
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 min-w-0 p-6 lg:p-8 print:p-0">
          <div className="max-w-[1280px] mx-auto">
            {activeStage === 'sources' && (
              <DataSourcesView
                activePresetId={activePresetId}
                dbAName={dbAName}
                dbBName={dbBName}
                recordsA={recordsA}
                recordsB={recordsB}
                fields={fields}
                onSelectPreset={handleSelectPreset}
                onGenerateSynthetic={handleGenerateSynthetic}
                onUploadCSV={handleUploadCSV}
                onAddRecord={handleAddRecord}
                onRemoveRecord={handleRemoveRecord}
              />
            )}

            {activeStage === 'blocking' && (
              <BlockingView
                fields={fields}
                blockingRules={blockingRules}
                blockingOutput={blockingOutput}
                evaluation={evaluation}
                recordsA={recordsA}
                recordsB={recordsB}
                onToggleRule={handleToggleRule}
                onAddRule={handleAddRule}
                onRemoveRule={handleRemoveRule}
              />
            )}

            {activeStage === 'model' && (
              <ModelWeightsView
                fields={fields}
                learnedParams={effectiveFieldParams}
                priorMatch={priorMatch}
                emResult={emResult}
                pairs={scoredPairs}
                evaluation={evaluation}
                upperThreshold={upperThreshold}
                lowerThreshold={lowerThreshold}
                enforceOneToOne={enforceOneToOne}
                onUpdateField={handleUpdateField}
                onRunEM={handleRunEM}
                onResetManualParams={handleResetManualParams}
                onChangeThresholds={(lower, upper) => {
                  setLowerThreshold(lower);
                  setUpperThreshold(upper);
                }}
                onToggleOneToOne={setEnforceOneToOne}
              />
            )}

            {activeStage === 'review' && (
              <ClericalReviewView
                pairs={scoredPairs}
                dbAName={dbAName}
                dbBName={dbBName}
                onAdjudicate={handleAdjudicate}
                onBulkAdjudicate={handleBulkAdjudicate}
              />
            )}

            {activeStage === 'results' && (
              <ResultsExportView
                clusters={entityClusters}
                pairs={scoredPairs}
                fields={fields}
                evaluation={evaluation}
                emResult={emResult}
                dbAName={dbAName}
                dbBName={dbBName}
                recordsACount={recordsA.length}
                recordsBCount={recordsB.length}
                lowerThreshold={lowerThreshold}
                upperThreshold={upperThreshold}
                enforceOneToOne={enforceOneToOne}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
