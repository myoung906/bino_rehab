'use client';

import { useAnalysisStore } from './useAnalysisStore';
import { useCallback, useRef, useEffect } from 'react';
import { TrackingData } from '@/components/VideoAnalyzer';
import { computeClinicalMetrics, AnalysisSample } from '@/utils/clinicalCalculations';

// 지수 이동 평균 스무딩 계수
const SMOOTHING_FACTOR = 0.3;
// 대칭성 100%로 처리하는 최소 속도 임계값 (mm/s)
const VELOCITY_THRESHOLD_MM = 1.0;
// 인간 홍채 수평 지름 (인종 불문 상수)
const IRIS_REAL_MM = 11.7;
// 웹캠 기본 FOV (degree)
const DEFAULT_FOV_DEG = 60;

export const useBinocularLogic = () => {
    const updateFrame = useAnalysisStore((s) => s.updateFrame);
    const isRecording = useAnalysisStore((s) => s.isRecording);
    const setClinical = useAnalysisStore((s) => s.setClinical);
    const setCalibration = useAnalysisStore((s) => s.setCalibration);
    const userAge = useAnalysisStore((s) => s.userAge);

    // isRecording을 ref로 관리 — processFrame의 의존성 배열에서 제거하여 콜백 identity 안정화
    const isRecordingRef = useRef(isRecording);
    useEffect(() => { isRecordingRef.current = isRecording; }, [isRecording]);

    const userAgeRef = useRef(userAge);
    useEffect(() => { userAgeRef.current = userAge; }, [userAge]);

    const prevRef = useRef<{
        t: number;
        leftX: number;
        rightX: number;
        pdMm: number;
        smoothLeftX: number;
        smoothRightX: number;
    } | null>(null);

    // 자동 보정 상태
    const calibRef = useRef({
        pixelToMm: 0,
        distanceCm: 0,
        ipdMm: 0,
    });

    // 녹화 중 수집한 샘플 버퍼
    const samplesRef = useRef<AnalysisSample[]>([]);
    const baselinePdRef = useRef<number | null>(null);
    const wasRecordingRef = useRef(false);
    // 히스토리 업데이트 쓰로틀링용 카운터 (3프레임마다 1회 갱신 ≈ 10fps)
    const frameCountRef = useRef(0);
    // 보정 정보 store 갱신 쓰로틀링 (30프레임마다)
    const calibUpdateCountRef = useRef(0);

    // 녹화 종료 감지 → 임상 지표 계산
    useEffect(() => {
        if (wasRecordingRef.current && !isRecording) {
            const metrics = computeClinicalMetrics(samplesRef.current, userAgeRef.current);
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

        // --- 자동 보정 (iris 기반 pixel → mm) ---
        const avgIrisWidthPx = (data.leftIrisWidth + data.rightIrisWidth) / 2;
        if (avgIrisWidthPx > 5) {
            const rawPixelToMm = IRIS_REAL_MM / avgIrisWidthPx;
            calibRef.current.pixelToMm = calibRef.current.pixelToMm === 0
                ? rawPixelToMm
                : calibRef.current.pixelToMm * 0.95 + rawPixelToMm * 0.05;

            // 거리 추정: 개선된 homography 기반 방식
            // 웹캠 초점거리 추정 (일반적인 웹캠: 3-4mm)
            // FOV 60° 기준: focalLength ≈ videoWidth / 2 / tan(30°) ≈ 0.866 * videoWidth
            const focalLengthPx = (data.videoWidth / 2) / Math.tan((DEFAULT_FOV_DEG / 2) * Math.PI / 180);

            // 개선: 홍채 실제 크기(11.7mm)와 화면상 크기(픽셀)의 비율로 거리 계산
            // 더 정확한 핀홀 카메라 모델: distance = focal_length × real_size / pixel_size
            // 단위: 홍채는 mm, focal_length는 px, 결과는 cm
            const distanceCm = (focalLengthPx * IRIS_REAL_MM) / avgIrisWidthPx / 10;

            // 거리 범위 제한 (30cm ~ 300cm 사이로 클램프)
            const clampedDistanceCm = Math.max(30, Math.min(300, distanceCm));

            calibRef.current.distanceCm = calibRef.current.distanceCm === 0
                ? clampedDistanceCm
                : calibRef.current.distanceCm * 0.92 + clampedDistanceCm * 0.08;
        }

        const pixelToMm = calibRef.current.pixelToMm || 0.45; // fallback

        // 지수 이동 평균으로 노이즈 제거
        let smoothLeftX = rawLeftX;
        let smoothRightX = rawRightX;

        if (prevRef.current) {
            smoothLeftX = prevRef.current.smoothLeftX + SMOOTHING_FACTOR * (rawLeftX - prevRef.current.smoothLeftX);
            smoothRightX = prevRef.current.smoothRightX + SMOOTHING_FACTOR * (rawRightX - prevRef.current.smoothRightX);
        }

        const currentPDMm = Math.abs(smoothLeftX - smoothRightX) * pixelToMm;

        // IPD 자동 측정 (매우 느린 EMA)
        calibRef.current.ipdMm = calibRef.current.ipdMm === 0
            ? currentPDMm
            : calibRef.current.ipdMm * 0.97 + currentPDMm * 0.03;

        let velocityMmPerSec = 0;
        let symmetryScore = 0;

        if (prevRef.current) {
            const dt = (currentT - prevRef.current.t) / 1000;
            if (dt > 0 && !isNaN(dt)) {
                const dPD = currentPDMm - prevRef.current.pdMm;
                velocityMmPerSec = dPD / dt;

                const dLeft = (smoothLeftX - prevRef.current.smoothLeftX) * pixelToMm / dt;
                const dRight = (smoothRightX - prevRef.current.smoothRightX) * pixelToMm / dt;

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

        // 보정 정보를 30프레임마다 store에 갱신
        calibUpdateCountRef.current++;
        if (calibUpdateCountRef.current % 30 === 0 && calibRef.current.pixelToMm > 0) {
            setCalibration({
                pixelToMm: calibRef.current.pixelToMm,
                distanceCm: calibRef.current.distanceCm,
                ipdMm: calibRef.current.ipdMm,
            });
        }

        // 동공 크기 proxy
        const pupilProxy = ((data.leftPupilRadius || 0) + (data.rightPupilRadius || 0)) / 2;

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
                pupilProxy,
                pixelToMm,
                distanceCm: calibRef.current.distanceCm || 50,
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

    }, [updateFrame, setCalibration]); // isRecording 제거 — ref로 읽어 콜백 identity 유지

    return { processFrame };
};
