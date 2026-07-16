import { Head } from '@inertiajs/react';
import { useState } from 'react';
import AppLayout from '../../layouts/AppLayout';

interface Props {
    staff: any[];
    ambulances?: any[];
}

export default function AdminStaff({ staff, ambulances = [] }: Props) {
    const [message, setMessage] = useState<string | null>(null);

    // Form onboarding states
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [nik, setNik] = useState('');
    const [role, setRole] = useState('driver');
    const [defaultAmbulanceId, setDefaultAmbulanceId] = useState('');
    const [password, setPassword] = useState('');
    const [inviteLink, setInviteLink] = useState<string | null>(null);

    // Document file uploads
    const [ktpFile, setKtpFile] = useState<File | null>(null);
    const [simFile, setSimFile] = useState<File | null>(null);
    const [strFile, setStrFile] = useState<File | null>(null);

    // Device Management states
    const [showDeviceModal, setShowDeviceModal] = useState(false);
    const [activeStaffId, setActiveStaffId] = useState<number | null>(null);
    const [activeStaffName, setActiveStaffName] = useState('');
    const [sessions, setSessions] = useState<any[]>([]);

    const handleVerify = async (id: number, status: 'approved' | 'rejected') => {
        try {
            const res = await fetch(`/api/admin/staff/${id}/verify`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
                body: JSON.stringify({
                    verification_status: status,
                })
            });
            const data = await res.json();
            if (res.ok) {
                setMessage(`Verifikasi staff berhasil diperbarui menjadi ${status}.`);
                window.location.reload();
            } else {
                setMessage(data.message || 'Gagal memproses verifikasi.');
            }
        } catch (err) {
            setMessage('Kesalahan koneksi ke server.');
        }
    };

    const handleCreateStaff = async (e: React.FormEvent) => {
        e.preventDefault();
        setMessage(null);
        setInviteLink(null);

        const formData = new FormData();
        formData.append('name', name);
        formData.append('email', email);
        formData.append('phone', phone);
        formData.append('nik', nik);
        formData.append('role', role);
        formData.append('default_ambulance_id', defaultAmbulanceId);
        formData.append('password', password);

        if (ktpFile) formData.append('ktp_file', ktpFile);
        if (simFile) formData.append('sim_file', simFile);
        if (strFile) formData.append('str_file', strFile);

        try {
            const res = await fetch('/api/admin/staff', {
                method: 'POST',
                body: formData,
                headers: { 'Accept': 'application/json' }
            });
            const data = await res.json();
            if (res.ok) {
                setMessage('Staf baru berhasil didaftarkan.');
                setInviteLink(data.invitation_link);
                // Reset form fields
                setName('');
                setEmail('');
                setPhone('');
                setNik('');
                setDefaultAmbulanceId('');
                setPassword('');
                setKtpFile(null);
                setSimFile(null);
                setStrFile(null);
            } else {
                setMessage(JSON.stringify(data.errors) || data.message || 'Gagal membuat staf.');
            }
        } catch (err) {
            setMessage('Kesalahan koneksi ke server.');
        }
    };

    const handleDeactivate = async (id: number) => {
        setMessage(null);
        try {
            const res = await fetch(`/api/admin/staff/${id}/deactivate`, {
                method: 'POST',
                headers: { 'Accept': 'application/json' }
            });
            const data = await res.json();
            if (res.ok) {
                setMessage(data.message);
                window.location.reload();
            } else {
                setMessage(data.message || 'Gagal merubah status staf.');
            }
        } catch (err) {
            setMessage('Koneksi gagal.');
        }
    };

    const fetchSessions = async (staffId: number, staffName: string) => {
        setActiveStaffId(staffId);
        setActiveStaffName(staffName);
        setSessions([]);
        try {
            const res = await fetch(`/api/admin/staff/${staffId}/sessions`);
            const data = await res.json();
            if (res.ok) {
                setSessions(data.sessions || []);
                setShowDeviceModal(true);
            } else {
                setMessage(data.message || 'Gagal mendapatkan data device.');
            }
        } catch (err) {
            setMessage('Koneksi gagal.');
        }
    };

    const handleForceLogout = async (sessionId: string) => {
        if (!activeStaffId) return;
        try {
            const res = await fetch(`/api/admin/staff/${activeStaffId}/logout-device`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({ session_id: sessionId })
            });
            if (res.ok) {
                setSessions(sessions.filter(sess => sess.id !== sessionId));
            } else {
                alert('Gagal mengeluarkan device.');
            }
        } catch (err) {
            console.error(err);
        }
    };

    return (
        <AppLayout activeMenu="staff">
            <Head title="Kelola Staf & Lisensi - Admin" />
            
            <div className="max-w-7xl mx-auto px-6 py-10 space-y-8">
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl font-black text-slate-800 tracking-tight">Kru Medis & Pengemudi</h1>
                        <p className="text-gray-500 text-xs mt-1">Daftar personel Driver dan Nurse instansi, lengkap dengan status verifikasi SIM/STR.</p>
                    </div>
                    <button 
                        onClick={() => {
                            setInviteLink(null);
                            setShowCreateModal(true);
                        }}
                        className="bg-teal-700 text-white rounded-xl px-5 py-3 text-xs font-bold shadow uppercase transition"
                    >
                        + Daftarkan Personel Baru
                    </button>
                </div>

                {message && (
                    <div className="p-4 bg-teal-50 text-teal-800 rounded-xl text-xs font-semibold">
                        {message}
                    </div>
                )}

                {/* SHOW INVITATION LINK AFTER CREATION */}
                {inviteLink && (
                    <div className="p-5 bg-amber-50 border border-amber-250 text-amber-900 rounded-2xl space-y-3 text-xs animate-fadeIn">
                        <div className="font-bold flex items-center gap-1.5 text-sm text-amber-800">
                            🔑 Akun Staf Terdaftar - Tautan Undangan Aktivasi
                        </div>
                        <p>Salin tautan ini dan kirimkan ke kru bersangkutan agar mereka dapat melengkapi pendaftaran serta menetapkan password masuk.</p>
                        <div className="flex items-center gap-3 bg-white p-3 rounded-lg border border-amber-200">
                            <input 
                                readOnly 
                                value={inviteLink} 
                                className="flex-1 bg-transparent font-mono text-slate-700 border-none outline-none select-all" 
                            />
                            <button 
                                onClick={() => {
                                    navigator.clipboard.writeText(inviteLink);
                                    alert('Link undangan disalin!');
                                }}
                                className="bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 rounded font-black uppercase text-[10px]"
                            >
                                Salin Link
                            </button>
                        </div>
                    </div>
                )}

                <div className="bg-white rounded-3xl border border-gray-100 shadow-xl overflow-hidden">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-150 text-[10px] font-black uppercase text-gray-500 tracking-wider">
                                <th className="p-6">Nama Staff</th>
                                <th className="p-6">NIK & Telepon</th>
                                <th className="p-6">Role</th>
                                <th className="p-6">Detail Lisensi (SIM/STR)</th>
                                <th className="p-6">Status Akun</th>
                                <th className="p-6 text-right">Aksi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-105 text-xs text-slate-700">
                            {staff.map((member) => (
                                <tr key={member.id} className={`hover:bg-gray-50/20 transition ${member.deactivated_at ? 'bg-red-50/10 opacity-70' : ''}`}>
                                    <td className="p-6">
                                        <span className="font-extrabold text-slate-850 block">{member.name}</span>
                                        <span className="text-[10px] text-gray-400 font-mono block mt-0.5">{member.email}</span>
                                    </td>
                                    <td className="p-6">
                                        <p className="font-mono text-slate-600">NIK: {member.nik || '-'}</p>
                                        <p className="text-slate-400 mt-0.5">📞 {member.phone || '-'}</p>
                                    </td>
                                    <td className="p-6">
                                        <span className="uppercase text-[9px] font-extrabold bg-slate-100 text-slate-650 px-2 py-0.5 rounded">
                                            {member.role}
                                        </span>
                                    </td>
                                    <td className="p-6">
                                        {member.staff_profile ? (
                                            <div>
                                                <p className="font-bold">{member.staff_profile.license_number}</p>
                                                <div className="flex gap-2 items-center mt-1">
                                                    <span className={`text-[9px] uppercase font-bold px-2 py-0.5 rounded ${
                                                        member.staff_profile.verification_status === 'approved' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
                                                    }`}>
                                                        {member.staff_profile.verification_status}
                                                    </span>
                                                    <span className="text-[10px] text-slate-400 font-mono">Exp: {member.staff_profile.license_expiry || '-'}</span>
                                                </div>
                                            </div>
                                        ) : (
                                            <span className="text-gray-450 italic">Profil lisensi belum diisi</span>
                                        )}
                                    </td>
                                    <td className="p-6">
                                        {member.deactivated_at ? (
                                            <span className="text-[10px] bg-red-100 text-red-800 font-bold px-2 py-1 rounded">Blokir / Nonaktif</span>
                                        ) : (
                                            <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-1 rounded">Aktif</span>
                                        )}
                                    </td>
                                    <td className="p-6 text-right space-y-2">
                                        <div className="flex justify-end gap-2">
                                            <button 
                                                onClick={() => fetchSessions(member.id, member.name)}
                                                className="bg-slate-800 text-white rounded px-2.5 py-1.5 font-bold uppercase text-[9px] hover:bg-slate-700 transition"
                                            >
                                                📱 Devices
                                            </button>
                                            <button 
                                                onClick={() => handleDeactivate(member.id)}
                                                className={`rounded px-2.5 py-1.5 font-bold uppercase text-[9px] text-white transition ${member.deactivated_at ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-red-650 hover:bg-red-550'}`}
                                            >
                                                {member.deactivated_at ? 'Aktifkan' : 'Blokir'}
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* MODAL ONBOARDING PERSONAL BARU */}
            {showCreateModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl space-y-4 my-8">
                        <div className="text-center">
                            <h3 className="font-extrabold text-base">Registrasi & Undang Kru Medis</h3>
                            <p className="text-xs text-slate-450 mt-1">Daftarkan kru baru untuk mendapatkan link aktivasi login mandiri.</p>
                        </div>
                        <form onSubmit={handleCreateStaff} className="space-y-4 text-xs">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block font-bold text-slate-500 mb-1">Nama Lengkap</label>
                                    <input type="text" required placeholder="dr. Ahmad Suhendar" value={name} onChange={(e) => setName(e.target.value)} className="w-full border rounded-lg p-2" />
                                </div>
                                <div>
                                    <label className="block font-bold text-slate-500 mb-1">Alamat Email</label>
                                    <input type="email" required placeholder="ahmad@fasyankes.net" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full border rounded-lg p-2" />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block font-bold text-slate-500 mb-1">NIK (16 Digit KTP)</label>
                                    <input type="text" required maxLength={16} placeholder="32731xxxxxxxxxxx" value={nik} onChange={(e) => setNik(e.target.value)} className="w-full border rounded-lg p-2" />
                                </div>
                                <div>
                                    <label className="block font-bold text-slate-500 mb-1">Nomor Telepon</label>
                                    <input type="tel" required placeholder="08123456789" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full border rounded-lg p-2" />
                                </div>
                            </div>
                            
                            <div>
                                <label className="block font-bold text-slate-500 mb-1">Kata Sandi (Password Login Staf)</label>
                                <input type="password" required minLength={8} placeholder="Ketik kata sandi minimal 8 karakter..." value={password} onChange={(e) => setPassword(e.target.value)} className="w-full border rounded-lg p-2" />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block font-bold text-slate-500 mb-1">Spesialisasi Role Staf</label>
                                    <select value={role} onChange={(e) => setRole(e.target.value)} className="w-full border rounded-lg p-2 bg-white">
                                        <option value="driver">🚘 Pengemudi (Driver)</option>
                                        <option value="nurse">🩺 Perawat (Nurse)</option>
                                        <option value="dual">⚙️ Dual-Role (Driver & Nurse)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block font-bold text-slate-500 mb-1">Default Ambulans Terikat (Opsional)</label>
                                    <select value={defaultAmbulanceId} onChange={(e) => setDefaultAmbulanceId(e.target.value)} className="w-full border rounded-lg p-2 bg-white">
                                        <option value="">Tidak terikat kendaraan</option>
                                        {ambulances.map(amb => (
                                            <option key={amb.id} value={amb.id}>{amb.plate_number} - {amb.brand}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="space-y-3 bg-slate-50 p-4 rounded-xl">
                                <span className="font-black text-[10px] text-slate-400 block uppercase">Unggah Dokumen Sertifikasi Staf</span>
                                <div>
                                    <label className="block font-bold mb-0.5">Unggah Foto KTP (Wajib)</label>
                                    <input type="file" required onChange={(e) => setKtpFile(e.target.files?.[0] || null)} className="w-full text-xs" />
                                </div>
                                {['driver', 'dual'].includes(role) && (
                                    <div>
                                        <label className="block font-bold mb-0.5">Unggah Foto Lisensi SIM A/B (Driver)</label>
                                        <input type="file" required onChange={(e) => setSimFile(e.target.files?.[0] || null)} className="w-full text-xs" />
                                    </div>
                                )}
                                {['nurse', 'dual'].includes(role) && (
                                    <div>
                                        <label className="block font-bold mb-0.5">Unggah Surat Tanda Registrasi STR (Nurse)</label>
                                        <input type="file" required onChange={(e) => setStrFile(e.target.files?.[0] || null)} className="w-full text-xs" />
                                    </div>
                                )}
                            </div>

                            <div className="flex gap-3 pt-2">
                                <button 
                                    type="button" 
                                    onClick={() => setShowCreateModal(false)}
                                    className="flex-1 py-2 font-bold bg-slate-100 rounded-lg"
                                >
                                    Batal
                                </button>
                                <button 
                                    type="submit" 
                                    className="flex-1 py-2 font-bold bg-teal-700 text-white rounded-lg shadow-md"
                                >
                                    Daftarkan & Generate Token
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL DEVICE / SESSIONS MANAGEMENT */}
            {showDeviceModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
                        <div className="text-center">
                            <h3 className="font-extrabold text-base">📱 Device Aktif Staf</h3>
                            <p className="text-xs text-slate-400 mt-1">Daftar sesi/login aktif untuk kru: <strong>{activeStaffName}</strong></p>
                        </div>
                        <div className="space-y-3 max-h-[250px] overflow-y-auto pr-1 text-xs">
                            {sessions.length === 0 ? (
                                <p className="text-center text-slate-400 italic py-4">Staf sedang tidak masuk/aktif pada perangkat manapun.</p>
                            ) : (
                                sessions.map((sess) => (
                                    <div key={sess.id} className="p-3 bg-slate-50 dark:bg-slate-950/20 border border-slate-150 rounded-xl flex items-center justify-between">
                                        <div className="space-y-1">
                                            <p className="font-bold text-slate-700">{sess.ip_address}</p>
                                            <p className="text-[10px] text-slate-400 truncate max-w-[200px]">{sess.device}</p>
                                            <p className="text-[10px] text-slate-450 font-mono">Aktif: {new Date(sess.last_active).toLocaleString()}</p>
                                        </div>
                                        <button 
                                            onClick={() => handleForceLogout(sess.id)}
                                            className="bg-red-50 text-red-650 hover:bg-red-100 px-2 py-1 rounded font-bold uppercase text-[9px] transition"
                                        >
                                            Logout
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                        <button 
                            onClick={() => setShowDeviceModal(false)}
                            className="w-full py-2 font-bold bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs"
                        >
                            Tutup
                        </button>
                    </div>
                </div>
            )}
        </AppLayout>
    );
}
