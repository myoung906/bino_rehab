import { describe, expect, it } from 'vitest';
import { cameraAssistStatus, eyeImageQuality } from '../utils/cameraAssist';
import { frame } from './screeningFixtures';

describe('촬영 준비 안내', () => {
  it('어두워도 실제 판독이 성공한 동공은 확인됨으로 표시한다', () => {
    const status = cameraAssistStatus(frame(), { right: { brightness: 10, highlightFraction: 0 } }, 'setup');
    expect(status.ready).toBe(true);
    expect(status.message).toBe('두 동공 확인됨');
  });
  it('얼굴이 없으면 얼굴 위치부터 안내한다', () => {
    const f = frame(); f.facePresent = false;
    expect(cameraAssistStatus(f, {}, 'setup').message).toContain('얼굴');
  });
  it('실패한 눈이 어두우면 준비 단계에 조명을 안내한다', () => {
    const f = frame(); f.eyes.right.valid = false;
    const q = { right: { brightness: 20, highlightFraction: 0 } };
    expect(cameraAssistStatus(f, q, 'setup').message).toContain('조명 버튼');
    expect(cameraAssistStatus(f, q, 'npc').message).toContain('처음부터');
    expect(cameraAssistStatus(f, q, 'setup').ready).toBe(false);
  });
  it('흰 밝은 영역은 반사 확인 안내를 제공한다', () => {
    const f = frame(); f.eyes.left.valid = false;
    expect(cameraAssistStatus(f, { left: { brightness: 100, highlightFraction: .2 } }, 'setup').message).toContain('반사');
  });
  it('단안검사에서 가린 반대 눈을 판독 실패로 취급하지 않는다', () => {
    const f = frame(); f.eyes.left.covered = true; f.eyes.left.valid = false;
    expect(cameraAssistStatus(f, {}, 'right-aa').ready).toBe(true);
  });
  it('양쪽을 가리면 준비 완료로 표시하지 않는다', () => {
    const f = frame(); f.eyes.left.covered = true; f.eyes.right.covered = true;
    expect(cameraAssistStatus(f, {}, 'setup').ready).toBe(false);
  });
  it('눈 감김과 작은 영상에는 각각 필요한 행동을 안내한다', () => {
    const f = frame(); f.eyes.right.valid = false; f.eyes.right.open = false;
    expect(cameraAssistStatus(f, {}, 'setup').message).toContain('뜨세요');
    f.eyes.right.open = true; f.eyes.right.irisDiameterPx = 5;
    expect(cameraAssistStatus(f, {}, 'setup').message).toContain('40cm');
  });
  it('밝기 통계는 빈 영상과 검정·흰색 입력을 처리한다', () => {
    expect(eyeImageQuality(new Uint8ClampedArray())).toEqual({ brightness: 0, highlightFraction: 0 });
    const black = new Uint8ClampedArray(16); expect(eyeImageQuality(black).brightness).toBe(0);
    expect(eyeImageQuality(new Uint8ClampedArray(16).fill(255)).highlightFraction).toBe(1);
  });
});
