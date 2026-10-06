import { createProfile } from '../utils/calibration';
import type { Baseline, CoverTrial, ScreeningSession, TrackingFrame } from '../utils/measurementTypes';

export const scope = { width: 4032, height: 3024, deviceId: 'test-camera', facingMode: 'user' };
export const baseline = (): Baseline => ({ ipdPx: 502.2, irisDiameterPx: { right: 20, left: 20 },
  faceWidthPx: 800, scope: { ...scope }, pose: { x: 0, y: 0 }, roll: 0 });
export const session = (): ScreeningSession => ({
  profile: { ...createProfile(), scope: { ...scope }, streamMmPerPixelAt40: .1304,
    correction: 'distance-corrected', farTargetDistanceM: 6 },
  far: baseline(), near: { ...baseline(), ipdPx: 480 }, farTrials: [], nearTrials: [], npc: null,
  accommodation: {}, completed: [], notes: {}, manifestMovement: {}, outcomes: {},
});
export const trials = (horizontal: number | null, vertical: number | null = 0): CoverTrial[] => Array.from({ length: 10 }, (_, i) => ({
  eye: i % 2 ? 'left' : 'right', uncoveredAt: 1000 + i * 1000, settledAt: 1500 + i * 1000,
  start: { x: .5, y: 0 }, end: { x: .51, y: .01 }, horizontalDelta: horizontal,
  verticalRightRelativeDelta: vertical, horizontalMovementMm: .2, verticalMovementMm: .2,
}));
export const frame = (): TrackingFrame => ({
  timestamp: 1000, scope: { ...scope }, facePresent: true, handTrackingReady: true,
  nose: { x: 1900, y: 1600 }, faceWidthPx: 800, pose: { x: 0, y: 0 }, roll: 0,
  eyes: {
    right: { iris: { x: 1500, y: 1500 }, pupil: { x: 1500, y: 1500 }, irisDiameterPx: 20,
      eyeWidthPx: 80, position: { x: .5, y: 0 }, covered: false, open: true, valid: true },
    left: { iris: { x: 2002.2, y: 1500 }, pupil: { x: 2002.2, y: 1500 }, irisDiameterPx: 20,
      eyeWidthPx: 80, position: { x: .5, y: 0 }, covered: false, open: true, valid: true },
  },
});
