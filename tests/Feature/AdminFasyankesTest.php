<?php

use App\Models\Ambulance;
use App\Models\EventProposal;
use App\Models\Institution;
use App\Models\Order;
use App\Models\StaffProfile;
use App\Models\User;
use App\Models\VehicleDocument;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;

test('it allows admin to verify vehicle documents and restore ambulance from suspension', function () {
    // 2. Setup Institution & Ambulance
    $institution = Institution::create([
        'name' => 'Klinik Sukajadi',
        'type' => 'fasyankes',
        'verified_status' => 'verified',
    ]);

    // 1. Setup Admin
    $admin = User::create([
        'name' => 'Fasyankes Admin',
        'email' => 'admin_doc@fasyankes.com',
        'password' => bcrypt('password'),
        'role' => 'institution_admin',
        'institution_id' => $institution->id,
    ]);

    $ambulance = new Ambulance();
    $ambulance->institution_id = $institution->id;
    $ambulance->plate_number = 'D 7777 AB';
    $ambulance->category = 'emergency';
    $ambulance->status = 'suspended'; // Suspended due to expired STNK
    $ambulance->current_location = DB::raw("Point(107.619123, -6.917464)");
    $ambulance->save();

    $doc = VehicleDocument::create([
        'ambulance_id' => $ambulance->id,
        'doc_type' => 'STNK',
        'document_path' => '/uploads/stnk.pdf',
        'verification_status' => 'pending',
        'expiry_date' => now()->addYear()->toDateString(), // Valid
    ]);

    // 3. Verify STNK Document via API
    $response = $this->actingAs($admin)->postJson("/api/admin/documents/{$doc->id}/verify", [
        'verification_status' => 'approved',
    ]);

    $response->assertStatus(200);
    $response->assertJsonPath('document.verification_status', 'approved');

    // 4. Assert Ambulance is restored to standby
    expect(Ambulance::find($ambulance->id)->status)->toBe('standby');

    // 5. Assert Audit Log is written
    $this->assertDatabaseHas('audit_logs', [
        'user_id' => $admin->id,
        'action' => 'verify_vehicle_document',
    ]);
});

test('it allows admin to verify staff profile', function () {
    $institution = Institution::create([
        'name' => 'Klinik Sukajadi',
        'type' => 'fasyankes',
        'verified_status' => 'verified',
    ]);

    $admin = User::create([
        'name' => 'Fasyankes Admin',
        'email' => 'admin_staff@fasyankes.com',
        'password' => bcrypt('password'),
        'role' => 'institution_admin',
        'institution_id' => $institution->id,
    ]);

    $user = User::create([
        'name' => 'Driver Joko',
        'email' => 'joko@driver.com',
        'password' => bcrypt('password'),
        'role' => 'driver',
        'institution_id' => $institution->id,
    ]);

    $staff = StaffProfile::create([
        'user_id' => $user->id,
        'staff_type' => 'driver',
        'license_number' => 'SIM-999',
        'license_expiry' => now()->addYear()->toDateString(),
        'verification_status' => 'pending',
    ]);

    $response = $this->actingAs($admin)->postJson("/api/admin/staff/{$staff->id}/verify", [
        'verification_status' => 'approved',
    ]);

    $response->assertStatus(200);
    $response->assertJsonPath('staff_profile.verification_status', 'approved');

    $this->assertDatabaseHas('audit_logs', [
        'user_id' => $admin->id,
        'action' => 'verify_staff_profile',
    ]);
});

