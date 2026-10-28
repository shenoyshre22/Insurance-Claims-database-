
export default function Home() {
  return (
    <div className="min-h-screen bg-slate-100 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 text-white p-6">
        <h1 className="text-xl font-bold mb-10">
          Insurance Claims
        </h1>

        <nav className="space-y-4">
          <a className="block bg-blue-700 rounded-lg p-3">
            Dashboard
          </a>
          <a className="block p-3 hover:bg-slate-800 rounded-lg">
            Customers
          </a>
          <a className="block p-3 hover:bg-slate-800 rounded-lg">
            Policies
          </a>
          <a className="block p-3 hover:bg-slate-800 rounded-lg">
            Claims
          </a>
          <a className="block p-3 hover:bg-slate-800 rounded-lg">
            Assessments
          </a>
          <a className="block p-3 hover:bg-slate-800 rounded-lg">
            Settlements
          </a>
          <a className="block p-3 hover:bg-slate-800 rounded-lg">
            Payments
          </a>
        </nav>
      </aside>

      {/* Main content */}
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
          {["Customers", "Policies", "Total Claims", "Settlements"].map(
            (item) => (
              <div
                key={item}
                className="bg-white p-6 rounded-xl shadow-sm border border-slate-200"
              >
                <p className="text-slate-500 text-sm">{item}</p>
                <p className="text-3xl font-bold text-slate-900 mt-3">
                  —
                </p>
              </div>
            )
          )}
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
