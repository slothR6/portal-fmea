import React from "react";
import { FMEA_LOGO_PUBLIC_PATH } from "../constants";

export default function Logo({
  size = 96,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <img
      src={FMEA_LOGO_PUBLIC_PATH}
      alt="FMEA"
      width={size}
      height={size}
      className={`object-contain ${className}`}
      draggable={false}
    />
  );
}
