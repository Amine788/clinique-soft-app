import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import logo from '../assets/logo-full.png';
import { mentions, urlPublique } from './helpers';

const chargerImage = src => new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous'; // logo servi par l'API (autre domaine en production)
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
});

// Logo de l'en-tête : celui de la clinique s'il existe, sinon celui de NextClinic
async function chargerLogo(clinic) {
    const logoClinique = urlPublique(clinic?.logoUrl);
    if (logoClinique) {
        try { return await chargerImage(logoClinique); } catch { /* repli sur le logo NextClinic */ }
    }
    return chargerImage(logo).catch(() => null);
}

export async function generatePrescriptionPDF(ordonnance, medecin, patient, clinic) {
    if (!ordonnance) return;
    const imageLogo = await chargerLogo(clinic);

    // Données de la clinique (fiche « Ma Clinique ») : un champ non renseigné n'est pas imprimé
    // Pied légal : raison sociale de la clinique, à défaut son nom
    const clinicName = clinic?.raisonSociale || clinic?.name || '';

    // Création du document A4, portrait
    const doc = new jsPDF();


    const marginX = 14;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();


    // ==========================================
    // EN-TÊTE : Logo et Badge Numéro
    // ==========================================
    
    // Logo (Gauche) : proportions conservées dans un cadre de 75 × 18 mm
    if (imageLogo) {
        try {
            const echelle = Math.min(75 / imageLogo.naturalWidth, 18 / imageLogo.naturalHeight);
            doc.addImage(imageLogo, 'PNG', marginX, 18, imageLogo.naturalWidth * echelle, imageLogo.naturalHeight * echelle);
        } catch (e) {
            console.error("Erreur logo PDF", e);
        }
    }

    // Badge Numéro (Droite) - Rectangle arrondi avec dégradé simulé (bleu teal)
    const badgeWidth = 70;
    const badgeHeight = 25;
    const badgeX = pageWidth - marginX - badgeWidth;
    const badgeY = 15;

    doc.setFillColor(98, 177, 194); // #62b1c2 (Teal)
    doc.roundedRect(badgeX, badgeY, badgeWidth, badgeHeight, 5, 5, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text("ORDONNANCE", badgeX + badgeWidth/2, badgeY + 10, { align: "center" });
    
    doc.setFontSize(14);
    doc.text(ordonnance.numero || "ORD-2026-XXX", badgeX + badgeWidth/2, badgeY + 20, { align: "center" });

    // Date en dessous du badge
    doc.setTextColor(100, 100, 100);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    const dateStr = `Date: ${new Date(ordonnance.createdAt || Date.now()).toLocaleDateString('fr-FR')}`;
    doc.text(dateStr, pageWidth - marginX, badgeY + badgeHeight + 8, { align: "right" });

    // Ligne de séparation épaisse (Teal)
    doc.setDrawColor(98, 177, 194);
    doc.setLineWidth(2);
    doc.line(marginX, badgeY + badgeHeight + 15, pageWidth - marginX, badgeY + badgeHeight + 15);

    let startY = badgeY + badgeHeight + 25;

    let currentY = startY;

    if (medecin) {
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(0, 0, 0);
        // Alignement à droite pour le médecin
        const medText = `${medecin.name || medecin.nom || 'Docteur'}`;
        const medWidth = doc.getTextWidth(medText);
        doc.text(medText, pageWidth - marginX - medWidth, currentY);

        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(80, 80, 80);
        const spec = medecin.speciality || medecin.specialite || 'Médecin Généraliste';
        doc.text(spec, pageWidth - marginX - doc.getTextWidth(spec), currentY + 7);
        currentY += 20;
    }

    // Ligne de séparation
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.5);
    doc.line(marginX, currentY, pageWidth - marginX, currentY);
    currentY += 15;





    // ==========================================
    // INFOS PATIENT & DATE
    // ==========================================
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(30, 41, 59);
    doc.text("PATIENT :", marginX, currentY);
    
    doc.setFont("helvetica", "normal");
    doc.setTextColor(0, 0, 0);
    doc.text(`${patient?.prenom || ''} ${patient?.nom || ''}`, marginX + 22, currentY);
    currentY += 15;

    const title = "ORDONNANCE MÉDICALE";
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(98, 177, 194); // Assorti au thème
    doc.text(title, (pageWidth - doc.getTextWidth(title)) / 2, currentY + 15);
    
    currentY += 25;
    const tableStartY = currentY;





    const medicaments = ordonnance.medicaments || [];
    if (medicaments.length > 0) {
        const tableBody = medicaments.map(m => [
            m.nom,
            m.posologie || '—',
            m.duree || '—'
        ]);

        autoTable(doc, {
            startY: tableStartY,
            head: [['Médicament', 'Posologie', 'Durée']],
            body: tableBody,
            theme: 'striped',
            headStyles: { fillColor: [98, 177, 194], textColor: 255, fontStyle: 'bold' },
            bodyStyles: { fontSize: 10, textColor: 50 },
            alternateRowStyles: { fillColor: [248, 250, 252] },
            margin: { left: marginX, right: marginX },
        });

        currentY = doc.lastAutoTable.finalY + 15;
    } else {
        doc.setFontSize(10);
        doc.setFont("helvetica", "italic");
        doc.setTextColor(100, 100, 100);
        doc.text("Aucun médicament prescrit.", marginX, tableStartY);
        currentY = tableStartY + 10;
    }

    // ==========================================
    // DIAGNOSTIC (Si disponible)
    // ==========================================
    if (ordonnance.diagnostique) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(0, 0, 0);
        doc.text("Diagnostic :", marginX, currentY);
        doc.setFont("helvetica", "normal");
        doc.text(ordonnance.diagnostique, marginX + 25, currentY);
        currentY += 12;
    }

    // ==========================================
    // NOTES POUR LE PHARMACIEN
    // ==========================================
    if (ordonnance.notes) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(234, 179, 8); // Jaune / Orange
        doc.text("Notes particulières :", marginX, currentY);
        doc.setFont("helvetica", "italic");
        doc.setTextColor(50, 50, 50);

        const splitNotes = doc.splitTextToSize(ordonnance.notes, pageWidth - (marginX * 2));
        doc.text(splitNotes, marginX, currentY + 6);

        currentY += (splitNotes.length * 5) + 10;
    }

    // ==========================================
    // SIGNATURE ET PIED DE PAGE
    // ==========================================
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    const sigLabel = "Signature & Cachet du médecin :";
    doc.text(sigLabel, pageWidth - marginX - doc.getTextWidth(sigLabel) - 10, currentY + 20);

    // Espace pour cachet
    doc.setDrawColor(200, 200, 200);
    doc.setLineDash([2, 2]);
    doc.rect(pageWidth - marginX - 60, currentY + 25, 50, 30);

    // Pied de page
    doc.setLineDash([]); // Reset dash
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(50, 50, 50);
    doc.text(clinicName, (pageWidth - doc.getTextWidth(clinicName)) / 2, pageHeight - 25);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    const line2 = mentions([['ICE', clinic?.ice], ['IF', clinic?.ifNum], ['RC', clinic?.rc], ['TP', clinic?.tp]]);
    if (line2) doc.text(line2, (pageWidth - doc.getTextWidth(line2)) / 2, pageHeight - 20);

    const contactLine = mentions([['Tél', clinic?.phone], ['Email', clinic?.email]]);
    if (contactLine) doc.text(contactLine, (pageWidth - doc.getTextWidth(contactLine)) / 2, pageHeight - 15);

    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 128); // Navy Blue
    const line3 = mentions([['RIB', clinic?.rib]]);
    if (line3) doc.text(line3, (pageWidth - doc.getTextWidth(line3)) / 2, pageHeight - 10);

    const fileName = `Ordonnance_${ordonnance.numero || 'Patient'}.pdf`;
    doc.save(fileName);
}

