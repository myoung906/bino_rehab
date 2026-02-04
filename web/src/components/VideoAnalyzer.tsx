'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Webcam from 'react-webcam';
import { Camera, RefreshCw } from 'lucide-react';
import { FaceLandmarker, FilesetResolver, DrawingUtils } from "@mediapipe/tasks-vision";
import clsx from 'clsx';

// Helper to get centroid
const getCentroid = (landmarks: any[], indices: number[]) => {
  let x = 0, y = 0, z = 0;
  indices.forEach(idx => {
    x += landmarks[idx].x;
    y += landmarks[idx].y;
    z += landmarks[idx].z;
  });
  return { x: x / indices.length, y: y / indices.length, z: z / indices.length };
};

export interface TrackingData {
  timestamp: number;
  rightIris: { x: number; y: number; z: number };
  leftIris: { x: number; y: number; z: number };
  videoWidth: number;
  videoHeight: number;
}

interface VideoAnalyzerProps {
  onFrame?: (data: TrackingData) => void;
  showOverlay?: boolean;
}

const VideoAnalyzer = ({ onFrame, showOverlay = true }: VideoAnalyzerProps) => {
  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isReady, setIsReady] = useState(false);
  const [deviceId, setDeviceId] = useState<string>('');
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const lastVideoTimeRef = useRef<number>(-1);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Initialize MediaPipe
  useEffect(() => {
    let ignore = false;
    const initMediaPipe = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm"
        );

        if (ignore) return;

        const landmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
            delegate: "GPU"
          },
          outputFaceBlendshapes: true,
          runningMode: "VIDEO",
          numFaces: 1
        });

        if (ignore) {
          landmarker.close();
          return;
        }

        faceLandmarkerRef.current = landmarker;
        console.log("FaceLandmarker loaded");
        setIsReady(true);
      } catch (error: any) {
        if (!ignore) {
          console.error("Failed to load MediaPipe:", error);
          setErrorMsg(error.message || "Failed to load AI Model. Check connection/GPU.");
        }
      }
    };

    initMediaPipe();

    return () => {
      ignore = true;
      if (faceLandmarkerRef.current) {
        faceLandmarkerRef.current.close();
        faceLandmarkerRef.current = null;
      }
    };
  }, []);

  // Handle Devices
  const handleDevices = useCallback((mediaDevices: MediaDeviceInfo[]) => {
    const videoDevices = mediaDevices.filter(({ kind }) => kind === "videoinput");
    setDevices(videoDevices);
    if (videoDevices.length > 0) {
      setDeviceId((prev) => prev || videoDevices[0].deviceId);
    }
  }, []);

  useEffect(() => {
    navigator.mediaDevices.enumerateDevices().then(handleDevices);
  }, [handleDevices]);

  // Main Loop
  const runLoop = useCallback(() => {
    if (
      webcamRef.current &&
      webcamRef.current.video &&
      webcamRef.current.video.readyState === 4 &&
      canvasRef.current &&
      faceLandmarkerRef.current
    ) {
      const video = webcamRef.current.video;
      const videoWidth = video.videoWidth;
      const videoHeight = video.videoHeight;

      canvasRef.current.width = videoWidth;
      canvasRef.current.height = videoHeight;
      const ctx = canvasRef.current.getContext('2d');

      let startTimeMs = performance.now();

      if (video.currentTime !== lastVideoTimeRef.current) {
        lastVideoTimeRef.current = video.currentTime;
        const results = faceLandmarkerRef.current.detectForVideo(video, startTimeMs);

        let trackingData: TrackingData | null = null;

        if (results.faceLandmarks && results.faceLandmarks.length > 0) {
          const landmarks = results.faceLandmarks[0];

          // Calculate Centroids
          const rightIrisIndices = [474, 475, 476, 477];
          const leftIrisIndices = [469, 470, 471, 472];
          const rightIrisCenter = getCentroid(landmarks, rightIrisIndices);
          const leftIrisCenter = getCentroid(landmarks, leftIrisIndices);

          trackingData = {
            timestamp: startTimeMs,
            rightIris: rightIrisCenter,
            leftIris: leftIrisCenter,
            videoWidth,
            videoHeight
          };

          if (ctx && showOverlay) {
            ctx.save();
            ctx.clearRect(0, 0, videoWidth, videoHeight);

            // Mirror Context
            ctx.translate(videoWidth, 0);
            ctx.scale(-1, 1);

            const drawingUtils = new DrawingUtils(ctx);

            // Draw Face Bounding Box
            let minX = 1, minY = 1, maxX = 0, maxY = 0;
            landmarks.forEach(lm => {
              if (lm.x < minX) minX = lm.x;
              if (lm.y < minY) minY = lm.y;
              if (lm.x > maxX) maxX = lm.x;
              if (lm.y > maxY) maxY = lm.y;
            });
            ctx.strokeStyle = '#22c55e'; // Green
            ctx.lineWidth = 3;
            ctx.strokeRect(minX * videoWidth, minY * videoHeight, (maxX - minX) * videoWidth, (maxY - minY) * videoHeight);

            // Draw Crosshairs
            ctx.fillStyle = '#06b6d4';
            ctx.beginPath();
            ctx.arc(rightIrisCenter.x * videoWidth, rightIrisCenter.y * videoHeight, 5, 0, 2 * Math.PI);
            ctx.fill();

            ctx.fillStyle = '#8b5cf6';
            ctx.beginPath();
            ctx.arc(leftIrisCenter.x * videoWidth, leftIrisCenter.y * videoHeight, 5, 0, 2 * Math.PI);
            ctx.fill();

            // Connectors
            drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_RIGHT_IRIS, { color: "rgba(6,182,212,0.5)", lineWidth: 1 });
            drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_LEFT_IRIS, { color: "rgba(139,92,246,0.5)", lineWidth: 1 });

            ctx.restore();
          }
        } else if (ctx && showOverlay) {
          ctx.clearRect(0, 0, videoWidth, videoHeight);
        }

        // Emit data
        if (onFrame && trackingData) {
          onFrame(trackingData);
        }
      }
    }
    requestAnimationFrame(runLoop);
  }, [onFrame, showOverlay]);

  useEffect(() => {
    const animationId = requestAnimationFrame(runLoop);
    return () => cancelAnimationFrame(animationId);
  }, [runLoop]);

  return (
    <div className="relative w-full h-full rounded-2xl overflow-hidden glass-panel shadow-2xl border border-slate-700 flex items-center justify-center bg-black">
      {!isReady && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 z-10 gap-4">
          {errorMsg ? (
            <>
              <div className="text-red-500 font-bold">Error Loading AI</div>
              <div className="text-red-400 text-xs px-4 text-center max-w-sm">{errorMsg}</div>
              <button onClick={() => window.location.reload()} className="mt-4 px-4 py-2 bg-slate-800 text-white rounded hover:bg-slate-700 transition">Retry</button>
            </>
          ) : (
            <>
              <RefreshCw className="w-10 h-10 text-cyan-500 animate-spin" />
              <p className="text-cyan-400 font-mono text-sm">Loading AI Models... (GPU)</p>
            </>
          )}
        </div>
      )}
      <div className="relative w-full h-full flex items-center justify-center">
        <Webcam ref={webcamRef} audio={false} className="absolute max-w-full max-h-full object-contain" style={{ width: 'auto', height: 'auto' }} videoConstraints={{ deviceId: deviceId, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 60, min: 30 } }} screenshotFormat="image/jpeg" mirrored={true} />
        <canvas ref={canvasRef} className="absolute max-w-full max-h-full object-contain" style={{ width: 'auto', height: 'auto' }} />
      </div>
      <div className="absolute bottom-4 left-4 right-4 flex justify-between items-center glass-panel p-3 rounded-xl z-20">
        <div className="flex items-center gap-2">
          <Camera className="w-5 h-5 text-cyan-400" />
          <select className="bg-transparent text-sm text-slate-200 focus:outline-none cursor-pointer max-w-[150px] truncate" value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
            {devices.map((device, key) => (<option key={key} value={device.deviceId} className="bg-slate-800">{device.label || `Camera ${key + 1}`}</option>))}
          </select>
        </div>
        <div className="flex gap-2 items-center">
          <div className={clsx("w-3 h-3 rounded-full transition-colors", isReady ? "bg-green-500 animate-pulse" : "bg-yellow-500")} title="System Status"></div>
          <span className="text-xs text-slate-400">{isReady ? "Ready (30-60fps)" : "Initializing"}</span>
        </div>
      </div>
    </div>
  );
};

export default VideoAnalyzer;
