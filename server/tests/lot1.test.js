import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resetDatabase, startServer, loadModels, seedClinic, createPatient, createHospitalisation, createRdv, client, tokenFor } from './helpers.js';

let server, m, A, B, stranger, ownStay, otherStay, catalog, exam, prescription, accessModels;
before(async () => {
    await resetDatabase(); server = await startServer(); m = await loadModels();
    accessModels = await import('../models/access.js');
    A = await seedClinic(m, 'LOT1A'); B = await seedClinic(m, 'LOT1B');
    stranger = await createPatient(m, A.clinic, A.users.secretary, 'ZZ654321');
    ownStay = await createHospitalisation(m, A);
    otherStay = await createHospitalisation(m, B);
    catalog = await m.ExamenCatalog.create({ code: 'LOT1', nom: 'Examen confidentiel', type: 'laboratoire', prixStandard: 80 });
    exam = await m.ExamenPatient.create({ clinic_id: B.clinic.id, patientId: B.patient.id, medecinId: B.medecin.id, examenId: catalog.id, resultats: 'SECRET-B' });
    prescription = await m.Prescription.create({ clinic_id: B.clinic.id, patientCin: B.patient.cinNumero, medecinId: B.medecin.id, numero: 'LOT1-B', medicaments: '[]', diagnostique: 'SECRET-B' });
});
after(async () => { await server?.stop(); await m?.sequelize.close(); });
const request = (user, method, path, body) => client(server.base, user)(method, path, body);

test('C1 chambres : liste, détail, modification, suppression et création restent dans la clinique', async () => {
    const sec = A.users.secretary;
    const list = await request(sec, 'GET', '/api/rooms');
    assert.equal(list.status, 200); assert.ok(list.body.some(r => r.id === ownStay.chambre.id));
    assert.ok(!list.body.some(r => r.id === otherStay.chambre.id));
    for (const [method, suffix, body] of [['GET', '', undefined], ['PUT', '/status', { statut: 'disponible' }], ['DELETE', '', undefined]]) {
        assert.equal((await request(sec, method, `/api/rooms/${otherStay.chambre.id}${suffix}`, body)).status, 404);
    }
    await otherStay.chambre.reload(); assert.equal(otherStay.chambre.statut, 'occupee');
    const create = await request(sec, 'POST', '/api/rooms', { numero: 'NEW', typeChambre: 'privee', clinic_id: B.clinic.id });
    assert.equal(create.status, 201, JSON.stringify(create.body));
    assert.equal((await m.Chambre.findByPk(create.body.id)).clinic_id, A.clinic.id);
});

test('C1 facturation : CIN identique, références forgées et paiement interclinique', async () => {
    const rdvB = await createRdv(m, B, { statut: 'termine' });
    const pending = await request(A.users.secretary, 'GET', `/api/billing/pending/${A.patient.cinNumero}`);
    assert.equal(pending.status, 200, JSON.stringify(pending.body));
    assert.ok(!pending.body.lignes.some(l => l.sourceType === 'consultation' && l.sourceId === rdvB.id));
    const invalid = await request(A.users.secretary, 'POST', '/api/billing', { patientCin: A.patient.cinNumero, lignes: [{ sourceType: 'examen', sourceId: exam.id, quantite: 1, prixUnitaire: 10 }] });
    assert.equal(invalid.status, 404);
    const made = await request(B.users.secretary, 'POST', '/api/billing', { patientCin: B.patient.cinNumero, lignes: [{ designation: 'Acte', quantite: 1, prixUnitaire: 10 }] });
    assert.equal(made.status, 201, JSON.stringify(made.body));
    const id = made.body.facture.id;
    assert.equal((await request(A.users.secretary, 'GET', `/api/billing/${id}`)).status, 404);
    assert.equal((await request(A.users.secretary, 'PATCH', `/api/billing/${id}/pay`, {})).status, 404);
    assert.equal((await m.Facture.findByPk(id)).statut, 'en_attente');
});

test('C1 comptes métier sans clinique : aucun repli vers la clinique du JWT', async () => {
    const user = await m.User.create({ matricule: 'LOT1-NOCLINIC', nom: 'Sans', prenom: 'Clinique', email: 'lot1-noclinic@test.test', passwordHash: 'x', role: 'secretary', statut: 'actif' });
    const token = tokenFor({ ...user.toJSON(), clinic_id: A.clinic.id });
    for (const path of ['/api/rooms', '/api/billing', '/api/patients']) {
        const r = await fetch(server.base + path, { headers: { Authorization: `Bearer ${token}` } });
        assert.equal(r.status, 403);
    }
});

