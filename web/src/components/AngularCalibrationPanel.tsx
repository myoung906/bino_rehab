'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fitAngularCalibration, type AngularReference } from '@/utils/angularCalibration';
import { sameScope } from '@/utils/calibration';
import type { CalibrationProfile, Point, TrackingFrame } from '@/utils/measurementTypes';

interface Props { frame: TrackingFrame | null; profile: CalibrationProfile; onChange: (updates: Partial<CalibrationProfile>) => void }
const directions = ['중앙', '왼쪽', '오른쪽', '위쪽', '아래쪽'];
const button = 'min-h-14 w-full touch-manipulation rounded-2xl bg-cyan-300 px-4 py-3 text-lg font-bold text-slate-950 disabled:opacity-40';
export default function AngularCalibrationPanel({ frame, profile, onChange }: Props) {
  const frames = useRef<TrackingFrame[]>([]);
  const anchor = useRef<TrackingFrame | null>(null);
  const [samples, setSamples] = useState<AngularReference[]>([]);
  const [angles, setAngles] = useState({ right: { x: 0, y: 0 }, left: { x: 0, y: 0 } });
  const [message, setMessage] = useState('검사자가 실제 표적각도를 입력해주세요.');
  const [running, setRunning] = useState(false);
  const [countdown, setCountdown] = useState(3);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (!frame || !frame.eyes.right.valid || !frame.eyes.left.valid || !frame.eyes.right.position || !frame.eyes.left.position) { frames.current = []; return; }
    frames.current = [...frames.current.filter(f => frame.timestamp - f.timestamp < 1200), frame];
  }, [frame]);
  const record = useCallback(() => {
    const buffer = frames.current;
    if (buffer.length < 5 || performance.now() - buffer[buffer.length - 1].timestamp > 300) {
      setMessage('두 눈이 보이게 맞춘 뒤 다시 시작하세요.'); return;
    }
    const avg = (eye: 'right' | 'left'): Point => ({ x: buffer.reduce((sum, f) => sum + f.eyes[eye].position!.x, 0) / buffer.length, y: buffer.reduce((sum, f) => sum + f.eyes[eye].position!.y, 0) / buffer.length });
    const positions = { right: avg('right'), left: avg('left') };
    if (buffer.some(f => Math.abs(f.faceWidthPx / buffer[0].faceWidthPx - 1) > .03 || Math.abs(f.pose.x - buffer[0].pose.x) > .02 || Math.abs(f.pose.y - buffer[0].pose.y) > .02 || Math.abs(f.roll - buffer[0].roll) > .03
      || Math.hypot(f.eyes.right.position!.x - positions.right.x, f.eyes.right.position!.y - positions.right.y) > .02 || Math.hypot(f.eyes.left.position!.x - positions.left.x, f.eyes.left.position!.y - positions.left.y) > .02)) {
      setMessage('머리를 고정하고 같은 표적을 다시 보세요.'); return;
    }
    if (anchor.current && buffer.some(f => !sameScope(f.scope, anchor.current!.scope) || Math.abs(f.faceWidthPx / anchor.current!.faceWidthPx - 1) > .03
      || Math.hypot(f.pose.x - anchor.current!.pose.x, f.pose.y - anchor.current!.pose.y) > .02 || Math.abs(f.roll - anchor.current!.roll) > .03)) {
      setMessage('위치가 바뀌었습니다. 처음부터 다시 보정하세요.'); return;
    }
    anchor.current ||= buffer[0];
    const next = [...samples, { positions, angles: { right: { ...angles.right }, left: { ...angles.left } } }];
    frames.current = [];
    if (next.length === 5) {
      const fitted = fitAngularCalibration(next);
      if (fitted) { setSamples(next); onChange({ angular: fitted, angularScope: buffer[buffer.length - 1].scope }); setSaved(true); setMessage('각도 보정이 저장됐습니다.'); }
      else { setMessage('각도와 시선이 맞지 않습니다. 마지막 표적을 다시 확인하세요.'); }
    } else { setSamples(next); setMessage(`다음은 ${directions[next.length]} 표적입니다.`); }
  }, [angles, samples, onChange]);
  useEffect(() => {
    if (!running) return;
    const started = performance.now(); let observing = false;
    const timer = window.setInterval(() => {
      const elapsed = performance.now() - started;
      setCountdown(Math.max(0, Math.ceil((3000 - elapsed) / 1000)));
      if (elapsed >= 3000 && !observing) { observing = true; frames.current = []; }
      if (elapsed >= 4500) { window.clearInterval(timer); record(); setRunning(false); }
    }, 100);
    return () => window.clearInterval(timer);
  }, [running, record]);
  useEffect(() => {
    const cancel = () => { if (document.hidden) { setRunning(false); frames.current = []; setMessage('다시 시작하세요.'); } };
    document.addEventListener('visibilitychange', cancel);
    return () => document.removeEventListener('visibilitychange', cancel);
  }, []);
  const reset = () => { setRunning(false); setSamples([]); frames.current = []; anchor.current = null; setSaved(false); setMessage('중앙 표적부터 다시 시작하세요.'); };
  return <div className="space-y-3">
    <p className="text-sm text-cyan-300">검사자용 · {Math.min(samples.length + 1, 5)} / 5</p>
    <h2 className="text-xl font-bold" role="status" aria-live="polite">{running ? countdown > 0 ? `${countdown}초 뒤 ${directions[samples.length]} 표적을 보세요.` : '머리를 고정하고 계속 보세요.' : message}</h2>
    {!saved && !running && <><p className="text-sm">{directions[samples.length]} 표적의 실제 각도 (°)</p><div className="grid grid-cols-2 gap-2">
      {(['right', 'left'] as const).map(eye => <fieldset key={eye} className="rounded-xl bg-slate-900 p-2"><legend className="text-sm">{eye === 'right' ? '오른눈' : '왼눈'}</legend>
        {(['x', 'y'] as const).map(axis => <label key={axis} className="block text-xs">{axis === 'x' ? '수평' : '수직'}<input aria-label={`${eye === 'right' ? '오른눈' : '왼눈'} ${axis === 'x' ? '수평' : '수직'} 표적각도`} type="number" inputMode="decimal" min={-10} max={10} step={.1} className="mt-1 min-h-11 w-full rounded-lg bg-slate-800 px-2 text-base" value={angles[eye][axis]} onChange={e => setAngles(a => ({ ...a, [eye]: { ...a[eye], [axis]: Number(e.target.value) } }))} /></label>)}
      </fieldset>)}
    </div><p className="text-xs text-slate-400">영상 기준 오른쪽·아래쪽 +, 왼쪽·위쪽 −</p></>}
    {!saved && <button className={button} disabled={running} onClick={() => {
      if (!frame?.eyes.right.valid || !frame?.eyes.left.valid) { setMessage('카메라에 두 눈이 보이게 맞춰주세요.'); return; }
      frames.current = []; setCountdown(3); setRunning(true);
    }}>{running ? '자동 기록 중…' : '3초 뒤 자동 기록'}</button>}
    <button className="min-h-12 touch-manipulation rounded-xl border border-slate-600 px-4 py-2" onClick={reset}>처음부터 다시</button>
    {!saved && profile.angular.right.horizontalDegPerUnit !== null && <p className="text-xs text-slate-300">기존 보정은 새 보정이 끝날 때 교체합니다.</p>}
  </div>;
}
