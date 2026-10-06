import type { ClinicalMetrics } from '@/hooks/useAnalysisStore';
import { isPositive } from './calibration';
import type { CoverTrial, Measurement, ScreeningResults, ScreeningSession } from './measurementTypes';

// 구형 녹화의 타입 호환만 유지한다. 자유 녹화에서 임상 수치를 추측하지 않는다.
export interface AnalysisSample {
  t: number; pdMm: number; velocityMmS: number; symmetry: number; leftX: number; rightX: number;
  pupilProxy?: number; pixelToMm?: number; distanceCm?: number;
}
const round = (n: number): number => Math.round(n * 10) / 10;
export const angleToPrismDiopter = (degree: number): number => 100 * Math.tan(degree * Math.PI / 180);

/** 표적 평면의 길이/거리 계산. 동공 이동에서 회전각을 직접 구하는 식과 구분한다. */
export const mmToPrismDiopter = (targetPlaneMm: number, viewingDistanceCm = 50): number =>
  isPositive(viewingDistanceCm) && Number.isFinite(targetPlaneMm)
    ? round(angleToPrismDiopter(Math.atan(targetPlaneMm / (viewingDistanceCm * 10)) * 180 / Math.PI))
    : NaN;
/** 근거리 IPD를 추측하는 구형 함수를 호출해도 원거리 IPD를 변조하지 않는다. */
export const adjustIPDByDistance = (ipdMm: number, viewingDistanceCm: number): number => {
  void viewingDistanceCm;
  return ipdMm;
};

export function ipdFromPixels(gapPx: number, mmPerPixel: number, corneaDistanceMm = 400): number | null {
  if (![gapPx, mmPerPixel, corneaDistanceMm].every(isPositive)) return null;
  const focalPx = corneaDistanceMm / mmPerPixel;
  const halfAngle = Math.atan(gapPx / 2 / focalPx);
  return 2 * corneaDistanceMm * Math.tan(halfAngle);
}
export function calculateAcA(ipdMm: number, farEsoPositive: number, nearEsoPositive: number, nearDistanceCm = 40): number | null {
  if (!isPositive(ipdMm) || !isPositive(nearDistanceCm) || ![farEsoPositive, nearEsoPositive].every(Number.isFinite)) return null;
  return ipdMm / 10 + (nearEsoPositive - farEsoPositive) / (100 / nearDistanceCm);
}
const absent = (unit: Measurement['unit'], method: string, reason: string): Measurement =>
  ({ value: null, unit, status: 'unavailable', method, reason });
const result = (value: number, unit: Measurement['unit'], method: string, reference?: string): Measurement =>
  Number.isFinite(value) ? ({ value: round(value), unit, status: 'derived', method, reference })
    : { ...absent(unit, method, '유효한 보정값을 확인해주세요.'), status: 'invalid' };
