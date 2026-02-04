'use client';

import VideoAnalyzer from "@/components/VideoAnalyzer";
import { useBinocularLogic } from "@/hooks/useBinocularLogic";
import { useAnalysisStore } from "@/hooks/useAnalysisStore";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function Home() {
  const { processFrame } = useBinocularLogic();
  const { velocity, symmetry, isRecording, toggleRecording, history } = useAnalysisStore();

  return (
    <div className="grid grid-rows-[auto_1fr] min-h-screen p-4 gap-4 sm:p-8 font-[family-name:var(--font-geist-sans)]">
      <header className="flex justify-between items-center glass-panel p-4 rounded-2xl">
        <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-blue-500">
          Binocular Vision Rehab
        </h1>
        <div className="flex gap-4 text-sm text-slate-400 items-center">
          <button
            onClick={toggleRecording}
            className={`px-4 py-2 rounded-lg font-semibold transition-all ${isRecording ? 'bg-red-500/20 text-red-400 border border-red-500 hover:bg-red-500/30' : 'bg-cyan-500/20 text-cyan-400 border border-cyan-500 hover:bg-cyan-500/30'}`}
          >
            {isRecording ? 'STOP ANALYSIS' : 'START ANALYSIS'}
          </button>
        </div>
      </header>

      <main className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
        {/* Main Video Area */}
        <div className="lg:col-span-2 h-[60vh] lg:h-auto min-h-[400px]">
          <VideoAnalyzer onFrame={processFrame} />
        </div>

        {/* Sidebar / Metrics Area */}
        <div className="flex flex-col gap-4">
          <div className="glass-panel p-6 rounded-2xl flex-1 flex flex-col">
            <h2 className="text-xl font-semibold mb-4 text-slate-200">Real-time Metrics</h2>

            <div className="space-y-4 mb-6">
              <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700">
                <p className="text-slate-400 text-sm">Velocity (Delta/Sec)</p>
                <p className="text-2xl font-mono text-cyan-400">{velocity.toFixed(2)} px/s</p>
                <div className="text-xs text-slate-500 mt-1">
                  {velocity > 50 ? "Fast Movement" : "Stable"}
                </div>
              </div>

              {/* Real-time Graph */}
              <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700 h-40">
                <p className="text-slate-400 text-sm mb-2">Convergence Trajectory</p>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={history}>
                    <YAxis hide domain={['auto', 'auto']} />
                    <Line type="monotone" dataKey="v" stroke="#06b6d4" strokeWidth={2} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700">
                <p className="text-slate-400 text-sm">Symmetry Index</p>
                <p className="text-2xl font-mono text-purple-400">{symmetry}%</p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
