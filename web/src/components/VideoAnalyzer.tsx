'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Camera, RefreshCw } from 'lucide-react';
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import clsx from 'clsx';

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
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isReady, setIsReady] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [deviceId, setDeviceId] = useState<string>('');
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const lastVideoTimeRef = useRef<number>(-1);
  const streamRef = useRef<MediaStream | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState('waiting...');
  const frameCountRef = useRef(0);
  const detectCountRef = useRef(0);
  const faceCountRef = useRef(0);

  // Initialize MediaPipe
  useEffect(() => {
    let ignore = false;
    const initMediaPipe = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm"
        );
        if (ignore) return;

        let landmarker: FaceLandmarker;
        try {
          landmarker = await FaceLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
              delegate: "GPU"
            },
            outputFaceBlendshapes: true,
            runningMode: "VIDEO",
            numFaces: 1
          });
        } catch (gpuError) {
          if (ignore) return;
          landmarker = await FaceLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
              delegate: "CPU"
            },
            outputFaceBlendshapes: true,
            runningMode: "VIDEO",
            numFaces: 1
          });
        }

        if (ignore) { landmarker.close(); return; }
        faceLandmarkerRef.current = landmarker;
        setIsReady(true);
        setErrorMsg(null);
      } catch (error: any) {
        if (!ignore) {
          setErrorMsg(error.message || "Failed to load AI Model.");
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

  // Start camera
  const startCamera = useCallback(async (selectedDeviceId?: string) => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      const constraints: MediaStreamConstraints = {
        video: {
          ...(selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : {}),
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
        },
        audio: false,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCameraReady(true);
        setErrorMsg(null);
      }

      const mediaDevices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = mediaDevices.filter(({ kind }) => kind === "videoinput");
      setDevices(videoDevices);
      if (!selectedDeviceId && videoDevices.length > 0) {
        setDeviceId(videoDevices[0].deviceId);
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Camera access failed");
    }
  }, []);

  useEffect(() => {
    startCamera();
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [startCamera]);

  const handleDeviceChange = useCallback((newDeviceId: string) => {
    setDeviceId(newDeviceId);
    startCamera(newDeviceId);
  }, [startCamera]);

  // Main render loop
  const runLoop = useCallback(() => {
    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (!video || !canvas) {
        requestAnimationFrame(runLoop);
        return;
      }

      const readyState = video.readyState;
      const hasModel = !!faceLandmarkerRef.current;
      const vw = video.videoWidth;
      const vh = video.videoHeight;

      // Update debug info every 30 frames
      if (frameCountRef.current % 30 === 0) {
        setDebugInfo(
          `ready:${readyState} model:${hasModel} video:${vw}x${vh} frames:${frameCountRef.current} detects:${detectCountRef.current} faces:${faceCountRef.current}`
        );
      }

      if (readyState >= 2 && vw > 0 && vh > 0) {
        if (canvas.width !== vw || canvas.height !== vh) {
          canvas.width = vw;
          canvas.height = vh;
        }
        const ctx = canvas.getContext('2d');
        if (ctx) {
          // Draw mirrored video
          ctx.save();
          ctx.translate(vw, 0);
          ctx.scale(-1, 1);
          ctx.drawImage(video, 0, 0, vw, vh);
          ctx.restore();

          frameCountRef.current++;

          // Run detection on every frame (currentTime check unreliable for live MediaStream on Safari)
          if (hasModel) {
            try {
              const results = faceLandmarkerRef.current!.detectForVideo(video, performance.now());
              detectCountRef.current++;

              if (results.faceLandmarks && results.faceLandmarks.length > 0) {
                faceCountRef.current++;
                const landmarks = results.faceLandmarks[0];

                const rightIrisIndices = [474, 475, 476, 477];
                const leftIrisIndices = [469, 470, 471, 472];
                const rightIrisCenter = getCentroid(landmarks, rightIrisIndices);
                const leftIrisCenter = getCentroid(landmarks, leftIrisIndices);

                if (showOverlay) {
                  ctx.save();
                  ctx.translate(vw, 0);
                  ctx.scale(-1, 1);

                  // Face bounding box
                  let minX = 1, minY = 1, maxX = 0, maxY = 0;
                  landmarks.forEach(lm => {
                    if (lm.x < minX) minX = lm.x;
                    if (lm.y < minY) minY = lm.y;
                    if (lm.x > maxX) maxX = lm.x;
                    if (lm.y > maxY) maxY = lm.y;
                  });
                  ctx.strokeStyle = '#22c55e';
                  ctx.lineWidth = 3;
                  ctx.strokeRect(minX * vw, minY * vh, (maxX - minX) * vw, (maxY - minY) * vh);

                  // Iris markers
                  ctx.fillStyle = '#06b6d4';
                  ctx.beginPath();
                  ctx.arc(rightIrisCenter.x * vw, rightIrisCenter.y * vh, 5, 0, 2 * Math.PI);
                  ctx.fill();

                  ctx.fillStyle = '#8b5cf6';
                  ctx.beginPath();
                  ctx.arc(leftIrisCenter.x * vw, leftIrisCenter.y * vh, 5, 0, 2 * Math.PI);
                  ctx.fill();

                  // Iris connectors
                  const drawIrisConnector = (indices: number[], color: string) => {
                    ctx.strokeStyle = color;
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    indices.forEach((idx, i) => {
                      const lm = landmarks[idx];
                      if (i === 0) ctx.moveTo(lm.x * vw, lm.y * vh);
                      else ctx.lineTo(lm.x * vw, lm.y * vh);
                    });
                    ctx.closePath();
                    ctx.stroke();
                  };
                  drawIrisConnector(rightIrisIndices, "rgba(6,182,212,0.5)");
                  drawIrisConnector(leftIrisIndices, "rgba(139,92,246,0.5)");

                  ctx.restore();
                }

                if (onFrame) {
                  onFrame({
                    timestamp: performance.now(),
                    rightIris: rightIrisCenter,
                    leftIris: leftIrisCenter,
                    videoWidth: vw,
                    videoHeight: vh
                  });
                }
              }
            } catch (detectError) {
              // Don't let detection errors kill the loop
              if (frameCountRef.current % 60 === 0) {
                console.error("Detection error:", detectError);
              }
            }
          }
        }
      }
    } catch (loopError) {
      console.error("Loop error:", loopError);
    }

    requestAnimationFrame(runLoop);
  }, [onFrame, showOverlay]);

  useEffect(() => {
    const animationId = requestAnimationFrame(runLoop);
    return () => cancelAnimationFrame(animationId);
  }, [runLoop]);

  return (
    <div className="relative w-full h-full rounded-2xl overflow-hidden glass-panel shadow-2xl border border-slate-700 flex items-center justify-center bg-black">
      {(!isReady || !cameraReady || errorMsg) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 z-10 gap-4">
          {errorMsg ? (
            <>
              <div className="text-red-500 font-bold">
                {isReady ? "Camera Error" : "Error Loading AI"}
              </div>
              <div className="text-red-400 text-xs px-4 text-center max-w-sm">{errorMsg}</div>
              <div className="text-slate-400 text-sm px-4 text-center max-w-sm mt-2">
                Check: System Settings &gt; Privacy &amp; Security &gt; Camera
              </div>
              <button onClick={() => window.location.reload()} className="mt-4 px-4 py-2 bg-slate-800 text-white rounded hover:bg-slate-700 transition">Retry</button>
            </>
          ) : (
            <>
              <RefreshCw className="w-10 h-10 text-cyan-500 animate-spin" />
              <p className="text-cyan-400 font-mono text-sm">
                {!cameraReady ? "Connecting Camera..." : "Loading AI Models... (GPU)"}
              </p>
            </>
          )}
        </div>
      )}
      {/* Video: behind canvas, keeps decoding frames */}
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        style={{ position: 'absolute', zIndex: 0, width: '100%', height: '100%', objectFit: 'contain' }}
      />
      {/* Canvas on top: draws video frame + overlay */}
      <canvas ref={canvasRef} style={{ position: 'absolute', zIndex: 1, width: '100%', height: '100%', objectFit: 'contain' }} />
      {/* Debug info bar */}
      <div className="absolute top-2 left-2 right-2 z-30 text-sm font-mono text-yellow-400 bg-black/80 px-3 py-2 rounded">
        {debugInfo}
      </div>
      <div className="absolute bottom-4 left-4 right-4 flex justify-between items-center glass-panel p-3 rounded-xl z-20">
        <div className="flex items-center gap-2">
          <Camera className="w-5 h-5 text-cyan-400" />
          <select className="bg-transparent text-sm text-slate-200 focus:outline-none cursor-pointer max-w-[150px] truncate" value={deviceId} onChange={(e) => handleDeviceChange(e.target.value)}>
            {devices.map((device, key) => (<option key={key} value={device.deviceId} className="bg-slate-800">{device.label || `Camera ${key + 1}`}</option>))}
          </select>
        </div>
        <div className="flex gap-2 items-center">
          <div className={clsx("w-3 h-3 rounded-full transition-colors", isReady && cameraReady ? "bg-green-500 animate-pulse" : "bg-yellow-500")} title="System Status"></div>
          <span className="text-xs text-slate-400">{isReady && cameraReady ? "Ready" : "Initializing"}</span>
        </div>
      </div>
    </div>
  );
};

export default VideoAnalyzer;
