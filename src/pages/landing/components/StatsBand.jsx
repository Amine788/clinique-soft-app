import { moduleGroups, roles } from '../data';

/* Chiffres tirés du contenu réel de la plateforme (aucune statistique client). */
const stats = [
  { value: moduleGroups.flatMap((g) => g.modules).length, label: 'modules métier', desc: 'de l’accueil à la facturation' },
  { value: roles.length, label: 'espaces par rôle', desc: 'médecin, accueil, soins, labo…' },
  { value: moduleGroups.length, label: 'grandes étapes', desc: 'accueillir, soigner, analyser…' },
  { value: 1, label: 'dossier partagé', desc: 'par patient, pour toute l’équipe' },
];

export default function StatsBand() {
  return (
    <section aria-label="La plateforme en chiffres" className="border-y border-slate-200 bg-white">
      <dl className="mx-auto grid max-w-7xl grid-cols-2 gap-x-6 gap-y-8 px-4 py-10 sm:px-6 lg:grid-cols-4 lg:px-8">
        {stats.map((s) => (
          <div key={s.label} className="text-center lg:text-left">
            <dt className="sr-only">{s.label}</dt>
            <dd>
              <span className="block text-4xl font-extrabold tracking-tight text-brand-600">{s.value}</span>
              <span className="mt-1 block font-semibold text-slate-900">{s.label}</span>
              <span className="block text-sm text-slate-500">{s.desc}</span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
