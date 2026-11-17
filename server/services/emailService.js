import { createEmailTransport, emailConfiguration } from './emailTransport.js';

// Adresse d'envoi unique de la plateforme NextClinic (ex. clinique@erp…) : bienvenue et lien de mot de passe
// des nouvelles cliniques, invitations du personnel, puis e-mails patients au nom de chaque clinique.
// Gmail par défaut (GMAIL_USER + mot de passe d'application) ; autre fournisseur : SMTP_HOST / SMTP_PORT.
const transporter = createEmailTransport();
const senderAddress = () => emailConfiguration().fromAddress;

// ══════════════════════════════════════════════════════════════
// 🔔 NOTIFICATION INTERNE — Nouveau client inscrit
//    Envoyé automatiquement à GMAIL_USER à chaque inscription
// ══════════════════════════════════════════════════════════════
export async function sendNewClientNotification({ prenom, nom, email, clinicName, phone, plan }) {
    if (!emailConfigure()) return;
    const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL || senderAddress();

    const now = new Date().toLocaleString('fr-FR', { timeZone: 'Africa/Casablanca' });

    const mailOptions = {
        from: `"NextClinic Alertes" <${senderAddress()}>`,
        to: adminEmail,
        subject: `🆕 Nouveau client inscrit — ${clinicName}`,
        html: `
        <!DOCTYPE html>
        <html lang="fr">
        <head><meta charset="UTF-8"></head>
        <body style="margin:0;padding:0;background:#F0F4FF;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
          <div style="max-width:560px;margin:32px auto;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,128,0.10);">

            <!-- HEADER -->
            <div style="background:linear-gradient(135deg,#000080 0%,#1e40af 100%);padding:32px 36px;text-align:center;">
              <div style="font-size:40px;margin-bottom:10px;">🆕</div>
              <h1 style="margin:0;color:white;font-size:22px;font-weight:900;">Nouveau client NextClinic</h1>
              <p style="color:rgba(255,255,255,0.8);margin:8px 0 0;font-size:14px;">${now}</p>
            </div>

            <!-- CORPS -->
            <div style="background:white;padding:32px 36px;">

              <table style="width:100%;border-collapse:collapse;font-size:14px;">
                <tr style="border-bottom:1px solid #F3F4F6;">
                  <td style="padding:12px 0;color:#6B7280;font-weight:600;width:40%;">🏥 Clinique</td>
                  <td style="padding:12px 0;color:#111827;font-weight:700;">${clinicName}</td>
                </tr>
                <tr style="border-bottom:1px solid #F3F4F6;">
                  <td style="padding:12px 0;color:#6B7280;font-weight:600;">👤 Responsable</td>
                  <td style="padding:12px 0;color:#111827;">${prenom} ${nom}</td>
                </tr>
                <tr style="border-bottom:1px solid #F3F4F6;">
                  <td style="padding:12px 0;color:#6B7280;font-weight:600;">📧 Email</td>
                  <td style="padding:12px 0;"><a href="mailto:${email}" style="color:#000080;text-decoration:none;font-weight:600;">${email}</a></td>
                </tr>
                <tr style="border-bottom:1px solid #F3F4F6;">
                  <td style="padding:12px 0;color:#6B7280;font-weight:600;">📞 Téléphone</td>
                  <td style="padding:12px 0;color:#111827;">${phone || '—'}</td>
                </tr>
                <tr>
                  <td style="padding:12px 0;color:#6B7280;font-weight:600;">💼 Plan</td>
                  <td style="padding:12px 0;">
                    <span style="background:#EBF5FF;color:#1E40AF;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700;">${plan || 'Pro'}</span>
                  </td>
                </tr>
              </table>

              <div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:12px;padding:16px;margin-top:24px;text-align:center;">
                <p style="margin:0;color:#166534;font-size:14px;font-weight:600;">
                  ✅ Inscription enregistrée pour <strong>${email}</strong>
                </p>
              </div>
            </div>

            <!-- FOOTER -->
            <div style="background:#0F172A;padding:20px 36px;text-align:center;">
              <p style="color:rgba(255,255,255,0.4);font-size:11px;margin:0;">
                NextClinic — Notification interne automatique<br>
                Ne pas répondre à cet email.
              </p>
            </div>
          </div>
        </body>
        </html>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`[EMAIL] 🔔 Notification admin envoyée → ${adminEmail} (nouveau client: ${clinicName})`);
    } catch (error) {
        console.error('[EMAIL] ⚠️ Erreur notification admin:', error.message);
        // On ne throw pas — l'inscription ne doit pas échouer à cause de la notif admin
    }
}

/**
 * Envoie un email de bienvenue à un nouvel Administrateur de Clinique
 */
export async function sendAdminWelcomeEmail({ email, prenom, clinicName, setupLink, finEssai }) {
    // Fin de l'essai gratuit de 24 h, à l'heure du Maroc (config/trial.js)
    const finEssaiTexte = finEssai
        ? new Date(finEssai).toLocaleString('fr-FR', { timeZone: 'Africa/Casablanca', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
        : null;
    const mailOptions = {
        from: `"NextClinic" <${senderAddress()}>`,
        to: email,
        subject: `Bienvenue chez NextClinic - ${clinicName} 🏥`,
        html: `
            <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 16px; overflow: hidden;">
                <div style="background: linear-gradient(135deg, #000080 0%, #1e40af 100%); padding: 40px 20px; text-align: center; color: white;">
                    <h1 style="margin: 0; font-size: 28px; font-weight: 800;">Bienvenue sur NextClinic !</h1>
                    <p style="margin: 10px 0 0; opacity: 0.9; font-size: 16px;">L'aventure commence pour ${clinicName}</p>
                </div>
                <div style="padding: 30px; background-color: #ffffff;">
                    <p style="font-size: 16px; color: #374151;">Bonjour <strong>${prenom}</strong>,</p>
                    <p style="font-size: 16px; color: #374151; line-height: 1.6;">
                        Nous sommes ravis de vous compter parmi nous. Pour commencer à utiliser votre espace <strong>${clinicName}</strong>, vous devez d'abord définir votre mot de passe administrateur.
                    </p>
                    <div style="text-align: center; margin-top: 30px; margin-bottom: 12px;">
                        <a href="${setupLink}" style="background-color: #000080; color: #ffffff; padding: 16px 32px; text-decoration: none; border-radius: 12px; font-weight: 700; display: inline-block; font-size: 16px; box-shadow: 0 4px 12px rgba(0,0,128,0.2);">Configurer mon mot de passe</a>
                    </div>
                    <p style="text-align: center; font-size: 12px; color: #9ca3af; margin: 0 0 12px;">Ce lien est valable 24 heures.</p>
                    <p style="text-align: center; font-size: 12px; color: #6b7280; margin: 0 0 30px; word-break: break-all;">
                        Si le bouton ne fonctionne pas, copiez cette adresse dans votre navigateur :<br>
                        <a href="${setupLink}" style="color: #000080;">${setupLink}</a>
                    </p>
                    <div style="background-color: #fffbeb; border: 1px solid #fde68a; border-radius: 12px; padding: 20px; margin: 25px 0;">
                        <h3 style="margin: 0 0 8px; font-size: 15px; color: #92400e;">⏳ Votre essai gratuit de 24 heures</h3>
                        <p style="margin: 0; font-size: 14px; color: #78350f; line-height: 1.6;">
                            Votre clinique est active gratuitement pendant <strong>24 heures</strong>${finEssaiTexte ? `, jusqu'au <strong>${finEssaiTexte}</strong> (heure du Maroc)` : ''}.
                            Pour continuer à utiliser NextClinic après l'essai, contactez notre équipe au <strong>+212 660-406878</strong>
                            ou à <a href="mailto:support@nextact-solutions.com" style="color: #92400e;">support@nextact-solutions.com</a> : votre abonnement sera activé sans perte de données.
                        </p>
                    </div>
                    <div style="background-color: #f3f4f6; border-radius: 12px; padding: 20px; margin: 25px 0;">
                        <h3 style="margin: 0 0 10px; font-size: 14px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em;">Vos prochaines étapes :</h3>
                        <ul style="margin: 0; padding-left: 20px; color: #4b5563; font-size: 14px;">
                            <li style="margin-bottom: 8px;">Configurez le profil de votre clinique</li>
                            <li style="margin-bottom: 8px;">Créez les comptes de votre équipe (médecins, secrétaires, infirmiers, pharmacien, laboratoire)</li>
                            <li>Enregistrez vos patients et leurs rendez-vous</li>
                        </ul>
                    </div>
                </div>
                <div style="padding: 20px; background-color: #f9fafb; text-align: center; border-top: 1px solid #e5e7eb;">
                    <p style="font-size: 12px; color: #9ca3af; margin: 0;">
                        &copy; 2026 NextClinic - Solution médicale SaaS 100% Marocaine<br>
                        Tassila, Agadir, Maroc | +212 660-406878
                    </p>
                </div>
            </div>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`[EMAIL] ✅ Welcome email sent to Admin: ${email}`);
        return { success: true };
    } catch (error) {
        console.error('[EMAIL] ❌ Error sending welcome email:', error.message);
        throw new Error(`Échec de l'envoi de l'email de bienvenue à ${email}: ${error.message}`);
    }
}

