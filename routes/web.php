<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\AuthController;

Route::get('/', function () {
    $activeSosOrder = null;
    if (auth()->check()) {
        $activeSosOrder = \App\Models\Order::with([
            'ambulance.institution',
            'ambulance.currentDriver',
            'ambulance.currentNurse'
        ])
        ->where('user_id', auth()->id())
        ->whereNotIn('status', ['completed', 'cancelled', 'no_ambulance_available'])
        ->latest()
        ->first();
        
        if ($activeSosOrder && $activeSosOrder->ambulance) {
            $coords = DB::selectOne("SELECT ST_X(current_location) as lng, ST_Y(current_location) as lat FROM ambulances WHERE id = ?", [$activeSosOrder->ambulance_id]);
            if ($coords) {
                $activeSosOrder->ambulance->latitude = $coords->lat;
                $activeSosOrder->ambulance->longitude = $coords->lng;
            }
        }
    }

    return inertia('welcome', [
        'initialActiveSosOrder' => $activeSosOrder
    ]);
})->name('home');

Route::get('/login', [AuthController::class, 'showLogin'])->name('login');
Route::post('/login', [AuthController::class, 'login']);
Route::get('/register', [AuthController::class, 'showRegister'])->name('register');
Route::post('/register', [AuthController::class, 'register']);
Route::post('/logout', [AuthController::class, 'logout'])->name('logout');

Route::get('/orders/{id}/tracking', function ($id) {
    $order = \App\Models\Order::with(['ambulance.institution', 'ambulance.currentDriver', 'ambulance.currentNurse', 'patientDetail', 'payment'])->findOrFail($id);
    
    // Inject order pickup coordinates
    $orderCoords = DB::selectOne("SELECT ST_X(pickup_location) as lng, ST_Y(pickup_location) as lat FROM orders WHERE id = ?", [$id]);
    if ($orderCoords) {
        $order->pickup_latitude = $orderCoords->lat;
        $order->pickup_longitude = $orderCoords->lng;
    }

    // Inject order destination coordinates if exists
    $destCoords = DB::selectOne("SELECT ST_X(destination_location) as lng, ST_Y(destination_location) as lat FROM orders WHERE id = ?", [$id]);
    if ($destCoords) {
        $order->destination_latitude = $destCoords->lat;
        $order->destination_longitude = $destCoords->lng;
    }

    if ($order->ambulance) {
        $coords = DB::selectOne("SELECT ST_X(current_location) as lng, ST_Y(current_location) as lat FROM ambulances WHERE id = ?", [$order->ambulance_id]);
        if ($coords) {
            $order->ambulance->latitude = $coords->lat;
            $order->ambulance->longitude = $coords->lng;
        }
    }
    return inertia('orders/tracking', [
        'order' => $order
    ]);
})->name('orders.tracking');

Route::get('/orders/{id}/detail', function ($id) {
    $order = \App\Models\Order::with(['ambulance.institution', 'ambulance.currentDriver', 'ambulance.currentNurse', 'rating', 'patientDetail', 'payment'])->findOrFail($id);
    if ($order->ambulance) {
        $coords = DB::selectOne("SELECT ST_X(current_location) as lng, ST_Y(current_location) as lat FROM ambulances WHERE id = ?", [$order->ambulance_id]);
        if ($coords) {
            $order->ambulance->latitude = $coords->lat;
            $order->ambulance->longitude = $coords->lng;
        }
    }
    return inertia('orders/detail', [
        'order' => $order
    ]);
})->name('orders.detail');

