'use client';

import { useEffect, useState } from 'react';
import VideoAnalyzer from '@/components/VideoAnalyzer';
import AngularCalibrationPanel from '@/components/AngularCalibrationPanel';
import { STAGES, STAGE_TITLES, useBinocularLogic } from '@/hooks/useBinocularLogic';
import { createProfile, isPositive, landoltOuterDiameterMm } from '@/utils/calibration';
import type { CalibrationProfile, Measurement, ScreeningResults, Stage } from '@/utils/measurementTypes';

type Logic = ReturnType<typeof useBinocularLogic>;
const fieldClass = 'w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm';
const buttonClass = 'rounded-xl bg-cyan-400 px-5 py-3 font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-40';

function Setup({ logic }: { logic: Logic }) {
  const p = logic.session.profile;
  const [linePx, setLinePx] = useState(80);
  const update = logic.updateProfile;
  return <div className="space-y-4">
    <p className="text-sm text-slate-300">같은 사용자·카메라에서 쓸 기준을 처음 한 번 설정하세요. 휴대폰 렌즈와 각막 사이를 40cm로 맞춥니다.</p>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm">길이 보정 방식
        <select className={`${fieldClass} mt-1`} value={p.scaleMode} onChange={e => update({ scaleMode: e.target.value as CalibrationProfile['scaleMode'] })}>
          <option value="photo">개인 사진 기준 0.1304mm/픽셀</option><option value="known-ipd">알고 있는 실제 IPD로 영상 보정</option>
        </select>
      </label>
      <label className="text-sm">실제 원거리 IPD (mm)
        <input type="number" min={35} max={90} step={.1} className={`${fieldClass} mt-1`} value={p.knownIpdMm || ''}
          onChange={e => update({ knownIpdMm: Number(e.target.value) })} />
      </label>
    </div>
    {p.scaleMode === 'photo' ? <div className="rounded-xl bg-slate-900 p-3 text-sm">
      <p>iPhone 12 mini · 4032×3024 · 40cm에서 구한 개인 표본입니다.</p>
      <label className="mt-2 flex items-start gap-2 text-slate-300">
        <input type="checkbox" checked={p.photoFieldOfViewConfirmed} onChange={e => update({ photoFieldOfViewConfirmed: e.target.checked })} />
        같은 사용자·전면렌즈이며, 앱 영상과 기준 사진의 촬영 범위 및 잘림이 같음을 확인했습니다.
      </label>
      <p className="mt-2 text-xs text-slate-400">촬영 범위를 확인하기 어려우면 실제 IPD로 영상 보정을 선택하세요. 그 방식의 IPD 결과는 입력값에 근거한 보정 결과로 표시됩니다.</p>
    </div> : <p className="text-xs text-slate-400">원거리 IPD 단계에서 현재 영상의 동공 간격으로 배율을 맞춥니다. 입력한 IPD를 독립적으로 검증하는 측정은 아닙니다.</p>}
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm">먼 표적까지 실제 거리 (m)
        <input type="number" min={.5} step={.5} placeholder="예: 6" className={`${fieldClass} mt-1`} value={p.farTargetDistanceM ?? ''}
          onChange={e => update({ farTargetDistanceM: e.target.value ? Number(e.target.value) : null })} />
      </label>
      <label className="text-sm">검사 중 굴절교정
        <select className={`${fieldClass} mt-1`} value={p.correction} onChange={e => update({ correction: e.target.value as CalibrationProfile['correction'] })}>
          <option value="unknown">확인하지 않음</option><option value="distance-corrected">평소 원거리 안경 / 렌즈 착용</option><option value="uncorrected">교정하지 않음</option>
        </select>
      </label>
    </div>
    <details className="rounded-xl border border-slate-700 p-4">
      <summary className="cursor-pointer font-medium">처음 설정: 화면 시표 크기</summary>
      <p className="mt-3 text-sm text-slate-300">화면에 자를 대고 아래 선을 정확히 20mm로 맞춰주세요.</p>
      <div className="my-6 h-1 bg-white" style={{ width: linePx }} aria-label="20mm로 맞출 기준선" />
      <input aria-label="기준선 길이 조절" type="range" min={20} max={200} step={1} value={linePx} onChange={e => setLinePx(Number(e.target.value))} className="w-full" />
      <button type="button" className="glass-button mt-3 rounded-lg px-4 py-2" onClick={() => update({ displayPixelsPerMm: linePx / 20,
        displayScope: { screenWidth: window.screen.width, dpr: window.devicePixelRatio } })}>20mm 기준 저장</button>
      <p className="mt-2 text-xs text-slate-400">{p.displayPixelsPerMm ? '시표 크기 보정이 저장되었습니다.' : '단안 조절력 검사 전에 설정해주세요.'} 시표는 40cm에서 소수시력 0.66에 해당하는 크기로 고정됩니다.</p>
    </details>
    <AngularCalibrationPanel frame={logic.frame} profile={p} onChange={update} />
    <details className="rounded-xl border border-slate-700 p-4">
      <summary className="cursor-pointer font-medium">거리 기준 및 보정 정보</summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-xs">사진 mm/픽셀<input type="number" min={.0001} step={.0001} className={`${fieldClass} mt-1`} value={p.photoMmPerPixel} onChange={e => update({ photoMmPerPixel: Number(e.target.value) })} /></label>
        <label className="text-xs">홍채 평면에서 각막까지 (mm)<input type="number" step={.1} className={`${fieldClass} mt-1`} value={p.irisToCorneaMm} onChange={e => update({ irisToCorneaMm: Number(e.target.value) })} /></label>
        <label className="text-xs">카메라 거리→화면 거리 보정 (mm)<input type="number" step={.1} className={`${fieldClass} mt-1`} value={p.cameraToScreenMm} onChange={e => update({ cameraToScreenMm: Number(e.target.value) })} /></label>
        <label className="text-xs">각막→안구회전점 가정 (mm)<input type="number" min={0} max={20} step={.1} className={`${fieldClass} mt-1`} value={p.rotationCenterOffsetMm} onChange={e => update({ rotationCenterOffsetMm: Number(e.target.value) })} /></label>
      </div>
      <p className="mt-2 text-xs text-slate-400">거리 보정 0은 초기 근사값입니다. NPC는 안구회전점→렌즈, 조절력은 각막정점→화면을 사용합니다.</p>
      <p className="mt-2 text-xs text-slate-400">영상: {logic.frame ? `${logic.frame.scope.width}×${logic.frame.scope.height}` : '카메라 대기 중'}</p>
    </details>
    <div className="flex flex-wrap gap-3">
      <button className={buttonClass} onClick={logic.advance} disabled={!logic.frame?.facePresent
        || (p.scaleMode === 'photo' ? !p.photoFieldOfViewConfirmed : !isPositive(p.knownIpdMm))}>설정 완료 · 검사 시작</button>
      <button className="rounded-xl border border-slate-600 px-4 py-3 text-sm" onClick={() => update({ ...createProfile(), name: '새 사용자', scaleMode: 'known-ipd', knownIpdMm: 0 })}>새 사용자 설정</button>
    </div>
  </div>;
}

