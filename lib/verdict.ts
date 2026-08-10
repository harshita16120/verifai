export type VerdictCategory = 'genuine' | 'suspicious' | 'manipulated';

export interface VerdictInfo {
  category: VerdictCategory;
  label: string;
  shortLabel: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  ringColor: string;
  glowColor: string;
  description: string;
  recommendation: string;
  laymanSummary: string;
}

export const VERDICT_CONFIG: Record<VerdictCategory, VerdictInfo> = {
  genuine: {
    category: 'genuine',
    label: 'Real & Original',
    shortLabel: 'Real',
    badgeBg: 'bg-emerald-500/10',
    badgeText: 'text-emerald-400',
    badgeBorder: 'border-emerald-500/30',
    ringColor: '#10B981',
    glowColor: 'rgba(16, 185, 129, 0.25)',
    description: 'This file looks genuine. We checked its camera details, image structure, and facial patterns, and found no signs of AI generation or editing.',
    recommendation: 'Safe to trust and share. This photo or video shows normal camera properties.',
    laymanSummary: 'This photo/video appears to be completely real. It has matching camera data, natural lighting patterns, and shows no traces of computer generation or face-swapping.',
  },
  suspicious: {
    category: 'suspicious',
    label: 'Edited or Modified',
    shortLabel: 'Edited',
    badgeBg: 'bg-amber-500/10',
    badgeText: 'text-amber-400',
    badgeBorder: 'border-amber-500/30',
    ringColor: '#F59E0B',
    glowColor: 'rgba(245, 158, 11, 0.25)',
    description: 'Some parts of this image look modified or re-saved using photo editing tools like Photoshop. Exercise caution.',
    recommendation: 'Be careful before sharing. While it might not be a total deepfake, it shows clear signs of digital editing or missing camera information.',
    laymanSummary: 'This image appears to have been edited or retouched. We found signs of image re-compression and software editing tags (like Photoshop), but it might not be 100% fake.',
  },
  manipulated: {
    category: 'manipulated',
    label: 'AI-Generated / Deepfake',
    shortLabel: 'AI Fake',
    badgeBg: 'bg-rose-500/10',
    badgeText: 'text-rose-400',
    badgeBorder: 'border-rose-500/30',
    ringColor: '#EF4444',
    glowColor: 'rgba(239, 68, 68, 0.25)',
    description: 'Strong evidence of AI generation or face-swapping detected. The lighting, facial boundaries, or noise patterns match computer-generated models.',
    recommendation: 'Do not trust or spread this file as authentic news. It was created or heavily altered using AI algorithms.',
    laymanSummary: 'Warning: This file is almost certainly fake or computer-generated. Our scanners detected artificial facial blending around the eyes/mouth and synthetic AI patterns.',
  },
};

export function getVerdict(score: number): VerdictInfo {
  if (score >= 75) {
    return VERDICT_CONFIG.genuine;
  }
  if (score >= 40) {
    return VERDICT_CONFIG.suspicious;
  }
  return VERDICT_CONFIG.manipulated;
}

export interface FusionWeightsConfig {
  faceForgery: number;
  frequencyGan: number;
  audioSpoof: number;
  exifEla: number;
  c2pa: number;
}

export const DEFAULT_FUSION_CONFIG: FusionWeightsConfig = {
  faceForgery: 0.2,
  frequencyGan: 0.2,
  audioSpoof: 0.2,
  exifEla: 0.2,
  c2pa: 0.2,
};

/**
 * Single source of truth for fusion score calculation from modular breakdown.
 */
export function calculateFusedScore(
  breakdown: {
    faceForgeryScore: number;
    frequencyGanScore: number;
    audioSpoofScore: number;
    exifElaScore: number;
    c2paScore: number;
  },
  weights: FusionWeightsConfig = DEFAULT_FUSION_CONFIG
): number {
  const totalWeight =
    weights.faceForgery + weights.frequencyGan + weights.audioSpoof + weights.exifEla + weights.c2pa;
  if (totalWeight === 0) return 50;

  const raw =
    (breakdown.faceForgeryScore * weights.faceForgery +
      breakdown.frequencyGanScore * weights.frequencyGan +
      breakdown.audioSpoofScore * weights.audioSpoof +
      breakdown.exifElaScore * weights.exifEla +
      breakdown.c2paScore * weights.c2pa) /
    totalWeight;

  return Math.round(Math.min(100, Math.max(0, raw)));
}

export interface ScoringLegendItem {
  range: string;
  category: VerdictCategory;
  label: string;
  badgeStyle: string;
}

export const SCORING_LEGEND: ScoringLegendItem[] = [
  {
    range: '75 – 100',
    category: 'genuine',
    label: 'Real & Original',
    badgeStyle: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  },
  {
    range: '40 – 74',
    category: 'suspicious',
    label: 'Edited or Modified',
    badgeStyle: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  },
  {
    range: '0 – 39',
    category: 'manipulated',
    label: 'AI-Generated / Deepfake',
    badgeStyle: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
  },
];