import { ClinicalMetrics } from '@/hooks/useAnalysisStore';

export interface AnalysisSample {
    t: number;
    pdMm: number;
    velocityMmS: number;
    symmetry: number;
    leftX: number;
    rightX: number;
    pupilProxy: number;      // iris 면적 proxy (동공 크기 간접 지표)
    pixelToMm: number;       // 해당 프레임의 보정 계수
    distanceCm: number;      // 해당 프레임의 거리 추정값
}

// --- 유틸 ---

const mean = (arr: number[]): number =>
    arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length;

const round1 = (v: number): number => parseFloat(v.toFixed(1));

// --- Break/Recovery 감지 ---

interface BreakRecovery {
    convergenceBreakPd: number | null;   // PRC break (Δ)
    convergenceRecoveryPd: number | null;
    divergenceBreakPd: number | null;    // NRC break (Δ)
    divergenceRecoveryPd: number | null;
}

/**
 * 녹화 데이터에서 convergence/divergence break 및 recovery 자동 추출.
 * velocity 부호 반전 + magnitude threshold로 break 감지.
 */
function findBreakRecovery(
    samples: AnalysisSample[],
    baselinePd: number,
    avgDistanceCm: number,
): BreakRecovery {
    const result: BreakRecovery = {
        convergenceBreakPd: null,
        convergenceRecoveryPd: null,
        divergenceBreakPd: null,
        divergenceRecoveryPd: null,
    };

    if (samples.length < 20) return result;

    const mmToD = (mm: number) => mm / (avgDistanceCm * 0.1);
    const WINDOW = 5;
    const VELOCITY_BREAK_THRESHOLD = 2; // mm/s — 급반전 감지

    // sliding window velocity 계산
    const windowedVelocities: number[] = [];
    for (let i = 0; i < samples.length; i++) {
        if (i < WINDOW) {
            windowedVelocities.push(samples[i].velocityMmS);
        } else {
            const dt = (samples[i].t - samples[i - WINDOW].t) / 1000;
            if (dt > 0) {
                windowedVelocities.push((samples[i].pdMm - samples[i - WINDOW].pdMm) / dt);
            } else {
                windowedVelocities.push(0);
            }
        }
    }

    // convergence break: PD가 감소하다가 급반전 (velocity < 0 → velocity > threshold)
    let maxConvergenceDeviation = 0;
    let convergenceBreakIdx = -1;
    // divergence break: PD가 증가하다가 급반전 (velocity > 0 → velocity < -threshold)
    let maxDivergenceDeviation = 0;
    let divergenceBreakIdx = -1;

    for (let i = WINDOW + 1; i < windowedVelocities.length; i++) {
        const prev = windowedVelocities[i - 1];
        const curr = windowedVelocities[i];
        const pdDev = samples[i].pdMm - baselinePd;

        // convergence phase → break (PD 감소 → 반전)
        if (prev < -0.5 && curr > VELOCITY_BREAK_THRESHOLD) {
            const deviation = Math.abs(pdDev);
            if (deviation > maxConvergenceDeviation) {
                maxConvergenceDeviation = deviation;
                convergenceBreakIdx = i;
            }
        }

        // divergence phase → break (PD 증가 → 반전)
        if (prev > 0.5 && curr < -VELOCITY_BREAK_THRESHOLD) {
            const deviation = Math.abs(pdDev);
            if (deviation > maxDivergenceDeviation) {
                maxDivergenceDeviation = deviation;
                divergenceBreakIdx = i;
            }
        }
    }

    // convergence break → recovery
    if (convergenceBreakIdx >= 0) {
        const breakPdDev = Math.abs(samples[convergenceBreakIdx].pdMm - baselinePd);
        result.convergenceBreakPd = round1(mmToD(breakPdDev));

        // recovery: break 이후 baseline ± 1mm 이내 안정
        for (let i = convergenceBreakIdx + 1; i < samples.length; i++) {
            if (Math.abs(samples[i].pdMm - baselinePd) < 1.0) {
                const recoveryDev = Math.abs(samples[i].pdMm - baselinePd);
                result.convergenceRecoveryPd = round1(mmToD(recoveryDev));
                break;
            }
        }
    }

    // divergence break → recovery
    if (divergenceBreakIdx >= 0) {
        const breakPdDev = Math.abs(samples[divergenceBreakIdx].pdMm - baselinePd);
        result.divergenceBreakPd = round1(mmToD(breakPdDev));

        for (let i = divergenceBreakIdx + 1; i < samples.length; i++) {
            if (Math.abs(samples[i].pdMm - baselinePd) < 1.0) {
                const recoveryDev = Math.abs(samples[i].pdMm - baselinePd);
                result.divergenceRecoveryPd = round1(mmToD(recoveryDev));
                break;
            }
        }
    }

    // fallback: break 미감지 시 min/max PD 편차 사용
    if (result.convergenceBreakPd === null) {
        const minPd = samples.reduce((m, s) => s.pdMm < m ? s.pdMm : m, samples[0].pdMm);
        const dev = baselinePd - minPd;
        if (dev > 0.5) {
            result.convergenceBreakPd = round1(mmToD(dev));
            result.convergenceRecoveryPd = round1(mmToD(dev * 0.7));
        }
    }
    if (result.divergenceBreakPd === null) {
        const maxPd = samples.reduce((m, s) => s.pdMm > m ? s.pdMm : m, samples[0].pdMm);
        const dev = maxPd - baselinePd;
        if (dev > 0.5) {
            result.divergenceBreakPd = round1(mmToD(dev));
            result.divergenceRecoveryPd = round1(mmToD(dev * 0.7));
        }
    }

    return result;
}

