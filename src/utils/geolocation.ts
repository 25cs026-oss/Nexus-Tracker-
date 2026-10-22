/**
 * Robust, battery-optimized live geolocation service:
 * 1. Checks Browser Geolocation (GPS / Wi-Fi) with generous timeout
 * 2. Rapid IP-based City Geolocation pre-seed (< 1 second) so the map immediately centers on user's real location
 * 3. 10-second smart interval throttling to protect phone battery
 * 4. Eco Background Mode (low-power cell/Wi-Fi assisted) when app is minimized or phone is locked
 * 5. Stationary Polling Fallback to guarantee heartbeat updates even when the device does not physically move
 * 6. Local cache restoration for zero-second startup
 */

export interface GeoLocationResult {
  lat: number;
  lng: number;
  accuracy: number;
  speed: number | null;
  heading: number | null;
  isApproximate?: boolean;
}

export type GpsStatus = 'idle' | 'searching' | 'active' | 'approximate' | 'denied' | 'unavailable' | 'insecure';

export class GeolocationService {
  private watchId: number | null = null;
  private pollIntervalId: number | null = null;
  private onPositionCallback: ((pos: GeoLocationResult) => void) | null = null;
  private onStatusCallback: ((status: GpsStatus, errorMsg?: string) => void) | null = null;
  private isRunning: boolean = false;
  private hasAccurateLock: boolean = false;
  private isEcoMode: boolean = false;
  private lastEmitTime: number = 0;
  public lastKnownPosition: GeoLocationResult | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem('nexus_cached_loc');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed && typeof parsed.lat === 'number' && typeof parsed.lng === 'number') {
            this.lastKnownPosition = parsed;
          }
        }
      } catch {}
    }
  }

  public isSecureContext(): boolean {
    if (typeof window === 'undefined') return true;
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    return window.isSecureContext || isLocal;
  }

  /**
   * Fast IP geolocation lookup to instantly find the user's real city/country
   */
  public async getFastIpLocation(): Promise<GeoLocationResult | null> {
    try {
      const res = await fetch('https://get.geojs.io/v1/ip/geo.json');
      const data = await res.json();
      if (data && data.latitude && data.longitude) {
        const lat = parseFloat(data.latitude);
        const lng = parseFloat(data.longitude);
        if (!isNaN(lat) && !isNaN(lng)) {
          return {
            lat,
            lng,
            accuracy: 3000,
            speed: null,
            heading: null,
            isApproximate: true
          };
        }
      }
    } catch {
      // IP lookup failed
    }
    return null;
  }

  public setEcoMode(eco: boolean) {
    if (this.isEcoMode === eco) return;
    this.isEcoMode = eco;
    if (this.isRunning) {
      // Restart watch and polling with adjusted frequency
      this.startWatch();
      this.startPolling();
    }
  }

  public async startTracking(
    onPosition: (pos: GeoLocationResult) => void,
    onStatus: (status: GpsStatus, errorMsg?: string) => void
  ) {
    this.onPositionCallback = onPosition;
    this.onStatusCallback = onStatus;
    this.isRunning = true;
    this.hasAccurateLock = false;

    // If we already have a cached position, emit it immediately
    if (this.lastKnownPosition) {
      onPosition(this.lastKnownPosition);
      onStatus(this.lastKnownPosition.isApproximate ? 'approximate' : 'active');
    }

    if (!this.isSecureContext()) {
      onStatus('insecure', 'Browser requires HTTPS or localhost for GPS.');
    }

    onStatus('searching', 'Acquiring your live location...');

    // Fast IP lookup fallback
    this.getFastIpLocation().then(ipPos => {
      if (ipPos && this.isRunning && !this.hasAccurateLock && !this.lastKnownPosition) {
        this.lastKnownPosition = ipPos;
        this.onPositionCallback?.(ipPos);
        this.onStatusCallback?.('approximate', 'Using approximate city location while GPS locks...');
      }
    });

    if (!('geolocation' in navigator)) {
      onStatus('unavailable', 'Browser does not support GPS geolocation.');
      return;
    }

    // High accuracy first fix
    this.requestSingleFix();

    // Continuous watch with battery-efficient 10s throttling
    this.startWatch();

    // Continuous stationary fallback polling
    this.startPolling();
  }

  private requestSingleFix() {
    if (!('geolocation' in navigator)) return;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!this.isRunning) return;
        this.hasAccurateLock = true;
        this.handleSuccess(position, false);
      },
      (err) => {
        console.warn('GPS single-fix warning:', err.message);
        if (err.code === 1) { // PERMISSION_DENIED
          this.onStatusCallback?.('denied', 'Location permission denied. Please allow in browser address bar.');
          return;
        }

        // Retry with network/Wi-Fi low accuracy
        navigator.geolocation.getCurrentPosition(
          (fallbackPos) => {
            if (!this.isRunning) return;
            this.hasAccurateLock = true;
            this.handleSuccess(fallbackPos, false);
          },
          () => {},
          {
            enableHighAccuracy: false,
            timeout: 15000,
            maximumAge: 60000
          }
        );
      },
      {
        enableHighAccuracy: !this.isEcoMode,
        timeout: 15000,
        maximumAge: 5000
      }
    );
  }

  private startWatch() {
    if (!this.isRunning || !('geolocation' in navigator)) return;

    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
    }

    this.watchId = navigator.geolocation.watchPosition(
      (position) => {
        if (!this.isRunning) return;
        this.hasAccurateLock = true;
        this.handleSuccess(position, false);
      },
      (err) => {
        if (!this.isRunning) return;
        if (err.code === 1) {
          this.onStatusCallback?.('denied', 'Location permission denied in browser.');
        }
      },
      {
        enableHighAccuracy: !this.isEcoMode,
        maximumAge: this.isEcoMode ? 30000 : 8000,
        timeout: 30000
      }
    );
  }

  /**
   * Periodic polling interval:
   * Critical for stationary devices (phone on desk or in pocket)
   * where watchPosition does NOT fire because there is no coordinate delta.
   * This guarantees continuous heartbeats to Firestore so members never show "9h ago".
   */
  private startPolling() {
    if (this.pollIntervalId !== null) {
      clearInterval(this.pollIntervalId);
      this.pollIntervalId = null;
    }

    const intervalMs = this.isEcoMode ? 30000 : 15000;
    this.pollIntervalId = window.setInterval(() => {
      if (!this.isRunning) return;

      if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            if (!this.isRunning) return;
            this.handleSuccess(pos, false);
          },
          () => {
            // If GPS is temporarily unavailable indoors, emit cached position as heartbeat
            if (this.lastKnownPosition && this.isRunning) {
              const now = Date.now();
              const minInterval = this.isEcoMode ? 25000 : 10000;
              if (now - this.lastEmitTime >= minInterval) {
                this.lastEmitTime = now;
                this.onPositionCallback?.(this.lastKnownPosition);
              }
            }
          },
          {
            enableHighAccuracy: !this.isEcoMode,
            timeout: 10000,
            maximumAge: this.isEcoMode ? 30000 : 10000
          }
        );
      }
    }, intervalMs);
  }

  /**
   * Immediately requests a fresh fix and triggers callback
   * Useful when waking up from lock screen or app switch
   */
  public forceRefresh() {
    if (!this.isRunning) return;
    this.requestSingleFix();
    if (this.lastKnownPosition) {
      this.onPositionCallback?.(this.lastKnownPosition);
    }
  }

  private handleSuccess(position: GeolocationPosition, isApproximate: boolean) {
    const now = Date.now();
    // In foreground: throttle to ~10s. In background eco mode: throttle to ~25s.
    const minInterval = this.isEcoMode ? 25000 : 9500;
    
    const { latitude, longitude, accuracy, speed, heading } = position.coords;
    const result: GeoLocationResult = {
      lat: latitude,
      lng: longitude,
      accuracy: Math.round(accuracy || 15),
      speed: speed,
      heading: heading,
      isApproximate
    };

    this.lastKnownPosition = result;
    try {
      localStorage.setItem('nexus_cached_loc', JSON.stringify(result));
    } catch {}

    if (this.lastEmitTime > 0 && now - this.lastEmitTime < minInterval) {
      // Throttle to avoid flooding
      return;
    }

    this.lastEmitTime = now;
    this.onStatusCallback?.(isApproximate ? 'approximate' : 'active');
    this.onPositionCallback?.(result);
  }

  public stopTracking() {
    this.isRunning = false;
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    if (this.pollIntervalId !== null) {
      clearInterval(this.pollIntervalId);
      this.pollIntervalId = null;
    }
    this.onStatusCallback?.('idle');
  }
}

export const geoService = new GeolocationService();
