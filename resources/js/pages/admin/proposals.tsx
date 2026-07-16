import { Head } from '@inertiajs/react';
import { useState } from 'react';
import AppLayout from '../../layouts/AppLayout';

interface Props {
    proposals: any[];
    ambulances: any[];
}

export default function AdminProposals({ proposals, ambulances }: Props) {
    const [message, setMessage] = useState<string | null>(null);
    const [activeProposalId, setActiveProposalId] = useState<number | null>(null);
    const [selectedAmbulanceId, setSelectedAmbulanceId] = useState<number | null>(null);
    const [rejectionReason, setRejectionReason] = useState<string>('');
    const [activeRejectConfirmId, setActiveRejectConfirmId] = useState<number | null>(null);

    const handleVerifyProposal = async (id: number, status: 'approved' | 'rejected') => {
        try {
            const res = await fetch(`/api/admin/event-proposals/${id}/verify`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
                body: JSON.stringify({
                    review_status: status,
                    rejection_reason: status === 'rejected' ? rejectionReason : null,
                    ambulance_id: status === 'approved' ? selectedAmbulanceId : null,
                })
            });
            const data = await res.json();
            if (res.ok) {
                setMessage(`Proposal berhasil di-${status}.`);
                setActiveProposalId(null);
                window.location.reload();
            } else {
                setMessage(data.message || 'Gagal memproses verifikasi proposal.');
            }
        } catch (err) {
            setMessage('Kesalahan koneksi ke server.');
        }
    };

    return (
        <AppLayout activeMenu="proposals">
            <Head title="Proposal Siaga Event - Admin" />
            
            <div className="max-w-7xl mx-auto px-6 py-10 space-y-8">
                <div>
                    <h1 className="text-2xl font-black text-slate-800 tracking-tight">Proposal Siaga Acara</h1>
                    <p className="text-gray-500 text-xs mt-1">Review proposal masuk untuk sewa ambulans standby acara sosial, olahraga, konser, dan instansi.</p>
                </div>

                {message && (
                    <div className="p-4 bg-emerald-50 text-emerald-800 rounded-xl text-xs font-semibold">
                        {message}
                    </div>
                )}

                <div className="bg-white rounded-3xl border border-gray-100 shadow-xl overflow-hidden">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-150 text-[10px] font-black uppercase text-gray-500 tracking-wider">
                                <th className="p-6">Order ID</th>
                                <th className="p-6">Pemohon (User)</th>
                                <th className="p-6">Nama Dokumen</th>
                                <th className="p-6">Tarif Estimasi</th>
                                <th className="p-6">Status Review</th>
                                <th className="p-6 text-right">Verifikasi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-105 text-xs text-slate-700">
                            {proposals.map((prop) => (
                                <tr key={prop.id} className="hover:bg-gray-50/20 transition">
                                    <td className="p-6 font-extrabold text-slate-850">ORDER #{prop.order_id}</td>
                                    <td className="p-6 font-semibold">{prop.order?.user?.name || '-'}</td>
                                    <td className="p-6">
                                        <a href={prop.document_path} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline font-bold">
                                            📄 Buka Proposal (PDF)
                                        </a>
                                    </td>
                                    <td className="p-6 font-bold">
                                        Rp {prop.order ? parseFloat(prop.order.fare_amount).toLocaleString('id-ID') : '-'}
                                    </td>
                                    <td className="p-6">
                                        <span className={`px-2.5 py-1 rounded-full text-[9px] uppercase font-bold ${
                                            prop.review_status === 'approved' ? 'bg-emerald-50 text-emerald-600' :
                                            prop.review_status === 'rejected' ? 'bg-red-50 text-red-650' : 'bg-amber-50 text-amber-600'
                                        }`}>
                                            {prop.review_status}
                                        </span>
                                    </td>
                                    <td className="p-6 text-right">
                                        {prop.review_status === 'pending' && (
                                            <div>
                                                {activeProposalId === prop.id ? (
                                                    <div className="flex flex-col gap-2 p-4 bg-gray-50 rounded-xl text-left max-w-xs ml-auto border border-gray-200">
                                                        <div>
                                                            <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Pilih Armada</label>
                                                            <select
                                                                value={selectedAmbulanceId || ''}
                                                                onChange={(e) => setSelectedAmbulanceId(parseInt(e.target.value))}
                                                                className="w-full text-xs border rounded p-1 bg-white"
                                                            >
                                                                <option value="">-- Pilih Ambulans --</option>
                                                                {ambulances.map((amb) => (
                                                                    <option key={amb.id} value={amb.id}>
                                                                        {amb.plate_number} - {amb.category.toUpperCase()}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                        </div>

                                                        <div>
                                                            <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Alasan Penolakan (Jika ditolak)</label>
                                                            <textarea
                                                                value={rejectionReason}
                                                                onChange={(e) => setRejectionReason(e.target.value)}
                                                                className="w-full text-xs border rounded p-1"
                                                                rows={2}
                                                            />
                                                        </div>

                                                        <div className="flex gap-2 justify-end mt-2">
                                                             {activeRejectConfirmId === prop.id ? (
                                                                <div className="flex items-center gap-1.5 bg-red-50 p-1.5 rounded border border-red-200">
                                                                    <span className="text-[9px] font-bold text-red-700">Yakin Reject?</span>
                                                                    <button
                                                                        onClick={() => {
                                                                            handleVerifyProposal(prop.id, 'rejected');
                                                                            setActiveRejectConfirmId(null);
                                                                        }}
                                                                        className="bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded text-[8px] font-bold uppercase transition cursor-pointer"
                                                                    >
                                                                        Yes
                                                                    </button>
                                                                    <button
                                                                        onClick={() => setActiveRejectConfirmId(null)}
                                                                        className="bg-slate-200 hover:bg-slate-350 text-slate-700 px-2 py-1 rounded text-[8px] font-bold uppercase transition cursor-pointer"
                                                                    >
                                                                        No
                                                                    </button>
                                                                </div>
                                                            ) : (
                                                                <>
                                                                    <button
                                                                        onClick={() => handleVerifyProposal(prop.id, 'approved')}
                                                                        disabled={!selectedAmbulanceId}
                                                                        className="bg-emerald-650 text-white rounded px-2.5 py-1 text-[10px] font-bold uppercase disabled:opacity-50 transition cursor-pointer"
                                                                    >
                                                                        Approve
                                                                    </button>
                                                                    <button
                                                                        onClick={() => setActiveRejectConfirmId(prop.id)}
                                                                        className="bg-red-650 text-white rounded px-2.5 py-1 text-[10px] font-bold uppercase transition cursor-pointer"
                                                                    >
                                                                        Reject
                                                                    </button>
                                                                </>
                                                            )}
                                                            <button
                                                                onClick={() => setActiveProposalId(null)}
                                                                className="bg-gray-300 text-slate-800 rounded px-2.5 py-1 text-[10px] font-bold uppercase"
                                                            >
                                                                Batal
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <button
                                                        onClick={() => {
                                                            setActiveProposalId(prop.id);
                                                            setSelectedAmbulanceId(ambulances[0]?.id || null);
                                                        }}
                                                        className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-2 font-bold uppercase text-[9px] transition"
                                                    >
                                                        Tinjau Berkas
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </AppLayout>
    );
}
