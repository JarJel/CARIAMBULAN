import { Head } from '@inertiajs/react';
import { useState } from 'react';
import AppLayout from '../../layouts/AppLayout';

interface Props {
    ambulances: any[];
    drivers?: any[];
}

export default function AdminAmbulances({ ambulances, drivers = [] }: Props) {
    const [message, setMessage] = useState<string | null>(null);
    const [updatingId, setUpdatingId] = useState<number | null>(null);
    const [baseFare, setBaseFare] = useState<string>('');
    const [pricePerKm, setPricePerKm] = useState<string>('');

    // Modal Create State
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [plateNumber, setPlateNumber] = useState('');
    const [category, setCategory] = useState('emergency');
    const [brand, setBrand] = useState('');
    const [year, setYear] = useState(new Date().getFullYear().toString());
    const [capacity, setCapacity] = useState('1');
    const [isFreeService, setIsFreeService] = useState(false);
    const [isDraft, setIsDraft] = useState(true);
    
    // File upload states
    const [stnkFile, setStnkFile] = useState<File | null>(null);
    const [stnkExpiry, setStnkExpiry] = useState('');
    const [kirFile, setKirFile] = useState<File | null>(null);
    const [kirExpiry, setKirExpiry] = useState('');
    const [operasionalFile, setOperasionalFile] = useState<File | null>(null);
    const [operasionalExpiry, setOperasionalExpiry] = useState('');

    // Driver Plotting States
    const [driverSearch, setDriverSearch] = useState('');
    const [driverFilter, setDriverFilter] = useState('all'); // 'all', 'unassigned'
    const [selectedDriverId, setSelectedDriverId] = useState('');

    const filteredDrivers = (drivers || []).filter(drv => {
        const matchesSearch = drv.name.toLowerCase().includes(driverSearch.toLowerCase()) || 
                              drv.email.toLowerCase().includes(driverSearch.toLowerCase());
        
        if (!matchesSearch) return false;

        if (driverFilter === 'unassigned') {
            const isAssigned = ambulances.some(a => a.current_driver_id === drv.id);
            return !isAssigned;
        }

        return true;
    });

    // Clone State
    const [showCloneModal, setShowCloneModal] = useState(false);
    const [cloneSourceId, setCloneSourceId] = useState<number | null>(null);
    const [clonePlateNumber, setClonePlateNumber] = useState('');

    const handleUpdateTariff = async (id: number) => {
        try {
            const res = await fetch(`/api/admin/ambulances/${id}/manage`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
                body: JSON.stringify({
                    base_fare: parseFloat(baseFare),
                    price_per_km: parseFloat(pricePerKm),
                })
            });
            const data = await res.json();
            if (res.ok) {
                setMessage('Tarif berhasil diperbarui.');
                setUpdatingId(null);
                window.location.reload();
            } else {
                setMessage(data.message || 'Gagal memperbarui tarif.');
            }
        } catch (err) {
            setMessage('Kesalahan koneksi ke server.');
        }
    };

    const handleCreateAmbulance = async (e: React.FormEvent) => {
        e.preventDefault();
        setMessage(null);

        const formData = new FormData();
        formData.append('plate_number', plateNumber);
        formData.append('category', category);
        formData.append('brand', brand);
        formData.append('year', year);
        formData.append('capacity', capacity);
        formData.append('base_fare', baseFare || '0');
        formData.append('price_per_km', pricePerKm || '0');
        formData.append('is_free_service_eligible', isFreeService ? '1' : '0');
        formData.append('is_draft', isDraft ? '1' : '0');
        if (selectedDriverId) {
            formData.append('driver_id', selectedDriverId);
        }

        if (stnkFile) {
            formData.append('stnk_file', stnkFile);
            formData.append('stnk_file_expiry', stnkExpiry);
        }
        if (kirFile) {
            formData.append('kir_file', kirFile);
            formData.append('kir_file_expiry', kirExpiry);
        }
        if (operasionalFile) {
            formData.append('operasional_file', operasionalFile);
            formData.append('operasional_file_expiry', operasionalExpiry);
        }

        try {
            const res = await fetch('/api/admin/ambulances', {
                method: 'POST',
                body: formData,
                headers: { 'Accept': 'application/json' }
            });
            const data = await res.json();
            if (res.ok) {
                setMessage('Armada baru berhasil didaftarkan.');
                setShowCreateModal(false);
                window.location.reload();
            } else {
                setMessage(JSON.stringify(data.errors) || data.message || 'Gagal membuat armada.');
            }
        } catch (err) {
            setMessage('Koneksi gagal ke server.');
        }
    };

    const handleCloneAmbulance = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!cloneSourceId) return;
        setMessage(null);

        try {
            const res = await fetch(`/api/admin/ambulances/${cloneSourceId}/clone`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
                body: JSON.stringify({ plate_number: clonePlateNumber })
            });
            const data = await res.json();
            if (res.ok) {
                setMessage('Armada berhasil diduplikasi.');
                setShowCloneModal(false);
                window.location.reload();
            } else {
                setMessage(data.message || 'Gagal menduplikasi armada.');
            }
        } catch (err) {
            setMessage('Koneksi gagal ke server.');
        }
    };

    return (
        <AppLayout activeMenu="ambulances">
            <Head title="Kelola Armada - Admin" />
            
            <div className="max-w-7xl mx-auto px-6 py-10 space-y-8">
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl font-black text-slate-800 tracking-tight">Armada Ambulans Institusi</h1>
                        <p className="text-gray-500 text-xs mt-1">Daftar kendaraan, status operasional, driver/nurse terikat, dan pengaturan tarif.</p>
                    </div>
                    <button 
                        onClick={() => setShowCreateModal(true)}
                        className="bg-teal-600 hover:bg-teal-700 text-white rounded-xl px-5 py-3 text-xs font-bold shadow transition uppercase tracking-wider"
                    >
                        + Tambah Armada Baru
                    </button>
                </div>

                {message && (
                    <div className="p-4 bg-teal-50 text-teal-800 rounded-xl text-xs font-semibold">
                        {message}
                    </div>
                )}

                <div className="bg-white rounded-3xl border border-gray-100 shadow-xl overflow-hidden">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-150 text-[10px] font-black uppercase text-gray-500 tracking-wider">
                                <th className="p-6">Plat Nomor</th>
                                <th className="p-6">Detail Armada</th>
                                <th className="p-6">Kategori</th>
                                <th className="p-6">Kru Medis</th>
                                <th className="p-6">Status Verifikasi</th>
                                <th className="p-6">Status Siaga</th>
                                <th className="p-6">Tarif</th>
                                <th className="p-6 text-right">Aksi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-105 text-xs text-slate-700">
                            {ambulances.map((amb) => (
                                <tr key={amb.id} className="hover:bg-gray-50/20 transition">
                                    <td className="p-6">
                                        <span className="font-extrabold text-slate-850 block">{amb.plate_number}</span>
                                        {amb.is_draft ? (
                                            <span className="text-[9px] bg-slate-100 text-slate-655 font-black uppercase px-2 py-0.5 rounded mt-1 inline-block">Draft</span>
                                        ) : null}
                                    </td>
                                    <td className="p-6">
                                        <span className="font-medium text-slate-600 block">{amb.brand || '-'} ({amb.year || '-'})</span>
                                        <span className="text-[10px] text-slate-400">Kapasitas: {amb.capacity} Pasien</span>
                                    </td>
                                    <td className="p-6 uppercase font-bold">{amb.category}</td>
                                    <td className="p-6">
                                        <p className="text-slate-500">🧑‍✈️ {amb.current_driver?.name || '-'}</p>
                                        <p className="text-slate-500 mt-1">🧑‍⚕️ {amb.current_nurse?.name || '-'}</p>
                                    </td>
                                    <td className="p-6">
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                                            amb.verification_status === 'verified' ? 'bg-emerald-100 text-emerald-800' :
                                            amb.verification_status === 'rejected' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
                                        }`}>
                                            {amb.verification_status || 'Pending'}
                                        </span>
                                    </td>
                                    <td className="p-6">
                                        <span className={`px-2.5 py-1 rounded-full text-[9px] uppercase font-bold ${
                                            amb.status === 'standby' ? 'bg-emerald-50 text-emerald-600' :
                                            amb.status === 'suspended' ? 'bg-red-50 text-red-650' : 'bg-purple-50 text-purple-600'
                                        }`}>
                                            ● {amb.status}
                                        </span>
                                    </td>
                                    <td className="p-6">
                                        <span className="block font-bold">Dasar: Rp {parseFloat(amb.base_fare).toLocaleString('id-ID')}</span>
                                        <span className="text-slate-450 block mt-0.5">Km: Rp {parseFloat(amb.price_per_km).toLocaleString('id-ID')}</span>
                                    </td>
                                    <td className="p-6 text-right space-y-2">
                                        {updatingId === amb.id ? (
                                            <div className="flex flex-col gap-2 p-4 bg-gray-50 rounded-xl max-w-xs ml-auto">
                                                <input
                                                    type="number"
                                                    placeholder="Tarif Dasar"
                                                    value={baseFare}
                                                    onChange={(e) => setBaseFare(e.target.value)}
                                                    className="border rounded px-2 py-1 text-xs"
                                                />
                                                <input
                                                    type="number"
                                                    placeholder="Tarif per KM"
                                                    value={pricePerKm}
                                                    onChange={(e) => setPricePerKm(e.target.value)}
                                                    className="border rounded px-2 py-1 text-xs"
                                                />
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => handleUpdateTariff(amb.id)}
                                                        className="bg-blue-600 text-white rounded px-3 py-1 text-[10px] font-bold"
                                                    >
                                                        Simpan
                                                    </button>
                                                    <button
                                                        onClick={() => setUpdatingId(null)}
                                                        className="bg-gray-300 text-slate-800 rounded px-3 py-1 text-[10px] font-bold"
                                                    >
                                                        Batal
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex justify-end gap-2">
                                                <button
                                                    onClick={() => {
                                                        setUpdatingId(amb.id);
                                                        setBaseFare(amb.base_fare);
                                                        setPricePerKm(amb.price_per_km);
                                                    }}
                                                    className="bg-slate-900 text-white rounded-lg px-3 py-1.5 font-bold uppercase text-[9px] hover:bg-slate-800 transition"
                                                >
                                                    Tarif
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setCloneSourceId(amb.id);
                                                        setClonePlateNumber('');
                                                        setShowCloneModal(true);
                                                    }}
                                                    className="bg-teal-700 text-white rounded-lg px-3 py-1.5 font-bold uppercase text-[9px] hover:bg-teal-600 transition"
                                                >
                                                    Duplikasi
                                                </button>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* MODAL TAMBAH ARMADA BARU */}
            {showCreateModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl space-y-4 my-8">
                        <div className="text-center">
                            <h3 className="font-extrabold text-base">Registrasi Armada Baru</h3>
                            <p className="text-xs text-slate-400">Daftarkan plat nomor dan berkas legalitas ambulans.</p>
                        </div>
                        <form onSubmit={handleCreateAmbulance} className="space-y-4 text-xs">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block font-bold text-slate-550 mb-1">Plat Nomor (Regex D 1234 ABC)</label>
                                    <input 
                                        type="text" 
                                        required 
                                        placeholder="D 1111 RSH" 
                                        value={plateNumber} 
                                        onChange={(e) => setPlateNumber(e.target.value)}
                                        className="w-full rounded-lg border p-2 focus:outline-none focus:border-teal-500" 
                                    />
                                </div>
                                <div>
                                    <label className="block font-bold text-slate-550 mb-1">Kategori</label>
                                    <select 
                                        value={category} 
                                        onChange={(e) => setCategory(e.target.value)}
                                        className="w-full rounded-lg border p-2 bg-white"
                                    >
                                        <option value="emergency">🚨 Gawat Darurat (Emergency)</option>
                                        <option value="non_emergency">🟢 Transportasi (Non-Emergency)</option>
                                        <option value="corpse">🔲 Kereta Jenazah (Corpse)</option>
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-4">
                                <div>
                                    <label className="block font-bold text-slate-550 mb-1">Merek</label>
                                    <input type="text" required placeholder="Toyota HiAce" value={brand} onChange={(e) => setBrand(e.target.value)} className="w-full rounded-lg border p-2" />
                                </div>
                                <div>
                                    <label className="block font-bold text-slate-550 mb-1">Tahun Perakitan</label>
                                    <input type="number" required value={year} onChange={(e) => setYear(e.target.value)} className="w-full rounded-lg border p-2" />
                                </div>
                                <div>
                                    <label className="block font-bold text-slate-550 mb-1">Kapasitas</label>
                                    <input type="number" required min="1" value={capacity} onChange={(e) => setCapacity(e.target.value)} className="w-full rounded-lg border p-2" />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block font-bold text-slate-550 mb-1">Tarif Dasar (Rp)</label>
                                    <input type="number" placeholder="150000" value={baseFare} onChange={(e) => setBaseFare(e.target.value)} className="w-full rounded-lg border p-2" />
                                </div>
                                <div>
                                    <label className="block font-bold text-slate-550 mb-1">Tarif per KM (Rp)</label>
                                    <input type="number" placeholder="7000" value={pricePerKm} onChange={(e) => setPricePerKm(e.target.value)} className="w-full rounded-lg border p-2" />
                                </div>
                            </div>

                            {/* PLOT DRIVER WITH SEARCH & FILTER */}
                            <div className="space-y-2.5">
                                <label className="block font-bold text-slate-550 mb-0.5">Plot Pengemudi (Driver)</label>
                                <div className="space-y-2 border border-slate-200 dark:border-slate-800 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/20">
                                    <div className="flex gap-2">
                                        <input 
                                            type="text" 
                                            placeholder="Cari driver berdasarkan nama / email..." 
                                            value={driverSearch} 
                                            onChange={(e) => setDriverSearch(e.target.value)} 
                                            className="flex-1 rounded-lg border p-2 text-xs bg-white dark:border-slate-800 dark:bg-slate-950 focus:outline-none focus:ring-1 focus:ring-teal-500"
                                        />
                                        <select 
                                            value={driverFilter} 
                                            onChange={(e) => setDriverFilter(e.target.value)}
                                            className="rounded-lg border p-2 text-xs bg-white dark:border-slate-800 dark:bg-slate-950 text-slate-700"
                                        >
                                            <option value="all">Semua Driver</option>
                                            <option value="unassigned">Belum Punya Armada</option>
                                        </select>
                                    </div>
                                    
                                    <div className="max-h-[130px] overflow-y-auto space-y-1.5 pr-1 mt-2 bg-white dark:bg-slate-950 border dark:border-slate-800 rounded-lg p-2">
                                        <label className="flex items-center gap-2.5 p-1.5 hover:bg-slate-50 dark:hover:bg-slate-900 rounded cursor-pointer text-slate-700 dark:text-slate-350">
                                            <input 
                                                type="radio" 
                                                name="driver_id" 
                                                value="" 
                                                checked={selectedDriverId === ''} 
                                                onChange={() => setSelectedDriverId('')} 
                                                className="text-teal-600 focus:ring-teal-500"
                                            />
                                            <span className="font-semibold">Tanpa Driver (Kosong)</span>
                                        </label>
                                        {filteredDrivers.map(drv => {
                                            const isAssigned = ambulances.some(a => a.current_driver_id === drv.id);
                                            return (
                                                <label key={drv.id} className="flex items-center justify-between p-1.5 hover:bg-slate-50 dark:hover:bg-slate-900 rounded cursor-pointer text-slate-700 dark:text-slate-350 border-t border-slate-100 dark:border-slate-900">
                                                    <div className="flex items-center gap-2.5">
                                                        <input 
                                                            type="radio" 
                                                            name="driver_id" 
                                                            value={drv.id} 
                                                            checked={selectedDriverId === drv.id.toString()} 
                                                            onChange={() => setSelectedDriverId(drv.id.toString())} 
                                                            className="text-teal-600 focus:ring-teal-500"
                                                        />
                                                        <div>
                                                            <span className="font-bold">{drv.name}</span>
                                                            <span className="text-[10px] text-gray-400 block font-mono">{drv.email}</span>
                                                        </div>
                                                    </div>
                                                    {isAssigned && (
                                                        <span className="text-[9px] bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 font-extrabold px-2 py-0.5 rounded border border-amber-200 dark:border-amber-900 uppercase shrink-0">Punya Armada</span>
                                                    )}
                                                </label>
                                            );
                                        })}
                                        {filteredDrivers.length === 0 && (
                                            <p className="text-slate-400 dark:text-slate-500 italic text-[11px] text-center py-4">Tidak ada driver yang cocok.</p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* DOCUMENT FILES UPLOAD */}
                            <div className="space-y-4 bg-slate-50 dark:bg-slate-950/20 p-5 rounded-2xl border border-slate-100 dark:border-slate-800">
                                <span className="font-extrabold uppercase tracking-wider text-[10px] text-slate-400 block border-b pb-2">Legalitas & Dokumen Kendaraan</span>
                                
                                <div className="space-y-1.5">
                                    <label className="block font-bold text-slate-600">Unggah Surat STNK (PDF/Gambar)</label>
                                    <div className="flex flex-col sm:flex-row gap-2">
                                        <label className="flex-1 flex items-center justify-between border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 cursor-pointer transition hover:border-teal-500 bg-white dark:bg-slate-950">
                                            <span className="text-slate-500 truncate">{stnkFile ? stnkFile.name : 'Pilih file STNK...'}</span>
                                            <span className="bg-slate-150 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-3 py-1 rounded-lg font-bold text-[10px] uppercase">Cari</span>
                                            <input type="file" accept="image/*,application/pdf" required={!isDraft} onChange={(e) => setStnkFile(e.target.files?.[0] || null)} className="hidden" />
                                        </label>
                                        <div className="sm:w-1/3">
                                            <input type="date" title="Masa Berlaku STNK" required={!isDraft} value={stnkExpiry} onChange={(e) => setStnkExpiry(e.target.value)} className="w-full border border-slate-300 dark:border-slate-700 rounded-xl p-2 bg-white dark:bg-slate-950 focus:outline-none focus:border-teal-500 text-xs" />
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="block font-bold text-slate-600">Unggah Berkas Uji KIR (Opsional)</label>
                                    <div className="flex flex-col sm:flex-row gap-2">
                                        <label className="flex-1 flex items-center justify-between border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 cursor-pointer transition hover:border-teal-500 bg-white dark:bg-slate-950">
                                            <span className="text-slate-500 truncate">{kirFile ? kirFile.name : 'Pilih file KIR...'}</span>
                                            <span className="bg-slate-150 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-3 py-1 rounded-lg font-bold text-[10px] uppercase">Cari</span>
                                            <input type="file" accept="image/*,application/pdf" onChange={(e) => setKirFile(e.target.files?.[0] || null)} className="hidden" />
                                        </label>
                                        <div className="sm:w-1/3">
                                            <input type="date" title="Masa Berlaku KIR" value={kirExpiry} onChange={(e) => setKirExpiry(e.target.value)} className="w-full border border-slate-300 dark:border-slate-700 rounded-xl p-2 bg-white dark:bg-slate-950 focus:outline-none focus:border-teal-500 text-xs" />
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="block font-bold text-slate-600">Izin Operasional Ambulans Dinas Kesehatan</label>
                                    <div className="flex flex-col sm:flex-row gap-2">
                                        <label className="flex-1 flex items-center justify-between border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 cursor-pointer transition hover:border-teal-500 bg-white dark:bg-slate-950">
                                            <span className="text-slate-500 truncate">{operasionalFile ? operasionalFile.name : 'Pilih file Izin Operasional...'}</span>
                                            <span className="bg-slate-150 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-3 py-1 rounded-lg font-bold text-[10px] uppercase">Cari</span>
                                            <input type="file" accept="image/*,application/pdf" required={!isDraft} onChange={(e) => setOperasionalFile(e.target.files?.[0] || null)} className="hidden" />
                                        </label>
                                        <div className="sm:w-1/3">
                                            <input type="date" title="Masa Berlaku Izin" required={!isDraft} value={operasionalExpiry} onChange={(e) => setOperasionalExpiry(e.target.value)} className="w-full border border-slate-300 dark:border-slate-700 rounded-xl p-2 bg-white dark:bg-slate-950 focus:outline-none focus:border-teal-500 text-xs" />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-4">
                                <label className="flex items-center gap-2 font-semibold">
                                    <input type="checkbox" checked={isFreeService} onChange={(e) => setIsFreeService(e.target.checked)} />
                                    Eligible Layanan Gratis Dinkes (Non-Tarif)
                                </label>
                                <label className="flex items-center gap-2 font-semibold">
                                    <input type="checkbox" checked={isDraft} onChange={(e) => setIsDraft(e.target.checked)} />
                                    Simpan sebagai Draft Operasional
                                </label>
                            </div>

                            <div className="flex gap-3 pt-2">
                                <button 
                                    type="button" 
                                    onClick={() => setShowCreateModal(false)}
                                    className="flex-1 py-2 font-bold bg-slate-100 rounded-lg hover:bg-slate-200"
                                >
                                    Batal
                                </button>
                                <button 
                                    type="submit" 
                                    className="flex-1 py-2 font-bold bg-teal-600 hover:bg-teal-700 text-white rounded-lg shadow-md"
                                >
                                    {isDraft ? 'Simpan Draft' : 'Daftarkan & Ajukan Verifikasi'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL DUPLIKASI ARMADA (CLONE) */}
            {showCloneModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4">
                        <div className="text-center">
                            <h3 className="font-extrabold text-base">Duplikasi Detail Armada</h3>
                            <p className="text-xs text-slate-450 mt-1">Salin semua konfigurasi ambulans ke unit baru.</p>
                        </div>
                        <form onSubmit={handleCloneAmbulance} className="space-y-4 text-xs">
                            <div>
                                <label className="block font-bold text-slate-550 mb-1">Plat Nomor Unit Baru</label>
                                <input 
                                    type="text" 
                                    required 
                                    placeholder="D 2222 RSH" 
                                    value={clonePlateNumber} 
                                    onChange={(e) => setClonePlateNumber(e.target.value)}
                                    className="w-full rounded-lg border p-2 focus:outline-none"
                                />
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button 
                                    type="button" 
                                    onClick={() => setShowCloneModal(false)}
                                    className="flex-1 py-2 font-bold bg-slate-100 rounded-lg hover:bg-slate-200"
                                >
                                    Batal
                                </button>
                                <button 
                                    type="submit" 
                                    className="flex-1 py-2 font-bold bg-teal-600 hover:bg-teal-700 text-white rounded-lg shadow-md"
                                >
                                    Mulai Duplikasi
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </AppLayout>
    );
}
