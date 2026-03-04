type ServiceTagProps = {
  label?: string;
  className?: string;
};

export default function ServiceTag({ label = "Most Popular", className }: ServiceTagProps) {
  const estimatedLabelWidth = Math.ceil(label.length * 7.1);
  const width = Math.max(132, estimatedLabelWidth + 40);

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height="28"
      viewBox={`0 0 ${width} 28`}
      role="img"
      aria-label={label}
      className={className}
    >
      <rect
        x="1"
        y="1"
        width={width - 2}
        height="26"
        rx="13"
        fill="#FFF4CC"
        stroke="rgba(106,75,0,0.22)"
      />
      <circle cx="14" cy="14" r="4" fill="#6A4B00" opacity="0.55" />
      <text
        x="24"
        y="18"
        fontFamily="Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial"
        fontSize="12"
        fontWeight="700"
        fill="#6A4B00"
      >
        {label}
      </text>
    </svg>
  );
}
