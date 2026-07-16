<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

#[Fillable(['order_id', 'patient_name', 'patient_age', 'condition_notes', 'secondary_emergency_contact', 'tensi', 'suhu', 'nadi', 'pernapasan', 'spo2'])]
class PatientDetail extends Model
{
    use HasFactory;

    /**
     * Get the attributes that should be cast.
     */
    protected function casts(): array
    {
        return [
            'patient_age' => 'integer',
        ];
    }

    /**
     * Get the order associated with the patient details.
     */
    public function order()
    {
        return $this->belongsTo(Order::class);
    }
}