Route::get('/track/{id}/{token}', function ($id, $token) {
    $order = \App\Models\Order::with(['ambulance.institution', 'ambulance.currentDriver', 'ambulance.currentNurse', 'patientDetail', 'payment'])
        ->findOrFail($id);

    if ($order->guest_session_token !== $token) {
        abort(403, 'Akses ditolak. Token tidak valid.');
    }

    if ($order->guest_token_expires_at && now()->greaterThan($order->guest_token_expires_at)) {
        abort(403, 'Akses ditolak. Token kedaluwarsa.');
    }

    // Inject order pickup coordinates
    $orderCoords = DB::selectOne("SELECT ST_X(pickup_location) as lng, ST_Y(pickup_location) as lat FROM orders WHERE id = ?", [$id]);
    if ($orderCoords) {
        $order->pickup_latitude = $orderCoords->lat;
        $order->pickup_longitude = $orderCoords->lng;
    }

    // Inject order destination coordinates if exists
    $destCoords = DB::selectOne("SELECT ST_X(destination_location) as lng, ST_Y(destination_location) as lat FROM orders WHERE id = ?", [$id]);
    if ($destCoords) {
        $order->destination_latitude = $destCoords->lat;
        $order->destination_longitude = $destCoords->lng;
    }

    if ($order->ambulance) {
        $coords = DB::selectOne("SELECT ST_X(current_location) as lng, ST_Y(current_location) as lat FROM ambulances WHERE id = ?", [$order->ambulance_id]);
        if ($coords) {
            $order->ambulance->latitude = $coords->lat;
            $order->ambulance->longitude = $coords->lng;
        }
    }
    return inertia('orders/tracking', [
        'order' => $order,
        'isGuest' => true,
        'guestToken' => $token
    ]);
})->middleware('throttle:120,1')->name('orders.guest.tracking');

