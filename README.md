# My Memo - Premium Minimalist Task Manager

> React + TypeScript + Supabase로 구축된 프리미엄 미니멀 할 일 관리 앱

## ✨ 최신 기능

- ✅ **Phase 1 완료**: Vanilla JS → React + TypeScript + Vite 마이그레이션
- ⚡ **Optimistic UI**: 0ms 반응 속도 (즉각적인 UI 업데이트)
- ✏️ **인라인 편집**: Pencil 아이콘으로 Task 수정 (Enter 저장, Esc 취소)
- 🎨 **미니멀 디자인**: 시선을 방해하지 않는 심플한 UI
- 📱 **모바일 최적화**: 터치 친화적인 인터랙션

---

## 🚀 기술 스택

- **Frontend**: React 18 + TypeScript
- **Build Tool**: Vite (Lightning-fast HMR)
- **Styling**: Tailwind CSS
- **Icons**: lucide-react
- **Backend**: Supabase (PostgreSQL + Real-time)
- **Database**: Supabase PostgreSQL
- **UX Pattern**: Optimistic UI Updates

---

## 📦 프로젝트 구조

```
02/
├── src/
│   ├── components/          # React 컴포넌트
│   │   ├── TaskForm.tsx     # Task 입력 폼
│   │   ├── TaskItem.tsx     # 개별 Task 아이템
│   │   └── TaskList.tsx     # Task 목록
│   ├── hooks/               # 커스텀 React Hooks
│   │   └── useTasks.ts      # Task CRUD 로직
│   ├── lib/                 # 유틸리티 & 설정
│   │   ├── supabase.ts      # Supabase 클라이언트 (환경 변수 사용)
│   │   └── types.ts         # TypeScript 타입 정의
│   ├── App.tsx              # 메인 앱 컴포넌트
│   ├── main.tsx             # React 엔트리 포인트
│   └── index.css            # 글로벌 스타일
├── .env                     # 환경 변수 (⚠️ Git 추적 안 됨)
├── .env.example             # 환경 변수 예제
├── index.html               # HTML 템플릿
├── vite.config.ts           # Vite 설정
├── tailwind.config.js       # Tailwind 설정
└── package.json             # 의존성 관리
```

---

## 🔐 환경 변수 설정 (보안 필수!)

### 1. `.env` 파일 생성

