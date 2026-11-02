"use client";

import { useEffect, type ReactNode } from "react";
import Sidebar from "@/components/Sidebar";

export function PageShell({ title, subtitle, actions, children }: { title: string; subtitle?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-100 flex">
      <Sidebar />
      <main className="flex-1 min-w-0 p-8">
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-3xl font-bold text-slate-900">{title}</h2>
            {subtitle && <p className="text-slate-500 mt-2">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </header>
        <div className="space-y-6">{children}</div>
      </main>
    </div>
  );
}

export function Card({ title, children, actions }: { title?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
      {(title || actions) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          {title && <h3 className="text-lg font-semibold text-slate-900">{title}</h3>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function StatGrid({ items }: { items: { label: string; value: ReactNode; hint?: string }[] }) {
  return (
    <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <p className="text-slate-500 text-sm">{item.label}</p>
          <p className="text-3xl font-bold text-slate-900 mt-3">{item.value}</p>
          {item.hint && <p className="mt-1 text-xs text-slate-500">{item.hint}</p>}
        </div>
      ))}
    </section>
  );
}

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
const buttonStyles: Record<ButtonVariant, string> = {
  primary: "bg-blue-700 text-white hover:bg-blue-800",
  secondary: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
  danger: "bg-red-600 text-white hover:bg-red-700",
  ghost: "text-blue-700 hover:bg-blue-50",
};

export function Button({ variant = "primary", className = "", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${buttonStyles[variant]} ${className}`}
    />
  );
}

export function SmallButton({ variant = "ghost", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <Button variant={variant} {...props} className="!px-2 !py-1 text-xs" />;
}

const inputClass = "w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-blue-700 focus:ring-2 focus:ring-blue-100";

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputClass} ${props.className ?? ""}`} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={3} {...props} className={`${inputClass} ${props.className ?? ""}`} />;
}

export function Select({ options, placeholder, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { options: { value: string | number; label: string }[]; placeholder?: string }) {
  return (
    <select {...props} className={`${inputClass} bg-white ${props.className ?? ""}`}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="w-full sm:max-w-sm">
      <span className="sr-only">{placeholder}</span>
      <Input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </label>
  );
}

export function Modal({ open, title, onClose, children, wide }: { open: boolean; title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`mt-10 w-full ${wide ? "max-w-4xl" : "max-w-xl"} rounded-xl bg-white p-6 shadow-xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-xl font-semibold text-slate-900">{title}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 text-slate-500 hover:bg-slate-100">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function FormError({ message }: { message: string }) {
  if (!message) return null;
  return <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p>;
}

export function Notice({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    if (!message) return;
    const t = window.setTimeout(onDone, 3500);
    return () => window.clearTimeout(t);
  }, [message, onDone]);
  if (!message) return null;
  return <p role="status" className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</p>;
}

const badgeTones: Record<string, string> = {
  Active: "bg-emerald-100 text-emerald-800",
  Approved: "bg-emerald-100 text-emerald-800",
  Verified: "bg-emerald-100 text-emerald-800",
  Paid: "bg-emerald-100 text-emerald-800",
  Completed: "bg-emerald-100 text-emerald-800",
  Settled: "bg-blue-100 text-blue-800",
  Closed: "bg-slate-200 text-slate-700",
  Pending: "bg-amber-100 text-amber-800",
  Open: "bg-amber-100 text-amber-800",
  "Under Review": "bg-sky-100 text-sky-800",
  "In Progress": "bg-sky-100 text-sky-800",
  Medium: "bg-amber-100 text-amber-800",
  Low: "bg-slate-100 text-slate-700",
  High: "bg-orange-100 text-orange-800",
  Critical: "bg-red-100 text-red-800",
  Rejected: "bg-red-100 text-red-800",
  Cancelled: "bg-red-100 text-red-800",
  Expired: "bg-slate-200 text-slate-700",
  Suspended: "bg-orange-100 text-orange-800",
};

export function Badge({ value }: { value: string | null | undefined }) {
  if (!value) return <span className="text-slate-400">—</span>;
  return <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${badgeTones[value] ?? "bg-slate-100 text-slate-700"}`}>{value}</span>;
}

export function DataState({ loading, error, empty, emptyText, children }: { loading: boolean; error: string; empty: boolean; emptyText: string; children: ReactNode }) {
  if (loading) return <p role="status" className="py-12 text-center text-slate-500">Loading…</p>;
  if (error) return <div role="alert" className="py-12 text-center text-red-700">{error}</div>;
  if (empty) return <p className="py-12 text-center text-slate-500">{emptyText}</p>;
  return <>{children}</>;
}

export function Table({ headers, children }: { headers: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-slate-200 text-slate-500">
          <tr>{headers.map((h) => <th key={h} className="whitespace-nowrap px-4 py-3 font-medium">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-slate-700">{children}</tbody>
      </table>
    </div>
  );
}

export function Td({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <td className={`px-4 py-3 align-top ${className}`}>{children}</td>;
}

/** Horizontal bar chart drawn with plain HTML/CSS (no chart library). */
export function BarChart({ data, format = (v) => String(v) }: { data: { label: string; value: number }[]; format?: (v: number) => string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  if (data.length === 0) return <p className="py-6 text-center text-sm text-slate-500">No data yet.</p>;
  return (
    <ul className="space-y-3">
      {data.map((d) => (
        <li key={d.label}>
          <div className="mb-1 flex justify-between text-sm"><span className="text-slate-700">{d.label || "—"}</span><span className="font-medium text-slate-900">{format(d.value)}</span></div>
          <div className="h-2.5 rounded-full bg-slate-100"><div className="h-2.5 rounded-full bg-blue-700" style={{ width: `${(d.value / max) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

/** Vertical column chart (SVG) for time series. */
export function ColumnChart({ data }: { data: { label: string; value: number }[] }) {
  if (data.length === 0) return <p className="py-6 text-center text-sm text-slate-500">No data yet.</p>;
  const max = Math.max(1, ...data.map((d) => d.value));
  const w = 40;
  const h = 160;
  return (
    <svg viewBox={`0 0 ${data.length * w} ${h + 30}`} className="h-56 w-full" role="img" aria-label="Column chart">
      {data.map((d, i) => {
        const bh = (d.value / max) * h;
        return (
          <g key={d.label}>
            <rect x={i * w + 8} y={h - bh} width={w - 16} height={bh} rx={3} className="fill-blue-700" />
            <text x={i * w + w / 2} y={h - bh - 4} textAnchor="middle" className="fill-slate-700 text-[9px]">{d.value}</text>
            <text x={i * w + w / 2} y={h + 16} textAnchor="middle" className="fill-slate-500 text-[8px]">{d.label.slice(2)}</text>
          </g>
        );
      })}
    </svg>
  );
}
