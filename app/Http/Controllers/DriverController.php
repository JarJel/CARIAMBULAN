<?php

namespace App\Http\Controllers;

use App\Helpers\AuditLogger;
use App\Models\Ambulance;
use App\Models\Order;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

class DriverController extends Controller
{
    /**
     * Mengikat driver/perawat ke unit ambulans tertentu.
     */
    public function postAssignAmbulance(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'ambulance_id' => 'required|exists:ambulances,id',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $user = $request->user();
        $ambulance = Ambulance::findOrFail($request->ambulance_id);

        return DB::transaction(function () use ($user, $ambulance) {
            if ($user->role === 'driver') {
                $ambulance->current_driver_id = $user->id;
            } elseif ($user->role === 'nurse') {
                $ambulance->current_nurse_id = $user->id;
            }

            // Set status menjadi standby (online) jika kru ditugaskan
            $ambulance->status = 'standby';
            $ambulance->save();

            // Catat Log Audit
            AuditLogger::log(
                $user->id,
                'assign_ambulance_staff',
                "Staf {$user->name} (Role: {$user->role}) mengikat diri ke Ambulans {$ambulance->plate_number}."
            );

            return response()->json([
                'status' => 'success',
                'message' => "Anda berhasil terikat ke armada {$ambulance->plate_number}.",
                'ambulance' => $ambulance,
            ]);
        });
    }

    /**
     * Mengubah status online/offline armada yang sedang dikendarai oleh staf tersebut.
     */
    public function postToggleStatus(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'status' => 'required|in:standby,offline',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $user = $request->user();

        // Cari ambulans yang dikendarai oleh staf ini
        $ambulance = Ambulance::where('current_driver_id', $user->id)
            ->orWhere('current_nurse_id', $user->id)
            ->first();

        if (!$ambulance) {
            return response()->json([
                'status' => 'error',
                'message' => 'Anda harus terikat ke armada ambulans terlebih dahulu.',
            ], 400);
        }

        return DB::transaction(function () use ($ambulance, $request, $user) {
            $oldStatus = $ambulance->status;
            $ambulance->status = $request->status;
            $ambulance->save();

            // Catat Log Audit
            AuditLogger::log(
                $user->id,
                'toggle_ambulance_status',
                "Staf {$user->name} mengubah status ambulans {$ambulance->plate_number} dari {$oldStatus} menjadi {$request->status}."
            );

            return response()->json([
                'status' => 'success',
                'message' => "Status armada berhasil diperbarui menjadi {$request->status}.",
                'ambulance' => $ambulance,
            ]);
        });
    }

    /**
     * Mendapatkan tugas perjalanan (trip) aktif saat ini untuk unit ambulans kru.
     */
    public function getActiveTrips(Request $request)
    {
        $user = $request->user();

        // Cari ambulans yang dikendarai oleh staf ini
        $ambulance = Ambulance::where('current_driver_id', $user->id)
            ->orWhere('current_nurse_id', $user->id)
            ->first();

        if (!$ambulance) {
            return response()->json([
                'status' => 'error',
                'message' => 'Anda harus terikat ke armada ambulans terlebih dahulu.',
            ], 400);
        }

        // Cari order aktif untuk armada ini
        $order = Order::with(['patientDetail', 'payment', 'user'])
            ->where('ambulance_id', $ambulance->id)
            ->whereIn('status', ['awaiting_driver_response', 'confirmed', 'on_the_way', 'arrived', 'transporting'])
            ->first();

        if ($order) {
            $coords = DB::selectOne("
                SELECT 
                    ST_X(pickup_location) as pickup_lng, 
                    ST_Y(pickup_location) as pickup_lat,
                    ST_X(destination_location) as dest_lng,
                    ST_Y(destination_location) as dest_lat
                FROM orders 
                WHERE id = ?
            ", [$order->id]);

            if ($coords) {
                $order->pickup_latitude = $coords->pickup_lat;
                $order->pickup_longitude = $coords->pickup_lng;
                $order->destination_latitude = $coords->dest_lat;
                $order->destination_longitude = $coords->dest_lng;
            }

            if ($order->status === 'transporting' && !$order->destination_latitude && $order->ambulance_id) {
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
        }

        return response()->json([
            'status' => 'success',
            'order' => $order,
        ]);
    }

    /**
     * Catat checklist kondisi kendaraan sebelum mulai shift/ikat armada oleh driver.
     */
    public function postSubmitChecklist(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'ambulance_id' => 'required|exists:ambulances,id',
            'fuel_status' => 'required|in:fully,half,low',
            'oxygen_status' => 'required|in:fully,half,low,none',
            'medical_supplies_status' => 'required|in:complete,incomplete',
            'notes' => 'nullable|string',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $user = $request->user();
        $ambulance = Ambulance::findOrFail($request->ambulance_id);

        return DB::transaction(function () use ($user, $ambulance, $request) {
            // Save checklist
            $checklist = \App\Models\VehicleChecklist::create([
                'ambulance_id' => $ambulance->id,
                'driver_user_id' => $user->id,
                'fuel_status' => $request->fuel_status,
                'oxygen_status' => $request->oxygen_status,
                'medical_supplies_status' => $request->medical_supplies_status,
                'notes' => $request->notes,
            ]);

            // Catat Log Audit
            AuditLogger::log(
                $user->id,
                'submit_vehicle_checklist',
                "Staf {$user->name} memasukkan checklist shift untuk Ambulans {$ambulance->plate_number}.",
                $user,
                $ambulance,
                $request->only(['fuel_status', 'oxygen_status', 'medical_supplies_status', 'notes'])
            );

            return response()->json([
                'status' => 'success',
                'message' => 'Checklist kondisi kendaraan berhasil disimpan.',
                'checklist' => $checklist
            ]);
        });
    }
}
