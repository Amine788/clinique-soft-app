import logo from '../assets/logo-full.png';
import { mentions, urlPublique, libelleStatutFacture } from './helpers';

/* ─────────────────────────────────────────────────────────────────────────────
   Génération PDF (impression navigateur)
   ───────────────────────────────────────────────────────────────────────────── */
export function printFacture({ facture, patientInfo, clinic: clinicInfo }) {
    const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

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
                ${escapeHtml(l.designation)}
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
      <div class="row total-ttc"><span>Part patient</span><span>${Number(facture.montantPatient ?? facture.resteACharge ?? facture.total).toFixed(2)} MAD</span></div>
      <div class="row"><span>Encaissé enregistré</span><span>${facture.encaissementHistorique ? 'Non reconstitué' : Number(facture.montantEncaisse ?? 0).toFixed(2) + ' MAD'}</span></div>
      <div class="row"><span>Solde patient</span><span>${Number(facture.soldePatient ?? 0).toFixed(2)} MAD</span></div>
      <div class="row"><span>Solde assurance</span><span>${Number(facture.soldeAssurance ?? 0).toFixed(2)} MAD</span></div>
    </div>
  </div>

  <div class="payment-footer">
    <div class="pm-item"><div class="pm-lbl">Mode de paiement</div><div class="pm-val">${modeLabel[facture.modePaiement] || facture.modePaiement || '—'}</div></div>
    <div class="statut-pill">${facture.statut === 'payee' ? 'Règlement Effectué' : libelleStatutFacture(facture)}</div>
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