// --- 동공 기반 PRA/NRA 추정 ---

function estimateAccommodationFromPupil(samples: AnalysisSample[]): {
    pra: number | null;
    nra: number | null;
} {
    const proxies = samples.map(s => s.pupilProxy).filter(p => p > 0);
    if (proxies.length < 10) return { pra: null, nra: null };

    // baseline: 처음 10% 평균
    const baseCount = Math.max(5, Math.floor(proxies.length * 0.1));
    const baselineProxy = mean(proxies.slice(0, baseCount));
    if (baselineProxy <= 0) return { pra: null, nra: null };

    const minProxy = proxies.reduce((m, v) => v < m ? v : m, proxies[0]);
    const maxProxy = proxies.reduce((m, v) => v > m ? v : m, proxies[0]);

    // 동공-조절 관계: 동공 직경 1mm 변화 ≈ 2-3D 조절 변화
    // iris proxy 비율로 환산: ΔD ≈ 2.5 × (Δproxy / baselineProxy)
    const K = 2.5;

    // 최대 수축 → 최대 조절 (PRA, minus lens 상당, 음수)
    const contractionRatio = (baselineProxy - minProxy) / baselineProxy;
    const pra = contractionRatio > 0.01 ? -round1(K * contractionRatio) : null;

    // 최대 이완 → 최소 조절 (NRA, plus lens 상당, 양수)
    const dilationRatio = (maxProxy - baselineProxy) / baselineProxy;
    const nra = dilationRatio > 0.01 ? round1(K * dilationRatio) : null;

    return { pra, nra };
}

// --- 메인 계산 함수 ---

/**
 * mm 편차를 프리즘 디옵터(Δ)로 변환
 */
export const mmToPrismDiopter = (mm: number, viewingDistanceCm: number = 50): number => {
    return parseFloat((mm / (viewingDistanceCm * 0.1)).toFixed(1));
};

/**
 * 원거리 IPD에서 주시거리 IPD로 보정
 * 공식: IPD(주시거리) = IPD(원거리) × ((주시거리-12)/(주시거리+13))
 * 원거리 기준: 6m (600cm) 이상
 */
export const adjustIPDByDistance = (ipdMm: number, viewingDistanceCm: number): number => {
    // 원거리 (600cm+)에서는 그대로 반환
    if (viewingDistanceCm >= 600) {
        return ipdMm;
    }
    // 표준 공식 적용
    const adjusted = ipdMm * ((viewingDistanceCm - 12) / (viewingDistanceCm + 13));
    return parseFloat(adjusted.toFixed(1));
};

