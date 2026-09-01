# §10 커뮤니티 (전 역할)

> 모델: Post · Comment · PostLike · Report
> 상태: ⬜ 미착수 · [전체 목차](../SPEC.md)

## 웹 페이지

| 라우트 | 화면·기능 |
|---|---|
| `/community` | 지역 보드 — 상단 지역 선택(시군구), 탭: 최신순/인기순(likeCount). 무한 스크롤(커서 페이지네이션). 글쓴이는 프로필 유형 배지(임대인/세입자…)로 표시. |
| `/community/write` | 글 작성 — 지역·제목·본문. |
| `/community/[postId]` | 글 상세 — 조회수, 좋아요 토글, 댓글 작성·삭제, 글·댓글 신고(사유 입력). 신고·삭제된 글은 블라인드 처리 표시. |

신고 처리(어드민)는 [§13](./13-admin.md) 참조.

## API

| 엔드포인트 | 동작 |
|---|---|
| `GET·POST /api/posts` | 목록(region+sort+cursor)·작성. `GET·PATCH·DELETE /[id]` — 조회 시 viewCount 증가. |
| `POST·DELETE /api/posts/[id]/like` | 좋아요 토글(likeCount 비정규화 갱신). |
| `GET·POST /api/posts/[id]/comments` | 댓글 목록·작성. `DELETE /api/comments/[id]`. |
| `POST /api/reports` | 글/댓글 신고 → 백오피스 큐. |

## 완료 기준

- [ ] 글·댓글·좋아요가 화면에서 완주, 인기 탭 likeCount 순 정렬, 프로필 유형 배지 표시
- [ ] 신고 → 어드민 큐 → 블라인드 시 커뮤니티에 블라인드 표시 전환, 처리자·시각 기록

## 테스트

- **최소(단위·API)**: 커서 페이지네이션 — 경계·중복 없음 · 좋아요 토글 멱등(2회=원상태)·likeCount 비정규화 일치 · 중복 신고 처리 · 블라인드 글 노출 규칙
- **통합(E2E)**: ①글 작성 → 다른 계정 좋아요·댓글 → 인기 탭 순위 반영 ②신고 → 어드민 블라인드 → 일반 사용자 화면에서 본문 숨김
