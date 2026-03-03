type VehicleSizeOptionProps = {
  id: "CAR" | "SUV_TRUCK" | "LARGE";
  title: string;
  subtitle: string;
  selected: boolean;
  onSelect: (id: "CAR" | "SUV_TRUCK" | "LARGE") => void;
};

const spritePositions: Record<VehicleSizeOptionProps["id"], string> = {
  CAR: "0% 0%",
  SUV_TRUCK: "50% 0%",
  LARGE: "100% 0%",
};

export default function VehicleSizeOption({
  id,
  title,
  subtitle,
  selected,
  onSelect,
}: VehicleSizeOptionProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      aria-pressed={selected}
      aria-label={`${title} vehicle size`}
      className={`rounded-2xl border px-5 py-5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 ${
        selected
          ? "border-slate-900 bg-slate-900 text-white shadow-lg shadow-slate-200/70"
          : "border-slate-200 bg-white text-slate-800 hover:border-slate-300"
      }`}
    >
      <div className="flex flex-col items-center gap-4 text-center">
        <div
          className="h-56 w-full max-w-[340px] rounded-2xl bg-white"
          style={{
            backgroundImage: "url(/assets/vehicle-size/vehicle-size-strip.png)",
            backgroundSize: "300% 100%",
            backgroundPosition: spritePositions[id],
            backgroundRepeat: "no-repeat",
          }}
          aria-hidden="true"
        />
        <p
          className={`text-xs uppercase tracking-[0.25em] ${selected ? "text-slate-300" : "text-slate-400"}`}
        >
          Vehicle size
        </p>
        <p className="text-lg font-semibold">{title}</p>
        <p className={`text-sm ${selected ? "text-slate-200" : "text-slate-600"}`}>{subtitle}</p>
      </div>
    </button>
  );
}
