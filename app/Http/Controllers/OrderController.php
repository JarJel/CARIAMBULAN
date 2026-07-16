<?php

namespace App\Http\Controllers;

use App\Events\AmbulanceLocationUpdated;
use App\Models\Ambulance;
use App\Models\EventProposal;
use App\Models\Order;
use App\Models\SosLog;
use App\Models\TripStatusHistory;
use App\Models\TripTrackingLog;
use App\Models\User;
use App\Notifications\OrderStatusUpdated;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

class OrderController extends Controller
{
    /**
     * Helper untuk memuat order beserta relasi dan koordinat ambulans
     */
    private function loadOrderWithCoords($id)
    {
        $order = Order::with([
            'ambulance.institution',
            'ambulance.currentDriver',
            'ambulance.currentNurse',
            'patientDetail',
            'payment',
            'user'
        ])->findOrFail($id);

        // Inject order pickup coordinates
        $orderCoords = DB::selectOne("SELECT ST_X(pickup_location) as lng, ST_Y(pickup_location) as lat FROM orders WHERE id = ?", [$id]);
        if ($orderCoords) {
            $order->pickup_latitude = $orderCoords->lat;
            $order->pickup_longitude = $orderCoords->lng;
        }

        // Inject order destination coordinates if exists
        $destCoords = DB::selectOne("SELECT ST_X(destination_location) as lng, ST_Y(destination_location) as lat FROM orders WHERE id = ?", [$id]);
        if ($destCoords && $destCoords->lat && $destCoords->lng) {
            $order->destination_latitude = $destCoords->lat;
            $order->destination_longitude = $destCoords->lng;
        } elseif ($order->status === 'transporting' && $order->ambulance_id) {
            // Fallback for active transporting orders without a set destination (e.g. SOS)
            $ambulance = Ambulance::with('institution')->find($order->ambulance_id);
            if ($ambulance && $ambulance->institution) {
                $inst = $ambulance->institution;
                if (!$order->destination_address) {
                    $order->destination_address = $inst->name . ', ' . $inst->address;
                }
                $addressLower = strtolower($inst->address);
                if (str_contains($addressLower, 'pasteur')) {
                    $order->destination_latitude = -6.90389;
                    $order->destination_longitude = 107.61861;
                } elseif (str_contains($addressLower, 'juanda') || str_contains($addressLower, 'borromeus')) {
                    $order->destination_latitude = -6.89658;
                    $order->destination_longitude = 107.60421;
                } elseif (str_contains($addressLower, 'aceh') || str_contains($addressLower, 'pmi')) {
                    $order->destination_latitude = -6.9095;
                    $order->destination_longitude = 107.6165;
                } else {
                    $order->destination_latitude = -6.917464;
                    $order->destination_longitude = 107.619123;
                }
            }
        }

        if ($order->ambulance) {
            $coords = DB::selectOne("SELECT ST_X(current_location) as lng, ST_Y(current_location) as lat FROM ambulances WHERE id = ?", [$order->ambulance_id]);
            if ($coords) {
                $order->ambulance->latitude = $coords->lat;
                $order->ambulance->longitude = $coords->lng;
            }
        }

        return $order;
    }

    /**
     * Mendapatkan detail order tertentu beserta relasinya.
     */
    public function getOrder($id)
    {
        $order = $this->loadOrderWithCoords($id);

        return response()->json([
            'status' => 'success',
            'order' => $order,
        ]);
    }

