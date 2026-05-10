# Beads 운영 매뉴얼

이 문서는 현재 프로젝트에서 Beads(`bd`)를 Claude Code와 함께 운영하기 위한 상세 매뉴얼입니다.

`CLAUDE.md`에는 짧은 필수 규칙만 두고, 자세한 운영 기준과 예시는 이 문서를 참고합니다.

---

## 1. Beads의 역할

Beads는 프로젝트의 작업 상태를 저장하는 그래프 기반 작업 메모리입니다.

Claude Code의 대화 컨텍스트는 일시적이지만, Beads 그래프는 프로젝트 안에 남습니다. 따라서 Claude는 매번 대화 기억에 의존하지 않고 Beads 그래프를 읽어 현재 해야 할 일, 막힌 일, 발견된 일, 완료된 일을 파악해야 합니다.

이 프로젝트에서 Beads는 다음 목적에 사용합니다.

- 현재 진행 중인 작업 추적
- 작업 간 의존성 관리
- 작업 중 발견한 후속 작업 기록
- Claude Code 세션 간 프로젝트 기억 유지
- TODO 파일이나 채팅 기록을 대체하는 durable task memory 제공

---

## 2. 기본 개념

### 2.1 Bead

Bead는 하나의 작업 단위입니다.

예:

- 기능 구현
- 버그 수정
- 테스트 추가
- 문서 정리
- 리팩터링
- 조사 작업
- 에픽 단위의 큰 작업 묶음

일반적인 bead는 다음 정보를 가집니다.

- id
- title
- type
- priority
- status
- description
- acceptance criteria
- relationships

---

### 2.2 Type

사용할 수 있는 대표 타입은 다음과 같습니다.

| Type | 용도 |
|---|---|
| `epic` | 여러 작업을 묶는 큰 작업 단위 |
| `task` | 일반 구현 작업 |
| `feature` | 사용자에게 보이는 새 기능 |
| `bug` | 결함, 오류, 회귀 문제 |
| `chore` | 정리, 설정, 유지보수, 도구 개선 |

타입 선택 기준:

- 여러 하위 작업을 묶어야 하면 `epic`
- 구체적인 구현 단위면 `task`
- 사용자 관점의 기능이면 `feature`
- 깨진 동작을 고치는 일이면 `bug`
- 빌드, 설정, 문서, 정리면 `chore`

---

### 2.3 Priority

우선순위는 보통 `0`부터 `4`까지 사용합니다.

| Priority | 의미 |
|---|---|
| `0` | 긴급, 즉시 처리 |
| `1` | 높음 |
| `2` | 보통 |
| `3` | 낮음 |
| `4` | 언젠가 처리 |

기본값은 보통 `2`를 사용합니다.

중요한 버그, 빌드 실패, 현재 목표를 막는 작업은 `1` 이상으로 올립니다.

---

### 2.4 Relationship

Beads의 핵심은 작업 사이의 관계입니다.

| 관계 | 의미 | 사용 시점 |
|---|---|---|
| `parent-child` | 에픽과 하위 작업 | 큰 작업을 여러 작은 작업으로 나눌 때 |
| `blocks` | 한 작업이 다른 작업을 막음 | 선행 작업이 끝나야 다음 작업을 할 수 있을 때 |
| `discovered-from` | 작업 중 새 작업 발견 | 구현 중 버그, 누락, 후속 작업을 발견했을 때 |
| `related` | 느슨한 관련성 | 직접적인 의존성은 없지만 함께 참고할 때 |

주의:

- `blocks`는 `bd ready` 결과에 영향을 줍니다.
- 단순히 관련 있는 정도라면 `blocks`를 쓰지 말고 `related`를 씁니다.
- 작업 중 새로 발견된 것은 가능한 한 `discovered-from`으로 연결합니다.

---

## 3. 설치와 초기화

### 3.1 설치

macOS/Linux:

```bash
brew install beads
```

또는:

```bash
curl -fsSL https://raw.githubusercontent.com/gastownhall/beads/main/scripts/install.sh | bash
```

설치 확인:

```bash
bd version
bd help
```

---

### 3.2 현재 프로젝트에서 초기화

프로젝트 루트에서 실행합니다.

```bash
cd /path/to/current-project
bd init --quiet
```

상태 확인:

```bash
bd doctor
bd ready --json
```

초기화 후 `.beads/` 디렉터리가 생성됩니다.

---

### 3.3 Claude Code 연동

```bash
bd setup claude
bd setup claude --check
```

확인:

```bash
bd prime
bd ready --json
```

`bd prime`이 정상적으로 현재 그래프 요약과 사용 지침을 출력하면 Claude Code에서 세션 시작 시 Beads 컨텍스트를 받을 수 있습니다.

