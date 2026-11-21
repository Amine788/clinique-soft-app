import { useEffect, useState } from 'react';
import api from '../../api/axios';
import { urlPublique } from '../../utils/helpers';
import toast from 'react-hot-toast';
const fields = [['name', 'Nom de la clinique'], ['specialty', 'Spécialité'], ['phone', 'Téléphone'], ['email', 'Email'], ['address', 'Adresse'], ['raisonSociale', 'Raison sociale'], ['ice', 'ICE'], ['ifNum', 'Identifiant fiscal'], ['rc', 'Registre de commerce'], ['tp', 'Taxe professionnelle'], ['rib', 'RIB']];
export default function AdminClinic() {
    const [info, setInfo] = useState(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        api.get('/clinic').then(({ data }) => setInfo({ ...data, specialty: data.specialite || '' })).catch(() => setError('Impossible de charger les informations de la clinique.'));
    }, []);
    const save = async e => {
        e.preventDefault(); setBusy(true);
        try { await api.put('/clinic', info); toast.success('Informations enregistrées'); }
        catch (err) { toast.error(err.response?.data?.error || 'Enregistrement impossible'); }
        finally { setBusy(false); }
    };
    const uploadLogo = async e => {
        const file = e.target.files?.[0]; e.target.value = '';
        if (!file) return;
        if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 2 * 1024 * 1024) return toast.error('Logo : PNG ou JPEG de 2 Mo maximum');
        setBusy(true);
        try { const form = new FormData(); form.append('logo', file); const { data } = await api.post('/clinic/logo', form, { headers: { 'Content-Type': undefined } }); setInfo(previous => ({ ...previous, logoUrl: data.logoUrl })); toast.success('Logo mis à jour'); }
        catch (err) { toast.error(err.response?.data?.error || 'Envoi impossible'); }
        finally { setBusy(false); }
    };
    return <div className="space-y-6">
        <header><h1 className="page-title">Ma clinique</h1><p className="text-sm text-gray-500 mt-1">Informations de la clinique et logo. Les comptes et leurs rôles se gèrent dans Utilisateurs.</p></header>
        <section className="bg-white border border-gray-100 rounded-2xl p-5">
            <h2 className="font-semibold">Informations de la clinique et logo</h2>
            {error && <p role="alert" className="text-red-600 mt-4">{error}</p>}
            {!info && !error && <p className="mt-4 text-sm text-gray-500">Chargement…</p>}
            {info && <form onSubmit={save} className="mt-5 space-y-5">
                <div className="flex items-center gap-4">{info.logoUrl && <img src={urlPublique(info.logoUrl)} alt="Logo de la clinique" className="w-20 h-20 object-contain" />}<label className="text-sm">Logo<input type="file" accept="image/png,image/jpeg" onChange={uploadLogo} disabled={busy} className="block mt-2 text-xs" /></label></div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{fields.map(([key, label]) => <label key={key} className="text-sm text-gray-600">{label}<input required={key === 'name'} type={key === 'email' ? 'email' : 'text'} value={info[key] || ''} onChange={e => setInfo(previous => ({ ...previous, [key]: e.target.value }))} className="block mt-1 w-full border border-gray-200 rounded-lg px-3 py-2" /></label>)}</div>
                {info.displayKey && <p className="text-xs text-gray-500">Clé de la clinique : {info.displayKey}</p>}
                <button disabled={busy} className="btn btn-primary">{busy ? 'Enregistrement…' : 'Enregistrer les informations'}</button>
            </form>}
        </section>
    </div>;
}
