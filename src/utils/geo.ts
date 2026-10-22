import { SafeZone } from '../types';

/**
 * Calculates distance in meters between two coordinates using the Haversine formula
 */
export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Earth radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Formats distance into a human-friendly string (e.g. "250 m" or "3.4 km")
 */
export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
}

/**
 * Checks if a point is inside a safe zone radius
 */
export function isInsideZone(
  lat: number,
  lng: number,
  zoneLat: number,
  zoneLng: number,
  radiusMeters: number
): boolean {
  const distance = calculateDistanceMeters(lat, lng, zoneLat, zoneLng);
  return distance <= radiusMeters;
}

/**
 * Finds which safe zone a coordinate is inside
 */
export function findCurrentPlace(
  lat: number,
  lng: number,
  safeZones: SafeZone[] = []
): SafeZone | null {
  for (const zone of safeZones) {
    if (isInsideZone(lat, lng, zone.lat, zone.lng, zone.radius)) {
      return zone;
    }
  }
  return null;
}

/**
 * Safely parses any timestamp type (Firestore Timestamp, Date, string, number)
 */
export function parseDate(timestamp: any): Date | null {
  if (!timestamp) return null;
  if (typeof timestamp.toDate === 'function') {
    try {
      return timestamp.toDate();
    } catch {
      return null;
    }
  }
  if (timestamp instanceof Date) {
    return isNaN(timestamp.getTime()) ? null : timestamp;
  }
  if (typeof timestamp === 'number') {
    return new Date(timestamp);
  }
  if (typeof timestamp === 'string') {
    const d = new Date(timestamp);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/**
 * Formats a timestamp into relative time ("Just now", "5m ago", "2h ago")
 */
export function formatRelativeTime(timestamp: any): string {
  const date = parseDate(timestamp);
  if (!date) return 'Unknown';

  const now = Date.now();
  const diffSec = Math.floor((now - date.getTime()) / 1000);

  if (diffSec < 30) return 'Just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/**
 * Formats timestamp to localized time string
 */
export function formatFullTime(timestamp: any): string {
  const date = parseDate(timestamp);
  if (!date) return '--:--';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Formats speed into km/h with friendly text
 */
export function formatSpeed(speedMps?: number | null): string {
  if (speedMps === undefined || speedMps === null || isNaN(speedMps) || speedMps <= 0.5) {
    return 'Stationary';
  }
  const kmh = Math.round(speedMps * 3.6);
  if (kmh < 6) return `Walking (${kmh} km/h)`;
  if (kmh < 25) return `Cycling (${kmh} km/h)`;
  return `Driving (${kmh} km/h)`;
}

/**
 * Generates navigation URL to open in Google Maps or Apple Maps
 */
export function getDirectionsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

/**
 * Get device battery information if supported by browser
 */
export async function getLiveBattery(): Promise<{ level: number; isCharging: boolean } | null> {
  try {
    if ('getBattery' in navigator) {
      const b: any = await (navigator as any).getBattery();
      return {
        level: Math.round(b.level * 100),
        isCharging: Boolean(b.charging)
      };
    }
  } catch {
    // Battery API restricted or rejected
  }
  return null;
}
