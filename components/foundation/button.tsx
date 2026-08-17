import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Button({ variant = "primary", children, className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "text" | "danger"; children: ReactNode }) {
  return <button className={`qc-button qc-button-${variant} ${className}`.trim()} {...props}>{children}</button>;
}