test('it allows admin to manage ambulance category, status, and custom dynamic tariffs', function () {
    $institution = Institution::create([
        'name' => 'Klinik Sukajadi',
        'type' => 'fasyankes',
        'verified_status' => 'verified',
    ]);

    $admin = User::create([
        'name' => 'Fasyankes Admin',
        'email' => 'admin_tariff@fasyankes.com',
        'password' => bcrypt('password'),
        'role' => 'institution_admin',
        'institution_id' => $institution->id,
    ]);

    $customer = User::create([
        'name' => 'Sewa Customer',
        'email' => 'sewacust@customer.com',
        'password' => bcrypt('password'),
        'role' => 'customer',
    ]);

    $ambulance = new Ambulance();
    $ambulance->institution_id = $institution->id;
    $ambulance->plate_number = 'D 9999 AA';
    $ambulance->category = 'non-emergency';
    $ambulance->status = 'offline';
    $ambulance->current_location = DB::raw("Point(107.619123, -6.917464)");
    $ambulance->save();

    // 1. Manage Ambulance: set to standby, set base_fare = 150000, price_per_km = 20000
    $response = $this->actingAs($admin)->postJson("/api/admin/ambulances/{$ambulance->id}/manage", [
        'status' => 'standby',
        'category' => 'non-emergency',
        'base_fare' => 150000,
        'price_per_km' => 20000,
    ]);

    $response->assertStatus(200);
    $response->assertJsonPath('ambulance.status', 'standby');
    expect((float) $response->json('ambulance.base_fare'))->toBe(150000.00);
    expect((float) $response->json('ambulance.price_per_km'))->toBe(20000.00);

    $this->assertDatabaseHas('audit_logs', [
        'user_id' => $admin->id,
        'action' => 'manage_ambulance',
    ]);

    // 2. Test booking sewa uses this new custom tariff
    // Distance from (107.619123, -6.917464) to (107.629123, -6.917464) is ~1.11 KM
    $responseSewa = $this->actingAs($customer)->postJson('/api/orders/sewa', [
        'user_id' => $customer->id,
        'ambulance_id' => $ambulance->id,
        'pickup_longitude' => 107.619123,
        'pickup_latitude' => -6.917464,
        'pickup_address' => 'Gedung Sate',
        'destination_longitude' => 107.629123,
        'destination_latitude' => -6.917464,
        'destination_address' => 'Cihampelas Walk',
        'scheduled_start_time' => now()->addDays(2)->format('Y-m-d H:i:s'),
        'scheduled_end_time' => now()->addDays(2)->addHours(2)->format('Y-m-d H:i:s'),
    ]);

    $responseSewa->assertStatus(201);
    
    // Check custom fare calculation: 150,000 + (~1.11 * 20,000) = ~172,200
    $fareAmount = (float) $responseSewa->json('order.fare_amount');
    expect($fareAmount)->toBeGreaterThan(170000);
    expect($fareAmount)->toBeLessThan(175000);
});

test('it allows admin to approve event proposal, assign ambulance, and change status to confirmed', function () {
    Notification::fake();

    $institution = Institution::create([
        'name' => 'Klinik Sukajadi',
        'type' => 'fasyankes',
        'verified_status' => 'verified',
    ]);

    $admin = User::create([
        'name' => 'Fasyankes Admin',
        'email' => 'admin_event@fasyankes.com',
        'password' => bcrypt('password'),
        'role' => 'institution_admin',
        'institution_id' => $institution->id,
    ]);

    $customer = User::create([
        'name' => 'Event Organizer',
        'email' => 'eo@event.com',
        'password' => bcrypt('password'),
        'role' => 'customer',
    ]);

    $ambulance = new Ambulance();
    $ambulance->institution_id = $institution->id;
    $ambulance->plate_number = 'D 8888 BB';
    $ambulance->category = 'emergency';
    $ambulance->status = 'standby';
    $ambulance->current_location = DB::raw("Point(107.619123, -6.917464)");
    $ambulance->save();

    // Setup Order Event (ambulance_id = null, status = pending)
    $order = Order::create([
        'user_id' => $customer->id,
        'ambulance_id' => null,
        'order_type' => 'event',
        'status' => 'pending',
        'scheduled_start_time' => now()->addDays(5)->format('Y-m-d H:i:s'),
        'scheduled_end_time' => now()->addDays(5)->addHours(12)->format('Y-m-d H:i:s'),
        'pickup_location' => DB::raw("Point(107.619123, -6.917464)"),
        'pickup_address' => 'Lap. Gasibu',
        'fare_amount' => 1500000.00,
    ]);

    $proposal = EventProposal::create([
        'order_id' => $order->id,
        'document_path' => '/uploads/event_proposal.pdf',
        'review_status' => 'pending',
    ]);

    // Verify and approve event proposal
    $response = $this->actingAs($admin)->postJson("/api/admin/event-proposals/{$proposal->id}/verify", [
        'review_status' => 'approved',
        'ambulance_id' => $ambulance->id,
    ]);

    $response->assertStatus(200);
    $response->assertJsonPath('proposal.review_status', 'approved');
    $response->assertJsonPath('order.status', 'confirmed');
    $response->assertJsonPath('order.ambulance_id', $ambulance->id);

    // Verify Ambulance status is now on_duty
    expect(Ambulance::find($ambulance->id)->status)->toBe('on_duty');

    // Verify TripStatusHistory was logged
    $this->assertDatabaseHas('trip_status_histories', [
        'order_id' => $order->id,
        'status' => 'confirmed',
    ]);

    // Verify Customer notification was sent
    Notification::assertSentTo($customer, \App\Notifications\OrderStatusUpdated::class);

    // Verify Audit Log was recorded
    $this->assertDatabaseHas('audit_logs', [
        'user_id' => $admin->id,
        'action' => 'verify_event_proposal',
    ]);
});

