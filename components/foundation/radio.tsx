"use client";

import type { InputHTMLAttributes } from "react";

export function Radio({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} type="radio" className={`qc-radio ${className}`.trim()} />;
}