프로젝트 루트에 `.env` 파일을 생성하고 Supabase 키를 입력하세요:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key_here
```

### 2. 보안 체크리스트

- ✅ `.env` 파일이 `.gitignore`에 포함되어 있는지 확인
- ✅ 코드에 직접 키를 하드코딩하지 않기
- ✅ 배포 시 Vercel/Netlify 환경 변수 설정 필수

### 3. Supabase 키 찾기

1. [Supabase Dashboard](https://app.supabase.com/) 접속
2. 프로젝트 선택 → Settings → API
3. `URL`과 `anon` / `public` 키 복사

---

## 🛠️ 로컬 개발 시작

### 1. 의존성 설치

```bash
npm install
```

### 2. 환경 변수 설정

```bash
cp .env.example .env
# .env 파일을 열어서 Supabase 키 입력
```

### 3. 개발 서버 실행

```bash
npm run dev
```

브라우저에서 [http://localhost:5173](http://localhost:5173) 접속

### 4. 프로덕션 빌드

```bash
npm run build
npm run preview  # 빌드 결과 미리보기
```

---

## 📊 Supabase 테이블 스키마

**테이블명**: `mytask`

| 컬럼명 | 타입 | 설명 |
|---|---|---|
| `id` | `int8` (PK) | 자동 증가 ID |
| `text` | `text` | 할 일 내용 |
| `is_completed` | `bool` | 완료 여부 (기본값: `false`) |
| `created_at` | `timestamptz` | 생성 시간 (자동) |
| `user_id` | `uuid` | 사용자 ID (Phase 2에서 활성화) |

**Phase 2 대비**: `user_id` 컬럼은 미리 생성해두고 `NULL` 허용 상태로 두기

---

## 🎯 주요 기능

### 1. **CRUD 기본 기능**
- ✅ Task 추가 (Create)
- ✅ Task 조회 (Read)
- ✅ Task 수정 (Update) - **인라인 편집**
- ✅ Task 삭제 (Delete)
- ✅ 완료 토글 (Toggle)

### 2. **⚡ Optimistic UI Updates**
- 즉각적인 UI 반응 (0ms 지연)
- 백그라운드 서버 동기화
- 실패 시 자동 롤백
- 로딩 스피너 최소화

**성능 개선:**
| 액션 | Before | After |
|---|---|---|
| 체크박스 토글 | ~300ms | **0ms** |
| Task 삭제 | ~250ms | **0ms** |
| Task 수정 | N/A | **0ms** |

### 3. **✏️ 인라인 편집 (Inline Editing)**
- 미니멀한 Pencil 아이콘 (gray-400 → hover:gray-600)
- 클릭 시 텍스트 → 입력창 전환
- 키보드 단축키:
  - **Enter**: 저장
  - **Esc**: 취소
  - **Blur**: 자동 저장
- 자동 포커스 + 전체 텍스트 선택

### 4. **🎨 미니멀리즘 디자인**
- Zinc 색상 팔레트 (차분한 회색 톤)
- 작고 심플한 아이콘 (lucide-react)
- 부드러운 애니메이션
- 모바일 터치 최적화

### 5. **📱 반응형 디자인**
- Mobile First 접근
- 터치 영역 최적화 (44px 최소 크기)
- 반응형 레이아웃 (sm:, md: 브레이크포인트)

---

## 🎯 주요 개선 사항 (Vanilla JS → React)

### 1. **컴포넌트 분리**
- Monolithic HTML → 재사용 가능한 React 컴포넌트

### 2. **타입 안정성**
- TypeScript로 런타임 에러 사전 방지

### 3. **상태 관리**
- `useTasks` 커스텀 훅으로 비즈니스 로직 분리

### 4. **보안 강화**
- 환경 변수로 Supabase 키 관리

### 5. **개발 경험**
- Vite HMR로 즉각적인 피드백
- ESLint로 코드 품질 관리

---

## 📚 상세 문서

- **[FEATURES_SUMMARY.md](./FEATURES_SUMMARY.md)** - 전체 기능 요약
- **[OPTIMISTIC_UI_GUIDE.md](./OPTIMISTIC_UI_GUIDE.md)** - Optimistic UI 패턴 가이드
- **[INLINE_EDIT_FEATURE.md](./INLINE_EDIT_FEATURE.md)** - 인라인 편집 구현 가이드
- **[PHASE1_COMPLETED.md](./PHASE1_COMPLETED.md)** - Phase 1 완료 보고서

---

## 🚧 다음 단계 (Phase 2 & 3)

### Phase 2: Authentication & Multi-User
- [ ] Supabase Auth 연동 (Google, Kakao, Apple 로그인)
- [ ] RLS (Row Level Security) 적용
- [ ] `user_id` 기반 데이터 격리

### Phase 3: Mobile App (Capacitor)
- [ ] Capacitor 설치 및 iOS/Android 프로젝트 생성
- [ ] Deep Link 설정 (OAuth Callback)
- [ ] 네이티브 기능 통합 (푸시 알림, Haptics 등)

---

## 🐛 트러블슈팅

### 문제: "Cannot find module '@/lib/supabase'"
**해결책**: TypeScript 경로 별칭 설정 확인
```json
// tsconfig.json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

### 문제: "Supabase 환경 변수가 설정되지 않았습니다"
**해결책**: 
1. `.env` 파일이 프로젝트 루트에 있는지 확인
2. 파일명이 정확히 `.env`인지 확인 (`.env.txt` ❌)
3. Vite 개발 서버 재시작 (`Ctrl+C` 후 `npm run dev`)

### 문제: CSS @import 에러
**해결책**: `@import`는 반드시 `@tailwind` 지시문보다 앞에 위치해야 함

---

## 📝 라이선스

MIT License

---

## 👨‍💻 개발자

**CTO & Senior Software Architect** at Unicorn Startup 🦄

**Contact**: 
- 문의사항은 GitHub Issues로 남겨주세요

---

## 🎨 스크린샷

> Phase 1 완료 시점의 UI는 기존 Vanilla JS 버전과 동일합니다.
> Phase 2~3에서 추가 기능과 함께 UI가 확장될 예정입니다.

---

**Made with ❤️ and Premium Minimalism**