    /**
     * Jalur SOS/Darurat - Mencari ambulans terdekat secara otomatis.
     */
    public function postSosOrder(Request $request, \App\Services\SosDispatchService $dispatcher)
    {
        $validator = Validator::make($request->all(), [
            'user_id' => 'required|exists:users,id',
            'pickup_latitude' => 'required|numeric',
            'pickup_longitude' => 'required|numeric',
            'pickup_address' => 'required|string',
            'ambulance_id' => 'nullable|exists:ambulances,id',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $latitude = $request->pickup_latitude;
        $longitude = $request->pickup_longitude;

        // 1. Create a pending SOS order first (so it gets DB spatial Point and ID)
        $order = Order::create([
            'user_id' => $request->user_id,
            'ambulance_id' => null,
            'order_type' => 'SOS',
            'status' => 'pending',
            'pickup_location' => DB::raw("Point({$longitude}, {$latitude})"),
            'pickup_address' => $request->pickup_address,
            'fare_amount' => 0.00,
        ]);

        // 2. Dispatch using the service with locked query, passing optional selected ambulance_id
        $ambulance = $dispatcher->dispatch($order, [], $request->ambulance_id);

        if (!$ambulance) {
            $order->update(['status' => 'no_ambulance_available']);

            TripStatusHistory::create([
                'order_id' => $order->id,
                'status' => 'no_ambulance_available',
                'changed_at' => now(),
            ]);

            return response()->json([
                'status' => 'no_ambulance_available',
                'message' => 'Tidak ada ambulans standby di radar. Silakan hubungi 112 atau 119.',
                'fallback_number' => '112',
            ], 404);
        }

        return response()->json([
            'status' => 'success',
            'message' => 'Panggilan darurat terkirim. Menunggu konfirmasi driver.',
            'order' => $this->loadOrderWithCoords($order->id),
        ], 201);
    }

    /**
     * Jalur Sewa/Non-Darurat - Sewa terjadwal dengan Fare Calculator & Anti-Double-Booking.
     */
    public function postSewaOrder(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'user_id' => 'required|exists:users,id',
            'ambulance_id' => 'required|exists:ambulances,id',
            'pickup_latitude' => 'required|numeric',
            'pickup_longitude' => 'required|numeric',
            'pickup_address' => 'required|string',
            'destination_latitude' => 'required|numeric',
            'destination_longitude' => 'required|numeric',
            'destination_address' => 'required|string',
            'scheduled_start_time' => 'required|date_format:Y-m-d H:i:s',
            'scheduled_end_time' => 'required|date_format:Y-m-d H:i:s|after:scheduled_start_time',
            'bpjs_number' => 'nullable|string',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        // Cek Anti-Double-Booking pada jadwal kalender ambulans tersebut
        $isBooked = Order::where('ambulance_id', $request->ambulance_id)
            ->whereIn('status', ['pending', 'confirmed', 'on_the_way', 'arrived', 'transporting'])
            ->where(function ($query) use ($request) {
                $query->where(function ($q) use ($request) {
                    $q->where('scheduled_start_time', '<=', $request->scheduled_start_time)
                      ->where('scheduled_end_time', '>=', $request->scheduled_start_time);
                })->orWhere(function ($q) use ($request) {
                    $q->where('scheduled_start_time', '<=', $request->scheduled_end_time)
                      ->where('scheduled_end_time', '>=', $request->scheduled_end_time);
                })->orWhere(function ($q) use ($request) {
                    $q->where('scheduled_start_time', '>=', $request->scheduled_start_time)
                      ->where('scheduled_end_time', '<=', $request->scheduled_end_time);
                });
            })
            ->exists();

        if ($isBooked) {
            return response()->json([
                'status' => 'conflict',
                'message' => 'Ambulans sudah memiliki jadwal lain pada rentang waktu tersebut.',
            ], 422);
        }

        // Kalkulasi jarak menggunakan formula Haversine (jarak lurus dalam KM)
        $latFrom = deg2rad($request->pickup_latitude);
        $lonFrom = deg2rad($request->pickup_longitude);
        $latTo = deg2rad($request->destination_latitude);
        $lonTo = deg2rad($request->destination_longitude);

        $latDelta = $latTo - $latFrom;
        $lonDelta = $lonTo - $lonFrom;

        $angle = 2 * asin(sqrt(pow(sin($latDelta / 2), 2) +
          cos($latFrom) * cos($latTo) * pow(sin($lonDelta / 2), 2)));
        $distance = $angle * 6371; // Jarak dalam KM

        // Hitung tarif menggunakan konfigurasi tarif dinamis armada ambulans
        $ambulance = Ambulance::findOrFail($request->ambulance_id);
        $baseFare = $ambulance->base_fare ?? 100000.00;
        $pricePerKm = $ambulance->price_per_km ?? 15000.00;
        $fare = $baseFare + ($distance * $pricePerKm);

        // e-Verifikasi BPJS (Mocking Logic)
        $bpjsStatus = null;
        if ($request->bpjs_number) {
            // Jika nomor kartu BPJS dimulai dengan '000', maka terverifikasi (gratis)
            $bpjsStatus = str_starts_with($request->bpjs_number, '000') ? 'verified' : 'rejected';
            if ($bpjsStatus === 'verified') {
                $fare = 0.00;
            }
        }

        return DB::transaction(function () use ($request, $fare, $bpjsStatus) {
            $order = Order::create([
                'user_id' => $request->user_id,
                'ambulance_id' => $request->ambulance_id,
                'order_type' => 'sewa',
                'status' => 'pending', // Menunggu konfirmasi manual
                'scheduled_start_time' => $request->scheduled_start_time,
                'scheduled_end_time' => $request->scheduled_end_time,
                'pickup_location' => DB::raw("Point({$request->pickup_longitude}, {$request->pickup_latitude})"),
                'pickup_address' => $request->pickup_address,
                'destination_location' => DB::raw("Point({$request->destination_longitude}, {$request->destination_latitude})"),
                'destination_address' => $request->destination_address,
                'fare_amount' => $fare,
                'bpjs_number' => $request->bpjs_number,
                'bpjs_status' => $bpjsStatus,
            ]);

            // Log status pertama
            TripStatusHistory::create([
                'order_id' => $order->id,
                'status' => 'pending',
                'changed_at' => now(),
            ]);

            // Kirim Notifikasi
            $user = User::find($order->user_id);
            if ($user) {
                $user->notify(new OrderStatusUpdated($order));
            }

            return response()->json([
                'status' => 'success',
                'message' => 'Pesanan sewa terjadwal berhasil dibuat (Menunggu Konfirmasi).',
                'order' => Order::find($order->id),
            ], 201);
        });
    }

    /**
     * Jalur Event/Instansi - Form proposal event (PDF).
     */
    public function postEventOrder(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'user_id' => 'required|exists:users,id',
            'pickup_latitude' => 'required|numeric',
            'pickup_longitude' => 'required|numeric',
            'pickup_address' => 'required|string',
            'scheduled_start_time' => 'required|date_format:Y-m-d H:i:s',
            'scheduled_end_time' => 'required|date_format:Y-m-d H:i:s|after:scheduled_start_time',
            'document' => 'required|file|mimes:pdf|max:10240', // Max 10MB PDF
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        // Mock upload path
        $documentPath = '/uploads/proposals/proposal_' . time() . '.pdf';
        if ($request->hasFile('document')) {
            $documentPath = $request->file('document')->store('proposals');
        }

        // Estimasi biaya flat untuk siaga event (Rp 1.500.000)
        $fare = 1500000.00;

        return DB::transaction(function () use ($request, $documentPath, $fare) {
            // Buat order dengan ambulance_id = null (nanti ditunjuk oleh admin fasyankes setelah proposal disetujui)
            $order = Order::create([
                'user_id' => $request->user_id,
                'ambulance_id' => null,
                'order_type' => 'event',
                'status' => 'pending',
                'scheduled_start_time' => $request->scheduled_start_time,
                'scheduled_end_time' => $request->scheduled_end_time,
                'pickup_location' => DB::raw("Point({$request->pickup_longitude}, {$request->pickup_latitude})"),
                'pickup_address' => $request->pickup_address,
                'fare_amount' => $fare,
            ]);

            // Simpan berkas proposal
            EventProposal::create([
                'order_id' => $order->id,
                'document_path' => $documentPath,
                'review_status' => 'pending',
            ]);

            // Log status pertama
            TripStatusHistory::create([
                'order_id' => $order->id,
                'status' => 'pending',
                'changed_at' => now(),
            ]);

            // Kirim Notifikasi
            $user = User::find($order->user_id);
            if ($user) {
                $user->notify(new OrderStatusUpdated($order));
            }

            return response()->json([
                'status' => 'success',
                'message' => 'Pengajuan proposal event berhasil dikirim.',
                'order' => Order::with('eventProposal')->find($order->id),
            ], 201);
        });
    }

    /**
     * Konfirmasi Pesanan oleh Driver/Admin.
     */
    public function postConfirmOrder(Request $request, $id)
    {
        $order = Order::findOrFail($id);

        if ($order->status !== 'pending') {
            return response()->json([
                'status' => 'error',
                'message' => 'Pesanan tidak dalam status Menunggu Konfirmasi.',
            ], 400);
        }

        return DB::transaction(function () use ($order) {
            $order->status = 'confirmed';
            $order->save();

            // Jika pesanan sudah memiliki armada, set armada tersebut menjadi 'on_duty'
            if ($order->ambulance_id) {
                $ambulance = Ambulance::find($order->ambulance_id);
                $ambulance->status = 'on_duty';
                $ambulance->save();
            }

            TripStatusHistory::create([
                'order_id' => $order->id,
                'status' => 'confirmed',
                'changed_at' => now(),
            ]);

            // Kirim Notifikasi
            $user = User::find($order->user_id);
            if ($user) {
                $user->notify(new OrderStatusUpdated($order));
            }

            return response()->json([
                'status' => 'success',
                'message' => 'Pesanan berhasil dikonfirmasi.',
                'order' => $order,
            ]);
        });
    }

    /**
     * Memperbarui Status Perjalanan (Live Trip Status).
     */
    public function postUpdateStatus(Request $request, $id)
    {
        $validator = Validator::make($request->all(), [
            'status' => 'required|in:on_the_way,arrived,transporting,completed,cancelled',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $order = Order::findOrFail($id);

        return DB::transaction(function () use ($order, $request) {
            $oldStatus = $order->status;
            $newStatus = $request->status;

            $order->status = $newStatus;

            // Auto-persist default hospital/institution destination on SOS transporting transition
            if ($newStatus === 'transporting' && !$order->destination_location && $order->ambulance_id) {
                $ambulance = Ambulance::with('institution')->find($order->ambulance_id);
                if ($ambulance && $ambulance->institution) {
                    $inst = $ambulance->institution;
                    $order->destination_address = $inst->name . ', ' . $inst->address;
                    
                    $addressLower = strtolower($inst->address);
                    if (str_contains($addressLower, 'pasteur')) {
                        $lat = -6.90389;
                        $lng = 107.61861;
                    } elseif (str_contains($addressLower, 'juanda') || str_contains($addressLower, 'borromeus')) {
                        $lat = -6.89658;
                        $lng = 107.60421;
                    } elseif (str_contains($addressLower, 'aceh') || str_contains($addressLower, 'pmi')) {
                        $lat = -6.9095;
                        $lng = 107.6165;
                    } else {
                        $lat = -6.917464;
                        $lng = 107.619123;
                    }
                    $order->destination_location = DB::raw("Point({$lng}, {$lat})");
                }
            }

            $order->save();

            // Catat riwayat perubahan status
            TripStatusHistory::create([
                'order_id' => $order->id,
                'status' => $newStatus,
                'changed_at' => now(),
            ]);

            // Jika status trip selesai (completed) atau batal (cancelled), kembalikan status ambulans menjadi 'standby'
            if (in_array($newStatus, ['completed', 'cancelled'])) {
                if ($order->ambulance_id) {
                    $ambulance = Ambulance::find($order->ambulance_id);
                    $ambulance->status = 'standby';
                    $ambulance->save();
                }
            }

            // Kirim Notifikasi
            $user = User::find($order->user_id);
            if ($user) {
                $user->notify(new OrderStatusUpdated($order));
            }

            return response()->json([
                'status' => 'success',
                'message' => "Status perjalanan berhasil diperbarui menjadi {$newStatus}.",
                'order' => $this->loadOrderWithCoords($order->id),
            ]);
        });
    }

    /**
     * Memperbarui lokasi GPS ambulans real-time selama perjalanan (Live Tracking).
     */
    public function postUpdateLocation(Request $request, $id)
    {
        $validator = Validator::make($request->all(), [
            'latitude' => 'required|numeric',
            'longitude' => 'required|numeric',
            'bearing' => 'nullable|numeric',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $order = Order::findOrFail($id);

        // Memastikan order dalam status aktif berjalan
        if (!in_array($order->status, ['confirmed', 'on_the_way', 'arrived', 'transporting'])) {
            return response()->json([
                'status' => 'error',
                'message' => 'Pesanan tidak aktif berjalan. Tidak dapat memperbarui lokasi.',
            ], 400);
        }

        if (!$order->ambulance_id) {
            return response()->json([
                'status' => 'error',
                'message' => 'Armada ambulans belum ditentukan untuk pesanan ini.',
            ], 400);
        }

        return DB::transaction(function () use ($order, $request) {
            $latitude = $request->latitude;
            $longitude = $request->longitude;
            $bearing = $request->bearing;

            $ambulance = Ambulance::findOrFail($order->ambulance_id);

            // Validasi location spoofing
            $isValid = app(\App\Services\ValidateLocationUpdate::class)->isValid(
                $ambulance, $latitude, $longitude, now()
            );

            if (!$isValid) {
                // Catat ke location_anomalies
                \App\Models\LocationAnomaly::create([
                    'ambulance_id' => $ambulance->id,
                    'reported_lat' => $latitude,
                    'reported_lng' => $longitude,
                    'flagged_at' => now(),
                ]);

                return response()->json([
                    'status' => 'flagged',
                    'message' => 'Laporan lokasi ditandai sebagai anomali.',
                ], 202);
            }

            // 1. Simpan koordinat ke riwayat trip_tracking_logs
            TripTrackingLog::create([
                'order_id' => $order->id,
                'coordinates' => DB::raw("Point({$longitude}, {$latitude})"),
                'recorded_at' => now(),
            ]);

            // 2. Perbarui lokasi terkini ambulans
            $ambulance->current_location = DB::raw("Point({$longitude}, {$latitude})");
            $ambulance->last_location_at = now();
            $ambulance->save();

            // Reset status stale signal jika sebelumnya dilaporkan hilang
            if ($order->tracking_lost_notified_at) {
                $order->update(['tracking_lost_notified_at' => null]);
            }

            // 3. Broadcast lokasi terbaru via WebSocket
            try {
                event(new AmbulanceLocationUpdated(
                    $order->id,
                    $order->ambulance_id,
                    $latitude,
                    $longitude,
                    $bearing
                ));
            } catch (\Exception $e) {
                \Illuminate\Support\Facades\Log::warning("WebSocket broadcast failed: " . $e->getMessage());
            }

            return response()->json([
                'status' => 'success',
                'message' => 'Lokasi ambulans berhasil diperbarui dan disiarkan.',
            ]);
        });
    }

    /**
     * Konfirmasi penerimaan panggilan SOS oleh Driver.
     */
    public function postAcceptOrder(Request $request, $id)
    {
        $order = Order::findOrFail($id);

        return DB::transaction(function () use ($order) {
            // Lock the order row to prevent race conditions
            $order = Order::where('id', $order->id)->lockForUpdate()->firstOrFail();

            if ($order->status !== 'awaiting_driver_response') {
                return response()->json([
                    'status' => 'error',
                    'message' => 'Order sudah tidak tersedia atau sudah dialihkan ke armada lain.',
                ], 409); // 409 Conflict
            }

            // Update order status to confirmed
            $order->status = 'confirmed';
            $order->save();

            // Update ambulance status to on_duty
            if ($order->ambulance_id) {
                $ambulance = Ambulance::find($order->ambulance_id);
                if ($ambulance) {
                    $ambulance->status = 'on_duty';
                    $ambulance->save();
                }
            }

            // Log response time in SosLog
            $sosLog = SosLog::where('order_id', $order->id)->first();
            if ($sosLog) {
                $dispatchedAt = $sosLog->dispatched_at ?? $order->created_at;
                $responseTimeSeconds = (int) abs(now()->diffInSeconds($dispatchedAt));
                $sosLog->update([
                    'response_time_seconds' => $responseTimeSeconds,
                ]);
            }

            // Log status history
            TripStatusHistory::create([
                'order_id' => $order->id,
                'status' => 'confirmed',
                'changed_at' => now(),
            ]);

            // Kirim Notifikasi ke User
            $user = User::find($order->user_id);
            if ($user) {
                $user->notify(new OrderStatusUpdated($order));
            }

            // Broadcast real-time update using TripStatusUpdated event
            try {
                broadcast(new \App\Events\TripStatusUpdated($order));
            } catch (\Exception $e) {
                \Illuminate\Support\Facades\Log::warning("WebSocket broadcast failed: " . $e->getMessage());
            }

            return response()->json([
                'status' => 'success',
                'message' => 'Panggilan darurat berhasil Anda terima.',
                'order' => $this->loadOrderWithCoords($order->id),
            ]);
        });
    }

    /**
     * Update the patient medical condition/notes.
     */
    public function postUpdatePatientCondition(Request $request, $id)
    {
        $validator = Validator::make($request->all(), [
            'patient_condition' => 'required|string',
            'tensi' => 'nullable|string|max:255',
            'suhu' => 'nullable|string|max:255',
            'nadi' => 'nullable|string|max:255',
            'pernapasan' => 'nullable|string|max:255',
            'spo2' => 'nullable|string|max:255',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $order = Order::findOrFail($id);

        $order->update([
            'patient_condition' => $request->patient_condition,
        ]);

        // Simpan juga ke table patient_details seperti data pasien dari customer
        $existingDetail = \App\Models\PatientDetail::where('order_id', $order->id)->first();
        $patientName = $existingDetail ? $existingDetail->patient_name : 'Pasien Darurat';

        \App\Models\PatientDetail::updateOrCreate(
            ['order_id' => $order->id],
            [
                'patient_name' => $patientName,
                'tensi' => $request->tensi,
                'suhu' => $request->suhu,
                'nadi' => $request->nadi,
                'pernapasan' => $request->pernapasan,
                'spo2' => $request->spo2,
            ]
        );

        // Broadcast update
        try {
            broadcast(new \App\Events\TripStatusUpdated($order));
        } catch (\Exception $e) {
            \Illuminate\Support\Facades\Log::warning("WebSocket broadcast failed: " . $e->getMessage());
        }

        return response()->json([
            'status' => 'success',
            'message' => 'Catatan kondisi pasien berhasil diperbarui.',
            'order' => $this->loadOrderWithCoords($id),
        ]);
    }

    /**
     * Jalur SOS/Darurat Guest (Tanpa Login).
     */
    public function postSosOrderGuest(Request $request, \App\Services\SosDispatchService $dispatcher)
    {
        $validator = Validator::make($request->all(), [
            'pickup_latitude' => 'required|numeric',
            'pickup_longitude' => 'required|numeric',
            'pickup_address' => 'required|string',
            'guest_phone' => ['required', 'string', 'regex:/^(\+62|62|0)8[1-9][0-9]{6,11}$/'],
            'ambulance_id' => 'nullable|exists:ambulances,id',
        ], [
            'guest_phone.regex' => 'Format nomor HP tidak valid (gunakan format Indonesia seperti 08xxxxxxxxxx atau 628xxxxxxxxxx).'
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        // Hourly rate limiting per guest phone number
        $phoneKey = 'sos_guest_phone_limit:' . $request->guest_phone;
        if (\Illuminate\Support\Facades\RateLimiter::tooManyAttempts($phoneKey, 3)) {
            return response()->json([
                'status' => 'error',
                'message' => 'Terlalu banyak permintaan SOS dari nomor HP ini. Silakan hubungi 119/112.'
            ], 429);
        }
        \Illuminate\Support\Facades\RateLimiter::hit($phoneKey, 3600); // 1 jam (3600 detik)

        $latitude = $request->pickup_latitude;
        $longitude = $request->pickup_longitude;
        $token = (string) \Illuminate\Support\Str::uuid();

        // 1. Create a pending SOS order first
        $order = Order::create([
            'user_id' => null,
            'ambulance_id' => null,
            'order_type' => 'SOS',
            'status' => 'pending',
            'pickup_location' => DB::raw("Point({$longitude}, {$latitude})"),
            'pickup_address' => $request->pickup_address,
            'fare_amount' => 0.00,
            'guest_phone' => $request->guest_phone,
            'guest_session_token' => $token,
            'guest_token_expires_at' => now()->addHours(24),
        ]);

        // 2. Dispatch using the service with locked query, passing optional selected ambulance_id
        $ambulance = $dispatcher->dispatch($order, [], $request->ambulance_id);

        if (!$ambulance) {
            $order->update(['status' => 'no_ambulance_available']);

            TripStatusHistory::create([
                'order_id' => $order->id,
                'status' => 'no_ambulance_available',
                'changed_at' => now(),
            ]);

            return response()->json([
                'status' => 'no_ambulance_available',
                'message' => 'Tidak ada ambulans standby di radar. Silakan hubungi 112 atau 119.',
                'fallback_number' => '112',
            ], 404);
        }

        return response()->json([
            'status' => 'success',
            'message' => 'Panggilan darurat tamu terkirim. Menunggu konfirmasi driver.',
            'order' => $this->loadOrderWithCoords($order->id),
            'guest_session_token' => $token,
        ], 201);
    }

    /**
     * Menyimpan atau memperbarui data medis pasien untuk order tertentu.
     */
    public function postSavePatientDetails(Request $request, $id)
    {
        $validator = Validator::make($request->all(), [
            'patient_name' => 'required|string',
            'patient_age' => 'nullable|integer|min:0|max:150',
            'condition_notes' => 'nullable|string',
            'secondary_emergency_contact' => 'nullable|string',
            'guest_session_token' => 'nullable|string',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $order = Order::findOrFail($id);

        // Otorisasi: check jika milik user terdaftar, ATAU check guest_session_token
        if ($order->user_id) {
            if (!auth()->check() || auth()->id() !== $order->user_id) {
                return response()->json(['message' => 'Akses ditolak.'], 403);
            }
        } else {
            $token = $request->input('guest_session_token') ?? $request->header('X-Guest-Token');
            if (!$token || $order->guest_session_token !== $token) {
                return response()->json(['message' => 'Akses ditolak. Token tidak valid.'], 403);
            }
        }

        $detail = \App\Models\PatientDetail::updateOrCreate(
            ['order_id' => $order->id],
            [
                'patient_name' => $request->patient_name,
                'patient_age' => $request->patient_age,
                'condition_notes' => $request->condition_notes,
                'secondary_emergency_contact' => $request->secondary_emergency_contact,
            ]
        );

        // Broadcast status update
        try {
            $orderFresh = $this->loadOrderWithCoords($order->id);
            broadcast(new \App\Events\TripStatusUpdated($orderFresh));
        } catch (\Exception $e) {
            \Illuminate\Support\Facades\Log::warning("WebSocket broadcast failed: " . $e->getMessage());
        }

        return response()->json([
            'status' => 'success',
            'message' => 'Data pasien berhasil disimpan.',
            'patient_detail' => $detail,
        ]);
    }

    /**
     * Melakukan pembayaran DP inline bagi guest.
     */
    public function postSavePaymentGuest(Request $request, $id)
    {
        $validator = Validator::make($request->all(), [
            'method' => 'required|in:qris,e-wallet,transfer,cash',
            'amount' => 'required|numeric|min:0',
            'guest_session_token' => 'required|string',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $order = Order::findOrFail($id);

        if ($order->guest_session_token !== $request->guest_session_token) {
            return response()->json(['message' => 'Akses ditolak. Token tidak valid.'], 403);
        }

        $payment = \App\Models\Payment::updateOrCreate(
            ['order_id' => $order->id],
            [
                'method' => $request->method,
                'amount' => $request->amount,
                'status' => 'paid',
                'payment_gateway_transaction_id' => 'GUEST-TX-' . time() . '-' . rand(1000, 9999),
            ]
        );

        // Broadcast status update
        try {
            $orderFresh = $this->loadOrderWithCoords($order->id);
            broadcast(new \App\Events\TripStatusUpdated($orderFresh));
        } catch (\Exception $e) {
            \Illuminate\Support\Facades\Log::warning("WebSocket broadcast failed: " . $e->getMessage());
        }

        return response()->json([
            'status' => 'success',
            'message' => 'Pembayaran berhasil diproses.',
            'payment' => $payment,
        ]);
    }

    /**
     * Konversi data guest ke akun permanen pasca trip selesai.
     */
    public function postRegisterGuestAccount(Request $request, $id)
    {
        $validator = Validator::make($request->all(), [
            'name' => 'required|string|max:255',
            'email' => 'required|string|email|max:255|unique:users',
            'password' => 'required|string|min:8',
            'guest_session_token' => 'required|string',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $order = Order::findOrFail($id);

        if ($order->guest_session_token !== $request->guest_session_token) {
            return response()->json(['message' => 'Akses ditolak. Token tidak valid.'], 403);
        }

        // Cek jika nomor HP sudah terdaftar
        $existingUser = User::where('phone', $order->guest_phone)->first();
        if ($existingUser) {
            return response()->json(['message' => 'Nomor HP ini sudah terdaftar sebagai pengguna.'], 422);
        }

        // Buat User Baru
        $user = User::create([
            'name' => $request->name,
            'email' => $request->email,
            'phone' => $order->guest_phone,
            'password' => bcrypt($request->password),
            'role' => 'customer',
        ]);

        // Hubungkan semua order ber-nomor HP sama ke user terdaftar ini
        Order::where('guest_phone', $order->guest_phone)->update([
            'user_id' => $user->id,
        ]);

        // Login kan secara otomatis
        auth()->login($user);

        return response()->json([
            'status' => 'success',
            'message' => 'Akun Anda berhasil didaftarkan. Selamat datang di AmbulanBDG!',
        ]);
    }

    /**
     * Ekspor Ringkasan Perjalanan & Rekam Medis IGD (PDF / Print-ready HTML).
     */
    public function getExportSummary(Request $request, $id)
    {
        $order = Order::with(['ambulance.institution', 'ambulance.currentDriver', 'ambulance.currentNurse', 'patientDetail', 'payment', 'rating'])
            ->findOrFail($id);

        // Otorisasi sederhana: Pemilik order, kru ditugaskan, fasyankes pemilik, atau Super Admin
        $user = $request->user();
        if ($user) {
            $isAuthorized = ($order->user_id === $user->id) || 
                            ($order->ambulance && $order->ambulance->current_driver_id === $user->id) ||
                            ($order->ambulance && $order->ambulance->current_nurse_id === $user->id) ||
                            ($order->ambulance && $order->ambulance->institution_id === $user->institution_id) ||
                            ($user->role === 'super_admin');
            
            if (!$isAuthorized) {
                abort(403, 'Akses ditolak.');
            }
        } else {
            // Validasi via Token untuk Guest
            $token = $request->query('token') ?? $request->header('X-Guest-Token');
            if ($order->guest_session_token !== $token) {
                abort(403, 'Akses ditolak.');
            }
        }

        // Ambil koordinat
        $coords = DB::selectOne("
            SELECT 
                ST_X(pickup_location) as pickup_lng, 
                ST_Y(pickup_location) as pickup_lat,
                ST_X(destination_location) as dest_lng,
                ST_Y(destination_location) as dest_lat
            FROM orders 
            WHERE id = ?
        ", [$id]);

        if ($coords) {
            $order->pickup_latitude = $coords->pickup_lat;
            $order->pickup_longitude = $coords->pickup_lng;
            $order->destination_latitude = $coords->dest_lat;
            $order->destination_longitude = $coords->dest_lng;
        }

        return view('orders.export_summary', ['order' => $order]);
    }
}
