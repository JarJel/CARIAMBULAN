<?php

namespace App\Http\Controllers;

use App\Helpers\AuditLogger;
use App\Models\Ambulance;
use App\Models\EventProposal;
use App\Models\Order;
use App\Models\StaffProfile;
use App\Models\TripStatusHistory;
use App\Models\User;
use App\Models\VehicleDocument;
use App\Models\RateHistory;
use App\Models\DocumentVerification;
use App\Models\ApprovalLog;
use App\Models\VehicleChecklist;
use App\Notifications\OrderStatusUpdated;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Carbon\Carbon;

class AdminController extends Controller
{
    /**
     * Verifikasi dokumen kendaraan STNK/KIR.
     */
    public function postVerifyDocument(Request $request, $id)
    {
        $validator = Validator::make($request->all(), [
            'verification_status' => 'required|in:approved,rejected',
            'rejection_reason' => 'nullable|string',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $doc = VehicleDocument::findOrFail($id);
        \Illuminate\Support\Facades\Gate::authorize('verify', $doc);

        return DB::transaction(function () use ($doc, $request) {
            $doc->verification_status = $request->verification_status;
            $doc->save();

            // Catat ke Audit Log
            $adminId = $request->user()?->id;
            AuditLogger::log(
                $adminId,
                'verify_vehicle_document',
                "Dokumen {$doc->doc_type} (ID: {$doc->id}) untuk Ambulans ID: {$doc->ambulance_id} di-{$request->verification_status}."
            );

            // Jika disetujui, cek apakah kita bisa memulihkan status ambulans kembali ke standby
            if ($request->verification_status === 'approved') {
                $ambulance = Ambulance::find($doc->ambulance_id);
                if ($ambulance && $ambulance->status === 'suspended') {
                    // Cek apakah ada dokumen lain yang masih kedaluwarsa atau rejected
                    $hasIssues = VehicleDocument::where('ambulance_id', $doc->ambulance_id)
                        ->where(function ($query) {
                            $query->where('verification_status', 'rejected')
                                  ->orWhere('expiry_date', '<', now()->toDateString());
                        })
                        ->exists();

                    if (!$hasIssues) {
                        $ambulance->status = 'standby';
                        $ambulance->save();

                        AuditLogger::log(
                            null, // Sistem
                            'restore_ambulance_status',
                            "Ambulans {$ambulance->plate_number} dipulihkan menjadi standby setelah dokumen STNK/KIR disetujui."
                        );
                    }
                }
            }

            return response()->json([
                'status' => 'success',
                'message' => "Verifikasi dokumen berhasil diperbarui menjadi {$request->verification_status}.",
                'document' => $doc,
            ]);
        });
    }

    /**
     * Verifikasi lisensi driver/perawat SIM/STR.
     */
    public function postVerifyStaff(Request $request, $id)
    {
        $validator = Validator::make($request->all(), [
            'verification_status' => 'required|in:approved,rejected',
            'rejection_reason' => 'nullable|string',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $staff = StaffProfile::findOrFail($id);
        \Illuminate\Support\Facades\Gate::authorize('verify', $staff);

        return DB::transaction(function () use ($staff, $request) {
            $staff->verification_status = $request->verification_status;
            $staff->save();

            // Catat ke Audit Log
            $adminId = $request->user()?->id;
            AuditLogger::log(
                $adminId,
                'verify_staff_profile',
                "Profil lisensi staf {$staff->staff_type} (User ID: {$staff->user_id}) di-{$request->verification_status}."
            );

            // Jika disetujui, cek apakah ambulans yang bersangkutan dapat dipulihkan
            if ($request->verification_status === 'approved') {
                $ambulances = Ambulance::where('current_driver_id', $staff->user_id)
                    ->orWhere('current_nurse_id', $staff->user_id)
                    ->get();

                foreach ($ambulances as $ambulance) {
                    if ($ambulance->status === 'suspended') {
                        // Cek apakah ada masalah dokumen kendaraan
                        $hasDocIssues = VehicleDocument::where('ambulance_id', $ambulance->id)
                            ->where(function ($query) {
                                $query->where('verification_status', 'rejected')
                                      ->orWhere('expiry_date', '<', now()->toDateString());
                            })
                            ->exists();

                        if (!$hasDocIssues) {
                            $ambulance->status = 'standby';
                            $ambulance->save();

                            AuditLogger::log(
                                null, // Sistem
                                'restore_ambulance_status',
                                "Ambulans {$ambulance->plate_number} dipulihkan menjadi standby setelah profil staf disetujui."
                            );
                        }
                    }
                }
            }

            return response()->json([
                'status' => 'success',
                'message' => "Verifikasi staf berhasil diperbarui menjadi {$request->verification_status}.",
                'staff_profile' => $staff,
            ]);
        });
    }

    /**
     * Manajemen armada ambulans dan konfigurasi tarif.
     */
    public function postManageAmbulance(Request $request, $id)
    {
        $validator = Validator::make($request->all(), [
            'status' => 'nullable|in:offline,standby,on_duty,suspended',
            'category' => 'nullable|string',
            'base_fare' => 'nullable|numeric|min:0',
            'price_per_km' => 'nullable|numeric|min:0',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $ambulance = Ambulance::findOrFail($id);
        \Illuminate\Support\Facades\Gate::authorize('update', $ambulance);

        return DB::transaction(function () use ($ambulance, $request) {
            $changes = [];

            if ($request->has('status')) {
                $changes[] = "status: {$ambulance->status} -> {$request->status}";
                $ambulance->status = $request->status;
            }

            if ($request->has('category')) {
                $changes[] = "kategori: {$ambulance->category} -> {$request->category}";
                $ambulance->category = $request->category;
            }

            if ($request->has('base_fare')) {
                $changes[] = "tarif dasar: {$ambulance->base_fare} -> {$request->base_fare}";
                $ambulance->base_fare = $request->base_fare;
            }

            if ($request->has('price_per_km')) {
                $changes[] = "tarif per KM: {$ambulance->price_per_km} -> {$request->price_per_km}";
                $ambulance->price_per_km = $request->price_per_km;
            }

            $ambulance->save();

            // Catat ke Audit Log jika ada perubahan
            if (!empty($changes)) {
                $adminId = $request->user()?->id;
                AuditLogger::log(
                    $adminId,
                    'manage_ambulance',
                    "Armada {$ambulance->plate_number} (ID: {$ambulance->id}) diubah: " . implode(', ', $changes)
                );
            }

            return response()->json([
                'status' => 'success',
                'message' => 'Manajemen data dan tarif ambulans berhasil disimpan.',
                'ambulance' => $ambulance,
            ]);
        });
    }

    /**
     * Verifikasi proposal event dan penugasan armada ambulans.
     */
    public function postVerifyEventProposal(Request $request, $id)
    {
        $validator = Validator::make($request->all(), [
            'review_status' => 'required|in:approved,rejected',
            'rejection_reason' => 'nullable|string',
            'ambulance_id' => 'required_if:review_status,approved|exists:ambulances,id',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $proposal = EventProposal::findOrFail($id);
        \Illuminate\Support\Facades\Gate::authorize('verify', $proposal);

        if ($request->review_status === 'approved') {
            $ambulance = Ambulance::findOrFail($request->ambulance_id);
            \Illuminate\Support\Facades\Gate::authorize('update', $ambulance);
        }

        return DB::transaction(function () use ($proposal, $request) {
            $proposal->review_status = $request->review_status;
            $proposal->notes = $request->rejection_reason;
            $proposal->save();

            $order = Order::findOrFail($proposal->order_id);

            if ($request->review_status === 'approved') {
                // Set armada ambulans dan set status order menjadi confirmed
                $order->ambulance_id = $request->ambulance_id;
                $order->status = 'confirmed';
                $order->save();

                // Ubah status ambulans menjadi 'on_duty' karena siaga event
                $ambulance = Ambulance::find($request->ambulance_id);
                if ($ambulance) {
                    $ambulance->status = 'on_duty';
                    $ambulance->save();
                }

                // Buat log status
                TripStatusHistory::create([
                    'order_id' => $order->id,
                    'status' => 'confirmed',
                    'changed_at' => now(),
                ]);
            } else {
                // Set status order menjadi cancelled
                $order->status = 'cancelled';
                $order->save();

                TripStatusHistory::create([
                    'order_id' => $order->id,
                    'status' => 'cancelled',
                    'changed_at' => now(),
                ]);
            }

            // Kirim Notifikasi ke Pelanggan
            $user = User::find($order->user_id);
            if ($user) {
                $user->notify(new OrderStatusUpdated($order));
            }

            // Catat ke Audit Log
            $adminId = $request->user()?->id;
            AuditLogger::log(
                $adminId,
                'verify_event_proposal',
                "Proposal Event ID: {$proposal->id} (Order ID: {$order->id}) di-{$request->review_status}."
            );

            return response()->json([
                'status' => 'success',
                'message' => "Proposal event berhasil diperbarui menjadi {$request->review_status}.",
                'proposal' => $proposal,
                'order' => Order::with('ambulance')->find($order->id),
            ]);
        });
    }

    /**
     * Tambah Armada Ambulans Baru (Mendukung Draft & Upload STNK/KIR).
     */
    public function postCreateAmbulance(Request $request)
    {
        $isDraft = filter_var($request->input('is_draft'), FILTER_VALIDATE_BOOLEAN);

        $validator = Validator::make($request->all(), [
            'plate_number' => ['required', 'string', 'unique:ambulances,plate_number', 'regex:/^[A-Z]{1,2}\s\d{1,4}\s[A-Z]{1,3}$/i'],
            'category' => 'required|in:emergency,non_emergency,corpse',
            'brand' => 'required|string',
            'year' => 'required|integer|min:1900|max:' . (date('Y') + 1),
            'capacity' => 'required|integer|min:1',
            'base_fare' => 'nullable|numeric|min:0',
            'price_per_km' => 'nullable|numeric|min:0',
            'is_free_service_eligible' => 'nullable|boolean',
            'driver_id' => 'nullable|exists:users,id',
            'stnk_file' => $isDraft ? 'nullable|file|mimes:pdf,jpg,jpeg,png|max:5120' : 'required|file|mimes:pdf,jpg,jpeg,png|max:5120',
            'kir_file' => 'nullable|file|mimes:pdf,jpg,jpeg,png|max:5120',
            'operasional_file' => $isDraft ? 'nullable|file|mimes:pdf,jpg,jpeg,png|max:5120' : 'required|file|mimes:pdf,jpg,jpeg,png|max:5120',
        ], [
            'plate_number.regex' => 'Format plat nomor tidak valid (contoh: D 1111 RSH).'
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        return DB::transaction(function () use ($request, $isDraft) {
            $user = $request->user();
            $institutionId = $user->institution_id ?? 1; // Dinkes default atau instansi pengguna

            // Default location (Gedung Sate Bandung)
            $longitude = 107.619123;
            $latitude = -6.917464;

            $ambulance = Ambulance::create([
                'institution_id' => $institutionId,
                'plate_number' => strtoupper($request->plate_number),
                'category' => $request->category,
                'status' => 'offline',
                'brand' => $request->brand,
                'year' => $request->year,
                'capacity' => $request->capacity,
                'base_fare' => $request->base_fare ?? 0.00,
                'price_per_km' => $request->price_per_km ?? 0.00,
                'is_free_service_eligible' => filter_var($request->is_free_service_eligible, FILTER_VALIDATE_BOOLEAN),
                'is_draft' => $isDraft,
                'verification_status' => 'pending_verification',
                'current_location' => DB::raw("Point({$longitude}, {$latitude})"),
            ]);

            // Save Rate History
            RateHistory::create([
                'ambulance_id' => $ambulance->id,
                'old_base_fare' => 0.00,
                'new_base_fare' => $ambulance->base_fare,
                'old_price_per_km' => 0.00,
                'new_price_per_km' => $ambulance->price_per_km,
                'changed_by_user_id' => $user->id,
            ]);

            // Upload files
            $files = ['stnk_file' => 'STNK', 'kir_file' => 'KIR', 'operasional_file' => 'Izin Operasional'];
            foreach ($files as $inputName => $docType) {
                if ($request->hasFile($inputName)) {
                    $path = $request->file($inputName)->store('documents/ambulances', 'public');
                    DocumentVerification::create([
                        'verifiable_id' => $ambulance->id,
                        'verifiable_type' => Ambulance::class,
                        'document_type' => $docType,
                        'file_path' => $path,
                        'expiry_date' => $request->input($inputName . '_expiry') ? Carbon::parse($request->input($inputName . '_expiry'))->toDateString() : null,
                        'status' => 'pending',
                    ]);
                }
            }

            // Bind driver if supplied
            if ($request->driver_id) {
                $driverUser = User::where('id', $request->driver_id)->where('role', 'driver')->first();
                if ($driverUser) {
                    Ambulance::where('current_driver_id', $driverUser->id)->update(['current_driver_id' => null]);
                    $ambulance->current_driver_id = $driverUser->id;
                    $ambulance->save();
                }
            }

            AuditLogger::log($user->id, 'create_ambulance', "Membuat armada baru {$ambulance->plate_number} (Draft: " . ($isDraft ? 'Ya' : 'Tidak') . ").", $user, $ambulance);

            return response()->json([
                'status' => 'success',
                'message' => 'Armada ambulans berhasil ditambahkan.',
                'ambulance' => $ambulance
            ]);
        });
    }

    /**
     * Duplikasi/Clone Data Armada Ambulans.
     */
    public function postCloneAmbulance(Request $request, $id)
    {
        $validator = Validator::make($request->all(), [
            'plate_number' => ['required', 'string', 'unique:ambulances,plate_number', 'regex:/^[A-Z]{1,2}\s\d{1,4}\s[A-Z]{1,3}$/i'],
        ], [
            'plate_number.regex' => 'Format plat nomor tidak valid (contoh: D 1111 RSH).'
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $source = Ambulance::findOrFail($id);

        return DB::transaction(function () use ($source, $request) {
            $user = $request->user();

            $clone = Ambulance::create([
                'institution_id' => $source->institution_id,
                'plate_number' => strtoupper($request->plate_number),
                'category' => $source->category,
                'status' => 'offline',
                'brand' => $source->brand,
                'year' => $source->year,
                'capacity' => $source->capacity,
                'base_fare' => $source->base_fare,
                'price_per_km' => $source->price_per_km,
                'is_free_service_eligible' => $source->is_free_service_eligible,
                'is_draft' => true, // default clone as draft for editing
                'verification_status' => 'pending_verification',
                'current_location' => DB::raw("Point(107.619123, -6.917464)"),
            ]);

            RateHistory::create([
                'ambulance_id' => $clone->id,
                'old_base_fare' => 0.00,
                'new_base_fare' => $clone->base_fare,
                'old_price_per_km' => 0.00,
                'new_price_per_km' => $clone->price_per_km,
                'changed_by_user_id' => $user->id,
            ]);

            AuditLogger::log($user->id, 'clone_ambulance', "Menduplikasi armada {$source->plate_number} menjadi {$clone->plate_number}.", $user, $clone);

            return response()->json([
                'status' => 'success',
                'message' => 'Armada ambulans berhasil diduplikasi sebagai draft.',
                'ambulance' => $clone
            ]);
        });
    }

    /**
     * Tambah Staf Baru (Driver/Nurse) dengan Dual-role & Invitation Link.
     */
    public function postCreateStaff(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'name' => 'required|string|max:255',
            'email' => 'required|email|unique:users,email',
            'phone' => 'required|string|max:20',
            'nik' => 'required|digits:16',
            'role' => 'required|in:driver,nurse,dual',
            'password' => 'required|string|min:8',
            'default_ambulance_id' => 'nullable|exists:ambulances,id',
            'sim_file' => 'nullable|required_if:role,driver,dual|file|mimes:pdf,jpg,jpeg,png|max:5120',
            'str_file' => 'nullable|required_if:role,nurse,dual|file|mimes:pdf,jpg,jpeg,png|max:5120',
            'ktp_file' => 'required|file|mimes:pdf,jpg,jpeg,png|max:5120',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        return DB::transaction(function () use ($request) {
            $user = $request->user();
            $institutionId = $user->institution_id ?? 1;

            $invitationToken = Str::uuid()->toString();

            // Create Staff User (Primary role is driver if dual, nurse if nurse)
            $primaryRole = $request->role === 'dual' ? 'driver' : $request->role;

            $staffUser = User::create([
                'name' => $request->name,
                'email' => $request->email,
                'phone' => $request->phone,
                'nik' => $request->nik,
                'role' => $primaryRole,
                'password' => bcrypt($request->password), // Set password directly
                'institution_id' => $institutionId,
                'invitation_token' => $invitationToken,
            ]);

            // Save staff profile metadata
            $staffProfile = StaffProfile::create([
                'user_id' => $staffUser->id,
                'staff_type' => $primaryRole,
                'license_number' => $request->role === 'nurse' ? 'STR-' . Str::random(8) : 'SIM-' . Str::random(8),
                'license_expiry' => now()->addYears(3)->toDateString(),
                'verification_status' => 'pending',
            ]);

            // Upload KTP
            if ($request->hasFile('ktp_file')) {
                $path = $request->file('ktp_file')->store('documents/staff', 'public');
                DocumentVerification::create([
                    'verifiable_id' => $staffUser->id,
                    'verifiable_type' => User::class,
                    'document_type' => 'KTP',
                    'file_path' => $path,
                    'status' => 'pending',
                ]);
            }

            // Upload SIM (Driver / Dual)
            if ($request->hasFile('sim_file')) {
                $path = $request->file('sim_file')->store('documents/staff', 'public');
                DocumentVerification::create([
                    'verifiable_id' => $staffUser->id,
                    'verifiable_type' => User::class,
                    'document_type' => 'SIM',
                    'file_path' => $path,
                    'expiry_date' => now()->addYears(5)->toDateString(),
                    'status' => 'pending',
                ]);
            }

            // Upload STR (Nurse / Dual)
            if ($request->hasFile('str_file')) {
                $path = $request->file('str_file')->store('documents/staff', 'public');
                DocumentVerification::create([
                    'verifiable_id' => $staffUser->id,
                    'verifiable_type' => User::class,
                    'document_type' => 'STR',
                    'file_path' => $path,
                    'expiry_date' => now()->addYears(3)->toDateString(),
                    'status' => 'pending',
                ]);
            }

            // Bind default ambulance if supplied
            if ($request->default_ambulance_id) {
                $ambulance = Ambulance::find($request->default_ambulance_id);
                if ($ambulance) {
                    if ($primaryRole === 'driver') {
                        $ambulance->current_driver_id = $staffUser->id;
                    } else {
                        $ambulance->current_nurse_id = $staffUser->id;
                    }
                    $ambulance->save();
                }
            }

            $inviteLink = route('register') . '?invitation_token=' . $invitationToken;

            AuditLogger::log($user->id, 'create_staff', "Membuat akun staf baru {$staffUser->name} (Role: {$request->role}).", $user, $staffUser);

            return response()->json([
                'status' => 'success',
                'message' => 'Staf baru berhasil didaftarkan.',
                'staff' => $staffUser,
                'invitation_link' => $inviteLink
            ]);
        });
    }

    /**
     * Deaktivasi / Soft-delete Akun Staf.
     */
    public function postDeactivateStaff(Request $request, $id)
    {
        $staffUser = User::findOrFail($id);
        $user = $request->user();

        return DB::transaction(function () use ($staffUser, $user) {
            if ($staffUser->deactivated_at) {
                $staffUser->deactivated_at = null;
                $message = 'Akun staf berhasil diaktifkan kembali.';
                $action = 'reactivate_staff';
            } else {
                $staffUser->deactivated_at = now();
                $message = 'Akun staf berhasil dinonaktifkan.';
                $action = 'deactivate_staff';

                // Force log out active session
                DB::table('sessions')->where('user_id', $staffUser->id)->delete();
            }
            $staffUser->save();

            AuditLogger::log($user->id, $action, "Mengubah status aktif staf {$staffUser->name}.", $user, $staffUser);

            return response()->json([
                'status' => 'success',
                'message' => $message,
                'staff' => $staffUser
            ]);
        });
    }

    /**
     * Dapatkan Daftar Sesi/Device Aktif dari Staf.
     */
    public function getStaffSessions($id)
    {
        $sessions = DB::table('sessions')
            ->where('user_id', $id)
            ->select('id', 'ip_address', 'user_agent', 'last_activity')
            ->get()
            ->map(function ($sess) {
                return [
                    'id' => $sess->id,
                    'ip_address' => $sess->ip_address,
                    'device' => $sess->user_agent,
                    'last_active' => Carbon::createFromTimestamp($sess->last_activity)->toIso8601String()
                ];
            });

        return response()->json([
            'status' => 'success',
            'sessions' => $sessions
        ]);
    }

    /**
     * Paksa Keluar (Force Logout) Device Staf Tertentu.
     */
    public function postLogoutStaffDevice(Request $request, $id)
    {
        $validator = Validator::make($request->all(), [
            'session_id' => 'required|string'
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        DB::table('sessions')
            ->where('user_id', $id)
            ->where('id', $request->session_id)
            ->delete();

        AuditLogger::log($request->user()->id, 'force_logout_device', "Memaksa keluar device/sesi staf ID: {$id}.", $request->user(), User::find($id));

        return response()->json([
            'status' => 'success',
            'message' => 'Device berhasil dilogout paksa.'
        ]);
    }

    /**
     * Persetujuan / Penolakan Massal Super Admin (Bulk Approvals).
     */
    public function postBulkApprovals(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'targets' => 'required|array',
            'targets.*.id' => 'required|integer',
            'targets.*.type' => 'required|in:ambulance,staff',
            'targets.*.status' => 'required|in:verified,rejected',
            'targets.*.notes' => 'required_if:targets.*.status,rejected|nullable|string',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        return DB::transaction(function () use ($request) {
            $user = $request->user();
            $processed = [];

            foreach ($request->targets as $item) {
                if ($item['type'] === 'ambulance') {
                    $ambulance = Ambulance::findOrFail($item['id']);
                    $ambulance->verification_status = $item['status'] === 'verified' ? 'verified' : 'rejected';
                    
                    if ($item['status'] === 'verified') {
                        $ambulance->status = 'standby';
                        
                        // Set all its documents to verified
                        DocumentVerification::where('verifiable_id', $ambulance->id)
                            ->where('verifiable_type', Ambulance::class)
                            ->update([
                                'status' => 'verified',
                                'verified_by_user_id' => $user->id,
                                'verified_at' => now()
                            ]);
                    } else {
                        $ambulance->status = 'offline';
                        
                        // Set pending documents to rejected
                        DocumentVerification::where('verifiable_id', $ambulance->id)
                            ->where('verifiable_type', Ambulance::class)
                            ->where('status', 'pending')
                            ->update([
                                'status' => 'rejected',
                                'rejection_notes' => $item['notes'] ?? 'Ditolak oleh Super Admin.',
                                'verified_by_user_id' => $user->id,
                                'verified_at' => now()
                            ]);
                    }
                    $ambulance->save();

                    ApprovalLog::create([
                        'action_type' => $item['status'] === 'verified' ? 'approve' : 'reject',
                        'target_id' => $ambulance->id,
                        'target_type' => Ambulance::class,
                        'notes' => $item['notes'] ?? null,
                        'user_id' => $user->id,
                    ]);

                    AuditLogger::log($user->id, 'bulk_verify_ambulance', "Super Admin memverifikasi armada {$ambulance->plate_number} status: {$item['status']}.", $user, $ambulance);
                    $processed[] = "Ambulans {$ambulance->plate_number}";

                } else if ($item['type'] === 'staff') {
                    $staffUser = User::findOrFail($item['id']);
                    
                    // Update staff profile verification
                    $profile = StaffProfile::where('user_id', $staffUser->id)->first();
                    if ($profile) {
                        $profile->verification_status = $item['status'] === 'verified' ? 'approved' : 'rejected';
                        $profile->save();
                    }

                    // Update polymorphic documents status
                    DocumentVerification::where('verifiable_id', $staffUser->id)
                        ->where('verifiable_type', User::class)
                        ->update([
                            'status' => $item['status'] === 'verified' ? 'verified' : 'rejected',
                            'rejection_notes' => $item['status'] === 'rejected' ? ($item['notes'] ?? 'Ditolak.') : null,
                            'verified_by_user_id' => $user->id,
                            'verified_at' => now(),
                        ]);

                    ApprovalLog::create([
                        'action_type' => $item['status'] === 'verified' ? 'approve' : 'reject',
                        'target_id' => $staffUser->id,
                        'target_type' => User::class,
                        'notes' => $item['notes'] ?? null,
                        'user_id' => $user->id,
                    ]);

                    AuditLogger::log($user->id, 'bulk_verify_staff', "Super Admin memverifikasi staf {$staffUser->name} status: {$item['status']}.", $user, $staffUser);
                    $processed[] = "Staf {$staffUser->name}";
                }
            }

            return response()->json([
                'status' => 'success',
                'message' => 'Persetujuan massal berhasil diproses untuk: ' . implode(', ', $processed)
            ]);
        });
    }
}
