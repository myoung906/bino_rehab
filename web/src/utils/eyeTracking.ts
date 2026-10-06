import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import type { CaptureScope, Eye, EyeObservation, Point, TrackingFrame } from './measurementTypes';

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const median = (a: number[]): number => {
  const b = [...a].sort((x, y) => x - y);
  return b.length ? b[Math.floor(b.length / 2)] : 0;
};

/** 밝은 반사를 제외한 어두운 연결영역의 중심. 윤곽 대비가 부족하면 추정값을 반환하지 않는다. */
function pupilCenter(ctx: CanvasRenderingContext2D, iris: Point, diameter: number): Point | null {
  if (diameter < 8 || !Number.isFinite(diameter)) return null;
  const radius = diameter * 0.48;
  const x0 = Math.max(0, Math.floor(iris.x - radius)), y0 = Math.max(0, Math.floor(iris.y - radius));
  const w = Math.min(ctx.canvas.width - x0, Math.ceil(radius * 2)), h = Math.min(ctx.canvas.height - y0, Math.ceil(radius * 2));
  if (w < 5 || h < 5) return null;
  const data = ctx.getImageData(x0, y0, w, h).data;
  const gray = new Float32Array(w * h), values: number[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, p = i * 4;
    gray[i] = .2126 * data[p] + .7152 * data[p + 1] + .0722 * data[p + 2];
    if (Math.hypot(x + x0 - iris.x, y + y0 - iris.y) < radius * .85) values.push(gray[i]);
  }
  values.sort((a, b) => a - b);
  const dark = values[Math.floor(values.length * .2)], mid = values[Math.floor(values.length * .5)];
  if (!Number.isFinite(dark) || mid - dark < 5) return null;
  const threshold = dark + (mid - dark) * .4;
  const seen = new Uint8Array(w * h);
  let best: { center: Point; size: number } | null = null;
  for (let i = 0; i < seen.length; i++) {
    if (seen[i] || gray[i] > threshold) continue;
    const ix = i % w, iy = Math.floor(i / w);
    if (Math.hypot(ix + x0 - iris.x, iy + y0 - iris.y) > radius * .85) continue;
    const queue = [i]; seen[i] = 1;
    for (let n = 0; n < queue.length; n++) {
      const k = queue[n], x = k % w, y = Math.floor(k / w);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, j = ny * w + nx;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h || seen[j] || gray[j] > threshold) continue;
        if (Math.hypot(nx + x0 - iris.x, ny + y0 - iris.y) > radius * .85) continue;
        seen[j] = 1; queue.push(j);
      }
    }
    if (queue.length < 4 || queue.length > Math.PI * radius * radius * .65) continue;
    const cx = queue.reduce((s, k) => s + k % w, 0) / queue.length;
    const cy = queue.reduce((s, k) => s + Math.floor(k / w), 0) / queue.length;
    const center = { x: cx + x0, y: cy + y0 };
    if (distance(center, iris) > radius * .5) continue;
    const vx = queue.reduce((s, k) => s + (k % w - cx) ** 2, 0) / queue.length;
    const vy = queue.reduce((s, k) => s + (Math.floor(k / w) - cy) ** 2, 0) / queue.length;
    const cov = queue.reduce((s, k) => s + (k % w - cx) * (Math.floor(k / w) - cy), 0) / queue.length;
    const eig = Math.sqrt((vx - vy) ** 2 + 4 * cov ** 2);
    const ratio = (vx + vy - eig) / Math.max(vx + vy + eig, .01);
    if (ratio < .25) continue;
    const r = Math.sqrt(queue.length / Math.PI), ring: number[] = [];
    for (let n = 0; n < 24; n++) {
      const angle = n * Math.PI / 12;
      const x = Math.round(cx + Math.cos(angle) * r * 1.6), y = Math.round(cy + Math.sin(angle) * r * 1.6);
      if (x >= 0 && x < w && y >= 0 && y < h) ring.push(gray[y * w + x]);
    }
    const inside = queue.map(k => gray[k]);
    if (ring.length < 12 || median(ring) - median(inside) < 10) continue;
    if (!best || queue.length > best.size) best = { center, size: queue.length };
  }
  return best?.center ?? null;
}

