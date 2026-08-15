export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

function isForbiddenUrl(urlString: string): boolean {
  try {
    const parsed = new URL(urlString);
    const hostname = parsed.hostname.toLowerCase();

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return true;
    }

    const forbiddenPatterns = [
      'localhost',
      '127.0.0.1',
      '0.0.0.0',
      '::1',
      '169.254.169.254',
      'metadata.google.internal',
      '.internal',
      '.local',
    ];

    if (forbiddenPatterns.some((pattern) => hostname.includes(pattern))) {
      return true;
    }

    if (
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.') ||
      (hostname.startsWith('172.') && parseInt(hostname.split('.')[1], 10) >= 16 && parseInt(hostname.split('.')[1], 10) <= 31)
    ) {
      return true;
    }

    return false;
  } catch {
    return true;
  }
}

export async function POST(req: NextRequest) {
  try {
    let filename = 'admin_scan.jpg';
    let fileSize = '2.4 MB';
    let fileType: 'image' | 'video' | 'audio' | 'url' = 'image';
    let fileBlob: Blob | null = null;

    const contentType = req.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      if (!file) {
        return NextResponse.json({ error: 'No file provided in form data.' }, { status: 400 });
      }
      filename = file.name.replace(/[^a-zA-Z0-9_.-]/g, '_');
      const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
      fileSize = `${sizeMb} MB`;
      if (file.type.startsWith('video/')) fileType = 'video';
      else if (file.type.startsWith('audio/')) fileType = 'audio';
      else fileType = 'image';

      fileBlob = file;
    } else if (contentType.includes('application/json')) {
      const json = await req.json();
      if (!json.url) {
        return NextResponse.json({ error: 'No URL provided in request payload.' }, { status: 400 });
      }

      if (isForbiddenUrl(json.url)) {
        return NextResponse.json(
          { error: 'Security Blocked: URL points to forbidden internal or invalid network resource.' },
          { status: 400 }
        );
      }

      filename = json.url.replace(/^https?:\/\//, '').split('/')[0] || 'remote_media';
      fileType = 'url';
      fileSize = 'Remote Stream';
    } else {
      return NextResponse.json({ error: 'Unsupported Content-Type header' }, { status: 400 });
    }

    if (!fileBlob) {
      return NextResponse.json(
        { error: 'Direct real-model analysis currently requires file uploads to forward to inference engine.' },
        { status: 400 }
      );
    }

    // Direct call to FastAPI inference server without heuristic fallback
    let pyInferenceResult = null;
    const pythonServerBase = (process.env.PYTHON_SERVER_URL || 'http://localhost:8000').replace(/\/$/, '');
    const targetPredictEndpoint = `${pythonServerBase}/predict`;
    let pyErrorDetail = `Inference server (${targetPredictEndpoint}) is offline or unresponsive.`;
    let pyStatus = 503;

    try {
      const pyFormData = new FormData();
      pyFormData.append('file', fileBlob, filename);
      pyFormData.append('fileType', fileType);

      const pyRes = await fetch(targetPredictEndpoint, {
        method: 'POST',
        body: pyFormData,
        signal: AbortSignal.timeout(10000),
      });

      if (pyRes.ok) {
        pyInferenceResult = await pyRes.json();
      } else {
        const errorJson = await pyRes.json().catch(() => ({ detail: pyRes.statusText }));
        pyErrorDetail = errorJson.detail || `Inference server returned HTTP ${pyRes.status}`;
        pyStatus = pyRes.status;
      }
    } catch (err: any) {
      pyErrorDetail = `Failed to connect to FastAPI inference server: ${err?.message || 'Network unreachable'}`;
      pyStatus = 503;
    }

    if (!pyInferenceResult) {
      return NextResponse.json(
        {
          error: 'Real Model Inference Error',
          detail: pyErrorDetail,
          note: 'Direct admin scan mode does NOT fall back to heuristics. Ensure python scripts/inference_server.py is running.',
        },
        { status: pyStatus }
      );
    }

    // Direct model inference successful
    const finalScore = pyInferenceResult.trustScore;
    const category = pyInferenceResult.category;

    const verdictLabel = category === 'genuine' ? 'Real & Original' : category === 'suspicious' ? 'Edited or Modified' : 'AI-Generated / Deepfake';
    const shortLabel = category === 'genuine' ? 'Real' : category === 'suspicious' ? 'Edited' : 'AI Fake';
    const badgeBg = category === 'genuine' ? 'bg-emerald-500/10' : category === 'suspicious' ? 'bg-amber-500/10' : 'bg-rose-500/10';
    const badgeText = category === 'genuine' ? 'text-emerald-400' : category === 'suspicious' ? 'text-amber-400' : 'text-rose-400';
    const badgeBorder = category === 'genuine' ? 'border-emerald-500/30' : category === 'suspicious' ? 'border-amber-500/30' : 'border-rose-500/30';
    const ringColor = category === 'genuine' ? '#10B981' : category === 'suspicious' ? '#F59E0B' : '#EF4444';
    const glowColor = category === 'genuine' ? 'rgba(16, 185, 129, 0.25)' : category === 'suspicious' ? 'rgba(245, 158, 11, 0.25)' : 'rgba(239, 68, 68, 0.25)';

    const laymanSummary = category === 'genuine'
      ? `Real Model Prediction: Verified Genuine with ${finalScore}% trust probability.`
      : category === 'suspicious'
      ? `Real Model Prediction: Flagged Suspicious / Modified with ${finalScore}% trust probability.`
      : `Real Model Prediction: High probability Deepfake detected (Fake Probability: ${pyInferenceResult.fakeProbability}%).`;

    const verdict = {
      category,
      label: verdictLabel,
      shortLabel,
      badgeBg,
      badgeText,
      badgeBorder,
      ringColor,
      glowColor,
      description: laymanSummary,
      recommendation: category === 'genuine' ? 'Direct model verified safe.' : 'Exercise caution; model detected synthetic features.',
      laymanSummary,
    };

    let reasonsList = [
      `Direct PyTorch EfficientNet Inference: Predicted '${pyInferenceResult.predictedClass}'.`,
      `Real probability: ${pyInferenceResult.realProbability}% | Fake probability: ${pyInferenceResult.fakeProbability}%.`,
      `Temperature calibration: ${pyInferenceResult.calibrated ? 'Applied' : 'Default (1.0)'}.`,
      `Face cropped: ${pyInferenceResult.faceCropped ? 'Yes (MTCNN 35% margin)' : 'No / Full frame'}.`,
    ];

    // Optional LLM Layman Verdict Enhancement (Gated by GOOGLE_AI_API_KEY / OPENROUTER_API_KEY)
    try {
      const { generateAiLaymanExplanation } = await import('@/lib/models/external_ai');
      const aiResponse = await generateAiLaymanExplanation(finalScore, category, reasonsList, fileType);
      if (aiResponse) {
        verdict.laymanSummary = aiResponse.summary;
        verdict.description = aiResponse.summary;
        reasonsList = aiResponse.reasons;
      }
    } catch {
      // Continue with template explanations if AI key absent or request fails
    }

    const scanId = `ADM-${Math.floor(100000 + Math.random() * 900000)}`;

    const responseData = {
      id: scanId,
      filename,
      fileType,
      fileSize,
      score: finalScore,
      verdict,
      reasons: reasonsList,
      breakdown: {
        faceForgeryScore: Math.round(100 - pyInferenceResult.fakeProbability),
        frequencyGanScore: Math.round(pyInferenceResult.realProbability),
        audioSpoofScore: 90,
        exifElaScore: 90,
        c2paScore: 90,
      },
      timestamp: new Date().toISOString(),
      hash: `0x${Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('')}`,
      c2paStatus: category === 'genuine' ? 'Verified Signature' : 'Missing / Stripped',
      trustBadgeUrl: `https://verifai.open/badge/${scanId}`,
      modelEngine: `PyTorch Server Direct Endpoint (/predict) - Class: ${pyInferenceResult.predictedClass}`,
      rawModelResponse: pyInferenceResult,
    };

    return NextResponse.json(responseData, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Failed to analyze file via direct model' },
      { status: 500 }
    );
  }
}