test('it allows admin to create staff with password directly', function () {
    \Illuminate\Support\Facades\Storage::fake('public');

    $institution = Institution::create([
        'name' => 'Klinik Sukajadi',
        'type' => 'fasyankes',
        'verified_status' => 'verified',
    ]);

    $admin = User::create([
        'name' => 'Fasyankes Admin',
        'email' => 'admin_staff_create@fasyankes.com',
        'password' => bcrypt('password'),
        'role' => 'institution_admin',
        'institution_id' => $institution->id,
    ]);

    $response = $this->actingAs($admin)->postJson("/api/admin/staff", [
        'name' => 'New Driver Rudi',
        'email' => 'rudi@driver.com',
        'phone' => '081234567890',
        'nik' => '3273010101010101',
        'role' => 'driver',
        'password' => 'secretpassword123',
        'ktp_file' => \Illuminate\Http\UploadedFile::fake()->create('ktp.pdf', 500),
        'sim_file' => \Illuminate\Http\UploadedFile::fake()->create('sim.pdf', 500),
    ]);

    $response->assertStatus(200);
    $response->assertJsonPath('status', 'success');

    $this->assertDatabaseHas('users', [
        'email' => 'rudi@driver.com',
        'role' => 'driver',
        'institution_id' => $institution->id,
    ]);

    $user = User::where('email', 'rudi@driver.com')->first();
    expect(Hash::check('secretpassword123', $user->password))->toBeTrue();
});

test('it renders admin staff page with staff and ambulances list', function () {
    $institution = Institution::create([
        'name' => 'Klinik Sukajadi',
        'type' => 'fasyankes',
        'verified_status' => 'verified',
    ]);

    $admin = User::create([
        'name' => 'Fasyankes Admin',
        'email' => 'admin_staff_page@fasyankes.com',
        'password' => bcrypt('password'),
        'role' => 'institution_admin',
        'institution_id' => $institution->id,
    ]);

    $ambulance = new Ambulance();
    $ambulance->institution_id = $institution->id;
    $ambulance->plate_number = 'D 1234 XY';
    $ambulance->category = 'emergency';
    $ambulance->status = 'standby';
    $ambulance->current_location = DB::raw("Point(107.619123, -6.917464)");
    $ambulance->save();

    $response = $this->actingAs($admin)->get("/admin/staff");

    $response->assertStatus(200);
    $response->assertInertia(fn (\Inertia\Testing\AssertableInertia $page) => $page
        ->component('admin/staff')
        ->has('staff')
        ->has('ambulances', 1)
        ->where('ambulances.0.plate_number', 'D 1234 XY')
    );
});

