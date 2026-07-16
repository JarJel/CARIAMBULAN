import { Head, usePage } from '@inertiajs/react';
import AppLayout from '../../layouts/AppLayout';
import Map, { MapMarker } from '../../components/Map';

interface Props {
    order: any;
}

export default function OrderDetail({ order }: Props) {
    const { auth } = usePage().props as any;
    const currentUser = auth?.user;
    const isStaff = currentUser && ['driver', 'nurse', 'hospital_admin', 'super_admin'].includes(currentUser.role);
    const getCoords = (point: any): [number, number] | null => {
        if (!point) return null;
        return [
            parseFloat(point.y ?? point.latitude ?? -6.917),
            parseFloat(point.x ?? point.longitude ?? 107.619)
        ];
    };

    const userCoords = getCoords(order.pickup_location) || [-6.917464, 107.619123];
    const destinationCoords = getCoords(order.destination_location);

    const markers: MapMarker[] = [
        {
            position: userCoords,
            title: 'Titik Penjemputan',
            popup: `<b>Penjemputan:</b><br/>${order.pickup_address}`,
            iconType: 'user'
        }
    ];

    if (destinationCoords) {
        markers.push({
            position: destinationCoords,
            title: 'Titik Tujuan',
            popup: `<b>Tujuan:</b><br/>${order.destination_address}`,
            iconType: 'user'
        });
    }

    // Tentukan perutean dinamis untuk ditampilkan pada peta detail
    let routingBetween: any = null;
    if (destinationCoords) {
        routingBetween = {
            start: userCoords,
            end: destinationCoords,
            color: '#0D9488'
        };
    }

    return (
        <AppLayout activeMenu="history">
            <Head title={`Detail Trip #${order.id} - AmbulanBDG`} />
            
            <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-xl font-black text-slate-800 tracking-tight">Detail Perjalanan #{order.id}</h1>
                        <p className="text-gray-500 text-[11px] mt-1">Informasi lengkap rute, kru, tarif, dan ulasan customer.</p>
                    </div>
                    <button 
                        onClick={() => window.history.back()}
                        className="text-xs font-bold text-slate-500 hover:text-slate-800 border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition"
                    >
                        &larr; Kembali
                    </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Kolom Kiri/Tengah: Map & Details */}
                    <div className="lg:col-span-2 space-y-6">
                        {/* Map View */}
                        <div className="w-full h-[250px] rounded-2xl overflow-hidden border border-slate-200 shadow-md relative z-0">
                            <Map center={userCoords} zoom={13} markers={markers} routingBetween={routingBetween} />
                        </div>

                        {/* Rincian Rute */}
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-md p-6 space-y-4">
                            <h3 className="font-extrabold text-sm border-b pb-3 uppercase tracking-wider text-slate-400">Rute Perjalanan</h3>
                            <div className="space-y-3 text-xs leading-relaxed">
                                <div>
                                    <span className="font-bold text-slate-400 uppercase text-[9px] tracking-wider block">Lokasi Penjemputan</span>
                                    <span className="font-semibold text-slate-700">{order.pickup_address}</span>
                                </div>
                                {order.destination_address && (
                                    <div>
                                        <span className="font-bold text-slate-400 uppercase text-[9px] tracking-wider block">Lokasi Tujuan</span>
                                        <span className="font-semibold text-slate-700">{order.destination_address}</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Informasi Medis & Observasi Pasien (Hanya untuk Driver/Staf Medis) */}
                        {isStaff && order.patient_detail && (
                            <div className="bg-white rounded-2xl border border-slate-200 shadow-md p-6 space-y-4">
                                <h3 className="font-extrabold text-sm border-b pb-3 uppercase tracking-wider text-slate-400">Data Medis & Observasi Pasien</h3>
                                <div className="space-y-3 text-xs leading-relaxed">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <span className="font-bold text-slate-400 uppercase text-[9px] tracking-wider block">Nama Pasien</span>
                                            <span className="font-semibold text-slate-700">{order.patient_detail.patient_name || '-'}</span>
                                        </div>
                                        <div>
                                            <span className="font-bold text-slate-400 uppercase text-[9px] tracking-wider block">Usia Pasien</span>
                                            <span className="font-semibold text-slate-700">
                                                {order.patient_detail.patient_age ? `${order.patient_detail.patient_age} Tahun` : '-'}
                                            </span>
                                        </div>
                                        {order.patient_detail.secondary_emergency_contact && (
                                            <div className="col-span-2">
                                                <span className="font-bold text-slate-400 uppercase text-[9px] tracking-wider block">Kontak Darurat Kedua</span>
                                                <span className="font-semibold text-slate-700">{order.patient_detail.secondary_emergency_contact}</span>
                                            </div>
                                        )}
                                        {order.patient_detail.condition_notes && (
                                            <div className="col-span-2 border-t pt-2">
                                                <span className="font-bold text-slate-400 uppercase text-[9px] tracking-wider block">Keluhan Pasien (Customer)</span>
                                                <p className="text-slate-600 italic bg-slate-50 p-2 rounded border mt-0.5">
                                                    "{order.patient_detail.condition_notes}"
                                                </p>
                                            </div>
                                        )}
                                    </div>

                                    {/* Vital Signs (Observasi Klinis) */}
                                    {(order.patient_detail.tensi || order.patient_detail.suhu || order.patient_detail.nadi || order.patient_detail.pernapasan || order.patient_detail.spo2) && (
                                        <div className="border-t pt-3 space-y-2">
                                            <span className="font-bold text-teal-600 dark:text-teal-400 uppercase text-[10px] tracking-wider block">🩺 Catatan Vital Sign (Kru Perawat)</span>
                                            <div className="grid grid-cols-2 gap-2 bg-slate-50 dark:bg-slate-900/30 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                                                {order.patient_detail.tensi && (
                                                    <div className="flex justify-between">
                                                        <span className="text-slate-500">Tensi Darah:</span>
                                                        <span className="font-bold text-slate-700 dark:text-slate-350">{order.patient_detail.tensi} mmHg</span>
                                                    </div>
                                                )}
                                                {order.patient_detail.suhu && (
                                                    <div className="flex justify-between">
                                                        <span className="text-slate-500">Suhu Badan:</span>
                                                        <span className="font-bold text-slate-700 dark:text-slate-350">{order.patient_detail.suhu} °C</span>
                                                    </div>
                                                )}
                                                {order.patient_detail.nadi && (
                                                    <div className="flex justify-between">
                                                        <span className="text-slate-500">Denyut Nadi:</span>
                                                        <span className="font-bold text-slate-700 dark:text-slate-350">{order.patient_detail.nadi} bpm</span>
                                                    </div>
                                                )}
                                                {order.patient_detail.pernapasan && (
                                                    <div className="flex justify-between">
                                                        <span className="text-slate-500">Laju Napas:</span>
                                                        <span className="font-bold text-slate-700 dark:text-slate-350">{order.patient_detail.pernapasan} x/menit</span>
                                                    </div>
                                                )}
                                                {order.patient_detail.spo2 && (
                                                    <div className="flex justify-between col-span-2 border-t pt-1 mt-1">
                                                        <span className="text-slate-500">Saturasi Oksigen (SpO2):</span>
                                                        <span className="font-bold text-slate-700 dark:text-slate-350">{order.patient_detail.spo2}%</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Kolom Kanan: Kru, Pembayaran & Ulasan */}
                    <div className="space-y-6">
                        {/* Status & Tarif */}
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-md p-6 space-y-4">
                            <div className="text-center pb-2 border-b">
                                <span className="text-[10px] uppercase font-bold text-gray-400">Status</span>
                                <h3 className="text-sm font-extrabold uppercase text-slate-700 mt-0.5">{order.status}</h3>
                            </div>
                            <div className="flex justify-between items-center text-xs">
                                <span className="text-slate-500 font-bold">Total Tarif</span>
                                <span className="text-sm font-black text-teal-600">
                                    {order.fare_amount == 0 ? 'GRATIS (Klaim BPJS/SOS)' : `Rp ${parseFloat(order.fare_amount).toLocaleString('id-ID')}`}
                                </span>
                            </div>
                        </div>

                        {/* Kru & Armada */}
                        {order.ambulance && (
                            <div className="bg-white rounded-2xl border border-slate-200 shadow-md p-6 space-y-3">
                                <h3 className="font-extrabold text-xs uppercase tracking-wider text-slate-400 border-b pb-2">Kru & Armada</h3>
                                <div className="space-y-2 text-xs">
                                    <div className="flex justify-between">
                                        <span className="text-slate-500">No. Plat</span>
                                        <span className="font-bold text-slate-700">{order.ambulance.plate_number}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-slate-500">Pengemudi</span>
                                        <span className="font-semibold text-slate-700">{order.ambulance.current_driver?.name || '-'}</span>
                                    </div>
                                    {order.ambulance.current_nurse && (
                                        <div className="flex justify-between">
                                            <span className="text-slate-500">Perawat</span>
                                            <span className="font-semibold text-slate-700">{order.ambulance.current_nurse?.name}</span>
                                        </div>
                                    )}
                                    <div className="flex justify-between">
                                        <span className="text-slate-500">Instansi</span>
                                        <span className="font-semibold text-slate-700">{order.ambulance.institution?.name || '-'}</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Ulasan Customer */}
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-md p-6 space-y-4">
                            <h3 className="font-extrabold text-xs uppercase tracking-wider text-slate-400 border-b pb-2">Ulasan Customer</h3>
                            {order.rating ? (
                                <div className="space-y-2">
                                    {/* Star Rating */}
                                    <div className="flex gap-0.5">
                                        {[1, 2, 3, 4, 5].map((star) => (
                                            <svg
                                                key={star}
                                                xmlns="http://www.w3.org/2000/svg"
                                                viewBox="0 0 24 24"
                                                fill={star <= order.rating.rating_value ? '#EAB308' : 'none'}
                                                stroke={star <= order.rating.rating_value ? '#EAB308' : '#94A3B8'}
                                                strokeWidth="2"
                                                className="w-4 h-4"
                                            >
                                                <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                                            </svg>
                                        ))}
                                    </div>
                                    {order.rating.review_text ? (
                                        <p className="text-xs text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-100 font-medium italic">
                                            "{order.rating.review_text}"
                                        </p>
                                    ) : (
                                        <p className="text-xs text-slate-400 italic">Diberikan rating tanpa catatan ulasan.</p>
                                    )}
                                </div>
                            ) : (
                                <div className="text-xs text-slate-450 italic text-center py-4 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                                    Belum ada ulasan dari customer.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </AppLayout>
    );
}