// ══════════════════════════════════════════════
// E-MAILS AUX PATIENTS — envoyés par le compte Gmail de NextClinic, au nom de la clinique
// (bascule « E-mails aux patients » de la page Réglages, voir services/modulesClinique.js)
// ══════════════════════════════════════════════

export const emailConfigure = () => {
    try { return emailConfiguration().configured; } catch { return false; }
};

// Expéditeur affiché « Clinique X via NextClinic » ; les réponses du patient vont à l'e-mail de la clinique
function expediteurClinique(clinic) {
    const nom = (clinic?.name || 'NextClinic').replace(/"/g, '');
    return {
        from: `"${nom} via NextClinic" <${senderAddress()}>`,
        ...(clinic?.email && { replyTo: clinic.email }),
    };
}

const dateLongue = date => new Date(`${date}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const heureCourte = heure => heure?.slice(0, 5) || heure;

// 1. Bienvenue patient (création du dossier)
export async function sendWelcomeEmail({ email, prenom, nom, numeroDossier, clinic }) {
    return transporter.sendMail({
        ...expediteurClinique(clinic),
        to: email,
        subject: `Bienvenue à ${clinic?.name || 'la clinique'} 🏥`,
        html: `<p>Bonjour ${prenom} ${nom},</p><p>Votre dossier patient ${numeroDossier} a été créé à ${clinic?.name || 'la clinique'}.</p>`
    });
}

// 2. Confirmation de rendez-vous (à la prise de RDV)
export async function sendAppointmentConfirmation({ email, prenom, doctorName, date, heureDebut, clinic }) {
    return transporter.sendMail({
        ...expediteurClinique(clinic),
        to: email,
        subject: 'Votre rendez-vous 📅',
        html: `<p>Bonjour ${prenom},</p><p>Votre rendez-vous avec ${doctorName} à ${clinic?.name || 'la clinique'} est fixé le ${dateLongue(date)} à ${heureCourte(heureDebut)}.</p>`
    });
}

// 3. Rappel de rendez-vous (la veille, services/rappels.js)
export async function sendAppointmentReminder({ email, prenom, doctorName, date, heureDebut, clinic }) {
    const contact = [clinic?.phone && `au ${clinic.phone}`, clinic?.email && `à ${clinic.email}`].filter(Boolean).join(' ou ');
    return transporter.sendMail({
        ...expediteurClinique(clinic),
        to: email,
        subject: `Rappel : votre rendez-vous demain à ${heureCourte(heureDebut)} ⏰`,
        html: `<p>Bonjour ${prenom},</p>`
            + `<p>Nous vous rappelons votre rendez-vous avec ${doctorName} à ${clinic?.name || 'la clinique'} <strong>demain, ${dateLongue(date)}, à ${heureCourte(heureDebut)}</strong>.</p>`
            + (clinic?.address ? `<p>Adresse : ${clinic.address}</p>` : '')
            + `<p>En cas d'empêchement, merci de prévenir la clinique${contact ? ` ${contact}` : ''}.</p>`
    });
}