// 손 외접 사각형 대신 랜드마크의 볼록 껍질로 눈과 겹침을 관찰한다. 실제 완전 차폐는 사용자가 지킨다.
function convexHull(points: Point[]): Point[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const half = (pts: Point[]) => {
    const h: Point[] = [];
    for (const p of pts) {
      while (h.length > 1 && cross(h[h.length - 2], h[h.length - 1], p) <= 0) h.pop();
      h.push(p);
    }
    return h.slice(0, -1);
  };
  return [...half(sorted), ...half([...sorted].reverse())];
}
function contains(point: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function extractTrackingFrame(
  landmarks: NormalizedLandmark[], hands: NormalizedLandmark[][], ctx: CanvasRenderingContext2D,
  scope: CaptureScope, timestamp: number, handTrackingReady: boolean,
): TrackingFrame {
  const pixel = (index: number): Point => ({ x: landmarks[index].x * scope.width, y: landmarks[index].y * scope.height });
  const hulls = hands.map(hand => convexHull(hand.map(p => ({ x: p.x * scope.width, y: p.y * scope.height }))));
  const eye = (side: Eye): EyeObservation => {
    // MediaPipe 본인 기준: 468..472 오른눈, 473..477 왼눈. 표시 미러링과 분리한다.
    const right = side === 'right';
    const iris = pixel(right ? 468 : 473);
    const diameter = distance(pixel(right ? 469 : 474), pixel(right ? 471 : 476));
    const a = pixel(right ? 33 : 362), b = pixel(right ? 133 : 263);
    const width = distance(a, b), axis = { x: (b.x - a.x) / width, y: (b.y - a.y) / width };
    const covered = hulls.some(h => contains(iris, h));
    const open = distance(pixel(right ? 159 : 386), pixel(right ? 145 : 374)) / width > .12;
    const pupil = !covered && open ? pupilCenter(ctx, iris, diameter) : null;
    // 두 눈 좌표를 미러링 전 x 방향으로 맞춘다. 내외사위 부호는 눈별로 환산한다.
    const sign = axis.x < 0 ? -1 : 1;
    const delta = pupil ? { x: pupil.x - a.x, y: pupil.y - a.y } : null;
    const position = delta ? {
      x: sign * (delta.x * axis.x + delta.y * axis.y) / width,
      y: sign * (-delta.x * axis.y + delta.y * axis.x) / width,
    } : null;
    return { iris, pupil, irisDiameterPx: diameter, eyeWidthPx: width, position, covered, open,
      valid: !!pupil && !covered && open && width > 10 && diameter > 5 };
  };
  const a = pixel(33), b = pixel(263), nose = pixel(1), faceWidthPx = distance(a, b);
  return { timestamp, scope, facePresent: true, handTrackingReady,
    eyes: { right: eye('right'), left: eye('left') }, nose, faceWidthPx,
    pose: { x: (nose.x - (a.x + b.x) / 2) / faceWidthPx, y: (nose.y - (a.y + b.y) / 2) / faceWidthPx },
    roll: Math.atan2(b.y - a.y, b.x - a.x),
  };
}

export function missingFrame(scope: CaptureScope, timestamp: number, handTrackingReady: boolean): TrackingFrame {
  const eye: EyeObservation = { iris: { x: 0, y: 0 }, pupil: null, irisDiameterPx: 0,
    eyeWidthPx: 0, position: null, covered: false, open: false, valid: false };
  return { timestamp, scope, facePresent: false, handTrackingReady, eyes: { right: { ...eye }, left: { ...eye } },
    nose: { x: 0, y: 0 }, faceWidthPx: 0, pose: { x: 0, y: 0 }, roll: 0 };
}
