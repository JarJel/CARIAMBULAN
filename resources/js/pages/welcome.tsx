import { useState, useEffect } from 'react';
import { Head, usePage, router } from '@inertiajs/react';
import AppLayout from '../layouts/AppLayout';
import Map, { MapMarker } from '../components/Map';

export default function Welcome({ initialActiveSosOrder = null }: { initialActiveSosOrder?: any }) {
    const { auth } = usePage().props as any;
    const currentUser = auth?.user || null;

    // 1. Geolokasi & Radar State
    const [userLocation, setUserLocation] = useState<[number, number]>([-6.902481, 107.618810]); // Default Bandung (Gedung Sate)
    const [ambulances, setAmbulances] = useState<any[]>([]);
    const [mapMarkers, setMapMarkers] = useState<MapMarker[]>([]);
    const [isLoadingRadar, setIsLoadingRadar] = useState(false);
    const [gpsFailed, setGpsFailed] = useState(false);
    const [sosAddress, setSosAddress] = useState('');
    const [sosAddressCoords, setSosAddressCoords] = useState<[number, number] | null>(null);
    const [sosAddressValidated, setSosAddressValidated] = useState(false);

    // 2. Tab & Form State
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // 3. Sewa Form State
    const [pickupAddress, setPickupAddress] = useState('');
    const [pickupCoords, setPickupCoords] = useState<[number, number] | null>(null);
    const [destAddress, setDestAddress] = useState('');
    const [destCoords, setDestCoords] = useState<[number, number] | null>(null);
    const [bpjsCard, setBpjsCard] = useState('');
    const [calculatedFare, setCalculatedFare] = useState<number | null>(null);
    const [distanceKm, setDistanceKm] = useState<number | null>(null);
    const [selectedAmbulanceId, setSelectedAmbulanceId] = useState<number | null>(null);

    // 4. Event Form State
    const [eventName, setEventName] = useState('');
    const [eventDate, setEventDate] = useState('');
    const [eventDuration, setEventDuration] = useState(1);
    const [eventPdf, setEventPdf] = useState<File | null>(null);

    // 5. Active SOS State
    const [activeSosOrder, setActiveSosOrder] = useState<any | null>(initialActiveSosOrder);
    const [showCancelConfirm, setShowCancelConfirm] = useState(false);
    const [guestPhone, setGuestPhone] = useState('');
    const [mapZoom, setMapZoom] = useState(13);

    // Dapatkan Lokasi GPS Browser saat Load Pertama
    useEffect(() => {
        if (initialActiveSosOrder && !['completed', 'cancelled'].includes(initialActiveSosOrder.status)) {
            router.visit(`/orders/${initialActiveSosOrder.id}/tracking`);
            return;
        }
        if (initialActiveSosOrder) {
            const lat = parseFloat(initialActiveSosOrder.pickup_latitude ?? -6.902);
            const lng = parseFloat(initialActiveSosOrder.pickup_longitude ?? 107.618);

            if (initialActiveSosOrder.ambulance) {
                const ambLat = initialActiveSosOrder.ambulance.latitude ? parseFloat(initialActiveSosOrder.ambulance.latitude) : -6.917;
                const ambLng = initialActiveSosOrder.ambulance.longitude ? parseFloat(initialActiveSosOrder.ambulance.longitude) : 107.619;
                setUserLocation([ambLat, ambLng]);
                setMapZoom(16);
                setMapMarkers([
                    {
                        position: [lat, lng],
                        title: 'Lokasi Anda',
                        popup: '<b>Lokasi Jemput Darurat</b>',
                        iconType: 'user'
                    },
                    {
                        position: [ambLat, ambLng],
                        title: `Ambulans ${initialActiveSosOrder.ambulance.plate_number}`,
                        popup: `<b>Ambulans Siaga</b><br/>Status: ${initialActiveSosOrder.status}`,
                        iconType: initialActiveSosOrder.ambulance.category === 'emergency' ? 'ambulance_emergency' : 'ambulance_non_emergency'
                    }
                ]);
            } else {
                setUserLocation([lat, lng]);
                setMapZoom(14);
                setMapMarkers([
                    {
                        position: [lat, lng],
                        title: 'Lokasi Anda',
                        popup: '<b>Lokasi Jemput Darurat</b>',
                        iconType: 'user'
                    }
                ]);
            }
        } else {
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        const coords: [number, number] = [position.coords.latitude, position.coords.longitude];
                        setUserLocation(coords);
                        setGpsFailed(false);
                        fetchRadar(coords[0], coords[1]);
                    },
                    (error) => {
                        console.warn("Akses lokasi ditolak atau gagal, menggunakan koordinat default.");
                        setGpsFailed(true);
                        fetchRadar(userLocation[0], userLocation[1]);
                    },
                    { enableHighAccuracy: true, timeout: 8000 }
                );
            } else {
                console.warn("Geolocation tidak didukung oleh browser.");
                setGpsFailed(true);
                fetchRadar(userLocation[0], userLocation[1]);
            }
        }
    }, []);

    // Polling data SOS aktif secara real-time
    useEffect(() => {
        if (!activeSosOrder || ['completed', 'cancelled', 'no_ambulance_available'].includes(activeSosOrder.status)) return;

        const interval = setInterval(async () => {
            try {
                const res = await fetch(`/api/orders/${activeSosOrder.id}`);
                const data = await res.json();
                if (data.status === 'success') {
                    setActiveSosOrder(data.order);
                    
                    // Update map markers to show the moving ambulance if driver has accepted
                    if (data.order.ambulance) {
                        const ambCoords: [number, number] = [
                            data.order.ambulance.latitude ? parseFloat(data.order.ambulance.latitude) : -6.917,
                            data.order.ambulance.longitude ? parseFloat(data.order.ambulance.longitude) : 107.619
                        ];
                        
                        setUserLocation(ambCoords);
                        setMapZoom(16);
                        setMapMarkers([
                            {
                                position: [
                                    data.order.pickup_latitude ? parseFloat(data.order.pickup_latitude) : -6.917,
                                    data.order.pickup_longitude ? parseFloat(data.order.pickup_longitude) : 107.619
                                ],
                                title: 'Lokasi Anda',
                                popup: '<b>Lokasi Jemput Darurat</b>',
                                iconType: 'user'
                            },
                            {
                                position: ambCoords,
                                title: `Ambulans ${data.order.ambulance.plate_number}`,
                                popup: `<b>Ambulans Siaga</b><br/>Status: ${data.order.status}`,
                                iconType: data.order.ambulance.category === 'emergency' ? 'ambulance_emergency' : 'ambulance_non_emergency'
                            }
                        ]);
                    }
                }
            } catch (err) {
                console.error("Gagal memperbarui status SOS:", err);
            }
        }, 4000);

        return () => clearInterval(interval);
    }, [activeSosOrder]);

    // Ambil Data Ambulans Siaga (Radar API)
    const fetchRadar = async (lat: number, lng: number) => {
        setIsLoadingRadar(true);
        try {
            const res = await fetch(`/api/radar?latitude=${lat}&longitude=${lng}&radius_km=10`);
            const data = await res.json();
            if (data.status === 'success') {
                const fetchedAmbs = data.ambulances || [];
                setAmbulances(fetchedAmbs);
                
                // Siapkan markers untuk di-render di peta
                const markers: MapMarker[] = [
                    // Marker User
                    {
                        position: [lat, lng],
                        title: 'Lokasi Anda',
                        popup: '<b>Lokasi Anda saat ini</b>',
                        iconType: 'user'
                    },
                    // Marker Ambulans Terdekat
                    ...fetchedAmbs.map((amb: any) => ({
                        position: [
                            amb.latitude ? parseFloat(amb.latitude) : -6.917,
                            amb.longitude ? parseFloat(amb.longitude) : 107.619
                        ],
                        title: `Ambulans ${amb.plate_number}`,
                        popup: `
                            <div class="p-2 font-sans text-xs">
                                <h3 class="font-bold text-slate-800 text-sm">Ambulans ${amb.plate_number}</h3>
                                <p class="mt-1">Kategori: ${amb.category === 'emergency' ? '🚨 Gawat Darurat' : amb.category === 'corpse' ? '🟢 Keranda Jenazah' : '🟢 Transportasi / Sewa'}</p>
                                <p>Instansi: ${amb.institution?.name || '-'}</p>
                                <p class="font-bold mt-1">Status: <span class="${amb.status === 'standby' ? 'text-emerald-600' : amb.status === 'dispatching' ? 'text-amber-500' : 'text-purple-600'}">${amb.status === 'standby' ? 'STANDBY' : amb.status === 'dispatching' ? 'DIPANGGIL' : 'BERTUGAS'}</span></p>
                                <p class="font-semibold mt-1">Rating: ${amb.average_rating || '0.0'} / 5.0</p>
                                <p class="text-slate-400 mt-0.5">Jarak: ${(amb.distance / 1000).toFixed(2)} KM</p>
                            </div>
                        `,
                        iconType: amb.category === 'emergency' ? 'ambulance_emergency' : 'ambulance_non_emergency'
                    }))
                ];
                setMapMarkers(markers);
            }
        } catch (err) {
            console.error("Gagal memanggil API radar:", err);
        } finally {
            setIsLoadingRadar(false);
        }
    };

    // Geolocation trigger manual dari tombol Hero
    const handleTriggerGps = () => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const coords: [number, number] = [position.coords.latitude, position.coords.longitude];
                    setUserLocation(coords);
                    setGpsFailed(false);
                    fetchRadar(coords[0], coords[1]);
                },
                (error) => {
                    alert("Gagal mendeteksi lokasi GPS Anda.");
                }
            );
        }
    };

    // Geocoding untuk Form Penjemputan
    const handleSearchPickup = async () => {
        if (!pickupAddress) return;
        try {
            const res = await fetch(`/api/geocode?address=${encodeURIComponent(pickupAddress)}`);
            const data = await res.json();
            if (data.status === 'success') {
                const coords: [number, number] = [data.latitude, data.longitude];
                setPickupCoords(coords);
                setPickupAddress(data.formatted_address);
                setUserLocation(coords); // Posisikan peta ke lokasi jemput
                fetchRadar(coords[0], coords[1]); // Rerun radar di titik jemput
                calculateSewaFare(coords, destCoords);
            }
        } catch (err) {
            console.error(err);
        }
    };

    // Geocoding untuk Form Tujuan
    const handleSearchDest = async () => {
        if (!destAddress) return;
        try {
            const res = await fetch(`/api/geocode?address=${encodeURIComponent(destAddress)}`);
            const data = await res.json();
            if (data.status === 'success') {
                const coords: [number, number] = [data.latitude, data.longitude];
                setDestCoords(coords);
                setDestAddress(data.formatted_address);
                calculateSewaFare(pickupCoords, coords);
            }
        } catch (err) {
            console.error(err);
        }
    };

    // Kalkulasi Estimasi Tarif Sewa
    const calculateSewaFare = (pCoords: [number, number] | null, dCoords: [number, number] | null) => {
        if (!pCoords || !dCoords) return;
        
        // Jarak Haversine
        const R = 6371; // km
        const dLat = (dCoords[0] - pCoords[0]) * Math.PI / 180;
        const dLon = (dCoords[1] - pCoords[1]) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(pCoords[0] * Math.PI / 180) * Math.cos(dCoords[0] * Math.PI / 180) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        const d = R * c;
        
        setDistanceKm(parseFloat(d.toFixed(2)));

        const base = 150000;
        const perKm = 20000;
        const total = base + (d * perKm);
        setCalculatedFare(Math.round(total));
    };

    // Geocoding untuk Form SOS
    const handleSearchSosAddress = async () => {
        if (!sosAddress) return;
        try {
            const res = await fetch(`/api/geocode?address=${encodeURIComponent(sosAddress)}`);
            const data = await res.json();
            if (data.status === 'success') {
                const coords: [number, number] = [data.latitude, data.longitude];
                setSosAddressCoords(coords);
                setSosAddress(data.formatted_address);
                setSosAddressValidated(true);
                setUserLocation(coords); // Posisikan peta ke lokasi SOS
                fetchRadar(coords[0], coords[1]); // Rerun radar di titik SOS
            } else {
                alert('Alamat tidak ditemukan. Harap ketik alamat yang lebih detail.');
            }
        } catch (err) {
            console.error(err);
        }
    };

    // Submit SOS Darurat
    const handleSosDispatch = async () => {
        setMessage(null);

        let lat = userLocation[0];
        let lng = userLocation[1];
        let addr = 'Lokasi Darurat GPS Klien';

        if (gpsFailed) {
            if (!sosAddressCoords) {
                setMessage({ type: 'error', text: 'Harap ketik dan cari alamat penjemputan darurat Anda terlebih dahulu.' });
                return;
            }
            lat = sosAddressCoords[0];
            lng = sosAddressCoords[1];
            addr = sosAddress;
        }

        if (!currentUser) {
            // Tamu (Guest) Flow
            if (!guestPhone.trim()) {
                setMessage({ type: 'error', text: 'Harap masukkan Nomor HP Anda terlebih dahulu untuk koordinasi darurat.' });
                return;
            }

            const requestBody: any = {
                guest_phone: guestPhone,
                pickup_latitude: lat,
                pickup_longitude: lng,
                pickup_address: addr
            };
            if (selectedAmbulanceId) {
                const amb = ambulances.find((a: any) => a.id === selectedAmbulanceId);
                if (amb && amb.is_free_service_eligible) {
                    requestBody.ambulance_id = selectedAmbulanceId;
                }
            }

            try {
                const res = await fetch('/api/orders/sos/guest', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                    body: JSON.stringify(requestBody)
                });
                const data = await res.json();
                if (res.status === 201) {
                    localStorage.setItem('guest_sos_token_' + data.order.id, data.guest_session_token);
                    router.visit(`/track/${data.order.id}/${data.guest_session_token}`);
                } else {
                    setMessage({ type: 'error', text: data.message || 'Gagal mengirim sinyal SOS.' });
                }
            } catch (err) {
                setMessage({ type: 'error', text: 'Koneksi gagal ke server.' });
            }
            return;
        }

        // Terautentikasi Flow (Standard)
        const requestBody: any = {
            user_id: currentUser.id,
            pickup_latitude: lat,
            pickup_longitude: lng,
            pickup_address: addr
        };
        if (selectedAmbulanceId) {
            const amb = ambulances.find((a: any) => a.id === selectedAmbulanceId);
            if (amb && amb.is_free_service_eligible) {
                requestBody.ambulance_id = selectedAmbulanceId;
            }
        }

        try {
            const res = await fetch('/api/orders/sos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify(requestBody)
            });
            const data = await res.json();
            if (res.status === 201) {
                router.visit(`/orders/${data.order.id}/tracking`);
            } else {
                setMessage({ type: 'error', text: data.message || 'Gagal mengirim sinyal SOS.' });
            }
        } catch (err) {
            setMessage({ type: 'error', text: 'Koneksi gagal ke server.' });
        }
    };

    // Submit Peminjaman Sewa
    const handleSewaSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setMessage(null);

        if (!currentUser) {
            setMessage({ type: 'error', text: 'Harap masuk (login) terlebih dahulu untuk memesan sewa ambulans.' });
            return;
        }

        if (!pickupCoords || !destCoords) {
            setMessage({ type: 'error', text: 'Mohon lengkapi koordinat penjemputan dan tujuan.' });
            return;
        }

        const now = new Date();
        const start = new Date(now.getTime() + 30 * 60 * 1000);
        const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
        const startStr = start.toISOString().slice(0, 19).replace('T', ' ');
        const endStr = end.toISOString().slice(0, 19).replace('T', ' ');

        try {
            const res = await fetch('/api/orders/sewa', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify({
                    user_id: currentUser.id,
                    ambulance_id: selectedAmbulanceId || (ambulances.filter(a => a.status === 'standby')[0]?.id || null),
                    pickup_latitude: pickupCoords[0],
                    pickup_longitude: pickupCoords[1],
                    pickup_address: pickupAddress,
                    destination_latitude: destCoords[0],
                    destination_longitude: destCoords[1],
                    destination_address: destAddress,
                    bpjs_number: bpjsCard || null,
                    scheduled_start_time: startStr,
                    scheduled_end_time: endStr
                })
            });
            const data = await res.json();
            if (res.status === 201) {
                setMessage({
                    type: 'success',
                    text: `Booking Sewa Berhasil! Nomor order: #${data.order.id}. Total Tarif: Rp ${data.order.fare_amount.toLocaleString('id-ID')}`
                });
                // Redirect ke tracking setelah 1.5 detik
                setTimeout(() => {
                    router.visit(`/orders/${data.order.id}/tracking`);
                }, 1500);
            } else {
                setMessage({ type: 'error', text: data.message || 'Gagal memesan sewa ambulans.' });
            }
        } catch (err) {
            setMessage({ type: 'error', text: 'Koneksi gagal ke server.' });
        }
    };

    // Submit Proposal Event
    const handleEventSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setMessage(null);

        if (!currentUser) {
            setMessage({ type: 'error', text: 'Harap masuk (login) terlebih dahulu untuk mengajukan proposal event.' });
            return;
        }

        if (!eventPdf) {
            setMessage({ type: 'error', text: 'Harap lampirkan berkas e-Proposal PDF.' });
            return;
        }

        const start = eventDate ? `${eventDate} 08:00:00` : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10) + ' 08:00:00';
        const startDateObj = new Date(start);
        const endDateObj = new Date(startDateObj.getTime() + eventDuration * 24 * 60 * 60 * 1000);
        const end = endDateObj.toISOString().slice(0, 19).replace('T', ' ');

        const formData = new FormData();
        formData.append('user_id', currentUser.id.toString());
        formData.append('pickup_latitude', userLocation[0].toString());
        formData.append('pickup_longitude', userLocation[1].toString());
        formData.append('pickup_address', `Standby Event: ${eventName}`);
        formData.append('event_name', eventName);
        formData.append('duration_days', eventDuration.toString());
        formData.append('proposal_pdf', eventPdf);
        formData.append('scheduled_start_time', start);
        formData.append('scheduled_end_time', end);

        try {
            const res = await fetch('/api/orders/event', {
                method: 'POST',
                headers: { 'Accept': 'application/json' },
                body: formData
            });
            const data = await res.json();
            if (res.status === 201) {
                setMessage({
                    type: 'success',
                    text: `Pengajuan Proposal Berhasil! Proposal Anda sedang di-review oleh admin fasyankes.`
                });
            } else {
                setMessage({ type: 'error', text: data.message || 'Gagal mengirimkan proposal.' });
            }
        } catch (err) {
            setMessage({ type: 'error', text: 'Koneksi gagal ke server.' });
        }
    };

    // Ambil rincian ambulans terpilih untuk panel kanan
    const selectedAmbulance = ambulances.find(amb => amb.id === selectedAmbulanceId) || null;

    // Spesifikasi alat per kategori
    const getAmbulanceSpecs = (category: string) => {
        switch (category) {
            case 'emergency':
                return 'Oksigen Standar, Tandu Otomatis, P3K Advance, Defibrillator.';
            case 'non-emergency':
                return 'AC, Tandu Standar, Kursi Roda, P3K Basic.';
            case 'corpse':
                return 'Keranda Jenazah, AC, Kursi Pengiring.';
            default:
                return 'Fasilitas Medis Standar.';
        }
    };

    // Tentukan perutean dinamis untuk peta homepage jika ada SOS aktif
    let routingBetween: any = null;
    if (activeSosOrder && activeSosOrder.ambulance) {
        const userCoords: [number, number] = [
            activeSosOrder.pickup_latitude ? parseFloat(activeSosOrder.pickup_latitude) : -6.917,
            activeSosOrder.pickup_longitude ? parseFloat(activeSosOrder.pickup_longitude) : 107.619
        ];
        const ambCoords: [number, number] = [
            activeSosOrder.ambulance.latitude ? parseFloat(activeSosOrder.ambulance.latitude) : -6.917,
            activeSosOrder.ambulance.longitude ? parseFloat(activeSosOrder.ambulance.longitude) : 107.619
        ];
        const destCoordsVal: [number, number] | null = activeSosOrder.destination_latitude ? [
            parseFloat(activeSosOrder.destination_latitude),
            parseFloat(activeSosOrder.destination_longitude)
        ] : null;

        if (['confirmed', 'on_the_way', 'arrived'].includes(activeSosOrder.status)) {
            routingBetween = {
                start: ambCoords,
                end: userCoords,
                color: '#D9383A' // Merah menuju jemput
            };
        } else if (activeSosOrder.status === 'transporting' && destCoordsVal) {
            routingBetween = {
                start: ambCoords,
                end: destCoordsVal,
                color: '#0D9488' // Teal menuju RS
            };
        }
    }

    return (
        <AppLayout activeMenu="booking">
            <Head title="CARI AMBULAN - Layanan Ambulans Terintegrasi Bandung" />

            <div className="bg-white text-[#1A1A1A] font-sans min-h-screen flex flex-col">
                
                {/* 2. HERO SECTION */}
                <section className="bg-[#F8F9FA] border-b border-gray-200 py-16 px-6 text-center shrink-0">
                    <div className="max-w-3xl mx-auto">
                        <h1 className="text-3xl md:text-4xl font-black tracking-tight mb-4 uppercase">
                            Deteksi Ambulans Terdekat di Sekitar Anda
                        </h1>
                        <p className="text-gray-600 text-sm md:text-base mb-8 max-w-xl mx-auto leading-relaxed">
                            Aktifkan lokasi GPS untuk memetakan armada darurat, sewa non-darurat, dan mobil jenazah di Kota Bandung secara real-time.
                        </p>
                        <button 
                            onClick={handleTriggerGps}
                            className="bg-[#D9383A] text-white px-8 py-4 text-xs font-bold tracking-widest uppercase shadow-sm hover:bg-red-750 transition duration-200"
                        >
                            Aktifkan GPS & Cari Armada
                        </button>
                        <p className="text-xs text-gray-500 mt-4 font-mono">
                            [ Sistem mendeteksi {ambulances.length} armada aktif dalam radius 10 km dari titik Anda ]
                        </p>
                    </div>
                </section>

                {/* 3. SPLIT LAYOUT (MAP & INFO PANEL) */}
                <main className="max-w-7xl w-full mx-auto grid grid-cols-1 lg:grid-cols-12 border-b border-gray-200 divide-y lg:divide-y-0 lg:divide-x divide-gray-200">
                    
                    {/* KOLOM KIRI: MAP VIEW */}
                    <div className="lg:col-span-7 bg-[#E5E7EB] min-h-[400px] lg:min-h-[550px] relative overflow-hidden flex flex-col">
                        <div className="flex-1 w-full h-full relative z-0">
                            <Map center={userLocation} zoom={mapZoom} markers={mapMarkers} routingBetween={routingBetween} />
                        </div>
                        <span className="absolute bottom-4 left-4 text-xs font-mono text-gray-500 bg-white/80 px-2 py-1 z-10 border border-gray-200/50 shadow-sm">[ Simulasi Radar Peta Digital ]</span>
                    </div>

                    {/* KOLOM KANAN: DETAILED INFO PANEL */}
                    <div className="lg:col-span-5 p-8 bg-white flex flex-col justify-between min-h-[450px]">
                        <div>
                            {/* Message Banner */}
                            {message && (
                                <div className={`mb-6 p-4 border text-xs font-mono uppercase tracking-wider ${message.type === 'success' ? 'bg-emerald-50 border-emerald-250 text-emerald-800' : 'bg-red-50 border-red-200 text-red-700'}`}>
                                    [ {message.text} ]
                                </div>
                            )}

                            {/* Dropdown Selector Armada (Untuk menampilkan detail di panel) */}
                            <div className="mb-6">
                                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Pilih Armada Untuk Rincian</label>
                                <select 
                                    value={selectedAmbulanceId || ''} 
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        if (val) {
                                            const id = parseInt(val);
                                            setSelectedAmbulanceId(id);
                                            const amb = ambulances.find((a: any) => a.id === id);
                                            if (amb) {
                                                setUserLocation([
                                                    parseFloat(amb.latitude ?? -6.902),
                                                    parseFloat(amb.longitude ?? 107.618)
                                                ]);
                                                setMapZoom(16);
                                            }
                                        } else {
                                            setSelectedAmbulanceId(null);
                                            setMapZoom(13);
                                        }
                                    }}
                                    className="w-full border border-gray-300 p-3 text-xs font-mono tracking-wider uppercase focus:outline-none focus:border-black bg-white rounded-none cursor-pointer"
                                >
                                    <option value="">-- PILIH UNIT ARMADA --</option>
                                    {ambulances.map((amb: any) => (
                                        <option key={amb.id} value={amb.id}>
                                            Ambulans {amb.plate_number} ({amb.category.toUpperCase()}) - {(amb.distance / 1000).toFixed(2)} KM
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <hr className="border-gray-200 my-6" />

                            {activeSosOrder ? (
                                /* JIKA ADA SOS AKTIF (DASHBOARD DARURAT REAL-TIME) */
                                <div className="space-y-6">
                                    <span className="text-xs font-bold tracking-widest uppercase text-[#D9383A] block">
                                        Status Panggilan SOS
                                    </span>
                                    <h2 className="text-2xl font-black tracking-tight uppercase">
                                        Order #{activeSosOrder.id}
                                    </h2>
                                    <div className="bg-red-50/50 border border-red-200 p-4 space-y-2">
                                        <div className="flex items-center gap-2">
                                            <span className="h-2 w-2 rounded-full bg-red-600 animate-ping shrink-0"></span>
                                            <span className="text-xs font-bold text-red-800 uppercase font-mono tracking-wider">
                                                {activeSosOrder.status === 'awaiting_driver_response' && 'Mencari Driver...'}
                                                {activeSosOrder.status === 'confirmed' && 'Driver Menyetujui'}
                                                {activeSosOrder.status === 'on_the_way' && 'Menuju Lokasi Anda'}
                                                {activeSosOrder.status === 'arrived' && 'Ambulans Tiba'}
                                                {activeSosOrder.status === 'transporting' && 'Menuju Rumah Sakit'}
                                                {activeSosOrder.status === 'completed' && 'Penyelamatan Selesai'}
                                                {activeSosOrder.status === 'cancelled' && 'Dibatalkan'}
                                                {activeSosOrder.status === 'no_ambulance_available' && 'Unit Tidak Tersedia'}
                                            </span>
                                        </div>
                                        <p className="text-xs text-slate-500 leading-relaxed uppercase">
                                            {activeSosOrder.status === 'awaiting_driver_response' && 'Sistem sedang mencarikan dan mengunci unit terdekat.'}
                                            {activeSosOrder.status === 'confirmed' && 'Kru unit sedang bersiap-siap menuju titik penjemputan.'}
                                            {activeSosOrder.status === 'on_the_way' && 'Armada sedang meluncur ke koordinat Anda.'}
                                            {activeSosOrder.status === 'arrived' && 'Ambulans telah sampai di lokasi. Harap temui kru.'}
                                            {activeSosOrder.status === 'transporting' && 'Pasien sedang dibawa menuju fasyankes tujuan.'}
                                            {activeSosOrder.status === 'completed' && 'Layanan darurat selesai diproses.'}
                                            {activeSosOrder.status === 'cancelled' && 'Panggilan darurat dibatalkan oleh pengguna.'}
                                            {activeSosOrder.status === 'no_ambulance_available' && 'Semua armada sibuk. Segera hubungi 112/119.'}
                                        </p>
                                    </div>

                                    {activeSosOrder.ambulance && (
                                        <div className="space-y-3 font-mono text-xs text-gray-600 border border-gray-150 p-4">
                                            <div className="flex justify-between">
                                                <span className="font-bold">ARMADA:</span>
                                                <span>{activeSosOrder.ambulance.plate_number} ({activeSosOrder.ambulance.category.toUpperCase()})</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="font-bold">DRIV/NURS:</span>
                                                <span>{activeSosOrder.ambulance.current_driver?.name || 'Mencari'} / {activeSosOrder.ambulance.current_nurse?.name || '-'}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="font-bold">INSTANSI:</span>
                                                <span>{activeSosOrder.ambulance.institution?.name || '-'}</span>
                                            </div>
                                        </div>
                                    )}

                                    <div className="pt-4">
                                        {['awaiting_driver_response', 'confirmed', 'on_the_way', 'arrived'].includes(activeSosOrder.status) && (
                                            showCancelConfirm ? (
                                                <div className="space-y-2 p-3 bg-red-50 border border-red-200 rounded-lg text-center">
                                                    <p className="text-xs font-semibold text-red-700">Yakin ingin membatalkan panggilan darurat ini?</p>
                                                    <div className="flex gap-2">
                                                        <button
                                                            onClick={async () => {
                                                                try {
                                                                    const res = await fetch(`/api/orders/${activeSosOrder.id}/status`, {
                                                                        method: 'POST',
                                                                        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                                                                        body: JSON.stringify({ status: 'cancelled' })
                                                                    });
                                                                    if (res.ok) {
                                                                        const data = await res.json();
                                                                        setActiveSosOrder(data.order);
                                                                        setShowCancelConfirm(false);
                                                                    }
                                                                } catch (err) {
                                                                    console.error("Gagal batal:", err);
                                                                }
                                                            }}
                                                            className="flex-1 bg-red-650 hover:bg-red-700 text-white py-2 rounded text-xs font-bold uppercase transition"
                                                        >
                                                            Ya, Batal
                                                        </button>
                                                        <button
                                                            onClick={() => setShowCancelConfirm(false)}
                                                            className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 py-2 rounded text-xs font-bold uppercase transition"
                                                        >
                                                            Tidak
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={() => setShowCancelConfirm(true)}
                                                    className="w-full bg-black text-white py-3.5 text-xs font-bold tracking-widest uppercase hover:bg-gray-900 transition cursor-pointer"
                                                >
                                                    Batalkan Panggilan
                                                </button>
                                            )
                                        )}
                                        {activeSosOrder.status === 'completed' && (
                                            <button
                                                onClick={() => router.visit(`/orders/${activeSosOrder.id}/tracking`)}
                                                className="w-full bg-[#D9383A] text-white py-3.5 text-xs font-bold tracking-widest uppercase hover:bg-red-750 transition"
                                            >
                                                Beri Rating Penyelamatan
                                            </button>
                                        )}
                                        {['cancelled', 'no_ambulance_available'].includes(activeSosOrder.status) && (
                                            <button
                                                onClick={() => {
                                                    setActiveSosOrder(null);
                                                    setMessage(null);
                                                }}
                                                className="w-full bg-[#D9383A] text-white py-3.5 text-xs font-bold tracking-widest uppercase hover:bg-red-750 transition"
                                            >
                                                Buat Panggilan SOS Baru
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ) : selectedAmbulance ? (
                                /* JIKA AMBULANS DIPILIH (TAMPILKAN RINCIAN) */
                                <div className="space-y-6">
                                    <span className="text-xs font-bold tracking-widest uppercase text-[#D9383A] block">
                                        Kategori: {selectedAmbulance.category === 'emergency' ? 'Gawat Darurat' : selectedAmbulance.category === 'corpse' ? 'Keranda Jenazah' : 'Sewa / Transportasi'}
                                    </span>
                                    <h2 className="text-2xl font-black tracking-tight uppercase">
                                        Ambulans {selectedAmbulance.plate_number}
                                    </h2>
                                    
                                    <div className="space-y-4">
                                        <div>
                                            <span className="text-xs uppercase tracking-wider text-gray-500 block font-bold">Fasyankes Pemilik</span>
                                            <p className="text-sm font-medium mt-1 uppercase font-mono">{selectedAmbulance.institution?.name || '-'}</p>
                                        </div>
                                        <div>
                                            <span className="text-xs uppercase tracking-wider text-gray-500 block font-bold">Spesifikasi Alat Medis</span>
                                            <p className="text-sm font-medium mt-1">{getAmbulanceSpecs(selectedAmbulance.category)}</p>
                                        </div>
                                        <div>
                                            <span className="text-xs uppercase tracking-wider text-gray-500 block font-bold">Tarif Dasar & KM</span>
                                            <p className="text-sm font-mono mt-1">Tarif Dasar: Rp {parseFloat(selectedAmbulance.base_fare).toLocaleString('id-ID')} | Tarif / KM: Rp {parseFloat(selectedAmbulance.price_per_km).toLocaleString('id-ID')}</p>
                                        </div>
                                        <div>
                                            <span className="text-xs uppercase tracking-wider text-gray-500 block font-bold">Estimasi Jarak & Waktu Tiba</span>
                                            <p className="text-sm font-mono font-bold text-emerald-600 mt-1 uppercase">
                                                Jarak: {(selectedAmbulance.distance / 1000).toFixed(2)} KM | ETA: ± {Math.ceil(selectedAmbulance.distance / 300)} MENIT KE LOKASI ANDA
                                            </p>
                                        </div>
                                    </div>

                                    <div className="pt-4 space-y-3">
                                        {!currentUser && (
                                            <div className="bg-red-50/50 border border-red-200 p-4 space-y-2 mb-3">
                                                <label className="block text-[10px] font-bold text-red-900 uppercase tracking-widest">
                                                    Nomor HP Koordinasi Darurat (Wajib)
                                                </label>
                                                <input 
                                                    type="tel" 
                                                    placeholder="Contoh: 081234567890"
                                                    value={guestPhone}
                                                    onChange={(e) => setGuestPhone(e.target.value)}
                                                    className="w-full border border-red-300 px-3 py-2 text-xs font-mono tracking-wider focus:outline-none focus:border-red-650 bg-white"
                                                />
                                                <span className="text-[9px] text-gray-500 uppercase block font-semibold leading-tight">
                                                    * Digunakan driver untuk menghubungi Anda setibanya di lokasi.
                                                </span>
                                            </div>
                                        )}

                                        {selectedAmbulance.category === 'emergency' ? (
                                            selectedAmbulance.is_free_service_eligible ? (
                                                <button 
                                                    onClick={handleSosDispatch}
                                                    className="w-full bg-[#D9383A] text-white py-4 text-xs font-bold tracking-widest uppercase hover:bg-red-700 transition"
                                                >
                                                    Panggil SOS Unit Ini Sekarang
                                                </button>
                                            ) : (
                                                <div className="p-3 bg-amber-50 text-amber-800 text-[10px] font-bold text-center border border-amber-250 font-mono">
                                                    [ ARMADA SWASTA BERBAYAR. TIDAK MELAYANI PANGGILAN SOS GRATIS ]
                                                </div>
                                            )
                                        ) : (
                                            <div className="flex gap-2 w-full">
                                                <button 
                                                    onClick={() => {
                                                        setSelectedAmbulanceId(selectedAmbulance.id);
                                                        document.getElementById('sewa-form-section')?.scrollIntoView({ behavior: 'smooth' });
                                                    }}
                                                    className="flex-1 bg-black text-white py-4 text-[10px] font-bold tracking-widest uppercase hover:bg-gray-900 transition text-center"
                                                >
                                                    Gunakan Untuk Sewa Terjadwal
                                                </button>
                                                {selectedAmbulance.is_free_service_eligible ? (
                                                    <button 
                                                        onClick={handleSosDispatch}
                                                        className="flex-1 bg-[#D9383A] text-white py-4 text-[10px] font-bold tracking-widest uppercase hover:bg-red-700 transition text-center"
                                                    >
                                                        Panggil SOS Unit Ini
                                                    </button>
                                                ) : (
                                                    <div className="flex-1 p-2 bg-amber-50 text-amber-800 text-[9px] font-bold text-center border border-amber-250 flex items-center justify-center font-mono">
                                                        [ BERBAYAR (TIDAK ADA SOS) ]
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        <button 
                                            onClick={() => {
                                                setSelectedAmbulanceId(null);
                                                setMapZoom(13);
                                            }}
                                            className="w-full border border-gray-300 text-gray-500 py-3 text-xs font-bold tracking-widest uppercase hover:bg-gray-50 transition"
                                        >
                                            Batal Pilih Armada
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                /* TAMPILAN DEFAULT - TOMBOL PANGGIL DARURAT SOS LANGSUNG */
                                <div className="space-y-6">
                                    <span className="text-xs font-bold tracking-widest uppercase text-[#D9383A] block">
                                        Tanggap Darurat Terintegrasi
                                    </span>
                                    <h2 className="text-2xl font-black tracking-tight uppercase">
                                        Panggil Darurat Terdekat (SOS)
                                    </h2>
                                    <p className="text-gray-600 text-xs leading-relaxed uppercase">
                                        Tekan tombol di bawah untuk memanggil ambulans darurat terdekat ke lokasi Anda secara instan. Bebas biaya awal, prioritas keselamatan pasien.
                                    </p>

                                    {gpsFailed && (
                                        <div className="bg-amber-50 border border-amber-200 p-4 space-y-3">
                                            <p className="text-xs text-amber-700 font-bold uppercase">
                                                ⚠️ GPS Gagal. Harap ketik lokasi penjemputan Anda:
                                            </p>
                                            <div className="flex gap-2">
                                                <input 
                                                    type="text" 
                                                    placeholder="Ketik alamat darurat Anda..."
                                                    value={sosAddress}
                                                    onChange={(e) => {
                                                        setSosAddress(e.target.value);
                                                        setSosAddressValidated(false);
                                                    }}
                                                    className="flex-1 border border-gray-300 px-3 py-2 text-xs font-mono tracking-wider uppercase focus:outline-none focus:border-black rounded-none"
                                                />
                                                <button 
                                                    type="button" 
                                                    onClick={handleSearchSosAddress}
                                                    className="bg-black text-white px-4 py-2 text-xs font-bold uppercase transition"
                                                >
                                                    Cari
                                                </button>
                                            </div>
                                            {sosAddressValidated && (
                                                <span className="text-[10px] text-emerald-600 font-bold font-mono uppercase block">✓ Lokasi darurat terverifikasi</span>
                                            )}
                                        </div>
                                    )}

                                    {!currentUser && (
                                        <div className="bg-red-50/50 border border-red-200 p-4 space-y-2 mt-4">
                                            <label className="block text-[10px] font-bold text-red-900 uppercase tracking-widest">
                                                Nomor HP Koordinasi Darurat (Wajib)
                                            </label>
                                            <input 
                                                type="tel" 
                                                placeholder="Contoh: 081234567890"
                                                value={guestPhone}
                                                onChange={(e) => setGuestPhone(e.target.value)}
                                                className="w-full border border-red-300 px-3 py-2 text-xs font-mono tracking-wider focus:outline-none focus:border-red-650 bg-white"
                                            />
                                            <span className="text-[9px] text-gray-500 uppercase block font-semibold leading-tight">
                                                * Digunakan driver untuk menghubungi Anda setibanya di lokasi.
                                            </span>
                                        </div>
                                    )}

                                    <div className="pt-6">
                                        <button 
                                            onClick={handleSosDispatch}
                                            className="w-full bg-[#D9383A] text-white py-5 text-sm font-black tracking-widest uppercase hover:bg-red-750 transition duration-300 shadow-md flex items-center justify-center gap-2"
                                        >
                                            <span className="h-2 w-2 bg-white rounded-full animate-ping"></span>
                                            PANGGIL AMBULANS SOS SEKARANG
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </main>

                {/* 4. BOTTOM UTILITY (ALTERNATIF FORM SEWA & EVENT) */}
                <section className="max-w-7xl w-full mx-auto grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-gray-200 border-b border-gray-200">
                    
                    {/* FORM SEWA */}
                    <div id="sewa-form-section" className="p-8 space-y-4">
                        <h3 className="text-base font-black uppercase tracking-tight mb-4">Pemesanan Terjadwal (Non-Darurat)</h3>
                        
                        <form onSubmit={handleSewaSubmit} className="space-y-4">
                            {/* Titik Jemput */}
                            <div>
                                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">Lokasi Penjemputan</label>
                                <div className="flex gap-2">
                                    <input 
                                        type="text" 
                                        placeholder="Ketik lokasi jemput (contoh: Gedung Sate)..."
                                        value={pickupAddress}
                                        onChange={(e) => setPickupAddress(e.target.value)}
                                        className="flex-1 border border-gray-300 p-3 text-xs font-mono tracking-wider uppercase focus:outline-none focus:border-black rounded-none"
                                    />
                                    <button 
                                        type="button" 
                                        onClick={handleSearchPickup}
                                        className="bg-black text-white px-4 py-3 text-xs font-bold uppercase transition"
                                    >
                                        Cari
                                    </button>
                                </div>
                                {pickupCoords && (
                                    <span className="text-[9px] text-emerald-600 font-bold font-mono mt-1 block uppercase">✓ Lokasi penjemputan tervalidasi</span>
                                )}
                            </div>

                            {/* Titik Tujuan */}
                            <div>
                                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">Lokasi Tujuan</label>
                                <div className="flex gap-2">
                                    <input 
                                        type="text" 
                                        placeholder="Ketik lokasi tujuan (contoh: RS Borromeus)..."
                                        value={destAddress}
                                        onChange={(e) => setDestAddress(e.target.value)}
                                        className="flex-1 border border-gray-300 p-3 text-xs font-mono tracking-wider uppercase focus:outline-none focus:border-black rounded-none"
                                    />
                                    <button 
                                        type="button" 
                                        onClick={handleSearchDest}
                                        className="bg-black text-white px-4 py-3 text-xs font-bold uppercase transition"
                                    >
                                        Cari
                                    </button>
                                </div>
                                {destCoords && (
                                    <span className="text-[9px] text-emerald-600 font-bold font-mono mt-1 block uppercase">✓ Lokasi tujuan tervalidasi</span>
                                )}
                            </div>

                            {/* No BPJS */}
                            <div>
                                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">Nomor Kartu BPJS (Opsional)</label>
                                <input 
                                    type="text" 
                                    placeholder="Masukkan 13 digit nomor BPJS Kesehatan..."
                                    value={bpjsCard}
                                    onChange={(e) => setBpjsCard(e.target.value)}
                                    className="w-full border border-gray-300 p-3 text-xs font-mono tracking-wider uppercase focus:outline-none focus:border-black rounded-none"
                                />
                            </div>

                            {/* Pilihan Armada Standby */}
                            <div>
                                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">Pilih Unit Terdekat</label>
                                <select 
                                    value={selectedAmbulanceId || ''} 
                                    onChange={(e) => setSelectedAmbulanceId(e.target.value ? parseInt(e.target.value) : null)}
                                    className="w-full border border-gray-300 p-3 text-xs font-mono tracking-wider uppercase focus:outline-none focus:border-black bg-white rounded-none cursor-pointer"
                                >
                                    <option value="">-- PILIH UNIT STANDBY --</option>
                                    {ambulances.filter((amb: any) => amb.status === 'standby').map((amb: any) => (
                                        <option key={amb.id} value={amb.id}>
                                            Ambulans {amb.plate_number} (Jarak: {(amb.distance / 1000).toFixed(2)} KM)
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Rincian Tarif */}
                            {calculatedFare !== null && (
                                <div className="bg-[#F8F9FA] border border-gray-200 p-4 space-y-1 font-mono text-xs">
                                    <div className="flex justify-between">
                                        <span>RUTE ESTIMASI JARAK</span>
                                        <span className="font-bold">{distanceKm} KM</span>
                                    </div>
                                    <div className="flex justify-between text-sm font-bold text-[#1A1A1A] border-t border-gray-200 pt-2">
                                        <span>ESTIMASI BIAYA</span>
                                        <span className="text-[#D9383A]">
                                            {bpjsCard ? 'GRATIS (KLAIM BPJS)' : `Rp ${calculatedFare.toLocaleString('id-ID')}`}
                                        </span>
                                    </div>
                                </div>
                            )}

                            <button 
                                type="submit"
                                className="w-full bg-black text-white py-4 text-xs font-bold tracking-widest uppercase hover:bg-gray-900 transition"
                            >
                                Pesan Sewa Ambulans
                            </button>
                        </form>
                    </div>

                    {/* FORM EVENT */}
                    <div className="p-8 space-y-4">
                        <h3 className="text-base font-black uppercase tracking-tight mb-4">Peminjaman Formal Instansi (Event)</h3>
                        
                        <form onSubmit={handleEventSubmit} className="space-y-4">
                            <div>
                                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">Nama Acara / Event</label>
                                <input 
                                    type="text" 
                                    placeholder="Ketik nama event penyelenggaraan..."
                                    value={eventName}
                                    onChange={(e) => setEventName(e.target.value)}
                                    className="w-full border border-gray-300 p-3 text-xs font-mono tracking-wider uppercase focus:outline-none focus:border-black rounded-none"
                                />
                            </div>

                            <div>
                                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">Tanggal Mulai Acara</label>
                                <input 
                                    type="date" 
                                    value={eventDate}
                                    onChange={(e) => setEventDate(e.target.value)}
                                    className="w-full border border-gray-300 p-3 text-xs font-mono tracking-wider uppercase focus:outline-none focus:border-black rounded-none"
                                />
                            </div>

                            <div>
                                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">Durasi Peminjaman (Hari)</label>
                                <input 
                                    type="number" 
                                    min="1"
                                    max="30"
                                    value={eventDuration}
                                    onChange={(e) => setEventDuration(parseInt(e.target.value) || 1)}
                                    className="w-full border border-gray-300 p-3 text-xs font-mono tracking-wider focus:outline-none focus:border-black rounded-none"
                                />
                            </div>

                            <div>
                                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">Unggah Proposal Permohonan</label>
                                <div className="border border-dashed border-gray-300 p-3 text-center cursor-pointer hover:border-black relative">
                                    <input 
                                        type="file" 
                                        accept="application/pdf"
                                        onChange={(e) => setEventPdf(e.target.files ? e.target.files[0] : null)}
                                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                                    />
                                    <span className="text-[10px] font-mono tracking-wider uppercase text-gray-400 block">
                                        {eventPdf ? `FILE: ${eventPdf.name.toUpperCase()}` : 'UNGGAH SURAT PROPOSAL (.PDF)'}
                                    </span>
                                </div>
                            </div>

                            <button 
                                type="submit"
                                className="w-full bg-black text-white py-4 text-xs font-bold tracking-widest uppercase hover:bg-gray-900 transition"
                            >
                                Kirim Pengajuan Proposal
                            </button>
                        </form>
                    </div>

                </section>

                {/* FOOTER */}
                <footer className="bg-white py-8 px-6 text-center text-xs text-gray-400 font-mono">
                    &copy; 2026 CARI AMBULAN BANDUNG. NO ICONS. PURE INFORMATION.
                </footer>

            </div>
        </AppLayout>
    );
}
