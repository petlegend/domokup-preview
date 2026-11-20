# domokup-preview — domokup.ru 리뉴얼 미리보기

> 🔴 **이 저장소는 운영 중인 쇼핑몰 domokup.ru 를 절대 건드리지 않습니다.**
> 여기서 만드는 것은 리뉴얼 화면을 미리 보고 승인받기 위한 **정적 미리보기**입니다.
> 주문·결제·회원·재고 기능은 없고, 운영 서버와 연결되어 있지도 않습니다.

## 보는 주소

| 무엇 | 주소 |
|---|---|
| **미리보기 화면** | https://petlegend.github.io/domokup-preview/ |
| 수정 요청 남기기 | https://github.com/petlegend/domokup-preview/issues/new/choose |
| 자동 검사·배포 기록 | https://github.com/petlegend/domokup-preview/actions |
| 승인된 버전 목록 | https://github.com/petlegend/domokup-preview/releases |

- 미리보기의 모든 페이지에는 `noindex` 가 들어 있어 Яндекс·Google 검색에 잡히지 않습니다. (빠지면 배포가 자동으로 멈춥니다.)
- `main` 에 반영되면 몇 분 안에 미리보기 주소가 자동으로 갱신됩니다.

## 일하는 순서 (요약)

수정 요청(이슈) → 작업 가지 → PR(자동 검사) → `main` 병합 → 미리보기 자동 갱신 → 대표 승인 → 승인 태그(`v1.0-approved` 등)

운영 사이트 반영은 **이 저장소 밖의 별도 절차**입니다. 자세한 내용: [docs/APPROVAL-FLOW.md](docs/APPROVAL-FLOW.md)

## 폴더 구조

```
domokup-preview/
├─ src/                  원본 (화면 재료)
│  ├─ assets/            css · js · img
│  └─ data/              러시아어 문구 · 상품 정보 (공개 정보만)
├─ scripts/build.mjs     빌드 프로그램 — src/ 를 읽어 dist/ 를 만든다
├─ dist/                 빌드 결과 (자동 생성, 저장소에 올리지 않음)
├─ docs/                 운영 문서 (승인 절차 등)
├─ .github/
│  ├─ workflows/ci.yml       자동 품질 검사 (PR·push 때)
│  ├─ workflows/deploy.yml   미리보기 배포 (main 병합 때)
│  ├─ ISSUE_TEMPLATE/        「수정 요청」·「버그」 양식
│  ├─ PULL_REQUEST_TEMPLATE.md
│  ├─ CODEOWNERS · dependabot.yml
├─ lighthouserc.json     Lighthouse 기준 (점수·속도·무게)
├─ budget.json           무게 예산
├─ .pa11yci.json         접근성 검사 설정
├─ .htmlvalidate.json    HTML 문법 검사 설정
└─ SECURITY.md           보안 정책 (비밀값·개인정보 금지)
```

## 로컬에서 보기

필요한 것: Node.js LTS (https://nodejs.org)

```bash
node scripts/build.mjs                 # dist/ 만들기
npx --yes http-server@14 dist -p 8080  # http://localhost:8080 에서 보기
```

자동 검사를 내 PC 에서 미리 돌려보기 (선택):

```bash
npx --yes html-validate@11 "dist/**/*.html"
npx --yes @lhci/cli@0.16 collect && npx --yes @lhci/cli@0.16 assert
```

> 화면 안의 링크·이미지 주소는 **상대 경로**(`./`, `../`)로 만들어야 합니다.
> 미리보기는 `/domokup-preview/` 아래에서, 검사는 서버 맨 위(`/`)에서 열리기 때문에 `/` 로 시작하는 주소는 한쪽에서 깨집니다.

## 품질 기준 (그룹 「웹/앱 제작 5대 원칙」)

하나라도 못 지키면 자동 검사가 실패하고 PR 을 병합할 수 없습니다.

| 항목 | 기준 | 검사 도구 |
|---|---|---|
| 첫 화면 총 무게 | **≤ 1.2MB** | Lighthouse (`resource-summary:total`) · budget.json |
| 자체 JS | **≤ 30KB** | Lighthouse · CI 합계 검사 |
| 이미지 1장 | **≤ 200KB** (WebP 권장) | CI 파일 크기 검사 |
| 외부(제3자) 스크립트·웹폰트 | **0개** | Lighthouse · budget.json |
| LCP (주요 내용이 보이는 시간) | **≤ 2.5초** (모바일) | Lighthouse |
| CLS (화면 밀림) | **≤ 0.1** | Lighthouse |
| 성능 · 접근성 · 모범사례 점수 | **각 ≥ 90점** | Lighthouse (모바일) |
| SEO 점수 | ≥ 90점 — **경고만** (아래 참고) | Lighthouse |
| HTML 문법 | 오류 0 | html-validate |
| 사이트 안쪽 깨진 링크 | 0 | lychee (외부 링크 제외) |
| 접근성 (WCAG 2 AA) | 오류 0 | pa11y-ci (axe + HTML_CodeSniffer) |

### SEO 점수를 「경고」로만 두는 이유

미리보기는 검색에 잡히면 안 되므로 모든 페이지에 `noindex` 를 넣습니다.
그러면 Lighthouse 의 「검색엔진이 수집할 수 있음(is-crawlable)」 항목이 **일부러** 실패하고, SEO 점수가 크게 떨어집니다.

그래서 이렇게 처리합니다.

1. `is-crawlable`·`robots-txt` 항목은 검사에서 **끈다** (미리보기라서 당연히 실패하는 항목).
2. SEO 카테고리 점수는 **경고(warn)** — 보고서에는 나오지만 PR 을 막지는 않는다.
3. 대신 실제 SEO 품질 항목은 **개별로 오류 처리**한다: 제목(`document-title`) · 설명(`meta-description`) · 언어(`html-has-lang`) · 이미지 설명(`image-alt`) · 링크 문구(`link-text`) · 수집 가능한 링크(`crawlable-anchors`) · `hreflang`.
4. 운영 반영 때는 `noindex` 를 뺀 판으로 SEO 점수 ≥ 90 을 다시 확인한다 (운영 반영 절차의 체크 항목).

## 관련 문서

- [docs/APPROVAL-FLOW.md](docs/APPROVAL-FLOW.md) — 수정 요청부터 승인·되돌리기까지, 그리고 GitHub 에서 켜야 할 설정
- [SECURITY.md](SECURITY.md) — 보안 정책과 신고 방법
