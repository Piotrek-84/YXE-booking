type VehicleSizeCardProps = {
  id: "car" | "suv" | "truck" | "large_suv" | "minivan";
  title: string;
  subtitle: string;
  imageSrc: string;
  selected: boolean;
  onSelect: (id: VehicleSizeCardProps["id"]) => void;
};

import Image from "next/image";

export default function VehicleSizeCard({
  id,
  title,
  subtitle,
  imageSrc,
  selected,
  onSelect
}: VehicleSizeCardProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      aria-pressed={selected}
      aria-label={`${title} vehicle size`}
      className={`cursor-pointer rounded-2xl border px-4 py-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 ${
        selected
          ? "border-slate-900 bg-slate-900 text-white shadow-lg shadow-slate-200/70"
          : "border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:shadow-md"
      }`}
    >
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="w-full rounded-2xl bg-gradient-to-b from-slate-50 to-slate-100 p-3">
          <div className="relative h-44 w-full overflow-hidden sm:h-48 md:h-56">
            <Image
              src={imageSrc}
              alt={`${title} vehicle illustration`}
              fill
              quality={100}
              sizes="(max-width: 640px) 90vw, (max-width: 1024px) 45vw, 30vw"
              className="object-contain object-center scale-[2.025]"
              priority={false}
            />
          </div>
        </div>
        <p className={`text-xs uppercase tracking-[0.25em] ${selected ? "text-slate-300" : "text-slate-400"}`}>
          Vehicle size
        </p>
        <p className="text-lg font-semibold">{title}</p>
        {subtitle && (
          <p className={`text-sm ${selected ? "text-slate-200" : "text-slate-600"}`}>
            {subtitle}
          </p>
        )}
      </div>
    </button>
  );
}
