import { useForm, Head, Link } from '@inertiajs/react';
import AppLayout from '../../layouts/AppLayout';

export default function Login() {
    const { data, setData, post, processing, errors } = useForm({
        email: '',
        password: '',
        remember: false,
    });

    // Menghilangkan anotasi tipe data TypeScript (: React.FormEvent) agar aman di React JS biasa
    const handleSubmit = (e) => {
        e.preventDefault();
        post('/login');
    };

    return (
        <AppLayout role="customer" activeMenu="">
            <Head title="MASUK AKUN - SENTRAL AMBULAN" />
            <div className="flex items-center justify-center min-h-screen w-full bg-[#F8F9FA] p-6">
                <div className="w-full max-w-md bg-white border border-black p-8 space-y-6">
                    
                    {/* Brand & Heading dengan Gaya Tipografi Tegas */}
                    <div className="text-center space-y-1.5">
                        <span className="text-xs font-mono tracking-widest text-[#D9383A] block uppercase font-bold">
                            SENTRAL AMBULAN
                        </span>
                        <h2 className="font-black text-2xl tracking-tight uppercase text-[#1A1A1A]">
                            MASUK AKUN
                        </h2>
                        <div className="w-12 h-0.5 bg-black mx-auto my-3"></div>
                        <p className="text-xs text-gray-500 font-mono uppercase tracking-tight">
                            Masukkan email dan kata sandi untuk melanjutkan.
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-5">
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

                        {/* Input Password */}
                        <div>
                            <label className="block text-xs font-black text-[#1A1A1A] uppercase tracking-wider mb-1.5">
                                Kata Sandi
                            </label>
                            <input
                                type="password"
                                value={data.password}
                                onChange={(e) => setData('password', e.target.value)}
                                placeholder="MASUKKAN KATA SANDI"
                                className="w-full rounded-none border border-gray-300 px-4 py-3 text-xs font-mono uppercase placeholder-gray-400 text-[#1A1A1A] bg-white focus:outline-none focus:border-black focus:ring-0 transition"
                                required
                            />
                            {errors.password && (
                                <span className="text-[10px] text-[#D9383A] font-mono font-bold uppercase mt-1.5 block">
                                    [ ERROR: {errors.password} ]
                                </span>
                            )}
                        </div>

                        {/* Remember Me Toggle */}
                        <div className="flex items-center justify-between text-xs font-mono uppercase tracking-tight">
                            <label className="flex items-center gap-2 cursor-pointer font-bold text-gray-600 hover:text-black">
                                <input
                                    type="checkbox"
                                    checked={data.remember}
                                    onChange={(e) => setData('remember', e.target.checked)}
                                    className="rounded-none border-gray-300 text-black focus:ring-0 focus:ring-offset-0 w-4 h-4"
                                />
                                Ingat Saya
                            </label>
                        </div>

                        {/* Tombol Submit Utama */}
                        <button
                            type="submit"
                            disabled={processing}
                            className="w-full bg-[#D9383A] hover:bg-red-700 disabled:bg-red-400 text-white rounded-none py-4 text-xs font-black tracking-widest uppercase transition shadow-sm"
                        >
                            {processing ? 'MEMPROSES...' : 'MASUK SEKARANG'}
                        </button>
                    </form>

                    <hr className="border-gray-200" />

                    {/* Link Pendaftaran */}
                    <div className="text-center text-xs font-mono uppercase tracking-tight text-gray-500">
                        Belum punya akun?{' '}
                        <Link href="/register" className="font-black text-[#1A1A1A] hover:text-[#D9383A] underline underline-offset-4 decoration-1">
                            Daftar Sekarang
                        </Link>
                    </div>
                </div>
            </div>
        </AppLayout>
    );
}