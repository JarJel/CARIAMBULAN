<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('patient_details', function (Blueprint $table) {
            $table->string('tensi')->nullable();
            $table->string('suhu')->nullable();
            $table->string('nadi')->nullable();
            $table->string('pernapasan')->nullable();
            $table->string('spo2')->nullable();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('patient_details', function (Blueprint $table) {
            $table->dropColumn(['tensi', 'suhu', 'nadi', 'pernapasan', 'spo2']);
        });
    }
};
