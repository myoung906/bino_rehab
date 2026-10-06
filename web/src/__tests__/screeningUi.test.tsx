import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import Home from '../app/page';

vi.mock('../components/VideoAnalyzer', () => ({
  default: () => <div data-testid="camera-preview">카메라 영상</div>,
}));

describe('카메라 중심 첫 화면', () => {
  it('한 화면에서 카메라와 준비 안내를 함께 보여준다', () => {
    const html = renderToStaticMarkup(<Home />);
    expect(html).toContain('h-dvh');
    expect(html).toContain('overflow-hidden');
    expect(html).toContain('camera-preview');
    expect(html).toContain('눈과 렌즈 사이를 40cm로 맞추세요.');
    expect(html).toContain('카메라를 켜고 얼굴을 맞춰주세요');
  });
  it('첫 화면에서 각도 입력이나 긴 단계 목록을 요구하지 않는다', () => {
    const html = renderToStaticMarkup(<Home />);
    expect(html).not.toContain('표적각도');
    expect(html).not.toContain('수평각');
    expect(html).not.toContain('<nav');
    expect(html).not.toContain('<details');
  });
});
