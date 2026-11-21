# 수정 → 확인 → 승인 절차 (v1.0, 2026-11-20)

> 누가 읽어도 따라 할 수 있게 쓴 문서입니다.
> 🔴 **이 저장소는 운영 중인 domokup.ru 를 자동으로 바꾸지 않습니다.** 여기서 하는 모든 일은 「미리보기」 안에서만 일어납니다.

| 판 | 날짜 | 바뀐 것 |
|---|---|---|
| v1.0 | 2026-11-20 | 처음 작성 |

---

## 한눈에 보기

```
 ① 수정 요청 (이슈)          대표·직원이 미리보기를 보고 「여기 고쳐 주세요」를 적는다
        │
 ② 작업 가지 만들기          작업자가 main 을 건드리지 않고 따로 고친다
        │
 ③ PR (자동 검사)            「이렇게 고쳤습니다」 제출 → 로봇이 무게·속도·접근성·링크를 검사
        │                    검사 하나라도 실패 → 병합 버튼이 잠김
 ④ main 에 병합              검사 통과 + 검토 후 반영
        │
 ⑤ 미리보기 자동 갱신         몇 분 뒤 https://petlegend.github.io/domokup-preview/ 가 바뀜
        │
 ⑥ 대표 승인                 대표가 휴대폰·PC 로 보고 「OK」
        │
 ⑦ 승인 태그                 그 순간을 v1.0-approved 처럼 이름 붙여 저장 (사진 찍어 두기)
        │
 ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ 여기까지가 이 저장소 ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
        │
 ⑧ 운영 반영 (별도 절차)      백업 → 스테이징 → 플러그인/테마 업로드. 사람이 직접, 건별 승인
```

---

## 단계별 설명

### ① 수정 요청 — 이슈

- 저장소 **Issues → New issue → 「수정 요청」** 양식을 고릅니다.
- 적는 것: **어느 페이지 · 어느 기기 · 무엇이 문제 · 원하는 모습 · 스크린샷**
- 화면이 깨지거나 작동하지 않으면 **「버그」** 양식을 씁니다.
- 빈 이슈는 만들 수 없게 막혀 있습니다 (양식으로만).
- 🔴 고객 개인정보·비밀번호는 적지 않습니다 — 공개 저장소입니다.

### ② 작업 가지 (branch)

- 작업자는 `main` 을 직접 고치지 않고, 따로 **작업 가지**를 만들어 고칩니다.
- 가지 이름 예: `fix/12-banner-text` (12 = 이슈 번호)
- `main` 은 보호되어 있어 직접 올릴 수 없습니다.

### ③ PR — 자동 검사

- 고친 내용을 **PR(Pull Request, 반영 요청)** 로 올립니다. 양식에 **무엇·왜·리스크·되돌리기·PC/모바일 확인**을 적습니다.
- 올리는 순간 로봇이 3가지 검사를 돌립니다.

| 검사 이름 | 무엇을 보나 |
|---|---|
| **빌드·HTML·링크** | 사이트가 만들어지는지 · HTML 문법 · 이미지 1장 200KB 이하 · JS 합계 30KB 이하 · 깨진 링크 |
| **Lighthouse(모바일)** | 휴대폰 기준 점수(성능·접근성·모범사례 ≥90) · 첫 화면 ≤1.2MB · LCP ≤2.5초 · CLS ≤0.1 |
| **접근성(pa11y)** | 시각장애인 화면낭독기·키보드로 쓸 수 있는지 (WCAG 2 AA) |

- 하나라도 ❌ 이면 **병합 버튼이 잠깁니다.** 고쳐서 다시 올리면 자동으로 다시 검사합니다.
- Lighthouse 보고서는 Actions 화면의 `lighthouse-report` 파일로 내려받을 수 있습니다.

### ④ main 에 병합

- 검사가 모두 ✅ 이고 검토가 끝나면 **Squash and merge** 로 반영합니다 (PR 하나 = 기록 한 줄).

### ⑤ 미리보기 자동 갱신

- `main` 에 반영되면 「Deploy preview」 작업이 자동으로 돌고, 몇 분 뒤 미리보기 주소가 바뀝니다.
- 배포 전에 모든 페이지에 `noindex`(검색 제외)가 있는지 다시 확인하고, 빠졌으면 배포를 멈춥니다.

### ⑥ 대표 승인

- 대표가 **휴대폰과 PC 둘 다**로 미리보기를 봅니다.
- 고칠 점이 있으면 → ① 로 돌아가 수정 요청.
- 좋으면 → 「OK」 (이슈나 메신저로).

### ⑦ 승인 태그 (릴리스)

- 승인된 순간을 **태그**로 저장합니다. 나중에 「그때 그 화면」으로 언제든 돌아갈 수 있습니다.
- 만드는 곳: **Releases → Draft a new release → Choose a tag** 에 이름 입력 → Target `main` → 설명에 「무엇이 승인됐는지」 → Publish.

#### 버전 규칙

| 이름 | 언제 |
|---|---|
| `v1.0-approved` | 첫 전체 승인 |
| `v1.1-approved`, `v1.2-approved` … | 승인 후 부분 수정을 다시 승인받을 때 (작은 숫자 +1) |
| `v2.0-approved` | 화면 구조가 크게 바뀌어 다시 전체 승인받을 때 (큰 숫자 +1) |

- 태그는 **한 번 만들면 고치거나 지우지 않습니다.** 잘못됐으면 다음 번호로 새로 만듭니다.
- 승인 태그는 대표(관리자)만 만들 수 있게 보호합니다 (아래 설정 목록).

### ⑧ 운영 반영 — 이 저장소 밖의 별도 절차

이 저장소의 어떤 자동 작업도 **domokup.ru 에 접속하거나 파일을 올리지 않습니다.** 운영 반영은 사람이 아래 순서로 따로 합니다.

