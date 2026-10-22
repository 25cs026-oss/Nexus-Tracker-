/**
 * Robust, lightweight geolocation service with multi-tier fallbacks:
 * 1. High Accuracy GPS (mobile/satellites)
 * 2. Low Accuracy Wi-Fi/Cellular (laptops/desktops)
 * 3. IP Geo fallback (when GPS hardware is absent or times out)
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

  public isSecureContext(): boolean {
    if (typeof window === 'undefined') return true;
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    return window.isSecureContext || isLocal;
  }

  public async startTracking(
    onPosition: (pos: GeoLocationResult) => void,
    onStatus: (status: GpsStatus, errorMsg?: string) => void
  ) {
    this.onPositionCallback = onPosition;
    this.onStatusCallback = onStatus;
    this.isRunning = true;

    if (!this.isSecureContext()) {
      onStatus('insecure', 'Browser requires HTTPS or localhost for GPS.');
    }

    if (!('geolocation' in navigator)) {
      onStatus('unavailable', 'Geolocation is not supported by your browser.');
      await this.tryIpFallback();
      return;
    }

    onStatus('searching', 'Acquiring GPS location...');

    // Step 1: Immediate lock with high accuracy (short timeout 6s)
    try {
      const pos = await this.getPositionPromise({
        enableHighAccuracy: true,
        timeout: 6000,
        maximumAge: 5000
      });
      this.handleSuccess(pos, false);
    } catch (err: any) {
      console.warn('High accuracy GPS timed out or failed, falling back to low accuracy:', err?.message);
      
      if (err?.code === 1) { // PERMISSION_DENIED
        onStatus('denied', 'Location permission denied. Please enable in browser settings.');
        await this.tryIpFallback();
        return;
      }

      // Step 2: Fallback to Low Accuracy (works on PCs, Laptops, Wi-Fi)
      try {
        const pos = await this.getPositionPromise({
          enableHighAccuracy: false,
          timeout: 8000,
          maximumAge: 60000
        });
        this.handleSuccess(pos, false);
      } catch (fallbackErr: any) {
        console.warn('Standard geolocation failed, trying IP geo fallback:', fallbackErr?.message);
        await this.tryIpFallback();
      }
    }

    // Step 3: Start continuous watch with resilient settings
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
        this.handleSuccess(position, false);
      },
      (err) => {
        if (!this.isRunning) return;
        if (err.code === 1) {
          this.onStatusCallback?.('denied', 'Location permission denied.');
        } else {
          // If watch error, do not kill the app, keep last known position
          console.warn('watchPosition update skipped:', err.message);
        }
      },
      {
        enableHighAccuracy: false, // Use battery-friendly low accuracy for continuous watching
        maximumAge: 10000,
        timeout: 15000
      }
    );
  }

  private handleSuccess(position: GeolocationPosition, isApproximate: boolean) {
    const { latitude, longitude, accuracy, speed, heading } = position.coords;
    this.onStatusCallback?.(isApproximate ? 'approximate' : 'active');
    this.onPositionCallback?.({
      lat: latitude,
      lng: longitude,
      accuracy: Math.round(accuracy || 20),
      speed: speed,
      heading: heading,
      isApproximate
    });
  }

  private async tryIpFallback() {
    if (!this.isRunning) return;
    try {
      this.onStatusCallback?.('searching', 'Locating via network IP...');
      const res = await fetch('https://get.geojs.io/v1/ip/geo.json');
      const data = await res.json();
      if (data && data.latitude && data.longitude) {
        const lat = parseFloat(data.latitude);
        const lng = parseFloat(data.longitude);
        if (!isNaN(lat) && !isNaN(lng)) {
          this.onStatusCallback?.('approximate', 'Using approximate city location.');
          this.onPositionCallback?.({
            lat,
            lng,
            accuracy: 5000,
            speed: null,
            heading: null,
            isApproximate: true
          });
          return;
        }
      }
    } catch {
      // IP lookup failed
    }
    this.onStatusCallback?.('unavailable', 'Unable to determine GPS location.');
  }

  private getPositionPromise(options: PositionOptions): Promise<GeolocationPosition> {
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, options);
    });
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
