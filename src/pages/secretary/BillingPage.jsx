import React, { useState, useEffect } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import {
    Search, CreditCard, FileText, CheckCircle, Stethoscope,
    Pill, Microscope, Plus, Trash2, Download, ChevronRight,
    AlertCircle, User, Clock, TrendingUp, Printer, BedDouble
} from 'lucide-react';
import logo from '../../assets/logo-full.png';
import { mentions, urlPublique } from '../../utils/helpers';


/* ─────────────────────────────────────────────────────────────────────────────
   Génération PDF (impression navigateur)
   ───────────────────────────────────────────────────────────────────────────── */
function printFacture({ facture, patientInfo, clinic: clinicInfo }) {
    const lines = Array.isArray(facture.lignes) ? facture.lignes : JSON.parse(facture.lignes || '[]');
    const date = new Date(facture.createdAt || Date.now()).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
    const modeLabel = { especes: 'Espèces', carte: 'Carte bancaire', virement: 'Virement bancaire', cheque: 'Chèque', tiers_payant: 'Tiers payant' };
    const sourceIcon = { consultation: '🩺', medicament: '💊', examen: '🔬', chambre: '🛏️' };

    // Coordonnées de la clinique (fiche « Ma Clinique ») : un champ non renseigné n'est pas imprimé
    const cName = clinicInfo?.name || '';
    // Pied légal : raison sociale de la clinique, à défaut son nom
    const cRaisonSociale = clinicInfo?.raisonSociale || cName;
    const cAddress = clinicInfo?.address || '';
    // Logo de la clinique s'il existe, sinon celui de NextClinic (adresse absolue : la facture s'ouvre dans une autre fenêtre)
    const logoFacture = urlPublique(clinicInfo?.logoUrl) || new URL(logo, window.location.origin).href;
    const lignesLegales = [
        mentions([['ICE', clinicInfo?.ice], ['IF', clinicInfo?.ifNum], ['RC', clinicInfo?.rc], ['TP', clinicInfo?.tp]]),
        mentions([['Tél', clinicInfo?.phone], ['Email', clinicInfo?.email]]),
    ].filter(Boolean);
    const ligneRIB = mentions([['RIB', clinicInfo?.rib]]);


    const lignesHtml = lines.map(l => `
        <tr>
            <td style="padding:12px 16px;font-size:13px;border-bottom:1px solid #f1f5f9;">
                <span style="margin-right:8px;filter:grayscale(0.5);">${sourceIcon[l.sourceType] || '📋'}</span>
                ${l.designation}
            </td>
            <td style="padding:12px 16px;text-align:center;font-size:13px;border-bottom:1px solid #f1f5f9;">${l.quantite}</td>
            <td style="padding:12px 16px;text-align:right;font-size:13px;border-bottom:1px solid #f1f5f9;">${Number(l.prixUnitaire).toFixed(2)} MAD</td>
            <td style="padding:12px 16px;text-align:right;font-size:13px;font-weight:700;border-bottom:1px solid #f1f5f9;color:#0f172a;">${(Number(l.quantite) * Number(l.prixUnitaire)).toFixed(2)} MAD</td>
        </tr>
    `).join('');

    const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"/>
<title>Facture ${facture.numero}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter', -apple-system, sans-serif;background:#fff;color:#1e293b;font-size:14px;line-height:1.5}
.page{max-width:850px;margin:0 auto;padding:50px}
.header{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;padding-bottom:10px;}
.clinic-brand{display:flex;align-items:center;gap:18px}
.logo-img{max-width:280px;width:auto;height:auto;max-height:100px;object-fit:contain;}
.invoice-badge{background:linear-gradient(135deg, #81c3d1 0%, #99d6c4 100%);padding:25px 40px;border-radius:25px;text-align:center;color:#fff;min-width:280px;box-shadow:0 4px 15px rgba(129, 195, 209, 0.15)}
.inv-type{font-size:11px;text-transform:uppercase;letter-spacing:2px;font-weight:700;margin-bottom:8px;opacity:0.9}
.inv-num{font-size:24px;font-weight:800;letter-spacing:-0.5px;margin:0}
.inv-date{font-size:13px;color:#64748b;margin-top:10px;text-align:right}
.header-line{height:6px;background:#81c3d1;border-radius:10px;margin-bottom:40px;width:100%;opacity:0.8}
.parties{display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-bottom:40px}
.party{padding:20px;background:#f8fafc;border-radius:16px;border:1px solid #f1f5f9}
.party .ttl{font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:#64748b;font-weight:700;margin-bottom:10px}
.party .nm{font-size:16px;font-weight:800;color:#0f172a}
.party .dt{font-size:12px;color:#475569;margin-top:6px;line-height:1.6}
table{width:100%;border-collapse:separate;border-spacing:0;margin-bottom:30px}
thead th{padding:14px 16px;font-size:11px;text-transform:uppercase;letter-spacing:1px;font-weight:700;color:#fff;background:linear-gradient(135deg, #81c3d1 0%, #99d6c4 100%);text-align:right;border:none}
thead th:first-child{text-align:left;border-top-left-radius:12px;border-bottom-left-radius:12px}
thead th:last-child{border-top-right-radius:12px;border-bottom-right-radius:12px}
.totals-container{display:flex;justify-content:flex-end}
.totals-box{width:340px;background:#fff;color:#0f172a;border-radius:20px;padding:25px;border:1px solid #f1f5f9;box-shadow:0 10px 25px -5px rgba(0,0,0,0.05)}
.row{display:flex;justify-content:space-between;padding:6px 0;font-size:13px;color:#64748b}
.row.total-ttc{border-top:1px solid #f1f5f9;margin-top:10px;padding-top:15px;font-size:20px;font-weight:900;color:#0f172a}
.row.ins{color:#16a34a;font-weight:600}

.payment-footer{margin-top:40px;display:flex;justify-content:space-between;align-items:center;padding:20px;background:linear-gradient(135deg, #81c3d1 0%, #99d6c4 100%);border-radius:16px;color:#fff}
.pm-item{display:flex;flex-direction:column;gap:4px}
.pm-lbl{font-size:10px;text-transform:uppercase;color:rgba(255,255,255,0.8);font-weight:700}
.pm-val{font-size:14px;font-weight:700;color:#fff}
.statut-pill{background:rgba(255,255,255,0.2);color:#fff;padding:6px 16px;border-radius:30px;font-size:12px;font-weight:800;text-transform:uppercase;border:1px solid rgba(255,255,255,0.3)}

.legal-footer{margin-top:50px;text-align:center;font-size:11px;color:#94a3b8;line-height:1.8}
@media print{
  body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .totals-box{background:#fff !important;color:#0f172a !important;border:1px solid #f1f5f9 !important}
  .row.total-ttc{border-top:1px solid #f1f5f9 !important;color:#0f172a !important}
  .invoice-badge{background:linear-gradient(135deg, #81c3d1 0%, #99d6c4 100%) !important;color:#fff !important}
  thead th{background:linear-gradient(135deg, #81c3d1 0%, #99d6c4 100%) !important;color:#fff !important}
  .payment-footer{background:linear-gradient(135deg, #81c3d1 0%, #99d6c4 100%) !important;color:#fff !important}
  .header-line{background:#81c3d1 !important}
}

</style></head>
<body>
<div class="page">
  <div class="header">
    <div class="clinic-brand">
      <img src="${logoFacture}" class="logo-img" alt="Logo"/>
    </div>
    <div style="display:flex;flex-direction:column;align-items:flex-end">
        <div class="invoice-badge">
            <div class="inv-type">Facture</div>
            <div class="inv-num">${facture.numero}</div>
        </div>
        <div class="inv-date">Date: ${date}</div>
    </div>
  </div>
  <div class="header-line"></div>


  <div class="parties">
    <div class="party">
      <div class="ttl">Clinique Émettrice</div>
      <div class="nm">${cName}</div>
      <div class="dt">${cAddress}</div>
    </div>
    <div class="party">
      <div class="ttl">Patient / Destinataire</div>
      <div class="nm">${patientInfo?.prenom || ''} ${patientInfo?.nom || ''}</div>
      <div class="dt">CIN: ${patientInfo?.cinNumero || facture.patientCin || '—'}<br/>Tél: ${patientInfo?.telephonePrincipal || '—'}</div>
    </div>
  </div>

  <table>
    <thead><tr><th>Désignation</th><th style="text-align:center">Qté</th><th>P.U</th><th>Total</th></tr></thead>
    <tbody>${lignesHtml}</tbody>
  </table>

  <div class="totals-container">
    <div class="totals-box">
      <div class="row"><span>Total Brut</span><span>${Number(facture.montantBrut || facture.sousTotal).toFixed(2)} MAD</span></div>
      <div class="row ins"><span>Part Assurance (${Number(facture.assuranceTaux || 0).toFixed(0)}%)</span><span>- ${Number(facture.montantAssurance || facture.assuranceMontant || 0).toFixed(2)} MAD</span></div>
      <div class="row total-ttc"><span>Net à Payer</span><span>${Number(facture.montantPatient || facture.resteACharge || facture.total).toFixed(2)} MAD</span></div>
    </div>
  </div>

  <div class="payment-footer">
    <div class="pm-item"><div class="pm-lbl">Mode de paiement</div><div class="pm-val">${modeLabel[facture.modePaiement] || facture.modePaiement || '—'}</div></div>
    <div class="statut-pill">${facture.statut === 'payee' ? 'Règlement Effectué' : 'En Attente'}</div>
  </div>

  <div class="legal-footer" style="border-top:1px solid #f1f5f9; padding-top:20px; margin-top:40px;">
    <div style="font-weight:900; color:#0f172a; font-size:13px; margin-bottom:4px;">${cRaisonSociale}</div>
    ${lignesLegales.map(l => `<div style="color:#64748b; font-size:11px; margin-bottom:4px;">${l}</div>`).join('')}
    ${ligneRIB ? `<div style="color:#004AAD; font-weight:800; font-size:12px; margin-bottom:12px;">${ligneRIB}</div>` : ''}

    <div style="color:#0ea5e9; font-weight:600; display:flex; align-items:center; justify-content:center; gap:6px;">
      <span style="font-size:16px;">💙</span> Nous sommes ravis de vous accueillir!
    </div>
  </div>
</div></body></html>`;

    const win = window.open('', '_blank', 'width=900,height=800');
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 800);
}




/* ─────────────────────────────────────────────────────────────────────────────
   Utilitaires
───────────────────────────────────────────────────────────────────────────── */
const TVA_RATE = 0.07;

function calcTotals(lignes, assuranceTaux) {
    const sousTotal = lignes.reduce((s, l) => s + (Number(l.quantite) * Number(l.prixUnitaire)), 0);
    const tva = Math.round(sousTotal * TVA_RATE * 100) / 100;
    const total = sousTotal + tva;
    const assuranceMontant = Math.round(total * (assuranceTaux / 100) * 100) / 100;
    const resteACharge = Math.round((total - assuranceMontant) * 100) / 100;
    return { sousTotal, tva, total, assuranceMontant, resteACharge };
}

const SOURCE_CONFIG = {
    consultation: { label: 'Consultation', color: 'bg-blue-50 text-blue-700 border-blue-200', icon: Stethoscope, iconColor: 'text-blue-500' },
    medicament:   { label: 'Pharmacie',    color: 'bg-green-50 text-green-700 border-green-200', icon: Pill,        iconColor: 'text-green-500' },
    examen:       { label: 'Labo / Radio', color: 'bg-purple-50 text-purple-700 border-purple-200', icon: Microscope, iconColor: 'text-purple-500' },
    chambre:      { label: 'Hospitalisation', color: 'bg-amber-50 text-amber-700 border-amber-200', icon: BedDouble, iconColor: 'text-amber-500' },
    manuel:       { label: 'Manuel',       color: 'bg-gray-50 text-gray-700 border-gray-200', icon: FileText,    iconColor: 'text-gray-500' },
};

/* ─────────────────────────────────────────────────────────────────────────────
   Composant principal
───────────────────────────────────────────────────────────────────────────── */
export default function BillingPage() {
    const [tab, setTab] = useState('nouvelle');
    const [factures, setFactures] = useState([]);
    const [loadingList, setLoadingList] = useState(false);

    // Étape: 'search' → 'form' → 'done'
    const [step, setStep] = useState('search');
    const [clinicInfo, setClinicInfo] = useState(null);

    useEffect(() => {
        api.get('/clinic').then(r => setClinicInfo(r.data)).catch(() => {});
    }, []);


    const [patientCin, setPatientCin] = useState('');
    const [searching, setSearching] = useState(false);
    const [patientInfo, setPatientInfo] = useState(null);
    const [lignes, setLignes] = useState([]);
    const [assuranceTaux, setAssuranceTaux] = useState(0);
    const [modePaiement, setModePaiement] = useState('especes');
    const [submitting, setSubmitting] = useState(false);
    const [paying, setPaying] = useState(false);
    const [factureCreee, setFactureCreee] = useState(null);

    useEffect(() => {
        if (tab === 'liste') {
            setLoadingList(true);
            api.get('/billing').then(r => setFactures(r.data || [])).catch(() => {}).finally(() => setLoadingList(false));
        }
    }, [tab]);

    /* ── Recherche patient + chargement auto des charges ── */
    const handleSearch = async () => {
        if (!patientCin.trim()) return;
        setSearching(true);
        setPatientInfo(null);
        setLignes([]);
        try {
            // 1. Vérifier existence du patient
            const { data: cinData } = await api.get(`/patients/check-cin/${patientCin.toUpperCase()}`);
            if (!cinData.exists) {
                toast.error('Patient non trouvé dans la base de données');
                setSearching(false);
                return;
            }
            setPatientInfo(cinData.patient);

            // 2. Récupérer automatiquement toutes les charges en attente
            try {
                const { data: pendingData } = await api.get(`/billing/pending/${patientCin.toUpperCase()}`);
                const pendingLignes = (pendingData.lignes || []).map(l => ({ ...l, _auto: true }));
                if (pendingLignes.length > 0) {
                    setLignes(pendingLignes);
                    const consult = pendingLignes.filter(l => l.sourceType === 'consultation').length;
                    const medic   = pendingLignes.filter(l => l.sourceType === 'medicament').length;
                    const exam    = pendingLignes.filter(l => l.sourceType === 'examen').length;
                    const chambre = pendingLignes.filter(l => l.sourceType === 'chambre').length;
                    toast.success(`✅ ${pendingLignes.length} charge(s) récupérée(s) automatiquement${consult ? ` — ${consult} consult.` : ''}${medic ? ` — ${medic} médic.` : ''}${exam ? ` — ${exam} examens` : ''}${chambre ? ` — ${chambre} hospit.` : ''}`);
                } else {
                    toast('Aucune charge en attente détectée. Facture manuelle possible.', { icon: 'ℹ️' });
                    setLignes([]);
                }
            } catch {
                toast.error('Erreur lors de la récupération des charges');
                setLignes([]);
            }

            setStep('form');
        } catch {
            toast.error('Erreur de connexion');
        } finally {
            setSearching(false);
        }
    };

    /* ── Gestion des lignes ── */
    const addLigneManuelle = () => setLignes(prev => [...prev, {
        sourceType: 'manuel', designation: '', quantite: 1, prixUnitaire: 0, _auto: false
    }]);
    const removeLigne = i => setLignes(prev => prev.filter((_, idx) => idx !== i));
    const updateLigne = (i, field, val) => setLignes(prev =>
        prev.map((l, idx) => idx === i ? { ...l, [field]: val } : l)
    );

    const { sousTotal, tva, total, assuranceMontant, resteACharge } = calcTotals(lignes, assuranceTaux);

    /* ── Créer la facture ── */
    const handleCreate = async () => {
        if (!patientInfo) return;
        if (lignes.length === 0) return toast.error('Ajoutez au moins une ligne');
        if (lignes.some(l => !l.designation)) return toast.error('Complétez toutes les désignations');
        setSubmitting(true);
        try {
            const { data } = await api.post('/billing', {
                patientCin: patientCin.toUpperCase(),
                lignes: lignes.map(l => ({
                    sourceType: l.sourceType || 'manuel',
                    sourceId: l.sourceId || null,
                    designation: l.designation,
                    quantite: Number(l.quantite),
                    prixUnitaire: Number(l.prixUnitaire),
                })),
                assuranceTaux,
            });
            setFactureCreee(data.facture);
            setStep('done');
            toast.success(`Facture ${data.facture.numero} créée !`);
        } catch (err) {
            toast.error(err.response?.data?.error || 'Erreur lors de la création');
        } finally {
            setSubmitting(false);
        }
    };

    /* ── Encaisser ── */
    const handlePay = async () => {
        if (!factureCreee) return;
        setPaying(true);
        try {
            await api.patch(`/billing/${factureCreee.id}/pay`, { modePaiement });
            setFactureCreee(prev => ({ ...prev, statut: 'payee', modePaiement }));
            toast.success('✅ Paiement enregistré !');
        } catch {
            toast.error('Erreur lors de l\'encaissement');
        } finally {
            setPaying(false);
        }
    };

    /* ── Reset ── */
    const handleReset = () => {
        setStep('search');
        setPatientCin('');
        setPatientInfo(null);
        setLignes([]);
        setAssuranceTaux(0);
        setModePaiement('especes');
        setFactureCreee(null);
    };

    /* ───────────────────────────── RENDER ───────────────────────────────── */
    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="page-title">Facturation</h1>
                    <p className="text-sm text-muted mt-0.5">Calcul automatique des charges médecin + pharmacie + labo</p>
                </div>
                <div className="flex gap-2">
                    {['nouvelle', 'liste'].map(t => (
                        <button key={t} onClick={() => { setTab(t); if (t === 'nouvelle') handleReset(); }}
                            className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${tab === t ? 'bg-primary text-white shadow-md' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                            {t === 'nouvelle' ? '+ Nouvelle facture' : '📋 Historique'}
                        </button>
                    ))}
                </div>
            </div>

            {/* ── ONGLET NOUVELLE FACTURE ── */}
            {tab === 'nouvelle' && (
                <>
                    {/* Barre de progression */}
                    <div className="flex items-center gap-0 bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
                        {[
                            { key: 'search', label: 'Recherche patient', icon: Search },
                            { key: 'form',   label: 'Récap. des charges', icon: FileText },
                            { key: 'done',   label: 'Encaissement', icon: CheckCircle },
                        ].map((s, i, arr) => {
                            const stepOrder = { search: 0, form: 1, done: 2 };
                            const active = stepOrder[step] >= stepOrder[s.key];
                            const current = step === s.key;
                            const Icon = s.icon;
                            return (
                                <React.Fragment key={s.key}>
                                    <div className={`flex items-center gap-2 px-4 py-2 rounded-xl transition ${current ? 'bg-primary/10 text-primary' : active ? 'text-primary' : 'text-gray-400'}`}>
                                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${current ? 'bg-primary text-white' : active ? 'bg-primary/20 text-primary' : 'bg-gray-100 text-gray-400'}`}>
                                            {active && !current ? '✓' : i + 1}
                                        </div>
                                        <span className="text-sm font-semibold">{s.label}</span>
                                    </div>
                                    {i < arr.length - 1 && <ChevronRight size={16} className="text-gray-300 mx-1" />}
                                </React.Fragment>
                            );
                        })}
                    </div>

                    {/* ── ÉTAPE 1 : RECHERCHE ── */}
                    {step === 'search' && (
                        <div className="max-w-xl mx-auto">
                            <div className="bg-white rounded-2xl border border-gray-100 p-8 shadow-sm text-center space-y-5">
                                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
                                    <User size={28} className="text-primary" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-gray-900">Rechercher le patient</h2>
                                    <p className="text-sm text-muted mt-1">Entrez le CIN pour charger automatiquement toutes ses charges en attente (médecin, pharmacien, labo)</p>
                                </div>
                                <div className="flex gap-2">
                                    <input
                                        value={patientCin}
                                        onChange={e => setPatientCin(e.target.value.toUpperCase())}
                                        onKeyDown={e => e.key === 'Enter' && handleSearch()}
                                        placeholder="CIN du patient (ex: BK123456)"
                                        className="flex-1 px-4 py-3 border border-gray-200 rounded-xl text-sm font-mono uppercase text-center tracking-wider"
                                    />
                                    <button onClick={handleSearch} disabled={searching}
                                        className="px-5 py-3 bg-primary hover:bg-primary-hover text-white rounded-xl font-semibold text-sm transition disabled:opacity-50 flex items-center gap-2">
                                        {searching ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Search size={16} />}
                                        {searching ? 'Recherche...' : 'Chercher'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── ÉTAPE 2 : FORMULAIRE FACTURE ── */}
                    {step === 'form' && patientInfo && (
                        <div className="grid grid-cols-3 gap-5">
                            <div className="col-span-2 space-y-4">

                                {/* Info patient */}
                                <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                                        <User size={22} className="text-primary" />
                                    </div>
                                    <div className="flex-1">
                                        <div className="font-bold text-gray-900 text-base">{patientInfo.prenom} {patientInfo.nom}</div>
                                        <div className="text-xs text-muted mt-0.5">CIN : <span className="font-mono font-semibold">{patientCin}</span> · Assurance : {patientInfo.insurance || 'Aucune'}</div>
                                    </div>
                                    <button onClick={handleReset} className="text-xs text-muted hover:text-gray-700 underline">Changer</button>
                                </div>

                                {/* Résumé par source */}
                                {['consultation', 'medicament', 'examen', 'chambre'].map(type => {
                                    const groupe = lignes.filter(l => l.sourceType === type);
                                    if (groupe.length === 0) return null;
                                    const cfg = SOURCE_CONFIG[type];
                                    const Icon = cfg.icon;
                                    const subtotal = groupe.reduce((s, l) => s + Number(l.quantite) * Number(l.prixUnitaire), 0);
                                    return (
                                        <div key={type} className={`bg-white rounded-2xl border p-4 shadow-sm ${cfg.color.split(' ')[0]} border-${cfg.color.split('border-')[1]}`}>
                                            <div className="flex items-center justify-between mb-3">
                                                <div className="flex items-center gap-2">
                                                    <Icon size={16} className={cfg.iconColor} />
                                                    <span className="font-semibold text-sm text-gray-900">{cfg.label}</span>
                                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${cfg.color}`}>{groupe.length} ligne(s) auto</span>
                                                </div>
                                                <span className="font-bold text-sm">{subtotal.toFixed(2)} MAD</span>
                                            </div>
                                            <div className="space-y-1.5">
                                                {groupe.map((l, idx) => {
                                                    const globalIdx = lignes.indexOf(l);
                                                    return (
                                                        <div key={idx} className="flex items-center gap-2 bg-white/70 rounded-xl px-3 py-2">
                                                            <div className="flex-1 text-sm text-gray-700">{l.designation}</div>
                                                            <div className="flex items-center gap-1">
                                                                <span className="text-xs text-muted">Qté :</span>
                                                                <input type="number" min="1" value={l.quantite}
                                                                    onChange={e => updateLigne(globalIdx, 'quantite', e.target.value)}
                                                                    className="w-14 px-2 py-1 border border-gray-200 rounded-lg text-sm text-center" />
                                                            </div>
                                                            <div className="flex items-center gap-1">
                                                                <input type="number" min="0" value={l.prixUnitaire}
                                                                    onChange={e => updateLigne(globalIdx, 'prixUnitaire', e.target.value)}
                                                                    className="w-20 px-2 py-1 border border-gray-200 rounded-lg text-sm text-right" />
                                                                <span className="text-xs text-muted">MAD</span>
                                                            </div>
                                                            <div className="w-20 text-right text-sm font-semibold text-gray-800">
                                                                {(Number(l.quantite) * Number(l.prixUnitaire)).toFixed(2)}
                                                            </div>
                                                            <button onClick={() => removeLigne(globalIdx)} className="text-red-400 hover:text-red-600 p-1">
                                                                <Trash2 size={14} />
                                                            </button>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })}

                                {/* Lignes manuelles */}
                                {lignes.filter(l => l.sourceType === 'manuel').map((l, idx) => {
                                    const globalIdx = lignes.indexOf(l);
                                    return (
                                        <div key={idx} className="flex gap-2 items-center bg-white rounded-xl border border-gray-200 px-3 py-2">
                                            <input value={l.designation} onChange={e => updateLigne(globalIdx, 'designation', e.target.value)}
                                                placeholder="Désignation" className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm" />
                                            <input type="number" min="1" value={l.quantite} onChange={e => updateLigne(globalIdx, 'quantite', e.target.value)}
                                                className="w-16 px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-center" />
                                            <input type="number" min="0" value={l.prixUnitaire} onChange={e => updateLigne(globalIdx, 'prixUnitaire', e.target.value)}
                                                className="w-24 px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-right" />
                                            <span className="text-xs text-muted w-6">MAD</span>
                                            <button onClick={() => removeLigne(globalIdx)} className="text-red-400 hover:text-red-600">
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    );
                                })}

                                {/* Bouton ajouter ligne manuelle */}
                                <button onClick={addLigneManuelle}
                                    className="flex items-center gap-2 text-sm text-primary font-semibold hover:underline">
                                    <Plus size={14} /> Ajouter une ligne manuelle
                                </button>

                                {/* Assurance & mode paiement */}
                                <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                                    <h3 className="font-semibold text-gray-900 mb-4 text-sm">💳 Assurance & Mode de paiement</h3>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-xs font-semibold text-muted block mb-1.5">Taux assurance remboursée</label>
                                            <div className="flex gap-1.5 flex-wrap">
                                                {[0, 50, 70, 80, 90, 100].map(t => (
                                                    <button key={t} onClick={() => setAssuranceTaux(t)}
                                                        className={`px-3 py-1 rounded-lg text-xs font-bold border transition ${assuranceTaux === t ? 'bg-primary text-white border-primary' : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'}`}>
                                                        {t}%
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <div>
                                            <label className="text-xs font-semibold text-muted block mb-1.5">Mode de paiement</label>
                                            <div className="flex gap-1.5 flex-wrap">
                                                {[
                                                    { val: 'especes', label: 'Espèces' },
                                                    { val: 'carte', label: 'Carte' },
                                                    { val: 'virement', label: 'Virement' },
                                                    { val: 'cheque', label: 'Chèque' },
                                                    { val: 'tiers_payant', label: 'Tiers payant' },
                                                ].map(m => (
                                                    <button key={m.val} onClick={() => setModePaiement(m.val)}
                                                        className={`px-3 py-1 rounded-lg text-xs font-bold border transition ${modePaiement === m.val ? 'bg-secondary text-white border-secondary' : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'}`}>
                                                        {m.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Panel récapitulatif sticky */}
                            <div className="space-y-3">
                                <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm sticky top-20 space-y-4">
                                    <h3 className="font-bold text-gray-900 text-sm">📊 Récapitulatif</h3>

                                    {/* Breakdown par type */}
                                    <div className="space-y-2">
                                        {Object.entries(SOURCE_CONFIG).map(([type, cfg]) => {
                                            const groupe = lignes.filter(l => l.sourceType === type);
                                            if (groupe.length === 0) return null;
                                            const subtotal = groupe.reduce((s, l) => s + Number(l.quantite) * Number(l.prixUnitaire), 0);
                                            const Icon = cfg.icon;
                                            return (
                                                <div key={type} className="flex items-center justify-between text-xs">
                                                    <div className="flex items-center gap-1.5">
                                                        <Icon size={12} className={cfg.iconColor} />
                                                        <span className="text-muted">{cfg.label}</span>
                                                    </div>
                                                    <span className="font-semibold">{subtotal.toFixed(2)} MAD</span>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    <div className="border-t border-gray-100 pt-3 space-y-2 text-sm">
                                        <div className="flex justify-between text-muted">
                                            <span>Sous-total HT</span>
                                            <span>{sousTotal.toFixed(2)} MAD</span>
                                        </div>
                                        <div className="flex justify-between text-muted">
                                            <span>TVA (7%)</span>
                                            <span>{tva.toFixed(2)} MAD</span>
                                        </div>
                                        <div className="flex justify-between font-semibold border-t pt-2">
                                            <span>Total TTC</span>
                                            <span>{total.toFixed(2)} MAD</span>
                                        </div>
                                        {assuranceTaux > 0 && <>
                                            <div className="flex justify-between text-green-600 text-xs">
                                                <span>Assurance ({assuranceTaux}%)</span>
                                                <span>− {assuranceMontant.toFixed(2)} MAD</span>
                                            </div>
                                            <div className="flex justify-between font-bold text-primary text-lg border-t pt-2">
                                                <span>À payer</span>
                                                <span>{resteACharge.toFixed(2)} MAD</span>
                                            </div>
                                        </>}
                                    </div>

                                    <button onClick={handleCreate} disabled={submitting || lignes.length === 0}
                                        className="w-full py-3 bg-primary hover:bg-primary-hover text-white rounded-xl font-bold text-sm transition disabled:opacity-40 flex items-center justify-center gap-2">
                                        {submitting
                                            ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Création...</>
                                            : <><FileText size={16} /> Créer la facture</>
                                        }
                                    </button>
                                    <div className="text-xs text-muted text-center">
                                        {lignes.length} ligne(s) · {lignes.filter(l => l._auto).length} automatique(s)
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── ÉTAPE 3 : ENCAISSEMENT ── */}
                    {step === 'done' && factureCreee && (
                        <div className="max-w-2xl mx-auto space-y-4">
                            {/* En-tête succès */}
                            <div className="bg-green-50 border border-green-200 rounded-2xl p-5 flex items-center gap-3">
                                <CheckCircle size={24} className="text-green-600" />
                                <div>
                                    <div className="font-bold text-green-800">Facture créée avec succès</div>
                                    <div className="text-sm text-green-700">N° <span className="font-mono font-bold">{factureCreee.numero}</span> · Patient : {patientInfo?.prenom} {patientInfo?.nom}</div>
                                </div>
                            </div>

                            {/* Détail des lignes */}
                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                                <div className="px-5 py-3 border-b border-gray-100 text-sm font-semibold text-gray-900">Détail des charges facturées</div>
                                <div className="divide-y divide-gray-50">
                                    {(Array.isArray(factureCreee.lignes) ? factureCreee.lignes : JSON.parse(factureCreee.lignes || '[]')).map((l, i) => {
                                        const cfg = SOURCE_CONFIG[l.sourceType] || SOURCE_CONFIG.manuel;
                                        const Icon = cfg.icon;
                                        return (
                                            <div key={i} className="flex items-center gap-3 px-5 py-3">
                                                <Icon size={14} className={cfg.iconColor} />
                                                <div className="flex-1 text-sm text-gray-700">{l.designation}</div>
                                                <div className="text-xs text-muted">×{l.quantite}</div>
                                                <div className="text-sm font-semibold w-24 text-right">{(Number(l.quantite) * Number(l.prixUnitaire)).toFixed(2)} MAD</div>
                                            </div>
                                        );
                                    })}
                                </div>
                                <div className="px-5 py-4 bg-gray-50 space-y-1">
                                    <div className="flex justify-between text-sm text-muted">
                                        <span>Sous-total HT</span><span>{Number(factureCreee.sousTotal).toFixed(2)} MAD</span>
                                    </div>
                                    <div className="flex justify-between text-sm text-muted">
                                        <span>TVA (7%)</span><span>{Number(factureCreee.tva).toFixed(2)} MAD</span>
                                    </div>
                                    <div className="flex justify-between font-semibold border-t pt-2">
                                        <span>Total TTC</span><span>{Number(factureCreee.total).toFixed(2)} MAD</span>
                                    </div>
                                    {Number(factureCreee.assuranceTaux) > 0 && <>
                                        <div className="flex justify-between text-green-600 text-sm">
                                            <span>Assurance ({factureCreee.assuranceTaux}%)</span>
                                            <span>− {Number(factureCreee.assuranceMontant).toFixed(2)} MAD</span>
                                        </div>
                                        <div className="flex justify-between font-bold text-primary text-xl border-t pt-2">
                                            <span>Reste à régler</span>
                                            <span>{Number(factureCreee.resteACharge).toFixed(2)} MAD</span>
                                        </div>
                                    </>}
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="grid grid-cols-2 gap-3">
                                <button onClick={() => printFacture({ facture: factureCreee, patientInfo, clinic: clinicInfo })}
                                    className="flex items-center justify-center gap-2 py-3 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-xl font-semibold text-sm transition">
                                    <Printer size={16} /> Imprimer / PDF
                                </button>
                                {factureCreee.statut !== 'payee' ? (
                                    <button onClick={handlePay} disabled={paying}
                                        className="flex items-center justify-center gap-2 py-3 bg-secondary hover:bg-secondary-hover text-white rounded-xl font-bold text-sm transition disabled:opacity-50">
                                        {paying
                                            ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Encaissement...</>
                                            : <><CreditCard size={16} /> Encaisser {Number(factureCreee.resteACharge || factureCreee.total).toFixed(2)} MAD</>
                                        }
                                    </button>
                                ) : (
                                    <div className="flex items-center justify-center gap-2 py-3 bg-green-50 border border-green-200 text-green-700 rounded-xl font-bold text-sm">
                                        <CheckCircle size={16} /> Payée ✅
                                    </div>
                                )}
                            </div>
                            <button onClick={handleReset} className="w-full text-sm text-muted hover:text-gray-700 transition py-2">
                                + Créer une nouvelle facture
                            </button>
                        </div>
                    )}
                </>
            )}

            {/* ── ONGLET HISTORIQUE ── */}
            {tab === 'liste' && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                        <span className="font-semibold text-sm text-gray-900">Historique des factures ({factures.length})</span>
                        <div className="flex gap-2">
                            {['en_attente', 'payee'].map(s => (
                                <button key={s} onClick={() => {
                                    setLoadingList(true);
                                    api.get(`/billing?statut=${s}`).then(r => setFactures(r.data || [])).finally(() => setLoadingList(false));
                                }} className="text-xs px-3 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 font-medium">
                                    {s === 'payee' ? '✅ Payées' : '⏳ En attente'}
                                </button>
                            ))}
                            <button onClick={() => { setLoadingList(true); api.get('/billing').then(r => setFactures(r.data || [])).finally(() => setLoadingList(false)); }}
                                className="text-xs px-3 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 font-medium">Tout</button>
                        </div>
                    </div>
                    {loadingList ? (
                        <div className="p-8 text-center text-muted text-sm">Chargement...</div>
                    ) : factures.length === 0 ? (
                        <div className="p-12 text-center text-muted text-sm">Aucune facture trouvée.</div>
                    ) : (
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 text-xs text-muted border-b border-gray-100">
                                <tr>
                                    {['Numéro', 'Patient', 'Détail charges', 'Total TTC', 'Reste', 'Mode', 'Statut', 'Date', ''].map(h => (
                                        <th key={h} className="px-4 py-3 text-left font-semibold">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {factures.map(f => {
                                    const lignesF = Array.isArray(f.lignes) ? f.lignes : JSON.parse(f.lignes || '[]');
                                    const counts = {
                                        consultation: lignesF.filter(l => l.sourceType === 'consultation').length,
                                        medicament: lignesF.filter(l => l.sourceType === 'medicament').length,
                                        examen: lignesF.filter(l => l.sourceType === 'examen').length,
                                        chambre: lignesF.filter(l => l.sourceType === 'chambre').length,
                                    };
                                    return (
                                        <tr key={f.id} className="hover:bg-gray-50 transition">
                                            <td className="px-4 py-3 font-mono font-bold text-primary text-xs">{f.numero}</td>
                                            <td className="px-4 py-3 font-mono text-xs">{f.patientCin}</td>
                                            <td className="px-4 py-3">
                                                <div className="flex gap-1">
                                                    {counts.consultation > 0 && <span className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700"><Stethoscope size={10} />{counts.consultation}</span>}
                                                    {counts.medicament > 0 && <span className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-green-50 text-green-700"><Pill size={10} />{counts.medicament}</span>}
                                                    {counts.examen > 0 && <span className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-700"><Microscope size={10} />{counts.examen}</span>}
                                                    {counts.chambre > 0 && <span className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700"><BedDouble size={10} />{counts.chambre}</span>}
                                                    {lignesF.length === 0 && <span className="text-[10px] text-muted">—</span>}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 font-semibold">{Number(f.total).toFixed(2)} MAD</td>
                                            <td className="px-4 py-3 font-bold text-primary">{Number(f.resteACharge).toFixed(2)} MAD</td>
                                            <td className="px-4 py-3 text-xs capitalize text-muted">{f.modePaiement || '—'}</td>
                                            <td className="px-4 py-3">
                                                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold ${f.statut === 'payee' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                                                    {f.statut === 'payee' ? '✅ Payée' : '⏳ Attente'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-xs text-muted">{new Date(f.createdAt).toLocaleDateString('fr-FR')}</td>
                                            <td className="px-4 py-3">
                                                <button onClick={() => printFacture({ facture: f, patientInfo: null, clinic: clinicInfo })}
                                                    className="text-muted hover:text-primary transition p-1"><Printer size={14} /></button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            )}
        </div>
    );
}
