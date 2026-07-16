<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use App\Models\User;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rules;

class AuthController extends Controller
{
    public function showLogin()
    {
        return inertia('auth/login');
    }

    public function login(Request $request)
    {
        $credentials = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required'],
        ]);

        if (Auth::attempt($credentials, $request->boolean('remember'))) {
            $request->session()->regenerate();

            $user = Auth::user();
            if ($user->role === 'super_admin') {
                return redirect()->intended(route('superadmin.dashboard'));
            } elseif ($user->role === 'institution_admin') {
                return redirect()->intended(route('admin.dashboard'));
            } elseif ($user->role === 'driver') {
                return redirect()->intended(route('driver.dashboard'));
            } elseif ($user->role === 'nurse') {
                return redirect()->intended(route('nurse.dashboard'));
            } else {
                return redirect()->intended(route('customer.dashboard'));
            }
        }

        return back()->withErrors([
            'email' => 'Email atau password yang Anda masukkan salah.',
        ])->onlyInput('email');
    }

    public function showRegister()
    {
        return inertia('auth/register');
    }

    public function register(Request $request)
    {
        $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'string', 'email', 'max:255', 'unique:users'],
            'phone' => ['required', 'string', 'regex:/^(\+62|62|0)8[1-9][0-9]{6,11}$/'],
            'password' => ['required', 'confirmed', Rules\Password::defaults()],
        ], [
            'phone.regex' => 'Format nomor HP tidak valid (gunakan format Indonesia seperti 08xxxxxxxxxx atau 628xxxxxxxxxx).'
        ]);

        $user = User::create([
            'name' => $request->name,
            'email' => $request->email,
            'phone' => $request->phone,
            'password' => Hash::make($request->password),
            'role' => 'customer',
        ]);

        Auth::login($user);

        if ($user->role === 'super_admin') {
            return redirect(route('superadmin.dashboard'));
        } elseif ($user->role === 'institution_admin') {
            return redirect(route('admin.dashboard'));
        } elseif ($user->role === 'driver') {
            return redirect(route('driver.dashboard'));
        } elseif ($user->role === 'nurse') {
            return redirect(route('nurse.dashboard'));
        } else {
            return redirect(route('customer.dashboard'));
        }
    }

    public function logout(Request $request)
    {
        Auth::logout();

        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return redirect('/');
    }
}
