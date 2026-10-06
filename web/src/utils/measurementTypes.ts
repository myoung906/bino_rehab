export type Eye = 'right' | 'left';
export type MeasurementStatus = 'measured' | 'derived' | 'unavailable' | 'invalid' | 'censored';
export type Stage = 'setup' | 'far-ipd' | 'far-cover' | 'near-ipd' | 'near-cover' | 'npc' | 'right-aa' | 'left-aa' | 'results';
export interface Measurement {
  value: number | null;
  unit: 'mm' | 'cm' | 'D' | 'Δ' | 'Δ/D';
  status: MeasurementStatus;
  method: string;
  reason?: string;
  reference?: string;
}
export interface CaptureScope { width: number; height: number; deviceId: string; facingMode: string; zoom?: number | null }
export interface AngularCalibration {
  // 눈 폭으로 정규화한 눈꼬리 기준 좌표 → 실제 표적각도(도). 부호까지 실측 보정한다.
  horizontalDegPerUnit: number | null;
  verticalDegPerUnit: number | null;
}
export interface CalibrationProfile {
  version: 2;
  name: string;
  scaleMode: 'photo' | 'known-ipd';
  photoMmPerPixel: number;
  photoWidth: number;
  photoHeight: number;
  photoFieldOfViewConfirmed: boolean;
  knownIpdMm: number;
  scope: CaptureScope | null;
  streamMmPerPixelAt40: number | null;
  rotationCenterOffsetMm: number;
  irisToCorneaMm: number;
  cameraToScreenMm: number;
  angular: Record<Eye, AngularCalibration>;
  angularScope: CaptureScope | null;
  displayPixelsPerMm: number | null;
  displayScope: { screenWidth: number; dpr: number } | null;
  correction: 'distance-corrected' | 'uncorrected' | 'unknown';
  farTargetDistanceM: number | null;
}
export interface Point { x: number; y: number }
export interface EyeObservation {
  iris: Point; pupil: Point | null; irisDiameterPx: number;
  eyeWidthPx: number;
  position: Point | null;
  covered: boolean; open: boolean; valid: boolean;
}
export interface TrackingFrame {
  timestamp: number; scope: CaptureScope; facePresent: boolean; handTrackingReady: boolean;
  eyes: Record<Eye, EyeObservation>; nose: Point; faceWidthPx: number;
  pose: Point; roll: number;
}
export interface Baseline {
  ipdPx: number; irisDiameterPx: Record<Eye, number>; faceWidthPx: number; scope: CaptureScope;
  pose: Point; roll: number;
}
export interface CoverTrial {
  eye: Eye; uncoveredAt: number; settledAt: number; start: Point; end: Point;
  horizontalDelta: number | null;
  // 오른눈 상대 상사위 + / 하사위 −.
  verticalRightRelativeDelta: number | null;
  horizontalMovementMm: number | null; verticalMovementMm: number | null;
}
export interface DistanceEstimate {
  corneaCm: number | null; irisCm: number | null; ipdCm: number | null;
  disagreementPercent: number | null; reason?: string;
}
export interface Endpoint {
  at: number; distance: DistanceEstimate;
  source: 'objective-eye-deviation' | 'unreadable-tap'; eye?: Eye;
}
export interface ScreeningSession {
  profile: CalibrationProfile; far: Baseline | null; near: Baseline | null;
  farTrials: CoverTrial[]; nearTrials: CoverTrial[]; npc: Endpoint | null;
  accommodation: Partial<Record<Eye, Endpoint>>;
  completed: Stage[]; notes: Partial<Record<Stage, string>>;
  manifestMovement: Partial<Record<'far-cover' | 'near-cover', boolean>>;
  outcomes: Partial<Record<Stage, MeasurementStatus>>;
}
export interface ScreeningResults {
  farIpd: Measurement; nearIpd: Measurement;
  farHorizontal: Measurement; farVertical: Measurement;
  nearHorizontal: Measurement; nearVertical: Measurement;
  npc: Measurement; rightAccommodation: Measurement; leftAccommodation: Measurement; acA: Measurement;
}
