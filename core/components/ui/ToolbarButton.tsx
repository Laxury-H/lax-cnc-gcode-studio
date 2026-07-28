import { Icon } from "./Icon";

export function ToolbarButton({
  icon,
  label,
  onClick,
  active,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      className={`icon-button${active ? " is-active" : ""}`}
      onClick={onClick}
      aria-label={label}
      title={label}
      type="button"
    >
      <Icon name={icon} size={19} />
    </button>
  );
}
