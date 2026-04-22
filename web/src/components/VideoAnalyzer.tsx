'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Camera, RefreshCw } from 'lucide-react';
import { FaceLandmarker, FilesetResolver, NormalizedLandmark } from "@mediapipe/tasks-vision";
import clsx from 'clsx';

// 얼굴 윤곽 랜드마크 인덱스 (36개) — 바운딩 박스용
// 478개 전체 순회 대비 ~13배 반복 횟수 감소
const FACE_OVAL_INDICES = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288,
  397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
  172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
] as const;

const getCentroid = (landmarks: NormalizedLandmark[], indices: readonly number[]) => {
  let x = 0, y = 0, z = 0;
  for (const idx of indices) {
    x += landmarks[idx].x;
    y += landmarks[idx].y;
    z += landmarks[idx].z;
  }
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
  const [faceDetected, setFaceDetected] = useState(false);
  const frameCountRef = useRef(0);
  const detectCountRef = useRef(0);
  const faceCountRef = useRef(0);
  const lastFaceDetectedRef = useRef(false);

  // MediaPipe 초기화
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
          // GPU delegate 우선 시도
          landmarker = await FaceLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
              delegate: "GPU"
            },
            outputFaceBlendshapes: true,
            runningMode: "VIDEO",
            numFaces: 1
          });
        } catch {
          // GPU 실패 시 CPU fallback
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
      } catch (error: unknown) {
        if (!ignore) {
          setErrorMsg(error instanceof Error ? error.message : "Failed to load AI Model.");
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

  // 카메라 시작
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
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Camera access failed");
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

  // 메인 렌더 루프
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

      // 디버그 정보는 개발 환경에서만 30프레임마다 업데이트
      if (process.env.NODE_ENV === 'development' && frameCountRef.current % 30 === 0) {
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
          // 미러링된 비디오 프레임 그리기
          ctx.save();
          ctx.translate(vw, 0);
          ctx.scale(-1, 1);
          ctx.drawImage(video, 0, 0, vw, vh);
          ctx.restore();

          // 프레임 카운터 (900으로 순환 — 30fps 기준 30초 주기)
          frameCountRef.current = (frameCountRef.current + 1) % 900;

          if (hasModel) {
            try {
              const results = faceLandmarkerRef.current!.detectForVideo(video, performance.now());
              detectCountRef.current++;

              const nowDetected = results.faceLandmarks && results.faceLandmarks.length > 0;
              if (nowDetected !== lastFaceDetectedRef.current) {
                lastFaceDetectedRef.current = nowDetected;
                setFaceDetected(nowDetected);
              }

              if (nowDetected) {
                faceCountRef.current++;
                const landmarks = results.faceLandmarks[0];

                const rightIrisIndices = [474, 475, 476, 477] as const;
                const leftIrisIndices = [469, 470, 471, 472] as const;
                const rightIrisCenter = getCentroid(landmarks, rightIrisIndices);
                const leftIrisCenter = getCentroid(landmarks, leftIrisIndices);

                if (showOverlay) {
                  ctx.save();
                  ctx.translate(vw, 0);
                  ctx.scale(-1, 1);

                  // 얼굴 바운딩 박스 — FACE_OVAL_INDICES(36개)만 순회 (478개 전체 대비 13배 빠름)
                  let minX = 1, minY = 1, maxX = 0, maxY = 0;
                  for (const idx of FACE_OVAL_INDICES) {
                    const lm = landmarks[idx];
                    if (lm.x < minX) minX = lm.x;
                    if (lm.y < minY) minY = lm.y;
                    if (lm.x > maxX) maxX = lm.x;
                    if (lm.y > maxY) maxY = lm.y;
                  }
                  ctx.strokeStyle = '#22c55e';
                  ctx.lineWidth = 3;
                  ctx.strokeRect(minX * vw, minY * vh, (maxX - minX) * vw, (maxY - minY) * vh);

                  // 홍채 중심점 마커
                  ctx.fillStyle = '#06b6d4';
                  ctx.beginPath();
                  ctx.arc(rightIrisCenter.x * vw, rightIrisCenter.y * vh, 5, 0, 2 * Math.PI);
                  ctx.fill();

                  ctx.fillStyle = '#8b5cf6';
                  ctx.beginPath();
                  ctx.arc(leftIrisCenter.x * vw, leftIrisCenter.y * vh, 5, 0, 2 * Math.PI);
                  ctx.fill();

                  // 홍채 윤곽선
                  const drawIrisConnector = (indices: readonly number[], color: string) => {
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
              // 감지 오류가 루프를 중단하지 않도록 처리
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
                {!cameraReady ? "Connecting Camera..." : "Loading AI Models..."}
              </p>
            </>
          )}
        </div>
      )}
      {/* Video: 뒤에서 프레임 디코딩 유지 */}
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        style={{ position: 'absolute', zIndex: 0, width: '100%', height: '100%', objectFit: 'contain' }}
      />
      {/* Canvas: 미러링된 비디오 프레임 + 오버레이 */}
      <canvas ref={canvasRef} style={{ position: 'absolute', zIndex: 1, width: '100%', height: '100%', objectFit: 'contain' }} />
      {/* 디버그 정보 바 — 개발 환경에서만 표시 */}
      {process.env.NODE_ENV === 'development' && (
        <div className="absolute top-2 left-2 right-2 z-30 text-sm font-mono text-yellow-400 bg-black/80 px-3 py-2 rounded">
          {debugInfo}
        </div>
      )}
      {/* 얼굴 미감지 안내 오버레이 */}
      {isReady && cameraReady && !faceDetected && !errorMsg && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 text-center pointer-events-none">
          <div className="text-slate-400 text-sm font-mono bg-black/50 px-3 py-2 rounded-lg">
            얼굴을 카메라 정면에 위치시켜 주세요
          </div>
        </div>
      )}
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
          {isReady && cameraReady && (
            <span className="text-xs font-mono text-slate-500">
              {faceDetected ? '👁 감지됨' : '— 대기중'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default VideoAnalyzer;
