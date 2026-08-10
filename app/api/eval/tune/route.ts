// ──────────────────────────────────────────────────────────────
// app/api/eval/tune/route.ts — POST run tuning pass, PUT apply weights
// ──────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { runFusionWeightTuner } from '@/lib/eval/tuner';
import { generateEvalSamples } from '@/lib/eval/sampleGenerator';
import type { FusionWeights, JudgedResult, TuningPassResult } from '@/lib/eval/types';
import { DEFAULT_FUSION_WEIGHTS } from '@/lib/eval/types';

const WEIGHTS_FILE = 'data/fusion-weights.json';
const HISTORY_FILE = 'data/weight-history.json';
const JUDGED_FILE = 'data/judged-results.json';

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

function writeJsonFile<T>(relativePath: string, data: T) {
  const filePath = path.join(process.cwd(), relativePath);
  const dirPath = path.dirname(filePath);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

/**
 * POST: Run a fusion weight tuning pass over judged results.
 * Returns proposed weights, working-set accuracy delta, held-out accuracy, and regression flag.
 */
export async function POST() {
  try {
    const currentWeights = readJsonFile<FusionWeights>(WEIGHTS_FILE, DEFAULT_FUSION_WEIGHTS);
    const judgedResults = readJsonFile<JudgedResult[]>(JUDGED_FILE, []);

    const samples = generateEvalSamples(currentWeights);
    const samplesById = samples.reduce<Record<string, typeof samples[0]>>((acc, s) => {
      acc[s.id] = s;
      return acc;
    }, {});

    const passResult = runFusionWeightTuner(currentWeights, judgedResults, samplesById);

    return NextResponse.json({
      success: true,
      result: passResult,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Tuning optimization pass failed' },
      { status: 500 }
    );
  }
}

/**
 * PUT: Apply proposed weights into data/fusion-weights.json and log pass to data/weight-history.json.
 */
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { passResult, weights } = body;

    const newWeights: FusionWeights = weights || passResult?.afterWeights;
    if (!newWeights) {
      return NextResponse.json(
        { error: 'Valid weights payload is required to apply weights.' },
        { status: 400 }
      );
    }

    // Write new active weights
    writeJsonFile(WEIGHTS_FILE, newWeights);

    // Append to versioned weight history
    const history = readJsonFile<TuningPassResult[]>(HISTORY_FILE, []);
    const passToRecord: TuningPassResult = passResult || {
      id: `TUNE-${Date.now()}`,
      timestamp: new Date().toISOString(),
      beforeWeights: readJsonFile<FusionWeights>(WEIGHTS_FILE, DEFAULT_FUSION_WEIGHTS),
      afterWeights: newWeights,
      workingSetAccuracyBefore: 0,
      workingSetAccuracyAfter: 0,
      heldOutAccuracyBefore: 0,
      heldOutAccuracyAfter: 0,
      applied: true,
    };
    passToRecord.applied = true;

    history.unshift(passToRecord);
    writeJsonFile(HISTORY_FILE, history);

    return NextResponse.json({
      success: true,
      appliedWeights: newWeights,
      history,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Failed to apply new fusion weights' },
      { status: 500 }
    );
  }
}
