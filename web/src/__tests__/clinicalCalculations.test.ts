import { describe, it, expect } from 'vitest';
import { mmToPrismDiopter, computeClinicalMetrics, AnalysisSample } from '../utils/clinicalCalculations';

// 테스트용 샘플 생성 헬퍼
const makeSamples = (count: number, pdMm: number, variation = 0): AnalysisSample[] =>
  Array.from({ length: count }, (_, i) => ({
    t: i * 33,
    pdMm: pdMm + (i % 2 === 0 ? variation : -variation),
    velocityMmS: 0,
    symmetry: 100,
    leftX: 0,
    rightX: 0,
  }));

// ─────────────────────────────────────────────
// mmToPrismDiopter
// ─────────────────────────────────────────────
describe('mmToPrismDiopter', () => {
  it('1mm 편차 at 50cm = 0.2 프리즘 디옵터', () => {
    expect(mmToPrismDiopter(1, 50)).toBe(0.2);
  });

  it('5mm 편차 at 50cm = 1 프리즘 디옵터', () => {
    expect(mmToPrismDiopter(5, 50)).toBe(1);
  });

  it('0mm 편차 = 0 프리즘 디옵터', () => {
    expect(mmToPrismDiopter(0)).toBe(0);
  });

  it('음수 편차 처리', () => {
    expect(mmToPrismDiopter(-2, 50)).toBe(-0.4);
  });

  it('기본 시청거리(50cm) 사용', () => {
    expect(mmToPrismDiopter(5)).toBe(mmToPrismDiopter(5, 50));
  });
});

// ─────────────────────────────────────────────
// computeClinicalMetrics — 엣지 케이스
// ─────────────────────────────────────────────
describe('computeClinicalMetrics — 엣지 케이스', () => {
  it('샘플 < 10개: 모든 지표 null 반환', () => {
    const result = computeClinicalMetrics(makeSamples(5, 63));
    expect(result.distPhoria).toBeNull();
    expect(result.nearPhoria).toBeNull();
    expect(result.acA).toBeNull();
    expect(result.npc).toBeNull();
  });

  it('정확히 10개 샘플: 계산 수행', () => {
    const result = computeClinicalMetrics(makeSamples(10, 63));
    expect(result.distPhoria).not.toBeNull();
  });

  it('빈 배열: 모든 지표 null 반환', () => {
    const result = computeClinicalMetrics([]);
    expect(result.distPhoria).toBeNull();
  });
});

// ─────────────────────────────────────────────
// computeClinicalMetrics — 사위 (Phoria)
// ─────────────────────────────────────────────
describe('computeClinicalMetrics — 사위', () => {
  it('PD 변화 없으면 원거리 사위 ≈ 0', () => {
    // 모든 샘플이 동일 PD — 기준값과 평균이 같음
    const samples = makeSamples(50, 63, 0);
    const result = computeClinicalMetrics(samples);
    expect(result.distPhoria).toBe(0);
  });

  it('근거리 사위는 원거리의 1.5배', () => {
    // 수렴(PD 감소)하는 샘플 생성
    const samples: AnalysisSample[] = [
      ...makeSamples(10, 63),  // 기준 10샘플
      ...makeSamples(40, 58),  // 수렴 상태 40샘플
    ];
    const result = computeClinicalMetrics(samples);
    if (result.distPhoria !== null && result.nearPhoria !== null) {
      expect(Math.abs(result.nearPhoria)).toBeCloseTo(Math.abs(result.distPhoria) * 1.5, 0);
    }
  });
});

// ─────────────────────────────────────────────
// computeClinicalMetrics — PRC/NRC 포맷
// ─────────────────────────────────────────────
describe('computeClinicalMetrics — PRC/NRC', () => {
  it('distPRC는 "Break/Recovery" 포맷 (슬래시 포함)', () => {
    const samples = [
      ...makeSamples(10, 63),
      ...makeSamples(40, 58),
    ];
    const result = computeClinicalMetrics(samples);
    expect(result.distPRC).toMatch(/^-?\d+(\.\d+)?\/-?\d+(\.\d+)?$/);
  });

  it('distNRC는 "Break/Recovery" 포맷', () => {
    const samples = [
      ...makeSamples(10, 63),
      ...makeSamples(40, 67),
    ];
    const result = computeClinicalMetrics(samples);
    expect(result.distNRC).toMatch(/^-?\d+(\.\d+)?\/-?\d+(\.\d+)?$/);
  });
});

// ─────────────────────────────────────────────
// computeClinicalMetrics — NPC
// ─────────────────────────────────────────────
describe('computeClinicalMetrics — NPC', () => {
  it('폭주 없으면 NPC = 시청거리(50cm)', () => {
    // min PD = baseline PD → convergenceRatio = 1 → NPC = 50
    const samples = makeSamples(50, 63);
    const result = computeClinicalMetrics(samples);
    expect(result.npc).toBe(50);
  });

  it('강한 폭주(PD 감소)는 더 가까운 NPC 반환', () => {
    const normalSamples = makeSamples(50, 63);
    const convergentSamples = [
      ...makeSamples(10, 63),
      ...makeSamples(40, 50), // 강한 수렴
    ];
    const normalResult = computeClinicalMetrics(normalSamples);
    const convergentResult = computeClinicalMetrics(convergentSamples);
    if (normalResult.npc !== null && convergentResult.npc !== null) {
      expect(convergentResult.npc).toBeLessThan(normalResult.npc);
    }
  });
});

// ─────────────────────────────────────────────
// computeClinicalMetrics — AC/A ratio
// ─────────────────────────────────────────────
describe('computeClinicalMetrics — AC/A ratio', () => {
  it('정상 수렴 시 AC/A는 양수', () => {
    const samples = [
      ...makeSamples(10, 63),
      ...makeSamples(40, 58),
    ];
    const result = computeClinicalMetrics(samples);
    expect(result.acA).not.toBeNull();
    if (result.acA !== null) {
      expect(result.acA).toBeGreaterThanOrEqual(0);
    }
  });
});

// ─────────────────────────────────────────────
// computeClinicalMetrics — 수치 타입 검증
// ─────────────────────────────────────────────
describe('computeClinicalMetrics — 출력 타입', () => {
  it('숫자 필드는 모두 유한수(finite number)', () => {
    const samples = [
      ...makeSamples(10, 63),
      ...makeSamples(40, 58),
    ];
    const result = computeClinicalMetrics(samples);
    const numericFields = ['distPhoria', 'nearPhoria', 'nearPRA', 'nearNRA', 'acA', 'npc', 'maxAccom'] as const;
    for (const field of numericFields) {
      const val = result[field];
      if (val !== null) {
        expect(isFinite(val as number)).toBe(true);
      }
    }
  });
});
