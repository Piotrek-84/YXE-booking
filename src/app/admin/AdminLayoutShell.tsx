"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function AdminLayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (pathname.startsWith("/admin/login")) {
    return <>{children}</>;
  }

  const locationLabel = "All locations";
  const title = pathname.startsWith("/admin/bookings")
    ? "Bookings"
    : pathname.startsWith("/admin/discount-codes")
      ? "Discount Codes"
      : pathname.startsWith("/admin/maintenance")
        ? "Maintenance Clients"
        : pathname.startsWith("/admin/blocked")
          ? "Blocked Clients"
          : pathname === "/admin"
            ? "Dashboard"
            : "Admin";

  const navItems = [
    { href: "/admin", label: "Dashboard", active: pathname === "/admin" },
    {
      href: "/admin/bookings",
      label: "Bookings",
      active: pathname.startsWith("/admin/bookings"),
    },
    {
      href: "/admin/blocked",
      label: "Blocked Clients",
      active: pathname.startsWith("/admin/blocked"),
    },
    {
      href: "/admin/discount-codes",
      label: "Discount Codes",
      active: pathname.startsWith("/admin/discount-codes"),
    },
    {
      href: "/admin/maintenance",
      label: "Maintenance Clients",
      active: pathname.startsWith("/admin/maintenance"),
    },
  ];

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-slate-100 lg:px-6">
      <div className="mx-auto grid w-full max-w-7xl gap-6 lg:grid-cols-[220px_1fr]">
        <aside className="hidden rounded-2xl border border-slate-800 bg-slate-900 p-4 lg:block">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Admin</p>
          <nav className="mt-4 grid gap-2">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                  item.active
                    ? "bg-slate-100 text-slate-950"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>

        <section className="space-y-4">
          <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Control Panel</p>
              <h1 className="text-2xl font-semibold">{title}</h1>
              <p className="text-sm text-slate-400">Active location: {locationLabel}</p>
            </div>
            <form action="/api/admin/logout" method="post">
              <button
                aria-label="Log out"
                className="rounded-2xl border border-slate-700 bg-slate-950/90 px-4 py-2 text-xs font-semibold text-slate-200 backdrop-blur"
              >
                Log out
              </button>
            </form>
          </header>

          <nav className="grid grid-cols-5 gap-2 rounded-2xl border border-slate-800 bg-slate-900 p-2 lg:hidden">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-xl px-3 py-2 text-center text-xs font-semibold ${
                  item.active ? "bg-slate-100 text-slate-900" : "text-slate-300"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div>{children}</div>
        </section>
      </div>
    </main>
  );
}
