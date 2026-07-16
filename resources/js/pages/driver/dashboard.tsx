import { useState, useEffect, useRef } from 'react';
import { Head, router } from '@inertiajs/react';
import AppLayout from '../../layouts/AppLayout';
import Map, { MapMarker } from '../../components/Map';

interface DriverDashboardProps {
    ambulances: any[];
    currentUser: any;
}

// Koordinat rute simulasi di Kota Bandung (Gedung Sate -> Cihampelas Walk)
const SIMULATED_ROUTE = [
    [-6.902481, 107.618810], // Gedung Sate
    [-6.902000, 107.616000],
    [-6.901000, 107.613000],
    [-6.900000, 107.610000],
    [-6.898500, 107.608000],
    [-6.897500, 107.606000],
    [-6.896582, 107.604215], // Cihampelas Walk
];

export default function DriverDashboard({ ambulances, currentUser }: DriverDashboardProps) {
    // 1. Crew & Vehicle State
    const [assignedAmbulance, setAssignedAmbulance] = useState<any | null>(null);
    const [onlineStatus, setOnlineStatus] = useState<'standby' | 'offline'>('offline');
    const [selectedAmbulanceId, setSelectedAmbulanceId] = useState<number | null>(null);

    // 2. Active Trip State
    const [activeTrip, setActiveTrip] = useState<any | null>(null);
    const [patientCondition, setPatientCondition] = useState<string>('');
    const [tensi, setTensi] = useState('');
    const [suhu, setSuhu] = useState('');
    const [nadi, setNadi] = useState('');
    const [pernapasan, setPernapasan] = useState('');
    const [spo2, setSpo2] = useState('');
    const [kondisiLain, setKondisiLain] = useState('');
    const [showCancelConfirm, setShowCancelConfirm] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [driverCoords, setDriverCoords] = useState<[number, number] | null>(null);

    // Offline queue status
    const [offlineQueue, setOfflineQueue] = useState<any[]>([]);

    // Track previous trip ID and status to prevent polling from overwriting keystrokes
    const prevTripKeyRef = useRef<string | null>(null);
    
    // Checklist Modal States
    const [showChecklistModal, setShowChecklistModal] = useState(false);
    const [fuelStatus, setFuelStatus] = useState('fully');
    const [oxygenStatus, setOxygenStatus] = useState('fully');
    const [medicalSuppliesStatus, setMedicalSuppliesStatus] = useState('complete');
    const [checklistNotes, setChecklistNotes] = useState('');

    // Process local offline queue
    useEffect(() => {
        const processQueue = async () => {
            if (!navigator.onLine) return;
            const queueStr = localStorage.getItem('driver_offline_queue');
            if (!queueStr) return;
            const queue = JSON.parse(queueStr);
            if (queue.length === 0) return;

            const remaining = [];
            for (const item of queue) {
                try {
                    const res = await fetch(item.url, {
                        method: item.method,
                        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                        body: item.body
                    });
                    if (!res.ok) {
                        remaining.push(item);
                    }
                } catch (err) {
                    remaining.push(item);
                }
            }
            localStorage.setItem('driver_offline_queue', JSON.stringify(remaining));
            setOfflineQueue(remaining);
            if (remaining.length === 0) {
                setMessage({ type: 'success', text: 'Semua perubahan status offline berhasil disinkronkan ke server.' });
            }
        };

        window.addEventListener('online', processQueue);
        if (navigator.onLine) {
            processQueue();
        }
        return () => window.removeEventListener('online', processQueue);
    }, []);

    // Helper to run action with offline fallback
    const executeAction = async (url: string, method: string, bodyObj: any, successCallback: (data: any) => void) => {
        if (!navigator.onLine) {
            const queueStr = localStorage.getItem('driver_offline_queue') || '[]';
            const queue = JSON.parse(queueStr);
            queue.push({ url, method, body: JSON.stringify(bodyObj), timestamp: Date.now() });
            localStorage.setItem('driver_offline_queue', JSON.stringify(queue));
            setOfflineQueue(queue);
            
            setMessage({ type: 'success', text: 'Mode Offline: Perubahan disimpan lokal dan akan disinkronkan otomatis saat online.' });
            successCallback({ order: { ...activeTrip, ...bodyObj }, message: 'Tersimpan lokal.' });
            return;
        }

        try {
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify(bodyObj)
            });
            const data = await res.json();
            if (res.ok) {
                successCallback(data);
            } else {
                setMessage({ type: 'error', text: data.message || 'Gagal memproses aksi.' });
            }
        } catch (err) {
            const queueStr = localStorage.getItem('driver_offline_queue') || '[]';
            const queue = JSON.parse(queueStr);
            queue.push({ url, method, body: JSON.stringify(bodyObj), timestamp: Date.now() });
            localStorage.setItem('driver_offline_queue', JSON.stringify(queue));
            setOfflineQueue(queue);
            
            setMessage({ type: 'success', text: 'Koneksi gagal. Aksi disimpan secara lokal.' });
            successCallback({ order: { ...activeTrip, ...bodyObj }, message: 'Tersimpan lokal.' });
        }
    };

    // Inisialisasi awal koordinat driver dari armada terikat
    useEffect(() => {
        if (assignedAmbulance) {
            setDriverCoords([
                assignedAmbulance.latitude ? parseFloat(assignedAmbulance.latitude) : -6.917,
                assignedAmbulance.longitude ? parseFloat(assignedAmbulance.longitude) : 107.619
            ]);
        }
    }, [assignedAmbulance]);

    // 3. GPS Simulator State
    const [isSimulatingGps, setIsSimulatingGps] = useState(false);
    const simIndexRef = useRef(0);
    const simIntervalRef = useRef<NodeJS.Timeout | null>(null);

    // 4. GPS Riil State
    const [isBroadcastingRealGps, setIsBroadcastingRealGps] = useState(false);
    const watchIdRef = useRef<number | null>(null);

    // Deteksi ambulans yang sudah terikat pada user saat ini di awal
    useEffect(() => {
        if (currentUser) {
            const boundAmb = ambulances.find(
                (amb) => amb.current_driver_id === currentUser.id || amb.current_nurse_id === currentUser.id
            );
            if (boundAmb) {
                setAssignedAmbulance(boundAmb);
                setOnlineStatus(boundAmb.status);
            }
        }
    }, [currentUser, ambulances]);

    // 1. Polling: Deteksi order aktif baru setiap 5 detik
    useEffect(() => {
        if (!assignedAmbulance) return;

        const checkTrips = async () => {
            try {
                const res = await fetch('/api/driver/active-trips');
                const data = await res.json();
                if (data.status === 'success' && data.order) {
                    setActiveTrip(data.order);
                    setPatientCondition(data.order.patient_condition || '');
                } else {
                    setActiveTrip(null);
                }
            } catch (err) {
                console.error("Gagal memeriksa tugas aktif:", err);
            }
        };

        checkTrips(); // Run immediately
        const interval = setInterval(checkTrips, 5000);

        return () => clearInterval(interval);
    }, [assignedAmbulance]);

    // 2. GPS Broadcaster Simulator
    useEffect(() => {
        if (isSimulatingGps && activeTrip) {
            // Jalankan simulator GPS bergerak
            simIntervalRef.current = setInterval(async () => {
                const routeLen = SIMULATED_ROUTE.length;
                const coords = SIMULATED_ROUTE[simIndexRef.current];
                
                setDriverCoords([coords[0], coords[1]]);

                try {
                    await fetch(`/api/orders/${activeTrip.id}/tracking`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                        body: JSON.stringify({
                            latitude: coords[0],
                            longitude: coords[1],
                            bearing: simIndexRef.current * 45 // Simulasi bearing berputar
                        })
                    });

                    // Increment index rute
                    simIndexRef.current = (simIndexRef.current + 1) % routeLen;
                } catch (err) {
                    console.error("Gagal menyiarkan GPS simulator:", err);
                }
            }, 3000);
        } else {
            if (simIntervalRef.current) {
                clearInterval(simIntervalRef.current);
                simIntervalRef.current = null;
            }
            simIndexRef.current = 0;
        }

        return () => {
            if (simIntervalRef.current) clearInterval(simIntervalRef.current);
        };
    }, [isSimulatingGps, activeTrip]);

    // 3. GPS Riil Broadcaster
    useEffect(() => {
        if (isBroadcastingRealGps && activeTrip) {
            if (navigator.geolocation) {
                watchIdRef.current = navigator.geolocation.watchPosition(
                    async (position) => {
                        const lat = position.coords.latitude;
                        const lng = position.coords.longitude;
                        const heading = position.coords.heading || 0;
                        
                        setDriverCoords([lat, lng]);

                        try {
                            await fetch(`/api/orders/${activeTrip.id}/tracking`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                                body: JSON.stringify({
                                    latitude: lat,
                                    longitude: lng,
                                    bearing: heading
                                })
                            });
                        } catch (err) {
                            console.error("Gagal mengirim koordinat GPS riil:", err);
                        }
                    },
                    (error) => {
                        console.error("Gagal mendeteksi koordinat GPS riil:", error);
                        alert("Gagal membaca GPS riil perangkat Anda. Pastikan izin lokasi aktif.");
                        setIsBroadcastingRealGps(false);
                    },
                    { enableHighAccuracy: true, maximumAge: 1000, timeout: 5000 }
                );
            } else {
                alert("Browser ini tidak mendukung pembacaan GPS.");
                setIsBroadcastingRealGps(false);
            }
        } else {
            if (watchIdRef.current !== null) {
                navigator.geolocation.clearWatch(watchIdRef.current);
                watchIdRef.current = null;
            }
        }

        return () => {
            if (watchIdRef.current !== null) {
                navigator.geolocation.clearWatch(watchIdRef.current);
                watchIdRef.current = null;
            }
        };
    }, [isBroadcastingRealGps, activeTrip]);

    // Aksi 1: Ikat driver ke nomor plat ambulans
    const handleAssignAmbulance = async (e: React.FormEvent) => {
        e.preventDefault();
        setMessage(null);

        const targetId = selectedAmbulanceId || ambulances[0]?.id;
        if (!targetId) {
            setMessage({ type: 'error', text: 'Tidak ada armada ambulans yang tersedia.' });
            return;
        }

        // Tampilkan modal checklist kendaraan sebelum ikat/mulai shift
        setShowChecklistModal(true);
    };

    // Submisi checklist kendaraan dan lanjutkan ikat armada
    const handleChecklistSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setMessage(null);
        
        const targetId = selectedAmbulanceId || ambulances[0]?.id;
        if (!targetId) return;

        try {
            // 1. Submit checklist terlebih dahulu
            const checkRes = await fetch('/api/driver/checklist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify({
                    ambulance_id: targetId,
                    fuel_status: fuelStatus,
                    oxygen_status: oxygenStatus,
                    medical_supplies_status: medicalSuppliesStatus,
                    notes: checklistNotes
                })
            });

            if (!checkRes.ok) {
                const checkData = await checkRes.json();
                setMessage({ type: 'error', text: 'Gagal memproses checklist: ' + (checkData.message || 'Error.') });
                return;
            }

            // 2. Ikat armada jika checklist sukses
            const res = await fetch('/api/driver/assign-ambulance', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify({ ambulance_id: targetId })
            });
            const data = await res.json();
            if (res.ok) {
                setAssignedAmbulance(data.ambulance);
                setOnlineStatus(data.ambulance.status);
                setShowChecklistModal(false);
                setMessage({ type: 'success', text: 'Checklist terkirim & armada berhasil terikat.' });
            } else {
                setMessage({ type: 'error', text: data.message || 'Gagal mengikat armada.' });
            }
        } catch (err) {
            setMessage({ type: 'error', text: 'Koneksi gagal ke server.' });
        }
    };

    // Aksi 2: Ubah status online (standby / offline)
    const handleToggleStatus = async (status: 'standby' | 'offline') => {
        setMessage(null);
        executeAction('/api/driver/status', 'POST', { status }, (data) => {
            setOnlineStatus(status);
            setMessage({ type: 'success', text: data.message || 'Status diperbarui.' });
        });
    };

    // Aksi 3: Perbarui Status Perjalanan (Trip Progress)
    const handleUpdateTripStatus = async (newStatus: string) => {
        if (!activeTrip) return;
        setMessage(null);
        executeAction(`/api/orders/${activeTrip.id}/status`, 'POST', { status: newStatus }, (data) => {
            setActiveTrip(data.order);
            setMessage({ type: 'success', text: data.message || 'Status perjalanan diperbarui.' });
            if (['completed', 'cancelled'].includes(newStatus)) {
                setIsSimulatingGps(false);
                setIsBroadcastingRealGps(false);
                setActiveTrip(null);
            }
        });
    };

    // Aksi 4: Terima Panggilan SOS (Accept SOS Trip)
    const handleAcceptTrip = async () => {
        if (!activeTrip) return;
        setMessage(null);
        executeAction(`/api/orders/${activeTrip.id}/accept`, 'POST', {}, (data) => {
            setActiveTrip(data.order);
            setMessage({ type: 'success', text: data.message || 'Panggilan SOS diterima.' });
        });
    };

    // Aksi 5: Simpan Kondisi Pasien (Kru Relawan)
    const handleSavePatientCondition = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!activeTrip) return;
        setMessage(null);
        executeAction(`/api/orders/${activeTrip.id}/patient-condition`, 'POST', { patient_condition: patientCondition }, (data) => {
            setMessage({ type: 'success', text: 'Catatan kondisi pasien berhasil disimpan.' });
            setActiveTrip(data.order);
        });
    };

    // Parser untuk mendeteksi catatan kondisi medis terformat
    useEffect(() => {
        const tripKey = activeTrip ? `${activeTrip.id}_${activeTrip.status}` : null;
        if (prevTripKeyRef.current === tripKey) {
            // Jika ID dan status sama (misalnya update dari polling berkala), jangan timpa input pengguna
            return;
        }
        prevTripKeyRef.current = tripKey;

        if (activeTrip && activeTrip.patient_condition) {
            const cond = activeTrip.patient_condition;
            const tensiMatch = cond.match(/Tensi:\s*([^,\n]+)/i);
            const suhuMatch = cond.match(/Suhu:\s*([^,\n]+)/i);
            const nadiMatch = cond.match(/Nadi:\s*([^,\n]+)/i);
            const respMatch = cond.match(/Pernapasan:\s*([^,\n]+)/i);
            const spo2Match = cond.match(/SpO2:\s*([^.\n]+)/i);
            const notesMatch = cond.match(/Catatan Tambahan:\s*(.+)/i);

            setTensi(tensiMatch ? tensiMatch[1].replace(/\s*mmHg/i, '').trim() : '');
            setSuhu(suhuMatch ? suhuMatch[1].replace(/\s*°C/i, '').trim() : '');
            setNadi(nadiMatch ? nadiMatch[1].replace(/\s*bpm/i, '').trim() : '');
            setPernapasan(respMatch ? respMatch[1].replace(/\s*x\/menit/i, '').trim() : '');
            setSpo2(spo2Match ? spo2Match[1].replace(/\s*%/i, '').trim() : '');
            
            if (notesMatch) {
                setKondisiLain(notesMatch[1].trim());
            } else if (!tensiMatch && !suhuMatch && !nadiMatch && !respMatch && !spo2Match) {
                setKondisiLain(cond);
            } else {
                setKondisiLain('');
            }
        } else {
            setTensi('');
            setSuhu('');
            setNadi('');
            setPernapasan('');
            setSpo2('');
            setKondisiLain('');
        }
    }, [activeTrip]);

    // Aksi 6: Simpan Kondisi Medis Pasien Terstruktur (Observasi Kru Perawat)
    const handleSaveStructuredCondition = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!activeTrip) return;
        setMessage(null);

        const parts = [];
        if (tensi) parts.push(`Tensi: ${tensi} mmHg`);
        if (suhu) parts.push(`Suhu: ${suhu} °C`);
        if (nadi) parts.push(`Nadi: ${nadi} bpm`);
        if (pernapasan) parts.push(`Pernapasan: ${pernapasan} x/menit`);
        if (spo2) parts.push(`SpO2: ${spo2}%`);
        
        let formattedText = parts.join(', ');
        if (kondisiLain) {
            formattedText += `${formattedText ? '. ' : ''}Catatan Tambahan: ${kondisiLain}`;
        }

        executeAction(`/api/orders/${activeTrip.id}/patient-condition`, 'POST', { 
            patient_condition: formattedText,
            tensi,
            suhu,
            nadi,
            pernapasan,
            spo2
        }, (data) => {
            setMessage({ type: 'success', text: 'Data kondisi medis pasien berhasil disimpan.' });
            setActiveTrip(data.order);
        });
    };

    // Hitung koordinat penjemputan & tujuan untuk ditampilkan di peta driver
    const getCoords = (latField: any, lngField: any) => {
        if (latField === undefined || latField === null || lngField === undefined || lngField === null) return null;
        return [parseFloat(latField), parseFloat(lngField)] as [number, number];
    };

    const userCoords = activeTrip ? getCoords(activeTrip.pickup_latitude, activeTrip.pickup_longitude) : null;
    const destinationCoords = activeTrip ? getCoords(activeTrip.destination_latitude, activeTrip.destination_longitude) : null;

    const markers: MapMarker[] = [];
    let routingBetween: any = null;

    if (driverCoords) {
        markers.push({
            position: driverCoords,
            title: 'Posisi Anda',
            popup: `<b>Ambulans Anda</b>`,
            iconType: assignedAmbulance?.category === 'emergency' ? 'ambulance_emergency' : 'ambulance_non_emergency'
        });
    }

    if (activeTrip) {
        const uCoords = userCoords || [-6.917464, 107.619123];
        if (['confirmed', 'on_the_way', 'arrived'].includes(activeTrip.status)) {
            markers.push({
                position: uCoords,
                title: 'Titik Jemput Pasien',
                popup: `<b>Alamat:</b> ${activeTrip.pickup_address}`,
                iconType: 'user'
            });
            if (driverCoords) {
                routingBetween = {
                    start: driverCoords,
                    end: uCoords,
                    color: '#D9383A' // Merah menuju jemput
                };
            }
        } else if (activeTrip.status === 'transporting' && destinationCoords) {
            markers.push({
                position: destinationCoords,
                title: 'Rumah Sakit Tujuan',
                popup: `<b>Alamat:</b> ${activeTrip.destination_address}`,
                iconType: 'user'
            });
            if (driverCoords) {
                routingBetween = {
                    start: driverCoords,
                    end: destinationCoords,
                    color: '#0D9488' // Teal menuju RS
                };
            }
        }
    }

    const mapCenter = driverCoords || userCoords || [-6.917464, 107.619123];

    const isTripActive = activeTrip && ['confirmed', 'on_the_way', 'arrived', 'transporting'].includes(activeTrip.status);

    return (
        <AppLayout activeMenu="dashboard">
            <Head title="Driver Dashboard PWA - AmbulanBDG" />
            <div className={`w-full h-full overflow-y-auto p-6 mx-auto space-y-6 ${isTripActive ? 'max-w-5xl' : 'max-w-md'}`}>
                    {/* Message Banner */}
                    {message && (
                        <div className={`p-4 rounded-xl text-xs font-semibold ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30' : 'bg-teal-50 text-teal-700 dark:bg-teal-950/30'}`}>
                            {message.text}
                        </div>
                    )}

                    {/* TAHAP 1: IKAT ARMADA (Jika belum terikat) */}
                    {!assignedAmbulance ? (
                        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-md dark:border-slate-800 dark:bg-slate-900 space-y-4">
                            <div className="text-center">
                                <h2 className="font-extrabold text-base">Ikat Unit Kendaraan</h2>
                                <p className="text-xs text-slate-500 mt-1">Pilih armada ambulans yang Anda bawa hari ini untuk memulai penerimaan tugas perjalanan.</p>
                            </div>

                            <form onSubmit={handleAssignAmbulance} className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Pilih Plat Nomor</label>
                                    <select 
                                        onChange={(e) => setSelectedAmbulanceId(parseInt(e.target.value))}
                                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white dark:border-slate-800 dark:bg-slate-950 focus:outline-none"
                                    >
                                        {ambulances.map((amb) => (
                                            <option key={amb.id} value={amb.id}>
                                                {amb.plate_number} - {amb.category.toUpperCase()}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <button 
                                    type="submit"
                                    className="w-full bg-teal-600 hover:bg-teal-700 text-white rounded-lg py-2.5 text-xs font-bold shadow-md transition"
                                >
                                    Mulai Tugas & Ikat Armada
                                </button>
                            </form>
                        </div>
                    ) : (
                        /* TAHAP 2: KONTROL SIAGA & DETAIL ARMADA TERIKAT */
                        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-md dark:border-slate-800 dark:bg-slate-900 space-y-4">
                            <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3">
                                <div>
                                    <h3 className="font-extrabold text-sm">{assignedAmbulance.plate_number}</h3>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase">{assignedAmbulance.category} ambulance</p>
                                </div>
                                <span className={`text-[10px] uppercase font-extrabold px-2.5 py-1 rounded-full ${onlineStatus === 'standby' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                                    ● {onlineStatus}
                                </span>
                            </div>

                            <div className="flex gap-3">
                                <button 
                                    onClick={() => handleToggleStatus('standby')}
                                    className={`flex-1 py-2 text-xs font-bold rounded-lg transition ${onlineStatus === 'standby' ? 'bg-teal-600 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'}`}
                                >
                                    Mulai Siaga (Online)
                                </button>
                                <button 
                                    onClick={() => handleToggleStatus('offline')}
                                    className={`flex-1 py-2 text-xs font-bold rounded-lg transition ${onlineStatus === 'offline' ? 'bg-teal-800 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'}`}
                                >
                                    Offline
                                </button>
                            </div>
                        </div>
                    )}

                    {/* TAHAP 3: DETAIL TUGAS PERJALANAN AKTIF */}
                    {assignedAmbulance && (
                        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-md dark:border-slate-800 dark:bg-slate-900 space-y-4">
                            <h3 className="font-extrabold text-sm border-b border-slate-100 dark:border-slate-800 pb-3 flex items-center gap-1.5">
                                <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse"></span>
                                Tugas Perjalanan Aktif
                            </h3>

                            {activeTrip ? (
                                <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
                                    {/* Kolom Kiri: Peta Navigasi */}
                                    {['confirmed', 'on_the_way', 'arrived', 'transporting'].includes(activeTrip.status) && (
                                        <div className="md:col-span-7 w-full h-[300px] md:h-[450px] rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 relative z-0">
                                            <Map center={mapCenter} zoom={14} markers={markers} routingBetween={routingBetween} />
                                        </div>
                                    )}

                                    {/* Kolom Kanan: Detail Tugas & Data Pasien */}
                                    <div className={['confirmed', 'on_the_way', 'arrived', 'transporting'].includes(activeTrip.status) ? 'md:col-span-5 space-y-4' : 'md:col-span-12 space-y-4'}>
                                        <div className="bg-teal-50/20 dark:bg-teal-950/10 p-4 rounded-xl space-y-2">
                                            <div className="flex justify-between text-xs font-bold text-teal-600 dark:text-teal-500">
                                                <span>ORDER ID: #{activeTrip.id}</span>
                                                <span>STATUS: {activeTrip.status.toUpperCase()}</span>
                                            </div>
                                            <div className="text-xs space-y-1">
                                                <p className="text-slate-500"><b className="text-slate-700">Jemput:</b> {activeTrip.pickup_address}</p>
                                                {activeTrip.destination_address && (
                                                    <p className="text-slate-500"><b className="text-slate-700">Tujuan:</b> {activeTrip.destination_address}</p>
                                                )}
                                                {activeTrip.user?.name && (
                                                    <p className="text-slate-500"><b className="text-slate-700">Nama Customer:</b> {activeTrip.user.name}</p>
                                                )}
                                                {(activeTrip.guest_phone || activeTrip.user?.phone) && (
                                                    <p className="text-slate-500">
                                                        <b className="text-slate-700">No. Telepon Customer:</b>{' '}
                                                        <a 
                                                            href={`tel:${activeTrip.guest_phone || activeTrip.user?.phone}`} 
                                                            className="text-teal-600 dark:text-teal-400 font-bold hover:underline"
                                                        >
                                                            {activeTrip.guest_phone || activeTrip.user?.phone}
                                                        </a>
                                                    </p>
                                                )}
                                            </div>
                                        </div>

                                        {/* DATA MEDIS PASIEN INPUTAN CUSTOMER */}
                                        {activeTrip.patient_detail ? (
                                            <div className="border border-slate-100 dark:border-slate-800 p-4 rounded-xl space-y-3 bg-slate-50/50 dark:bg-slate-900/30">
                                                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">👤 Data Medis Pasien (Customer Input)</h4>
                                                <div className="space-y-2 text-xs">
                                                    <div className="flex justify-between">
                                                        <span className="text-slate-500">Nama Pasien</span>
                                                        <span className="font-bold text-slate-800 dark:text-slate-200">{activeTrip.patient_detail.patient_name}</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-slate-500">Usia Pasien</span>
                                                        <span className="font-bold text-slate-800 dark:text-slate-200">
                                                            {activeTrip.patient_detail.patient_age ? `${activeTrip.patient_detail.patient_age} Tahun` : '-'}
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-slate-500">Kontak Darurat ke-2</span>
                                                        <span className="font-medium text-slate-800 dark:text-slate-200">{activeTrip.patient_detail.secondary_emergency_contact || '-'}</span>
                                                    </div>
                                                    <div className="pt-1.5 border-t border-slate-100">
                                                        <span className="text-slate-400 block font-bold mb-1">Catatan Keluhan Pasien:</span>
                                                        <p className="text-slate-600 dark:text-slate-400 italic bg-white dark:bg-slate-950 p-2 border border-slate-100 dark:border-slate-850 rounded">
                                                            "{activeTrip.patient_detail.condition_notes || 'Tidak ada catatan.'}"
                                                        </p>
                                                    </div>

                                                    {/* VITAL SIGNS OBSERVASI DRIVER/PERAWAT */}
                                                    {(activeTrip.patient_detail.tensi || activeTrip.patient_detail.suhu || activeTrip.patient_detail.nadi || activeTrip.patient_detail.pernapasan || activeTrip.patient_detail.spo2) && (
                                                        <div className="border-t border-slate-100 pt-2.5 space-y-2">
                                                            <span className="text-teal-600 dark:text-teal-400 block font-bold">🩺 Hasil Observasi Klinis (Vital Signs):</span>
                                                            <div className="grid grid-cols-2 gap-2 bg-slate-50/50 dark:bg-slate-950 p-2.5 rounded-lg border border-slate-100 dark:border-slate-850">
                                                                {activeTrip.patient_detail.tensi && (
                                                                    <div className="flex justify-between">
                                                                        <span className="text-slate-500">Tensi:</span>
                                                                        <span className="font-bold text-slate-800 dark:text-slate-200">{activeTrip.patient_detail.tensi} mmHg</span>
                                                                    </div>
                                                                )}
                                                                {activeTrip.patient_detail.suhu && (
                                                                    <div className="flex justify-between">
                                                                        <span className="text-slate-500">Suhu:</span>
                                                                        <span className="font-bold text-slate-800 dark:text-slate-200">{activeTrip.patient_detail.suhu} °C</span>
                                                                    </div>
                                                                )}
                                                                {activeTrip.patient_detail.nadi && (
                                                                    <div className="flex justify-between">
                                                                        <span className="text-slate-500">Nadi:</span>
                                                                        <span className="font-bold text-slate-800 dark:text-slate-200">{activeTrip.patient_detail.nadi} bpm</span>
                                                                    </div>
                                                                )}
                                                                {activeTrip.patient_detail.pernapasan && (
                                                                    <div className="flex justify-between">
                                                                        <span className="text-slate-500">Napas:</span>
                                                                        <span className="font-bold text-slate-800 dark:text-slate-200">{activeTrip.patient_detail.pernapasan} x/menit</span>
                                                                    </div>
                                                                )}
                                                                {activeTrip.patient_detail.spo2 && (
                                                                    <div className="flex justify-between col-span-2 border-t pt-1 mt-1">
                                                                        <span className="text-slate-500">SpO2:</span>
                                                                        <span className="font-bold text-slate-800 dark:text-slate-200">{activeTrip.patient_detail.spo2}%</span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="border border-dashed border-slate-200 dark:border-slate-800 p-4 rounded-xl text-center text-xs text-slate-450">
                                                Belum ada detail data pasien dari pemesan.
                                            </div>
                                        )}

                                        {/* Action Buttons berdasarkan status */}
                                        <div className="space-y-2">
                                            {activeTrip.status === 'awaiting_driver_response' && (
                                                <button 
                                                    onClick={handleAcceptTrip}
                                                    className="w-full bg-red-600 hover:bg-red-700 text-white rounded-lg py-2.5 text-xs font-bold shadow transition animate-pulse"
                                                >
                                                    Terima Panggilan Darurat (SOS)
                                                </button>
                                            )}

                                            {activeTrip.status === 'confirmed' && (
                                                <button 
                                                    onClick={() => handleUpdateTripStatus('on_the_way')}
                                                    className="w-full bg-teal-600 hover:bg-teal-700 text-white rounded-lg py-2.5 text-xs font-bold shadow transition"
                                                >
                                                    Mulai Menuju Lokasi Jemput
                                                </button>
                                            )}

                                            {activeTrip.status === 'on_the_way' && (
                                                <button 
                                                    onClick={() => handleUpdateTripStatus('arrived')}
                                                    className="w-full bg-teal-600 hover:bg-teal-700 text-white rounded-lg py-2.5 text-xs font-bold shadow transition"
                                                >
                                                    Ambulans Tiba di Lokasi Jemput
                                                </button>
                                            )}

                                            {activeTrip.status === 'arrived' && (
                                                <button 
                                                    onClick={() => handleUpdateTripStatus('transporting')}
                                                    className="w-full bg-teal-600 hover:bg-teal-700 text-white rounded-lg py-2.5 text-xs font-bold shadow transition"
                                                >
                                                    Mulai Antar Pasien ke RS
                                                </button>
                                            )}

                                            {activeTrip.status === 'transporting' && (
                                                <button 
                                                    onClick={() => handleUpdateTripStatus('completed')}
                                                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg py-2.5 text-xs font-bold shadow transition"
                                                >
                                                    Perjalanan Selesai
                                                </button>
                                            )}

                                            {showCancelConfirm ? (
                                                <div className="space-y-2 p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-xl text-center">
                                                    <p className="text-[11px] font-bold text-red-700 dark:text-red-400">Yakin ingin membatalkan tugas perjalanan ini?</p>
                                                    <div className="flex gap-2">
                                                        <button
                                                            onClick={() => {
                                                                handleUpdateTripStatus('cancelled');
                                                                setShowCancelConfirm(false);
                                                            }}
                                                            className="flex-1 bg-red-600 hover:bg-red-700 text-white py-1.5 rounded-lg text-[10px] font-black uppercase transition cursor-pointer"
                                                        >
                                                            Ya, Batal
                                                        </button>
                                                        <button
                                                            onClick={() => setShowCancelConfirm(false)}
                                                            className="flex-1 bg-slate-250 hover:bg-slate-300 text-slate-700 py-1.5 rounded-lg text-[10px] font-black uppercase transition cursor-pointer"
                                                        >
                                                            Tidak
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <button 
                                                    onClick={() => setShowCancelConfirm(true)}
                                                    className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg py-2 text-xs font-bold transition cursor-pointer"
                                                >
                                                    Batalkan Tugas
                                                </button>
                                            )}
                                        </div>

                                        {/* PLOT OBSERVASI KLINIS UNTUK PERAWAT DI AKUN DRIVER (STATUS: TRANSPORTING) */}
                                        {activeTrip.status === 'transporting' && (
                                            <form onSubmit={handleSaveStructuredCondition} className="border border-slate-200 dark:border-slate-800 p-4 rounded-xl space-y-4 bg-slate-50 dark:bg-slate-900/30">
                                                <div>
                                                    <span className="text-[10px] uppercase font-black text-teal-600 dark:text-teal-400 block tracking-wider mb-1">📋 Lembar Observasi Klinis Pasien (Khusus Perawat)</span>
                                                    <p className="text-[10px] text-slate-500">Perawat silakan isi vital sign pasien selama perjalanan rujukan ke IGD tujuan.</p>
                                                </div>

                                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                                    <div>
                                                        <label className="block text-[10px] font-bold text-slate-500 mb-1">Tensi Darah (mmHg)</label>
                                                        <input 
                                                            type="text" 
                                                            placeholder="120/80" 
                                                            value={tensi} 
                                                            onChange={(e) => setTensi(e.target.value)} 
                                                            className="w-full text-xs border border-slate-200 rounded-lg p-2 bg-white dark:bg-slate-950 dark:border-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-[10px] font-bold text-slate-500 mb-1">Suhu Badan (°C)</label>
                                                        <input 
                                                            type="text" 
                                                            placeholder="36.5" 
                                                            value={suhu} 
                                                            onChange={(e) => setSuhu(e.target.value)} 
                                                            className="w-full text-xs border border-slate-200 rounded-lg p-2 bg-white dark:bg-slate-950 dark:border-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-[10px] font-bold text-slate-500 mb-1">Nadi (bpm)</label>
                                                        <input 
                                                            type="text" 
                                                            placeholder="80" 
                                                            value={nadi} 
                                                            onChange={(e) => setNadi(e.target.value)} 
                                                            className="w-full text-xs border border-slate-200 rounded-lg p-2 bg-white dark:bg-slate-950 dark:border-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-[10px] font-bold text-slate-500 mb-1">Napas (x/menit)</label>
                                                        <input 
                                                            type="text" 
                                                            placeholder="18" 
                                                            value={pernapasan} 
                                                            onChange={(e) => setPernapasan(e.target.value)} 
                                                            className="w-full text-xs border border-slate-200 rounded-lg p-2 bg-white dark:bg-slate-950 dark:border-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500"
                                                        />
                                                    </div>
                                                    <div className="col-span-2 sm:col-span-1">
                                                        <label className="block text-[10px] font-bold text-slate-500 mb-1">SpO2 (%)</label>
                                                        <input 
                                                            type="text" 
                                                            placeholder="98" 
                                                            value={spo2} 
                                                            onChange={(e) => setSpo2(e.target.value)} 
                                                            className="w-full text-xs border border-slate-200 rounded-lg p-2 bg-white dark:bg-slate-950 dark:border-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500"
                                                        />
                                                    </div>
                                                </div>

                                                <div>
                                                    <label className="block text-[10px] font-bold text-slate-500 mb-1">Catatan Tambahan Kondisi Pasien</label>
                                                    <textarea
                                                        value={kondisiLain}
                                                        onChange={(e) => setKondisiLain(e.target.value)}
                                                        placeholder="Keluhan tambahan, terapi oksigen, dll..."
                                                        className="w-full text-xs border border-slate-200 rounded-lg p-2 bg-white dark:bg-slate-950 dark:border-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500 min-h-[60px]"
                                                    />
                                                </div>

                                                <button
                                                    type="submit"
                                                    className="w-full bg-teal-700 hover:bg-teal-600 text-white rounded-lg py-2.5 text-xs font-black shadow uppercase transition tracking-wide cursor-pointer"
                                                >
                                                    Simpan Catatan Observasi Pasien
                                                </button>
                                            </form>
                                        )}

                                    {currentUser.institution?.type === 'relawan' && (
                                        <form onSubmit={handleSavePatientCondition} className="border border-slate-100 dark:border-slate-800 p-4 rounded-xl space-y-3 bg-slate-50/20">
                                            <span className="text-[10px] uppercase font-black text-slate-450 block tracking-wider">Input Kondisi Pasien (Kru Relawan)</span>
                                            <textarea
                                                value={patientCondition}
                                                onChange={(e) => setPatientCondition(e.target.value)}
                                                placeholder="Tulis ringkasan kondisi medis pasien di sini..."
                                                className="w-full text-xs border border-slate-200 rounded-lg p-2 focus:outline-none focus:border-slate-400 min-h-[60px] dark:bg-slate-950 dark:border-slate-850"
                                            />
                                            <button
                                                type="submit"
                                                className="w-full bg-slate-900 text-white hover:bg-slate-800 rounded-lg py-2 text-xs font-bold uppercase transition"
                                            >
                                                Simpan Catatan Pasien
                                            </button>
                                        </form>
                                    )}

                                    {/* GPS Broadcaster Control */}
                                    {['on_the_way', 'transporting'].includes(activeTrip.status) && (
                                        <div className="border border-slate-100 dark:border-slate-800 p-4 rounded-xl space-y-3 bg-slate-50/20 text-center">
                                            <span className="text-[10px] uppercase font-black text-slate-400 block tracking-wider">Pemancar Koordinat GPS</span>
                                            
                                            <div className="flex flex-col gap-2">
                                                {/* Option 1: Real GPS */}
                                                <button 
                                                    type="button"
                                                    onClick={() => {
                                                        if (!isBroadcastingRealGps) {
                                                            setIsSimulatingGps(false);
                                                        }
                                                        setIsBroadcastingRealGps(!isBroadcastingRealGps);
                                                    }}
                                                    className={`w-full py-2.5 rounded-lg text-xs font-black tracking-wide uppercase transition shadow-sm ${isBroadcastingRealGps ? 'bg-emerald-600 text-white animate-pulse' : 'bg-slate-800 text-white'}`}
                                                >
                                                    {isBroadcastingRealGps ? '⏹️ Hentikan Geolocation Riil' : '📡 Aktifkan GPS Riil Perangkat'}
                                                </button>

                                                {/* Option 2: Mock Simulator */}
                                                {!(import.meta.env.PROD || process.env.NODE_ENV === 'production') && (
                                                    <button 
                                                        type="button"
                                                        onClick={() => {
                                                            if (!isSimulatingGps) {
                                                                setIsBroadcastingRealGps(false);
                                                            }
                                                            setIsSimulatingGps(!isSimulatingGps);
                                                        }}
                                                        className={`w-full py-2.5 rounded-lg text-xs font-black tracking-wide uppercase transition shadow-sm ${isSimulatingGps ? 'bg-teal-600 text-white animate-pulse' : 'bg-slate-200 text-slate-800 hover:bg-slate-300'}`}
                                                    >
                                                        {isSimulatingGps ? '⏹️ Hentikan Simulator GPS' : '▶️ Aktifkan Simulator GPS Bergerak'}
                                                    </button>
                                                )}
                                            </div>
                                            
                                            <span className="text-[10px] text-slate-450 block font-mono">
                                                {isBroadcastingRealGps && '✓ Geolocation Aktif: memancarkan koordinat fisik browser.'}
                                                {isSimulatingGps && '✓ Simulasi Aktif: rute Gedung Sate ke Cihampelas.'}
                                                {!isBroadcastingRealGps && !isSimulatingGps && 'Pemancar GPS dinonaktifkan.'}
                                            </span>
                                        </div>
                                    )}
                                    </div>
                                </div>
                            ) : (
                                <p className="text-xs text-slate-400 text-center py-6">Saat ini Anda tidak memiliki tugas aktif berjalan. Status armada Anda siaga di radar pemesanan.</p>
                            )}
                        </div>
                    )}
            </div>

            {/* CHECKLIST MODAL KONDISI ARMADA */}
            {showChecklistModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
                        <div className="text-center">
                            <h3 className="font-extrabold text-base text-slate-800 dark:text-slate-100">📋 Checklist Kondisi Ambulans</h3>
                            <p className="text-xs text-slate-450 mt-1">Harap verifikasi kondisi medis & logistik kendaraan sebelum mulai bertugas.</p>
                        </div>
                        <form onSubmit={handleChecklistSubmit} className="space-y-4">
                            <div className="space-y-3">
                                <div>
                                    <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Status Bahan Bakar (BBM)</label>
                                    <select 
                                        value={fuelStatus}
                                        onChange={(e) => setFuelStatus(e.target.value)}
                                        className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-800 p-2.5 bg-white dark:bg-slate-950 focus:outline-none"
                                    >
                                        <option value="fully">Penuh (Fully)</option>
                                        <option value="half">Setengah (Half)</option>
                                        <option value="low">Sangat Rendah (Low)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Status Tabung Oksigen</label>
                                    <select 
                                        value={oxygenStatus}
                                        onChange={(e) => setOxygenStatus(e.target.value)}
                                        className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-800 p-2.5 bg-white dark:bg-slate-950 focus:outline-none"
                                    >
                                        <option value="fully">Penuh (Fully)</option>
                                        <option value="half">Setengah (Half)</option>
                                        <option value="low">Rendah (Low)</option>
                                        <option value="none">Kosong (None)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Kelengkapan Alat & Obat Medis</label>
                                    <select 
                                        value={medicalSuppliesStatus}
                                        onChange={(e) => setMedicalSuppliesStatus(e.target.value)}
                                        className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-800 p-2.5 bg-white dark:bg-slate-950 focus:outline-none"
                                    >
                                        <option value="complete">Lengkap & Steril (Complete)</option>
                                        <option value="incomplete">Kurang / Butuh Restock (Incomplete)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Catatan Fisik Kendaraan</label>
                                    <textarea
                                        value={checklistNotes}
                                        onChange={(e) => setChecklistNotes(e.target.value)}
                                        placeholder="Contoh: Ban kanan agak kurang angin, tabung cadangan ada..."
                                        className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-800 p-2.5 min-h-[60px] dark:bg-slate-950 focus:outline-none"
                                    />
                                </div>
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button 
                                    type="button" 
                                    onClick={() => setShowChecklistModal(false)}
                                    className="flex-1 py-2 text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300 rounded-lg transition"
                                >
                                    Batal
                                </button>
                                <button 
                                    type="submit" 
                                    className="flex-1 py-2 text-xs font-bold bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition shadow-md"
                                >
                                    Selesai & Ikat Armada
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </AppLayout>
    );
}
