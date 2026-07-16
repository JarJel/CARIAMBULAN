import { useState, useEffect } from 'react';
import { Head, router } from '@inertiajs/react';
import { useEcho, echo } from '@laravel/echo-react';
import AppLayout from '../../layouts/AppLayout';
import Map, { MapMarker } from '../../components/Map';

interface TrackingProps {
    order: any;
    isGuest?: boolean;
    guestToken?: string;
}

export default function Tracking({ order, isGuest = false, guestToken = '' }: TrackingProps) {
    const echoInstance = echo();

    // 1. Order & Location States
    const [orderData, setOrderData] = useState(order);
    const [ambulanceCoords, setAmbulanceCoords] = useState<[number, number] | null>(null);
    const [trackingSignalLost, setTrackingSignalLost] = useState(!!order.tracking_lost_notified_at);
    const [routeEta, setRouteEta] = useState<number | null>(null);
    const [routeDistance, setRouteDistance] = useState<number | null>(null);

    // 2. Rating Form States
    const [ratingValue, setRatingValue] = useState(5);
    const [reviewText, setReviewText] = useState('');
    const [ratingSubmitted, setRatingSubmitted] = useState(false);
    const [ratingMessage, setRatingMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // 3. Patient Details Form States
    const [patientName, setPatientName] = useState(order.patient_detail?.patient_name || '');
    const [patientAge, setPatientAge] = useState(order.patient_detail?.patient_age?.toString() || '');
    const [conditionNotes, setConditionNotes] = useState(order.patient_detail?.condition_notes || '');
    const [secondaryContact, setSecondaryContact] = useState(order.patient_detail?.secondary_emergency_contact || '');
    const [patientSaved, setPatientSaved] = useState(false);
    const [patientMessage, setPatientMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // 4. Inline Payment Form States
    const [paymentMethod, setPaymentMethod] = useState('qris');
    const [paymentMessage, setPaymentMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // 5. Account Registration Form States
    const [regName, setRegName] = useState('');
    const [regEmail, setRegEmail] = useState('');
    const [regPassword, setRegPassword] = useState('');
    const [regMessage, setRegMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [regSuccess, setRegSuccess] = useState(false);

    // Sinkronisasi data saat Inertia reload prop 'order'
    useEffect(() => {
        setOrderData(order);
        setTrackingSignalLost(!!order.tracking_lost_notified_at);
        if (order.patient_detail) {
            setPatientName(order.patient_detail.patient_name || '');
            setPatientAge(order.patient_detail.patient_age?.toString() || '');
            setConditionNotes(order.patient_detail.condition_notes || '');
            setSecondaryContact(order.patient_detail.secondary_emergency_contact || '');
        }
    }, [order]);

    // Parse koordinat ambulans & tujuan di awal
    useEffect(() => {
        if (orderData.ambulance) {
            setAmbulanceCoords([
                orderData.ambulance.latitude ? parseFloat(orderData.ambulance.latitude) : -6.917,
                orderData.ambulance.longitude ? parseFloat(orderData.ambulance.longitude) : 107.619
            ]);
        }
    }, [orderData]);

    // 1. Fallback Polling (10s): Silent polling in case WebSocket fails
    useEffect(() => {
        if (['completed', 'cancelled'].includes(orderData.status)) return;

        const fallbackPoll = async () => {
            try {
                const headers: HeadersInit = { 'Accept': 'application/json' };
                if (isGuest && guestToken) {
                    headers['X-Guest-Token'] = guestToken;
                }
                const url = isGuest 
                    ? `/api/orders/${orderData.id}?token=${guestToken}`
                    : `/api/orders/${orderData.id}`;

                const res = await fetch(url, { headers });
                if (res.ok) {
                    const data = await res.json();
                    if (data.order) {
                        setOrderData(data.order);
                        if (data.order.ambulance) {
                            setAmbulanceCoords([
                                data.order.ambulance.latitude ? parseFloat(data.order.ambulance.latitude) : -6.917,
                                data.order.ambulance.longitude ? parseFloat(data.order.ambulance.longitude) : 107.619
                            ]);
                            setTrackingSignalLost(!!data.order.tracking_lost_notified_at);
                        }
                    }
                }
            } catch (err) {
                console.error("Fallback polling failed:", err);
            }
        };

        const interval = setInterval(fallbackPoll, 10000);
        return () => clearInterval(interval);
    }, [orderData.id, orderData.status, isGuest, guestToken]);

    // Ekstraksi Koordinat User (Pickup) & Destination
    const getCoords = (point: any): [number, number] | null => {
        if (!point) return null;
        return [
            parseFloat(point.y ?? point.latitude ?? -6.917),
            parseFloat(point.x ?? point.longitude ?? 107.619)
        ];
    };

    const userCoords = orderData.pickup_latitude && orderData.pickup_longitude
        ? [parseFloat(orderData.pickup_latitude), parseFloat(orderData.pickup_longitude)] as [number, number]
        : getCoords(orderData.pickup_location) || [-6.917464, 107.619123];

    const destinationCoords = orderData.destination_latitude && orderData.destination_longitude
        ? [parseFloat(orderData.destination_latitude), parseFloat(orderData.destination_longitude)] as [number, number]
        : getCoords(orderData.destination_location);

    // Tentukan perutean dinamis berdasarkan status untuk ditampilkan pada peta pengguna
    let routingBetween: any = null;
    if (ambulanceCoords) {
        if (['confirmed', 'on_the_way', 'arrived'].includes(orderData.status)) {
            routingBetween = {
                start: ambulanceCoords,
                end: userCoords,
                color: '#D9383A' // Merah: Ambulans meluncur ke lokasi jemput
            };
        } else if (orderData.status === 'transporting' && destinationCoords) {
            routingBetween = {
                start: ambulanceCoords,
                end: destinationCoords,
                color: '#0D9488' // Teal: Ambulans membawa pasien ke rumah sakit tujuan
            };
        }
    }

    // OSRM Real Routing Calculator for ETA & Distance
    useEffect(() => {
        if (!routingBetween) {
            setRouteEta(null);
            setRouteDistance(null);
            return;
        }

        const fetchRouteEta = async () => {
            try {
                const { start, end } = routingBetween;
                // OSRM format: lng,lat;lng,lat
                const url = `https://router.project-osrm.org/route/v1/driving/${start[1]},${start[0]};${end[1]},${end[0]}?overview=false`;
                const res = await fetch(url);
                if (res.ok) {
                    const data = await res.json();
                    if (data.routes && data.routes.length > 0) {
                        const route = data.routes[0];
                        setRouteEta(Math.round(route.duration / 60));
                        setRouteDistance(parseFloat((route.distance / 1000).toFixed(1)));
                    }
                }
            } catch (err) {
                console.error("Gagal mendapatkan rute OSRM:", err);
            }
        };

        fetchRouteEta();
    }, [routingBetween, ambulanceCoords]);

    // 2. WebSocket Listener: Berlangganan koordinat GPS ter-update dari driver
    useEffect(() => {
        if (!echoInstance || ['completed', 'cancelled'].includes(orderData.status)) return;

        const channelName = isGuest 
            ? `orders.guest.${orderData.id}.${guestToken}` 
            : `orders.${orderData.id}`;

        const channel = isGuest 
            ? echoInstance.channel(channelName) 
            : echoInstance.private(channelName);

        channel
            .listen('.location.updated', (e: any) => {
                setAmbulanceCoords([parseFloat(e.latitude), parseFloat(e.longitude)]);
                setTrackingSignalLost(false);
            })
            .listen('.status.updated', (e: any) => {
                setOrderData((prev: any) => ({
                    ...prev,
                    status: e.status,
                    ambulance: e.ambulance ?? prev.ambulance,
                    patient_detail: e.order?.patient_detail ?? prev.patient_detail,
                    payment: e.order?.payment ?? prev.payment
                }));
                setTrackingSignalLost(false);
            })
            .listen('.signal.lost', (e: any) => {
                setTrackingSignalLost(true);
            });

        return () => {
            channel.stopListening('.location.updated');
            channel.stopListening('.status.updated');
            channel.stopListening('.signal.lost');
        };
    }, [echoInstance, orderData.id, orderData.status, isGuest, guestToken]);



    // Kumpulkan markers peta
    const markers: MapMarker[] = [
        {
            position: userCoords,
            title: 'Lokasi Anda (Penjemputan)',
            popup: `<b>Lokasi Jemput Anda:</b><br/>${orderData.pickup_address}`,
            iconType: 'user'
        }
    ];

    if (destinationCoords) {
        markers.push({
            position: destinationCoords,
            title: 'Rumah Sakit / Tujuan',
            popup: `<b>Tujuan Medis:</b><br/>${orderData.destination_address}`,
            iconType: 'user'
        });
    }

    if (ambulanceCoords) {
        markers.push({
            position: ambulanceCoords,
            title: `Ambulans ${orderData.ambulance?.plate_number || 'Siaga'}`,
            popup: `<b>Ambulans ${orderData.ambulance?.plate_number || ''}</b><br/>Kru Driver: ${orderData.ambulance?.current_driver?.name || 'Mencari'}`,
            iconType: orderData.ambulance?.category === 'emergency' ? 'ambulance_emergency' : 'ambulance_non_emergency'
        });
    }

    const mapCenter = ambulanceCoords || userCoords;

    const getStatusLabel = (status: string) => {
        switch (status) {
            case 'pending': return 'Menunggu Konfirmasi Sistem';
            case 'awaiting_driver_response': return 'Menunggu Konfirmasi Driver (SOS)';
            case 'no_ambulance_available': return 'Tidak Ada Ambulans Tersedia (Hubungi 112/119)';
            case 'confirmed': return 'Telah Dikonfirmasi (Driver Sedang Siaga)';
            case 'on_the_way': return 'Ambulans Sedang Menuju ke Lokasi Anda';
            case 'arrived': return 'Ambulans Telah Tiba di Lokasi Anda';
            case 'transporting': return 'Dalam Perjalanan Menuju Rumah Sakit/Tujuan';
            case 'completed': return 'Perjalanan Selesai';
            case 'cancelled': return 'Dibatalkan';
            default: return status;
        }
    };



    // Submit rating/feedback
    const handleRatingSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setRatingMessage(null);
        try {
            const res = await fetch(`/api/orders/${orderData.id}/rating`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify({ 
                    rating_value: ratingValue, 
                    review_text: reviewText,
                    guest_session_token: guestToken
                })
            });
            const data = await res.json();
            if (res.status === 201) {
                setRatingSubmitted(true);
            } else {
                setRatingMessage({ type: 'error', text: data.message || 'Gagal mengirim ulasan.' });
            }
        } catch (err) {
            setRatingMessage({ type: 'error', text: 'Kesalahan jaringan saat mengirim ulasan.' });
        }
    };

    // Submit Data Medis Pasien
    const handlePatientSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setPatientMessage(null);
        try {
            const res = await fetch(`/api/orders/${orderData.id}/patient-details`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify({
                    patient_name: patientName,
                    patient_age: patientAge ? parseInt(patientAge) : null,
                    condition_notes: conditionNotes,
                    secondary_emergency_contact: secondaryContact,
                    guest_session_token: guestToken
                })
            });
            const data = await res.json();
            if (res.ok) {
                setPatientSaved(true);
                setPatientMessage({ type: 'success', text: 'Data medis pasien berhasil disimpan.' });
                setOrderData((prev: any) => ({ ...prev, patient_detail: data.patient_detail }));
            } else {
                setPatientMessage({ type: 'error', text: data.message || 'Gagal menyimpan data pasien.' });
            }
        } catch (err) {
            setPatientMessage({ type: 'error', text: 'Kesalahan koneksi jaringan.' });
        }
    };

    // Submit Payment DP Guest
    const handlePaymentSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setPaymentMessage(null);
        try {
            const res = await fetch(`/api/orders/${orderData.id}/payment/guest`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify({
                    method: paymentMethod,
                    amount: parseFloat(orderData.fare_amount) * 0.3, // 30% Down Payment
                    guest_session_token: guestToken
                })
            });
            const data = await res.json();
            if (res.ok) {
                setPaymentMessage({ type: 'success', text: 'Pembayaran DP berhasil dikonfirmasi!' });
                setOrderData((prev: any) => ({ ...prev, payment: data.payment }));
            } else {
                setPaymentMessage({ type: 'error', text: data.message || 'Gagal memproses pembayaran.' });
            }
        } catch (err) {
            setPaymentMessage({ type: 'error', text: 'Kesalahan koneksi jaringan.' });
        }
    };

    // Submit Konversi Guest ke Akun Permanen
    const handleRegSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setRegMessage(null);
        try {
            const res = await fetch(`/api/orders/${orderData.id}/guest-register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify({
                    name: regName,
                    email: regEmail,
                    password: regPassword,
                    guest_session_token: guestToken
                })
            });
            const data = await res.json();
            if (res.ok) {
                setRegSuccess(true);
                setRegMessage({ type: 'success', text: 'Akun permanen Anda telah berhasil didaftarkan!' });
                setTimeout(() => {
                    router.visit('/orders');
                }, 3000);
            } else {
                setRegMessage({ type: 'error', text: data.message || 'Gagal membuat akun.' });
            }
        } catch (err) {
            setRegMessage({ type: 'error', text: 'Kesalahan koneksi jaringan.' });
        }
    };

    return (
        <AppLayout activeMenu="booking">
            <Head title={`Live Tracking Order #${orderData.id} - AmbulanBDG`} />
            <div className="flex flex-col lg:flex-row gap-6 p-6 w-full lg:h-[calc(100vh-80px)] overflow-y-auto lg:overflow-hidden bg-slate-50">
                {/* Left Column: Tracking Map */}
                <div className="flex-1 flex flex-col bg-white rounded-2xl border border-slate-200 shadow-lg dark:border-slate-800 dark:bg-slate-900 overflow-hidden relative min-h-[400px] lg:h-full">
                    <div className="flex-1 w-full h-full">
                        <Map center={mapCenter} zoom={14} markers={markers} routingBetween={routingBetween} />
                    </div>
                </div>

                {/* Right Column: Tracking Status & Details */}
                <div className="w-full lg:w-[450px] shrink-0 flex flex-col bg-white rounded-2xl border border-slate-200 shadow-lg dark:border-slate-800 dark:bg-slate-900 overflow-y-auto p-6 space-y-6 lg:h-full">
                    {/* Status Card */}
                    <div className="bg-teal-50 dark:bg-teal-950/20 p-5 rounded-2xl border border-teal-100/50 dark:border-teal-900/30 text-center space-y-2">
                        <span className="text-[10px] uppercase font-extrabold tracking-wider text-teal-500 dark:text-teal-400">Status Perjalanan</span>
                        <h2 className="font-extrabold text-lg text-teal-700 dark:text-teal-400">
                            {getStatusLabel(orderData.status)}
                        </h2>
                        {['confirmed', 'on_the_way', 'arrived', 'transporting'].includes(orderData.status) && (
                            <p className="text-[11px] text-slate-500">Mencari koordinat ter-update secara otomatis dari driver...</p>
                        )}
                        {routeEta !== null && routeDistance !== null && (
                            <div className="mt-3 pt-3 border-t border-teal-100/30 dark:border-teal-900/30 flex justify-around items-center">
                                <div className="text-center">
                                    <span className="block text-[9px] text-slate-500 dark:text-slate-400 uppercase font-bold">Estimasi Tiba (ETA)</span>
                                    <span className="font-black text-sm text-teal-700 dark:text-teal-400">{routeEta} Menit</span>
                                </div>
                                <div className="h-6 border-l border-slate-200 dark:border-slate-800"></div>
                                <div className="text-center">
                                    <span className="block text-[9px] text-slate-500 dark:text-slate-400 uppercase font-bold">Jarak Rute</span>
                                    <span className="font-black text-sm text-teal-700 dark:text-teal-400">{routeDistance} KM</span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Stale Tracking Signal Lost Alert */}
                    {trackingSignalLost && (
                        <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-2xl p-4 text-xs space-y-2">
                            <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300 font-bold">
                                <span className="h-2 w-2 rounded-full bg-amber-500 animate-ping"></span>
                                <span>Sinyal GPS Driver Terputus Sementara</span>
                            </div>
                            <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                                Driver kemungkinan berada di area basement rumah sakit, terowongan, atau zona sinyal lemah. Peta tetap menampilkan koordinat terakhir yang terdeteksi. Tim operasional kami terus memantau pergerakan unit via radio komunikasi darurat.
                            </p>
                        </div>
                    )}

                    {/* Driver & Nurse Crew Details */}
                    {orderData.ambulance && (
                        <div className="border border-slate-100 dark:border-slate-800 p-4 rounded-xl space-y-3 bg-slate-50/50 dark:bg-slate-900/30">
                            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Informasi Kru & Armada</h3>
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-slate-500">Nomor Plat</span>
                                    <span className="font-bold text-slate-800 dark:text-slate-200">{orderData.ambulance.plate_number}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-500">Kategori</span>
                                    <span className="font-medium">{orderData.ambulance.category === 'emergency' ? '🚨 Gawat Darurat' : '🟢 Transportasi / Sewa'}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-500">Pengemudi (Driver)</span>
                                    <span className="font-medium text-slate-800 dark:text-slate-200">{orderData.ambulance.current_driver?.name || 'Menunggu Penugasan'}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-500">Perawat (Nurse)</span>
                                    <span className="font-medium text-slate-800 dark:text-slate-200">{orderData.ambulance.current_nurse?.name || 'Tidak ada perawat'}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-500">Fasyankes Penanggung</span>
                                    <span className="font-medium">{orderData.ambulance.institution?.name || '-'}</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Order Fare & Payment Info */}
                    <div className="border border-slate-100 dark:border-slate-800 p-4 rounded-xl space-y-3 bg-slate-50/50 dark:bg-slate-900/30">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Detail Pemesanan</h3>
                        <div className="space-y-2 text-xs">
                            <div>
                                <span className="text-slate-400 block font-bold">ALAMAT JEMPUT</span>
                                <span className="text-slate-700 dark:text-slate-300 font-medium block mt-0.5">{orderData.pickup_address}</span>
                            </div>
                            {orderData.destination_address && (
                                <div>
                                    <span className="text-slate-400 block font-bold">ALAMAT TUJUAN</span>
                                    <span className="text-slate-700 dark:text-slate-300 font-medium block mt-0.5">{orderData.destination_address}</span>
                                </div>
                            )}
                            <div className="border-t border-slate-200/50 dark:border-slate-800 pt-2 flex justify-between items-center text-sm">
                                <span className="text-slate-500 font-medium">Total Tarif Perjalanan</span>
                                <span className="font-extrabold text-teal-600 dark:text-teal-500 text-lg">
                                    {orderData.fare_amount == 0 ? 'GRATIS (Klaim BPJS/SOS)' : `Rp ${parseFloat(orderData.fare_amount).toLocaleString('id-ID')}`}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Form Data Pasien (Muncul jika Driver sedang menuju lokasi atau selanjutnya) */}
                    {['on_the_way', 'arrived', 'transporting', 'completed'].includes(orderData.status) && (
                        <div className="border border-slate-200 rounded-2xl p-5 space-y-4">
                            <div className="flex justify-between items-center border-b pb-2">
                                <h3 className="font-extrabold text-xs uppercase tracking-wider text-slate-500">📝 Informasi Pasien & Keluhan</h3>
                                {orderData.patient_detail && (
                                    <span className="bg-emerald-100 text-emerald-800 text-[9px] font-bold px-2 py-0.5 rounded">Tersimpan</span>
                                )}
                            </div>

                            {patientMessage && (
                                <div className={`p-3 rounded-lg text-xs font-semibold ${patientMessage.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                                    {patientMessage.text}
                                </div>
                            )}

                            <form onSubmit={handlePatientSubmit} className="space-y-3">
                                <div>
                                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Nama Pasien</label>
                                    <input
                                        type="text"
                                        placeholder="Ketik nama lengkap pasien..."
                                        value={patientName}
                                        onChange={(e) => setPatientName(e.target.value)}
                                        className="w-full text-xs rounded-lg border border-slate-200 p-2 focus:outline-none focus:ring-1 focus:ring-teal-500"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Usia Pasien</label>
                                        <input
                                            type="number"
                                            placeholder="Tahun..."
                                            value={patientAge}
                                            onChange={(e) => setPatientAge(e.target.value)}
                                            className="w-full text-xs rounded-lg border border-slate-200 p-2 focus:outline-none focus:ring-1 focus:ring-teal-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Kontak Darurat ke-2</label>
                                        <input
                                            type="tel"
                                            placeholder="No. HP opsional..."
                                            value={secondaryContact}
                                            onChange={(e) => setSecondaryContact(e.target.value)}
                                            className="w-full text-xs rounded-lg border border-slate-200 p-2 focus:outline-none focus:ring-1 focus:ring-teal-500"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Catatan Kondisi / Gejala</label>
                                    <textarea
                                        rows={2}
                                        placeholder="Contoh: Kesulitan bernafas, nyeri dada mendadak..."
                                        value={conditionNotes}
                                        onChange={(e) => setConditionNotes(e.target.value)}
                                        className="w-full text-xs rounded-lg border border-slate-200 p-2 focus:outline-none focus:ring-1 focus:ring-teal-500"
                                    />
                                </div>
                                <button
                                    type="submit"
                                    className="w-full bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold py-2 rounded-lg transition"
                                >
                                    Simpan Info Pasien
                                </button>
                            </form>
                        </div>
                    )}

                    {/* Pembayaran Inline bagi Guest (Muncul jika armada swasta berbayar) */}
                    {isGuest && parseFloat(orderData.fare_amount) > 0 && (
                        <div className="border border-slate-200 rounded-2xl p-5 space-y-4">
                            <div className="flex justify-between items-center border-b pb-2">
                                <h3 className="font-extrabold text-xs uppercase tracking-wider text-slate-500">💳 Pembayaran DP 30%</h3>
                                <span className={`text-[9px] font-bold px-2 py-0.5 rounded ${orderData.payment?.status === 'paid' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                                    {orderData.payment?.status === 'paid' ? 'LUNAS DP' : 'BELUM DIBAYAR'}
                                </span>
                            </div>

                            {orderData.payment?.status === 'paid' ? (
                                <div className="bg-emerald-50 text-emerald-800 p-3 text-xs rounded-lg font-mono">
                                    <p className="font-bold">DP LUNAS</p>
                                    <p className="text-[10px] mt-0.5">Trx ID: {orderData.payment.payment_gateway_transaction_id}</p>
                                </div>
                            ) : (
                                <form onSubmit={handlePaymentSubmit} className="space-y-3">
                                    {paymentMessage && (
                                        <div className={`p-2 rounded text-xs font-semibold ${paymentMessage.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                                            {paymentMessage.text}
                                        </div>
                                    )}
                                    <div className="flex justify-between items-center text-xs font-mono">
                                        <span>Tarif DP (30%):</span>
                                        <span className="font-bold">Rp {(parseFloat(orderData.fare_amount) * 0.3).toLocaleString('id-ID')}</span>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Metode Pembayaran</label>
                                        <select
                                            value={paymentMethod}
                                            onChange={(e) => setPaymentMethod(e.target.value)}
                                            className="w-full text-xs rounded-lg border border-slate-200 p-2 focus:outline-none focus:ring-1 focus:ring-teal-500"
                                        >
                                            <option value="qris">QRIS (OVO/GoPay/Dana)</option>
                                            <option value="e-wallet">LinkAja / ShopeePay</option>
                                            <option value="transfer">Virtual Account Transfer</option>
                                            <option value="cash">Tunai via Driver</option>
                                        </select>
                                    </div>
                                    <button
                                        type="submit"
                                        className="w-full bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold py-2 rounded-lg transition"
                                    >
                                        Konfirmasi Bayar DP
                                    </button>
                                </form>
                            )}
                        </div>
                    )}

                    {/* Konversi ke Akun Permanen (Muncul jika tamu dan status completed) */}
                    {isGuest && orderData.status === 'completed' && (
                        <div className="border-2 border-dashed border-slate-300 rounded-2xl p-5 space-y-4 bg-slate-50/50">
                            <h3 className="font-black text-xs uppercase tracking-wider text-slate-800">🔒 Simpan Sebagai Akun Permanen</h3>
                            <p className="text-[10px] text-gray-500 leading-relaxed uppercase">
                                Amankan riwayat penyelamatan darurat dan data medis pasien Anda dengan membuat akun permanen berbasis Nomor HP <b>{orderData.guest_phone}</b>.
                            </p>

                            {regMessage && (
                                <div className={`p-2.5 rounded text-xs font-semibold ${regMessage.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                                    {regMessage.text}
                                </div>
                            )}

                            {!regSuccess && (
                                <form onSubmit={handleRegSubmit} className="space-y-3">
                                    <div>
                                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Nama Lengkap</label>
                                        <input
                                            type="text"
                                            placeholder="Masukkan nama lengkap Anda..."
                                            value={regName}
                                            onChange={(e) => setRegName(e.target.value)}
                                            className="w-full text-xs rounded-lg border border-slate-200 p-2 focus:outline-none focus:ring-1 focus:ring-teal-500 bg-white"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Alamat Email</label>
                                        <input
                                            type="email"
                                            placeholder="contoh@mail.com"
                                            value={regEmail}
                                            onChange={(e) => setRegEmail(e.target.value)}
                                            className="w-full text-xs rounded-lg border border-slate-200 p-2 focus:outline-none focus:ring-1 focus:ring-teal-500 bg-white"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Kata Sandi (Min 8 Karakter)</label>
                                        <input
                                            type="password"
                                            placeholder="Buat sandi aman..."
                                            value={regPassword}
                                            onChange={(e) => setRegPassword(e.target.value)}
                                            className="w-full text-xs rounded-lg border border-slate-200 p-2 focus:outline-none focus:ring-1 focus:ring-teal-500 bg-white"
                                            required
                                        />
                                    </div>
                                    <button
                                        type="submit"
                                        className="w-full bg-black hover:bg-slate-900 text-white text-xs font-bold py-2 rounded-lg transition"
                                    >
                                        Simpan & Daftar Akun
                                    </button>
                                </form>
                            )}
                        </div>
                    )}

                    {/* Modul 8 Rating & Feedback Widget (Muncul jika status completed) */}
                    {orderData.status === 'completed' && (
                        <div className="border-2 border-teal-100 dark:border-teal-950 p-5 rounded-2xl bg-teal-50/20 dark:bg-teal-950/10 space-y-4">
                            <h3 className="text-center font-extrabold text-sm text-teal-600 dark:text-teal-500 tracking-tight">Bagaimana Layanan Kami?</h3>
                            {ratingSubmitted ? (
                                <div className="text-center text-xs font-semibold text-emerald-600 dark:text-emerald-400 py-2">
                                    ✓ Ulasan Anda telah berhasil dikirim. Terima kasih atas masukan Anda!
                                </div>
                            ) : (
                                <form onSubmit={handleRatingSubmit} className="space-y-4">
                                    {ratingMessage && (
                                        <div className="p-3 rounded-lg text-xs font-semibold bg-teal-50 text-teal-600">
                                            {ratingMessage.text}
                                        </div>
                                    )}
                                    {/* Star Selector */}
                                    <div className="flex justify-center items-center gap-2">
                                        {[1, 2, 3, 4, 5].map((val) => (
                                            <button
                                                key={val}
                                                type="button"
                                                onClick={() => setRatingValue(val)}
                                                className="focus:outline-none hover:scale-110 transition"
                                            >
                                                <svg
                                                    xmlns="http://www.w3.org/2000/svg"
                                                    viewBox="0 0 24 24"
                                                    fill={val <= ratingValue ? '#EAB308' : 'none'}
                                                    stroke={val <= ratingValue ? '#EAB308' : '#94A3B8'}
                                                    strokeWidth="2"
                                                    className="w-8 h-8"
                                                >
                                                    <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                                                </svg>
                                            </button>
                                        ))}
                                    </div>

                                    {/* Review text */}
                                    <div>
                                        <textarea
                                            rows={2}
                                            placeholder="Tulis kritik, saran, atau pujian Anda di sini..."
                                            value={reviewText}
                                            onChange={(e) => setReviewText(e.target.value)}
                                            className="w-full text-xs rounded-lg border border-slate-200 p-2.5 bg-white dark:border-slate-800 dark:bg-slate-950 focus:outline-none focus:ring-1 focus:ring-teal-500"
                                        />
                                    </div>

                                    <button
                                        type="submit"
                                        className="w-full bg-teal-600 hover:bg-teal-700 text-white rounded-lg py-2 text-xs font-bold transition shadow-sm"
                                    >
                                        Kirim Ulasan
                                    </button>
                                </form>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </AppLayout>
    );
}