// ══════════════════════════════════════════════════════
// 3. EMAIL D'INVITATION DU PERSONNEL (DOCTOR, SECRETARY, etc.)
// ══════════════════════════════════════════════════════
export async function sendInvitationEmail({ email, prenom, nom, role, clinicName, setupLink }) {
    const roleLabels = {
        doctor: 'Médecin 🩺',
        secretary: 'Secrétaire 📋',
        pharmacist: 'Pharmacien 💊',
        lab_technician: 'Technicien Labo 🔬',
        admin: 'Administrateur Adjoint 🛡️'
    };
    const roleLabel = roleLabels[role] || 'Collaborateur 🤝';
    const displayName = prenom || nom || 'Cher collaborateur';

    const mailOptions = {
        from: `"NextClinic" <${senderAddress()}>`,
        to: email,
        subject: `Invitation à rejoindre l'équipe de ${clinicName} 🏥`,
        html: `
        <!DOCTYPE html>
        <html lang="fr">
        <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
        <body style="margin:0;padding:0;background:#F0F4FF;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">

          <div style="max-width:600px;margin:40px auto;border-radius:20px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,128,0.12);">

            <!-- HEADER -->
            <div style="background:linear-gradient(135deg,#000080 0%,#1e40af 100%);padding:40px 30px;text-align:center;">
              <div style="font-size:44px;margin-bottom:12px;">✉️</div>
              <h1 style="margin:0;color:white;font-size:24px;font-weight:900;">
                Invitation NextClinic
              </h1>
              <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:15px;">
                Rejoignez l'équipe médicale de <strong>${clinicName}</strong>
              </p>
            </div>

            <!-- CORPS -->
            <div style="background:white;padding:40px;">

              <p style="font-size:16px;color:#111827;margin:0 0 16px;font-weight:600;">
                Bonjour ${displayName},
              </p>

              <p style="font-size:15px;color:#374151;line-height:1.7;margin:0 0 20px;">
                L'administrateur de <strong>${clinicName}</strong> vous a invité(e) à rejoindre son équipe médicale sur NextClinic en tant que :<br />
                <strong style="display:inline-block;margin-top:6px;background:#EBF5FF;color:#1E40AF;padding:6px 14px;border-radius:8px;font-size:14px;">
                  ${roleLabel}
                </strong>
              </p>

              <p style="font-size:15px;color:#374151;line-height:1.7;margin:0 0 28px;">
                Pour activer votre compte et accéder à votre espace de travail personnel, veuillez définir votre mot de passe en cliquant sur le bouton ci-dessous :
              </p>

              <!-- CTA -->
              <div style="text-align:center;margin:32px 0;">
                <a href="${setupLink}"
                  style="display:inline-block;background:linear-gradient(135deg,#000080,#1e40af);color:white;padding:16px 36px;border-radius:12px;text-decoration:none;font-weight:800;font-size:15px;box-shadow:0 6px 18px rgba(0,0,128,0.25);">
                  🔐 Activer mon compte & Créer mon mot de passe →
                </a>
              </div>

              <p style="font-size:12px;color:#9CA3AF;text-align:center;margin:0 0 32px;">
                ⚠️ Ce lien est valable <strong>48 heures</strong>. Une fois expiré, l'administrateur devra vous envoyer une nouvelle invitation.
              </p>

              <!-- PROFILES PERMISSIONS -->
              <div style="background:#F8FAFF;border:1px solid #E0E7FF;border-radius:12px;padding:20px;margin-bottom:24px;">
                <div style="font-weight:700;color:#111827;font-size:14px;margin-bottom:8px;">🔒 Confidentialité & Sécurité</div>
                <p style="color:#6B7280;font-size:13px;line-height:1.6;margin:0;">
                  Vos identifiants et accès sont strictement personnels. Votre mot de passe est entièrement crypté de bout en bout et l'administrateur n'y aura jamais accès.
                </p>
              </div>

            </div>

            <!-- FOOTER -->
            <div style="background:#0F172A;padding:24px 40px;text-align:center;">
              <p style="color:rgba(255,255,255,0.5);font-size:11px;margin:0;line-height:1.7;">
                © 2026 NextClinic by NEXTACT Solutions.<br>
                Tassila, Agadir, Maroc | +212 660-406878
              </p>
            </div>

          </div>
        </body>
        </html>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`[EMAIL] ✅ Invitation email sent to: ${email}`);
        return { success: true };
    } catch (error) {
        console.error('[EMAIL] ❌ Error sending invitation email:', error.message);
        throw new Error(`Échec de l'envoi de l'email d'invitation à ${email}: ${error.message}`);
    }
}
