import HiddenAdminEntry from "../components/HiddenAdminEntry";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-slate-50 px-5 py-10 md:px-8">
      <section className="mx-auto w-full max-w-3xl">
        <header className="relative rounded-3xl border border-slate-200 bg-white p-8 shadow-sm md:p-10">
          <HiddenAdminEntry />
          <p className="text-xs uppercase tracking-[0.22em] text-slate-500">YXE Vehicle Detailing</p>
          <h1 className="mt-3 max-w-3xl text-3xl font-semibold text-slate-900 md:text-5xl">
            Fast, professional detailing with instant online booking
          </h1>
          <p className="mt-4 max-w-2xl text-base text-slate-600 md:text-lg">
            Choose your service, pick an available time, and book instantly.
          </p>
          <div className="mt-7">
            <a
              href="/booking"
              className="inline-flex rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white"
            >
              Start booking
            </a>
          </div>
        </header>
      </section>
    </main>
  );
}
