'use client';

import React, { memo } from 'react';
import VideoAnalyzer from "@/components/VideoAnalyzer";
import { useBinocularLogic } from "@/hooks/useBinocularLogic";
import { useAnalysisStore } from "@/hooks/useAnalysisStore";
import { adjustIPDByDistance } from "@/utils/clinicalCalculations";
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

// history만 구독 — velocity/symmetry 변경 시 리렌더 없음 (~10fps로만 갱신)
const VelocityChart = memo(() => {
  const history = useAnalysisStore((s) => s.history);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={history}>
        <YAxis hide domain={['auto', 'auto']} />
        <Line type="monotone" dataKey="v" stroke="#06b6d4" strokeWidth={1.5} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
});
VelocityChart.displayName = 'VelocityChart';

// velocity, symmetry만 구독 — clinical/history 변경 시 리렌더 없음
const RealtimeMetrics = memo(() => {
  const velocity = useAnalysisStore((s) => s.velocity);
  const symmetry = useAnalysisStore((s) => s.symmetry);
  return (
    <div className="glass-panel p-3 rounded-xl">
      <h2 className="text-xs font-semibold mb-2 text-slate-300 uppercase tracking-wider">Real-time</h2>
      <div className="bg-slate-800/50 p-2 rounded-lg border border-slate-700 mb-2">
        <p className="text-slate-500 text-[10px]">Velocity</p>
        <p className="text-xl font-mono text-cyan-400">{velocity.toFixed(2)} <span className="text-xs text-slate-500">mm/s</span></p>
      </div>
      <div className="bg-slate-800/50 p-2 rounded-lg border border-slate-700 mb-2">
        <p className="text-slate-500 text-[10px] mb-1">Convergence</p>
        <div className="h-24">
          <VelocityChart />
        </div>
      </div>
      <div className="flex justify-between items-center bg-slate-800/50 px-2 py-1.5 rounded-lg border border-slate-700">
        <span className="text-slate-500 text-[10px]">Symmetry</span>
        <span className="font-mono text-sm text-purple-400">{symmetry}%</span>
      </div>
    </div>
  );
});
RealtimeMetrics.displayName = 'RealtimeMetrics';

// clinical만 구독 — 녹화 종료 시에만 리렌더 (매 프레임 불필요)
const ClinicalPanel = memo(() => {
  const clinical = useAnalysisStore((s) => s.clinical);
  return (
    <div className="flex flex-col gap-2 overflow-y-auto min-h-0 pr-1">
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
  );
});
ClinicalPanel.displayName = 'ClinicalPanel';

// calibration만 구독 — 30프레임마다만 갱신
const CalibrationPanel = memo(() => {
  const calibration = useAnalysisStore((s) => s.calibration);
  if (calibration.pixelToMm === 0) return null;

  // 거리 기반 IPD 보정
  const adjustedIPD = adjustIPDByDistance(calibration.ipdMm, calibration.distanceCm);
  const ipdDisplay = calibration.distanceCm < 600
    ? `${adjustedIPD.toFixed(1)} (${calibration.ipdMm.toFixed(1)})`  // 주시거리 IPD (원거리 IPD)
    : `${adjustedIPD.toFixed(1)}`;  // 원거리는 단일 표시

  return (
    <div className="glass-panel p-3 rounded-xl">
      <h2 className="text-xs font-semibold mb-2 text-slate-300 uppercase tracking-wider">
        보정 <span className="text-slate-500 font-normal">Calibration</span>
      </h2>
      <div className="divide-y divide-slate-700/50">
        <MetricRow label="PX→mm 계수" value={calibration.pixelToMm.toFixed(3)} />
        <MetricRow label="추정 거리" value={calibration.distanceCm.toFixed(0)} unit="cm" />
        <MetricRow label="IPD" value={ipdDisplay} unit="mm" />
      </div>
    </div>
  );
});
CalibrationPanel.displayName = 'CalibrationPanel';

