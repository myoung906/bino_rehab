'use client';

import { useEffect, useRef, useState } from 'react';
import { fitAngularCalibration, type AngularReference } from '@/utils/angularCalibration';
import { sameScope } from '@/utils/calibration';
import type { CalibrationProfile, Point, TrackingFrame } from '@/utils/measurementTypes';

interface Props {
  frame: TrackingFrame | null;
  profile: CalibrationProfile;
  onChange: (updates: Partial<CalibrationProfile>) => void;
}
const DIRECTIONS = ['중앙', '왼쪽', '오른쪽', '위쪽', '아래쪽'];
export default function AngularCalibrationPanel({ frame, profile, onChange }: Props) {
  const frames = useRef<TrackingFrame[]>([]);
  const anchor = useRef<TrackingFrame | null>(null);
  const [samples, setSamples] = useState<AngularReference[]>([]);
  const [angles, setAngles] = useState({ right: { x: 0, y: 0 }, left: { x: 0, y: 0 } });
  const [message, setMessage] = useState('40cm에서 머리를 고정하고 실제 각도를 아는 중앙·좌·우·상·하 표적을 차례로 주시하세요.');
  useEffect(() => {
    if (!frame || !frame.eyes.right.valid || !frame.eyes.left.valid) { frames.current = []; return; }
    frames.current = [...frames.current.filter(f => frame.timestamp - f.timestamp < 1200), frame];
  }, [frame]);
  const record = () => {
    const buffer = frames.current;
    if (buffer.length < 5 || performance.now() - buffer[buffer.length - 1].timestamp > 300) {
      setMessage('같은 표적을 1초 이상 보면서 두 동공을 판독할 수 있어야 합니다.'); return;
    }
    const avg = (eye: 'right' | 'left'): Point => ({
      x: buffer.reduce((sum, f) => sum + f.eyes[eye].position!.x, 0) / buffer.length,
      y: buffer.reduce((sum, f) => sum + f.eyes[eye].position!.y, 0) / buffer.length,
    });
    const positions = { right: avg('right'), left: avg('left') };
    if (buffer.some(f => Math.abs(f.faceWidthPx / buffer[0].faceWidthPx - 1) > .03
      || Math.abs(f.pose.x - buffer[0].pose.x) > .02 || Math.abs(f.roll - buffer[0].roll) > .03
      || Math.hypot(f.eyes.right.position!.x - positions.right.x, f.eyes.right.position!.y - positions.right.y) > .02
      || Math.hypot(f.eyes.left.position!.x - positions.left.x, f.eyes.left.position!.y - positions.left.y) > .02)) {
      setMessage('머리 또는 시선 움직임이 있었습니다. 같은 표적을 다시 주시해주세요.'); return;
    }
    if (anchor.current && buffer.some(f => !sameScope(f.scope, anchor.current!.scope)
      || Math.abs(f.faceWidthPx / anchor.current!.faceWidthPx - 1) > .03
      || Math.hypot(f.pose.x - anchor.current!.pose.x, f.pose.y - anchor.current!.pose.y) > .02
      || Math.abs(f.roll - anchor.current!.roll) > .03)) {
      setMessage('표적을 바꾸는 동안 머리나 카메라가 움직였습니다. 보정을 다시 시작해주세요.'); return;
    }
    anchor.current ||= buffer[0];
    const next = [...samples, { positions, angles: { right: { ...angles.right }, left: { ...angles.left } } }];
    setSamples(next); frames.current = [];
    if (next.length === 5) {
      const fitted = fitAngularCalibration(next);
      if (fitted) { onChange({ angular: fitted, angularScope: buffer[buffer.length - 1].scope }); setMessage('두 눈의 수평·수직 각도 보정계수를 저장했습니다.'); }
      else setMessage('각도와 관측 위치가 충분히 일치하지 않습니다. 표적 위치와 입력 각도를 확인해주세요.');
    } else setMessage(`다음은 ${DIRECTIONS[next.length]} 표적입니다. 실제 각도를 입력하고 기록하세요.`);
  };
  return <details className="rounded-xl border border-slate-700 p-4">
    <summary className="cursor-pointer font-medium">처음 설정: 실제 표적각도 보정</summary>
    <p className="mt-3 text-sm text-slate-300">{message}</p>
    <p className="mt-2 text-xs text-slate-400">검사자용 설정입니다. 각 눈의 회전점에서 표적까지 잰 실제 각도를 입력하세요. 미러링 전 영상의 오른쪽·아래쪽을 +로 기록합니다. 사진의 픽셀당 mm 값으로 이 계수를 대신하지 않습니다.</p>
    <div className="mt-3 grid grid-cols-2 gap-3">
      {(['right', 'left'] as const).map(eye => <fieldset key={eye} className="rounded-lg bg-slate-900 p-3">
        <legend>{eye === 'right' ? '오른눈' : '왼눈'}</legend>
        {(['x', 'y'] as const).map(axis => <label key={axis} className="my-2 flex items-center justify-between gap-2 text-xs">
          {axis === 'x' ? '수평각(도)' : '수직각(도)'}
          <input type="number" min={-10} max={10} step={.1} className="w-20 rounded bg-slate-800 p-2" value={angles[eye][axis]}
            onChange={e => setAngles(a => ({ ...a, [eye]: { ...a[eye], [axis]: Number(e.target.value) } }))} />
        </label>)}
      </fieldset>)}
    </div>
    <div className="mt-3 flex flex-wrap gap-2">
      <button type="button" disabled={samples.length >= 5} className="glass-button rounded-lg px-3 py-2 disabled:opacity-40" onClick={record}>{DIRECTIONS[samples.length] || '완료'} 기록 ({samples.length}/5)</button>
      <button type="button" className="rounded-lg border border-slate-600 px-3 py-2" onClick={() => {
        setSamples([]); frames.current = []; anchor.current = null;
        onChange({ angular: { right: { horizontalDegPerUnit: null, verticalDegPerUnit: null }, left: { horizontalDegPerUnit: null, verticalDegPerUnit: null } }, angularScope: null });
      }}>다시 보정</button>
    </div>
    <p className="mt-2 text-xs text-slate-400">현재 계수: 오른눈 {profile.angular.right.horizontalDegPerUnit?.toFixed(2) ?? '—'} / {profile.angular.right.verticalDegPerUnit?.toFixed(2) ?? '—'}, 왼눈 {profile.angular.left.horizontalDegPerUnit?.toFixed(2) ?? '—'} / {profile.angular.left.verticalDegPerUnit?.toFixed(2) ?? '—'}</p>
  </details>;
}