function coverResult(trials: CoverTrial[], axis: 'horizontalDelta' | 'verticalRightRelativeDelta', note?: string, manifestMovement?: boolean): Measurement {
  if (manifestMovement) return absent('Δ', 'calibrated-alternate-cover', '첫 단순차폐에서 반대 눈의 이동이 관찰되어 사위량 해석을 보류합니다.');
  const valid = trials.filter(t => t[axis] !== null && Number.isFinite(t[axis]));
  if (valid.filter(t => t.eye === 'right').length < 5 || valid.filter(t => t.eye === 'left').length < 5) {
    return absent('Δ', 'calibrated-alternate-cover', note || '시선각도 보정과 각 눈 5회 유효 차폐가 필요합니다.');
  }
  return result(valid.reduce((sum, t) => sum + t[axis]!, 0) / valid.length, 'Δ', 'calibrated-alternate-cover',
    axis === 'horizontalDelta' ? '내사위 + / 외사위 −' : '오른눈 상대 상사위 + / 하사위 −');
}
export function computeScreeningMetrics(session: ScreeningSession): ScreeningResults {
  const scale = session.profile.streamMmPerPixelAt40;
  const ipd = (baseline: ScreeningSession['far'], isFar: boolean): Measurement => {
    if (!baseline || !isPositive(scale)) return absent('mm', 'camera-ipd', '40cm 보정과 유효 동공 중심이 필요합니다.');
    const value = ipdFromPixels(baseline.ipdPx, scale);
    if (value === null) return absent('mm', 'camera-ipd', '보정값을 확인해주세요.');
    const fromReference = isFar && session.profile.scaleMode === 'known-ipd';
    return result(value, 'mm', fromReference ? 'known-ipd-calibrated' : 'photo-calibrated-pupil-centers',
      fromReference ? '입력한 IPD를 기준으로 보정한 값' : '40cm 각막 평면');
  };
  const farIpd = ipd(session.far, true), nearIpd = ipd(session.near, false);
  const farHorizontal = coverResult(session.farTrials, 'horizontalDelta', session.notes['far-cover'], session.manifestMovement['far-cover']);
  const farVertical = coverResult(session.farTrials, 'verticalRightRelativeDelta', session.notes['far-cover'], session.manifestMovement['far-cover']);
  const nearHorizontal = coverResult(session.nearTrials, 'horizontalDelta', session.notes['near-cover'], session.manifestMovement['near-cover']);
  const nearVertical = coverResult(session.nearTrials, 'verticalRightRelativeDelta', session.notes['near-cover'], session.manifestMovement['near-cover']);
  const endpointCm = session.npc?.distance.corneaCm;
  const npc = isPositive(endpointCm)
    ? result(endpointCm + session.profile.rotationCenterOffsetMm / 10, 'cm', 'objective-eye-deviation', '안구회전점→전면카메라, 13mm 오프셋 가정 포함')
    : absent('cm', 'objective-eye-deviation', session.notes.npc || '유효한 눈 이탈 시점이 기록되지 않았습니다.');
  const accommodation = (eye: 'right' | 'left'): Measurement => {
    const d = session.accommodation[eye]?.distance.corneaCm;
    if (!isPositive(d)) return absent('D', 'monocular-unreadable-push-up', session.notes[eye === 'right' ? 'right-aa' : 'left-aa'] || '단안 판독불가 지점을 기록해주세요.');
    const targetDistance = d + session.profile.cameraToScreenMm / 10;
    if (!isPositive(targetDistance)) return absent('D', 'monocular-unreadable-push-up', '각막–화면 거리 보정값이 유효하지 않습니다.');
    return result(100 / targetDistance, 'D', 'monocular-unreadable-push-up', `각막정점→고정 크기 시표; 굴절교정 ${session.profile.correction}`);
  };
  const inputs = [farIpd.value, farHorizontal.value, nearHorizontal.value];
  const acaValue = inputs.every(v => v !== null) ? calculateAcA(inputs[0]!, inputs[1]!, inputs[2]!) : null;
  const farDistanceValid = isPositive(session.profile.farTargetDistanceM) && session.profile.farTargetDistanceM >= 6;
  const acA = acaValue !== null && farDistanceValid && session.profile.correction === 'distance-corrected'
    ? result(acaValue, 'Δ/D', 'heterophoria-40cm', 'IPD(cm) + (근거리−원거리 사위)/2.5')
    : absent('Δ/D', 'heterophoria-40cm', '유효 사위·IPD, 6m 이상 표적, 원거리 굴절교정 조건이 필요합니다.');
  const results: ScreeningResults = { farIpd, nearIpd, farHorizontal, farVertical, nearHorizontal, nearVertical, npc,
    rightAccommodation: accommodation('right'), leftAccommodation: accommodation('left'), acA };
  const stages = { farIpd: 'far-ipd', nearIpd: 'near-ipd', farHorizontal: 'far-cover', farVertical: 'far-cover',
    nearHorizontal: 'near-cover', nearVertical: 'near-cover', npc: 'npc', rightAccommodation: 'right-aa', leftAccommodation: 'left-aa' } as const;
  for (const key of Object.keys(stages) as (keyof typeof stages)[]) {
    const outcome = session.outcomes[stages[key]];
    if (results[key].value === null && (outcome === 'censored' || outcome === 'invalid')) results[key].status = outcome;
  }
  return results;
}
/** 검사 단계와 종료 이벤트가 없는 자유 녹화에서 수치를 만들지 않는다. */
export const computeClinicalMetrics = (samples: AnalysisSample[], userAge?: number): Partial<ClinicalMetrics> => {
  void samples;
  void userAge;
  return {
  distPhoria: null, nearPhoria: null, distPRC: null, distNRC: null, nearPRC: null, nearNRC: null,
  nearPRA: null, nearNRA: null, acA: null, npc: null, maxAccom: null,
  };
};
