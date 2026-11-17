import { useState } from 'react';

/**
 * Logo de marque (/logo.png, fond transparent, déjà recadré ≈ 4,15:1).
 * Repli local si l'image manque.
 */
export default function Logo({ className = 'h-10' }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span className={`inline-flex items-center gap-2 ${className}`}>
        <img src="/logo-fallback.svg" alt="" className="h-full w-auto" />
        <span className="text-lg font-extrabold tracking-tight text-brand-600">NextClinic</span>
      </span>
    );
  }

  return (
    <img
      src="/logo.png"
      alt="NextClinic ERP"
      width="531"
      height="128"
      className={`w-auto object-contain ${className}`}
      onError={() => setFailed(true)}
    />
  );
}