function LandoltTarget({ logic }: { logic: Logic }) {
  const [direction, setDirection] = useState(0);
  useEffect(() => {
    if (!logic.active) return;
    const timer = window.setInterval(() => setDirection(d => (d + 1 + Math.floor(Math.random() * 3)) % 4), 3000);
    return () => window.clearInterval(timer);
  }, [logic.active, logic.stage]);
  const p = logic.session.profile;
  const px = isPositive(p.displayPixelsPerMm) ? landoltOuterDiameterMm() * p.displayPixelsPerMm : null;
  return <button type="button" onClick={logic.tapUnreadable} disabled={!logic.active || !px}
    className="my-4 flex min-h-44 w-full flex-col items-center justify-center gap-8 rounded-2xl bg-white px-4 py-8 text-black"
    aria-label="틈 방향을 읽을 수 없으면 휴대폰을 멈춘 뒤 탭">
    {px ? <svg viewBox="0 0 10 10" width={px} height={px} style={{ transform: `rotate(${direction * 90}deg)` }} aria-hidden="true">
      <circle cx="5" cy="5" r="4" fill="none" stroke="black" strokeWidth="2" />
      <rect x="5" y="4" width="6" height="2" fill="white" />
    </svg> : <span className="text-sm">처음 설정에서 시표 크기를 맞춰주세요.</span>}
    <span className="text-sm">읽을 수 없으면 멈춘 뒤 여기를 탭</span>
  </button>;
}