test('C2 médecins : toutes les recherches patient et les écritures refusent un patient non rattaché', async () => {
    for (const path of [`/api/patients/${stranger.numeroDossier}`, `/api/patients/${stranger.numeroDossier}/documents`]) {
        assert.equal((await request(A.users.doctor, 'GET', path)).status, 404);
    }
    for (const query of [`cin=${stranger.cinNumero}`, `nom=${encodeURIComponent(stranger.prenom)}`]) {
        const r = await request(A.users.doctor, 'GET', `/api/patients?${query}`);
        assert.equal(r.status, 200); assert.ok(!JSON.stringify(r.body).includes(stranger.numeroDossier));
    }
    const check = await request(A.users.doctor, 'GET', `/api/patients/check-cin/${stranger.cinNumero}`);
    assert.equal(check.body.exists, false);
    assert.equal((await request(A.users.doctor, 'PUT', `/api/patients/${stranger.numeroDossier}`, { allergies: ['intrusion'] })).status, 404);
    assert.equal((await request(A.users.doctor, 'POST', '/api/hospitalisations', { patientId: stranger.id, diagnostic: 'intrusion' })).status, 404);
    assert.equal((await request(A.users.doctor, 'POST', '/api/examens', { patientCin: stranger.cinNumero, examensIds: [catalog.id] })).status, 404);
    assert.equal((await request(A.users.doctor, 'GET', `/api/patients/${A.patient.numeroDossier}`)).status, 200);
});

test('C2 ressources secondaires et doctorId : aucun élargissement par identifiant client', async () => {
    const second = await seedClinic(m, 'LOT1OTHER');
    await second.users.doctor.update({ clinic_id: A.clinic.id }); await second.medecin.update({ clinic_id: A.clinic.id });
    const rx = await m.Prescription.create({ clinic_id: A.clinic.id, patientCin: stranger.cinNumero, medecinId: second.medecin.id, numero: 'LOT1-STRANGER', medicaments: '[]' });
    const rdv = await m.RendezVous.create({ clinic_id: A.clinic.id, numeroRdv: 'LOT1-STRANGER', patientId: stranger.id, patientCin: stranger.cinNumero, medecinId: second.medecin.id, dateRdv: '2026-01-01', heureDebut: '09:00', heureFin: '09:30', typeConsultation: 'premiere', motif: 'secret', creePar: A.users.secretary.id });
    for (const path of [`/api/prescriptions/${rx.id}`, `/api/appointments/${rdv.numeroRdv}`, `/api/prescriptions/${prescription.id}`, `/api/hospitalisations/${otherStay.hosp.id}`]) assert.equal((await request(A.users.doctor, 'GET', path)).status, 404);
    assert.equal((await request(A.users.doctor, 'GET', `/api/appointments?doctorId=${second.medecin.id}`)).status, 403);
    assert.equal((await request(A.users.doctor, 'PUT', `/api/appointments/${rdv.numeroRdv}/status`, { status: 'termine' })).status, 404);
    const list = await request(A.users.doctor, 'GET', '/api/prescriptions');
    assert.ok(!list.body.some(p => p.id === rx.id));
});

test('C2 fenêtres : RDV annulé/ancien refusé, récent autorisé, traitant permanent, adressage révocable', async () => {
    const date = days => new Date(Date.now() - days * 86400000).toISOString().slice(0,10);
    const ctx = { ...A, patient: stranger };
    const rdv = await createRdv(m, ctx, { date: date(10), statut: 'annule' });
    const get = () => request(A.users.doctor, 'GET', `/api/patients/${stranger.numeroDossier}`);
    assert.equal((await get()).status, 404);
    await rdv.update({ statut: 'termine', dateRdv: date(91) }); assert.equal((await get()).status, 404);
    await rdv.update({ dateRdv: date(2) }); assert.equal((await get()).status, 200);
    await rdv.update({ dateRdv: date(91) });
    await stranger.update({ medecinTraitantId: A.users.doctor.id }); assert.equal((await get()).status, 200);
    await stranger.update({ medecinTraitantId: null });
    const assignment = await accessModels.PatientAssignment.create({ clinic_id: A.clinic.id, patientId: stranger.id, doctorUserId: A.users.doctor.id, kind: 'replacement', startsAt: date(1), endsAt: new Date(Date.now() + 86400000), reason: 'Remplacement explicitement autorisé', createdBy: A.users.doctor.id });
    assert.equal((await get()).status, 200); await assignment.update({ revokedAt: new Date() }); assert.equal((await get()).status, 404);
    const own = await m.Prescription.create({ clinic_id: A.clinic.id, patientCin: stranger.cinNumero, medecinId: A.medecin.id, numero: 'LOT1-AUTHORED', medicaments: '[]', diagnostique: 'Écrit personnel' });
    const authored = await request(A.users.doctor, 'GET', `/api/patient-access/authored/${stranger.id}`);
    assert.equal(authored.status, 200); assert.ok(authored.body.prescriptions.some(p => p.id === own.id));
    assert.equal((await get()).status, 404, 'un écrit ne rouvre pas le dossier complet');
});

