// ──────────────────────────────────────────────────────────────
// app/api/eval/samples/route.ts — GET samples, weights, history
// ──────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { generateEvalSamples } from '@/lib/eval/sampleGenerator';
import type { FusionWeights, JudgedResult, TuningPassResult } from '@/lib/eval/types';
import { DEFAULT_FUSION_WEIGHTS } from '@/lib/eval/types';

function readJsonFile<T>(relativePath: string, defaultValue: T): T {
  try {
    const filePath = path.join(process.cwd(), relativePath);
    if (!fs.existsSync(filePath)) return defaultValue;
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content) as T;
  } catch {
    return defaultValue;
  }
}

export async function GET() {
  try {
    const weights = readJsonFile<FusionWeights>('data/fusion-weights.json', DEFAULT_FUSION_WEIGHTS);
    const judgedResults = readJsonFile<JudgedResult[]>('data/judged-results.json', []);
    const weightHistory = readJsonFile<TuningPassResult[]>('data/weight-history.json', []);

    // Generate samples with active fusion weights
    const samples = generateEvalSamples(weights);

    return NextResponse.json({
      samples,
      weights,
      judgedResults,
      weightHistory,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Failed to load evaluation dataset' },
      { status: 500 }
    );
  }
}
