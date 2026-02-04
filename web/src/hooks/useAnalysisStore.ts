import { create } from 'zustand';

export interface ClinicalMetrics {
    distPhoria: number | null;        // 원거리 사위 (Δ)
    distPRC: string | null;           // 원거리 양성상대폭주 (Blur/Break/Recovery)
    distNRC: string | null;           // 원거리 음성상대폭주 (Blur/Break/Recovery)
    nearPhoria: number | null;        // 근거리 사위 (Δ)
    nearPRC: string | null;           // 근거리 양성상대폭주 (Blur/Break/Recovery)
    nearNRC: string | null;           // 근거리 음성상대폭주 (Blur/Break/Recovery)
    nearPRA: number | null;           // 근거리 양성상대조절 (D)
    nearNRA: number | null;           // 근거리 음성상대조절 (D)
    acA: number | null;               // AC/A ratio
    npc: number | null;               // 근거리폭주근점 NPC (cm)
    maxAccom: number | null;          // 최대조절력 (D)
}

interface AnalysisState {
    velocity: number;
    symmetry: number;
    isRecording: boolean;
    history: { t: number; v: number }[];
    clinical: ClinicalMetrics;

    setVelocity: (v: number) => void;
    setSymmetry: (s: number) => void;
    toggleRecording: () => void;
    addHistory: (t: number, v: number) => void;
    setClinical: (updates: Partial<ClinicalMetrics>) => void;
}

const defaultClinical: ClinicalMetrics = {
    distPhoria: null,
    distPRC: null,
    distNRC: null,
    nearPhoria: null,
    nearPRC: null,
    nearNRC: null,
    nearPRA: null,
    nearNRA: null,
    acA: null,
    npc: null,
    maxAccom: null,
};

export const useAnalysisStore = create<AnalysisState>((set) => ({
    velocity: 0,
    symmetry: 0,
    isRecording: false,
    history: [],
    clinical: { ...defaultClinical },

    setVelocity: (v) => set({ velocity: v }),
    setSymmetry: (s) => set({ symmetry: s }),
    toggleRecording: () => set((state) => ({ isRecording: !state.isRecording, history: state.isRecording ? state.history : [] })),
    addHistory: (t, v) => set((state) => ({ history: [...state.history.slice(-100), { t, v }] })),
    setClinical: (updates) => set((state) => ({ clinical: { ...state.clinical, ...updates } })),
}));