test('it allows admin to create ambulance with driver plotting', function () {
    \Illuminate\Support\Facades\Storage::fake('public');

    $institution = Institution::create([
        'name' => 'Klinik Sukajadi',
        'type' => 'fasyankes',
        'verified_status' => 'verified',
    ]);

    $admin = User::create([
        'name' => 'Fasyankes Admin',
        'email' => 'admin_amb_create@fasyankes.com',
        'password' => bcrypt('password'),
        'role' => 'institution_admin',
        'institution_id' => $institution->id,
    ]);

    $driver = User::create([
        'name' => 'Driver Budi',
        'email' => 'budi@driver.com',
        'password' => bcrypt('password'),
        'role' => 'driver',
        'institution_id' => $institution->id,
    ]);

    // Setup an old ambulance that Budi is currently assigned to
    $oldAmbulance = new Ambulance();
    $oldAmbulance->institution_id = $institution->id;
    $oldAmbulance->plate_number = 'D 1111 AB';
    $oldAmbulance->category = 'emergency';
    $oldAmbulance->status = 'standby';
    $oldAmbulance->current_driver_id = $driver->id;
    $oldAmbulance->current_location = DB::raw("Point(107.619123, -6.917464)");
    $oldAmbulance->save();

    // Create a new ambulance plotting Budi
    $response = $this->actingAs($admin)->postJson("/api/admin/ambulances", [
        'plate_number' => 'D 2222 AB',
        'category' => 'emergency',
        'brand' => 'Suzuki APV',
        'year' => 2022,
        'capacity' => 1,
        'driver_id' => $driver->id,
        'stnk_file' => \Illuminate\Http\UploadedFile::fake()->create('stnk.pdf', 500),
        'operasional_file' => \Illuminate\Http\UploadedFile::fake()->create('operasional.pdf', 500),
        'is_draft' => false,
    ]);

    $response->assertStatus(200);
    $response->assertJsonPath('status', 'success');

    // Assert driver has been assigned to the new ambulance
    $newAmbulance = Ambulance::where('plate_number', 'D 2222 AB')->first();
    expect($newAmbulance->current_driver_id)->toBe($driver->id);

    // Assert driver has been cleared from the old ambulance
    $oldAmbulance->refresh();
    expect($oldAmbulance->current_driver_id)->toBeNull();
});

test('it renders admin ambulances page with drivers list', function () {
    $institution = Institution::create([
        'name' => 'Klinik Sukajadi',
        'type' => 'fasyankes',
        'verified_status' => 'verified',
    ]);

    $admin = User::create([
        'name' => 'Fasyankes Admin',
        'email' => 'admin_amb_page@fasyankes.com',
        'password' => bcrypt('password'),
        'role' => 'institution_admin',
        'institution_id' => $institution->id,
    ]);

    $driver = User::create([
        'name' => 'Driver Budi',
        'email' => 'budi@driver.com',
        'password' => bcrypt('password'),
        'role' => 'driver',
        'institution_id' => $institution->id,
    ]);

    $response = $this->actingAs($admin)->get("/admin/ambulances");

    $response->assertStatus(200);
    $response->assertInertia(fn (\Inertia\Testing\AssertableInertia $page) => $page
        ->component('admin/ambulances')
        ->has('ambulances')
        ->has('drivers', 1)
        ->where('drivers.0.name', 'Driver Budi')
    );
});

test('it updates patient_details table with vitals when postUpdatePatientCondition is called', function () {
    $customer = User::create([
        'name' => 'Customer Anto',
        'email' => 'anto@customer.com',
        'password' => bcrypt('password'),
        'role' => 'customer',
    ]);

    $order = Order::create([
        'user_id' => $customer->id,
        'ambulance_id' => null,
        'order_type' => 'SOS',
        'status' => 'pending',
        'pickup_location' => DB::raw("Point(107.619123, -6.917464)"),
        'pickup_address' => 'Jl. Ir. H. Juanda No. 100',
        'fare_amount' => 0.00,
    ]);

    // First save basic patient details
    $detail = \App\Models\PatientDetail::create([
        'order_id' => $order->id,
        'patient_name' => 'Udin',
        'patient_age' => 45,
        'condition_notes' => 'Pingsan mendadak',
    ]);

    // Send observations condition updates
    $response = $this->actingAs($customer)->postJson("/api/orders/{$order->id}/patient-condition", [
        'patient_condition' => 'Tensi: 120/80 mmHg, Suhu: 36.5 °C',
        'tensi' => '120/80',
        'suhu' => '36.5',
        'nadi' => '80',
        'pernapasan' => '18',
        'spo2' => '98',
    ]);

    $response->assertStatus(200);
    $response->assertJsonPath('status', 'success');

    // Verify patient_details has these new vital columns
    $this->assertDatabaseHas('patient_details', [
        'order_id' => $order->id,
        'patient_name' => 'Udin',
        'tensi' => '120/80',
        'suhu' => '36.5',
        'nadi' => '80',
        'pernapasan' => '18',
        'spo2' => '98',
    ]);
});
