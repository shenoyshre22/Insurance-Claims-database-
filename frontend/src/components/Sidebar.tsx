"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const disabledItems = ["Assessments", "Settlements", "Payments"];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 shrink-0 bg-slate-900 p-6 text-white">
      <h1 className="mb-10 text-xl font-bold">Insurance Claims</h1>
      <nav className="space-y-4">
        <Link
          href="/"
          aria-current={pathname === "/" ? "page" : undefined}
          className={`block rounded-lg p-3 ${pathname === "/" ? "bg-blue-700" : "hover:bg-slate-800"}`}
        >
          Dashboard
        </Link>
        <Link
          href="/customers"
          aria-current={pathname === "/customers" ? "page" : undefined}
          className={`block rounded-lg p-3 ${pathname === "/customers" ? "bg-blue-700" : "hover:bg-slate-800"}`}
        >
          Customers
        </Link>
        <Link
          href="/policies"
          aria-current={pathname === "/policies" ? "page" : undefined}
          className={`block rounded-lg p-3 ${pathname === "/policies" ? "bg-blue-700" : "hover:bg-slate-800"}`}
        >
          Policies
        </Link>
        <Link
          href="/claims"
          aria-current={pathname === "/claims" ? "page" : undefined}
          className={`block rounded-lg p-3 ${pathname === "/claims" ? "bg-blue-700" : "hover:bg-slate-800"}`}
        >
          Claims
        </Link>
        {disabledItems.map((item) => (
          <div
            key={item}
            aria-disabled="true"
            className="flex items-center justify-between gap-2 rounded-lg px-3 py-3 text-slate-400"
          >
            <span>{item}</span>
            <span className="text-xs text-slate-500">Coming soon</span>
          </div>
        ))}
      </nav>
    </aside>
  );
}
