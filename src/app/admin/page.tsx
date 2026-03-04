export default function AdminPage() {
  return (
    <section className="grid gap-4 md:grid-cols-3">
      <a
        href="/admin/bookings"
        className="rounded-2xl border border-slate-800 bg-slate-900 p-5 transition hover:border-slate-600"
      >
        <p className="text-xs uppercase tracking-[0.15em] text-slate-500">Bookings</p>
        <p className="mt-2 text-lg font-semibold">View calendar + list</p>
        <p className="mt-2 text-sm text-slate-400">Filter by location, status, and day.</p>
      </a>
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <p className="text-xs uppercase tracking-[0.15em] text-slate-500">Export</p>
        <p className="mt-2 text-lg font-semibold">CSV export</p>
        <p className="mt-2 text-sm text-slate-400">Available from the bookings page.</p>
      </div>
      <a
        href="/admin/schedule"
        className="rounded-2xl border border-slate-800 bg-slate-900 p-5 transition hover:border-slate-600"
      >
        <p className="text-xs uppercase tracking-[0.15em] text-slate-500">Staffing</p>
        <p className="mt-2 text-lg font-semibold">Schedule calendar + employees</p>
        <p className="mt-2 text-sm text-slate-400">
          Manage detailers/supervisors and auto-block lanes from staff coverage.
        </p>
      </a>
      <a
        href="/admin/admin-users"
        className="rounded-2xl border border-slate-800 bg-slate-900 p-5 transition hover:border-slate-600"
      >
        <p className="text-xs uppercase tracking-[0.15em] text-slate-500">Access</p>
        <p className="mt-2 text-lg font-semibold">Manage admin logins</p>
        <p className="mt-2 text-sm text-slate-400">
          Master admin can create or disable additional admin accounts.
        </p>
      </a>
      <a
        href="/admin/discount-codes"
        className="rounded-2xl border border-slate-800 bg-slate-900 p-5 transition hover:border-slate-600"
      >
        <p className="text-xs uppercase tracking-[0.15em] text-slate-500">Discounts</p>
        <p className="mt-2 text-lg font-semibold">Manage discount codes</p>
        <p className="mt-2 text-sm text-slate-400">
          Create time-bound promo codes for the booking flow.
        </p>
      </a>
    </section>
  );
}
