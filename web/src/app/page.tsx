'use client';

import { useEffect, useState } from 'react';
import VideoAnalyzer from '@/components/VideoAnalyzer';
import AngularCalibrationPanel from '@/components/AngularCalibrationPanel';
import { STAGES, STAGE_TITLES, useBinocularLogic } from '@/hooks/useBinocularLogic';
import { createProfile, isPositive, landoltOuterDiameterMm } from '@/utils/calibration';
import type { ScreeningResults } from '@/utils/measurementTypes';

type Logic = ReturnType<typeof useBinocularLogic>;
const primary = 'min-h-14 w-full touch-manipulation rounded-2xl bg-cyan-300 px-4 py-3 text-lg font-bold text-slate-950 disabled:opacity-40';
const secondary = 'min-h-12 touch-manipulation rounded-xl border border-slate-600 px-4 py-2 text-sm';
const input = 'min-h-12 w-full rounded-xl border border-slate-600 bg-slate-900 px-3 text-base';

function Setup({ logic }: { logic: Logic }) {
  const p = logic.session.profile;
  const [step, setStep] = useState(0);
  const [linePx, setLinePx] = useState(80);
  const update = logic.updateProfile;
  const scaleReady = p.scaleMode === 'photo' ? p.photoFieldOfViewConfirmed : isPositive(p.knownIpdMm);
  const displayReady = typeof window !== 'undefined' && isPositive(p.displayPixelsPerMm) && p.displayScope?.screenWidth === window.screen.width
    && p.displayScope?.dpr === window.devicePixelRatio;
  if (step === 0) return <div className="space-y-3">
    <h2 className="text-xl font-semibold">눈과 렌즈 사이를 40cm로 맞추세요.</h2>
    <p className="text-sm text-slate-300">카메라에 두 눈이 보이게 맞춰주세요.</p>
    <button className={primary} disabled={!logic.frame?.facePresent} onClick={() => {
      if (!scaleReady) setStep(1); else if (!displayReady) setStep(3); else logic.advance();
    }}>{logic.frame?.facePresent ? '검사 시작' : '카메라를 켜고 얼굴을 맞춰주세요'}</button>
    <button className={secondary} onClick={() => setStep(1)}>내 기준 확인</button>
  </div>;
  if (step === 1) return <div className="space-y-3">
    <h2 className="text-xl font-semibold">영상 크기 기준을 선택하세요.</h2>
    <select aria-label="영상 크기 기준" className={input} value={p.scaleMode} onChange={e => update({ scaleMode: e.target.value as 'photo' | 'known-ipd' })}>
      <option value="photo">내 기준 사진 사용</option><option value="known-ipd">알고 있는 동공간거리 사용</option>
    </select>
    {p.scaleMode === 'photo' ? <label className="flex min-h-12 items-center gap-3 text-sm">
      <input className="h-6 w-6" type="checkbox" checked={p.photoFieldOfViewConfirmed} onChange={e => update({ photoFieldOfViewConfirmed: e.target.checked })} />
      기준 사진과 같은 사람·카메라·촬영 범위입니다.
    </label> : <label className="block text-sm">동공간거리 (mm)<input aria-label="실제 동공간거리 mm" type="number" inputMode="decimal" className={`${input} mt-1`} value={p.knownIpdMm || ''} onChange={e => update({ knownIpdMm: Number(e.target.value) })} /></label>}
    <div className="flex gap-2"><button className={secondary} onClick={() => setStep(0)}>이전</button><button className={primary} disabled={!scaleReady} onClick={() => setStep(2)}>다음</button></div>
  </div>;
  if (step === 2) return <div className="space-y-3">
    <h2 className="text-xl font-semibold">평소 원거리 안경·렌즈를 착용했나요?</h2>
    <div className="grid grid-cols-2 gap-2">{(['distance-corrected', 'uncorrected'] as const).map((v, i) => <button key={v} className={`${secondary} ${p.correction === v ? 'border-cyan-300 bg-cyan-950' : ''}`} onClick={() => update({ correction: v })}>{i === 0 ? '네' : '아니요'}</button>)}</div>
    <label className="block text-sm">먼 표적까지 거리 (m)<input className={`${input} mt-1`} type="number" inputMode="decimal" placeholder="모르면 비워두세요" value={p.farTargetDistanceM ?? ''} onChange={e => update({ farTargetDistanceM: e.target.value ? Number(e.target.value) : null })} /></label>
    <div className="flex gap-2"><button className={secondary} onClick={() => setStep(1)}>이전</button><button className={primary} onClick={() => setStep(displayReady ? 0 : 3)}>다음</button></div>
  </div>;
  return <div className="space-y-3">
    <h2 className="text-xl font-semibold">자를 대고 선을 20mm로 맞추세요.</h2>
    <div className="flex min-h-12 items-center"><div className="h-1 bg-white" style={{ width: linePx }} /></div>
    <input aria-label="20mm 기준선 길이" type="range" min={20} max={200} value={linePx} onChange={e => setLinePx(Number(e.target.value))} className="h-12 w-full" />
    <button className={primary} onClick={() => {
      update({ displayPixelsPerMm: linePx / 20, displayScope: { screenWidth: window.screen.width, dpr: window.devicePixelRatio } }); setStep(0);
    }}>20mm 기준 저장</button>
    {displayReady && <button className={secondary} onClick={() => setStep(0)}>저장한 기준 사용</button>}
  </div>;
}

