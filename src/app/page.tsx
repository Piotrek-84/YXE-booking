import HiddenAdminEntry from "../components/HiddenAdminEntry";
import CustomerLogo from "../components/CustomerLogo";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-brand-bg px-5 py-10 md:px-8">
      <section className="mx-auto w-full max-w-3xl">
        <header className="relative rounded-3xl border border-brand-text/25 bg-white p-8 shadow-sm md:p-10">
          <HiddenAdminEntry />
          <CustomerLogo
            priority
            className="pointer-events-none absolute right-4 top-4 md:right-8 md:top-8"
          />
          <div className="pr-44 md:pr-64">
            <p className="text-xs uppercase tracking-[0.22em] text-brand-text/70">
              YXE Vehicle Detailing
            </p>
            <h1 className="mt-3 max-w-3xl text-3xl font-semibold text-brand-text md:text-5xl">
              Fast, professional detailing with instant online booking
            </h1>
            <p className="mt-4 max-w-2xl text-base text-brand-text/80 md:text-lg">
              Choose your service, pick an available time, and book instantly.
            </p>
            <div className="mt-7">
              <a
                href="/booking"
                className="inline-flex rounded-2xl bg-brand-text px-5 py-3 text-sm font-semibold text-white"
              >
                Start booking
              </a>
            </div>
          </div>
        </header>
      </section>
    </main>
  );
}
