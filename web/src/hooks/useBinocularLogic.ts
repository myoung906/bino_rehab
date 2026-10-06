'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { bindProfile, createProfile, estimateDistance, isPositive, sameScope } from '@/utils/calibration';
import { angleToPrismDiopter, computeScreeningMetrics } from '@/utils/clinicalCalculations';
import type { Baseline, CalibrationProfile, CoverTrial, DistanceEstimate, Endpoint, Eye, Point, ScreeningSession, Stage, TrackingFrame } from '@/utils/measurementTypes';

export const STAGES: Stage[] = ['setup', 'far-ipd', 'far-cover', 'near-ipd', 'near-cover', 'npc', 'right-aa', 'left-aa', 'results'];
export const STAGE_TITLES: Record<Stage, string> = {
  setup: '처음 설정', 'far-ipd': '원거리 동공간거리', 'far-cover': '원거리 차폐검사',
  'near-ipd': '40cm 동공간거리', 'near-cover': '40cm 차폐검사', npc: '폭주근점',
  'right-aa': '오른눈 조절력', 'left-aa': '왼눈 조절력', results: '결과',
};
const EYES: Eye[] = ['right', 'left'];
const OTHER = (eye: Eye): Eye => eye === 'right' ? 'left' : 'right';
const eyeName = (eye: Eye) => eye === 'right' ? '오른눈' : '왼눈';
const median = (values: number[]): number => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const pointDistance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const newSession = (profile: CalibrationProfile): ScreeningSession => ({
  profile, far: null, near: null, farTrials: [], nearTrials: [], npc: null,
  accommodation: {}, completed: [], notes: {}, manifestMovement: {}, outcomes: {},
});
interface CoverCapture { eye: Eye; at: number; start: Point; last: Point; stableSince: number; frame: TrackingFrame }
interface MovementSample { at: number; distance: DistanceEstimate; right: Point; left: Point }
interface Runtime {
  started: number; goodSince: number; baselineFrames: TrackingFrame[];
  expected: Eye; phase: 'cover' | 'uncover' | 'settle'; coveredAt: number;
  pending: CoverCapture | null; coverCount: number; preliminary: number;
  releaseCued: boolean;
  visibleBeforeCover: Point | null; preliminaryMove: boolean;
  motion: MovementSample[]; candidate: Endpoint | null;
  aaFrames: { at: number; distance: DistanceEstimate }[];
}
const newRuntime = (): Runtime => ({
  started: performance.now(), goodSince: 0, baselineFrames: [], expected: 'right', phase: 'cover',
  coveredAt: 0, pending: null, coverCount: 0, preliminary: 0, releaseCued: false,
  visibleBeforeCover: null, preliminaryMove: false, motion: [], candidate: null, aaFrames: [],
});

