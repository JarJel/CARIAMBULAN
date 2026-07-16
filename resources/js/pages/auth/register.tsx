import { useForm, Head, Link } from '@inertiajs/react';
import AppLayout from '../../layouts/AppLayout';

export default function Register() {
    const { data, setData, post, processing, errors } = useForm({
        name: '',
        email: '',
        phone: '',
        password: '',
        password_confirmation: '',
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        post('/register');
    };

    return (
        <AppLayout role="customer" activeMenu="">
            <Head title="DAFTAR AKUN BARU - SENTRAL AMBULAN" />
            <div className="flex items-center justify-center min-h-screen w-full bg-[#F8F9FA] p-6">
                <div className="w-full max-w-md bg-white border border-black p-8 space-y-6">
                    
                    {/* Brand & Heading dengan Gaya Tipografi Tegas */}
                    <div className="text-center space-y-1.5">
                        <span className="text-xs font-mono tracking-widest text-[#D9383A] block uppercase font-bold">
                            SENTRAL AMBULAN
                        </span>
                        <h2 className="font-black text-2xl tracking-tight uppercase text-[#1A1A1A]">
                            DAFTAR AKUN BARU
                        </h2>
                        <div className="w-12 h-0.5 bg-black mx-auto my-3"></div>
                        <p className="text-xs text-gray-500 font-mono uppercase tracking-tight">
                            Silakan isi formulir di bawah ini untuk membuat akun baru.
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        {/* Input Nama Lengkap */}
                        <div>
                            <label className="block text-xs font-black text-[#1A1A1A] uppercase tracking-wider mb-1.5">
                                Nama Lengkap
                            </label>
                            <input
                                type="text"
                                value={data.name}
                                onChange={(e) => setData('name', e.target.value)}
                                placeholder="MASUKKAN NAMA LENGKAP ANDA"
                                className="w-full rounded-none border border-gray-300 px-4 py-3 text-xs font-mono uppercase placeholder-gray-400 text-[#1A1A1A] bg-white focus:outline-none focus:border-black focus:ring-0 transition"
                                required
                            />
                            {errors.name && (
                                <span className="text-[10px] text-[#D9383A] font-mono font-bold uppercase mt-1.5 block">
                                    [ ERROR: {errors.name} ]
                                </span>
                            )}
                        </div>

                        {/* Input Email */}
                        <div>
                            <label className="block text-xs font-black text-[#1A1A1A] uppercase tracking-wider mb-1.5">
                                Email
                            </label>
                            <input
                                type="email"
                                value={data.email}
                                onChange={(e) => setData('email', e.target.value)}
                                placeholder="NAMA@EMAIL.COM"
                                className="w-full rounded-none border border-gray-300 px-4 py-3 text-xs font-mono uppercase placeholder-gray-400 text-[#1A1A1A] bg-white focus:outline-none focus:border-black focus:ring-0 transition"
                                required
                            />
                            {errors.email && (
                                <span className="text-[10px] text-[#D9383A] font-mono font-bold uppercase mt-1.5 block">
                                    [ ERROR: {errors.email} ]
                                </span>
                            )}
                        </div>

                        {/* Input Nomor Telepon */}
                        <div>
                            <label className="block text-xs font-black text-[#1A1A1A] uppercase tracking-wider mb-1.5">
                                Nomor Telepon
                            </label>
                            <input
                                type="text"
                                value={data.phone}
                                onChange={(e) => setData('phone', e.target.value)}
                                placeholder="CONTOH: 08123456789"
                                className="w-full rounded-none border border-gray-300 px-4 py-3 text-xs font-mono uppercase placeholder-gray-400 text-[#1A1A1A] bg-white focus:outline-none focus:border-black focus:ring-0 transition"
                                required
                            />
                            {errors.phone && (
                                <span className="text-[10px] text-[#D9383A] font-mono font-bold uppercase mt-1.5 block">
                                    [ ERROR: {errors.phone} ]
                                </span>
                            )}
                        </div>

                        {/* Input Kata Sandi */}
                        <div>
                            <label className="block text-xs font-black text-[#1A1A1A] uppercase tracking-wider mb-1.5">
                                Kata Sandi
                            </label>
                            <input
                                type="password"
                                value={data.password}
                                onChange={(e) => setData('password', e.target.value)}
                                placeholder="MASUKKAN KATA SANDI BARU"
                                className="w-full rounded-none border border-gray-300 px-4 py-3 text-xs font-mono uppercase placeholder-gray-400 text-[#1A1A1A] bg-white focus:outline-none focus:border-black focus:ring-0 transition"
                                required
                            />
                            {errors.password && (
                                <span className="text-[10px] text-[#D9383A] font-mono font-bold uppercase mt-1.5 block">
                                    [ ERROR: {errors.password} ]
                                </span>
                            )}
                        </div>

                        {/* Input Konfirmasi Kata Sandi */}
                        <div>
                            <label className="block text-xs font-black text-[#1A1A1A] uppercase tracking-wider mb-1.5">
                                Konfirmasi Kata Sandi
                            </label>
                            <input
                                type="password"
                                value={data.password_confirmation}
                                onChange={(e) => setData('password_confirmation', e.target.value)}
                                placeholder="MASUKKAN KEMBALI KATA SANDI"
                                className="w-full rounded-none border border-gray-300 px-4 py-3 text-xs font-mono uppercase placeholder-gray-400 text-[#1A1A1A] bg-white focus:outline-none focus:border-black focus:ring-0 transition"
                                required
                            />
                            {errors.password_confirmation && (
                                <span className="text-[10px] text-[#D9383A] font-mono font-bold uppercase mt-1.5 block">
                                    [ ERROR: {errors.password_confirmation} ]
                                </span>
                            )}
                        </div>

                        {/* Tombol Daftar Akun Utama */}
                        <button
                            type="submit"
                            disabled={processing}
                            className="w-full bg-[#D9383A] hover:bg-red-700 disabled:bg-red-400 text-white rounded-none py-4 text-xs font-black tracking-widest uppercase transition shadow-sm mt-2"
                        >
                            {processing ? 'MEMPROSES...' : 'DAFTAR AKUN SEKARANG'}
                        </button>
                    </form>

                    <hr className="border-gray-200" />

                    {/* Link Kembali ke Login */}
                    <div className="text-center text-xs font-mono uppercase tracking-tight text-gray-500">
                        Sudah memiliki akun?{' '}
                        <Link href="/login" className="font-black text-[#1A1A1A] hover:text-[#D9383A] underline underline-offset-4 decoration-1">
                            Masuk Disini
                        </Link>
                    </div>
                </div>
            </div>
        </AppLayout>
    );
}