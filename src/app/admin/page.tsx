export default function AdminPage() {
  return (
    <section className="grid gap-4 md:grid-cols-2">
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
    </section>
  );
}
