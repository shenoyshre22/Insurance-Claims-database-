"use client";

import { useEffect, useState } from "react";

export interface CurrentUser {
  user_id: number;
  full_name: string;
  email: string;
  role: "Admin" | "Claims Officer";
}

/** fetch wrapper: JSON in/out, readable errors, redirects to /login when the session expired. */
export async function api<T>(url: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  const response = await fetch(url, {
    cache: "no-store",
    ...rest,
    headers: json !== undefined ? { "Content-Type": "application/json", ...(rest.headers ?? {}) } : rest.headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  if (response.status === 401 && typeof window !== "undefined" && !url.startsWith("/api/auth/login")) {
    window.location.replace(new URL("/login", window.location.origin).href);
  }
  if (!response.ok) {
    throw new Error((data as { message?: string } | null)?.message ?? `Request failed (${response.status}).`);
  }
  return data as T;
}

let userPromise: Promise<CurrentUser | null> | null = null;

export function useCurrentUser() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  useEffect(() => {
    userPromise ??= api<{ user: CurrentUser }>("/api/auth/me").then((d) => d.user).catch(() => null);
    let alive = true;
    userPromise.then((u) => alive && setUser(u));
    return () => {
      alive = false;
    };
  }, []);
  return user;
}

export function resetCurrentUser() {
  userPromise = null;
}

const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  const [, year, month, day] = match;
  return `${Number(day)} ${monthNames[Number(month) - 1] ?? month} ${year}`;
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

export function formatAmount(value: number | string | null | undefined) {
  if (value == null || value === "") return "—";
  return `₹${Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
