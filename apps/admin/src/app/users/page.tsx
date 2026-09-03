/**
 * `/users` — 회원/프로필 조회 (T6.3). 메뉴 자리는 T0.5 가 잡아 뒀다.
 *
 * 검색·페이지는 전부 URL 쿼리(`?q=`·`?page=`)라 새로고침·공유가 된다.
 * 필터링·페이지네이션은 **서버(web API)** 가 한다 — 화면은 받은 페이지를 그리기만 한다.
 *
 * 전화번호는 **마스킹된 값**이 내려온다(근거는 `apps/web/src/features/admin/mask.ts`).
 *
 * `searchParams` 는 Next 16 규약대로 Promise 다.
 */
import Link from "next/link";
import { css } from "styled-system/css";
import {
  DataTable,
  EmptyState,
  ErrorPanel,
  FilterForm,
  PageHeader,
  Pagination,
  StatusBadge,
  mutedTextStyle,
  numericCellStyle,
} from "../_shell/table";
import { firstParam, formatDate, hrefWith, PROFILE_TYPE_LABEL } from "../_shell/format";
import { fetchAdminUsers } from "./actions";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const linkStyle = css({ color: "text.brand", textDecoration: "none", fontWeight: "600" });
const badgeRowStyle = css({ display: "flex", gap: "1", flexWrap: "wrap" });

export default async function AdminUsersPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const q = firstParam(params.q);
  const page = firstParam(params.page) ?? "1";
  const pageSize = firstParam(params.pageSize);
  const current = { q, page, pageSize };

  const result = await fetchAdminUsers({
    ...(q ? { q } : {}),
    page,
    ...(pageSize ? { pageSize } : {}),
  });

  return (
    <main>
      <PageHeader
        title="회원/프로필"
        badge="T6.3"
        description="이름 또는 전화번호로 찾습니다. 전화번호는 가운데 자리를 가려서 보여 줍니다 — 이 화면은 사람을 식별하는 곳이지 연락하는 곳이 아니기 때문입니다."
      />

      <FilterForm
        action="/users"
        fields={[
          { name: "q", label: "이름 · 전화번호", defaultValue: q ?? "", placeholder: "김임대 또는 010-1111" },
        ]}
        resetHref="/users"
      />

      {!result.ok ? (
        <ErrorPanel message={result.message} />
      ) : result.users.length === 0 ? (
        <EmptyState
          message={q ? `"${q}" 로 찾은 회원이 없습니다.` : "회원이 없습니다."}
          action={
            result.page.total > 0 ? (
              <Link href={hrefWith("/users", current, { page: 1 })} className={linkStyle}>
                첫 페이지로
              </Link>
            ) : null
          }
        />
      ) : (
        <>
          <DataTable
            head={
              <tr>
                <th>이름</th>
                <th>전화번호</th>
                <th>프로필</th>
                <th>세입 계약</th>
                <th>보유 건물</th>
                <th>환급 신청</th>
                <th>가입일</th>
              </tr>
            }
          >
            {result.users.map((user) => (
              <tr key={user.id} data-testid="admin-user-row">
                <td>
                  <Link href={`/users/${user.id}`} className={linkStyle}>
                    {user.name}
                  </Link>
                  {user.isAdmin ? (
                    <span className={css({ ml: "2" })}>
                      <StatusBadge label="관리자" tone="brand" />
                    </span>
                  ) : null}
                </td>
                <td className={numericCellStyle}>{user.phone}</td>
                <td>
                  <span className={badgeRowStyle}>
                    {user.profileTypes.length === 0 ? (
                      <span className={mutedTextStyle}>없음</span>
                    ) : (
                      user.profileTypes.map((type) => (
                        <StatusBadge
                          key={type}
                          label={PROFILE_TYPE_LABEL[type] ?? type}
                          tone="neutral"
                        />
                      ))
                    )}
                  </span>
                </td>
                <td className={numericCellStyle}>{user.tenantLeaseCount}</td>
                <td className={numericCellStyle}>{user.buildingCount}</td>
                <td className={numericCellStyle}>{user.refundCount}</td>
                <td className={numericCellStyle}>{formatDate(user.createdAt)}</td>
              </tr>
            ))}
          </DataTable>

          <Pagination
            page={result.page}
            hrefFor={(next) => hrefWith("/users", current, { page: next })}
          />
        </>
      )}
    </main>
  );
}
