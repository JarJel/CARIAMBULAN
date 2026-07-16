import { useState } from 'react';
import { Link, usePage } from '@inertiajs/react';

interface AppLayoutProps {
    children: React.ReactNode;
    activeMenu?: string;
}

export default function AppLayout({ children, activeMenu = '' }: AppLayoutProps) {
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    // Dapatkan data autentikasi global dari share props Inertia
    const { auth } = usePage().props as any;
    const currentUser = auth?.user || null;
    const resolvedRole = currentUser?.role || 'customer';

    // Daftar link berdasarkan peran dan status masuk
    const getNavLinks = () => {
        if (!currentUser) {
            // Guest Links
            return [
                { name: 'Cari Ambulans', url: '/', key: 'booking' },
            ];
        }

        switch (resolvedRole) {
            case 'super_admin':
                return [
                    { name: 'Dashboard', url: '/superadmin/dashboard', key: 'dashboard' },
                    { name: 'Institusi', url: '/superadmin/institutions', key: 'institutions' },
                    { name: 'Armada', url: '/superadmin/ambulances', key: 'ambulances' },
                    { name: 'Pengguna', url: '/superadmin/users', key: 'users' },
                    { name: 'Verifikasi Mitra', url: '/superadmin/approvals', key: 'approvals' },
                    { name: 'Audit Logs', url: '/superadmin/audit-logs', key: 'audit-logs' },
                    { name: 'Portal Utama', url: '/', key: 'home' }
                ];
            case 'institution_admin':
                return [
                    { name: 'Dashboard', url: '/admin/dashboard', key: 'dashboard' },
                    { name: 'Armada', url: '/admin/ambulances', key: 'ambulances' },
                    { name: 'Staf', url: '/admin/staff', key: 'staff' },
                    { name: 'Proposal Event', url: '/admin/proposals', key: 'proposals' },
                    { name: 'Dokumen', url: '/admin/documents', key: 'documents' },
                    { name: 'Audit Logs', url: '/admin/logs', key: 'logs' },
                    { name: 'Portal Utama', url: '/', key: 'home' }
                ];
            case 'driver':
                return [
                    { name: 'Tugas Aktif', url: '/driver/dashboard', key: 'dashboard' },
                    { name: 'Riwayat Trip', url: '/driver/history', key: 'history' },
                    { name: 'Profil SIM', url: '/driver/profile', key: 'profile' },
                    { name: 'Portal Utama', url: '/', key: 'home' }
                ];
            case 'nurse':
                return [
                    { name: 'Tugas Aktif', url: '/nurse/dashboard', key: 'dashboard' },
                    { name: 'Riwayat Pendampingan', url: '/nurse/history', key: 'history' },
                    { name: 'Profil STR', url: '/nurse/profile', key: 'profile' },
                    { name: 'Portal Utama', url: '/', key: 'home' }
                ];
            case 'customer':
            default:
                return [
                    { name: 'Radar Ambulans', url: '/', key: 'booking' },
                    { name: 'Dashboard Saya', url: '/customer/dashboard', key: 'dashboard' },
                    { name: 'Pesanan Saya', url: '/customer/orders', key: 'orders' },
                    { name: 'Profil', url: '/customer/profile', key: 'profile' },
                    { name: 'Notifikasi', url: '/customer/notifications', key: 'notifications' }
                ];
        }
    };

    const links = getNavLinks();

    return (
        <div className="flex flex-col min-h-screen bg-white text-[#1A1A1A] font-sans">
            
            {/* 1. HEADER & NAVIGASI */}
            <header className="border-b border-gray-250 bg-white sticky top-0 z-50 h-20 shrink-0">
                <div className="max-w-7xl mx-auto px-6 h-full flex items-center justify-between">
                    {/* Brand Logo & Tagline */}
                    <Link href="/" className="flex flex-col justify-center">
                        <span className="text-xl font-black tracking-wider block text-black">CARI AMBULAN</span>
                        <span className="text-[10px] text-gray-500 font-medium tracking-tight">Layanan Ambulans Terintegrasi Bandung</span>
                    </Link>
                    
                    {/* Desktop Navigation Links */}
                    <nav className="hidden md:flex items-center space-x-8 text-sm font-semibold tracking-wide">
                        {links.map((link) => {
                            const isActive = activeMenu === link.key;
                            return (
                                <Link
                                    key={link.key}
                                    href={link.url}
                                    className={isActive ? "text-[#D9383A] transition" : "text-gray-600 hover:text-black transition"}
                                >
                                    {link.name}
                                </Link>
                            );
                        })}
                    </nav>

                    {/* Desktop Auth Section */}
                    <div className="hidden md:flex items-center gap-4">
                        {currentUser ? (
                            <div className="flex items-center gap-4 text-xs">
                                <div className="text-right">
                                    <span className="block font-black text-[#1A1A1A]">{currentUser.name.toUpperCase()}</span>
                                    <span className="block text-[9px] text-gray-400 font-bold uppercase tracking-widest">{currentUser.role}</span>
                                </div>
                                <div className="h-6 w-px bg-gray-200" />
                                <Link
                                    href="/logout"
                                    method="post"
                                    as="button"
                                    className="border border-[#D9383A] text-[#D9383A] px-4 py-2 text-xs font-bold tracking-widest uppercase hover:bg-[#D9383A] hover:text-white transition duration-200"
                                >
                                    Keluar
                                </Link>
                            </div>
                        ) : (
                            <div className="flex gap-2">
                                <Link
                                    href="/login"
                                    className="border border-black px-5 py-2.5 text-xs font-bold tracking-widest uppercase hover:bg-black hover:text-white transition duration-200"
                                >
                                    Masuk
                                </Link>
                                <Link
                                    href="/register"
                                    className="bg-black text-white px-5 py-2.5 text-xs font-bold tracking-widest uppercase hover:bg-gray-900 transition duration-200"
                                >
                                    Daftar
                                </Link>
                            </div>
                        )}
                    </div>

                    {/* Mobile menu toggle */}
                    <button
                        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                        className="md:hidden text-xs font-bold border border-black px-3 py-1.5 uppercase hover:bg-black hover:text-white transition"
                    >
                        {isMobileMenuOpen ? 'Tutup' : 'Menu'}
                    </button>
                </div>
            </header>

            {/* Mobile Navigation Dropdown */}
            {isMobileMenuOpen && (
                <div className="md:hidden fixed inset-0 top-20 bg-slate-900/60 backdrop-blur-sm z-40 transition-opacity">
                    <aside className="w-full bg-white p-6 border-b border-gray-250 animate-slide-down max-h-[85vh] overflow-y-auto">
                        <nav className="flex flex-col gap-4 text-sm font-semibold uppercase tracking-wider mb-6">
                            {links.map((link) => {
                                const isActive = activeMenu === link.key;
                                return (
                                    <Link
                                        key={link.key}
                                        href={link.url}
                                        onClick={() => setIsMobileMenuOpen(false)}
                                        className={isActive ? "text-[#D9383A]" : "text-gray-600 hover:text-black"}
                                    >
                                        {link.name}
                                    </Link>
                                );
                            })}
                        </nav>

                        <div className="border-t border-gray-150 pt-5">
                            {currentUser ? (
                                <div className="flex justify-between items-center">
                                    <div>
                                        <span className="block text-xs font-black text-[#1A1A1A]">{currentUser.name.toUpperCase()}</span>
                                        <span className="block text-[9px] text-gray-400 font-bold uppercase tracking-widest">{currentUser.role}</span>
                                    </div>
                                    <Link
                                        href="/logout"
                                        method="post"
                                        as="button"
                                        onClick={() => setIsMobileMenuOpen(false)}
                                        className="border border-[#D9383A] text-[#D9383A] px-4 py-2 text-xs font-bold tracking-widest uppercase hover:bg-[#D9383A] hover:text-white transition duration-200"
                                    >
                                        Keluar
                                    </Link>
                                </div>
                            ) : (
                                <div className="flex gap-3">
                                    <Link
                                        href="/login"
                                        onClick={() => setIsMobileMenuOpen(false)}
                                        className="flex-1 text-center border border-black py-2.5 text-xs font-bold tracking-widest uppercase hover:bg-black hover:text-white transition"
                                    >
                                        Masuk
                                    </Link>
                                    <Link
                                        href="/register"
                                        onClick={() => setIsMobileMenuOpen(false)}
                                        className="flex-1 text-center bg-black text-white py-2.5 text-xs font-bold tracking-widest uppercase hover:bg-gray-900 transition"
                                    >
                                        Daftar
                                    </Link>
                                </div>
                            )}
                        </div>
                    </aside>
                </div>
            )}

            {/* Main content body */}
            <main className="flex-1 w-full relative">
                {children}
            </main>
        </div>
    );
}
