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
  onSelect,
}: VehicleSizeCardProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      aria-pressed={selected}
      aria-label={`${title} vehicle size`}
      className={`cursor-pointer rounded-2xl border px-4 py-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-text ${
        selected
          ? "border-brand-text bg-brand-text text-white shadow-lg shadow-brand-text/20"
          : "border-brand-text/25 bg-white text-brand-text hover:border-brand-text/35 hover:shadow-md"
      }`}
    >
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="w-full rounded-2xl bg-gradient-to-b from-white/80 to-brand-bg p-3">
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
        <p
          className={`text-xs uppercase tracking-[0.25em] ${selected ? "text-white/80" : "text-brand-text/60"}`}
        >
          Vehicle size
        </p>
        <p className="text-lg font-semibold">{title}</p>
        {subtitle && (
          <p className={`text-sm ${selected ? "text-white/85" : "text-brand-text/80"}`}>
            {subtitle}
          </p>
        )}
      </div>
    </button>
  );
}