---

## 4. 현재 프로젝트의 초기 그래프 만들기

Beads는 프로젝트 코드를 자동으로 완벽히 분석해 그래프를 만들어주는 도구가 아닙니다. 초기에는 Claude Code에게 프로젝트를 스캔하게 하고, 현재 목표와 코드 상태를 기준으로 작업 그래프를 만들게 해야 합니다.

---

### 4.1 Claude Code에 줄 초기 그래프 생성 프롬프트

아래 프롬프트를 Claude Code에 그대로 붙여넣습니다.

```text
현재 프로젝트에 Beads 작업 그래프를 초기 생성해줘.

목표:
- 이 프로젝트의 현재 상태를 읽고, 앞으로 진행할 작업을 Beads issue 그래프로 만든다.
- Markdown TODO나 임시 계획 파일이 아니라 `bd`를 single source of truth로 사용한다.
- 이미 Beads issue가 있으면 중복 생성하지 말고 기존 그래프를 확장한다.

먼저 실행:
1. `bd list --status open --json`
2. `bd ready --json`
3. `git status --short`
4. `git log --oneline -20`
5. 프로젝트 구조, README, docs, package/build/test 설정, TODO/FIXME 주석, failing test가 있으면 확인

그래프 생성 규칙:
- 큰 기능/흐름은 `epic`으로 만든다.
- 구현 가능한 작업은 `task`, 새 기능은 `feature`, 버그는 `bug`, 유지보수는 `chore`로 만든다.
- 모든 `bd create`에는 반드시 `--description`을 포함한다.
- 가능하면 `--acceptance`에 완료 기준을 넣는다.
- epic 하위 작업은 `--parent <epic-id>`로 연결한다.
- 선행 작업이 필요한 경우 `bd dep add <blocked-task-id> <blocker-task-id>`로 blocks 관계를 만든다.
- 작업 중 발견한 새 이슈는 `--deps discovered-from:<current-id>`로 연결한다.
- 단순히 관련만 있는 경우에는 related 관계를 사용한다.
- 초기 그래프는 너무 크게 만들지 말고, 우선순위 높은 10~20개 이내로 시작한다.
- 마지막에 `bd dep cycles`로 순환 의존성이 없는지 확인하고, `bd ready --json`으로 바로 할 수 있는 일을 보여줘.
- 완료 후 `bd sync`를 실행해라.
```

---

### 4.2 수동 초기 그래프 예시

큰 작업 단위부터 만듭니다.

```bash
bd create "Stabilize current project baseline" \
  -t epic \
  -p 1 \
  --description "현재 프로젝트의 구조, 빌드, 테스트, 핵심 미완료 작업을 Beads 그래프로 정리하고 안정화한다." \
  --acceptance "핵심 작업이 Beads issue로 정리되고 ready queue가 정상적으로 동작한다." \
  --json
```

하위 작업을 만듭니다.

```bash
bd create "Document build and test commands" \
  --parent <epic-id> \
  -t task \
  -p 1 \
  --description "README, package/build 설정, CI 설정을 확인해 프로젝트의 표준 build/test 명령을 정리한다." \
  --acceptance "CLAUDE.md에 build/test 명령이 반영되어 Claude가 매 작업 전후 실행할 수 있다." \
  --json
```

```bash
bd create "Identify current failing tests or type errors" \
  --parent <epic-id> \
  -t bug \
  -p 1 \
  --description "현재 테스트, 타입체크, 린트 실행 결과를 확인하고 실패 원인을 issue로 분리한다." \
  --acceptance "실패 항목이 재현 명령과 함께 Beads issue로 기록된다." \
  --json
```

---

## 5. 일상적인 Claude Code 작업 흐름

### 5.1 세션 시작

Claude는 작업을 시작하기 전에 항상 다음을 실행합니다.

```bash
bd ready --json
```

그 다음 현재 요청에 맞는 bead를 선택합니다.

```bash
bd show <id> --json
bd update <id> --claim --json
```

적절한 bead가 없으면 새로 만듭니다.

```bash
bd create "<title>" \
  -t task \
  -p 2 \
  --description "<context, scope, and expected outcome>" \
  --acceptance "<completion criteria>" \
  --json
```

---

### 5.2 작업 중

작업 중에는 Beads 그래프를 계속 갱신합니다.

새로운 후속 작업을 발견한 경우:

```bash
bd create "<new work title>" \
  -t task \
  -p 2 \
  --description "<what was found, where, why it matters, and expected outcome>" \
  --acceptance "<how to know this is complete>" \
  --deps discovered-from:<current-bead-id> \
  --json
```