export default function Home() {
  const { processFrame } = useBinocularLogic();
  // isRecording, toggleRecording만 구독 — 프레임 업데이트 시 Home 리렌더 없음
  const isRecording = useAnalysisStore((s) => s.isRecording);
  const toggleRecording = useAnalysisStore((s) => s.toggleRecording);
  const userAge = useAnalysisStore((s) => s.userAge);
  const setUserAge = useAnalysisStore((s) => s.setUserAge);

  return (
    <div className="grid grid-rows-[auto_1fr] h-screen p-2 md:p-3 gap-2 md:gap-3 font-[family-name:var(--font-geist-sans)] overflow-hidden">
      <header className="flex flex-wrap justify-between items-center gap-2 glass-panel px-3 md:px-4 py-2 rounded-xl">
        <h1 className="text-sm md:text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-blue-500">
          Binocular Vision Rehab
        </h1>
        <div className="flex items-center gap-2 md:gap-3">
          <label className="flex items-center gap-1 md:gap-1.5 text-[10px] md:text-xs text-slate-400">
            <span className="hidden sm:inline">나이</span>
            <input
              type="number"
              placeholder="나이"
              min={5}
              max={80}
              className="w-12 md:w-14 bg-slate-800 border border-slate-600 rounded px-1.5 md:px-2 py-1 text-[10px] md:text-xs text-slate-300 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              value={userAge ?? ''}
              onChange={(e) => setUserAge(e.target.value ? parseInt(e.target.value) : undefined)}
            />
          </label>
          <button
            onClick={toggleRecording}
            className={`px-2 md:px-3 py-1 md:py-1.5 rounded-lg text-[10px] md:text-xs font-semibold transition-all ${isRecording ? 'bg-red-500/20 text-red-400 border border-red-500 hover:bg-red-500/30' : 'bg-cyan-500/20 text-cyan-400 border border-cyan-500 hover:bg-cyan-500/30'}`}
          >
            <span className="hidden sm:inline">{isRecording ? 'STOP ANALYSIS' : 'START ANALYSIS'}</span>
            <span className="sm:hidden">{isRecording ? 'STOP' : 'START'}</span>
          </button>
        </div>
      </header>

      <main className="flex flex-col md:grid md:grid-cols-[2fr_1fr] lg:grid-cols-[1fr_240px_240px] gap-2 md:gap-3 min-h-0 overflow-hidden">
        {/* 비디오 영역 */}
        <div className="h-[35vh] sm:h-[40vh] md:h-auto md:min-h-0 flex-shrink-0">
          <VideoAnalyzer onFrame={processFrame} />
        </div>

        {/* 태블릿: 오른쪽 열에 메트릭+임상 세로 스택 */}
        <div className="hidden md:flex md:flex-col lg:hidden gap-2 overflow-y-auto min-h-0 pr-1">
          <RealtimeMetrics />
          <CalibrationPanel />
          <ClinicalPanel />
        </div>

        {/* 데스크탑: 실시간 메트릭 패널 (2번째 열) */}
        <div className="hidden lg:flex lg:flex-col gap-2 overflow-y-auto min-h-0 pr-1">
          <RealtimeMetrics />
          <CalibrationPanel />
        </div>

        {/* 데스크탑: 임상 결과 패널 (3번째 열) */}
        <div className="hidden lg:block overflow-y-auto min-h-0">
          <ClinicalPanel />
        </div>

        {/* 모바일: 실시간 메트릭 */}
        <div className="flex md:hidden flex-col gap-2 max-h-[30vh] sm:max-h-[35vh] overflow-y-auto pr-1">
          <RealtimeMetrics />
          <CalibrationPanel />
        </div>

        {/* 모바일: 임상 결과 */}
        <div className="flex md:hidden flex-col gap-2 max-h-[30vh] overflow-y-auto pr-1">
          <ClinicalPanel />
        </div>
      </main>
    </div>
  );
}
