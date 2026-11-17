import Reveal from './Reveal';

export default function SectionHeader({ badge, icon: Icon, title, subtitle, align = 'center', className = '' }) {
  const centered = align === 'center';
  return (
    <Reveal className={`${centered ? 'mx-auto text-center' : ''} max-w-3xl ${className}`}>
      {badge && (
        <p className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3.5 py-1.5 text-xs font-semibold tracking-wide text-brand-700 uppercase ring-1 ring-brand-100">
          {Icon && <Icon className="size-3.5" aria-hidden="true" />}
          {badge}
        </p>
      )}
      <h2 className="mt-5 text-3xl font-extrabold tracking-tight text-balance text-slate-900 sm:text-4xl lg:text-5xl">
        {title}
      </h2>
      {subtitle && <p className="mt-5 text-base leading-relaxed text-pretty text-slate-600 sm:text-lg">{subtitle}</p>}
    </Reveal>
  );
}
