import type { Baseline, CalibrationProfile, CaptureScope, DistanceEstimate, Eye, TrackingFrame } from './measurementTypes';

// 65.5mm / 502.2px로 역산한 개인 표본. 전체 사용자에게 공통 적용하지 않는다.
export const PERSONAL_PHOTO_REFERENCE = {
  name: 'iPhone 12 mini 개인 사진 표본', mmPerPixel: 0.1304,
  width: 4032, height: 3024, distanceCm: 40, knownIpdMm: 65.5,
} as const;
export const createProfile = (): CalibrationProfile => ({
  version: 2, name: PERSONAL_PHOTO_REFERENCE.name, scaleMode: 'photo',
  photoMmPerPixel: PERSONAL_PHOTO_REFERENCE.mmPerPixel,
  photoWidth: PERSONAL_PHOTO_REFERENCE.width, photoHeight: PERSONAL_PHOTO_REFERENCE.height,
  photoFieldOfViewConfirmed: false, knownIpdMm: PERSONAL_PHOTO_REFERENCE.knownIpdMm,
  scope: null, streamMmPerPixelAt40: null, rotationCenterOffsetMm: 13,
  irisToCorneaMm: 0, cameraToScreenMm: 0,
  angular: {
    right: { horizontalDegPerUnit: null, verticalDegPerUnit: null },
    left: { horizontalDegPerUnit: null, verticalDegPerUnit: null },
  },
  angularScope: null,
  displayPixelsPerMm: null, displayScope: null, correction: 'unknown', farTargetDistanceM: null,
});
export const isPositive = (n: number | null | undefined): n is number =>
  typeof n === 'number' && Number.isFinite(n) && n > 0;
export const sameScope = (a: CaptureScope, b: CaptureScope): boolean =>
  a.width === b.width && a.height === b.height && a.deviceId === b.deviceId && a.facingMode === b.facingMode
    && (a.zoom ?? null) === (b.zoom ?? null);
export function photoScaleForStream(profile: CalibrationProfile, scope: CaptureScope): number | null {
  if (!profile.photoFieldOfViewConfirmed || !isPositive(profile.photoMmPerPixel)
    || !isPositive(profile.photoWidth) || !isPositive(profile.photoHeight)) return null;
  if (Math.abs(scope.width / scope.height - profile.photoWidth / profile.photoHeight) > 0.01) return null;
  return profile.photoMmPerPixel * profile.photoWidth / scope.width;
}
export function bindProfile(profile: CalibrationProfile, baseline: Baseline): CalibrationProfile | null {
  const scale = profile.scaleMode === 'known-ipd'
    ? (isPositive(profile.knownIpdMm) && isPositive(baseline.ipdPx) ? profile.knownIpdMm / baseline.ipdPx : null)
    : photoScaleForStream(profile, baseline.scope);
  if (!isPositive(scale)) return null;
  return { ...profile, scope: baseline.scope, streamMmPerPixelAt40: scale };
}
export function estimateDistance(frame: TrackingFrame, near: Baseline, profile: CalibrationProfile, onlyEye?: Eye): DistanceEstimate {
  const unavailable = (reason: string): DistanceEstimate => ({ corneaCm: null, irisCm: null, ipdCm: null, disagreementPercent: null, reason });
  if (!profile.scope || !sameScope(profile.scope, frame.scope)) return unavailable('카메라 설정이 바뀌었습니다.');
  const eyes: Eye[] = onlyEye ? [onlyEye] : ['right', 'left'];
  const values = eyes.filter(e => frame.eyes[e].valid && isPositive(frame.eyes[e].irisDiameterPx))
    .map(e => (40 + profile.irisToCorneaMm / 10) * near.irisDiameterPx[e] / frame.eyes[e].irisDiameterPx);
  if (values.length !== eyes.length) return unavailable('열린 눈의 추적을 확인해주세요.');
  const irisCm = values.reduce((sum, v) => sum + v, 0) / values.length;
  if (!Number.isFinite(irisCm) || irisCm < 2 || irisCm > 60) return unavailable('현재 거리를 판독하기 어렵습니다.');
  const r = frame.eyes.right.pupil, l = frame.eyes.left.pupil;
  const ipdPx = r && l ? Math.hypot(r.x - l.x, r.y - l.y) : 0;
  // 폭주도 투영 IPD를 바꾼다. 이 값은 비교 기록이며 홍채 거리와 단순 평균하지 않는다.
  const ipdCm = !onlyEye && frame.eyes.right.valid && frame.eyes.left.valid && isPositive(ipdPx) ? 40 * near.ipdPx / ipdPx : null;
  const disagreementPercent = ipdCm === null ? null : Math.abs(irisCm - ipdCm) / irisCm * 100;
  if (!onlyEye && Math.abs(values[0] - values[1]) / irisCm > 0.15) {
    return { corneaCm: null, irisCm, ipdCm, disagreementPercent, reason: '두 눈의 배율이 다릅니다. 휴대폰을 정면으로 맞춰주세요.' };
  }
  // 기본 눈 평면 오프셋 0은 초기 근사이다. 실제 거리 기준과 비교하여 설정한다.
  return { corneaCm: irisCm - profile.irisToCorneaMm / 10, irisCm, ipdCm, disagreementPercent };
}
export function landoltOuterDiameterMm(acuity = 0.66, distanceMm = 400): number {
  return 5 * 2 * distanceMm * Math.tan((Math.PI / 180 / 60 / acuity) / 2);
}
