/** Mot mis en avant dans un titre (dégradé de marque du logo, animé). */
export default function Highlight({ children, className = '' }) {
  return (
    <span className={`text-brand-gradient-animated motion-safe:animate-shimmer ${className}`}>
      {children}
    </span>
  );
}
