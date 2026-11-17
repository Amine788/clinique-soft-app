import { useAuthStore } from '../../store/authStore';
import React, { useState } from 'react';
import { X, Save } from 'lucide-react';
import api from '../../api/axios';
import toast from 'react-hot-toast';

// Modification d'un patient (PUT /api/patients/:numeroDossier) : identité, coordonnées, assurance,
// groupe sanguin, allergies et maladies chroniques. Le CIN n'est pas modifiable (identifiant du dossier).

const GROUPES_SANGUINS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const versListe = texte => texte.split(',').map(t => t.trim()).filter(Boolean);
const inputCls = 'w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none';

function Champ({ label, children, large }) {
    return (
        <label className={`block ${large ? 'sm:col-span-2' : ''}`}>
            <span className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">{label}</span>
            {children}
        </label>
    );
}

export default function EditPatientModal({ patient, onClose, onSaved }) {
    const canEditMedical = useAuthStore(s => s.user?.role) === 'doctor';
    const [form, setForm] = useState({
        nom: patient.nom || '',
        prenom: patient.prenom || '',
        dateNaissance: patient.dateNaissance?.slice(0, 10) || '',
        sexe: patient.sexe || 'M',
        telephonePrincipal: patient.telephonePrincipal || patient.phone || '',
        email: patient.email || '',
        adresseRue: patient.adresseRue || '',
        adresseVille: patient.adresseVille || '',
        cinExpiration: patient.cin?.dateExpiration?.slice(0, 10) || '',
        insurance: patient.insurance || '',
        bloodType: patient.bloodType || '',
        allergies: (patient.allergies || []).join(', '),
        chronic: (patient.chronic || []).join(', '),
    });
    const [saving, setSaving] = useState(false);
    const set = (champ) => (e) => setForm(prev => ({ ...prev, [champ]: e.target.value }));

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.nom.trim() || !form.prenom.trim() || !form.dateNaissance || !form.telephonePrincipal.trim()) {
            toast.error('Nom, prénom, date de naissance et téléphone sont obligatoires');
            return;
        }
        setSaving(true);
        try {
            const payload = {
                ...form,
                allergies: versListe(form.allergies),
                chronic: versListe(form.chronic),
            };
            if (!canEditMedical) for (const key of ['bloodType', 'allergies', 'chronic']) delete payload[key];
            await api.put(`/patients/${patient.numeroDossier || patient.id}`, payload);
            toast.success('Dossier patient mis à jour');
            onSaved();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Erreur lors de la mise à jour');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="titre-modif-patient">
            <form onSubmit={handleSubmit} className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
                <div className="mb-5 flex items-center justify-between">
                    <div>
                        <h3 id="titre-modif-patient" className="text-lg font-bold text-gray-900">Modifier le patient</h3>
                        <p className="text-xs text-gray-500">CIN {patient.cin?.numero} · Dossier {patient.numeroDossier || patient.id}</p>
                    </div>
                    <button type="button" onClick={onClose} aria-label="Fermer" className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100"><X size={18} /></button>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Champ label="Nom *"><input value={form.nom} onChange={set('nom')} className={inputCls} /></Champ>
                    <Champ label="Prénom *"><input value={form.prenom} onChange={set('prenom')} className={inputCls} /></Champ>
                    <Champ label="Date de naissance *"><input type="date" value={form.dateNaissance} onChange={set('dateNaissance')} className={inputCls} /></Champ>
                    <Champ label="Sexe">
                        <select value={form.sexe} onChange={set('sexe')} className={inputCls}>
                            <option value="M">Masculin</option>
                            <option value="F">Féminin</option>
                        </select>
                    </Champ>
                    <Champ label="Téléphone *"><input value={form.telephonePrincipal} onChange={set('telephonePrincipal')} className={inputCls} /></Champ>
                    <Champ label="E-mail"><input type="email" value={form.email} onChange={set('email')} className={inputCls} /></Champ>
                    <Champ label="Adresse"><input value={form.adresseRue} onChange={set('adresseRue')} className={inputCls} /></Champ>
                    <Champ label="Ville"><input value={form.adresseVille} onChange={set('adresseVille')} className={inputCls} /></Champ>
                    <Champ label="Expiration du CIN"><input type="date" value={form.cinExpiration} onChange={set('cinExpiration')} className={inputCls} /></Champ>
                    <Champ label="Assurance (ex. CNSS 70%)"><input value={form.insurance} onChange={set('insurance')} placeholder="Aucune" className={inputCls} /></Champ>
                    {canEditMedical && (<Champ label="Groupe sanguin">
                        <select value={form.bloodType} onChange={set('bloodType')} className={inputCls}>
                            <option value="">Non renseigné</option>
                            {GROUPES_SANGUINS.map(g => <option key={g} value={g}>{g}</option>)}
                        </select>
                    </Champ>)}
                    <div />
                    {canEditMedical && (<Champ label="Allergies (séparées par des virgules)" large>
                        <input value={form.allergies} onChange={set('allergies')} placeholder="Ex : Pénicilline, Latex" className={inputCls} />
                    </Champ>)}
                    {canEditMedical && (<Champ label="Maladies chroniques (séparées par des virgules)" large>
                        <input value={form.chronic} onChange={set('chronic')} placeholder="Ex : Diabète de type 2, Hypertension" className={inputCls} />
                    </Champ>)}
                </div>

                <div className="mt-6 flex justify-end gap-2">
                    <button type="button" onClick={onClose} className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50">Annuler</button>
                    <button type="submit" disabled={saving} className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2 text-sm font-bold text-white hover:bg-primary-hover disabled:opacity-60">
                        <Save size={15} /> {saving ? 'Enregistrement…' : 'Enregistrer'}
                    </button>
                </div>
            </form>
        </div>
    );
}
