import { useState } from 'react';
import { AlertCircle, ArrowRight, Hourglass, KeyRound, Loader2, Lock, MailCheck, PartyPopper, RotateCcw } from 'lucide-react';
import Button from './ui/Button';
import api from '../../../api/axios';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const fields = [
  { name: 'prenom', label: 'Prénom', placeholder: 'Votre prénom', required: true, autoComplete: 'given-name', half: true },
  { name: 'nom', label: 'Nom', placeholder: 'Votre nom', required: true, autoComplete: 'family-name', half: true },
  { name: 'email', label: 'Adresse email', type: 'email', placeholder: 'vous@clinique.ma', required: true, autoComplete: 'email' },
  { name: 'telephone', label: 'Téléphone', type: 'tel', placeholder: '+212 6 XX XX XX XX', autoComplete: 'tel' },
  { name: 'clinique', label: 'Clinique / Établissement', placeholder: 'Nom de votre clinique ou cabinet', required: true, autoComplete: 'organization' },
];

function validate(form) {
  const errors = {};
  if (!form.prenom.trim()) errors.prenom = 'Indiquez votre prénom.';
  if (!form.nom.trim()) errors.nom = 'Indiquez votre nom.';
  if (!form.email.trim()) errors.email = 'L’adresse email est obligatoire.';
  else if (!EMAIL_RE.test(form.email)) errors.email = 'Adresse email invalide.';
  if (!form.clinique.trim()) errors.clinique = 'Indiquez le nom de votre établissement.';
  return errors;
}

/** Message d'erreur lisible à partir de l'erreur axios ({ error } JSON, texte brut ou erreur réseau). */
function readServerError(err) {
  const res = err.response;
  if (!res) return err.message;
  if (res.data?.error) return res.data.error;
  if (typeof res.data === 'string' && res.data) return res.data;
  return `Erreur serveur: ${res.status} ${res.statusText}`;
}

const inputBase =
  'block w-full rounded-xl border bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 transition-[border-color,box-shadow] duration-150 focus:outline-none';