1. 반영할 **승인 태그**를 정한다 (예: `v1.0-approved`)
2. 운영 사이트 **백업** (파일 + DB) — 되돌릴 길부터 만든다
3. **스테이징**(운영과 분리된 시험 사이트)에 먼저 올려 확인
4. 운영에 **WordPress 플러그인/테마 업로드** 방식으로 반영 — 한 번에 하나씩
5. 반영 직후 PC·모바일로 확인, `noindex` 가 빠졌는지·SEO 점수 ≥90 인지 확인
6. 이상하면 즉시 2번 백업으로 되돌림
7. 매 단계 「왜 · 무엇이 개선 · 리스크」를 먼저 보고하고 **건별 승인**을 받는다 (domokup 저장소 원칙)

---

## 되돌리기

| 상황 | 방법 | 걸리는 시간 |
|---|---|---|
| **방금 병합한 PR 하나를 취소** | 그 PR 화면 → **Revert** 버튼 → 생긴 PR 을 병합 | 검사 포함 약 10분 |
| **미리보기를 이전 승인 상태로 급히 되돌림** | **Actions → Deploy preview → Run workflow** → `ref` 칸에 `v1.0-approved` 같은 태그 입력 → Run | 약 3분 |
| **배포 기록에서 이전 판 다시 올리기** | Actions → 성공했던 이전 「Deploy preview」 실행 → **Re-run all jobs** | 약 3분 |

- 🔴 「Run workflow 로 태그 재배포」는 **화면만 임시로** 되돌립니다. `main` 의 내용은 그대로라서 다음 병합 때 다시 새 화면이 나옵니다.
  영구히 되돌리려면 **Revert PR** 로 `main` 자체를 되돌려야 합니다.
- 운영 사이트(domokup.ru)는 이 저장소와 무관하므로, 미리보기를 되돌려도 운영 화면은 바뀌지 않습니다.

---

## ✅ 대표가 GitHub 에서 직접 켜야 할 설정

> 저장소를 만든 뒤 **한 번만** 하면 됩니다. 모두 무료(공개 저장소 기준)입니다.
> 자동화가 대신 켜지 않습니다 — 대표가 직접 확인하며 켭니다.

### 1. 미리보기 배포

- [ ] **Settings → Pages → Build and deployment → Source = 「GitHub Actions」**
      (이걸 켜야 deploy.yml 이 작동합니다)
- [ ] **Settings → Environments → github-pages → Deployment branches and tags** = `main` 만 허용

### 2. main 보호 (Settings → Rules → Rulesets → New branch ruleset)

- [ ] 대상: Default branch (`main`), Enforcement = **Active**
- [ ] **Restrict deletions** (main 삭제 금지)
- [ ] **Block force pushes** (기록 덮어쓰기 금지)
- [ ] **Require a pull request before merging** (직접 push 금지, PR 로만)
  - 혼자 운영하는 동안은 「Required approvals = 0」 — 자기 PR 은 스스로 승인할 수 없기 때문입니다
  - 검토자가 생기면 「Required approvals = 1」 + 「Require review from Code Owners」 켜기
- [ ] **Require status checks to pass** — 아래 3개를 필수로 추가 (PR 을 한 번 올려 검사가 돈 뒤에 목록에 나타납니다)
  - [ ] `빌드·HTML·링크`
  - [ ] `Lighthouse(모바일)`
  - [ ] `접근성(pa11y)`
  - [ ] 「Require branches to be up to date before merging」 켜기
- [ ] **Require linear history** (기록을 한 줄로 — Squash merge 와 짝)

### 3. 승인 태그 보호 (Settings → Rules → Rulesets → New tag ruleset)

- [ ] 대상 태그: `v*-approved`
- [ ] **Restrict creations / updates / deletions** — 관리자만 만들 수 있고, 아무도 고치거나 지울 수 없게

### 4. 보안 (Settings → Code security)

- [ ] **Secret scanning** 켜기 (비밀값이 올라오면 알림)
- [ ] **Push protection** 켜기 (비밀값이 섞인 push 를 아예 막음)
- [ ] **Private vulnerability reporting** 켜기 (SECURITY.md 의 비공개 신고 창구)
- [ ] **Dependabot alerts** 켜기
- [ ] **Dependabot security updates** 켜기
- [ ] (선택) **Code scanning → CodeQL default setup** — 공개 저장소는 무료. JS 가 적어 효과는 작습니다

### 5. 자동화 권한 (Settings → Actions → General)

- [ ] **Workflow permissions = 「Read repository contents」** (기본을 읽기 전용으로 — 각 작업이 필요한 권한만 따로 씁니다)
- [ ] 「Allow GitHub Actions to create and approve pull requests」 **끄기**
- [ ] **Fork pull request workflows** — 외부인 PR 은 「Require approval for all external contributors」

### 6. 이슈 정리

- [ ] Issues → Labels 에 **`수정 요청`**, **`버그`**, **`dependencies`** 라벨 만들기 (양식이 자동으로 붙이는 라벨 — 없으면 안 붙습니다)
- [ ] Settings → General → Pull Requests: **Allow squash merging 만 켜기**, 「Automatically delete head branches」 켜기


## 검사 예외 기록

- 2026-11-21 · 접근성 검사(pa11y)에서 **모바일 하단 고정 구매바(`.buybar`)만 제외**한다. 본문의 「В корзину」 버튼과 같은 기능을 반복하는 보조 요소다. 화면 아래에 겹쳐 떠 있어서 검사 도구가 배경색을 판정하지 못해 오류로 센다(실측 대비 6.3:1, 기준 4.5:1 통과). 본문 버튼은 그대로 검사한다.
