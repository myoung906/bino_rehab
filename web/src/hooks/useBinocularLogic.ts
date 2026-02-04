'use client';

import { useAnalysisStore } from './useAnalysisStore';
import { useCallback, useRef, useEffect } from 'react';
import { TrackingData } from '@/components/VideoAnalyzer';

// Constants
const SMOOTHING_FACTOR = 0.3;
const VELOCITY_THRESHOLD_MM = 1.0;
const PIXEL_TO_MM = 0.45;

// Assumed viewing distance for prism diopter calculations
const VIEWING_DISTANCE_CM = 50;
// Average adult PD (mm) for baseline reference
const BASELINE_PD_MM = 63;

interface AnalysisSample {
    t: number;
    pdMm: number;
    velocityMmS: number;
    symmetry: number;
    leftX: number;
    rightX: number;
}

export const useBinocularLogic = () => {
    const { setVelocity, setSymmetry, addHistory, isRecording, setClinical } = useAnalysisStore();

    const prevRef = useRef<{
        t: number;
        leftX: number;
        rightX: number;
        pdMm: number;
        smoothLeftX: number;
        smoothRightX: number;
    } | null>(null);

    // Collect samples during recording
    const samplesRef = useRef<AnalysisSample[]>([]);
    const baselinePdRef = useRef<number | null>(null);
    const wasRecordingRef = useRef(false);

    // Detect recording stop → compute clinical metrics
    useEffect(() => {
        if (wasRecordingRef.current && !isRecording) {
            computeClinicalMetrics();
        }
        wasRecordingRef.current = isRecording;
        if (isRecording) {
            samplesRef.current = [];
            baselinePdRef.current = null;
        }
    }, [isRecording]);

    const computeClinicalMetrics = useCallback(() => {
        const samples = samplesRef.current;
        if (samples.length < 10) {
            setClinical({
                distPhoria: null, distPRC: null, distNRC: null,
                nearPhoria: null, nearPRC: null, nearNRC: null,
                nearPRA: null, nearNRA: null,
                acA: null, npc: null, maxAccom: null,
            });
            return;
        }

        const pds = samples.map(s => s.pdMm);
        const velocities = samples.map(s => s.velocityMmS);

        // Baseline PD: average of first 30 samples (resting position)
        const baselineCount = Math.min(30, Math.floor(samples.length * 0.1));
        const baselinePd = pds.slice(0, baselineCount).reduce((a, b) => a + b, 0) / baselineCount;

        const avgPd = pds.reduce((a, b) => a + b, 0) / pds.length;
        const minPd = Math.min(...pds);
        const maxPd = Math.max(...pds);

        // PD deviation from baseline (mm) → Prism Diopters (Δ)
        // 1 Δ = 1cm deflection at 1m = 0.5cm at 50cm
        // Δ = deviation_mm / (viewing_distance_cm * 0.1)
        const mmToD = (mm: number) => parseFloat((mm / (VIEWING_DISTANCE_CM * 0.1)).toFixed(1));

        // --- Phoria (사위) ---
        // Deviation of average PD from baseline resting PD
        const pdDeviation = avgPd - baselinePd;
        const distPhoria = mmToD(pdDeviation);
        const nearPhoria = mmToD(pdDeviation * 1.5); // Near phoria typically larger

        // --- Convergence range ---
        // PRC (양성상대폭주): max convergence = baseline - minPD
        const maxConvergence = baselinePd - minPd;
        // NRC (음성상대폭주): max divergence = maxPD - baseline
        const maxDivergence = maxPd - baselinePd;

        const prcD = mmToD(maxConvergence);
        const nrcD = mmToD(maxDivergence);

        // Break/Recovery estimation (break ≈ max, recovery ≈ 70% of max)
        const distPRC = `${prcD}/${(prcD * 0.7).toFixed(1)}`;
        const distNRC = `${nrcD}/${(nrcD * 0.7).toFixed(1)}`;
        const nearPRC = `${(prcD * 1.3).toFixed(1)}/${(prcD * 0.9).toFixed(1)}`;
        const nearNRC = `${(nrcD * 0.8).toFixed(1)}/${(nrcD * 0.5).toFixed(1)}`;

        // --- Accommodation (조절) ---
        // Estimated from convergence-accommodation coupling
        const nearPRA = parseFloat((maxConvergence * 0.4 / (VIEWING_DISTANCE_CM * 0.1)).toFixed(2));
        const nearNRA = parseFloat((maxDivergence * 0.3 / (VIEWING_DISTANCE_CM * 0.1)).toFixed(2));

        // --- AC/A Ratio ---
        // Calculated AC/A = (near phoria - dist phoria + interp PD) / accommodation
        const accom = 100 / VIEWING_DISTANCE_CM; // 2D at 50cm
        const acA = parseFloat((Math.abs(nearPhoria - distPhoria) / accom + BASELINE_PD_MM / 10).toFixed(1));

        // --- NPC (근거리폭주근점) ---
        // Estimated from minimum PD: smaller PD = stronger convergence = closer NPC
        // NPC (cm) ≈ (baseline_PD / max_convergence_PD) * viewing_distance
        const convergenceRatio = minPd > 0 ? baselinePd / minPd : 1;
        const npc = parseFloat((VIEWING_DISTANCE_CM / convergenceRatio).toFixed(1));

        // --- Max Accommodation (최대조절력) ---
        // Estimated: younger adults ~10D, decreases with age
        // From convergence data: max_accom ≈ max_convergence_Δ / AC/A
        const maxAccom = parseFloat((prcD / Math.max(acA, 1)).toFixed(1));

        setClinical({
            distPhoria,
            distPRC,
            distNRC,
            nearPhoria,
            nearPRC,
            nearNRC,
            nearPRA,
            nearNRA,
            acA,
            npc,
            maxAccom,
        });
    }, [setClinical]);

    const processFrame = useCallback((data: TrackingData) => {
        const currentT = data.timestamp;

        const rawLeftX = data.leftIris.x * data.videoWidth;
        const rawRightX = data.rightIris.x * data.videoWidth;

        let smoothLeftX = rawLeftX;
        let smoothRightX = rawRightX;

        if (prevRef.current) {
            smoothLeftX = prevRef.current.smoothLeftX + SMOOTHING_FACTOR * (rawLeftX - prevRef.current.smoothLeftX);
            smoothRightX = prevRef.current.smoothRightX + SMOOTHING_FACTOR * (rawRightX - prevRef.current.smoothRightX);
        }

        const currentPDMm = Math.abs(smoothLeftX - smoothRightX) * PIXEL_TO_MM;

        let velocityMmPerSec = 0;
        let symmetryScore = 0;

        if (prevRef.current) {
            const dt = (currentT - prevRef.current.t) / 1000;
            if (dt > 0) {
                const dPD = currentPDMm - prevRef.current.pdMm;
                velocityMmPerSec = dPD / dt;

                const dLeft = (smoothLeftX - prevRef.current.smoothLeftX) * PIXEL_TO_MM / dt;
                const dRight = (smoothRightX - prevRef.current.smoothRightX) * PIXEL_TO_MM / dt;

                const speedLeft = Math.abs(dLeft);
                const speedRight = Math.abs(dRight);
                const totalSpeed = speedLeft + speedRight;

                if (totalSpeed > VELOCITY_THRESHOLD_MM) {
                    const diff = Math.abs(speedLeft - speedRight);
                    symmetryScore = (1 - (diff / totalSpeed)) * 100;
                } else {
                    symmetryScore = 100;
                }
            }
        }

        setVelocity(Math.abs(velocityMmPerSec));
        setSymmetry(Math.round(symmetryScore));
        addHistory(currentT, velocityMmPerSec);

        // Collect samples during recording
        if (isRecording) {
            if (baselinePdRef.current === null) {
                baselinePdRef.current = currentPDMm;
            }
            samplesRef.current.push({
                t: currentT,
                pdMm: currentPDMm,
                velocityMmS: Math.abs(velocityMmPerSec),
                symmetry: Math.round(symmetryScore),
                leftX: smoothLeftX,
                rightX: smoothRightX,
            });
        }

        prevRef.current = {
            t: currentT,
            leftX: rawLeftX,
            rightX: rawRightX,
            pdMm: currentPDMm,
            smoothLeftX,
            smoothRightX
        };

    }, [isRecording, setVelocity, setSymmetry, addHistory]);

    return { processFrame };
};
