'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Copy,
  Check,
  ChevronDown,
  ShieldCheck,
  AlertTriangle,
  FileCheck,
  RefreshCw,
  Lock,
  Info,
  Cpu,
} from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from 'recharts';
import { ScanResult, useAppStore } from '@/lib/store';
import { ScoreRing } from './ScoreRing';
import { Button } from '@/components/ui/Button';
import { EMBEDDED_MODELS } from '@/lib/models/onnx_classifier';

export interface ReportPanelProps {
  result: ScanResult;
  onReset: () => void;
}

export const ReportPanel: React.FC<ReportPanelProps> = ({ result, onReset }) => {
  const { showToast } = useAppStore();
  const [copied, setCopied] = useState(false);
  const [reasonsOpen, setReasonsOpen] = useState(true);
  const [modelsOpen, setModelsOpen] = useState(false);

  const handleCopyBadge = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(result.trustBadgeUrl);
      setCopied(true);
      showToast('Trust link copied to clipboard!');
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const chartData = [
    { name: 'Facial Authenticity', score: result.breakdown.faceForgeryScore },
    { name: 'Image Pattern', score: result.breakdown.frequencyGanScore },
    { name: 'Voice & Audio', score: result.breakdown.audioSpoofScore },
    { name: 'Camera Data', score: result.breakdown.exifElaScore },
    { name: 'Digital Signature', score: result.breakdown.c2paScore },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="w-full bg-ink-950/90 text-white rounded-3xl p-6 sm:p-8 border border-ink-800 shadow-dark-glass"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-ink-800 pb-6 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-brand-blue-400" />
            <span className="text-xs font-mono font-semibold text-brand-blue-300 uppercase tracking-widest">
              Verification Result
            </span>
          </div>
          <h3 className="text-xl sm:text-2xl font-semibold mt-1 truncate max-w-md">
            {result.filename}
          </h3>
          <p className="text-xs text-ink-400 mt-0.5 font-normal">
            Scanned {new Date(result.timestamp).toLocaleTimeString()} • File Type: {result.fileType.toUpperCase()} ({result.fileSize})
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleCopyBadge}
            leftIcon={copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
          >
            {copied ? 'Copied Link' : 'Share Verification Link'}
          </Button>
          <Button variant="ghost" size="sm" onClick={onReset} leftIcon={<RefreshCw className="w-4 h-4" />}>
            Scan Another File
          </Button>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Score Ring & Plain English Summary */}
        <div className="lg:col-span-5 flex flex-col items-center bg-ink-900/60 p-6 rounded-2xl border border-ink-800">
          <ScoreRing score={result.score} size={190} />

          {/* Layman English Summary Box */}
          <div className="w-full mt-5 p-4 rounded-xl bg-ink-950/80 border border-brand-blue-400/30 text-xs space-y-2">
            <div className="flex items-center gap-1.5 font-semibold text-brand-blue-300">
              <Info className="w-4 h-4 flex-shrink-0" />
              <span>Summary (Simple Explanation)</span>
            </div>
            <p className="text-ink-300 leading-relaxed font-normal">
              {result.verdict.laymanSummary}
            </p>
          </div>

          <div className="w-full mt-4 pt-3 border-t border-ink-800/80 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-ink-400 flex items-center gap-1.5 font-normal">
                <Lock className="w-3.5 h-3.5 text-brand-blue-400" />
                Digital Signature:
              </span>
              <span
                className={`font-semibold px-2 py-0.5 rounded-full ${
                  result.c2paStatus === 'Verified Signature'
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                    : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                }`}
              >
                {result.c2paStatus}
              </span>
            </div>
          </div>
        </div>

        {/* Reasons, Models & Breakdown */}
        <div className="lg:col-span-7 space-y-6">
          {/* Key Findings in Plain English */}
          <div className="bg-ink-900/60 rounded-2xl border border-ink-800 overflow-hidden">
            <button
              type="button"
              onClick={() => setReasonsOpen(!reasonsOpen)}
              className="w-full flex items-center justify-between p-4 text-left hover:bg-ink-800/40 transition-colors"
            >
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <span className="font-semibold text-sm text-white">
                  Key Observations ({result.reasons.length} checked points)
                </span>
              </div>
              <motion.div animate={{ rotate: reasonsOpen ? 180 : 0 }}>
                <ChevronDown className="w-4 h-4 text-ink-400" />
              </motion.div>
            </button>

            <AnimatePresence>
              {reasonsOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ opacity: 0, height: 0 }}
                  className="px-4 pb-4 border-t border-ink-800/80 pt-3"
                >
                  <ul className="space-y-2.5 text-xs text-ink-300">
                    {result.reasons.map((reason, idx) => (
                      <li key={idx} className="flex items-start gap-2 leading-relaxed font-normal">
                        <span className="w-1.5 h-1.5 rounded-full bg-brand-blue-400 mt-1.5 flex-shrink-0" />
                        <span>{reason}</span>
                      </li>
                    ))}
                  </ul>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Embedded AI Models Specification Card */}
          <div className="bg-ink-900/60 rounded-2xl border border-ink-800 overflow-hidden">
            <button
              type="button"
              onClick={() => setModelsOpen(!modelsOpen)}
              className="w-full flex items-center justify-between p-4 text-left hover:bg-ink-800/40 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-brand-blue-400" />
                <span className="font-semibold text-sm text-white">
                  Active Forensic AI Models ({EMBEDDED_MODELS.length} Ensembles)
                </span>
              </div>
              <motion.div animate={{ rotate: modelsOpen ? 180 : 0 }}>
                <ChevronDown className="w-4 h-4 text-ink-400" />
              </motion.div>
            </button>

            <AnimatePresence>
              {modelsOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ opacity: 0, height: 0 }}
                  className="px-4 pb-4 border-t border-ink-800/80 pt-3 space-y-2.5"
                >
                  {EMBEDDED_MODELS.map((model, idx) => (
                    <div key={idx} className="p-3 rounded-xl bg-ink-950/80 border border-ink-800 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-brand-blue-300">{model.name}</span>
                        <span className="font-mono text-[11px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                          {model.accuracy} Acc
                        </span>
                      </div>
                      <p className="text-ink-400 mt-1 text-[11px] font-normal">{model.description}</p>
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Breakdown Chart */}
          <div className="bg-ink-900/60 p-4 sm:p-5 rounded-2xl border border-ink-800">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-300 mb-3 flex items-center gap-1.5">
              <FileCheck className="w-4 h-4 text-brand-blue-400" />
              Safety Check Breakdown
            </h4>

            <div className="h-44 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  layout="vertical"
                  margin={{ top: 5, right: 15, left: 30, bottom: 5 }}
                >
                  <XAxis type="number" domain={[0, 100]} stroke="#5C6370" fontSize={10} />
                  <YAxis
                    dataKey="name"
                    type="category"
                    stroke="#8E949F"
                    fontSize={10}
                    width={110}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#16181C',
                      borderColor: '#2A2E35',
                      borderRadius: '8px',
                      color: '#FFF',
                      fontSize: '12px',
                    }}
                    formatter={(val: number) => [`${val}% Authenticity`, 'Rating']}
                  />
                  <Bar dataKey="score" radius={[0, 6, 6, 0]}>
                    {chartData.map((entry, index) => {
                      const color =
                        entry.score >= 75
                          ? '#10B981'
                          : entry.score >= 40
                          ? '#F59E0B'
                          : '#EF4444';
                      return <Cell key={`cell-${index}`} fill={color} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
