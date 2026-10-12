"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LoadingState } from "@/components/foundation";
import { loginHref } from "../login-route";

export function LoginRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace(loginHref(window.location.pathname + window.location.search + window.location.hash));
  }, [router]);
  return <LoadingState label="正在前往登录页…" />;
}
