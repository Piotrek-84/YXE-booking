import Image from "next/image";

type CustomerLogoProps = {
  className?: string;
  priority?: boolean;
};

export default function CustomerLogo({ className = "", priority = false }: CustomerLogoProps) {
  const classes = ["h-auto w-[120px] md:w-[180px]", className].filter(Boolean).join(" ");

  return (
    <Image
      src="/assets/yxe-quick-clean-logo.png"
      alt="YXE Quick Clean logo"
      width={1200}
      height={706}
      sizes="(max-width: 768px) 120px, 180px"
      priority={priority}
      className={classes}
    />
  );
}
