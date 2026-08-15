import { create } from 'zustand';
import { VerdictInfo } from './verdict';

export type ScanStatus = 'idle' | 'uploading' | 'analyzing' | 'complete' | 'error';

export interface ModularBreakdown {
  faceForgeryScore: number;
  frequencyGanScore: number;
  audioSpoofScore: number;
  exifElaScore: number;
  c2paScore: number;
}

export interface ScanResult {
  id: string;
  filename: string;
  fileType: 'image' | 'video' | 'audio' | 'url';
  fileSize: string;
  score: number;
  verdict: VerdictInfo;
  reasons: string[];
  breakdown: ModularBreakdown;
  timestamp: string;
  hash: string;
  c2paStatus: 'Verified Signature' | 'Missing / Stripped' | 'Invalid Manifest';
  trustBadgeUrl: string;
}

export interface NodeTooltipData {
  id: string;
  title: string;
  layer: string;
  tech: string;
  description: string;
  metrics?: string;
}

interface AppState {
  // Scan State
  scanStatus: ScanStatus;
  progress: number;
  activeFile: File | null;
  activeUrl: string;
  scanResult: ScanResult | null;
  scanError: string | null;
  
  // Handlers
  setScanStatus: (status: ScanStatus) => void;
  setProgress: (progress: number) => void;
  setActiveFile: (file: File | null) => void;
  setActiveUrl: (url: string) => void;
  setScanResult: (result: ScanResult | null) => void;
  setScanError: (error: string | null) => void;
  resetScan: () => void;
  
  // UI State
  activeNavSection: string;
  setActiveNavSection: (section: string) => void;
  mobileMenuOpen: boolean;
  setMobileMenuOpen: (open: boolean) => void;
  
  // Diagram Tooltips State
  selectedNode: NodeTooltipData | null;
  setSelectedNode: (node: NodeTooltipData | null) => void;
  
  // Persona Toggle State (§5.9)
  persona: 'users' | 'newsrooms';
  setPersona: (persona: 'users' | 'newsrooms') => void;
  
  // Tech Stack Filter State (§5.7)
  techFilter: string;
  setTechFilter: (filter: string) => void;
  
  // Toast State
  toastMessage: string | null;
  showToast: (msg: string) => void;
  hideToast: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  // Scan State
  scanStatus: 'idle',
  progress: 0,
  activeFile: null,
  activeUrl: '',
  scanResult: null,
  scanError: null,

  setScanStatus: (scanStatus) => set({ scanStatus }),
  setProgress: (progress) => set({ progress }),
  setActiveFile: (activeFile) => set({ activeFile, activeUrl: '' }),
  setActiveUrl: (activeUrl) => set({ activeUrl, activeFile: null }),
  setScanResult: (scanResult) => set({ scanResult }),
  setScanError: (scanError) => set({ scanError }),
  resetScan: () => set({ scanStatus: 'idle', progress: 0, activeFile: null, activeUrl: '', scanResult: null, scanError: null }),

  // UI State
  activeNavSection: 'hero',
  setActiveNavSection: (activeNavSection) => set({ activeNavSection }),
  mobileMenuOpen: false,
  setMobileMenuOpen: (mobileMenuOpen) => set({ mobileMenuOpen }),

  // Diagram Tooltips
  selectedNode: null,
  setSelectedNode: (selectedNode) => set({ selectedNode }),

  // Persona Toggle
  persona: 'users',
  setPersona: (persona) => set({ persona }),

  // Tech Stack Filter
  techFilter: 'all',
  setTechFilter: (techFilter) => set({ techFilter }),

  // Toast
  toastMessage: null,
  showToast: (msg) => {
    set({ toastMessage: msg });
    setTimeout(() => {
      set({ toastMessage: null });
    }, 3000);
  },
  hideToast: () => set({ toastMessage: null }),
}));