export default function DemoForm() {
  const [form, setForm] = useState({ prenom: '', nom: '', email: '', telephone: '', clinique: '', message: '' });
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState('idle'); // idle | sending | success | error
  const [errorMessage, setErrorMessage] = useState('');
  const [rawKey, setRawKey] = useState(null);
  const [emailEnvoye, setEmailEnvoye] = useState(true);

  const set = (k) => (e) => {
    const value = e.target.value;
    setForm((prev) => ({ ...prev, [k]: value }));
    if (errors[k]) setErrors((prev) => ({ ...prev, [k]: undefined }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length) {
      document.getElementById(`demo-${Object.keys(found)[0]}`)?.focus();
      return;
    }
    setStatus('sending');
    try {
      const payload = {
        clinicName: form.clinique,
        ownerName: `${form.prenom} ${form.nom}`,
        email: form.email,
        phone: form.telephone,
        country: 'Maroc',
        plan: 'Pro',
      };
      // Page publique ; le serveur attend l'envoi de l'e-mail de bienvenue avant de répondre
      const { data } = await api.post('/auth/register', payload, { skipAuthRedirect: true, timeout: 30000 });

      if (data.success) {
        setRawKey(data.rawKey);
        setEmailEnvoye(data.emailEnvoye !== false);
        setStatus('success');
      } else {
        throw new Error(data.error || 'La création de la clinique a échoué.');
      }
    } catch (err) {
      setStatus('error');
      setErrorMessage(readServerError(err) || 'Erreur de connexion au serveur.');
      console.error('[SAAS REGISTER]', err);
    }
  };

  if (status === 'error') {
    return (
      <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center sm:p-10">
        <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-red-100 text-red-600">
          <AlertCircle className="size-7" aria-hidden="true" />
        </span>
        <h3 className="mt-5 text-xl font-bold text-red-800">Oups, une erreur est survenue</h3>
        <p className="mt-3 font-medium text-red-700">{errorMessage}</p>
        <p className="mt-3 text-sm text-red-700">
          Veuillez réessayer ou nous contacter à{' '}
          <a href="mailto:support@nextact-solutions.com" className="font-semibold underline underline-offset-2">support@nextact-solutions.com</a>
        </p>
        <button
          type="button"
          onClick={() => setStatus('idle')}
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-red-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
        >
          <RotateCcw className="size-4" aria-hidden="true" />
          Réessayer
        </button>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 sm:p-10">
        <div className="text-center">
          <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
            <PartyPopper className="size-7" aria-hidden="true" />
          </span>
          <h3 className="mt-5 text-2xl font-bold text-emerald-800">Votre clinique a été créée !</h3>
          {emailEnvoye ? (
            <p className="mt-3 leading-relaxed text-emerald-900">
              Félicitations, votre espace NextClinic est prêt ! Un <strong>email de configuration</strong> vient d’être envoyé à l’adresse{' '}
              <strong className="break-all">{form.email}</strong>. Cliquez sur le lien dans l’email pour <strong>créer votre mot de passe</strong> administrateur et activer votre compte.
            </p>
          ) : (
            <p className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-left leading-relaxed text-amber-900">
              Votre espace est créé, mais <strong>l’email de configuration n’a pas pu être envoyé</strong> à{' '}
              <strong className="break-all">{form.email}</strong>. Contactez l’équipe NextClinic au{' '}
              <a href="tel:+212660406878" className="font-bold underline">+212 660-406878</a> ou à{' '}
              <a href="mailto:support@nextact-solutions.com" className="font-bold underline">support@nextact-solutions.com</a>{' '}
              pour recevoir votre lien d’activation.
            </p>
          )}
        </div>

        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5">
          <h4 className="flex items-center gap-2 text-sm font-bold text-amber-800">
            <Hourglass className="size-4" aria-hidden="true" />
            Essai gratuit de 24 heures
          </h4>
          <p className="mt-2 text-sm leading-relaxed text-amber-900">
            Votre clinique est active gratuitement pendant <strong>24 heures</strong> pour tester la plateforme. Passé ce délai, l’accès sera <strong>suspendu</strong> tant que l’abonnement n’est pas réglé.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-amber-900">
            Pour activer votre abonnement sans interruption de service, contactez l’équipe NextClinic avant la fin de l’essai.
          </p>
        </div>

        {rawKey && (
          <div className="mt-4 rounded-xl border border-amber-300 bg-white p-5">
            <h4 className="flex items-center gap-2 text-sm font-bold text-amber-800">
              <KeyRound className="size-4" aria-hidden="true" />
              Clé d’activation de la clinique (à conserver)
            </h4>
            <p className="mt-2 text-sm leading-relaxed text-amber-900">
              Cette clé est générée une seule fois pour des raisons de sécurité. Vous en aurez besoin pour activer votre serveur local ou vos intégrations.
            </p>
            <code className="mt-3 block rounded-lg bg-slate-50 px-4 py-3 font-mono text-base font-bold tracking-wide break-all text-slate-900 ring-1 ring-amber-200 select-all">
              {rawKey}
            </code>
          </div>
        )}

        <p className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-slate-700 ring-1 ring-emerald-100">
          <MailCheck className="size-4 text-emerald-600" aria-hidden="true" />
          Vérifiez votre boîte de réception (et vos spams)
        </p>
      </div>
    );
  }

  const sending = status === 'sending';

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      aria-labelledby="demo-form-title"
      className="rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl shadow-brand-900/10 sm:p-10"
    >
      <h3 id="demo-form-title" className="text-2xl font-bold tracking-tight text-slate-900">Créer mon espace NextClinic</h3>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">
        Remplissez ce formulaire pour créer automatiquement votre clinique et recevoir votre lien d’activation par email.
      </p>
      <p className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 ring-1 ring-brand-100">
        <Hourglass className="size-3.5" aria-hidden="true" />
        24 heures d’essai gratuit
      </p>

      <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2">
        {fields.map((f) => {
          const id = `demo-${f.name}`;
          const error = errors[f.name];
          return (
            <div key={f.name} className={f.half ? '' : 'sm:col-span-2'}>
              <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-slate-800">
                {f.label}
                {f.required && <span className="text-red-600" aria-hidden="true"> *</span>}
              </label>
              <input
                id={id}
                name={f.name}
                type={f.type || 'text'}
                value={form[f.name]}
                onChange={set(f.name)}
                placeholder={f.placeholder}
                autoComplete={f.autoComplete}
                aria-required={f.required || undefined}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${id}-error` : undefined}
                className={`${inputBase} ${error ? 'border-red-400 focus:border-red-500 focus:ring-4 focus:ring-red-100' : 'border-slate-300 focus:border-brand-600 focus:ring-4 focus:ring-brand-100'}`}
              />
              {error && (
                <p id={`${id}-error`} className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-red-600">
                  <AlertCircle className="size-3.5" aria-hidden="true" />
                  {error}
                </p>
              )}
            </div>
          );
        })}

        <div className="sm:col-span-2">
          <label htmlFor="demo-message" className="mb-1.5 block text-sm font-semibold text-slate-800">
            Message / Spécialités
          </label>
          <textarea
            id="demo-message"
            name="message"
            rows={4}
            value={form.message}
            onChange={set('message')}
            placeholder="Décrivez votre activité, le nombre de médecins, vos besoins spécifiques..."
            className={`${inputBase} min-h-24 resize-y border-slate-300 focus:border-brand-600 focus:ring-4 focus:ring-brand-100`}
          />
        </div>
      </div>

      <Button type="submit" size="lg" disabled={sending} className="mt-8 w-full" aria-live="polite">
        {sending ? (
          <>
            <Loader2 className="size-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            Création en cours…
          </>
        ) : (
          <>
            Créer ma clinique (24 h gratuites)
            <ArrowRight className="size-5" aria-hidden="true" />
          </>
        )}
      </Button>

      <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-slate-500">
        <Lock className="size-3.5" aria-hidden="true" />
        Vos données sont confidentielles et ne seront jamais partagées.
      </p>
    </form>
  );
}