test('C2 adressage API : patient, clinique, auteur et bénéficiaire restent distincts ; révocation immédiate', async () => {
    const beneficiary = await m.User.create({ clinic_id: A.clinic.id, matricule: 'LOT1-REFERRAL', nom: 'Remplacant', prenom: 'Test', email: 'referral@test.test', passwordHash: 'x', role: 'doctor', statut: 'actif' });
    await m.Medecin.create({ clinic_id: A.clinic.id, userId: beneficiary.id, matricule: 'MED-REFERRAL', numeroOrdre: 'ORD-REFERRAL', specialites: ['Médecine générale'], dateDebut: '2020-01-01' });
    const patient = await createPatient(m, A.clinic, A.users.secretary, 'RF123456');
    await patient.update({ medecinTraitantId: A.users.doctor.id });
    const path = `/api/patients/${patient.numeroDossier}`;
    assert.equal((await request(beneficiary, 'GET', path)).status, 404);
    const payload = { patientId: patient.id, doctorUserId: beneficiary.id, kind: 'referral', startsAt: new Date(Date.now() - 60000), endsAt: new Date(Date.now() + 3600000), reason: 'Consultation spécialisée explicitement demandée' };
    assert.equal((await request(A.users.doctor, 'POST', '/api/patient-access/assignments', { ...payload, doctorUserId: B.users.doctor.id })).status, 404);
    const made = await request(A.users.doctor, 'POST', '/api/patient-access/assignments', payload);
    assert.equal(made.status, 201, JSON.stringify(made.body));
    const stored = await accessModels.PatientAssignment.findByPk(made.body.id);
    assert.equal(stored.clinic_id, A.clinic.id);
    assert.equal(stored.patientId, patient.id);
    assert.equal(stored.createdBy, A.users.doctor.id);
    assert.equal(stored.doctorUserId, beneficiary.id);
    assert.equal((await request(beneficiary, 'GET', path)).status, 200);
    assert.equal((await request(beneficiary, 'GET', `/api/patients/${stranger.numeroDossier}`)).status, 404);
    assert.equal((await request(B.users.doctor, 'GET', path)).status, 404);
    assert.equal((await request(A.users.doctor, 'POST', `/api/patient-access/assignments/${stored.id}/revoke`, {})).status, 200);
    assert.equal((await request(beneficiary, 'GET', path)).status, 404);
});

test('C3/C4 secrétaire et admin : refus de toutes les familles de routes médicales', async () => {
    const routes = [
        ['GET', '/api/prescriptions'], ['GET', `/api/prescriptions/${prescription.id}`], ['POST','/api/prescriptions'],
        ['GET','/api/examens'], ['GET',`/api/examens/patient/${A.patient.cinNumero}`], ['GET',`/api/examens/${exam.id}/fichier`], ['POST','/api/examens'], ['PATCH',`/api/examens/${exam.id}/statut`],
        ['GET','/api/hospitalisations/active'], ['GET',`/api/hospitalisations/${ownStay.hosp.id}`], ['POST','/api/hospitalisations'],
        ...['treatment','discharge'].map(x=>['PUT',`/api/hospitalisations/${ownStay.hosp.id}/${x}`]),
        ...['vitals','alerts','soins'].map(x=>['POST',`/api/hospitalisations/${ownStay.hosp.id}/${x}`]),
        ['GET','/api/nurse/queue'], ['GET',`/api/nurse/vitals-history/${A.patient.cinNumero}`], ['GET',`/api/nurse/patient-by-dossier/${A.patient.numeroDossier}`],
        ['GET','/api/nurse/medications'], ['GET','/api/nurse/hospitalized'], ['POST','/api/nurse/vitals'],
    ];
    for (const role of ['secretary','admin']) for (const [method,path] of routes) assert.equal((await request(A.users[role],method,path,method==='GET'?undefined:{})).status,403,`${role} ${method} ${path}`);
});

test('C3 réponses administratives sans contenu médical et refus avant toute mutation', async () => {
    await m.DossierMedical.update({ allergies: '["SECRET-ALLERGIE"]', maladiesChroniques: '["SECRET-CHRONIQUE"]' }, { where: { patientId: A.patient.id } });
    for (const role of ['secretary','admin']) {
        for (const path of ['/api/patients', `/api/patients?cin=${A.patient.cinNumero}`, `/api/patients/check-cin/${A.patient.cinNumero}`, `/api/patients/${A.patient.numeroDossier}`, '/api/hospitalisations/admissions']) {
            const r = await request(A.users[role],'GET',path); assert.equal(r.status,200);
            assert.ok(!/SECRET|allergies|chronic|diagnostic|vitals/.test(JSON.stringify(r.body)),path);
        }
        assert.equal((await request(A.users[role],'PUT',`/api/patients/${A.patient.numeroDossier}`,{ nom: 'Intrusion', allergies: [] })).status,403);
        assert.equal((await request(A.users[role],'POST','/api/patients',{ cin: 'QQ123456', allergies: [] })).status,403);
    }
    await A.patient.reload(); assert.notEqual(A.patient.nom,'INTRUSION');
    assert.equal((await request(A.users.secretary,'PUT',`/api/patients/${A.patient.numeroDossier}`,{ telephonePrincipal: '0612345678' })).status,200);
});