/**
 * 분석 샘플 배열로부터 임상 지표를 계산하는 순수 함수
 */
export const computeClinicalMetrics = (
    samples: AnalysisSample[],
    userAge?: number,
): Partial<ClinicalMetrics> => {
    if (samples.length < 10) {
        return {
            distPhoria: null, distPRC: null, distNRC: null,
            nearPhoria: null, nearPRC: null, nearNRC: null,
            nearPRA: null, nearNRA: null,
            acA: null, npc: null, maxAccom: null,
        };
    }

    const avgPixelToMm = mean(samples.map(s => s.pixelToMm));
    const avgDistanceCm = mean(samples.map(s => s.distanceCm));
    // 유효 거리 fallback
    const effectiveDistCm = avgDistanceCm > 10 ? avgDistanceCm : 50;
    const mmToD = (mm: number) => mm / (effectiveDistCm * 0.1);

    // baseline PD (처음 10% 안정 구간)
    const baselineCount = Math.min(30, Math.max(5, Math.floor(samples.length * 0.1)));
    const baselinePd = mean(samples.slice(0, baselineCount).map(s => s.pdMm));

    // --- 사위 (1차: 기존 방식 유지, 2차에서 커버테스트 대체) ---
    const pdDeviation = mean(samples.map(s => s.pdMm)) - baselinePd;
    const distPhoria = round1(mmToD(pdDeviation));
    const nearPhoria = round1(mmToD(pdDeviation * 1.5)); // 2차에서 실측 대체 예정

    // --- PRC / NRC (break point 기반) ---
    const br = findBreakRecovery(samples, baselinePd, effectiveDistCm);
    const distPRC = br.convergenceBreakPd !== null
        ? `${br.convergenceBreakPd}/${br.convergenceRecoveryPd ?? '—'}`
        : null;
    const distNRC = br.divergenceBreakPd !== null
        ? `${br.divergenceBreakPd}/${br.divergenceRecoveryPd ?? '—'}`
        : null;
    // 근거리 PRC/NRC: 1차에서는 원거리 기반 비율 유지 (2차에서 실측)
    const nearPRC = br.convergenceBreakPd !== null
        ? `${round1(br.convergenceBreakPd * 1.3)}/${round1((br.convergenceRecoveryPd ?? 0) * 1.3)}`
        : null;
    const nearNRC = br.divergenceBreakPd !== null
        ? `${round1(br.divergenceBreakPd * 0.8)}/${round1((br.divergenceRecoveryPd ?? 0) * 0.8)}`
        : null;

    // --- PRA / NRA (동공 기반 추정) ---
    const accomEst = estimateAccommodationFromPupil(samples);
    const nearPRA = accomEst.pra;
    const nearNRA = accomEst.nra;

    // --- AC/A (Heterophoria method) ---
    const ipdCm = mean(samples.map(s =>
        Math.abs(s.leftX - s.rightX) * (s.pixelToMm > 0 ? s.pixelToMm : avgPixelToMm))) / 10;
    const nearDiopter = 100 / Math.min(effectiveDistCm, 100);
    const acA = round1(ipdCm + nearDiopter * (nearPhoria - distPhoria));

    // --- NPC ---
    const ipdMm = ipdCm * 10;
    const npc = br.convergenceBreakPd !== null
        ? round1(ipdMm / Math.max(br.convergenceBreakPd, 0.1))
        : null;

    // --- 최대조절력 ---
    const maxAccom = userAge !== undefined
        ? round1(18.5 - 0.3 * userAge) // Hofstetter average
        : (accomEst.pra !== null ? round1(Math.abs(accomEst.pra) + (accomEst.nra ?? 0)) : null);

    return {
        distPhoria, distPRC, distNRC,
        nearPhoria, nearPRC, nearNRC,
        nearPRA, nearNRA,
        acA, npc, maxAccom,
    };
};
