# iOS 빌드 진행 상황

## 완료된 작업

### 1. 환경 설정
- [x] Ruby 3.2.0 설치 (rbenv 사용)
- [x] CocoaPods 설치
- [x] SSL 인증서 설정

### 2. iOS 프로젝트 설정
- [x] `npm run build:standalone` (web 빌드)
- [x] `npx cap sync ios` (Capacitor iOS 동기화)
- [x] `pod install` 완료 (Capacitor, CapacitorCamera, CapacitorCordova 설치됨)

### 3. Xcode 설정
- [x] App.xcworkspace 열기
- [x] Signing & Capabilities 탭 진입
- [x] Team 선택: "Jaemyoung Seo (Personal Team)"
- [x] 시뮬레이터 선택 (iPhone 14 Pro 또는 다른 iPhone)

---

## 다음에 해야 할 작업

### 1. 시뮬레이터에서 앱 실행
1. Xcode 상단의 **▶ (재생 버튼)** 클릭
2. 시뮬레이터가 부팅되고 앱이 설치/실행됨
3. 카메라 권한 요청 확인 (시뮬레이터에서는 카메라 테스트 불가)

### 2. 실제 iPhone에서 테스트 (선택사항)
1. iPhone을 USB로 Mac에 연결
2. Xcode 상단에서 연결된 iPhone 선택
3. ▶ 버튼 클릭
4. iPhone에서 "신뢰" 확인
5. 설정 > 일반 > VPN 및 기기 관리 > 개발자 앱 신뢰

---

## 주요 명령어 (다음에 다시 시작할 때)

```bash
# 1. rbenv 환경 활성화 (새 터미널에서)
eval "$(/usr/local/bin/rbenv init - zsh)"

# 2. SSL 인증서 설정
export SSL_CERT_FILE=/usr/local/etc/ca-certificates/cert.pem

# 3. web 빌드 (코드 변경 시)
cd /Users/jmseo/Documents/workspace/bino_rehab/web
npm run build:standalone

# 4. iOS 동기화 (코드 변경 시)
cd /Users/jmseo/Documents/workspace/bino_rehab/mobile
npx cap sync ios

# 5. Xcode 열기
open /Users/jmseo/Documents/workspace/bino_rehab/mobile/ios/App/App.xcworkspace
```

---

## 트러블슈팅

### SSL 인증서 에러 발생 시
```bash
export SSL_CERT_FILE=/usr/local/etc/ca-certificates/cert.pem
```

### Pod install 실패 시
```bash
cd /Users/jmseo/Documents/workspace/bino_rehab/mobile/ios/App
eval "$(/usr/local/bin/rbenv init - bash)"
export SSL_CERT_FILE=/usr/local/etc/ca-certificates/cert.pem
pod install --repo-update
```

### Ruby 버전 확인
```bash
ruby --version  # 3.2.0 이어야 함
```

---

## 현재 상태 요약

| 항목 | 상태 |
|------|------|
| Web 빌드 | ✅ 완료 |
| iOS 동기화 | ✅ 완료 |
| Xcode 프로젝트 | ✅ 열림 |
| Team 서명 | ✅ 설정됨 |
| 시뮬레이터 선택 | ✅ 완료 |
| 앱 실행 | ⏳ 다음 단계 (▶ 버튼 클릭) |

---

*마지막 업데이트: 2026-04-24 오후 11:00*
