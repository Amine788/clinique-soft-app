import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import sequelize from './config/database.js';
import { Clinic, User, Patient, DossierMedical, Medecin, Chambre, ProduitPharmacie, RendezVous, ExamenCatalog } from './models/index.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// ✅ Chemin corrigé : .env est dans le dossier server/, pas dans le parent
dotenv.config({ path: path.resolve(__dirname, '.env') });





// ============================================================
// NOM DE LA CLINIQUE DE DÉMO (constante — ne jamais changer)
// ============================================================
const DEMO_CLINIC_NAME = 'Clinique El Shifa';
const DEMO_CLINIC_EMAIL = 'contact@elshifa.test';

async function seed() {
    const t = await sequelize.transaction();
    try {
        await sequelize.authenticate();
        console.log('✅ Connexion MySQL OK\n');

        // ── S'assurer que les tables existent (sans jamais les vider)
        await sequelize.sync({ force: false, alter: false });
        console.log('✅ Tables vérifiées / créées si absentes\n');

        // ============================================================
        // ÉTAPE 1 — Supprimer UNIQUEMENT les données de la clinique démo
        //           → les autres cliniques ne sont PAS touchées
        // ============================================================
        console.log(`🔍 Recherche de la clinique de démo "${DEMO_CLINIC_NAME}"...`);
        const existingClinic = await Clinic.findOne({
            where: { name: DEMO_CLINIC_NAME, email: DEMO_CLINIC_EMAIL },
            transaction: t
        });

        if (existingClinic) {
            const clinicId = existingClinic.id;
            console.log(`🗑️  Nettoyage des données de la clinique démo (id=${clinicId})...`);

            // Désactiver les clés étrangères le temps du nettoyage ciblé
            await sequelize.query('SET FOREIGN_KEY_CHECKS = 0', { transaction: t });

            // Supprimer dans l'ordre inverse des dépendances
            await RendezVous.destroy({ where: { clinic_id: clinicId }, transaction: t });
            await ProduitPharmacie.destroy({ where: { clinic_id: clinicId }, transaction: t });
            await Chambre.destroy({ where: { clinic_id: clinicId }, transaction: t });

            // Récupérer les IDs des patients de cette clinique pour supprimer leurs dossiers
            const patientIds = (await Patient.findAll({
                where: { clinic_id: clinicId },
                attributes: ['id'],
                transaction: t
            })).map(p => p.id);

            if (patientIds.length > 0) {
                await DossierMedical.destroy({ where: { patientId: patientIds }, transaction: t });
            }

            await Patient.destroy({ where: { clinic_id: clinicId }, transaction: t });
            await Medecin.destroy({ where: { clinic_id: clinicId }, transaction: t });
            await User.destroy({ where: { clinic_id: clinicId }, transaction: t });
            await existingClinic.destroy({ transaction: t });

            await sequelize.query('SET FOREIGN_KEY_CHECKS = 1', { transaction: t });
            console.log('✅ Données de la clinique démo supprimées (autres cliniques intactes)\n');
        } else {
            console.log('ℹ️  Aucune clinique démo existante — création depuis zéro\n');
        }

        // ============================================================
        // ÉTAPE 2 — CRÉER LA CLINIQUE DE DÉMO
        // ============================================================
        const clinic = await Clinic.create({
            name: DEMO_CLINIC_NAME,
            type: 'Pro',
            email: DEMO_CLINIC_EMAIL,
            phone: '0522000000',
            address: 'Casablanca, Maroc',
            subscriptionStatus: 'active',
            activeModules: ['patients', 'appointments', 'pharmacy', 'billing', 'laboratory', 'nurse']
        }, { transaction: t });
        console.log(`✅ Clinique démo créée (id=${clinic.id})`);

        // ============================================================
        // ÉTAPE 3 — UTILISATEURS (liés à la clinique démo uniquement)
        // ============================================================
        const [, drBenali, drBerrada, , secAmrani] = await User.bulkCreate([
            { matricule: 'ADMIN001', nom: 'Admin', prenom: 'System', email: 'admin@clinic.test',          passwordHash: await bcrypt.hash('admin123',  10), role: 'admin',         clinic_id: clinic.id },
            { matricule: 'MED0042',  nom: 'Benali',  prenom: 'Ahmed',  email: 'dr.benali@clinic.test',     passwordHash: await bcrypt.hash('doctor123', 10), role: 'doctor',        telephone: '0661000001', clinic_id: clinic.id },
            { matricule: 'MED0043',  nom: 'Berrada', prenom: 'Nadia',  email: 'n.berrada@clinicsoft.test', passwordHash: await bcrypt.hash('doctor123', 10), role: 'doctor',        telephone: '0661000002', clinic_id: clinic.id },
            { matricule: 'PHA001',   nom: 'Idrissi', prenom: 'Youssef',email: 'pharm.idrissi@clinic.test', passwordHash: await bcrypt.hash('pharma123', 10), role: 'pharmacist',    telephone: '0661000003', clinic_id: clinic.id },
            { matricule: 'SEC001',   nom: 'Amrani',  prenom: 'Fatima', email: 'sec.amrani@clinic.test',    passwordHash: await bcrypt.hash('secret123', 10), role: 'secretary',     telephone: '0661000004', clinic_id: clinic.id },
            { matricule: 'LAB001',   nom: 'Zidane',  prenom: 'Yassine',email: 'labo.zidane@clinic.test',   passwordHash: await bcrypt.hash('labo123',   10), role: 'lab_technician',telephone: '0661000005', clinic_id: clinic.id },
            { matricule: 'NUR001',   nom: 'Aaz',     prenom: 'Amina',  email: 'nurse@clinic.test',         passwordHash: await bcrypt.hash('nurse123',  10), role: 'nurse',         telephone: '0661000006', clinic_id: clinic.id },
        ], { transaction: t, returning: true });
        console.log('✅ 7 utilisateurs créés');

        // ============================================================
        // ÉTAPE 4 — MÉDECINS
        // ============================================================
        const [medBenali, medBerrada] = await Medecin.bulkCreate([
            { userId: drBenali.id,  matricule: 'MED0042', titre: 'Dr.', numeroOrdre: 'ORD-2015-4521', specialites: JSON.stringify(['Médecine Générale', 'Diabétologie']), dateDebut: '2015-09-01', salleConsultation: 'A-12', tarifStandardTtc: 350, tarifUrgenceTtc: 500, dureeRdvMinutes: 30, clinic_id: clinic.id },
            { userId: drBerrada.id, matricule: 'MED0043', titre: 'Dr.', numeroOrdre: 'ORD-2018-7832', specialites: JSON.stringify(['Cardiologie']),                       dateDebut: '2018-01-15', salleConsultation: 'B-05', tarifStandardTtc: 450, tarifUrgenceTtc: 650, dureeRdvMinutes: 45, clinic_id: clinic.id },
        ], { transaction: t });
        console.log('✅ 2 médecins créés');

        // ============================================================
        // ÉTAPE 5 — PATIENTS
        // ============================================================
        const patients = await Patient.bulkCreate([
            { cinNumero: 'BK456789', cinDateExpiration: '2029-08-20', cinEstVerifiee: true,  cinMethodeVerif: 'IA_OCR',      numeroDossier: 'PAT-2026-00001', nom: 'MARTIN',      prenom: 'Sophie',  dateNaissance: '1992-04-12', sexe: 'F', telephonePrincipal: '06 12 34 56 78', email: 's.martin@email.test',   adresseVille: 'Casablanca', assuranceOrganisme: 'CNOPS',           assuranceTaux: 80, creeParUserId: secAmrani.id, medecinTraitantId: drBenali.id,  clinic_id: clinic.id },
            { cinNumero: 'A123456',  cinDateExpiration: '2027-05-10', cinEstVerifiee: true,  cinMethodeVerif: 'Manuel',      numeroDossier: 'PAT-2026-00002', nom: 'BERNARD',     prenom: 'Thomas',  dateNaissance: '1974-06-18', sexe: 'M', telephonePrincipal: '07 98 76 54 32', email: 't.bernard@email.test',  adresseVille: 'Rabat',      assuranceOrganisme: 'CNSS',            assuranceTaux: 70, creeParUserId: secAmrani.id, medecinTraitantId: drBenali.id,  clinic_id: clinic.id },
            { cinNumero: 'CD789012', cinDateExpiration: '2023-12-31', cinEstVerifiee: false, cinMethodeVerif: 'Non_verifie', numeroDossier: 'PAT-2026-00003', nom: 'KADDOUR',     prenom: 'Leïla',   dateNaissance: '1998-09-03', sexe: 'F', telephonePrincipal: '06 55 44 33 22',                               adresseVille: 'Marrakech',  assuranceOrganisme: 'Saham Assurance', assuranceTaux: 100,creeParUserId: secAmrani.id, medecinTraitantId: drBerrada.id, clinic_id: clinic.id },
            { cinNumero: 'T456123',  cinDateExpiration: '2028-03-15', cinEstVerifiee: true,  cinMethodeVerif: 'IA_OCR',      numeroDossier: 'PAT-2026-00004', nom: 'TAHIRI',      prenom: 'Karim',   dateNaissance: '1981-03-15', sexe: 'M', telephonePrincipal: '06 77 88 99 00', email: 'k.tahiri@email.test',   adresseVille: 'Casablanca', assuranceOrganisme: 'CNOPS',           assuranceTaux: 80, creeParUserId: secAmrani.id, medecinTraitantId: drBenali.id,  clinic_id: clinic.id },
            { cinNumero: 'BE345678', cinDateExpiration: '2030-11-05', cinEstVerifiee: true,  cinMethodeVerif: 'Manuel',      numeroDossier: 'PAT-2026-00005', nom: 'ALAMI',       prenom: 'Mohamed', dateNaissance: '1980-05-12', sexe: 'M', telephonePrincipal: '06 11 22 33 44',                               adresseVille: 'Meknès',     assuranceOrganisme: 'Wafa Assurance',  assuranceTaux: 90, creeParUserId: secAmrani.id, medecinTraitantId: drBerrada.id, clinic_id: clinic.id },
            { cinNumero: 'GH234567', cinDateExpiration: '2027-09-22', cinEstVerifiee: true,  cinMethodeVerif: 'IA_OCR',      numeroDossier: 'PAT-2026-00006', nom: 'ALAMI',       prenom: 'Mohamed', dateNaissance: '1995-11-03', sexe: 'M', telephonePrincipal: '06 99 88 77 66',                               adresseVille: 'Tanger',     assuranceOrganisme: 'CNSS',            assuranceTaux: 70, creeParUserId: secAmrani.id, medecinTraitantId: drBenali.id,  clinic_id: clinic.id },
            { cinNumero: 'BK987654', cinDateExpiration: '2026-01-15', cinEstVerifiee: true,  cinMethodeVerif: 'Manuel',      numeroDossier: 'PAT-2026-00007', nom: 'EL MANSOURI', prenom: 'Youssef', dateNaissance: '1959-07-28', sexe: 'M', telephonePrincipal: '06 44 55 66 77',                               adresseVille: 'Fès',        assuranceOrganisme: 'CNOPS',           assuranceTaux: 80, creeParUserId: secAmrani.id, medecinTraitantId: drBerrada.id, clinic_id: clinic.id },
        ], { transaction: t });
        console.log(`✅ ${patients.length} patients créés`);

        // ============================================================
        // ÉTAPE 6 — DOSSIERS MÉDICAUX
        // ============================================================
        await DossierMedical.bulkCreate([
            { patientId: patients[0].id, groupeSanguin: 'A+',  allergies: JSON.stringify(['Pénicilline', 'Arachides']),       maladiesChroniques: JSON.stringify(['Asthme léger']),                          tailleCm: 168, poidsKg: 62 },
            { patientId: patients[1].id, groupeSanguin: 'O+',  allergies: JSON.stringify([]),                                 maladiesChroniques: JSON.stringify(['Hypertension', 'Diabète type 2']),        tailleCm: 175, poidsKg: 89 },
            { patientId: patients[2].id, groupeSanguin: 'B-',  allergies: JSON.stringify(['Aspirine']),                       maladiesChroniques: JSON.stringify([]),                                         tailleCm: 162, poidsKg: 55 },
            { patientId: patients[3].id, groupeSanguin: 'A-',  allergies: JSON.stringify(['Pénicilline']),                    maladiesChroniques: JSON.stringify(['Hypertension']),                           tailleCm: 180, poidsKg: 78 },
            { patientId: patients[4].id, groupeSanguin: 'O-',  allergies: JSON.stringify(['Latex']),                          maladiesChroniques: JSON.stringify([]),                                         tailleCm: 170, poidsKg: 75 },
            { patientId: patients[5].id, groupeSanguin: 'AB+', allergies: JSON.stringify(['Codéine']),                        maladiesChroniques: JSON.stringify(['Insuffisance cardiaque', 'Diabète type 2']),tailleCm: 172, poidsKg: 85 },
            { patientId: patients[6].id, groupeSanguin: 'B+',  allergies: JSON.stringify([]),                                 maladiesChroniques: JSON.stringify(['Insuffisance rénale']),                    tailleCm: 176, poidsKg: 80 },
        ], { transaction: t });
        console.log('✅ 7 dossiers médicaux créés');
        
        // ============================================================
        // ÉTAPE 7 — CHAMBRES
        // ============================================================
        await Chambre.bulkCreate([
            { numero: 'A1-01',  typeChambre: 'suite',    nbLits: 1, tarifTtc: 2500, statut: 'disponible', equipements: JSON.stringify(['TV', 'Wifi', 'Climatisation', 'Salle de bain privée']), clinic_id: clinic.id },
            { numero: 'A1-02',  typeChambre: 'privee',   nbLits: 1, tarifTtc: 1200, statut: 'occupee',    equipements: JSON.stringify(['TV', 'Wifi']),                                          clinic_id: clinic.id },
            { numero: 'B2-14',  typeChambre: 'double',   nbLits: 2, tarifTtc:  800, statut: 'occupee',    equipements: JSON.stringify(['TV']),                                                   clinic_id: clinic.id },
            { numero: 'B2-15',  typeChambre: 'double',   nbLits: 2, tarifTtc:  800, statut: 'disponible', equipements: JSON.stringify(['TV']),                                                   clinic_id: clinic.id },
            { numero: 'C3-01',  typeChambre: 'commune',  nbLits: 4, tarifTtc:  400, statut: 'disponible', equipements: JSON.stringify([]),                                                       clinic_id: clinic.id },
            { numero: 'URG-01', typeChambre: 'urgences', nbLits: 3, tarifTtc:  600, statut: 'disponible', equipements: JSON.stringify(['Moniteur cardiaque', 'Oxygène']),                        clinic_id: clinic.id },
            { numero: 'USI-01', typeChambre: 'usi',      nbLits: 1, tarifTtc: 3500, statut: 'occupee',    equipements: JSON.stringify(['Ventilateur', 'Moniteur', 'Pompe IV']),                  clinic_id: clinic.id },
        ], { transaction: t });
        console.log('✅ 7 chambres créées');

        // ============================================================
        // ÉTAPE 8 — PRODUITS PHARMACIE
        // ============================================================
        await ProduitPharmacie.bulkCreate([
            { codeProduit: 'MED001', dci: 'Paracétamol',    nomCommercial: 'Doliprane',   forme: 'comprime',   dosage: '1000mg',     categorie: 'medicament',   prixAchat: 15, prixVente: 25, stockMinimum: 50,  stockActuel: 245, clinic_id: clinic.id },
            { codeProduit: 'MED002', dci: 'Amoxicilline',   nomCommercial: 'Clamoxyl',    forme: 'comprime',   dosage: '500mg',      categorie: 'medicament',   prixAchat: 35, prixVente: 55, stockMinimum: 30,  stockActuel:   5, clinic_id: clinic.id },
            { codeProduit: 'MED003', dci: 'Oméprazole',     nomCommercial: 'Mopral',      forme: 'comprime',   dosage: '20mg',       categorie: 'medicament',   prixAchat: 25, prixVente: 42, stockMinimum: 20,  stockActuel: 180, clinic_id: clinic.id },
            { codeProduit: 'MED004', dci: 'Metformine',     nomCommercial: 'Glucophage',  forme: 'comprime',   dosage: '1000mg',     categorie: 'medicament',   prixAchat: 20, prixVente: 35, stockMinimum: 40,  stockActuel:   0, clinic_id: clinic.id },
            { codeProduit: 'MED005', dci: 'Amlodipine',     nomCommercial: 'Amlor',       forme: 'comprime',   dosage: '5mg',        categorie: 'medicament',   prixAchat: 30, prixVente: 48, stockMinimum: 25,  stockActuel:  92, clinic_id: clinic.id },
            { codeProduit: 'CON001', dci: 'Sérum physio.',  nomCommercial: 'NaCl 0.9%',   forme: 'injectable', dosage: '500ml',      categorie: 'consommable',  prixAchat:  8, prixVente: 15, stockMinimum: 100, stockActuel: 312, clinic_id: clinic.id },
            { codeProduit: 'CON002', dci: 'Gants latex',    nomCommercial: 'MedGloves',   forme: 'autre',      dosage: 'Boîte 100',  categorie: 'consommable',  prixAchat: 45, prixVente: 70, stockMinimum: 20,  stockActuel:   8, clinic_id: clinic.id },
        ], { transaction: t });
        console.log('✅ 7 produits pharmacie créés');

        // ============================================================
        // ÉTAPE 9 — CATALOGUE EXAMENS (global — non lié à une clinique)
        // On les insère uniquement s'ils n'existent pas encore
        // ============================================================
        const examensToCreate = [
            { code: 'LAB001', nom: 'NFS (Numération Formule Sanguine)', type: 'laboratoire', categorie: 'Hématologie',           prixStandard: 150  },
            { code: 'LAB002', nom: 'Glycémie à jeun',                   type: 'laboratoire', categorie: 'Biochimie',             prixStandard: 50   },
            { code: 'LAB003', nom: 'Bilan lipidique',                    type: 'laboratoire', categorie: 'Biochimie',             prixStandard: 200  },
            { code: 'RAD001', nom: 'Radio Thorax Face',                  type: 'radiologie',  categorie: 'Radiographie Standard', prixStandard: 300  },
            { code: 'RAD002', nom: 'Échographie Abdominale',             type: 'radiologie',  categorie: 'Échographie',           prixStandard: 400  },
            { code: 'RAD003', nom: 'IRM Cérébrale',                      type: 'radiologie',  categorie: 'IRM',                   prixStandard: 1500 },
        ];
        for (const examen of examensToCreate) {
            await ExamenCatalog.findOrCreate({ where: { code: examen.code }, defaults: examen, transaction: t });
        }
        console.log('✅ 6 examens du catalogue vérifiés / créés');

        // ============================================================
        // ÉTAPE 10 — RENDEZ-VOUS (date du jour)
        // ============================================================
        const today = new Date().toISOString().split('T')[0];
        await RendezVous.bulkCreate([
            { numeroRdv: 'RDV-2026-00001', patientId: patients[0].id, patientCin: 'BK456789', medecinId: medBenali.id,  dateRdv: today, heureDebut: '09:00', heureFin: '09:30', typeConsultation: 'suivi',    motif: 'Contrôle asthme',                      statut: 'confirme', salle: 'A-12', creePar: secAmrani.id, clinic_id: clinic.id },
            { numeroRdv: 'RDV-2026-00002', patientId: patients[1].id, patientCin: 'A123456',  medecinId: medBenali.id,  dateRdv: today, heureDebut: '09:30', heureFin: '10:00', typeConsultation: 'suivi',    motif: 'Contrôle tension + glycémie',          statut: 'confirme', salle: 'A-12', creePar: secAmrani.id, clinic_id: clinic.id },
            { numeroRdv: 'RDV-2026-00003', patientId: patients[3].id, patientCin: 'T456123',  medecinId: medBenali.id,  dateRdv: today, heureDebut: '10:00', heureFin: '10:30', typeConsultation: 'suivi',    motif: 'Suivi hypertension',                   statut: 'planifie', salle: 'A-12', creePar: secAmrani.id, clinic_id: clinic.id },
            { numeroRdv: 'RDV-2026-00004', patientId: patients[2].id, patientCin: 'CD789012', medecinId: medBerrada.id, dateRdv: today, heureDebut: '09:00', heureFin: '09:45', typeConsultation: 'urgente',  motif: 'Fièvre persistante',                   statut: 'confirme', salle: 'B-05', creePar: secAmrani.id, clinic_id: clinic.id },
            { numeroRdv: 'RDV-2026-00005', patientId: patients[5].id, patientCin: 'GH234567', medecinId: medBenali.id,  dateRdv: today, heureDebut: '10:30', heureFin: '11:00', typeConsultation: 'premiere', motif: 'Première consultation cardiologie',     statut: 'planifie', salle: 'A-12', creePar: secAmrani.id, clinic_id: clinic.id },
        ], { transaction: t });
        console.log(`✅ 5 rendez-vous créés (date: ${today})`);

        await t.commit();
        console.log('\n🎉 Base de données ClinicSoft peuplée avec succès !');
        console.log('ℹ️  Les autres cliniques existantes n\'ont pas été touchées.\n');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📋  Comptes de la clinique démo :');
        console.log('   👤 admin@clinic.test          / admin123');
        console.log('   🩺 dr.benali@clinic.test       / doctor123');
        console.log('   🩺 n.berrada@clinicsoft.test   / doctor123');
        console.log('   💊 pharm.idrissi@clinic.test   / pharma123');
        console.log('   📋 sec.amrani@clinic.test       / secret123');
        console.log('   🔬 labo.zidane@clinic.test      / labo123');
        console.log('   💉 nurse@clinic.test            / nurse123');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        process.exit(0);
    } catch (error) {
        if (t) await t.rollback();
        console.error('❌ Erreur seed :', error.message);
        if (error.original) console.error('   SQL :', error.original.message);
        process.exit(1);
    }
}

seed();