const RESULT_LABELS: Record<keyof ScreeningResults, string> = {
  farIpd: '원거리 IPD', nearIpd: '40cm 주시 동공간거리',
  farHorizontal: '원거리 수평사위', farVertical: '원거리 수직사위',
  nearHorizontal: '근거리 수평사위', nearVertical: '근거리 수직사위',
  npc: '폭주근점', rightAccommodation: '오른눈 단안 조절력', leftAccommodation: '왼눈 단안 조절력', acA: 'AC/A',
};
function Metric({ label, measurement }: { label: string; measurement: Measurement }) {
  const value = measurement.value;
  const missingLabel = measurement.status === 'invalid' ? '재측정 필요' : measurement.status === 'censored' ? '종료점 미관측' : '미측정';
  const phoria = measurement.unit === 'Δ' && value !== null
    ? measurement.reference?.startsWith('내사위') ? value > 0 ? '내사위' : value < 0 ? '외사위' : '0'
      : value > 0 ? '오른눈 상사위' : value < 0 ? '오른눈 하사위' : '0'
    : '';
  return <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-4">
    <div className="flex items-start justify-between gap-3"><span className="text-sm text-slate-300">{label}</span>
      <strong className="font-mono text-cyan-300">{value === null ? missingLabel : `${phoria ? `${phoria} ` : ''}${(phoria ? Math.abs(value) : value).toFixed(1)} ${measurement.unit}`}</strong></div>
    <p className="mt-2 text-xs text-slate-400">{measurement.reason || measurement.reference || '영상에서 환산한 값'}</p>
  </div>;
}
function Results({ logic }: { logic: Logic }) {
  const download = () => {
    const report = { version: 2, exportedAt: new Date().toISOString(), results: logic.results,
      profile: logic.session.profile, session: logic.session };
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'bino-v2-screening.json'; a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <div className="space-y-4">
    <p className="text-sm text-slate-300">간단한 양안 기능 스크리닝 결과입니다. 보정과 검사 종료점을 얻은 항목에 값을 표시합니다.</p>
    <div className="grid gap-3 sm:grid-cols-2">
      {(Object.keys(RESULT_LABELS) as (keyof ScreeningResults)[]).map(key => <Metric key={key} label={RESULT_LABELS[key]} measurement={logic.results[key]} />)}
    </div>
    <details className="rounded-xl border border-slate-700 p-4"><summary>필요한 단계만 다시 측정</summary>
      <div className="mt-3 flex flex-wrap gap-2">{STAGES.filter(s => s !== 'setup' && s !== 'results').map(s => <button key={s} className="glass-button rounded-lg px-3 py-2 text-xs" onClick={() => logic.retry(s)}>{STAGE_TITLES[s]}</button>)}</div>
    </details>
    <button className={buttonClass} onClick={download}>결과 저장</button>
  </div>;
}

function MeasurementStep({ logic }: { logic: Logic }) {
  const aa = logic.stage === 'right-aa' || logic.stage === 'left-aa';
  const cover = logic.stage === 'far-cover' || logic.stage === 'near-cover';
  const completed = logic.session.completed.includes(logic.stage);
  const trials = logic.stage === 'far-cover' ? logic.session.farTrials : logic.session.nearTrials;
  return <div className="space-y-4">
    <p className="min-h-14 text-xl font-semibold leading-relaxed text-slate-100" role="status" aria-live="polite">{logic.message}</p>
    {cover && <p className="text-sm text-slate-300">먼저 좌우 눈을 한 번씩 가려 움직임을 확인합니다. 이어서 손으로 눈 전체를 가렸다 떼기를 좌우 번갈아 10회 합니다. 눈을 누르지 않고 머리와 휴대폰을 고정해주세요.</p>}
    {aa && <><p className="text-sm text-slate-300">40cm에서 틈 방향을 구분할 수 있는지 확인한 뒤 시작하세요. 검사하지 않는 눈은 손으로 계속 가립니다.</p><LandoltTarget logic={logic} /></>}
    {logic.distance?.corneaCm !== null && logic.distance?.corneaCm !== undefined && <p className="text-sm text-slate-400">각막 기준 추정 거리 {logic.distance.corneaCm.toFixed(1)}cm</p>}
    {logic.active && <div><div className="h-2 overflow-hidden rounded bg-slate-800"><div className="h-full bg-cyan-400 transition-[width]" style={{ width: `${logic.progress}%` }} /></div>
      {cover && <p className="mt-2 text-sm">유효 해제 관측 {trials.length}/10회</p>}</div>}
    <div className="flex flex-wrap gap-3">
      {!logic.active && <button className={buttonClass} onClick={logic.begin}>{completed ? '이 단계 다시 측정' : aa ? '40cm에서 구분됨 · 시작' : '삐 소리와 함께 시작'}</button>}
      {logic.active && <button className="rounded-xl border border-slate-600 px-5 py-3" onClick={() => logic.abort('중단했습니다. 40cm로 돌아와 다시 시작해주세요.')}>중단</button>}
      {completed && !logic.active && <button className={buttonClass} onClick={logic.advance}>다음</button>}
      {!logic.active && <button className="rounded-xl border border-slate-600 px-4 py-3 text-sm" onClick={() => { logic.skip(aa ? '40cm에서 시표를 구분하지 못했거나 사용자가 건너뛰었습니다.' : undefined); }}> {aa ? '40cm에서 구분 안 됨 / 건너뛰기' : '이 단계 건너뛰기'}</button>}
    </div>
    <details className="rounded-xl border border-slate-700 p-3 text-xs text-slate-400"><summary>측정 상태</summary>
      <p className="mt-2">오른눈: {logic.frame?.eyes.right.covered ? '가림' : logic.frame?.eyes.right.valid ? '동공 판독 가능' : '판독 대기'}, 왼눈: {logic.frame?.eyes.left.covered ? '가림' : logic.frame?.eyes.left.valid ? '동공 판독 가능' : '판독 대기'}</p>
      {logic.distance && <p className="mt-2">홍채 방식 {logic.distance.irisCm?.toFixed(1) ?? '—'}cm / IPD 비교 {logic.distance.ipdCm?.toFixed(1) ?? '—'}cm. 단안에서는 IPD 거리 비교를 사용하지 않습니다.</p>}
      {cover && <p className="mt-2">시선각도 보정계수가 없으면 이동 관측은 기록하고 사위량은 미측정으로 표시합니다.</p>}
    </details>
  </div>;
}

export default function Home() {
  const logic = useBinocularLogic();
  return <div className="mx-auto min-h-screen max-w-7xl space-y-4 p-3 font-sans sm:p-6">
    <header className="glass-panel flex flex-wrap items-center justify-between gap-3 rounded-2xl px-5 py-4">
      <div><h1 className="text-xl font-bold text-cyan-300">Bino Rehab <span className="text-sm text-slate-400">v2</span></h1><p className="mt-1 text-xs text-slate-400">짧은 안내로 측정하는 양안 기능 스크리닝</p></div>
      <button className="glass-button rounded-lg px-3 py-2 text-sm" onClick={logic.backToSetup}>처음 설정</button>
    </header>
    <nav aria-label="검사 진행 순서" className="flex gap-2 overflow-x-auto pb-1">
      {STAGES.map((s: Stage, index) => <span key={s} aria-current={logic.stage === s ? 'step' : undefined}
        className={`shrink-0 rounded-full px-3 py-1.5 text-xs ${logic.stage === s ? 'bg-cyan-400 text-slate-950' : logic.session.completed.includes(s) ? 'bg-emerald-950 text-emerald-300' : 'bg-slate-800 text-slate-400'}`}>{index + 1}. {STAGE_TITLES[s]}</span>)}
    </nav>
    <main className="grid items-start gap-4 lg:grid-cols-[1fr_1fr]">
      <div className="sticky top-3 h-[32vh] min-h-52 lg:h-[65vh]"><VideoAnalyzer onFrame={logic.processFrame} /></div>
      <section className="glass-panel rounded-2xl p-5"><h2 className="mb-4 text-lg font-semibold">{STAGE_TITLES[logic.stage]}</h2>
        {logic.stage === 'setup' ? <Setup logic={logic} /> : logic.stage === 'results' ? <Results logic={logic} /> : <MeasurementStep logic={logic} />}
      </section>
    </main>
  </div>;
}
