# AGENTS.md - AI 에이전트 작업 지침서

이 파일은 '양안시 기능 및 동적 대칭성 분석 솔루션' 프로젝트에 참여하는 AI 에이전트 및 개발자를 위한 핵심 지침을 담고 있습니다.

## 1. 프로젝트 개요 (Project Overview)
- **목표**: WebCam(60fps)을 기반으로 양안의 폭주/개산 속도 및 대칭성을 분석하는 웹 어플리케이션 개발.
- **주요 사용자**: 안경사, 검안사 (Visual Rehab 목적).
- **플랫폼**: 웹 기반 (Next.js) - 설치 없이 접근 가능하거나 데스크탑 래핑(Electron) 가능성 염두.

## 2. 기술 스택 (Tech Stack)
**사용자의 요청에 따라 Node.js & Next.js 기반 웹 앱으로 전환됨.**

- **Framework**: **Next.js 14+** (App Router)
- **Language**: **TypeScript** (Strict Mode 권장)
- **Styling**: **TailwindCSS** (기본), Framer Motion (애니메이션)
- **Logic & State**: React Hooks, Context API, Zustand (필요 시)
- **Computer Vision (Client-side)**:
  - `@mediapipe/iris` 또는 `@mediapipe/face_mesh` (JavaScript Solution)
  - `react-webcam`
  - OpenCV.js (보조 연산 필요 시)
- **Performance**: 60fps 연산을 위해 Web Worker 활용 적극 권장.

## 3. 코딩 컨벤션 (Coding Conventions)
- **언어**: 주석 및 문서는 **한국어** 작성.
- **컴포넌트**: Functional Component 사용. PascalCase (`VisualAnalyzer.tsx`)
- **스타일**: Tailwind 유틸리티 클래스 우선 사용. 복잡한 스타일은 `clsx`나 `tailwind-merge` 활용.
- **단위**:
  - CSS 단위는 `rem` 권장.
  - 내부 로직 좌표계는 정규화된 좌표(0.0 ~ 1.0) 또는 픽셀 좌표 사용 후 `mm` 변환.

## 4. UI/UX 디자인 가이드
- **심미성**: "Wow" 포인트가 있는 모던한 디자인. (Glassmorphism, Neon Accents 등)
- **검안 데이터 시각화**: `Recharts` 또는 `Visx`를 사용하여 속도/궤적 그래프를 미려하게 표현.
- **다크 모드**: 시력 검사 환경을 고려하여 기본적으로 **Dark Mode** 최적화.

## 5. 핵심 구현 로직 (Migration to JS)
- `check_env.py` 등의 Python 로직은 백엔드 API로 전환되거나 클라이언트 JS 로직으로 이식되어야 함.
- 사위량 계산 및 AC/A 비율 공식은 클라이언트 사이드에서 즉시 피드백(Real-time Feedback) 주는 형태로 구현.

