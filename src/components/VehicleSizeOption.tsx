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
      className={`rounded-2xl border px-5 py-5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-text ${
        selected
          ? "border-brand-text bg-brand-text text-white shadow-lg shadow-brand-text/20"
          : "border-brand-text/25 bg-white text-brand-text hover:border-brand-text/35"
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
          className={`text-xs uppercase tracking-[0.25em] ${selected ? "text-white/80" : "text-brand-text/60"}`}
        >
          Vehicle size
        </p>
        <p className="text-lg font-semibold">{title}</p>
        <p className={`text-sm ${selected ? "text-white/85" : "text-brand-text/80"}`}>{subtitle}</p>
      </div>
    </button>
  );
}
