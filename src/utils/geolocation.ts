/**
 * Robust, battery-optimized live geolocation service:
 * 1. Checks Browser Geolocation (GPS / Wi-Fi) with generous timeout
 * 2. Rapid IP-based City Geolocation pre-seed (< 1 second) so the map immediately centers on user's real location
 * 3. 10-second smart interval throttling to protect phone battery
 * 4. Eco Background Mode (low-power cell/Wi-Fi assisted) when app is minimized or phone is locked
 * 5. Continuously watches position with minimal CPU drain
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
  private onPositionCallback: ((pos: GeoLocationResult) => void) | null = null;
  private onStatusCallback: ((status: GpsStatus, errorMsg?: string) => void) | null = null;
  private isRunning: boolean = false;
  private hasAccurateLock: boolean = false;
  private isEcoMode: boolean = false;
  private lastEmitTime: number = 0;
  public lastKnownPosition: GeoLocationResult | null = null;

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
      // Restart watch with low-power or high-accuracy configuration
      this.startWatch();
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

    // Parallel Strategy: Fast IP lookup
    this.getFastIpLocation().then(ipPos => {
      if (ipPos && this.isRunning && !this.hasAccurateLock) {
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
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!this.isRunning) return;
        this.hasAccurateLock = true;
        this.handleSuccess(position, false);
      },
      (err) => {
        console.warn('High-accuracy GPS request error:', err.message);
        if (err.code === 1) { // PERMISSION_DENIED
          onStatus('denied', 'Location permission denied. Please allow in browser address bar.');
          return;
        }

        // Retry with low accuracy (Wi-Fi / Network)
        navigator.geolocation.getCurrentPosition(
          (fallbackPos) => {
            if (!this.isRunning) return;
            this.hasAccurateLock = true;
            this.handleSuccess(fallbackPos, false);
          },
          (fallbackErr) => {
            console.warn('Low-accuracy fallback error:', fallbackErr.message);
          },
          {
            enableHighAccuracy: false,
            timeout: 20000,
            maximumAge: 60000
          }
        );
      },
      {
        enableHighAccuracy: !this.isEcoMode,
        timeout: 20000,
        maximumAge: 5000
      }
    );

    // Continuous watch with battery-efficient 10s throttling
    this.startWatch();
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
        } else {
          console.warn('watchPosition frame skipped:', err.message);
        }
      },
      {
        enableHighAccuracy: !this.isEcoMode,
        maximumAge: this.isEcoMode ? 25000 : 8000,
        timeout: 30000
      }
    );
  }

  private handleSuccess(position: GeolocationPosition, isApproximate: boolean) {
    const now = Date.now();
    // In foreground: throttle to ~10s. In background eco mode: throttle to ~25-30s.
    const minInterval = this.isEcoMode ? 25000 : 9500;
    
    // Always store latest known position
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

    if (this.lastEmitTime > 0 && now - this.lastEmitTime < minInterval) {
      // Skip emission to preserve phone battery and prevent excessive CPU / state recalculation
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
    this.onStatusCallback?.('idle');
  }
}

export const geoService = new GeolocationService();
