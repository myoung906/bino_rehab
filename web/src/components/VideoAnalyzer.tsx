'use client';

import { useEffect, useRef, useState } from 'react';
import { FaceLandmarker, FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { extractTrackingFrame, missingFrame } from '@/utils/eyeTracking';
import { cameraAssistStatus, eyeImageQuality } from '@/utils/cameraAssist';
import type { AssistStatus, EyeImageQuality } from '@/utils/cameraAssist';
import type { CaptureScope, Eye, Stage, TrackingFrame } from '@/utils/measurementTypes';

export type TrackingData = TrackingFrame;
interface Props { onFrame?: (frame: TrackingFrame) => void; showOverlay?: boolean; compact?: boolean; eyeZoom?: boolean; stage?: Stage }

export default function VideoAnalyzer({ onFrame, showOverlay = true, compact = false, eyeZoom = false, stage = 'setup' }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const zoomCanvas = useRef<HTMLCanvasElement>(null);
  const source = useRef<HTMLCanvasElement | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const face = useRef<FaceLandmarker | null>(null);
  const hand = useRef<HandLandmarker | null>(null);
  const callback = useRef(onFrame);
  const [deviceId, setDeviceId] = useState('');
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [error, setError] = useState('');
  const [modelReady, setModelReady] = useState(false);
  const [handReady, setHandReady] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [assist, setAssist] = useState<AssistStatus>({ message: '얼굴을 화면 가운데로 맞추세요.', ready: false });
  const [scope, setScope] = useState<CaptureScope | null>(null);
  const [enabled, setEnabled] = useState(false);
  useEffect(() => { callback.current = onFrame; }, [onFrame]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const init = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32/wasm');
        const faceModel = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task', delegate: 'CPU' },
          runningMode: 'VIDEO', numFaces: 1,
          minFaceDetectionConfidence: .6, minFacePresenceConfidence: .6, minTrackingConfidence: .6,
        });
        if (cancelled) { faceModel.close(); return; }
        face.current = faceModel; setModelReady(true);
        try {
          const handModel = await HandLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task', delegate: 'CPU' },
            runningMode: 'VIDEO', numHands: 2, minHandDetectionConfidence: .6, minHandPresenceConfidence: .6, minTrackingConfidence: .6,
          });
          if (cancelled) { handModel.close(); return; }
          hand.current = handModel; setHandReady(true);
        } catch {
          if (!cancelled) {
            setHandReady(false);
            setError('손 차폐 추적을 불러오지 못했습니다. 연결을 확인한 뒤 카메라를 껐다 켜주세요.');
          }
        }
      } catch {
        if (!cancelled) setError('눈 추적 모델을 불러오지 못했습니다. 연결을 확인한 뒤 카메라를 다시 켜주세요.');
      }
    };
    void init();
    return () => {
      cancelled = true; face.current?.close(); hand.current?.close();
      face.current = null; hand.current = null;
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let owned: MediaStream | null = null;
    const start = async () => {
      try {
        const next = await navigator.mediaDevices.getUserMedia({
          video: {
            ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: 'user' } }),
            width: { ideal: 1280 }, height: { ideal: 960 }, aspectRatio: { ideal: 4 / 3 }, frameRate: { ideal: 30 },
          }, audio: false,
        });
        owned = next;
        if (cancelled) { next.getTracks().forEach(t => t.stop()); return; }
        stream.current = next;
        if (video.current) {
          video.current.srcObject = next; await video.current.play();
        }
        if (cancelled) return;
        const settings = next.getVideoTracks()[0].getSettings() as MediaTrackSettings & { zoom?: number };
        setScope({ width: video.current?.videoWidth || settings.width || 0,
          height: video.current?.videoHeight || settings.height || 0,
          deviceId: settings.deviceId || '', facingMode: settings.facingMode || '', zoom: settings.zoom ?? null });
        setDevices((await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput'));
        setCameraReady(true);
      } catch {
        if (!cancelled) setError('전면카메라 접근을 허용해주세요.');
      }
    };
    void start();
    return () => { cancelled = true; owned?.getTracks().forEach(t => t.stop()); };
  }, [enabled, deviceId]);

  useEffect(() => {
    if (!enabled || !modelReady || !cameraReady || !scope) return;
    let animation = 0, stopped = false, lastVideoTime = -1, lastRun = -1, lastAssist = -1000;
    source.current = document.createElement('canvas');
    const run = () => {
      if (stopped) return;
      const v = video.current, out = canvas.current, input = source.current;
      const now = performance.now();
      if (v && out && input && v.readyState >= 2 && v.currentTime !== lastVideoTime && now - lastRun >= 30) {
        lastVideoTime = v.currentTime; lastRun = now;
        const width = v.videoWidth, height = v.videoHeight;
        if (input.width !== width || input.height !== height) { input.width = width; input.height = height; }
        if (out.width !== width || out.height !== height) { out.width = width; out.height = height; }
        const ctx = input.getContext('2d', { willReadFrequently: true }), display = out.getContext('2d');
        const settings = stream.current?.getVideoTracks()[0]?.getSettings() as (MediaTrackSettings & { zoom?: number }) | undefined;
        const currentScope = { ...scope, width, height, zoom: settings?.zoom ?? null };
        if (ctx && display) {
          ctx.drawImage(v, 0, 0, width, height);
          let frame = missingFrame(currentScope, now, !!hand.current);
          try {
            const hands = hand.current?.detectForVideo(v, now).landmarks || [];
            const results = face.current?.detectForVideo(v, now);
            if (results?.faceLandmarks[0]?.length === 478) {
              frame = extractTrackingFrame(results.faceLandmarks[0], hands, ctx, currentScope, now, !!hand.current);
            }
          } catch {
            // 추적 오류도 프레임으로 전달하여 오래된 관측값이 검사 종료점이 되지 않도록 한다.
          }
          callback.current?.(frame);
          if (now - lastAssist >= 200) {
            lastAssist = now;
            const quality: Partial<Record<Eye, EyeImageQuality>> = {};
            if (frame.facePresent) for (const eye of ['right', 'left'] as const) {
              const observed = frame.eyes[eye];
              if (observed.covered || !Number.isFinite(observed.irisDiameterPx) || observed.irisDiameterPx <= 0) continue;
              const x = Math.max(0, Math.floor(observed.iris.x - observed.irisDiameterPx * 1.3));
              const y = Math.max(0, Math.floor(observed.iris.y - observed.irisDiameterPx * .7));
              const w = Math.min(width - x, Math.ceil(observed.irisDiameterPx * 2.6));
              const h = Math.min(height - y, Math.ceil(observed.irisDiameterPx * 1.4));
              if (w > 0 && h > 0) quality[eye] = eyeImageQuality(ctx.getImageData(x, y, w, h).data);
            }
            setAssist(cameraAssistStatus(frame, quality, stage));
          }
          const zoom = zoomCanvas.current?.getContext('2d');
          if (zoom) {
            zoom.clearRect(0, 0, 480, 144);
            if (frame.facePresent) (['left', 'right'] as const).forEach((eye, index) => {
              const observed = frame.eyes[eye], diameter = observed.irisDiameterPx;
              if (!Number.isFinite(diameter) || diameter <= 0 || observed.covered) return;
              const sx = Math.max(0, observed.iris.x - diameter * 1.5), sy = Math.max(0, observed.iris.y - diameter * .9);
              const sw = Math.min(width - sx, diameter * 3), sh = Math.min(height - sy, diameter * 1.8);
              if (sw <= 0 || sh <= 0) return;
              zoom.save(); zoom.translate(index * 240 + 240, 0); zoom.scale(-1, 1);
              zoom.drawImage(input, sx, sy, sw, sh, 0, 0, 240, 144);
              if (observed.pupil && observed.valid) {
                zoom.strokeStyle = '#22d3ee'; zoom.lineWidth = 2; zoom.beginPath();
                zoom.arc((observed.pupil.x - sx) / sw * 240, (observed.pupil.y - sy) / sh * 144, 5, 0, Math.PI * 2); zoom.stroke();
              }
              zoom.restore();
            });
          }
          display.save(); display.translate(width, 0); display.scale(-1, 1);
          display.drawImage(input, 0, 0);
          if (showOverlay) for (const eye of [frame.eyes.right, frame.eyes.left]) {
            if (!frame.facePresent) continue;
            display.strokeStyle = eye.valid ? '#22d3ee' : '#fbbf24';
            display.lineWidth = 2; display.beginPath();
            const point = eye.pupil || eye.iris;
            display.arc(point.x, point.y, 4, 0, 2 * Math.PI); display.stroke();
          }
          display.restore();
        }
      }
      animation = requestAnimationFrame(run);
    };
    animation = requestAnimationFrame(run);
    return () => { stopped = true; cancelAnimationFrame(animation); source.current = null; };
  }, [enabled, cameraReady, modelReady, scope, showOverlay, eyeZoom, stage]);

  return <div className="relative h-full min-h-52 overflow-hidden rounded-2xl border border-slate-700 bg-black">
    <video ref={video} playsInline muted autoPlay className={`absolute inset-0 h-full w-full object-contain ${compact ? 'object-[center_25%]' : ''}`} style={{ transform: 'scaleX(-1)' }} />
    <canvas ref={canvas} className={`absolute inset-0 h-full w-full object-contain ${compact ? 'object-[center_25%]' : ''}`} />
    {!enabled ? <div className="absolute inset-0 grid place-content-center gap-3 text-center">
      <p className="text-sm text-slate-300">휴대폰을 눈높이 정면에 놓아주세요.</p>
      <button className="glass-button rounded-xl px-6 py-3" onClick={() => { setError(''); setEnabled(true); }}>전면카메라 켜기</button>
    </div> : <div className={`absolute inset-x-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-950/85 p-3 text-xs ${compact ? 'top-[max(5rem,calc(env(safe-area-inset-top)+4rem))]' : 'bottom-3'}`}>
      <span role="status" className={assist.ready && !error ? 'text-cyan-300' : 'text-amber-200'}>{error || (!modelReady || !cameraReady ? '카메라 준비 중…' : assist.message)}</span>
      {cameraReady && !compact && <select aria-label="카메라 선택" className="max-w-40 rounded bg-slate-800 p-1" value={deviceId || scope?.deviceId || ''}
        onChange={e => { setError(''); setCameraReady(false); setDeviceId(e.target.value); }}>
        {devices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || '카메라'}</option>)}
      </select>}
      <button className="min-h-11 touch-manipulation px-2" onClick={() => {
        if (scope) callback.current?.(missingFrame(scope, performance.now(), false));
        setEnabled(false); setModelReady(false); setHandReady(false); setCameraReady(false); setScope(null);
        setAssist({ message: '얼굴을 화면 가운데로 맞추세요.', ready: false });
      }}>카메라 끄기</button>
      {modelReady && !handReady && !error && <span className="text-amber-300">손 추적 준비 중…</span>}
      {eyeZoom && <div className="w-full" aria-label="두 눈 확대 영상">
        <canvas ref={zoomCanvas} width={480} height={144} className="mx-auto aspect-[10/3] w-full max-w-80 rounded-lg bg-black" />
        <div className="mx-auto flex max-w-80 justify-around pt-1 text-[10px] text-slate-300"><span>왼눈</span><span>오른눈</span></div>
      </div>}
    </div>}
  </div>;
}
