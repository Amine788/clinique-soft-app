import { trustItems } from '../data';

/** Bandeau des points forts techniques : chaque point une seule fois, sans défilement. */
export default function TrustBar() {
  return (
    <section aria-label="Points forts techniques" className="border-y border-slate-200 bg-slate-50">
      <ul className="mx-auto flex max-w-7xl flex-wrap justify-center gap-x-10 gap-y-6 px-4 py-8 sm:px-6 lg:justify-between lg:px-8">
        {trustItems.map(({ icon, title, desc }) => {
          const Icon = icon;
          return (
            <li key={title} className="flex w-full max-w-60 items-center gap-3 sm:w-auto">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white text-brand-700 ring-1 ring-slate-200">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <span>
                <span className="block text-sm font-semibold text-slate-900">{title}</span>
                <span className="block text-xs text-slate-600">{desc}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
