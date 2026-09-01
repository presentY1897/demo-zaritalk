"use client";

/**
 * 로그아웃 버튼 (T0.5) — `POST /api/auth/logout`(T0.3) 후 `/login`(T0.4) 으로 이동.
 *
 * 클라이언트 라우팅이 아니라 **전체 페이지 이동**을 쓴다. 세션이 사라진 뒤에도 남아 있는
 * React Query 캐시·Jotai 스토어(프로필 목록)를 통째로 버리기 위해서다.
 * 그래서 T0.7 규약대로 이동 직전에 트래킹 큐를 `flush()` 한다.
 */
import { Button, useTrack } from "@zari/ui";
import { useState } from "react";

export function LogoutButton() {
  const { flush } = useTrack();
  const [pending, setPending] = useState(false);

  async function logout() {
    setPending(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // 로그아웃은 멱등(서버가 204)이라 실패해도 화면은 로그인으로 보낸다
    } finally {
      flush();
      window.location.href = "/login";
    }
  }

  return (
    <Button variant="ghost" fullWidth loading={pending} onClick={() => void logout()}>
      로그아웃
    </Button>
  );
}
