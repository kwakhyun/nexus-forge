interface KpiValueProps {
  label: string;
  value: string;
  unit?: string;
  tone?: "default" | "critical" | "accent";
}

export function KpiValue({ label, value, unit, tone = "default" }: KpiValueProps) {
  return (
    <div className={`nf-kpi nf-kpi--${tone}`}>
      <span className="nf-kpi__label">{label}</span>
      <span className="nf-kpi__value">
        {value}
        {unit ? <span className="nf-kpi__unit">{unit}</span> : null}
      </span>
    </div>
  );
}