function LandoltTarget({ logic }: { logic: Logic }) {
  const [direction, setDirection] = useState(0);
  useEffect(() => {
    if (!logic.active) return;
    const timer = window.setInterval(() => setDirection(d => (d + 1 + Math.floor(Math.random() * 3)) % 4), 3000);
    return () => window.clearInterval(timer);
  }, [logic.active, logic.stage]);
  const scale = logic.session.profile.displayPixelsPerMm;
  const px = isPositive(scale) ? landoltOuterDiameterMm() * scale : null;
  return <button onClick={logic.tapUnreadable} disabled={!logic.active || !px} aria-label="시표를 읽을 수 없으면 멈추고 탭"
    className="pointer-events-auto absolute left-1/2 top-[max(5rem,15vh)] z-20 flex h-28 w-28 -translate-x-1/2 touch-manipulation items-center justify-center rounded-2xl bg-white text-black">
    {px ? <svg viewBox="0 0 10 10" width={px} height={px} style={{ transform: `rotate(${direction * 90}deg)` }} aria-hidden="true">
      <circle cx="5" cy="5" r="4" fill="none" stroke="black" strokeWidth="2" /><rect x="5" y="4" width="6" height="2" fill="white" />
    </svg> : <span className="text-xs">20mm 기준을 저장하세요.</span>}
  </button>;
}

const labels: Record<keyof ScreeningResults, string> = { farIpd: '원거리 동공간거리', nearIpd: '근거리 동공간거리', farHorizontal: '원거리 수평사위', farVertical: '원거리 수직사위', nearHorizontal: '근거리 수평사위', nearVertical: '근거리 수직사위', npc: '폭주근점', rightAccommodation: '오른눈 조절력', leftAccommodation: '왼눈 조절력', acA: 'AC/A' };
function Results({ logic }: { logic: Logic }) {
  const [index, setIndex] = useState(0);
  const keys = Object.keys(labels) as (keyof ScreeningResults)[];
  const key = keys[index], m = logic.results[key];
  const phoria = m.unit === 'Δ' && m.value !== null ? m.reference?.startsWith('내사위')
    ? m.value > 0 ? '내사위' : m.value < 0 ? '외사위' : ''
    : m.value > 0 ? '오른눈 상사위' : m.value < 0 ? '오른눈 하사위' : '' : '';
  const save = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ version: 2, exportedAt: new Date().toISOString(), results: logic.results, session: logic.session }, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'bino-v2-screening.json'; a.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <div className="space-y-3">
    <p className="text-sm text-slate-300">검사 결과 {index + 1} / {keys.length}</p><h2 className="text-xl font-semibold">{labels[key]}</h2>
    <p className="text-3xl font-bold text-cyan-300">{m.value === null ? m.status === 'invalid' ? '다시 측정해주세요' : '미측정' : `${phoria} ${(phoria ? Math.abs(m.value) : m.value).toFixed(1)} ${m.unit}`}</p>
    {m.value === null && <p className="text-sm text-slate-300">{key.includes('Horizontal') || key.includes('Vertical') || key === 'acA' ? '수치 산출에는 검사자의 각도 보정이 필요합니다.' : m.reason}</p>}
    <div className="grid grid-cols-2 gap-2"><button className={secondary} disabled={index === 0} onClick={() => setIndex(i => i - 1)}>이전 결과</button><button className={secondary} disabled={index === keys.length - 1} onClick={() => setIndex(i => i + 1)}>다음 결과</button></div>
    <button className={primary} onClick={save}>결과 저장</button>
  </div>;
}