export function useBinocularLogic() {
  const initial = useRef(newSession(createProfile()));
  const sessionRef = useRef(initial.current);
  const [session, setSession] = useState(initial.current);
  const [stage, setStage] = useState<Stage>('setup');
  const stageRef = useRef<Stage>('setup');
  const [active, setActive] = useState(false);
  const activeRef = useRef(false);
  const runtime = useRef<Runtime | null>(null);
  const latest = useRef<TrackingFrame | null>(null);
  const [frame, setFrame] = useState<TrackingFrame | null>(null);
  const [distance, setDistance] = useState<DistanceEstimate | null>(null);
  const [message, setMessage] = useState('카메라를 켜고 40cm 기준을 설정해주세요.');
  const [progress, setProgress] = useState(0);
  const audio = useRef<AudioContext | null>(null);
  const uiUpdatedAt = useRef(0);

  const sync = useCallback(() => setSession({ ...sessionRef.current }), []);
  const beep = useCallback(() => {
    const ctx = audio.current;
    if (!ctx || ctx.state !== 'running') return;
    const oscillator = ctx.createOscillator(), gain = ctx.createGain();
    oscillator.frequency.value = 880; gain.gain.value = .08;
    oscillator.connect(gain); gain.connect(ctx.destination);
    oscillator.start(); oscillator.stop(ctx.currentTime + .12);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }, []);
  const finish = useCallback((note?: string, outcome: 'measured' | 'unavailable' | 'censored' = 'measured') => {
    const current = sessionRef.current, s = stageRef.current;
    if (!current.completed.includes(s)) current.completed = [...current.completed, s];
    if (note) current.notes = { ...current.notes, [s]: note };
    current.outcomes = { ...current.outcomes, [s]: outcome };
    activeRef.current = false; setActive(false); setProgress(100); sync(); beep();
    setMessage(note || '이 측정이 끝났습니다. 다음으로 진행해주세요.');
  }, [beep, sync]);
  const abort = useCallback((reason: string) => {
    if (activeRef.current) {
      sessionRef.current.notes = { ...sessionRef.current.notes, [stageRef.current]: reason };
      sessionRef.current.outcomes = { ...sessionRef.current.outcomes, [stageRef.current]: 'invalid' };
      sync();
    }
    activeRef.current = false; setActive(false); runtime.current = null;
    setMessage(reason); setProgress(0);
  }, [sync]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('bino-v2-calibration');
      if (!saved) return;
      const parsed = JSON.parse(saved) as CalibrationProfile;
      if (parsed.version !== 2 || !isPositive(parsed.photoMmPerPixel) || !parsed.angular?.left || !parsed.angular?.right) return;
      // 얼굴 관측값과 세션 거리 기준은 영구 저장하지 않는다.
      sessionRef.current = newSession({ ...createProfile(), ...parsed, scope: null, streamMmPerPixelAt40: null }); sync();
    } catch { /* 저장을 사용할 수 없는 환경에서도 초기 설정을 이용한다. */ }
  }, [sync]);
  useEffect(() => () => { void audio.current?.close().catch(() => {}); }, []);

  const updateProfile = useCallback((updates: Partial<CalibrationProfile>) => {
    if (activeRef.current) return;
    const profile = { ...sessionRef.current.profile, ...updates, scope: null, streamMmPerPixelAt40: null };
    sessionRef.current = newSession(profile); sync();
    try { localStorage.setItem('bino-v2-calibration', JSON.stringify(profile)); } catch { /* 로컬 저장 실패는 측정 진행을 막지 않는다. */ }
  }, [sync]);

  const begin = useCallback(() => {
    const s = stageRef.current, current = sessionRef.current, data = latest.current;
    if (s === 'setup' || s === 'results') return;
    if (!data || performance.now() - data.timestamp > 250 || !data.facePresent) {
      setMessage('얼굴과 동공이 보이는지 확인해주세요.'); return;
    }
    if (s !== 'far-ipd' && (!current.profile.scope || !sameScope(current.profile.scope, data.scope))) {
      setMessage('먼저 원거리 IPD 단계에서 카메라를 보정해주세요.'); return;
    }
    if ((s === 'far-cover' || s === 'near-cover') && !data.handTrackingReady) {
      setMessage('손 차폐 추적 준비가 끝난 뒤 시작해주세요.'); return;
    }
    if ((s === 'npc' || s === 'right-aa' || s === 'left-aa') && !current.near) {
      setMessage('먼저 40cm 근거리 IPD를 측정해주세요.'); return;
    }
    if (s === 'right-aa' || s === 'left-aa') {
      const eye: Eye = s === 'right-aa' ? 'right' : 'left';
      if (!isPositive(current.profile.displayPixelsPerMm) || !current.profile.displayScope
        || current.profile.displayScope.dpr !== window.devicePixelRatio || current.profile.displayScope.screenWidth !== window.screen.width) {
        setMessage('처음 설정에서 화면의 20mm 선을 맞춰주세요.'); return;
      }
      if (!data.handTrackingReady || !data.eyes[eye].valid || !data.eyes[OTHER(eye)].covered) {
        setMessage(`${eyeName(OTHER(eye))}을 손으로 완전히 가려주세요.`); return;
      }
      const d = estimateDistance(data, current.near!, current.profile, eye);
      if (!isPositive(d.corneaCm) || Math.abs(d.corneaCm - 40) > 3) { setMessage('휴대폰을 40cm로 다시 맞춰주세요.'); return; }
    }
    if (s === 'far-ipd') sessionRef.current = newSession(current.profile);
    if (s === 'near-ipd') {
      current.near = null; current.nearTrials = []; current.npc = null; current.accommodation = {};
      current.completed = current.completed.filter(x => ['far-ipd', 'far-cover'].includes(x));
      for (const child of ['near-ipd', 'near-cover', 'npc', 'right-aa', 'left-aa'] as Stage[]) {
        delete current.notes[child]; delete current.outcomes[child];
      }
      current.manifestMovement['near-cover'] = false;
    }
    if (s === 'far-cover' || s === 'near-cover') {
      current[s === 'far-cover' ? 'farTrials' : 'nearTrials'] = [];
      current.manifestMovement[s] = false;
    }
    if (s === 'npc') current.npc = null;
    if (s === 'right-aa' || s === 'left-aa') delete current.accommodation[s === 'right-aa' ? 'right' : 'left'];
    delete sessionRef.current.notes[s];
    delete sessionRef.current.outcomes[s];
    sessionRef.current.completed = sessionRef.current.completed.filter(x => x !== s);
    runtime.current = newRuntime(); activeRef.current = true; setActive(true); setProgress(0); sync();
    try {
      audio.current ||= new AudioContext();
      void audio.current.resume().then(beep).catch(() => {});
    } catch { /* 소리를 사용할 수 없는 브라우저에서도 화면 안내를 유지한다. */ }
    setMessage(s.endsWith('ipd') ? '움직이지 말고 같은 표적을 5초간 보세요.'
      : s.endsWith('cover') ? `${s === 'far-cover' ? '먼 표적을' : '렌즈를'} 보면서 오른눈을 손으로 2초간 가린 뒤 손을 떼세요.`
      : s === 'npc' ? '렌즈를 계속 보며 휴대폰을 천천히 가까이 가져오세요.'
      : '틈의 방향이 구분되지 않을 때 멈춘 뒤 화면을 탭하세요.');
  }, [beep, sync]);

  const advance = useCallback(() => {
    if (activeRef.current) return;
    const s = stageRef.current;
    if (s !== 'setup' && !sessionRef.current.completed.includes(s)) return;
    const next = STAGES[Math.min(STAGES.indexOf(s) + 1, STAGES.length - 1)];
    stageRef.current = next; setStage(next); setProgress(0); setDistance(null);
    setMessage(next === 'far-ipd' ? '40cm에서 휴대폰 너머 먼 곳을 보세요.'
      : next === 'far-cover' ? '먼 곳을 보며 시작 버튼을 누르세요.'
      : next === 'near-ipd' || next === 'near-cover' ? '40cm에서 카메라 렌즈를 보세요.'
      : next === 'right-aa' ? '40cm로 돌아와 왼눈을 가리세요.'
      : next === 'left-aa' ? '40cm로 돌아와 오른눈을 가리세요.'
      : next === 'npc' ? '휴대폰을 40cm로 되돌리고 렌즈를 보세요.'
      : '안내를 확인한 뒤 시작해주세요.');
  }, []);
  const skip = useCallback((reason = '사용자가 이 단계를 건너뛰었습니다.') => {
    const current = sessionRef.current, s = stageRef.current;
    if (s === 'far-ipd') sessionRef.current = newSession(current.profile);
    if (s === 'near-ipd') { current.near = null; current.nearTrials = []; current.npc = null; current.accommodation = {}; }
    if (s === 'far-cover' || s === 'near-cover') {
      current[s === 'far-cover' ? 'farTrials' : 'nearTrials'] = []; current.manifestMovement[s] = false;
    }
    if (s === 'npc') current.npc = null;
    if (s === 'right-aa' || s === 'left-aa') delete current.accommodation[s === 'right-aa' ? 'right' : 'left'];
    activeRef.current = false; setActive(false); finish(reason, 'unavailable');
  }, [finish]);
  const backToSetup = useCallback(() => {
    abort('처음 설정을 확인해주세요.'); stageRef.current = 'setup'; setStage('setup');
  }, [abort]);
  const retry = useCallback((s: Stage) => {
    abort('40cm로 돌아와 이 단계를 다시 시작해주세요.'); stageRef.current = s; setStage(s);
  }, [abort]);

  const processFrame = useCallback((data: TrackingFrame) => {
    latest.current = data;
    const current = sessionRef.current, s = stageRef.current, rt = runtime.current;
    const now = data.timestamp;
    if (now - uiUpdatedAt.current > 150) {
      uiUpdatedAt.current = now; setFrame(data);
      if (current.near && current.profile.scope && sameScope(current.profile.scope, data.scope)) {
        const onlyEye = s === 'right-aa' ? 'right' : s === 'left-aa' ? 'left' : undefined;
        setDistance(estimateDistance(data, current.near, current.profile, onlyEye));
      }
    }
    if (!activeRef.current || !rt) return;
    if (s !== 'far-ipd' && current.profile.scope && !sameScope(current.profile.scope, data.scope)) {
      abort('카메라나 해상도가 바뀌었습니다. 처음 설정과 원거리 측정을 다시 해주세요.'); return;
    }
    if (now - rt.started > 60000) { finish('시간 안에 유효한 종료점을 얻지 못했습니다. 이 단계만 다시 측정할 수 있습니다.', 'censored'); return; }
    if (!data.facePresent) {
      rt.goodSince = 0; rt.baselineFrames = []; rt.motion = []; rt.candidate = null; rt.aaFrames = [];
      rt.pending = null; rt.phase = 'cover'; rt.visibleBeforeCover = null; rt.preliminaryMove = false;
      setMessage('추적이 끊겼습니다. 얼굴과 눈을 정면으로 맞춰주세요.'); return;
    }

    if (s === 'far-ipd' || s === 'near-ipd') {
      if (!EYES.every(e => data.eyes[e].valid)) {
        rt.goodSince = 0; rt.baselineFrames = []; setProgress(0);
        setMessage('동공 윤곽이 보이도록 밝고 고른 조명에서 눈을 열어주세요.'); return;
      }
      if (!rt.goodSince) rt.goodSince = now;
      const first = rt.baselineFrames[0];
      if (first && (!sameScope(first.scope, data.scope) || Math.abs(data.faceWidthPx / first.faceWidthPx - 1) > .04
        || pointDistance(first.pose, data.pose) > .03 || Math.abs(first.roll - data.roll) > .04)) {
        rt.goodSince = now; rt.baselineFrames = []; setProgress(0); setMessage('움직임이 있었습니다. 다시 같은 표적을 보세요.');
      }
      rt.baselineFrames.push(data);
      if (now - uiUpdatedAt.current < 40) setProgress(Math.min(100, (now - rt.goodSince) / 50));
      if (now - rt.goodSince < 5000 || rt.baselineFrames.length < 30) return;
      const frames = rt.baselineFrames;
      const baseline: Baseline = {
        ipdPx: median(frames.map(f => pointDistance(f.eyes.right.pupil!, f.eyes.left.pupil!))),
        irisDiameterPx: { right: median(frames.map(f => f.eyes.right.irisDiameterPx)), left: median(frames.map(f => f.eyes.left.irisDiameterPx)) },
        faceWidthPx: median(frames.map(f => f.faceWidthPx)), scope: data.scope,
        pose: data.pose, roll: data.roll,
      };
      if (s === 'far-ipd') {
        const profile = bindProfile(current.profile, baseline);
        if (!profile) { abort('사진과 영상의 같은 촬영 범위 확인이 필요합니다. 또는 실제 IPD 기준 보정 방식을 선택해주세요.'); return; }
        current.profile = profile; current.far = baseline;
      } else current.near = baseline;
      finish(); return;
    }

    const baseline = s === 'far-cover' ? current.far : current.near;
    if (!baseline) { abort('먼저 해당 거리의 IPD를 측정해주세요.'); return; }
    const poseStable = pointDistance(data.pose, baseline.pose) < .045 && Math.abs(data.roll - baseline.roll) < .07;
    if (!poseStable) {
      rt.motion = []; rt.candidate = null; rt.aaFrames = [];
      if (rt.pending) { rt.pending = null; rt.phase = 'cover'; }
      setMessage('머리를 정면으로 유지해주세요.'); return;
    }

    if (s === 'far-cover' || s === 'near-cover') {
      if (Math.abs(data.faceWidthPx / baseline.faceWidthPx - 1) > .05) {
        rt.pending = null; rt.phase = 'cover'; setMessage('휴대폰과 머리를 움직이지 말아주세요.'); return;
      }
      const eye = rt.expected, observed = data.eyes[eye], other = data.eyes[OTHER(eye)];
      if (!data.handTrackingReady || (observed.covered && other.covered)) return;
      if (rt.phase === 'cover') {
        if (!observed.covered && other.position) rt.visibleBeforeCover = other.position;
        if (observed.covered) { rt.coveredAt = now; rt.phase = 'uncover'; rt.releaseCued = false; }
        return;
      }
      if (rt.phase === 'uncover') {
        if (observed.covered) {
          if (rt.preliminary < 2 && rt.visibleBeforeCover && other.valid && other.position
            && pointDistance(rt.visibleBeforeCover, other.position) > .025) rt.preliminaryMove = true;
          if (now - rt.coveredAt > 2000 && !rt.releaseCued) {
            rt.releaseCued = true; beep(); setMessage(`${eyeName(eye)}을 가린 손을 떼고 같은 표적을 보세요.`);
          }
          return;
        }
        if (now - rt.coveredAt < 1000) { rt.phase = 'cover'; setMessage(`${eyeName(eye)}을 2초 정도 가려주세요.`); return; }
        if (!observed.valid || !observed.position) { rt.phase = 'cover'; setMessage('해제 직후 동공을 판독하지 못했습니다. 같은 눈을 다시 가려주세요.'); return; }
        rt.pending = { eye, at: now, start: observed.position, last: observed.position, stableSince: now, frame: data };
        rt.phase = 'settle'; return;
      }
      const pending = rt.pending;
      if (!pending || !observed.valid || !observed.position || observed.covered || now - pending.at > 3000) {
        rt.pending = null; rt.phase = 'cover'; return;
      }
      if (pointDistance(pending.last, observed.position) > .006) pending.stableSince = now;
      pending.last = observed.position;
      if (now - pending.at < 350 || now - pending.stableSince < 200) return;
      if (rt.preliminary < 2) {
        current.manifestMovement[s] ||= rt.preliminaryMove;
        rt.preliminary++; rt.preliminaryMove = false;
      } else {
        const dx = observed.position.x - pending.start.x, dy = observed.position.y - pending.start.y;
        const angleScopeValid = current.profile.angularScope && sameScope(current.profile.angularScope, data.scope);
        const angular = angleScopeValid ? current.profile.angular[eye] : { horizontalDegPerUnit: null, verticalDegPerUnit: null };
        const scale = current.profile.streamMmPerPixelAt40;
        const gainX = angular.horizontalDegPerUnit, gainY = angular.verticalDegPerUnit;
        const trial: CoverTrial = {
          eye, uncoveredAt: pending.at, settledAt: now, start: pending.start, end: observed.position,
          horizontalDelta: gainX !== null && Number.isFinite(gainX) && gainX !== 0 ? angleToPrismDiopter(dx * gainX) * (eye === 'right' ? -1 : 1) : null,
          verticalRightRelativeDelta: gainY !== null && Number.isFinite(gainY) && gainY !== 0 ? angleToPrismDiopter(dy * gainY) * (eye === 'right' ? 1 : -1) : null,
          horizontalMovementMm: isPositive(scale) ? dx * observed.eyeWidthPx * scale : null,
          verticalMovementMm: isPositive(scale) ? dy * observed.eyeWidthPx * scale : null,
        };
        const key = s === 'far-cover' ? 'farTrials' : 'nearTrials';
        current[key] = [...current[key], trial]; rt.coverCount++; sync();
      }
      rt.pending = null; rt.phase = 'cover'; rt.expected = OTHER(eye); beep();
      setProgress(rt.coverCount * 10);
      setMessage(`${eyeName(rt.expected)}을 가리고 삐 소리를 기다리세요.`);
      if (rt.coverCount === 10) finish();
      return;
    }

    if (s === 'npc') {
      if (!EYES.every(e => data.eyes[e].valid && data.eyes[e].position)) { rt.motion = []; rt.candidate = null; return; }
      const d = estimateDistance(data, baseline, current.profile);
      if (!isPositive(d.corneaCm)) { rt.motion = []; rt.candidate = null; return; }
      const sample: MovementSample = { at: now, distance: d, right: data.eyes.right.position!, left: data.eyes.left.position! };
      rt.motion = [...rt.motion.filter(v => now - v.at < 800), sample];
      const older = rt.motion.find(v => now - v.at >= 200 && now - v.at < 400);
      if (!older || !isPositive(older.distance.corneaCm)) return;
      const dt = (now - older.at) / 1000, approach = (older.distance.corneaCm - d.corneaCm) / dt;
      const inwardR = (sample.right.x - older.right.x) / dt;
      const inwardL = -(sample.left.x - older.left.x) / dt;
      const outward = inwardR < -.035 || inwardL < -.035;
      const stopped = (Math.abs(inwardR) < .008 && inwardL > .035) || (Math.abs(inwardL) < .008 && inwardR > .035);
      if (approach > .3 && (outward || stopped)) {
        // 지속 확인 후에도 첫 후보 시점과 거리를 유지한다.
        rt.candidate ||= { at: now, distance: d, source: 'objective-eye-deviation', eye: inwardR < inwardL ? 'right' : 'left' };
        if (now - rt.candidate.at >= 250) { current.npc = rt.candidate; finish('눈 이탈 후보를 기록했습니다. 휴대폰을 멈추고 다음 단계에서 40cm로 돌아오세요.'); }
      } else rt.candidate = null;
      return;
    }

    if (s === 'right-aa' || s === 'left-aa') {
      const eye: Eye = s === 'right-aa' ? 'right' : 'left';
      if (!data.eyes[eye].valid || !data.eyes[OTHER(eye)].covered) { rt.aaFrames = []; setMessage('검사하지 않는 눈을 계속 가려주세요.'); return; }
      const d = estimateDistance(data, baseline, current.profile, eye);
      if (isPositive(d.corneaCm)) rt.aaFrames = [...rt.aaFrames.filter(v => now - v.at < 800), { at: now, distance: d }];
      else rt.aaFrames = [];
    }
  }, [abort, beep, finish, sync]);

  const tapUnreadable = useCallback(() => {
    const s = stageRef.current, rt = runtime.current, current = sessionRef.current, data = latest.current;
    if (!activeRef.current || !rt || !data || (s !== 'right-aa' && s !== 'left-aa')) return;
    const now = performance.now(), eye: Eye = s === 'right-aa' ? 'right' : 'left';
    if (now - data.timestamp > 150 || !data.eyes[eye].valid || !data.eyes[OTHER(eye)].covered) {
      setMessage('최근 동공 추적을 확인한 뒤 다시 탭해주세요.'); return;
    }
    const recent = rt.aaFrames.filter(v => now - v.at < 500);
    if (recent.length < 3 || recent[recent.length - 1].at - recent[0].at < 200) {
      setMessage('휴대폰을 멈춘 뒤 다시 탭해주세요.'); return;
    }
    const distances = recent.map(v => v.distance.corneaCm).filter(isPositive);
    if (distances.length !== recent.length || Math.max(...distances) - Math.min(...distances) > .3) {
      setMessage('휴대폰을 멈춘 뒤 다시 탭해주세요.'); return;
    }
    current.accommodation = { ...current.accommodation, [eye]: {
      at: now, distance: { ...recent[recent.length - 1].distance, corneaCm: median(distances) },
      source: 'unreadable-tap', eye,
    } };
    finish();
  }, [finish]);

  // 새 프레임이 도착하지 않는 카메라 정지·백그라운드 전환을 별도로 다룬다.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (activeRef.current && latest.current && performance.now() - latest.current.timestamp > 1000) {
        abort('카메라 영상이 멈췄습니다. 이 단계를 다시 시작해주세요.');
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, [abort]);
  useEffect(() => {
    const visibility = () => { if (document.hidden && activeRef.current) abort('검사가 중단되었습니다. 화면으로 돌아와 다시 시작해주세요.'); };
    document.addEventListener('visibilitychange', visibility);
    return () => document.removeEventListener('visibilitychange', visibility);
  }, [abort]);

  return { session, results: computeScreeningMetrics(session), stage, active, message, progress, frame, distance,
    processFrame, updateProfile, begin, advance, skip, abort, backToSetup, retry, tapUnreadable };
}
