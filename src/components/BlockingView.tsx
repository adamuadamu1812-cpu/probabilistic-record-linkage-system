import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type {
  BlockingRule,
  BlockingTransform,
  DatabaseRecord,
  EvaluationMetrics,
  FieldSchema,
} from '../types/linkage';
import type { BlockingOutput } from '../engine/fellegiSunter';
import { computeBlockingKey } from '../engine/fellegiSunter';

interface BlockingViewProps {
  fields: FieldSchema[];
  blockingRules: BlockingRule[];
  blockingOutput: BlockingOutput;
  evaluation: EvaluationMetrics;
  recordsA: DatabaseRecord[];
  recordsB: DatabaseRecord[];
  onToggleRule: (ruleId: string) => void;
  onAddRule: (rule: BlockingRule) => void;
  onRemoveRule: (ruleId: string) => void;
}

const TRANSFORM_LABELS: Record<BlockingTransform, string> = {
  soundex: 'Soundex Phonetic',
  prefix_3: 'First 3 Chars',
  prefix_4: 'First 4 Chars',
  year: 'Year (YYYY)',
  exact: 'Normalized Exact',
  alnum_only: 'Alphanumeric Exact',
};

export const BlockingView: React.FC<BlockingViewProps> = ({
  fields,
  blockingRules,
  blockingOutput,
  evaluation,
  recordsA,
  recordsB,
  onToggleRule,
  onAddRule,
  onRemoveRule,
}) => {
  const [field1, setField1] = useState(fields[1]?.key ?? fields[0]?.key ?? '');
  const [trans1, setTrans1] = useState<BlockingTransform>('soundex');
  const [useSecondPart, setUseSecondPart] = useState(true);
  const [field2, setField2] = useState(fields[2]?.key ?? fields[0]?.key ?? '');
  const [trans2, setTrans2] = useState<BlockingTransform>('year');

  const handleAddPass = (e: React.FormEvent) => {
    e.preventDefault();
    if (!field1) return;

    const f1Label = fields.find((f) => f.key === field1)?.label ?? field1;
    const f2Label = fields.find((f) => f.key === field2)?.label ?? field2;

    const keyParts = [{ field: field1, transform: trans1 }];
    let label = `${TRANSFORM_LABELS[trans1]}(${f1Label})`;

    if (useSecondPart && field2) {
      keyParts.push({ field: field2, transform: trans2 });
      label += ` + ${TRANSFORM_LABELS[trans2]}(${f2Label})`;
    }

    onAddRule({
      id: `blk_custom_${Date.now()}`,
      label,
      keyParts,
      enabled: true,
    });
  };

  const passStatsMap = new Map(
    blockingOutput.passStats.map((s) => [s.ruleId, s])
  );

  const previewRule = blockingRules.find((r) => r.enabled) ?? blockingRules[0];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">
          02. Multi-Pass Blocking & Candidate Generation
        </h2>
        <p className="mt-1 text-sm text-slate-600 max-w-3xl">
          Multi-pass union blocking indexes both independent databases on phonetic or prefix keys, avoiding full Cartesian comparison while maximizing candidate recall.
        </p>
      </div>

      {/* Summary Metric Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 bg-white border border-slate-200 rounded-lg">
          <div className="text-xs text-slate-500">Full Cartesian Space</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900 font-mono tabular-nums">
            {evaluation.cartesianSize.toLocaleString()}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            |A| × |B| unblocked pairs
          </div>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-lg">
          <div className="text-xs text-slate-500">Unique Candidate Pairs</div>
          <div className="mt-1 text-2xl font-semibold text-blue-700 font-mono tabular-nums">
            {evaluation.candidateCount.toLocaleString()}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Union across active passes
          </div>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-lg">
          <div className="text-xs text-slate-500">Reduction Ratio (RR)</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900 font-mono tabular-nums">
            {(evaluation.reductionRatio * 100).toFixed(2)}%
          </div>
          <div className="mt-1 text-xs text-slate-500">
            1 − (|C| / |A × B|)
          </div>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-lg">
          <div className="text-xs text-slate-500">Pairs Completeness (PC)</div>
          <div className="mt-1 text-2xl font-semibold text-emerald-700 font-mono tabular-nums">
            {evaluation.hasGroundTruth
              ? `${(evaluation.pairsCompleteness * 100).toFixed(1)}%`
              : 'N/A'}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {evaluation.hasGroundTruth
              ? `True pairs retained of ${evaluation.totalGroundTruthMatches}`
              : 'Requires ground_truth_id column'}
          </div>
        </div>
      </div>

      {/* Blocking Passes Table + Builder */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">
              Configured Blocking Passes
            </h3>
            <span className="text-xs text-slate-500 tabular-nums">
              {blockingRules.filter((r) => r.enabled).length} of {blockingRules.length} active
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600">
                <tr>
                  <th className="py-2.5 px-3">Active</th>
                  <th className="py-2.5 px-3">Blocking Key Definition</th>
                  <th className="py-2.5 px-3 text-right">Keys A</th>
                  <th className="py-2.5 px-3 text-right">Keys B</th>
                  <th className="py-2.5 px-3 text-right">Pairs Emitted</th>
                  <th className="py-2.5 px-3 text-right">Remove</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {blockingRules.map((rule) => {
                  const stat = passStatsMap.get(rule.id);
                  return (
                    <tr key={rule.id} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-3">
                        <input
                          type="checkbox"
                          checked={rule.enabled}
                          onChange={() => onToggleRule(rule.id)}
                          aria-label={`Toggle ${rule.label}`}
                          className="w-4 h-4 accent-blue-700 rounded cursor-pointer"
                        />
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-medium text-slate-900">{rule.label}</div>
                        <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                          {rule.keyParts
                            .map((kp) => `${kp.transform}(${kp.field})`)
                            .join(' | ')}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700">
                        {rule.enabled && stat ? stat.distinctKeysA : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700">
                        {rule.enabled && stat ? stat.distinctKeysB : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums font-medium text-slate-900">
                        {rule.enabled && stat ? stat.pairsGenerated : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => onRemoveRule(rule.id)}
                          className="p-1 text-slate-400 hover:text-red-600 transition-colors"
                          aria-label={`Delete ${rule.label}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Add Custom Blocking Pass */}
        <form
          onSubmit={handleAddPass}
          className="lg:col-span-5 p-5 bg-white border border-slate-200 rounded-lg space-y-4"
        >
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Add Custom Blocking Pass
            </h3>
            <p className="text-xs text-slate-600 mt-0.5">
              Combine an indexing attribute and normalization transform to catch additional candidate pairs.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Primary Field
              </label>
              <select
                value={field1}
                onChange={(e) => setField1(e.target.value)}
                className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-md bg-white text-slate-900"
              >
                {fields.map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Transform
              </label>
              <select
                value={trans1}
                onChange={(e) => setTrans1(e.target.value as BlockingTransform)}
                className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-md bg-white text-slate-900"
              >
                {Object.entries(TRANSFORM_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={useSecondPart}
              onChange={(e) => setUseSecondPart(e.target.checked)}
              className="w-3.5 h-3.5 accent-blue-700"
            />
            <span>Compound with secondary key attribute</span>
          </label>

          {useSecondPart && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Secondary Field
                </label>
                <select
                  value={field2}
                  onChange={(e) => setField2(e.target.value)}
                  className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-md bg-white text-slate-900"
                >
                  {fields.map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Transform
                </label>
                <select
                  value={trans2}
                  onChange={(e) => setTrans2(e.target.value as BlockingTransform)}
                  className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-md bg-white text-slate-900"
                >
                  {Object.entries(TRANSFORM_LABELS).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <button
            type="submit"
            className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-700 rounded-md hover:bg-blue-800 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Append Blocking Pass</span>
          </button>
        </form>
      </div>

      {/* Live Blocking Key Sample */}
      {previewRule && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">
              Index Key Sample — {previewRule.label}
            </h3>
            <span className="text-xs text-slate-500">
              First 6 records from each database
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-200">
            <div className="p-4">
              <div className="text-xs font-semibold text-slate-700 mb-2">
                Database A Keys
              </div>
              <div className="space-y-1.5">
                {recordsA.slice(0, 6).map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between text-xs py-1 border-b border-slate-100 last:border-b-0"
                  >
                    <span className="font-mono text-slate-600">{r.id}</span>
                    <span className="text-slate-700 truncate max-w-[180px]">
                      {previewRule.keyParts.map((kp) => r.fields[kp.field]).join(' / ')}
                    </span>
                    <span className="font-mono font-medium text-blue-700">
                      {computeBlockingKey(r, previewRule) ?? 'NULL'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="p-4">
              <div className="text-xs font-semibold text-slate-700 mb-2">
                Database B Keys
              </div>
              <div className="space-y-1.5">
                {recordsB.slice(0, 6).map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between text-xs py-1 border-b border-slate-100 last:border-b-0"
                  >
                    <span className="font-mono text-slate-600">{r.id}</span>
                    <span className="text-slate-700 truncate max-w-[180px]">
                      {previewRule.keyParts.map((kp) => r.fields[kp.field]).join(' / ')}
                    </span>
                    <span className="font-mono font-medium text-blue-700">
                      {computeBlockingKey(r, previewRule) ?? 'NULL'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
