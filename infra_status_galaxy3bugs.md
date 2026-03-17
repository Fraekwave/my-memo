# INA Done — Samsung Galaxy 3대 Critical Bug 실행 계획

> **작성일**: 2026-03-18
> **대상 버전**: v1.3.0+ (현재 Google Play 프로덕션 심사 중)
> **영향 범위**: Samsung Galaxy 기기 전반 (특히 Chrome 비기본 브라우저 사용자)

---

## 목차

1. [Bug #1: 시스템 다크모드 UI 투명화](#bug-1-시스템-다크모드-ui-투명화)
2. [Bug #2: 스와이프 후 뷰포트 축소 복구 불가](#bug-2-스와이프-후-뷰포트-축소-복구-불가)
3. [Bug #3: TWA 주소창 지속 노출](#bug-3-twa-주소창-지속-노출)
4. [실행 순서 및 검증](#실행-순서-및-검증)

---

## Bug #1: 시스템 다크모드 UI 투명화

### 증상
Galaxy 기기에서 Android 시스템의 "강제 다크 모드"가 활성화되면 배경과 텍스트가 모두 검정색으로 변해 UI가 완전히 보이지 않음.

### 근본 원인 (Root Cause)

**핵심**: `color-scheme` 선언이 어디에도 없음.

Android WebView의 Force Dark 알고리즘은 `color-scheme` 메타태그/CSS가 없으면 앱이 다크모드를 지원한다고 간주하고 색상을 강제 반전시킴.

**현재 상태 확인:**
| 항목 | 상태 | 파일 |
|------|------|------|
| `<meta name="color-scheme">` | ❌ 없음 | `index.html` |
| CSS `color-scheme: light` | ❌ 없음 | `src/index.css` |
| Tailwind `darkMode` 설정 | ❌ 없음 | `tailwind.config.js` |
| `prefers-color-scheme` 미디어 쿼리 | ❌ 없음 | 전체 CSS |
| manifest `background_color` | `#00324b` (다크 블루) | `public/manifest.json` |

**반전 체인**: `bg-zinc-50` (밝은 회색) → 강제 반전 → 검정 / `text-zinc-900` (검정) → 강제 반전 → 검정 또는 매우 어두운 색 → **투명화**

### 수정 계획

#### Step 1-1: `index.html` — color-scheme 메타태그 추가
```html
<!-- line 7 뒤에 추가 -->
<meta name="color-scheme" content="light only" />
```

#### Step 1-2: `src/index.css` — CSS color-scheme 선언
```css
/* 전역 스타일 섹션 (line 10~12 사이) 에 추가 */
:root {
  color-scheme: light only;
}
```
> `light only`는 `light`보다 강력 — WebView에게 다크모드 적용을 완전히 차단하도록 명시적 지시.

#### Step 1-3: `public/manifest.json` — 테마 컬러 일관성 검토
- `background_color`와 `theme_color`가 현재 `#00324b` (다크 블루)로, 앱의 실제 라이트 배경(`zinc-50` = `#fafafa`)과 불일치
- 시스템이 다크 앱으로 오인할 여지 있음
- **변경**: `"background_color": "#fafafa"`, `"theme_color": "#fafafa"` (확정)

**수정 파일**: `index.html`, `src/index.css`, `public/manifest.json`

---

## Bug #2: 스와이프 후 뷰포트 축소 복구 불가

### 증상
실수로 스와이프/제스처를 하면 전체 UI가 축소(줌아웃)되고, 원래 1.0 스케일로 복구되지 않아 레이아웃이 깨짐.

### 근본 원인 (Root Cause)

**핵심**: viewport 메타태그에 스케일링 제한이 없음.

**현재 viewport** (`index.html:7`):
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
```

**누락된 항목:**
| 속성 | 역할 | 상태 |
|------|------|------|
| `maximum-scale=1.0` | 줌인 상한 | ❌ 없음 |
| `minimum-scale=1.0` | 줌아웃 하한 | ❌ 없음 |
| `user-scalable=no` | 사용자 줌 차단 | ❌ 없음 |

**CSS touch-action 현황:**
- 글로벌 `touch-action` 설정: ❌ 없음
- `TaskItem.tsx`에 `touch-pan-y` 하나만 존재 (핀치줌은 차단하지 않음)
- `overscroll-behavior` 설정: ❌ 없음

Samsung Galaxy WebView는 viewport 제한이 없으면 기본적으로 줌을 허용하며, 한번 줌아웃되면 복구 매커니즘이 없음.

### 수정 계획

#### Step 2-1: `index.html` — viewport 메타태그 강화
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
```

#### Step 2-2: `src/index.css` — 글로벌 touch-action 및 overscroll 차단
```css
/* html, body, #root 블록 (line 21~25)에 추가 */
html, body, #root {
  height: 100%;
  overflow: hidden;
  margin: 0;
  touch-action: pan-x pan-y;         /* 핀치줌 차단, 스크롤만 허용 */
  overscroll-behavior: none;          /* 브라우저 기본 오버스크롤 차단 */
  -webkit-text-size-adjust: 100%;     /* 텍스트 크기 자동조절 방지 */
  text-size-adjust: 100%;
}
```

#### Step 2-3: (선택) 제스처 이벤트 방어 코드
Samsung TWA에서 추가 방어가 필요할 경우, `src/main.tsx` 또는 `src/App.tsx`에:
```typescript
// 핀치줌 제스처 최종 방어선
document.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false });
document.addEventListener('gesturechange', (e) => e.preventDefault(), { passive: false });
```
> 주의: iOS Safari에서만 동작하는 이벤트이므로, Android에서는 viewport + touch-action이 핵심. 이 코드는 크로스 플랫폼 방어용.

**수정 파일**: `index.html`, `src/index.css`, (선택) `src/App.tsx`

---

## Bug #3: TWA 주소창 지속 노출

### 증상
TWA로 실행되었음에도 브라우저 주소창이 상단에 계속 보임 — DAL(Digital Asset Links) 인증 실패를 의미.

### 근본 원인 (Root Cause)

**핵심**: DAL 검증은 설정 파일 자체보다 **런타임 접근성과 도메인 일치**에서 실패할 가능성이 높음.

**현재 설정 점검:**

`public/.well-known/assetlinks.json`:
```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "me.inadone.twa",
    "sha256_cert_fingerprints": [
      "26:3E:4C:2A:DB:EE:F6:97:3A:E7:7B:5B:F7:4F:D3:4A:93:A9:E6:54:5D:02:FC:F6:98:93:B0:5F:82:72:52:2F"
    ]
  }
}]
```
→ 구조적으로 정상

**의심되는 실패 지점:**

| 체크포인트 | 상태 | 설명 |
|-----------|------|------|
| assetlinks.json 파일 존재 | ✅ | `public/.well-known/` 에 위치 |
| 파일 구조/문법 | ✅ | 올바른 JSON |
| SHA-256 지문 일치 | ⚠️ 검증 필요 | Play Console의 앱 서명 키 지문과 일치하는지 확인 |
| 프로덕션 도메인 접근성 | ⚠️ 검증 필요 | `https://[도메인]/.well-known/assetlinks.json` 직접 접근 테스트 |
| Content-Type 헤더 | ⚠️ 검증 필요 | `application/json`으로 서빙되는지 확인 |
| 리다이렉트 체인 | ⚠️ 검증 필요 | http→https 또는 www→non-www 리다이렉트가 DAL 검증을 깨뜨릴 수 있음 |
| Vercel 배포 설정 | ⚠️ 검증 필요 | `vercel.json` 없음 — 헤더 설정이 기본값에 의존 |

### 수정 계획

#### Step 3-1: 프로덕션 도메인에서 DAL 파일 접근성 확인
```bash
# 브라우저 또는 curl로 직접 확인
curl -I https://inadone.me/.well-known/assetlinks.json
# Content-Type: application/json 확인
# 200 OK 확인 (301/302 리다이렉트가 아닌지)
```

#### Step 3-2: Google의 DAL 검증 도구로 확인
```
https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://inadone.me&relation=delegate_permission/common.handle_all_urls
```

#### Step 3-3: SHA-256 지문 교차 확인
Play Console → 앱 → 설정 → 앱 무결성 → 앱 서명 키 인증서의 SHA-256 지문이 assetlinks.json의 값과 **정확히** 일치하는지 확인.

> **중요**: Play Console에서 "앱 서명 키"와 "업로드 키"는 다름. assetlinks.json에는 반드시 **앱 서명 키** 의 SHA-256을 넣어야 함.

#### Step 3-4: `vercel.json` 생성 — 헤더 명시 설정
```json
{
  "headers": [
    {
      "source": "/.well-known/assetlinks.json",
      "headers": [
        { "key": "Content-Type", "value": "application/json" },
        { "key": "Access-Control-Allow-Origin", "value": "*" }
      ]
    }
  ]
}
```

#### Step 3-5: (필요시) assetlinks.json 업데이트
SHA-256 불일치 발견 시, Play Console의 앱 서명 키 지문으로 교체.

**수정 파일**: `vercel.json` (신규 생성), (필요시) `public/.well-known/assetlinks.json`

---

## 실행 순서 및 검증

### 실행 우선순위

| 순서 | 버그 | 난이도 | 영향도 | 비고 |
|------|------|--------|--------|------|
| 1 | Bug #1 다크모드 | 낮음 | 높음 | 코드 변경만으로 즉시 해결 |
| 2 | Bug #2 뷰포트 축소 | 낮음 | 높음 | 코드 변경만으로 즉시 해결 |
| 3 | Bug #3 TWA 주소창 | 중간 | 높음 | 진단 단계 필요 (SHA-256 확인, 도메인 검증) |

### 수정 파일 총 목록

| 파일 | Bug #1 | Bug #2 | Bug #3 |
|------|--------|--------|--------|
| `index.html` | ✏️ meta 추가 | ✏️ viewport 수정 | — |
| `src/index.css` | ✏️ color-scheme | ✏️ touch-action, overscroll | — |
| `public/manifest.json` | ✏️ 테마 컬러 검토 | — | — |
| `vercel.json` | — | — | 🆕 신규 생성 |
| `public/.well-known/assetlinks.json` | — | — | ✏️ (지문 불일치 시) |
| `src/App.tsx` | — | ✏️ (선택: gesture 방어) | — |

### 검증 체크리스트

#### Bug #1 검증
- [ ] Android 설정 → 개발자 옵션 → "강제 다크 모드" 활성화 후 앱 실행
- [ ] Samsung 기본 브라우저에서 PWA 모드로 테스트
- [ ] Chrome에서 `chrome://flags/#enable-force-dark` 활성화 후 테스트
- [ ] 모든 화면(로그인, 태스크 목록, 메뉴, 설정)에서 텍스트 가독성 확인

#### Bug #2 검증
- [ ] Galaxy 기기에서 두 손가락 핀치 제스처 시도 → 줌 불가 확인
- [ ] 빠른 스와이프 제스처 반복 → 스케일 유지 확인
- [ ] 태스크 아이템 스와이프(삭제/완료) 기능이 정상 동작하는지 확인
- [ ] 탭바 가로 스크롤이 정상 동작하는지 확인

#### Bug #3 검증
- [ ] `https://[도메인]/.well-known/assetlinks.json` 직접 접근 → 200 OK + JSON 응답
- [ ] Google DAL 검증 도구에서 `linked: true` 확인
- [ ] Play Store에서 앱 설치 후 실행 → 주소창 없이 전체화면 확인
- [ ] 앱 종료 후 재실행 → 주소창 미노출 유지 확인

### 배포 주의사항
- Bug #1, #2는 프론트엔드 코드 변경이므로 Vercel 배포 후 즉시 반영
- Bug #3의 `vercel.json`은 재배포 필요
- TWA는 Chrome의 DAL 캐시가 있으므로, 변경 후 **앱 데이터 초기화** 또는 **24시간 대기** 필요할 수 있음
- 프로덕션 심사 중이므로, 심사 완료 후 업데이트 배포 타이밍 조율 필요
