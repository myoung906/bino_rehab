'use client';

import { useAnalysisStore } from './useAnalysisStore';
import { useCallback, useRef, useEffect } from 'react';
import { TrackingData } from '@/components/VideoAnalyzer';
import { computeClinicalMetrics, AnalysisSample } from '@/utils/clinicalCalculations';

// 지수 이동 평균 스무딩 계수
const SMOOTHING_FACTOR = 0.3;
// 대칭성 100%로 처리하는 최소 속도 임계값 (mm/s)
const VELOCITY_THRESHOLD_MM = 1.0;
// 픽셀 → mm 변환 계수
const PIXEL_TO_MM = 0.45;

export const useBinocularLogic = () => {
    const { updateFrame, isRecording, setClinical } = useAnalysisStore();

    // isRecording을 ref로 관리 — processFrame의 의존성 배열에서 제거하여 콜백 identity 안정화
    // (isRecording이 deps에 있으면 녹화 토글 시 processFrame → runLoop 재생성됨)
    const isRecordingRef = useRef(isRecording);
    useEffect(() => { isRecordingRef.current = isRecording; }, [isRecording]);

    const prevRef = useRef<{
        t: number;
        leftX: number;
        rightX: number;
        pdMm: number;
        smoothLeftX: number;
        smoothRightX: number;
    } | null>(null);

    // 녹화 중 수집한 샘플 버퍼
    const samplesRef = useRef<AnalysisSample[]>([]);
    const baselinePdRef = useRef<number | null>(null);
    const wasRecordingRef = useRef(false);
    // 히스토리 업데이트 쓰로틀링용 카운터 (3프레임마다 1회 갱신 ≈ 10fps)
    const frameCountRef = useRef(0);

    // 녹화 종료 감지 → 임상 지표 계산
    useEffect(() => {
        if (wasRecordingRef.current && !isRecording) {
            const metrics = computeClinicalMetrics(samplesRef.current);
            setClinical(metrics);
        }
        wasRecordingRef.current = isRecording;
        if (isRecording) {
            samplesRef.current = [];
            baselinePdRef.current = null;
        }
    }, [isRecording, setClinical]);

    const processFrame = useCallback((data: TrackingData) => {
        const currentT = data.timestamp;

        const rawLeftX = data.leftIris.x * data.videoWidth;
        const rawRightX = data.rightIris.x * data.videoWidth;

        // 지수 이동 평균으로 노이즈 제거
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
            if (dt > 0 && !isNaN(dt)) {
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

        // 히스토리는 3프레임마다 갱신 — 차트 리렌더 빈도를 ~30fps → ~10fps로 절감
        frameCountRef.current = (frameCountRef.current + 1) % 900;
        const addToHistory = frameCountRef.current % 3 === 0;

        // velocity, symmetry, history를 단일 set()으로 배치 업데이트 (기존 3회 → 1회)
        updateFrame(Math.abs(velocityMmPerSec), Math.round(symmetryScore), currentT, velocityMmPerSec, addToHistory);

        // isRecordingRef로 읽어 콜백 재생성 없이 현재 녹화 상태 확인
        if (isRecordingRef.current) {
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
            smoothRightX,
        };

    }, [updateFrame]); // isRecording 제거 — ref로 읽어 콜백 identity 유지

    return { processFrame };
};
