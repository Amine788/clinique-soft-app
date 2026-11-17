import { Link } from 'react-router-dom';
import { Globe, Mail, MapPin, Phone } from 'lucide-react';
import { contact, navLinks } from '../data';
import Logo from './ui/Logo';

const linkClass =
  'rounded text-slate-400 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white';

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="bg-slate-950 text-sm text-slate-400">
      <div className="mx-auto max-w-7xl px-4 pt-16 pb-10 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-12 md:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.4fr]">
          <div>
            {/* Logo en blanc sur le fond sombre */}
            <Logo className="h-10 brightness-0 invert" />
            <p className="mt-4 max-w-xs leading-relaxed">
              L’ERP médical pensé pour les cliniques et cabinets marocains. Édité par {contact.company}.
            </p>
          </div>

          <nav aria-label="Produit">
            <h2 className="text-sm font-semibold text-white">Produit</h2>
            <ul className="mt-4 space-y-3">
              {[...navLinks, { label: 'Démo', href: '#demo' }].map((l) => (
                <li key={l.href}>
                  <a href={l.href} className={linkClass}>{l.label}</a>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Accès">
            <h2 className="text-sm font-semibold text-white">Accès</h2>
            <ul className="mt-4 space-y-3">
              <li><Link to="/login" className={linkClass}>Se connecter</Link></li>
              <li><Link to="/register" className={linkClass}>S’abonner</Link></li>
              <li><a href="#demo" className={linkClass}>Essai gratuit 24 h</a></li>
            </ul>
          </nav>

          <div>
            <h2 className="text-sm font-semibold text-white">Coordonnées</h2>
            <address className="mt-4 space-y-3 not-italic">
              <a href={contact.mapUrl} target="_blank" rel="noopener noreferrer" className={`flex items-start gap-3 ${linkClass}`}>
                <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>{contact.address[0]}<br />{contact.address[1]}</span>
              </a>
              <a href={contact.phoneHref} className={`flex items-center gap-3 ${linkClass}`}>
                <Phone className="size-4 shrink-0" aria-hidden="true" />
                {contact.phone}
              </a>
              <a href={`mailto:${contact.email}`} className={`flex items-center gap-3 break-all ${linkClass}`}>
                <Mail className="size-4 shrink-0" aria-hidden="true" />
                {contact.email}
              </a>
              <a href={contact.websiteUrl} target="_blank" rel="noopener noreferrer" className={`flex items-center gap-3 ${linkClass}`}>
                <Globe className="size-4 shrink-0" aria-hidden="true" />
                {contact.website}
              </a>
            </address>
          </div>
        </div>

        <div className="mt-14 border-t border-slate-800 pt-8 text-xs">
          © {year} NextClinic by {contact.company}. Tous droits réservés.
        </div>
      </div>
    </footer>
  );
}
