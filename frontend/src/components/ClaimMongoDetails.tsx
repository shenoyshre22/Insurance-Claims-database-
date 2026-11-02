"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, formatDateTime } from "@/lib/client";

type Activity = { _id: string; action: string; timestamp: string; performed_by: { name: string } | null; from_status?: string | null; to_status?: string | null };
type Evidence = { _id: string; evidence_type: string; description: string; file: { original_name: string } | null; uploaded_at: string };
type Investigation = { _id: string; summary: string; recommendation: string; tags?: string[]; updated_at: string };
type Communication = { _id: string; communication_type: string; subject: string; sender: string; timestamp: string };
const label = (value: string) => value.toLowerCase().replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());

export default function ClaimMongoDetails({ claimId }: { claimId: number }) {
  const [data, setData] = useState<{ activity: Activity[]; evidence: Evidence[]; investigations: Investigation[]; communications: Communication[] } | null>(null);
  useEffect(() => {
    let current = true;
    Promise.all([
      api<{ logs: Activity[] }>(`/api/activity?claim_id=${claimId}`),
      api<{ evidence: Evidence[] }>(`/api/evidence?claim_id=${claimId}`),
      api<{ records: Investigation[] }>(`/api/investigations?claim_id=${claimId}`),
      api<{ communications: Communication[] }>(`/api/communications?claim_id=${claimId}`),
    ]).then(([activity, evidence, investigations, communications]) => {
      if (current) setData({ activity: activity.logs, evidence: evidence.evidence, investigations: investigations.records, communications: communications.communications });
    }).catch(() => { if (current) setData({ activity: [], evidence: [], investigations: [], communications: [] }); });
    return () => { current = false; };
  }, [claimId]);
  if (!data) return <p className="border-t border-slate-200 pt-4 text-slate-500">Loading MongoDB claim history…</p>;
  return <div className="space-y-5 border-t border-slate-200 pt-4">
    <section><h4 className="mb-2 font-semibold text-slate-900">Activity history</h4>{data.activity.length ? <ol className="space-y-2 border-l border-slate-200 pl-4 text-xs">{data.activity.map((item) => <li key={item._id}><span className="font-medium text-slate-800">{label(item.action)}</span>{item.from_status && item.to_status && item.from_status !== item.to_status ? ` · ${item.from_status} → ${item.to_status}` : ""}<div className="text-slate-500">{formatDateTime(item.timestamp)} · {item.performed_by?.name ?? "System"}</div></li>)}</ol> : <p className="text-slate-500">No activity recorded.</p>}<Link className="mt-2 inline-block text-blue-700 hover:underline" href={`/activity?claim_id=${claimId}`}>Manage activity timeline</Link></section>
    <section><h4 className="mb-2 font-semibold text-slate-900">Supporting documents</h4>{data.evidence.length ? <ul className="space-y-1 text-xs">{data.evidence.map((item) => <li key={item._id}><span className="font-medium">{item.evidence_type}</span> · {item.description}{item.file ? ` (${item.file.original_name})` : ""} <span className="text-slate-500">· {formatDateTime(item.uploaded_at)}</span></li>)}</ul> : <p className="text-slate-500">No documents registered.</p>}<Link className="mt-2 inline-block text-blue-700 hover:underline" href={`/evidence?claim_id=${claimId}`}>Manage supporting documents</Link></section>
    <section><h4 className="mb-2 font-semibold text-slate-900">Investigation notes</h4>{data.investigations.length ? <ul className="space-y-1 text-xs">{data.investigations.map((item) => <li key={item._id}><span className="font-medium">{item.recommendation}</span> · {item.summary}{item.tags?.length ? ` · ${item.tags.join(", ")}` : ""}</li>)}</ul> : <p className="text-slate-500">No investigation notes recorded.</p>}<Link className="mt-2 inline-block text-blue-700 hover:underline" href={`/investigations?claim_id=${claimId}`}>Manage investigation notes</Link></section>
    <section><h4 className="mb-2 font-semibold text-slate-900">Communication history</h4>{data.communications.length ? <ul className="space-y-1 text-xs">{data.communications.map((item) => <li key={item._id}><span className="font-medium">{item.communication_type}: {item.subject}</span> · {item.sender} <span className="text-slate-500">· {formatDateTime(item.timestamp)}</span></li>)}</ul> : <p className="text-slate-500">No communications recorded.</p>}<Link className="mt-2 inline-block text-blue-700 hover:underline" href={`/communications?claim_id=${claimId}`}>Manage communications</Link></section>
  </div>;
}
