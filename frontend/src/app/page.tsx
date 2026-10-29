
"use client";

import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";

interface DashboardStats {
  customers: number;
  policies: number;
  claims: number;
  settlements: number;
}

export default function Home() {
  const [stats, setStats] = useState<DashboardStats | null>(null);

  useEffect(() => {
    async function fetchStats() {
      try {
        const response = await fetch("/api/dashboard");
        const data = await response.json();

        if (response.ok) {
          setStats(data);
        }
      } catch (error) {
        console.error("Failed to fetch dashboard statistics:", error);
      }
    }

    fetchStats();
  }, []);

  const cards = [
    { title: "Customers", value: stats?.customers },
    { title: "Policies", value: stats?.policies },
    { title: "Total Claims", value: stats?.claims },
    { title: "Settlements", value: stats?.settlements },
  ];

  return (
    <div className="min-h-screen bg-slate-100 flex">
      <Sidebar />

      <main className="flex-1 p-8">
        <header className="mb-8">
          <h2 className="text-3xl font-bold text-slate-900">
            Admin Dashboard
          </h2>
          <p className="text-slate-500 mt-2">
            Insurance Claims Processing System
          </p>
        </header>

        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {cards.map((card) => (
            <div
              key={card.title}
              className="bg-white p-6 rounded-xl shadow-sm border border-slate-200"
            >
              <p className="text-slate-500 text-sm">{card.title}</p>
              <p className="text-3xl font-bold text-slate-900 mt-3">
                {card.value ?? "Loading..."}
              </p>
            </div>
          ))}
        </section>

        <section className="bg-white rounded-xl border border-slate-200 p-6 mt-8">
          <h3 className="text-xl font-semibold text-slate-900 mb-2">
            Welcome to the Admin Panel
          </h3>
          <p className="text-slate-600">
            Manage customers, insurance policies, claims,
            assessments, settlements and payments from one place.
          </p>
        </section>
      </main>
    </div>
  );
}
