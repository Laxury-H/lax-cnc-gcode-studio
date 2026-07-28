import { ReactNode } from "react";
import { Icon } from "./Icon";

export function MetricCard({
  icon,
  label,
  children,
  detail,
  tone,
  onClick,
}: {
  icon: string;
  label: string;
  children: ReactNode;
  detail?: ReactNode;
  tone?: "success" | "warning" | "danger";
  onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      className={`metric-card${tone ? ` is-${tone}` : ""}${onClick ? " is-clickable" : ""}`}
      onClick={onClick}
      type={onClick ? "button" : undefined}
    >
      <div className="metric-heading">
        <Icon name={icon} size={20} />
        <span>{label}</span>
      </div>
      <div className="metric-value">{children}</div>
      {detail && <div className="metric-detail">{detail}</div>}
    </Tag>
  );
}