function MeasurementStep({ logic }: { logic: Logic }) {
  const completed = logic.session.completed.includes(logic.stage);
  const cover = logic.stage.endsWith('cover');
  const aa = logic.stage.endsWith('aa');
  const trials = logic.stage === 'far-cover' ? logic.session.farTrials : logic.session.nearTrials;
  return <div className="space-y-3">
    <h2 className="text-xl font-semibold leading-snug" role="status" aria-live="polite">{logic.message}</h2>
    {cover && <p className="text-sm text-slate-300">{logic.active ? `${trials.length} / 10회` : '삐 소리를 듣고 손을 떼세요.'}</p>}
    {logic.distance?.corneaCm != null && <p className="text-sm text-slate-300">눈까지 약 {logic.distance.corneaCm.toFixed(1)}cm</p>}
    {logic.active && <div className="h-1.5 overflow-hidden rounded-full bg-slate-700"><div className="h-full bg-cyan-300" style={{ width: `${logic.progress}%` }} /></div>}
    {logic.active ? <><button className={aa ? primary : secondary} onClick={aa ? logic.tapUnreadable : () => logic.abort('40cm로 돌아와 다시 시작하세요.')}>{aa ? '안 보이면 멈추고 탭' : '잠깐 멈추기'}</button>
      {aa && <button className={secondary} onClick={() => logic.abort('40cm로 돌아와 다시 시작하세요.')}>잠깐 멈추기</button>}</>
      : <><button className={primary} onClick={completed ? logic.advance : logic.begin}>{completed ? '다음 검사' : aa ? '틈이 보이면 시작' : '시작'}</button>
        <div className="flex justify-between gap-2"><button className={secondary} onClick={() => { if (completed) logic.begin(); else { logic.skip(); logic.advance(); } }}>{completed ? '다시 측정' : '건너뛰기'}</button></div></>}
  </div>;
}

function InspectorSettings({ logic, onClose }: { logic: Logic; onClose: () => void }) {
  const [tab, setTab] = useState<'menu' | 'angular' | 'distance'>('menu');
  const p = logic.session.profile;
  if (tab === 'angular') return <div className="space-y-3"><button className={secondary} onClick={() => setTab('menu')}>설정 목록</button><AngularCalibrationPanel frame={logic.frame} profile={p} onChange={logic.updateProfile} /></div>;
  if (tab === 'distance') return <div className="space-y-3"><button className={secondary} onClick={() => setTab('menu')}>설정 목록</button><h2 className="text-lg font-semibold">검사자 거리 설정</h2>
    {([['photoMmPerPixel', '사진 mm/픽셀'], ['irisToCorneaMm', '홍채→각막 mm'], ['cameraToScreenMm', '렌즈→화면 mm'], ['rotationCenterOffsetMm', '각막→회전점 mm']] as const).map(([key, label]) => <label key={key} className="block text-sm">{label}<input className={input} type="number" inputMode="decimal" step="any" value={p[key]} onChange={e => logic.updateProfile({ [key]: Number(e.target.value) })} /></label>)}</div>;
  return <div className="space-y-3"><h2 className="text-xl font-semibold">설정</h2><p className="text-sm text-slate-300">일반 검사는 각도 보정 없이 진행할 수 있습니다.</p>
    <button className={`${secondary} w-full`} onClick={() => { logic.backToSetup(); onClose(); }}>처음 설정으로</button>
    <button className={`${secondary} w-full`} onClick={() => setTab('angular')}>검사자용 · 사위 각도 보정</button>
    <button className={`${secondary} w-full`} onClick={() => setTab('distance')}>검사자용 · 거리 설정</button>
    <button className={`${secondary} w-full`} onClick={() => { logic.updateProfile({ ...createProfile(), name: '새 사용자', scaleMode: 'known-ipd', knownIpdMm: 0 }); logic.backToSetup(); onClose(); }}>새 사용자</button>
  </div>;
}

export default function Home() {
  const logic = useBinocularLogic();
  const [settings, setSettings] = useState(false);
  const aa = logic.stage.endsWith('aa');
  const stageNumber = STAGES.indexOf(logic.stage);
  return <main className="fixed inset-0 isolate h-dvh overflow-hidden bg-black font-sans text-slate-100">
    <div className="absolute inset-0"><VideoAnalyzer onFrame={logic.processFrame} compact /></div>
    {aa && !settings && <><LandoltTarget logic={logic} />{logic.active && <button aria-label="안 보이면 화면을 탭" className="absolute inset-0 z-10 touch-manipulation" onClick={logic.tapUnreadable} />}</>}
    <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-center justify-between gap-3 bg-gradient-to-b from-black/90 to-transparent px-4 pb-6 pt-[max(0.75rem,env(safe-area-inset-top))]">
      <div><h1 className="text-sm font-semibold text-cyan-300">Bino Rehab v2</h1><p className="text-sm">{logic.stage === 'setup' ? '검사 준비' : `${stageNumber} / 8 · ${STAGE_TITLES[logic.stage]}`}</p></div>
      <button className={`${secondary} pointer-events-auto bg-slate-950/80`} onClick={() => { if (!settings) logic.backToSetup(); setSettings(v => !v); }}>{settings ? '닫기' : '설정'}</button>
    </header>
    <section aria-label={settings ? '검사자 설정' : STAGE_TITLES[logic.stage]} className="absolute inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 mx-auto max-w-lg rounded-3xl border border-slate-600/60 bg-slate-950/95 p-4 shadow-2xl sm:p-5">
      {settings ? <InspectorSettings logic={logic} onClose={() => setSettings(false)} /> : logic.stage === 'setup' ? <Setup logic={logic} /> : logic.stage === 'results' ? <Results logic={logic} /> : <MeasurementStep logic={logic} />}
    </section>
  </main>;
}
