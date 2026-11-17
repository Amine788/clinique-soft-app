import { Link } from 'react-router-dom';

const base =
  'group/btn relative isolate overflow-hidden inline-flex items-center justify-center gap-2 rounded-xl font-semibold whitespace-nowrap transition-all duration-200 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ' +
  'disabled:cursor-not-allowed disabled:opacity-60 motion-safe:enabled:hover:-translate-y-0.5';

const variants = {
  primary: 'bg-brand-600 text-white shadow-lg shadow-brand-600/20 hover:bg-brand-700 hover:shadow-brand-600/30',
  secondary: 'bg-white text-slate-900 ring-1 ring-slate-200 shadow-sm hover:bg-slate-50 hover:ring-slate-300',
  ghost: 'text-slate-700 hover:bg-brand-50 hover:text-brand-700',
  inverse: 'bg-white text-brand-700 shadow-lg shadow-brand-950/20 hover:bg-brand-50 focus-visible:outline-white',
  'inverse-outline': 'text-white ring-1 ring-white/40 hover:bg-white/10 focus-visible:outline-white',
};

const sizes = {
  sm: 'h-9 px-4 text-sm',
  md: 'h-11 px-5 text-sm',
  lg: 'h-13 px-7 text-base',
};

/* Reflet lumineux qui balaie les boutons pleins au survol. */
const shine = (
  <span
    aria-hidden="true"
    className="pointer-events-none absolute inset-y-0 -left-1/2 -z-10 w-1/3 bg-linear-to-r from-transparent via-white/30 to-transparent motion-safe:group-hover/btn:animate-shine"
  />
);

/** Bouton polymorphe : `to` → Link (router), `href` → <a>, sinon <button>. */
export default function Button({ variant = 'primary', size = 'md', to, href, className = '', children: label, ...rest }) {
  const classes = `${base} ${variants[variant]} ${sizes[size]} ${className}`;
  const children = variant === 'primary' || variant === 'inverse' ? <>{shine}{label}</> : label;
  if (to) return <Link to={to} className={classes} {...rest}>{children}</Link>;
  if (href) return <a href={href} className={classes} {...rest}>{children}</a>;
  return <button type="button" className={classes} {...rest}>{children}</button>;
}
