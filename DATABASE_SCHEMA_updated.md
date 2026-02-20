# 🗄️ INA-Planner Database Schema Definition

이 문서는 INA-Planner 프로젝트의 공식 데이터베이스 구조를 정의합니다. 모든 테이블은 Supabase(PostgreSQL) 환경을 기준으로 설계되었습니다.

## 1. 테이블 요약
| 테이블명 | 역할 | 주요 관계 |
| :--- | :--- | :--- |
| **`profiles`** | 사용자 환경 설정 및 프로필 관리 | `auth.users.id` (1:1) |
| **`tabs`** | 메모 분류를 위한 카테고리(탭) | `mytask.tab_id` (1:N) |
| **`mytask`** | 실제 메모 및 할 일 데이터 | `tabs.id` (N:1), `auth.users.id` (N:1) |

---

## 2. 상세 정의

### 📊 public.profiles
사용자의 기본 앱 설정 정보를 저장합니다.
* **Columns**:
    * `id` (uuid, PK): 사용자 고유 식별자 (`auth.users.id` 참조)
    * `app_title` (text): 앱 상단에 표시될 타이틀 (기본값: 'Today''s Tasks')
    * `updated_at` (timestamptz): 마지막 수정 시간

### 📂 public.tabs
사용자가 생성한 메모 분류 탭입니다.
* **Columns**:
    * `id` (bigint, PK): 탭 고유 번호 (Auto Increment)
    * `title` (text): 탭 이름
    * `user_id` (uuid): 소유자 ID
    * `order_index` (integer): 정렬 순서

### 📝 public.mytask
실제 메모 데이터가 저장되는 핵심 테이블입니다.
* **Columns**:
    * `id` (bigint, PK): 메모 고유 번호
    * `text` (text): 메모 내용 (Not Null)
    * `is_completed` (boolean): 완료 여부
    * `tab_id` (bigint, FK): 소속된 탭 ID (`tabs.id` 참조, 삭제 시 SET NULL)
    * `user_id` (uuid, FK): 소유자 ID
    * `deleted_at` (timestamptz): 휴지통 이동 시간 (Soft Delete)
    * `last_tab_title` (text): 탭 삭제 시 복구를 위한 백업용 이름

---

## 3. 관계 및 제약 조건 (Constraints)
* **Soft Delete**: `mytask`는 직접 삭제 대신 `deleted_at` 컬럼을 사용하여 휴지통 기능을 지원합니다.
* **Data Integrity**: `tabs` 삭제 시 연결된 `mytask`는 삭제되지 않고 `tab_id`가 `NULL` 처리되어 데이터 증발을 방지합니다.