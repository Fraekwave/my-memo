# INA Done 업데이트 로그

## v1.1.0 (2026-02-21)

### 브랜딩 변경

- **앱명**: INA Done - Break your Plan
- **탭 제목** (`index.html`): INA Done - Break your Plan
- **앱 헤더 기본 제목** (`useAppTitle.ts`): INA Done
- **로그인 화면**
  - 제목: INA Done
  - 부제목: Plan to Break (모든 locale 통일)

### UI 정리

- **버전/배포일 표시 제거**: 우측 하단 VersionIndicator 삭제
- `vite.config.ts`: `__BUILD_TIME__` define 제거
- `vite-env.d.ts`: `__BUILD_TIME__` 타입 선언 제거

### PWA 지원

- **manifest.json** 추가
  - 앱 메타데이터: INA Done, Plan to Break
  - `id`, `scope`, `orientation: portrait`, `categories`, `lang`, `prefer_related_applications` 등 PWA 품질 항목 반영
- **index.html**: manifest 링크, Service Worker 등록 스크립트 추가
- **public/sw.js**: Service Worker

### 비밀번호 재설정 플로우 수정

**문제**: 이메일 링크 클릭 시 비밀번호 재설정 없이 자동 로그인됨

**원인**: `PASSWORD_RECOVERY` 이벤트 미처리, 세션만 있으면 메인 화면 표시

**수정 사항**:

1. **useAuth.ts**
   - `onAuthStateChange`에서 `event === 'PASSWORD_RECOVERY'` 감지
   - `isRecoveryMode` 상태 추가
   - `clearRecoveryMode`: recovery 해제 및 URL 해시 정리

2. **PasswordResetConfirm.tsx** (신규)
   - 이메일 링크 클릭 후 표시되는 새 비밀번호 입력 화면
   - 비밀번호 조건 표시 (8자 이상, 대소문자, 숫자, 특수문자)
   - `supabase.auth.updateUser({ password })` 호출로 재설정 완료

3. **App.tsx**
   - `isRecoveryMode && session`일 때 PasswordResetConfirm 표시
   - 재설정 완료 후 `clearRecoveryMode`로 메인 화면 전환

4. **locales** (en, ko, ja, zh, de, es)
   - `subtitle_recovery`, `setNewPassword`, `recoveryError`, `recoverySuccess` 번역 추가

### 도메인 준비

- 코드 내 하드코딩된 사이트 URL 없음 확인
- `inadone.me` 도메인 연결 시 Vercel·Supabase 설정만 필요

---

## v1.0.0 이전

- 초기 앱 출시 (My Memo → INA Done 리브랜딩 이전)
