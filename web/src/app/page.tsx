'use client';

import VideoAnalyzer from "@/components/VideoAnalyzer";
import { useBinocularLogic } from "@/hooks/useBinocularLogic";
import { useAnalysisStore } from "@/hooks/useAnalysisStore";
import { LineChart, Line, YAxis, ResponsiveContainer } from 'recharts';

const MetricRow = ({ label, value, unit, color = "text-cyan-400" }: {
  label: string; value: string | number | null; unit?: string; color?: string;
}) => (
  <div className="flex justify-between items-center py-1">
    <span className="text-slate-400 text-[11px]">{label}</span>
    <span className={`font-mono text-[11px] ${color}`}>
      {value !== null && value !== undefined ? value : '—'}{unit && value !== null ? ` ${unit}` : ''}
    </span>
  </div>
);

export default function Home() {
  const { processFrame } = useBinocularLogic();
  const { velocity, symmetry, isRecording, toggleRecording, history, clinical } = useAnalysisStore();

  return (
    <div className="grid grid-rows-[auto_1fr] h-screen p-3 gap-3 font-[family-name:var(--font-geist-sans)] overflow-hidden">
      <header className="flex justify-between items-center glass-panel px-4 py-2 rounded-xl">
        <h1 className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-blue-500">
          Binocular Vision Rehab
        </h1>
        <button
          onClick={toggleRecording}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${isRecording ? 'bg-red-500/20 text-red-400 border border-red-500 hover:bg-red-500/30' : 'bg-cyan-500/20 text-cyan-400 border border-cyan-500 hover:bg-cyan-500/30'}`}
        >
          {isRecording ? 'STOP ANALYSIS' : 'START ANALYSIS'}
        </button>
      </header>

      <main className="grid grid-cols-[1fr_240px_240px] gap-3 min-h-0">
        {/* Video Area */}
        <div className="min-h-0">
          <VideoAnalyzer onFrame={processFrame} />
        </div>

        {/* Left Column: Real-time */}
        <div className="flex flex-col gap-2 min-h-0">
          <div className="glass-panel p-3 rounded-xl">
            <h2 className="text-xs font-semibold mb-2 text-slate-300 uppercase tracking-wider">Real-time</h2>
            <div className="bg-slate-800/50 p-2 rounded-lg border border-slate-700 mb-2">
              <p className="text-slate-500 text-[10px]">Velocity</p>
              <p className="text-xl font-mono text-cyan-400">{velocity.toFixed(2)} <span className="text-xs text-slate-500">mm/s</span></p>
            </div>
            <div className="bg-slate-800/50 p-2 rounded-lg border border-slate-700 h-28 mb-2">
              <p className="text-slate-500 text-[10px] mb-1">Convergence</p>
              <ResponsiveContainer width="100%" height="85%">
                <LineChart data={history}>
                  <YAxis hide domain={['auto', 'auto']} />
                  <Line type="monotone" dataKey="v" stroke="#06b6d4" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-between items-center bg-slate-800/50 px-2 py-1.5 rounded-lg border border-slate-700">
              <span className="text-slate-500 text-[10px]">Symmetry</span>
              <span className="font-mono text-sm text-purple-400">{symmetry}%</span>
            </div>
          </div>
        </div>

        {/* Right Column: Clinical Results */}
        <div className="flex flex-col gap-2 overflow-y-auto min-h-0">
          <div className="glass-panel p-3 rounded-xl">
            <h2 className="text-xs font-semibold mb-2 text-slate-300 uppercase tracking-wider">
              원거리 <span className="text-slate-500 font-normal">Distance</span>
            </h2>
            <div className="divide-y divide-slate-700/50">
              <MetricRow label="사위 Phoria" value={clinical.distPhoria} unit="Δ" />
              <MetricRow label="양성상대폭주 PRC" value={clinical.distPRC} color="text-green-400" />
              <MetricRow label="음성상대폭주 NRC" value={clinical.distNRC} color="text-red-400" />
            </div>
          </div>

          <div className="glass-panel p-3 rounded-xl">
            <h2 className="text-xs font-semibold mb-2 text-slate-300 uppercase tracking-wider">
              근거리 <span className="text-slate-500 font-normal">Near</span>
            </h2>
            <div className="divide-y divide-slate-700/50">
              <MetricRow label="사위 Phoria" value={clinical.nearPhoria} unit="Δ" />
              <MetricRow label="양성상대폭주 PRC" value={clinical.nearPRC} color="text-green-400" />
              <MetricRow label="음성상대폭주 NRC" value={clinical.nearNRC} color="text-red-400" />
              <MetricRow label="양성상대조절 PRA" value={clinical.nearPRA} unit="D" color="text-green-400" />
              <MetricRow label="음성상대조절 NRA" value={clinical.nearNRA} unit="D" color="text-red-400" />
            </div>
          </div>

          <div className="glass-panel p-3 rounded-xl">
            <h2 className="text-xs font-semibold mb-2 text-slate-300 uppercase tracking-wider">
              추가측정 <span className="text-slate-500 font-normal">Additional</span>
            </h2>
            <div className="divide-y divide-slate-700/50">
              <MetricRow label="AC/A Ratio" value={clinical.acA} color="text-amber-400" />
              <MetricRow label="NPC" value={clinical.npc} unit="cm" color="text-amber-400" />
              <MetricRow label="최대조절력" value={clinical.maxAccom} unit="D" color="text-amber-400" />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