새로운 버그를 발견한 경우:

```bash
bd create "<bug title>" \
  -t bug \
  -p 1 \
  --description "<bug behavior, location, reproduction hint, and impact>" \
  --acceptance "<expected fixed behavior>" \
  --deps discovered-from:<current-bead-id> \
  --json
```

의존성이 생긴 경우:

```bash
bd dep add <blocked-task-id> <blocker-task-id>
```

확인:

```bash
bd ready --json
bd blocked --json
```

---

### 5.3 작업 완료

작업이 실제로 끝났을 때만 close합니다.

```bash
bd close <id> --reason "<what changed, files touched, and checks run>" --json
```

이후 남은 작업을 확인합니다.

```bash
bd ready --json
bd blocked --json
bd sync
```

---

## 6. 좋은 bead 작성 기준

### 6.1 좋은 title

좋은 title은 짧고 행동 중심입니다.

좋은 예:

```text
Add login validation tests
Fix payment retry timeout
Document production build command
Refactor auth token parsing
```

나쁜 예:

```text
Stuff
Fix things
Improve code
Need to check this later
```

---

### 6.2 좋은 description

좋은 description에는 다음이 들어갑니다.

- 왜 필요한지
- 어느 파일/영역과 관련 있는지
- 작업 범위
- 기대 결과
- 주의할 점

예:

```bash
bd create "Add login validation tests" \
  -t task \
  -p 2 \
  --description "Add tests for login form validation around missing email, invalid email format, short password, and server-side error display. Relevant area: src/auth and tests/auth." \
  --acceptance "Validation tests cover expected success and failure paths and pass in the standard test command." \
  --json
```

---

### 6.3 좋은 acceptance criteria

좋은 acceptance criteria는 완료 여부를 객관적으로 판단할 수 있어야 합니다.

좋은 예:

```text
`npm test` passes and login validation has tests for missing email, invalid email, and short password.
```

나쁜 예:

```text
Works well.
```

---

## 7. 관계 사용 예시

### 7.1 Epic과 child

```bash
bd create "Improve authentication flow" \
  -t epic \
  -p 1 \
  --description "Group authentication-related improvements, bug fixes, and tests." \
  --json
```

```bash
bd create "Add login validation tests" \
  --parent <epic-id> \
  -t task \
  -p 2 \
  --description "Add coverage for login validation edge cases." \
  --acceptance "Relevant tests pass." \
  --json
```

---

### 7.2 Blocks

상황:

- `Add login validation tests`는 `Extract auth validation helper`가 먼저 끝나야 가능함.

명령:

```bash
bd dep add <add-tests-id> <extract-helper-id>
```

의미:

```text
<extract-helper-id> blocks <add-tests-id>
```

---

### 7.3 Discovered-from

상황:

- 로그인 작업 중 비밀번호 재설정 버그를 발견함.

명령:

```bash
bd create "Fix password reset expired-token error" \
  -t bug \
  -p 1 \
  --description "While working on login validation, found that expired password reset tokens show a generic server error instead of a user-friendly message." \
  --acceptance "Expired reset tokens show a clear error message and test coverage exists." \
  --deps discovered-from:<login-task-id> \
  --json
```

---

### 7.4 Related

상황:

- 직접적인 선후관계는 없지만 두 작업이 같은 도메인에 있음.
- 필요하면 related 관계를 사용하되, hard dependency가 아니면 blocks를 쓰지 않습니다.

---

## 8. 점검 명령어 모음

현재 바로 가능한 작업:

```bash
bd ready --json
```

열린 작업 목록:

```bash
bd list --status open --json
```

특정 작업 상세:

```bash
bd show <id> --json
```

막힌 작업:

```bash
bd blocked --json
```

의존성 순환 확인:

```bash
bd dep cycles
```

작업 claim:

```bash
bd update <id> --claim --json
```

작업 완료:

```bash
bd close <id> --reason "<reason>" --json
```

동기화:

```bash
bd sync
```

상태 진단:

```bash
bd doctor
```

---

## 9. `CLAUDE.md`와 이 문서의 역할 분리

### `CLAUDE.md`

Claude가 매번 반드시 읽어야 하는 짧은 규칙만 넣습니다.

포함할 내용:

- Beads를 single source of truth로 사용
- 세션 시작 시 `bd ready --json`
- 작업 시작 전 `bd show`, `bd update --claim`
- 없으면 `bd create`
- 발견한 작업은 `discovered-from`
- 의존성은 `bd dep add`
- 완료 시 `bd close`, `bd sync`

### `docs/beads.md` 또는 `beads.md`

상세 운영 매뉴얼입니다.

포함할 내용:

- 설치/초기화
- 초기 그래프 생성법
- relationship 설명
- 좋은 bead 작성법
- 명령어 예시
- 운영 원칙

추천:

```text
CLAUDE.md      # 짧은 필수 규칙
docs/beads.md  # 긴 운영 매뉴얼
```

---

## 10. 운영 원칙

### 10.1 Beads가 source of truth

작업 상태는 채팅 기록이나 개인 메모가 아니라 Beads에 남깁니다.

Claude가 어떤 작업을 했는지, 무엇이 막혔는지, 새로 발견한 것이 무엇인지는 Beads 그래프에서 확인할 수 있어야 합니다.

---

### 10.2 너무 큰 그래프를 만들지 않기

초기부터 수십 개 이상의 모호한 작업을 만들면 오히려 관리가 어려워집니다.

권장:

- 처음에는 10~20개 이하
- 우선순위 높은 것부터
- 실제로 실행 가능한 단위로
- 큰 것은 epic으로 묶고 child로 나누기

---

### 10.3 `blocks`는 아껴 쓰기

`blocks`는 ready queue에 영향을 주므로, 진짜 선행 작업이 필요한 경우에만 사용합니다.

단순히 관련 있는 정도라면 `related`를 사용합니다.

---

### 10.4 발견한 작업은 바로 남기기

Claude가 작업 중 새 버그나 누락된 테스트를 발견했는데 채팅에만 말하고 Beads에 남기지 않으면 다음 세션에서 사라질 수 있습니다.

따라서 발견 즉시 다음 형태로 남깁니다.

```bash
bd create "<title>" \
  -t bug \
  -p 2 \
  --description "<what was discovered and why it matters>" \
  --deps discovered-from:<current-id> \
  --json
```

---

### 10.5 완료 기준 없는 작업은 닫지 않기

작업이 진짜 완료되었는지 확인하려면 acceptance criteria와 검증 명령이 필요합니다.

완료 전 확인:

- 코드 변경 완료
- 관련 테스트 추가 또는 수정
- lint/typecheck/build/test 실행
- 결과 확인
- 남은 후속 작업은 별도 bead로 생성

---

## 11. Claude Code에게 자주 줄 프롬프트

### 11.1 그래프 확인 후 작업 시작

```text
Beads 그래프를 먼저 확인하고 진행해.
`bd ready --json`으로 현재 가능한 작업을 보고, 이번 요청에 맞는 bead가 있으면 claim 후 진행해.
없으면 새 bead를 만들고 관계를 연결해.
작업 중 발견한 새 이슈는 `discovered-from:<현재 bead>`로 연결하고, 끝나기 전에 close와 `bd sync`까지 해줘.
```

---

### 11.2 현재 프로젝트 초기 그래프 생성

```text
현재 프로젝트의 README, docs, build/test 설정, 소스 구조, TODO/FIXME, 최근 git log를 확인해서 Beads 초기 그래프를 만들어줘.
큰 흐름은 epic으로 만들고, 실제 구현 가능한 작업은 child task로 만들어.
선행 관계가 있으면 blocks로 연결하고, 마지막에 `bd dep cycles`, `bd ready --json`, `bd sync`를 실행해줘.
```

---

### 11.3 작업 중 발견한 것까지 정리

```text
이번 작업을 진행하면서 발견한 버그, 누락 테스트, 리팩터링 필요 사항은 채팅에만 남기지 말고 Beads에 별도 issue로 만들고 `discovered-from:<현재 bead>`로 연결해줘.
```

---

### 11.4 마무리 점검

```text
작업을 마치기 전에 관련 테스트/타입체크/린트를 실행하고, 완료된 bead는 close하고, 남은 ready/blocked 작업을 보여준 뒤 `bd sync`까지 해줘.
```

---

## 12. 추천 파일 구성

```text
project-root/
├─ CLAUDE.md
├─ docs/
│  └─ beads.md
└─ .beads/
```

단순한 개인 프로젝트라면 루트에 둘 수도 있습니다.

```text
project-root/
├─ CLAUDE.md
├─ beads.md
└─ .beads/
```

팀 프로젝트라면 `docs/beads.md`를 추천합니다.

---

## 13. 마지막 요약

Beads 운영의 핵심은 간단합니다.

```text
시작할 때 읽는다: bd ready --json
작업을 고른다: bd show / bd update --claim
없으면 만든다: bd create
중간에 발견하면 남긴다: bd create --deps discovered-from:<id>
막히면 연결한다: bd dep add
끝나면 닫는다: bd close
마지막에 저장한다: bd sync
```

채팅 컨텍스트는 임시 기억입니다.

Beads 그래프가 프로젝트의 durable memory입니다.
