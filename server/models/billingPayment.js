import { DataTypes as D } from 'sequelize';
import sequelize from '../config/database.js';
import { Facture } from './facture.js';
import { User } from './user.js';

// Registre des paiements d'une facture : patient et assurance séparés, montant, mode, auteur et date.
export const BillingPayment = sequelize.define('BillingPayment', {
    id: { type: D.INTEGER, autoIncrement: true, primaryKey: true },
    clinic_id: { type: D.INTEGER, allowNull: false }, factureId: { type: D.INTEGER, allowNull: false },
    montant: { type: D.DECIMAL(10, 2), allowNull: false },
    payeur: { type: D.ENUM('patient', 'assurance'), allowNull: false },
    modePaiement: { type: D.STRING(30), allowNull: false },
    reference: { type: D.STRING(80), allowNull: false },
    creeParUserId: { type: D.INTEGER, allowNull: false },
    datePaiement: { type: D.DATE, allowNull: false, defaultValue: D.NOW },
    // Part du paiement imputée à chaque ligne de la facture (en centimes)
    repartition: { type: D.JSON, allowNull: false },
}, { tableName: 'billing_payments', updatedAt: false,
    indexes: [{ unique: true, fields: ['clinic_id', 'facture_id', 'reference'] }, { fields: ['clinic_id', 'date_paiement'] }] });
Facture.hasMany(BillingPayment, { as: 'paiements', foreignKey: 'factureId', onDelete: 'RESTRICT' });
BillingPayment.belongsTo(Facture, { foreignKey: 'factureId' });
BillingPayment.belongsTo(User, { foreignKey: 'creeParUserId', onDelete: 'RESTRICT' });
