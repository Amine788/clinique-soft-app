import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../api/axios';
import InvoicePayments from '../../components/InvoicePayments';
import { printFacture } from '../../utils/printFacture';
import { libelleStatutFacture } from '../../utils/helpers';
import { Printer, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';

// Finances de la clinique : toutes les factures, filtrables, avec le détail des montants,
// la répartition par médecin et par mode de paiement. Encaissement et impression comme à l'accueil.
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const c = n => Math.round(Number(n || 0) * 100);
const mad = cents => (cents / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' MAD';
const STATUTS = { en_attente: 'En attente', partielle: 'Assurance (ou patient) en attente', payee: 'Payée', annulee: 'Annulée', impayee: 'Impayée' };
const MODES = { especes: 'Espèces', carte: 'Carte', cheque: 'Chèque', virement: 'Virement', mobile: 'Mobile', tiers_payant: 'Tiers payant' };
const badge = { payee: 'bg-green-100 text-green-700', partielle: 'bg-brand-100 text-brand-700', annulee: 'bg-gray-100 text-gray-500', impayee: 'bg-red-100 text-red-700', en_attente: 'bg-amber-100 text-amber-700' };
const input = 'block w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white';

export default function AdminFinances() {
    const [form, setForm] = useState(() => ({ from: today().slice(0, 8) + '01', to: today(), statut: '', q: '', assurance: '', medecinId: '' }));
    const [filtres, setFiltres] = useState(form);
    const [factures, setFactures] = useState(null);
    const [erreur, setErreur] = useState('');
    const [chargement, setChargement] = useState(true);
    const [ouverte, setOuverte] = useState(null);
    const [medecins, setMedecins] = useState([]);
    const [assurances, setAssurances] = useState([]);
    const [clinic, setClinic] = useState({});
    const [version, setVersion] = useState(0);

    useEffect(() => {
        api.get('/doctors').then(r => setMedecins(r.data || [])).catch(() => {});
        api.get('/clinic').then(r => setClinic(r.data || {})).catch(() => {});
    }, []);

    const charger = useCallback(async () => {
        setChargement(true);
        try {
            const params = Object.fromEntries(Object.entries(filtres).filter(([, v]) => v));
            const { data } = await api.get('/billing', { params: { ...params, limit: 500 } });
            setFactures(data); setErreur('');
            setAssurances(prev => [...new Set([...prev, ...data.map(f => f.insurance).filter(Boolean)])].sort());
        } catch (e) {
            setFactures(null); setErreur(e.response?.data?.error || 'Impossible de charger les factures.');
        } finally { setChargement(false); }
    }, [filtres]);
    useEffect(() => { charger(); }, [charger, version]);

    const actives = useMemo(() => (factures || []).filter(f => f.statut !== 'annulee'), [factures]);
    const totaux = useMemo(() => {
        const t = { n: actives.length, ht: 0, tva: 0, ttc: 0, assurance: 0, patient: 0, encaisse: 0, encPatient: 0, encAssurance: 0, soldePatient: 0, soldeAssurance: 0 };
        for (const f of actives) {
            t.ht += c(f.sousTotal); t.tva += c(f.tva); t.ttc += c(f.total); t.assurance += c(f.assuranceMontant); t.patient += c(f.resteACharge);
            t.encaisse += c(f.montantEncaisse); t.soldePatient += c(f.soldePatient); t.soldeAssurance += c(f.soldeAssurance);
            for (const p of f.paiements || []) p.payeur === 'assurance' ? t.encAssurance += c(p.montant) : t.encPatient += c(p.montant);
        }
        return t;
    }, [actives]);
    const parMedecin = useMemo(() => {
        const m = new Map();
        for (const f of actives) {
            const cle = f.medecinId || 0;
            const r = m.get(cle) || { nom: f.medecinNom || 'Sans médecin (lignes manuelles)', n: 0, ttc: 0, encaisse: 0, reste: 0 };
            r.n++; r.ttc += c(f.total); r.encaisse += c(f.montantEncaisse); r.reste += c(f.soldePatient) + c(f.soldeAssurance);
            m.set(cle, r);
        }
        return [...m.values()].sort((a, b) => b.ttc - a.ttc);
    }, [actives]);
    const parMode = useMemo(() => {
        const m = new Map();
        for (const f of actives) for (const p of f.paiements || []) {
            const r = m.get(p.modePaiement) || { n: 0, montant: 0 };
            r.n++; r.montant += c(p.montant); m.set(p.modePaiement, r);
        }
        return [...m.entries()].sort((a, b) => b[1].montant - a[1].montant);
    }, [actives]);

    const ouvrir = async id => {
        if (ouverte?.id === id) return setOuverte(null);
        try { const { data } = await api.get('/billing/' + id); setOuverte(data); }
        catch { setOuverte(null); }
    };
    const misAJour = facture => { setOuverte(facture); setVersion(v => v + 1); };
    const maj = (k, v) => setForm(p => ({ ...p, [k]: v }));

    return <div className="space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
            <div><h1 className="page-title">Finances</h1><p className="text-sm text-gray-500 mt-1">Toutes les factures de la clinique : montants, encaissements, restes à payer, par médecin et par mode de paiement.</p></div>
            <button onClick={() => setVersion(v => v + 1)} className="btn btn-outline flex items-center gap-2"><RefreshCw size={14} /> Actualiser</button>
        </header>

        <form className="bg-white border border-gray-100 rounded-2xl p-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-7 items-end" onSubmit={e => { e.preventDefault(); setOuverte(null); setFiltres({ ...form }); }}>
            <label className="text-xs text-gray-500">Du<input aria-label="Début de période" type="date" value={form.from} onChange={e => maj('from', e.target.value)} className={input} /></label>
            <label className="text-xs text-gray-500">Au<input aria-label="Fin de période" type="date" min={form.from} value={form.to} onChange={e => maj('to', e.target.value)} className={input} /></label>
            <label className="text-xs text-gray-500">Statut<select aria-label="Statut" value={form.statut} onChange={e => maj('statut', e.target.value)} className={input}><option value="">Tous</option>{Object.entries(STATUTS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
            <label className="text-xs text-gray-500">Médecin<select aria-label="Médecin" value={form.medecinId} onChange={e => maj('medecinId', e.target.value)} className={input}><option value="">Tous</option>{medecins.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
            <label className="text-xs text-gray-500">Assurance<select aria-label="Assurance" value={form.assurance} onChange={e => maj('assurance', e.target.value)} className={input}><option value="">Toutes</option><option value="aucune">Sans assurance</option>{assurances.map(a => <option key={a} value={a}>{a}</option>)}</select></label>
            <label className="text-xs text-gray-500">Patient<input aria-label="Patient (nom ou CIN)" value={form.q} maxLength={100} placeholder="Nom ou CIN" onChange={e => maj('q', e.target.value)} className={input} /></label>
            <button disabled={chargement} className="btn btn-primary">Appliquer</button>
        </form>

        {erreur && <p role="alert" className="text-red-600 text-sm">{erreur}</p>}
        {chargement && !factures && <p className="text-sm text-gray-400">Chargement des factures…</p>}

        {factures && <>
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[['Facturé TTC', totaux.ttc, `HT ${mad(totaux.ht)} · TVA ${mad(totaux.tva)}`], ['Encaissé', totaux.encaisse, `Patients ${mad(totaux.encPatient)} · Assurances ${mad(totaux.encAssurance)}`],
                    ['Reste à encaisser', totaux.soldePatient + totaux.soldeAssurance, `Patients ${mad(totaux.soldePatient)} · Assurances ${mad(totaux.soldeAssurance)}`], ['Répartition facturée', totaux.patient, `Part patients · part assurances ${mad(totaux.assurance)}`]]
                    .map(([titre, v, detail]) => <div key={titre} className="bg-white border border-gray-100 rounded-2xl p-4"><div className="text-xs text-gray-500">{titre}</div><strong className="text-lg block mt-1">{mad(v)}</strong><div className="text-xs text-gray-500 mt-1">{detail}</div></div>)}
            </section>
            <p className="text-xs text-gray-500">{totaux.n} facture(s) sur la période, hors factures annulées{factures.length >= 500 ? ' — 500 premières seulement : réduisez la période' : ''}. Les encaissements sont ceux enregistrés sur ces factures.</p>

            <section className="grid gap-5 lg:grid-cols-3">
                <div className="lg:col-span-2 bg-white border border-gray-100 rounded-2xl p-5 overflow-x-auto">
                    <h2 className="font-semibold text-sm mb-3">Par médecin</h2>
                    <table className="w-full text-sm text-left"><thead><tr className="text-xs text-gray-500"><th className="py-2">Médecin</th><th>Factures</th><th>Facturé TTC</th><th>Encaissé</th><th>Reste</th></tr></thead>
                        <tbody>{parMedecin.map(r => <tr key={r.nom} className="border-t border-gray-100"><td className="py-2 font-medium">{r.nom}</td><td>{r.n}</td><td>{mad(r.ttc)}</td><td>{mad(r.encaisse)}</td><td>{mad(r.reste)}</td></tr>)}
                            {!parMedecin.length && <tr><td colSpan={5} className="py-4 text-center text-gray-400">Aucune facture.</td></tr>}</tbody></table>
                </div>
                <div className="bg-white border border-gray-100 rounded-2xl p-5">
                    <h2 className="font-semibold text-sm mb-3">Par mode de paiement</h2>
                    <table className="w-full text-sm text-left"><tbody>{parMode.map(([mode, r]) => <tr key={mode} className="border-t border-gray-100 first:border-0"><td className="py-2">{MODES[mode] || mode}</td><td className="text-xs text-gray-500">{r.n} paiement(s)</td><td className="text-right font-medium">{mad(r.montant)}</td></tr>)}
                        {!parMode.length && <tr><td className="py-4 text-center text-gray-400">Aucun paiement.</td></tr>}</tbody></table>
                </div>
            </section>

            <section className="bg-white border border-gray-100 rounded-2xl overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs text-gray-500"><tr>{['Date', 'Numéro', 'Patient', 'Médecin', 'Assurance', 'Total TTC', 'Encaissé', 'Reste patient', 'Reste assurance', 'Statut', ''].map(h => <th key={h} className="px-3 py-3 text-left font-semibold">{h}</th>)}</tr></thead>
                    <tbody>{factures.map(f => <FactureLigne key={f.id} f={f} ouverte={ouverte?.id === f.id ? ouverte : null} onOuvrir={() => ouvrir(f.id)} onChange={misAJour} clinic={clinic} />)}
                        {!factures.length && <tr><td colSpan={11} className="py-8 text-center text-gray-400">Aucune facture pour ces filtres.</td></tr>}</tbody>
                </table>
            </section>
        </>}
    </div>;
}

function FactureLigne({ f, ouverte, onOuvrir, onChange, clinic }) {
    return <>
        <tr className="border-t border-gray-100 hover:bg-gray-50">
            <td className="px-3 py-2 text-xs text-gray-500">{new Date(f.createdAt).toLocaleDateString('fr-FR')}</td>
            <td className="px-3 py-2 font-mono text-xs">{f.numero}</td>
            <td className="px-3 py-2">{f.patientNom || f.patientCin}<div className="text-[11px] text-gray-400">{f.patientCin}</div></td>
            <td className="px-3 py-2 text-xs">{f.medecinNom || '—'}</td>
            <td className="px-3 py-2 text-xs">{f.insurance ? `${f.insurance} (${f.assuranceTaux} %)` : 'Sans assurance'}</td>
            <td className="px-3 py-2 font-semibold">{mad(c(f.total))}</td>
            <td className="px-3 py-2">{mad(c(f.montantEncaisse))}</td>
            <td className="px-3 py-2">{mad(c(f.soldePatient))}</td>
            <td className="px-3 py-2">{mad(c(f.soldeAssurance))}</td>
            <td className="px-3 py-2"><span className={'inline-flex px-2 py-0.5 rounded-full text-xs font-bold ' + (badge[f.statut] || badge.en_attente)}>{libelleStatutFacture(f)}</span></td>
            <td className="px-3 py-2 whitespace-nowrap">
                <button onClick={onOuvrir} className="text-primary text-xs inline-flex items-center gap-1" aria-expanded={!!ouverte}>{ouverte ? <ChevronUp size={14} /> : <ChevronDown size={14} />} Détail</button>
                <button onClick={() => printFacture({ facture: ouverte || f, patientInfo: null, clinic })} className="ml-2 text-gray-500 hover:text-primary align-middle" title="Imprimer la facture" aria-label={'Imprimer ' + f.numero}><Printer size={14} /></button>
            </td>
        </tr>
        {ouverte && <tr className="bg-gray-50/60"><td colSpan={11} className="px-4 py-4">
            <div className="grid gap-4 lg:grid-cols-2">
                <div className="bg-white border border-gray-100 rounded-2xl p-4 text-sm space-y-3">
                    <h3 className="font-semibold">Prestations</h3>
                    <table className="w-full text-xs"><thead><tr className="text-gray-500 text-left"><th className="py-1">Désignation</th><th>Qté</th><th>P.U.</th><th className="text-right">Montant</th></tr></thead>
                        <tbody>{ouverte.lignes.map((l, i) => <tr key={l.id || i} className="border-t border-gray-100"><td className="py-1">{l.designation}</td><td>{Number(l.quantite)}</td><td>{mad(c(l.prixUnitaire))}</td><td className="text-right">{mad(c(l.montantTotal))}</td></tr>)}</tbody></table>
                    <dl className="grid grid-cols-2 gap-1 text-xs">
                        {[['Sous-total HT', ouverte.sousTotal], ['TVA (7 %)', ouverte.tva], ['Total TTC', ouverte.total], [`Part assurance (${ouverte.assuranceTaux} %)`, ouverte.assuranceMontant], ['Part patient', ouverte.resteACharge]]
                            .map(([k, v]) => <div key={k} className="contents"><dt className="text-gray-500">{k}</dt><dd className="text-right font-medium">{mad(c(v))}</dd></div>)}
                    </dl>
                    {ouverte.notes && <p className="text-xs text-gray-500">Notes : {ouverte.notes}</p>}
                </div>
                <InvoicePayments key={ouverte.id + ':' + (ouverte.paiements?.length || 0)} invoice={ouverte} onChange={onChange} />
            </div>
        </td></tr>}
    </>;
}
