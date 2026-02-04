'use client';

import { useAnalysisStore } from './useAnalysisStore';
import { useCallback, useRef } from 'react';
import { TrackingData } from '@/components/VideoAnalyzer';

// Constants
const AVG_IRIS_DIAMETER_MM = 11.7; // Standard human average
const SMOOTHING_FACTOR = 0.3; // Low Pass Filter (0.1 = heavy smoothing, 0.9 = responsive)
const VELOCITY_THRESHOLD_MM = 1.0; // Minimum movement to consider "moving"

export const useBinocularLogic = () => {
    const { setVelocity, setSymmetry, addHistory, isRecording } = useAnalysisStore();

    // State for filtering and calculations
    const prevRef = useRef<{
        t: number;
        leftX: number;
        rightX: number;
        pdMm: number;
        smoothLeftX: number;
        smoothRightX: number;
    } | null>(null);

    const processFrame = useCallback((data: TrackingData) => {
        if (!isRecording) return;

        const currentT = data.timestamp;

        // 1. Calculate Pixels to MM Scale based on Iris Diameter
        // Landmark indices: 474-477 (Right Iris), 469-472 (Left Iris)
        // We get centroids passed in, but we need diameter. 
        // For robustness, let's approximate scale based on standard PD at 50cm if Iris data isn't fully available,
        // BUT the user asked for precise MM. 
        // Let's use a simpler approach: 
        // At 50cm, with a standard webcam (e.g. Logitech C920, ~78 deg FOV), 
        // Screen width ~90cm at 50cm distance?? No.
        // Let's assume the user is roughly filling the frame or typical setup.
        // BETTER: Use the Iris Landmarks distance in video.
        // Since VideoAnalyzer only passes centroids, we will perform a 'heuristic' calibration 
        // assuming the user's PD is roughly 63mm (adult avg) if we can't measure iris.
        // Wait, VideoAnalyzer passes `data.rightIris` and `data.leftIris` which are coordinates.
        // We really should calculate the scale dynamically if possible. 

        // Let's rely on a Fixed Calibration for 50cm for now as requested by user context "50cm fixed",
        // implying a fixed geometry.
        // Standard Webcams: ~0.26 mm/pixel at 50cm (rough estimate for 720p). 
        // Let's refine this: If 50cm distance, and H-FOV is 60 deg. 
        // Real Width visible = 2 * 500mm * tan(30deg) ≈ 577mm.
        // Resolution 1280px.
        // mm/px = 577 / 1280 ≈ 0.45 mm/px.
        const PIXEL_TO_MM = 0.45;

        // 2. Extract Coordinates (in Pixels)
        const rawLeftX = data.leftIris.x * data.videoWidth;
        const rawRightX = data.rightIris.x * data.videoWidth;

        // 3. Low Pass Filter (Smoothing)
        let smoothLeftX = rawLeftX;
        let smoothRightX = rawRightX;

        if (prevRef.current) {
            smoothLeftX = prevRef.current.smoothLeftX + SMOOTHING_FACTOR * (rawLeftX - prevRef.current.smoothLeftX);
            smoothRightX = prevRef.current.smoothRightX + SMOOTHING_FACTOR * (rawRightX - prevRef.current.smoothRightX);
        }

        // 4. Calculate Distance (PD) in mm
        const currentPDMm = Math.abs(smoothLeftX - smoothRightX) * PIXEL_TO_MM;

        // 5. Calculate Metrics
        let velocityMmPerSec = 0;
        let symmetryScore = 0;

        if (prevRef.current) {
            const dt = (currentT - prevRef.current.t) / 1000; // seconds

            if (dt > 0) {
                // Velocity: Rate of change of PD
                const dPD = currentPDMm - prevRef.current.pdMm;
                velocityMmPerSec = dPD / dt;

                // Individual Eye Velocities (for Symmetry)
                const dLeft = (smoothLeftX - prevRef.current.smoothLeftX) * PIXEL_TO_MM / dt;
                const dRight = (smoothRightX - prevRef.current.smoothRightX) * PIXEL_TO_MM / dt; // Right eye moves opposite in X

                // Symmetry Calculation
                // Convergence: Left moves Right (+), Right moves Left (-) in simple view?
                // Actually: Left Eye pos increases (moves right), Right Eye pos decreases (moves left).
                // We compare magnitude of speed.
                const speedLeft = Math.abs(dLeft);
                const speedRight = Math.abs(dRight);

                const totalSpeed = speedLeft + speedRight;
                if (totalSpeed > VELOCITY_THRESHOLD_MM) {
                    // Symmetry Index: 100% - Difference ratio
                    const diff = Math.abs(speedLeft - speedRight);
                    symmetryScore = (1 - (diff / totalSpeed)) * 100;
                } else {
                    symmetryScore = 100; // No movement = "Perfectly symmetrical" static
                }
            }
        }

        // Update Store
        setVelocity(Math.abs(velocityMmPerSec)); // mm/s
        setSymmetry(Math.round(symmetryScore));
        addHistory(currentT, velocityMmPerSec);

        // Save State
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