test('Matrice infirmier : lecture hospitalisés, écritures du responsable, aucun patient extérieur au périmètre', async () => {
    assert.equal((await request(A.users.nurse,'GET',`/api/patients/${A.patient.numeroDossier}`)).status,200);
    assert.equal((await request(A.users.nurse,'GET',`/api/patients/${stranger.numeroDossier}`)).status,404);
    assert.equal((await request(B.users.nurse,'POST',`/api/hospitalisations/${ownStay.hosp.id}/vitals`,{ temperature: '37' })).status,404);
    assert.equal((await request(A.users.nurse,'POST',`/api/hospitalisations/${ownStay.hosp.id}/vitals`,{ temperature: '37' })).status,201);
    assert.equal((await request(A.users.nurse,'PATCH',`/api/examens/${exam.id}/statut`,{ statut:'preleve',resultats:'intrusion' })).status,404);
});

test('C4 accès exceptionnel : justification, médecin rattaché, lecture seule, expiration, révocation et audit', async () => {
    const base = '/api/patient-access/exceptional-access/requests';
    assert.equal((await request(A.users.admin,'POST',base,{patientId:A.patient.id,justification:'Court',scopes:['patients']})).status,400);
    const made = await request(A.users.admin,'POST',base,{patientId:A.patient.id,justification:'Vérification exceptionnelle justifiée du dossier patient',scopes:['patients','prescriptions','hospitalisations']});
    assert.equal(made.status,201,JSON.stringify(made.body)); const id=made.body.id;
    assert.equal((await request(B.users.doctor,'POST',`${base}/${id}/approve`,{})).status,404);
    assert.equal((await request(A.users.admin,'POST',`${base}/${id}/approve`,{})).status,403);
    assert.equal((await request(A.users.doctor,'POST',`${base}/${id}/approve`,{})).status,200);
    const exceptional = async (method,path) => fetch(server.base+path,{method,headers:{Authorization:`Bearer ${tokenFor(A.users.admin)}`,'X-Exceptional-Access':id}});
    assert.equal((await exceptional('GET',`/api/patients/${A.patient.numeroDossier}`)).status,200);
    assert.equal((await exceptional('GET',`/api/patients/${stranger.numeroDossier}`)).status,404);
    assert.equal((await exceptional('PUT',`/api/patients/${A.patient.numeroDossier}`)).status,403);
    assert.equal((await request(A.users.admin,'GET','/api/patient-access/audit')).status,403);
    await accessModels.ClinicResponsibility.create({clinic_id:A.clinic.id,userId:A.users.admin.id});
    const ownAudit = await request(A.users.admin,'GET','/api/patient-access/audit'); assert.equal(ownAudit.status,200); assert.ok(ownAudit.body.every(e=>e.grantId!==id));
    const docAudit = await request(A.users.doctor,'GET','/api/patient-access/audit'); assert.equal(docAudit.status,200); assert.ok(docAudit.body.some(e=>e.grantId===id && e.action==='exceptional.read'));
    assert.ok(docAudit.body.every(e => e.clinic_id === A.clinic.id && e.actorUserId !== A.users.doctor.id));
    const foreignAudit = await request(B.users.doctor,'GET','/api/patient-access/audit'); assert.equal(foreignAudit.status,200); assert.ok(foreignAudit.body.every(e => e.clinic_id === B.clinic.id && e.grantId !== id));
    await accessModels.ExceptionalGrant.update({expiresAt:new Date(Date.now()-1000)},{where:{id}}); assert.equal((await exceptional('GET',`/api/patients/${A.patient.numeroDossier}`)).status,403);
    assert.equal((await request(A.users.doctor,'POST',`${base}/${id}/revoke`,{})).status,200);
    const [[row]] = await m.sequelize.query('SELECT id FROM clinical_access_audit_events LIMIT 1');
    await assert.rejects(m.sequelize.query('UPDATE clinical_access_audit_events SET outcome = ? WHERE id = ?',{replacements:['tampered',row.id]}),/Append-only/);
    await assert.rejects(m.sequelize.query('DELETE FROM clinical_access_audit_events WHERE id = ?',{replacements:[row.id]}),/Append-only/);
});
