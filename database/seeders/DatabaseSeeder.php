<?php

namespace Database\Seeders;

use App\Models\Ambulance;
use App\Models\Institution;
use App\Models\StaffProfile;
use App\Models\User;
use App\Models\VehicleDocument;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        // 1. Create Institutions
        $rshs = Institution::create([
            'name' => 'RSUP Dr. Hasan Sadikin (Negeri)',
            'type' => 'fasyankes',
            'verified_status' => 'verified',
            'license_number' => 'KES-112-RSHS',
            'address' => 'Jl. Pasteur No. 38, Bandung',
            'phone' => '022-2034953',
        ]);

        $borromeus = Institution::create([
            'name' => 'RS Santo Borromeus (Swasta)',
            'type' => 'swasta',
            'verified_status' => 'verified',
            'license_number' => 'KES-345-BOR',
            'address' => 'Jl. Ir. H. Juanda No. 100, Bandung',
            'phone' => '022-2552000',
        ]);

        $pmi = Institution::create([
            'name' => 'PMI Kota Bandung (Relawan)',
            'type' => 'relawan',
            'verified_status' => 'verified',
            'license_number' => 'KES-789-PMI',
            'address' => 'Jl. Aceh No. 79, Bandung',
            'phone' => '022-4207052',
        ]);

        // 2. Create Users for RSHS
        $adminRshs = User::create([
            'name' => 'Admin RSHS',
            'email' => 'admin_rshs@ambulanbdg.com',
            'password' => bcrypt('password123'),
            'phone' => '081111111111',
            'role' => 'institution_admin',
            'institution_id' => $rshs->id,
        ]);

        // Driver & Nurse RSHS Unit 1
        $driverRshs = User::create([
            'name' => 'Driver RSHS 01',
            'email' => 'driver_rshs@ambulanbdg.com',
            'password' => bcrypt('password123'),
            'phone' => '081222222222',
            'role' => 'driver',
            'institution_id' => $rshs->id,
        ]);

        $nurseRshs = User::create([
            'name' => 'Nurse RSHS 01',
            'email' => 'nurse_rshs@ambulanbdg.com',
            'password' => bcrypt('password123'),
            'phone' => '081333333333',
            'role' => 'nurse',
            'institution_id' => $rshs->id,
        ]);

        // Tambahan Driver & Nurse RSHS untuk Ambulans Emergency Unit 2
        $driverRshs2 = User::create([
            'name' => 'Driver RSHS 02',
            'email' => 'driver_rshs2@ambulanbdg.com',
            'password' => bcrypt('password123'),
            'phone' => '081222222223',
            'role' => 'driver',
            'institution_id' => $rshs->id,
        ]);

        $nurseRshs2 = User::create([
            'name' => 'Nurse RSHS 02',
            'email' => 'nurse_rshs2@ambulanbdg.com',
            'password' => bcrypt('password123'),
            'phone' => '081333333334',
            'role' => 'nurse',
            'institution_id' => $rshs->id,
        ]);

        // 3. Create Users for Borromeus
        $adminBor = User::create([
            'name' => 'Admin Borromeus',
            'email' => 'admin_bor@ambulanbdg.com',
            'password' => bcrypt('password123'),
            'phone' => '081444444444',
            'role' => 'institution_admin',
            'institution_id' => $borromeus->id,
        ]);

        $driverBor = User::create([
            'name' => 'Driver Borromeus',
            'email' => 'driver_bor@ambulanbdg.com',
            'password' => bcrypt('password123'),
            'phone' => '081555555555',
            'role' => 'driver',
            'institution_id' => $borromeus->id,
        ]);

        $nurseBor = User::create([
            'name' => 'Nurse Borromeus',
            'email' => 'nurse_bor@ambulanbdg.com',
            'password' => bcrypt('password123'),
            'phone' => '081666666666',
            'role' => 'nurse',
            'institution_id' => $borromeus->id,
        ]);

        // 4. Create Users for PMI
        $adminPmi = User::create([
            'name' => 'Admin PMI',
            'email' => 'admin_pmi@ambulanbdg.com',
            'password' => bcrypt('password123'),
            'phone' => '081777777777',
            'role' => 'institution_admin',
            'institution_id' => $pmi->id,
        ]);

        $driverPmi = User::create([
            'name' => 'Driver PMI 01',
            'email' => 'driver_pmi@ambulanbdg.com',
            'password' => bcrypt('password123'),
            'phone' => '081888888888',
            'role' => 'driver',
            'institution_id' => $pmi->id,
        ]);

        // Tambahan Driver & Nurse PMI untuk Ambulans Emergency Baru
        $driverPmi2 = User::create([
            'name' => 'Driver PMI 02',
            'email' => 'driver_pmi2@ambulanbdg.com',
            'password' => bcrypt('password123'),
            'phone' => '081888888889',
            'role' => 'driver',
            'institution_id' => $pmi->id,
        ]);

        $nursePmi2 = User::create([
            'name' => 'Nurse PMI 02',
            'email' => 'nurse_pmi2@ambulanbdg.com',
            'password' => bcrypt('password123'),
            'phone' => '081777777778',
            'role' => 'nurse',
            'institution_id' => $pmi->id,
        ]);

        // 5. Create Staff Profiles (SIM/STR) - Valid 1 Year
        StaffProfile::create([
            'user_id' => $driverRshs->id,
            'staff_type' => 'driver',
            'license_number' => 'SIM-RSHS-999',
            'license_expiry' => now()->addYear()->toDateString(),
            'verification_status' => 'approved',
        ]);

        StaffProfile::create([
            'user_id' => $driverRshs2->id,
            'staff_type' => 'driver',
            'license_number' => 'SIM-RSHS-998',
            'license_expiry' => now()->addYear()->toDateString(),
            'verification_status' => 'approved',
        ]);

        StaffProfile::create([
            'user_id' => $driverBor->id,
            'staff_type' => 'driver',
            'license_number' => 'SIM-BOR-888',
            'license_expiry' => now()->addYear()->toDateString(),
            'verification_status' => 'approved',
        ]);

        StaffProfile::create([
            'user_id' => $driverPmi->id,
            'staff_type' => 'driver',
            'license_number' => 'SIM-PMI-777',
            'license_expiry' => now()->addYear()->toDateString(),
            'verification_status' => 'approved',
        ]);

        StaffProfile::create([
            'user_id' => $driverPmi2->id,
            'staff_type' => 'driver',
            'license_number' => 'SIM-PMI-776',
            'license_expiry' => now()->addYear()->toDateString(),
            'verification_status' => 'approved',
        ]);

        StaffProfile::create([
            'user_id' => $nurseRshs->id,
            'staff_type' => 'nurse',
            'license_number' => 'STR-RSHS-222',
            'license_expiry' => now()->addYear()->toDateString(),
            'verification_status' => 'approved',
        ]);

        StaffProfile::create([
            'user_id' => $nurseRshs2->id,
            'staff_type' => 'nurse',
            'license_number' => 'STR-RSHS-223',
            'license_expiry' => now()->addYear()->toDateString(),
            'verification_status' => 'approved',
        ]);

        StaffProfile::create([
            'user_id' => $nurseBor->id,
            'staff_type' => 'nurse',
            'license_number' => 'STR-BOR-111',
            'license_expiry' => now()->addYear()->toDateString(),
            'verification_status' => 'approved',
        ]);

        StaffProfile::create([
            'user_id' => $nursePmi2->id,
            'staff_type' => 'nurse',
            'license_number' => 'STR-PMI-112',
            'license_expiry' => now()->addYear()->toDateString(),
            'verification_status' => 'approved',
        ]);

        // 6. Create Standby Ambulances close to Bandung Wetan / Gedung Sate (Longitude: 107.6188, Latitude: -6.9024)
        
        // [EMERGENCY 1] - RSHS Unit 01 (Dekat Gedung Sate)
        $ambRshs = new Ambulance();
        $ambRshs->institution_id = $rshs->id;
        $ambRshs->plate_number = 'D 1111 RSH';
        $ambRshs->category = 'emergency';
        $ambRshs->status = 'standby';
        $ambRshs->is_free_service_eligible = true;
        $ambRshs->base_fare = 120000.00;
        $ambRshs->price_per_km = 18000.00;
        $ambRshs->current_driver_id = $driverRshs->id;
        $ambRshs->current_nurse_id = $nurseRshs->id;
        $ambRshs->current_location = DB::raw("Point(107.618600, -6.902500)"); 
        $ambRshs->save();

        // [EMERGENCY 2] - RSHS Unit 02 (Dekat Balai Kota Bandung)
        $ambRshs2 = new Ambulance();
        $ambRshs2->institution_id = $rshs->id;
        $ambRshs2->plate_number = 'D 1112 RSH';
        $ambRshs2->category = 'emergency';
        $ambRshs2->status = 'standby';
        $ambRshs2->is_free_service_eligible = true;
        $ambRshs2->base_fare = 120000.00;
        $ambRshs2->price_per_km = 18000.00;
        $ambRshs2->current_driver_id = $driverRshs2->id;
        $ambRshs2->current_nurse_id = $nurseRshs2->id;
        $ambRshs2->current_location = DB::raw("Point(107.609600, -6.913400)"); // Dekat Balai Kota
        $ambRshs2->save();

        // [NON-EMERGENCY] - Borromeus
        $ambBor = new Ambulance();
        $ambBor->institution_id = $borromeus->id;
        $ambBor->plate_number = 'D 2222 BOR';
        $ambBor->category = 'non-emergency';
        $ambBor->status = 'standby';
        $ambBor->is_free_service_eligible = false;
        $ambBor->base_fare = 150000.00;
        $ambBor->price_per_km = 20000.00;
        $ambBor->current_driver_id = $driverBor->id;
        $ambBor->current_nurse_id = $nurseBor->id;
        $ambBor->current_location = DB::raw("Point(107.604200, -6.896500)"); // Near Cihampelas Walk
        $ambBor->save();

        // [CORPSE] - PMI Unit 01
        $ambPmi = new Ambulance();
        $ambPmi->institution_id = $pmi->id;
        $ambPmi->plate_number = 'D 3333 PMI';
        $ambPmi->category = 'corpse';
        $ambPmi->status = 'standby';
        $ambPmi->is_free_service_eligible = true;
        $ambPmi->base_fare = 100000.00;
        $ambPmi->price_per_km = 12000.00;
        $ambPmi->current_driver_id = $driverPmi->id;
        $ambPmi->current_location = DB::raw("Point(107.616500, -6.891500)"); // Near Dago
        $ambPmi->save();

        // [EMERGENCY 3] - PMI Unit 02 (Dekat Alun-Alun Bandung)
        $ambPmi2 = new Ambulance();
        $ambPmi2->institution_id = $pmi->id;
        $ambPmi2->plate_number = 'D 3334 PMI';
        $ambPmi2->category = 'emergency';
        $ambPmi2->status = 'standby';
        $ambPmi2->is_free_service_eligible = true;
        $ambPmi2->base_fare = 0.00; // Layanan PMI Emergency murni gratis operasional relawan
        $ambPmi2->price_per_km = 0.00;
        $ambPmi2->current_driver_id = $driverPmi2->id;
        $ambPmi2->current_nurse_id = $nursePmi2->id;
        $ambPmi2->current_location = DB::raw("Point(107.606900, -6.921900)"); // Dekat Alun-Alun
        $ambPmi2->save();

        // 7. Create Vehicle Documents for the ambulances (Valid 1 year)
        VehicleDocument::create([
            'ambulance_id' => $ambRshs->id,
            'doc_type' => 'STNK',
            'document_path' => '/uploads/documents/stnk_rshs.pdf',
            'verification_status' => 'approved',
            'expiry_date' => now()->addYear()->toDateString(),
        ]);

        VehicleDocument::create([
            'ambulance_id' => $ambRshs2->id,
            'doc_type' => 'STNK',
            'document_path' => '/uploads/documents/stnk_rshs2.pdf',
            'verification_status' => 'approved',
            'expiry_date' => now()->addYear()->toDateString(),
        ]);

        VehicleDocument::create([
            'ambulance_id' => $ambBor->id,
            'doc_type' => 'STNK',
            'document_path' => '/uploads/documents/stnk_bor.pdf',
            'verification_status' => 'approved',
            'expiry_date' => now()->addYear()->toDateString(),
        ]);

        VehicleDocument::create([
            'ambulance_id' => $ambPmi->id,
            'doc_type' => 'STNK',
            'document_path' => '/uploads/documents/stnk_pmi.pdf',
            'verification_status' => 'approved',
            'expiry_date' => now()->addYear()->toDateString(),
        ]);

        VehicleDocument::create([
            'ambulance_id' => $ambPmi2->id,
            'doc_type' => 'STNK',
            'document_path' => '/uploads/documents/stnk_pmi2.pdf',
            'verification_status' => 'approved',
            'expiry_date' => now()->addYear()->toDateString(),
        ]);

        // 8. Create Customer & Super Admin Accounts
        User::create([
            'name' => 'Budi Customer',
            'email' => 'customer@ambulanbdg.com',
            'password' => bcrypt('password123'),
            'phone' => '081999999999',
            'role' => 'customer',
        ]);

        User::create([
            'name' => 'Super Admin',
            'email' => 'superadmin@ambulanbdg.com',
            'password' => bcrypt('password123'),
            'phone' => '081000000000',
            'role' => 'super_admin',
        ]);
    }
}