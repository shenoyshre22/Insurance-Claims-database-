"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api, resetCurrentUser, useCurrentUser } from "@/lib/client";

const sections: { title?: string; items: { href: string; label: string; adminOnly?: boolean }[] }[] = [
  {
    items: [
      { href: "/", label: "Dashboard" },
      { href: "/customers", label: "Customers" },
      { href: "/policies", label: "Policies" },
      { href: "/claims", label: "Claims" },
      { href: "/assessments", label: "Assessments" },
      { href: "/settlements", label: "Settlements" },
      { href: "/payments", label: "Payments" },
    ],
  },
  {
    title: "Investigation",
    items: [
      { href: "/evidence", label: "Claim Evidence" },
      { href: "/investigations", label: "Investigations" },
      { href: "/activity", label: "Activity Logs" },
      { href: "/communications", label: "Communications" },
    ],
  },
  {
    title: "Admin",
    items: [
      { href: "/reports", label: "Reports" },
      { href: "/users", label: "Users", adminOnly: true },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const user = useCurrentUser();

  async function logout() {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } finally {
      resetCurrentUser();
      router.replace("/login");
    }
  }

  return (
    <aside className="flex w-64 shrink-0 flex-col bg-slate-900 p-6 text-white">
      <h1 className="mb-10 text-xl font-bold">Insurance Claims</h1>
      <nav className="flex-1 space-y-6">
        {sections.map((section, index) => (
          <div key={section.title ?? index} className="space-y-1">
            {section.title && <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">{section.title}</p>}
            {section.items
              .filter((item) => !item.adminOnly || user?.role === "Admin")
              .map((item) => {
                const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`block rounded-lg px-3 py-2.5 ${active ? "bg-blue-700" : "hover:bg-slate-800"}`}
                  >
                    {item.label}
                  </Link>
                );
              })}
          </div>
        ))}
      </nav>
      <div className="mt-8 border-t border-slate-700 pt-4">
        {user && (
          <div className="mb-3 px-1">
            <p className="truncate text-sm font-medium">{user.full_name}</p>
            <p className="text-xs text-slate-400">{user.role}</p>
          </div>
        )}
        <button type="button" onClick={logout} className="w-full rounded-lg px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-800">
          Log out
        </button>
      </div>
    </aside>
  );
}
