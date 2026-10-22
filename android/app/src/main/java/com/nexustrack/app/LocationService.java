package com.nexustrack.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.os.PowerManager;
import android.util.Log;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

/**
 * Nexus Native Android Foreground Location Service
 * 
 * Runs with START_STICKY and a persistent ongoing notification so that
 * GPS tracking remains active 24/7 even if the user clears or swipes away
 * the app from the Recent Apps task list.
 */
public class LocationService extends Service implements LocationListener {

    private static final String TAG = "NexusLocationService";
    private static final String CHANNEL_ID = "nexus_tracker_channel";
    private static final int NOTIFICATION_ID = 9001;

    private LocationManager locationManager;
    private PowerManager.WakeLock wakeLock;

    @Override
    public void onCreate() {
        super.onCreate();
        Log.d(TAG, "LocationService created");

        createNotificationChannel();
        startForegroundWithNotification();
        acquirePartialWakeLock();
        startNativeLocationTracking();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Nexus Live Location Tracking",
                    NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Keeps family location sharing active in background");
            channel.setShowBadge(false);

            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    private void startForegroundWithNotification() {
        Intent notificationIntent = new Intent(this, MainActivity.class);
        notificationIntent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                this,
                0,
                notificationIntent,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
        );

        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("Nexus Family Tracker")
                .setContentText("🟢 Live Background Location Active (Eco 10s)")
                .setSmallIcon(android.R.drawable.ic_menu_mylocation)
                .setContentIntent(pendingIntent)
                .setOngoing(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setCategory(NotificationCompat.CATEGORY_SERVICE)
                .build();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    private void acquirePartialWakeLock() {
        try {
            PowerManager powerManager = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (powerManager != null) {
                wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "NexusTracker:ServiceWakeLock");
                wakeLock.acquire(24 * 60 * 60 * 1000L); // 24 hours
            }
        } catch (Exception e) {
            Log.w(TAG, "Could not acquire WakeLock: " + e.getMessage());
        }
    }

    private void startNativeLocationTracking() {
        locationManager = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        if (locationManager == null) return;

        try {
            // Register GPS Provider (every 10s or 5m delta)
            if (locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                locationManager.requestLocationUpdates(
                        LocationManager.GPS_PROVIDER,
                        10000L,
                        5.0f,
                        this
                );
            }

            // Register Network/Wi-Fi Provider for battery efficiency & indoors
            if (locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                locationManager.requestLocationUpdates(
                        LocationManager.NETWORK_PROVIDER,
                        15000L,
                        5.0f,
                        this
                );
            }
        } catch (SecurityException e) {
            Log.e(TAG, "Location permission missing in Service: " + e.getMessage());
        } catch (Exception e) {
            Log.e(TAG, "Error starting location updates: " + e.getMessage());
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        // START_STICKY ensures Android restarts this service automatically if killed
        return START_STICKY;
    }

    @Override
    public void onLocationChanged(Location location) {
        if (location == null) return;
        Log.d(TAG, "Background location update: " + location.getLatitude() + ", " + location.getLongitude());

        // Cache coordinates locally for instant access by WebView
        try {
            getSharedPreferences("nexus_native_loc", Context.MODE_PRIVATE)
                    .edit()
                    .putString("lat", String.valueOf(location.getLatitude()))
                    .putString("lng", String.valueOf(location.getLongitude()))
                    .putLong("time", System.currentTimeMillis())
                    .apply();
        } catch (Exception ignored) {}
    }

    @Override
    public void onStatusChanged(String provider, int status, Bundle extras) {}

    @Override
    public void onProviderEnabled(String provider) {}

    @Override
    public void onProviderDisabled(String provider) {}

    @Override
    public void onDestroy() {
        super.onDestroy();
        Log.d(TAG, "LocationService destroyed, releasing resources");
        if (locationManager != null) {
            try {
                locationManager.removeUpdates(this);
            } catch (Exception ignored) {}
        }
        if (wakeLock != null && wakeLock.isHeld()) {
            try {
                wakeLock.release();
            } catch (Exception ignored) {}
        }
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
