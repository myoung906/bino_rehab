import type { AngularCalibration, Eye, Point } from './measurementTypes';

export interface AngularReference { positions: Record<Eye, Point>; angles: Record<Eye, Point> }

/** 실제 표적각도와 관측 위치의 기울기를 눈·축마다 독립적으로 구한다. */
export function fitAngularCalibration(samples: AngularReference[]): Record<Eye, AngularCalibration> | null {
  if (samples.length < 5) return null;
  if (samples.some(sample => (['right', 'left'] as const).some(eye =>
    (['x', 'y'] as const).some(axis => !Number.isFinite(sample.positions[eye][axis])
      || !Number.isFinite(sample.angles[eye][axis]) || Math.abs(sample.angles[eye][axis]) > 10)))) return null;
  const fit = (eye: Eye, axis: 'x' | 'y'): number | null => {
    const points = samples;
    if (!points.some(s => s.angles[eye][axis] < -1) || !points.some(s => s.angles[eye][axis] > 1)) return null;
    const meanX = points.reduce((sum, s) => sum + s.positions[eye][axis], 0) / points.length;
    const meanY = points.reduce((sum, s) => sum + s.angles[eye][axis], 0) / points.length;
    const variance = points.reduce((sum, s) => sum + (s.positions[eye][axis] - meanX) ** 2, 0);
    if (variance < .0004) return null;
    const slope = points.reduce((sum, s) => sum + (s.positions[eye][axis] - meanX) * (s.angles[eye][axis] - meanY), 0) / variance;
    const intercept = meanY - slope * meanX;
    const error = Math.sqrt(points.reduce((sum, s) => sum + (slope * s.positions[eye][axis] + intercept - s.angles[eye][axis]) ** 2, 0) / points.length);
    return Number.isFinite(slope) && slope !== 0 && error < .5 ? slope : null;
  };
  const right = { horizontalDegPerUnit: fit('right', 'x'), verticalDegPerUnit: fit('right', 'y') };
  const left = { horizontalDegPerUnit: fit('left', 'x'), verticalDegPerUnit: fit('left', 'y') };
  return [right.horizontalDegPerUnit, right.verticalDegPerUnit, left.horizontalDegPerUnit, left.verticalDegPerUnit]
    .every(v => v !== null) ? { right, left } : null;
}
