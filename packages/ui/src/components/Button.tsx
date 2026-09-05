import type { ButtonHTMLAttributes, ReactNode } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  icon?: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  theme?: "dark" | "light";
  fullWidth?: boolean;
}

export function Button({
  children,
  icon,
  variant = "primary",
  theme = "dark",
  fullWidth = false,
  className = "",
  ...props
}: ButtonProps) {
  return (
    <button
      className={`nf-button nf-button--${theme} nf-button--${variant} ${fullWidth ? "nf-button--full" : ""} ${className}`}
      {...props}
    >
      {icon ? <span className="nf-button__icon" aria-hidden="true">{icon}</span> : null}
      <span>{children}</span>
    </button>
  );
}
