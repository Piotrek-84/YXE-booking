export type CityCode = "YXE" | "YYC";

export type PackageOption = {
  id: string;
  city: CityCode;
  name: string;
  description: string;
  priceCents: number;
  durationMins: number;
  category: "INT_EXT" | "INT_ONLY" | "EXT_ONLY";
  vehicleSize: "car" | "suv" | "truck" | "large_suv";
};

export type AddOnOption = {
  id: string;
  city: CityCode;
  name: string;
  description: string;
  priceCents: number;
  durationMins: number;
  vehicleSize?: "car" | "suv" | "truck" | "large_suv";
};

export const cities = [
  { code: "YXE" as CityCode, name: "Saskatoon (YXE)" },
  { code: "YYC" as CityCode, name: "Calgary (YYC)" },
];

export const packages: PackageOption[] = [
  {
    id: "yxe-int-ext-minivan",
    city: "YXE",
    name: "Interior & Exterior Quick Clean | Minivans & Large SUVs (6+ Seats)",
    description: "Vacuum, stain removal, plastics cleaned + dressed. Exterior hand wash and dry.",
    priceCents: 31400,
    durationMins: 179,
    category: "INT_EXT",
    vehicleSize: "large_suv",
  },
  {
    id: "yxe-int-ext-suv",
    city: "YXE",
    name: "Interior & Exterior Quick Clean | Crossovers & SUVs (5 Seats)",
    description: "Vacuum, stain removal, plastics cleaned + dressed. Exterior hand wash and dry.",
    priceCents: 25990,
    durationMins: 119,
    category: "INT_EXT",
    vehicleSize: "suv",
  },
  {
    id: "yxe-int-ext-truck",
    city: "YXE",
    name: "Interior & Exterior Quick Clean | Trucks",
    description: "Vacuum, stain removal, plastics cleaned + dressed. Exterior hand wash and dry.",
    priceCents: 25990,
    durationMins: 119,
    category: "INT_EXT",
    vehicleSize: "truck",
  },
  {
    id: "yxe-int-ext-car",
    city: "YXE",
    name: "Interior & Exterior Quick Clean | 2 & 4 Door Cars",
    description: "Vacuum, stain removal, plastics cleaned + dressed. Exterior hand wash and dry.",
    priceCents: 22900,
    durationMins: 119,
    category: "INT_EXT",
    vehicleSize: "car",
  },
  {
    id: "yxe-ext-minivan",
    city: "YXE",
    name: "Exterior Quick Clean | Minivans & Large SUVs (6+ Seats)",
    description:
      "Hand wash + dry of body panels and bumpers. Pressure wash rims, tires, and wheel wells.",
    priceCents: 4495,
    durationMins: 179,
    category: "EXT_ONLY",
    vehicleSize: "large_suv",
  },
  {
    id: "yxe-ext-suv",
    city: "YXE",
    name: "Exterior Quick Clean | Crossovers & SUVs (5 Seats)",
    description:
      "Hand wash + dry of body panels and bumpers. Pressure wash rims, tires, and wheel wells.",
    priceCents: 3995,
    durationMins: 45,
    category: "EXT_ONLY",
    vehicleSize: "suv",
  },
  {
    id: "yxe-ext-truck",
    city: "YXE",
    name: "Exterior Quick Clean | Trucks",
    description:
      "Hand wash + dry of body panels and bumpers. Pressure wash rims, tires, and wheel wells.",
    priceCents: 3995,
    durationMins: 45,
    category: "EXT_ONLY",
    vehicleSize: "truck",
  },
  {
    id: "yxe-ext-car",
    city: "YXE",
    name: "Exterior Quick Clean | 2 & 4 Door Cars",
    description:
      "Hand wash + dry of body panels and bumpers. Pressure wash rims, tires, and wheel wells.",
    priceCents: 2995,
    durationMins: 45,
    category: "EXT_ONLY",
    vehicleSize: "car",
  },
  {
    id: "yxe-int-minivan",
    city: "YXE",
    name: "Interior Quick Clean | Minivans & Large SUVs (6+ Seats)",
    description:
      "Vacuum, stain removal, plastics cleaned + dressed. Windows and door seals cleaned.",
    priceCents: 26995,
    durationMins: 179,
    category: "INT_ONLY",
    vehicleSize: "large_suv",
  },
  {
    id: "yxe-int-suv",
    city: "YXE",
    name: "Interior Quick Clean | Crossovers & SUVs (5 Seats)",
    description:
      "Vacuum, stain removal, plastics cleaned + dressed. Windows and door seals cleaned.",
    priceCents: 21995,
    durationMins: 119,
    category: "INT_ONLY",
    vehicleSize: "suv",
  },
  {
    id: "yxe-int-truck",
    city: "YXE",
    name: "Interior Quick Clean | Trucks",
    description:
      "Vacuum, stain removal, plastics cleaned + dressed. Windows and door seals cleaned.",
    priceCents: 21995,
    durationMins: 119,
    category: "INT_ONLY",
    vehicleSize: "truck",
  },
  {
    id: "yxe-int-car",
    city: "YXE",
    name: "Interior Quick Clean | 2 & 4 Door Cars",
    description:
      "Vacuum, stain removal, plastics cleaned + dressed. Windows and door seals cleaned.",
    priceCents: 19995,
    durationMins: 119,
    category: "INT_ONLY",
    vehicleSize: "car",
  },
];

