import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PatientAssignment, ClinicResponsibility, ExceptionalGrant, AccessAudit } from '../models/access.js';

test('Accès : les identifiants de clinique, patient et auteur utilisent des colonnes SQL distinctes', () => {
    for (const model of [PatientAssignment, ClinicResponsibility, ExceptionalGrant, AccessAudit]) {
        const attributes = Object.values(model.rawAttributes);
        const fields = attributes.map(attribute => attribute.field);
        assert.equal(new Set(fields).size, fields.length, `${model.name} : plusieurs attributs partagent une colonne`);
    }
    assert.equal(PatientAssignment.rawAttributes.patientId.field, 'patient_id');
    assert.equal(PatientAssignment.rawAttributes.createdBy.field, 'created_by');
    assert.equal(ExceptionalGrant.rawAttributes.actorUserId.field, 'actor_user_id');
    assert.equal(AccessAudit.rawAttributes.actorUserId.field, 'actor_user_id');
});
