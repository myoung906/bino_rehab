import { describe, expect, it } from 'vitest';
import { bindProfile, createProfile, estimateDistance, landoltOuterDiameterMm, photoScaleForStream } from '../utils/calibration';
import { fitAngularCalibration } from '../utils/angularCalibration';
import { baseline, frame, scope, session } from './screeningFixtures';

describe('촬영 범위와 배율 보정', () => {
  it('같은 촬영 범위 확인 전에는 사진 계수를 적용하지 않는다', () => {
    expect(photoScaleForStream(createProfile(), scope)).toBeNull();
  });
  it('동일 화각 4:3 리사이즈는 길이 계수를 비례 환산한다', () => {
    const p = createProfile(); p.photoFieldOfViewConfirmed = true;
    expect(photoScaleForStream(p, { ...scope, width: 1344, height: 1008 })).toBeCloseTo(.3912);
    expect(photoScaleForStream(p, { ...scope, width: 1280, height: 720 })).toBeNull();
  });
  it('실제 IPD 기준으로 현재 영상의 배율을 구한다', () => {
    const p = createProfile(); p.scaleMode = 'known-ipd'; p.knownIpdMm = 65.5;
    expect(bindProfile(p, baseline())?.streamMmPerPixelAt40).toBeCloseTo(65.5 / 502.2);
  });
  it('홍채가 두 배 커지면 추정 거리는 40cm에서 20cm가 된다', () => {
    const f = frame(); f.eyes.right.irisDiameterPx = 40; f.eyes.left.irisDiameterPx = 40;
    expect(estimateDistance(f, baseline(), session().profile).corneaCm).toBe(20);
  });
  it('눈 평면 오프셋을 넣어도 기준 거리는 40cm를 유지한다', () => {
    const p = session().profile; p.irisToCorneaMm = 3;
    expect(estimateDistance(frame(), baseline(), p).corneaCm).toBeCloseTo(40);
    const f = frame(); f.eyes.right.irisDiameterPx = 40; f.eyes.left.irisDiameterPx = 40;
    expect(estimateDistance(f, baseline(), p).corneaCm).toBeCloseTo(19.85);
  });
  it('단안검사는 가린 눈의 값과 IPD 거리를 사용하지 않는다', () => {
    const f = frame(); f.eyes.left.valid = false; f.eyes.left.covered = true; f.eyes.left.irisDiameterPx = 10000;
    const d = estimateDistance(f, baseline(), session().profile, 'right');
    expect(d.corneaCm).toBe(40); expect(d.ipdCm).toBeNull();
  });
  it('눈 사이 배율 불일치를 임의로 평균하여 거리로 출력하지 않는다', () => {
    const f = frame(); f.eyes.left.irisDiameterPx = 40;
    expect(estimateDistance(f, baseline(), session().profile).corneaCm).toBeNull();
  });
  it('기기와 줌 변경 시 기존 보정을 거부한다', () => {
    const f = frame(); f.scope.deviceId = 'another-camera';
    expect(estimateDistance(f, baseline(), session().profile).corneaCm).toBeNull();
    f.scope = { ...scope, zoom: 2 };
    expect(estimateDistance(f, baseline(), session().profile).corneaCm).toBeNull();
  });
  it('0.66 란돌트 C의 외경은 40cm에서 약 0.88mm이다', () => {
    expect(landoltOuterDiameterMm()).toBeCloseTo(.88148, 4);
  });
});

describe('실제 표적각도 보정', () => {
  const samples = () => [[0, 0], [-5, 0], [5, 0], [0, -4], [0, 4]].map(([x, y]) => ({
    angles: { right: { x, y }, left: { x, y } },
    positions: { right: { x: .5 + x / 50, y: y / 40 }, left: { x: .45 + x / 60, y: y / 45 } },
  }));
  it('두 눈의 수평·수직 계수를 독립적으로 구한다', () => {
    const fit = fitAngularCalibration(samples());
    expect(fit?.right.horizontalDegPerUnit).toBeCloseTo(50);
    expect(fit?.left.horizontalDegPerUnit).toBeCloseTo(60);
    expect(fit?.right.verticalDegPerUnit).toBeCloseTo(40);
    expect(fit?.left.verticalDegPerUnit).toBeCloseTo(45);
  });
  it('양방향 표적이 없거나 위치가 변하지 않으면 보정을 거부한다', () => {
    const refs = samples().map(s => ({ ...s, positions: { right: { x: .5, y: 0 }, left: { x: .5, y: 0 } } }));
    expect(fitAngularCalibration(refs)).toBeNull();
    expect(fitAngularCalibration(samples().slice(0, 3))).toBeNull();
  });
  it('실제 각도와 관측 위치의 잔차가 크면 보정을 거부한다', () => {
    const refs = samples(); refs[0].positions.right.x += .3;
    expect(fitAngularCalibration(refs)).toBeNull();
  });
  it('잘못된 표적각도나 비유한 관측값을 일부 제외하여 보정하지 않는다', () => {
    const outside = samples(); outside[0].angles.right.x = 11;
    expect(fitAngularCalibration(outside)).toBeNull();
    const invalid = samples(); invalid[0].positions.left.y = Number.NaN;
    expect(fitAngularCalibration(invalid)).toBeNull();
  });
});
