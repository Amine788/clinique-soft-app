import { useRef, useState } from 'react';
import api from '../api/axios';
import toast from 'react-hot-toast';
import { libelleStatutFacture } from '../utils/helpers';
const money = n => Number(n || 0).toFixed(2) + ' MAD';
const MODES = [['especes', 'Espèces'], ['carte', 'Carte'], ['cheque', 'Chèque'], ['virement', 'Virement'], ['mobile', 'Mobile']];
// Pas de paiement partiel : le patient règle toute sa part, l'assurance toute la sienne ; seul le mode se choisit.
export default function InvoicePayments({ invoice, onChange, defaultMode = 'especes' }) {
    const soldePatient = Number(invoice.soldePatient) || 0, soldeAssurance = Number(invoice.soldeAssurance) || 0;
    const payer = soldePatient > 0 ? 'patient' : 'assurance';
    const due = payer === 'patient' ? soldePatient : soldeAssurance;
    const [mode, setMode] = useState(defaultMode);
    const [busy, setBusy] = useState(false);
    const reference = useRef(crypto.randomUUID());
    const pay = async e => {
        e.preventDefault(); if (busy) return; setBusy(true);
        try {
            const { data } = await api.patch('/billing/' + invoice.id + '/pay', { payeur: payer, modePaiement: mode, reference: reference.current });
            onChange(data.facture); reference.current = crypto.randomUUID();
            toast.success('Paiement enregistré');
        } catch (err) { toast.error(err.response?.data?.error || 'Paiement impossible'); }
        finally { setBusy(false); }
    };
    return <section className="bg-white border border-gray-100 rounded-2xl p-5 space-y-5">
        <div className="flex flex-wrap gap-5 text-sm">
            <div>Encaissé enregistré <strong className="block">{money(invoice.montantEncaisse)}</strong></div>
            <div>Solde patient <strong className="block">{money(soldePatient)}</strong></div>
            <div>Solde assurance <strong className="block">{money(soldeAssurance)}</strong></div>
            <div>Statut <strong className="block">{libelleStatutFacture(invoice)}</strong></div>
        </div>
        {invoice.encaissementHistorique && <p className="text-xs text-amber-700">Facture historique déclarée payée. Le montant réellement encaissé n’est pas reconstitué.</p>}
        {!['payee', 'annulee'].includes(invoice.statut) && due > 0 && <form onSubmit={pay} className="flex flex-wrap items-end gap-3">
            <div className="text-sm">
                <div className="text-xs text-gray-500">{payer === 'patient' ? 'Part du patient' : 'Part de l’assurance'}</div>
                <strong className="block">{money(due)}</strong>
            </div>
            <label className="text-xs text-gray-500">Mode de paiement<select aria-label="Mode du règlement" value={mode} onChange={e => { setMode(e.target.value); reference.current = crypto.randomUUID(); }} className="block border rounded-lg px-3 py-2">
                {MODES.map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select></label>
            <button disabled={busy} className="px-4 py-2 rounded-lg bg-primary text-white text-sm disabled:opacity-50">{busy ? 'Enregistrement…' : `Encaisser ${money(due)}`}</button>
        </form>}
        {!!invoice.paiements?.length && <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="text-left text-gray-500"><th className="py-2">Date</th><th>Payeur</th><th>Montant reçu</th><th>Mode</th><th>Saisi par</th></tr></thead>
            <tbody>{invoice.paiements.map(p => <tr key={p.id} className="border-t border-gray-100"><td className="py-2">{new Date(p.datePaiement).toLocaleString('fr-FR')}</td><td>{p.payeur === 'assurance' ? 'Assurance' : 'Patient'}</td><td>{money(p.montant)}</td><td>{Object.fromEntries(MODES)[p.modePaiement] || p.modePaiement}</td><td>#{p.creeParUserId}</td></tr>)}</tbody></table></div>}
    </section>;
}
