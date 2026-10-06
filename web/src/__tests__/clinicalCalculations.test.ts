import { describe, it, expect } from 'vitest';
import { angleToPrismDiopter, calculateAcA, computeClinicalMetrics, computeScreeningMetrics, ipdFromPixels, mmToPrismDiopter } from '../utils/clinicalCalculations';
import { session, trials } from './screeningFixtures';

// 실제 단위, 합의한 공식, 종료점 없을 때의 처리를 검증한다.
describe('v2 임상 계산', () => {
  it('45도는 100Δ, 1Δ는 atan(0.01)의 각도이다', () => {
    expect(angleToPrismDiopter(45)).toBeCloseTo(100);
    expect(angleToPrismDiopter(Math.atan(.01) * 180 / Math.PI)).toBeCloseTo(1);
    expect(mmToPrismDiopter(-2, 50)).toBe(-.4);
  });
  it('개인 표본의 영상 간격을 IPD로 환산한다', () => {
    expect(ipdFromPixels(502.2, .1304)).toBeCloseTo(65.48688);
    expect(ipdFromPixels(502.2, 0)).toBeNull();
    expect(ipdFromPixels(Infinity, .1304)).toBeNull();
  });
  it('AC/A는 IPD(cm) + 사위 차이 / 2.5이다', () => {
    expect(calculateAcA(65.5, -2, 4)).toBeCloseTo(8.95);
    expect(calculateAcA(65.5, -2, 4, 0)).toBeNull();
  });
  it('자유 녹화나 나이만으로 임상값을 만들지 않는다', () => {
    const raw = Array.from({ length: 50 }, (_, i) => ({ t: i * 33, pdMm: 63 - i / 10,
      velocityMmS: 2, symmetry: 100, leftX: 200, rightX: 600 }));
    expect(Object.values(computeClinicalMetrics(raw, 40)).every(v => v === null)).toBe(true);
  });
  it('각도 보정 없는 이동 관측은 사위 0으로 표시하지 않는다', () => {
    const s = session(); s.farTrials = trials(null, null);
    const r = computeScreeningMetrics(s);
    expect(r.farHorizontal.value).toBeNull(); expect(r.farVertical.value).toBeNull(); expect(r.acA.value).toBeNull();
  });
  it('원거리와 근거리 사위를 각 검사에서 독립적으로 계산한다', () => {
    const s = session(); s.farTrials = trials(-2, 1); s.nearTrials = trials(4, -1);
    const r = computeScreeningMetrics(s);
    expect(r.farHorizontal.value).toBe(-2); expect(r.nearHorizontal.value).toBe(4);
    expect(r.farVertical.value).toBe(1); expect(r.nearVertical.value).toBe(-1);
    expect(r.acA.value).toBe(9);
  });
  it('각 눈 5회를 충족해야 사위량을 출력한다', () => {
    const s = session(); s.farTrials = trials(3).filter(t => t.eye === 'right');
    expect(computeScreeningMetrics(s).farHorizontal.value).toBeNull();
  });
  it('첫 단순 차폐에서 반대 눈 이동을 관찰하면 사위 해석을 보류한다', () => {
    const s = session(); s.farTrials = trials(3); s.manifestMovement['far-cover'] = true;
    expect(computeScreeningMetrics(s).farHorizontal.value).toBeNull();
  });
  it.each(['unknown', 'uncorrected'] as const)('굴절교정 %s에서는 AC/A를 보류한다', correction => {
    const s = session(); s.farTrials = trials(-2); s.nearTrials = trials(4); s.profile.correction = correction;
    expect(computeScreeningMetrics(s).acA.value).toBeNull();
  });
  it('먼 표적이 충분히 멀지 않으면 AC/A를 보류한다', () => {
    const s = session(); s.farTrials = trials(-2); s.nearTrials = trials(4); s.profile.farTargetDistanceM = 3;
    expect(computeScreeningMetrics(s).acA.value).toBeNull();
  });
  it('NPC는 기록한 이탈 거리에 회전점 오프셋을 더한다', () => {
    const s = session(); s.npc = { at: 5000, source: 'objective-eye-deviation',
      distance: { corneaCm: 8, irisCm: 8, ipdCm: 10, disagreementPercent: 25 } };
    expect(computeScreeningMetrics(s).npc.value).toBe(9.3);
    s.npc = null; s.outcomes.npc = 'censored';
    expect(computeScreeningMetrics(s).npc).toMatchObject({ value: null, status: 'censored' });
  });
  it('각막–시표 거리 10cm는 10D이고 좌우 값을 별도로 유지한다', () => {
    const s = session(); s.accommodation.right = { at: 5000, source: 'unreadable-tap', eye: 'right',
      distance: { corneaCm: 10, irisCm: 10, ipdCm: null, disagreementPercent: null } };
    s.accommodation.left = { at: 6000, source: 'unreadable-tap', eye: 'left',
      distance: { corneaCm: 20, irisCm: 20, ipdCm: null, disagreementPercent: null } };
    const r = computeScreeningMetrics(s);
    expect(r.rightAccommodation.value).toBe(10); expect(r.leftAccommodation.value).toBe(5);
  });
  it('렌즈–화면 오프셋을 조절력 거리에 적용한다', () => {
    const s = session(); s.profile.cameraToScreenMm = 10;
    s.accommodation.right = { at: 5000, source: 'unreadable-tap',
      distance: { corneaCm: 9, irisCm: 9, ipdCm: null, disagreementPercent: null } };
    expect(computeScreeningMetrics(s).rightAccommodation.value).toBe(10);
  });
  it('입력 IPD로 보정한 값의 출처를 명시한다', () => {
    const s = session(); s.profile.scaleMode = 'known-ipd';
    expect(computeScreeningMetrics(s).farIpd.method).toBe('known-ipd-calibrated');
  });
  it('잘못된 거리와 누락된 종료점에 조절력 숫자를 만들지 않는다', () => {
    const s = session(); s.accommodation.right = { at: 5000, source: 'unreadable-tap',
      distance: { corneaCm: 0, irisCm: 0, ipdCm: null, disagreementPercent: null } };
    expect(computeScreeningMetrics(s).rightAccommodation.value).toBeNull();
    expect(computeScreeningMetrics(s).leftAccommodation.value).toBeNull();
  });
});
