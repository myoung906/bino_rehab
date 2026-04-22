import { ClinicalMetrics } from '@/hooks/useAnalysisStore';

// 임상 계산에 사용되는 상수
const VIEWING_DISTANCE_CM = 50;
const BASELINE_PD_MM = 63;

export interface AnalysisSample {
    t: number;
    pdMm: number;
    velocityMmS: number;
    symmetry: number;
    leftX: number;
    rightX: number;
}

/**
 * mm 편차를 프리즘 디옵터(Δ)로 변환
 * 공식: Δ = deviation_mm / (viewing_distance_cm * 0.1)
 */
export const mmToPrismDiopter = (mm: number, viewingDistanceCm: number = VIEWING_DISTANCE_CM): number => {
    return parseFloat((mm / (viewingDistanceCm * 0.1)).toFixed(1));
};

/**
 * 분석 샘플 배열로부터 임상 지표를 계산하는 순수 함수
 * 10개 미만 샘플은 null 반환
 */
export const computeClinicalMetrics = (samples: AnalysisSample[]): Partial<ClinicalMetrics> => {
    if (samples.length < 10) {
        return {
            distPhoria: null, distPRC: null, distNRC: null,
            nearPhoria: null, nearPRC: null, nearNRC: null,
            nearPRA: null, nearNRA: null,
            acA: null, npc: null, maxAccom: null,
        };
    }

    const pds = samples.map(s => s.pdMm);

    // 기준 PD: 처음 최대 30개 샘플 평균 (안정 시 위치)
    const baselineCount = Math.min(30, Math.floor(samples.length * 0.1));
    const baselinePd = pds.slice(0, baselineCount).reduce((a, b) => a + b, 0) / baselineCount;

    const avgPd = pds.reduce((a, b) => a + b, 0) / pds.length;
    // spread 연산자 대신 reduce 사용 — 대용량 배열 스택 오버플로 방지
    const minPd = pds.reduce((min, v) => v < min ? v : min, pds[0]);
    const maxPd = pds.reduce((max, v) => v > max ? v : max, pds[0]);

    const mmToD = (mm: number) => mmToPrismDiopter(mm);

    // --- 사위 (Phoria) ---
    const pdDeviation = avgPd - baselinePd;
    const distPhoria = mmToD(pdDeviation);
    const nearPhoria = mmToD(pdDeviation * 1.5); // 근거리 사위는 원거리보다 큼

    // --- 폭주 범위 ---
    // PRC (양성상대폭주): 기준 - 최솟값 = 최대 폭주량
    const maxConvergence = baselinePd - minPd;
    // NRC (음성상대폭주): 최댓값 - 기준 = 최대 개산량
    const maxDivergence = maxPd - baselinePd;

    const prcD = mmToD(maxConvergence);
    const nrcD = mmToD(maxDivergence);

    // Break/Recovery 추정 (break ≈ 최대, recovery ≈ break * 0.7)
    const distPRC = `${prcD}/${(prcD * 0.7).toFixed(1)}`;
    const distNRC = `${nrcD}/${(nrcD * 0.7).toFixed(1)}`;
    const nearPRC = `${(prcD * 1.3).toFixed(1)}/${(prcD * 0.9).toFixed(1)}`;
    const nearNRC = `${(nrcD * 0.8).toFixed(1)}/${(nrcD * 0.5).toFixed(1)}`;

    // --- 조절 (Accommodation) ---
    const viewingDistFactor = VIEWING_DISTANCE_CM * 0.1;
    const nearPRA = parseFloat((maxConvergence * 0.4 / viewingDistFactor).toFixed(2));
    const nearNRA = parseFloat((maxDivergence * 0.3 / viewingDistFactor).toFixed(2));

    // --- AC/A Ratio ---
    const accom = 100 / VIEWING_DISTANCE_CM; // 50cm에서 2D
    const acA = parseFloat((Math.abs(nearPhoria - distPhoria) / accom + BASELINE_PD_MM / 10).toFixed(1));

    // --- NPC (근거리폭주근점) ---
    const convergenceRatio = minPd > 0 ? baselinePd / minPd : 1;
    const npc = parseFloat((VIEWING_DISTANCE_CM / convergenceRatio).toFixed(1));

    // --- 최대조절력 ---
    const maxAccom = parseFloat((prcD / Math.max(acA, 1)).toFixed(1));

    return {
        distPhoria, distPRC, distNRC,
        nearPhoria, nearPRC, nearNRC,
        nearPRA, nearNRA,
        acA, npc, maxAccom,
    };
};