export const addOns: AddOnOption[] = [
  {
    id: "yxe-pet-hair",
    city: "YXE",
    name: "Pet Hair Removal",
    description: "Extra attention for pet hair.",
    priceCents: 3995,
    durationMins: 30,
  },
  {
    id: "yxe-animal-waste",
    city: "YXE",
    name: "Animal/Human Waste or Mold Remediation",
    description: "Deep cleaning and remediation for hazardous messes.",
    priceCents: 5995,
    durationMins: 45,
  },
  {
    id: "yxe-car-seat",
    city: "YXE",
    name: "Child Car Seat Cleaning",
    description: "Clean and refresh child car seats.",
    priceCents: 3995,
    durationMins: 30,
  },
  {
    id: "yxe-paint-sealant",
    city: "YXE",
    name: "Paint Sealant Application",
    description: "Ceramic paint sealant for 6+ months of protection.",
    priceCents: 6995,
    durationMins: 45,
  },
  {
    id: "yxe-wax",
    city: "YXE",
    name: "Wax Application",
    description: "Hand applied wax.",
    priceCents: 3995,
    durationMins: 30,
  },
  {
    id: "yxe-windshield-chip",
    city: "YXE",
    name: "Windshield Chip Repair",
    description: "Chip repair for windshield (additional chips extra).",
    priceCents: 4995,
    durationMins: 30,
  },
  {
    id: "yxe-headlight-restoration-addon",
    city: "YXE",
    name: "Headlight Restoration",
    description:
      "Improve visibility and restore the polished look with cleaning, sanding, polishing, and coating.",
    priceCents: 9900,
    durationMins: 90,
  },
  {
    id: "yxe-headliner",
    city: "YXE",
    name: "Headliner Cleaning",
    description: "Targeted headliner cleaning.",
    priceCents: 5995,
    durationMins: 30,
  },
  {
    id: "yxe-optimum-fabric",
    city: "YXE",
    name: "Optimum Fabric Protectant",
    description: "Fabric protection treatment.",
    priceCents: 4000,
    durationMins: 30,
  },
  {
    id: "yxe-ozonator",
    city: "YXE",
    name: "Ozonator Treatment",
    description: "Aggressive odor treatment for smoke, skunk, or funk.",
    priceCents: 7000,
    durationMins: 45,
  },
  {
    id: "yxe-windshield-ceramic",
    city: "YXE",
    name: "Windshield Ceramic Coating",
    description: "Hydrophobic ceramic coating for windshield.",
    priceCents: 9900,
    durationMins: 30,
  },
  {
    id: "yxe-engine-bay",
    city: "YXE",
    name: "Engine Bay Detail",
    description: "Clean + dress engine bay.",
    priceCents: 5995,
    durationMins: 30,
  },
  {
    id: "yxe-tire-rim",
    city: "YXE",
    name: "Tire and Rim Detail",
    description: "Mechanical and chemical cleaning with iron removal.",
    priceCents: 4995,
    durationMins: 30,
  },
  {
    id: "yxe-opti-coat",
    city: "YXE",
    name: "Opti-Coat Fabric Guard",
    description: "Long-term fabric protection.",
    priceCents: 59900,
    durationMins: 60,
  },
];

export function formatPrice(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining === 0 ? `${hours} hr` : `${hours} hr ${remaining} min`;
}
