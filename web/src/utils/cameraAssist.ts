import type { Eye, Stage, TrackingFrame } from './measurementTypes';

export interface EyeImageQuality { brightness: number; highlightFraction: number }
export interface AssistStatus { message: string; ready: boolean }

/** 영상에서 확인한 조건만 안내한다. 조명·반사는 판독 실패의 확정 진단이 아니다. */
export function cameraAssistStatus(frame: TrackingFrame, quality: Partial<Record<Eye, EyeImageQuality>>, stage: Stage): AssistStatus {
  const result = (message: string, ready = false): AssistStatus => ({ message, ready });
  if (!frame.facePresent) return result('얼굴을 화면 가운데로 맞추세요.');
  const eyes: Eye[] = stage === 'right-aa' ? ['right'] : stage === 'left-aa' ? ['left'] : ['right', 'left'];
  const visible = eyes.filter(eye => !frame.eyes[eye].covered);
  if (!visible.length) return result('검사할 눈이 보이게 해주세요.');
  if (visible.every(eye => frame.eyes[eye].valid)) return result(visible.length === 2 ? '두 동공 확인됨' : '열린 눈의 동공 확인됨', true);
  if (visible.some(eye => !frame.eyes[eye].open)) return result('눈을 편하게 뜨세요.');
  if (visible.some(eye => frame.eyes[eye].irisDiameterPx < 8)) return result('휴대폰을 40cm로 맞추세요.');
  const failed = visible.filter(eye => !frame.eyes[eye].valid);
  if (failed.some(eye => (quality[eye]?.highlightFraction ?? 0) > .08)) return result('눈 주변의 밝은 반사를 확인하세요.');
  if (failed.some(eye => quality[eye] && quality[eye]!.brightness < 45)) return result(stage === 'setup'
    ? '위의 조명 버튼이나 방 조명을 켜주세요.' : '밝은 곳에서 처음부터 시작하세요.');
  return result('확대 영상에서 동공 윤곽을 확인하세요.');
}

/** 눈과 주변 흰자 영상의 밝기와 밝은 픽셀 비율. 카메라 원본으로 계산한다. */
export function eyeImageQuality(data: Uint8ClampedArray): EyeImageQuality {
  let total = 0, highlights = 0, count = 0;
  for (let i = 0; i + 3 < data.length; i += 16) {
    const value = .2126 * data[i] + .7152 * data[i + 1] + .0722 * data[i + 2];
    total += value; count++;
    if (value > 245) highlights++;
  }
  return { brightness: count ? total / count : 0, highlightFraction: count ? highlights / count : 0 };
}