Route::middleware(['auth'])->group(function () {
    // 1. Super Admin
    Route::prefix('superadmin')->group(function () {
        Route::get('/dashboard', function () {
            if (auth()->user()->role !== 'super_admin') abort(403);
            return inertia('superadmin/dashboard', [
                'stats' => [
                    'total_orders' => \App\Models\Order::count(),
                    'total_revenue' => (float) \App\Models\Payment::where('status', 'completed')->sum('amount'),
                    'avg_sla_seconds' => round(\App\Models\SosLog::avg('response_time_seconds') ?? 0),
                    'total_institutions' => \App\Models\Institution::count(),
                    'total_ambulances' => \App\Models\Ambulance::count(),
                    'total_users' => \App\Models\User::count(),
                ],
                'recent_logs' => \App\Models\AuditLog::with('user')->latest()->take(10)->get()
            ]);
        })->name('superadmin.dashboard');

        Route::get('/institutions', function () {
            if (auth()->user()->role !== 'super_admin') abort(403);
            return inertia('superadmin/institutions', [
                'institutions' => \App\Models\Institution::withCount('ambulances')->get()
            ]);
        })->name('superadmin.institutions');

        Route::get('/ambulances', function () {
            if (auth()->user()->role !== 'super_admin') abort(403);
            return inertia('superadmin/ambulances', [
                'ambulances' => \App\Models\Ambulance::with('institution')->get()
            ]);
        })->name('superadmin.ambulances');

        Route::get('/users', function () {
            if (auth()->user()->role !== 'super_admin') abort(403);
            return inertia('superadmin/users', [
                'users' => \App\Models\User::with('institution')->get()
            ]);
        })->name('superadmin.users');

        Route::get('/audit-logs', function () {
            if (auth()->user()->role !== 'super_admin') abort(403);
            return inertia('superadmin/audit-logs', [
                'logs' => \App\Models\AuditLog::with('user')->latest()->get()
            ]);
        })->name('superadmin.audit-logs');

        Route::get('/approvals', function () {
            if (auth()->user()->role !== 'super_admin') abort(403);
            
            $ambulances = \App\Models\Ambulance::with(['institution', 'documents'])
                ->where('verification_status', 'pending_verification')
                ->latest()
                ->get();
                
            $staff = \App\Models\User::with(['institution', 'documents'])
                ->whereIn('role', ['driver', 'nurse'])
                ->whereHas('documents', function ($query) {
                    $query->where('status', 'pending');
                })
                ->latest()
                ->get();

            return inertia('superadmin/approvals', [
                'pendingAmbulances' => $ambulances,
                'pendingStaff' => $staff,
            ]);
        })->name('superadmin.approvals');
    });

    // 2. Customer
    Route::prefix('customer')->group(function () {
        Route::get('/dashboard', function () {
            if (auth()->user()->role !== 'customer') abort(403);
            return inertia('customer/dashboard', [
                'stats' => [
                    'total_orders' => \App\Models\Order::where('user_id', auth()->id())->count(),
                    'completed_orders' => \App\Models\Order::where('user_id', auth()->id())->where('status', 'completed')->count(),
                    'active_orders' => \App\Models\Order::where('user_id', auth()->id())->whereNotIn('status', ['completed', 'cancelled', 'no_ambulance_available'])->count(),
                ],
                'recent_orders' => \App\Models\Order::with(['ambulance.institution'])
                    ->where('user_id', auth()->id())
                    ->latest()
                    ->take(10)
                    ->get()
            ]);
        })->name('customer.dashboard');

        Route::get('/booking', function () {
            if (auth()->user()->role !== 'customer') abort(403);
            return inertia('customer/booking');
        })->name('customer.booking');

        Route::get('/orders', function () {
            if (auth()->user()->role !== 'customer') abort(403);
            return inertia('customer/orders', [
                'orders' => \App\Models\Order::with(['ambulance.institution', 'rating'])
                    ->where('user_id', auth()->id())
                    ->latest()
                    ->get()
            ]);
        })->name('customer.orders');

        Route::get('/profile', function () {
            if (auth()->user()->role !== 'customer') abort(403);
            return inertia('customer/profile', [
                'user' => auth()->user()
            ]);
        })->name('customer.profile');

        Route::get('/notifications', function () {
            if (auth()->user()->role !== 'customer') abort(403);
            return inertia('customer/notifications', [
                'notifications' => auth()->user()->notifications
            ]);
        })->name('customer.notifications');
    });

    // 3. Institution Admin
    Route::prefix('admin')->group(function () {
        Route::get('/dashboard', function () {
            if (auth()->user()->role !== 'institution_admin') abort(403);
            $instId = auth()->user()->institution_id;
            $inst = \App\Models\Institution::findOrFail($instId);
            $ambIds = \App\Models\Ambulance::where('institution_id', $instId)->pluck('id')->toArray();

            return inertia('admin/dashboard', [
                'institution' => $inst,
                'stats' => [
                    'total_ambulances' => count($ambIds),
                    'total_orders' => \App\Models\Order::whereIn('ambulance_id', $ambIds)->count(),
                    'pending_proposals' => \App\Models\EventProposal::where('review_status', 'pending')
                        ->whereHas('order', fn($q) => $q->whereNull('ambulance_id'))
                        ->count(),
                    'staff_count' => \App\Models\User::where('institution_id', $instId)
                        ->whereIn('role', ['driver', 'nurse'])->count()
                ]
            ]);
        })->name('admin.dashboard');

        Route::get('/ambulances', function () {
            if (auth()->user()->role !== 'institution_admin') abort(403);
            $instId = auth()->user()->institution_id;
            return inertia('admin/ambulances', [
                'ambulances' => \App\Models\Ambulance::with(['documents', 'currentDriver', 'currentNurse'])
                    ->where('institution_id', $instId)
                    ->get(),
                'drivers' => \App\Models\User::where('institution_id', $instId)
                    ->where('role', 'driver')
                    ->get()
            ]);
        })->name('admin.ambulances');

        Route::get('/staff', function () {
            if (auth()->user()->role !== 'institution_admin') abort(403);
            $instId = auth()->user()->institution_id;
            return inertia('admin/staff', [
                'staff' => \App\Models\User::with('staffProfile')
                    ->where('institution_id', $instId)
                    ->whereIn('role', ['driver', 'nurse'])
                    ->get(),
                'ambulances' => \App\Models\Ambulance::where('institution_id', $instId)->get()
            ]);
        })->name('admin.staff');

        Route::get('/proposals', function () {
            if (auth()->user()->role !== 'institution_admin') abort(403);
            $instId = auth()->user()->institution_id;
            return inertia('admin/proposals', [
                'proposals' => \App\Models\EventProposal::with('order.user')
                    ->latest()
                    ->get(),
                'ambulances' => \App\Models\Ambulance::where('institution_id', $instId)
                    ->where('status', 'standby')
                    ->get()
            ]);
        })->name('admin.proposals');

        Route::get('/documents', function () {
            if (auth()->user()->role !== 'institution_admin') abort(403);
            $instId = auth()->user()->institution_id;
            $ambIds = \App\Models\Ambulance::where('institution_id', $instId)->pluck('id')->toArray();
            return inertia('admin/documents', [
                'documents' => \App\Models\VehicleDocument::with('ambulance')
                    ->whereIn('ambulance_id', $ambIds)
                    ->get()
            ]);
        })->name('admin.documents');

        Route::get('/logs', function () {
            if (auth()->user()->role !== 'institution_admin') abort(403);
            return inertia('admin/logs', [
                'logs' => \App\Models\AuditLog::with('user')
                    ->where('user_id', auth()->id())
                    ->latest()
                    ->get()
            ]);
        })->name('admin.logs');
    });

    // 4. Nurse
    Route::prefix('nurse')->group(function () {
        Route::get('/dashboard', function () {
            if (auth()->user()->role !== 'nurse') abort(403);
            $boundAmb = \App\Models\Ambulance::where('current_nurse_id', auth()->id())->first();
            return inertia('nurse/dashboard', [
                'currentUser' => auth()->user(),
                'boundAmbulance' => $boundAmb,
            ]);
        })->name('nurse.dashboard');

        Route::get('/profile', function () {
            if (auth()->user()->role !== 'nurse') abort(403);
            return inertia('nurse/profile', [
                'user' => auth()->user(),
                'profile' => \App\Models\StaffProfile::where('user_id', auth()->id())->first()
            ]);
        })->name('nurse.profile');

        Route::get('/history', function () {
            if (auth()->user()->role !== 'nurse') abort(403);
            $trips = [];
            $boundAmb = \App\Models\Ambulance::where('current_nurse_id', auth()->id())->first();
            if ($boundAmb) {
                $trips = \App\Models\Order::where('ambulance_id', $boundAmb->id)
                    ->where('status', 'completed')
                    ->latest()
                    ->get();
            }
            return inertia('nurse/history', [
                'trips' => $trips
            ]);
        })->name('nurse.history');
    });

    // 5. Driver
    Route::prefix('driver')->group(function () {
        Route::get('/dashboard', function () {
            if (auth()->user()->role !== 'driver') abort(403);
            $ambulances = \App\Models\Ambulance::where('institution_id', auth()->user()->institution_id)
                ->select('*')
                ->selectRaw('ST_X(current_location) as longitude, ST_Y(current_location) as latitude')
                ->get();
            return inertia('driver/dashboard', [
                'ambulances' => $ambulances,
                'currentUser' => auth()->user()->load('institution')
            ]);
        })->name('driver.dashboard');

        Route::get('/profile', function () {
            if (auth()->user()->role !== 'driver') abort(403);
            return inertia('driver/profile', [
                'user' => auth()->user(),
                'profile' => \App\Models\StaffProfile::where('user_id', auth()->id())->first()
            ]);
        })->name('driver.profile');

        Route::get('/history', function () {
            if (auth()->user()->role !== 'driver') abort(403);
            $trips = [];
            $boundAmb = \App\Models\Ambulance::where('current_driver_id', auth()->id())->first();
            if ($boundAmb) {
                $trips = \App\Models\Order::where('ambulance_id', $boundAmb->id)
                    ->where('status', 'completed')
                    ->latest()
                    ->get();
            }
            return inertia('driver/history', [
                'trips' => $trips
            ]);
        })->name('driver.history');
    });
});
