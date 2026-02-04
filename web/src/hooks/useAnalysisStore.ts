import { create } from 'zustand';

interface AnalysisState {
    velocity: number;
    symmetry: number;
    acA: number;
    isRecording: boolean;
    history: { t: number; v: number }[];

    setVelocity: (v: number) => void;
    setSymmetry: (s: number) => void;
    toggleRecording: () => void;
    addHistory: (t: number, v: number) => void;
}

export const useAnalysisStore = create<AnalysisState>((set) => ({
    velocity: 0,
    symmetry: 0,
    acA: 0,
    isRecording: false,
    history: [],

    setVelocity: (v) => set({ velocity: v }),
    setSymmetry: (s) => set({ symmetry: s }),
    toggleRecording: () => set((state) => ({ isRecording: !state.isRecording, history: state.isRecording ? state.history : [] })),
    addHistory: (t, v) => set((state) => ({ history: [...state.history.slice(-100), { t, v }] })), // Keep last 100 points
}));
