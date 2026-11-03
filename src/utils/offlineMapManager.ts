import { calculateDistanceMeters } from './geo';

export interface OfflineMapMeta {
  homeLat: number;
  homeLng: number;
  homeName: string;
  radiusKm: number;
  downloadedAt: number;
  tileCount: number;
  sizeBytes: number;
  status: 'idle' | 'downloading' | 'complete' | 'error';
}

export interface OfflineProgress {
  total: number;
  completed: number;
  failed: number;
  percent: number;
  isDownloading: boolean;
  isComplete: boolean;
  error?: string;
  homeName?: string;
}

const DB_NAME = 'nexus_offline_tiles_db';
const DB_VERSION = 1;
const STORE_TILES = 'tiles';
const STORE_META = 'metadata';
const CACHE_NAME_TILES = 'nexus-offline-map-tiles';

// Web Mercator Slippy Map conversions
export function lng2tile(lng: number, zoom: number): number {
  return Math.floor(((lng + 180) / 360) * Math.pow(2, zoom));
}

export function lat2tile(lat: number, zoom: number): number {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * Math.pow(2, zoom)
  );
}

export function tile2lng(x: number, zoom: number): number {
  return (x / Math.pow(2, zoom)) * 360 - 180;
}

export function tile2lat(y: number, zoom: number): number {
  const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, zoom);
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

/**
 * Calculates circular tile list covering 10km radius around Home coordinates
 */
export function calculateTilesForHomeArea(
  centerLat: number,
  centerLng: number,
  radiusKm: number = 10
): Array<{ z: number; x: number; y: number }> {
  const tiles: Array<{ z: number; x: number; y: number }> = [];
  const seen = new Set<string>();

  // Zoom 12-15: Full 10km radius
  // Zoom 16: 3.5km core high-detail around Home (allows upscaling to 17-19)
  const zoomConfigs = [
    { zoom: 12, radius: radiusKm },
    { zoom: 13, radius: radiusKm },
    { zoom: 14, radius: radiusKm },
    { zoom: 15, radius: radiusKm },
    { zoom: 16, radius: 3.5 }
  ];

  for (const cfg of zoomConfigs) {
    const rKm = cfg.radius;
    const dLat = rKm / 111.32;
    const cosLat = Math.cos((centerLat * Math.PI) / 180);
    const dLng = rKm / (111.32 * (cosLat === 0 ? 0.001 : cosLat));

    const minLat = centerLat - dLat;
    const maxLat = centerLat + dLat;
    const minLng = centerLng - dLng;
    const maxLng = centerLng + dLng;

    const xMin = Math.min(lng2tile(minLng, cfg.zoom), lng2tile(maxLng, cfg.zoom));
    const xMax = Math.max(lng2tile(minLng, cfg.zoom), lng2tile(maxLng, cfg.zoom));
    const yMin = Math.min(lat2tile(maxLat, cfg.zoom), lat2tile(minLat, cfg.zoom));
    const yMax = Math.max(lat2tile(maxLat, cfg.zoom), lat2tile(minLat, cfg.zoom));

    for (let x = xMin; x <= xMax; x++) {
      for (let y = yMin; y <= yMax; y++) {
        const key = `${cfg.zoom}_${x}_${y}`;
        if (seen.has(key)) continue;

        const tileCenterLat = tile2lat(y + 0.5, cfg.zoom);
        const tileCenterLng = tile2lng(x + 0.5, cfg.zoom);
        const dist = calculateDistanceMeters(centerLat, centerLng, tileCenterLat, tileCenterLng);

        // Include tile if center is within radius plus 1.2km diagonal margin
        if (dist <= (rKm + 1.2) * 1000) {
          seen.add(key);
          tiles.push({ z: cfg.zoom, x, y });
        }
      }
    }
  }

  return tiles;
}

class OfflineMapManager {
  private dbPromise: Promise<IDBDatabase> | null = null;
  private memoryBlobUrls = new Map<string, string>();
  private activeDownloadController: AbortController | null = null;
  private subscribers = new Set<(progress: OfflineProgress) => void>();
  private currentProgress: OfflineProgress = {
    total: 0,
    completed: 0,
    failed: 0,
    percent: 0,
    isDownloading: false,
    isComplete: false
  };
  private cachedMeta: OfflineMapMeta | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      this.initMetaFromStorage();
    }
  }

  private initMetaFromStorage() {
    try {
      const raw = localStorage.getItem('nexus_offline_home_map_meta');
      if (raw) {
        this.cachedMeta = JSON.parse(raw);
        if (this.cachedMeta?.status === 'complete') {
          this.currentProgress = {
            total: this.cachedMeta.tileCount,
            completed: this.cachedMeta.tileCount,
            failed: 0,
            percent: 100,
            isDownloading: false,
            isComplete: true,
            homeName: this.cachedMeta.homeName
          };
        }
      }
    } catch {}
  }

  /**
   * Initializes IndexedDB for high-speed offline tile lookup
   */
  private async getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !('indexedDB' in window)) {
        return reject(new Error('IndexedDB not supported'));
      }

      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_TILES)) {
          db.createObjectStore(STORE_TILES, { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains(STORE_META)) {
          db.createObjectStore(STORE_META, { keyPath: 'id' });
        }
      };

      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    return this.dbPromise;
  }

  /**
   * Retrieves tile Blob from IndexedDB
   */
  public async getTileBlob(z: number, x: number, y: number): Promise<Blob | null> {
    try {
      const db = await this.getDB();
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_TILES, 'readonly');
        const store = tx.objectStore(STORE_TILES);
        const req = store.get(`${z}_${x}_${y}`);
        req.onsuccess = () => {
          if (req.result?.blob) {
            resolve(req.result.blob);
          } else {
            resolve(null);
          }
        };
        req.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  }

  /**
   * Retrieves an Object URL for the requested tile, or null if not cached
   */
  public async getTileBlobUrl(z: number, x: number, y: number): Promise<string | null> {
    const key = `${z}_${x}_${y}`;
    if (this.memoryBlobUrls.has(key)) {
      return this.memoryBlobUrls.get(key)!;
    }

    const blob = await this.getTileBlob(z, x, y);
    if (!blob) return null;

    const url = URL.createObjectURL(blob);
    this.memoryBlobUrls.set(key, url);

    // Limit memory cache to 1200 tile URLs
    if (this.memoryBlobUrls.size > 1200) {
      const firstKey = this.memoryBlobUrls.keys().next().value;
      if (firstKey) {
        URL.revokeObjectURL(this.memoryBlobUrls.get(firstKey)!);
        this.memoryBlobUrls.delete(firstKey);
      }
    }

    return url;
  }

  /**
   * Saves a single tile to both IndexedDB and CacheStorage
   */
  private async saveTile(z: number, x: number, y: number, blob: Blob): Promise<void> {
    const key = `${z}_${x}_${y}`;

    // 1. Save to IndexedDB
    try {
      const db = await this.getDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_TILES, 'readwrite');
        const store = tx.objectStore(STORE_TILES);
        const req = store.put({ key, blob, timestamp: Date.now() });
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (err) {
      console.warn('Failed to save tile to IndexedDB:', err);
    }

    // 2. Save to CacheStorage for ServiceWorker matching
    if (typeof window !== 'undefined' && 'caches' in window) {
      try {
        const cache = await caches.open(CACHE_NAME_TILES);
        const subdomains = ['tile', 'a.tile', 'b.tile', 'c.tile'];
        for (const sub of subdomains) {
          const tileUrl = `https://${sub}.openstreetmap.org/${z}/${x}/${y}.png`;
          const response = new Response(blob, {
            headers: {
              'Content-Type': 'image/png',
              'Cache-Control': 'public, max-age=31536000'
            }
          });
          await cache.put(tileUrl, response);
        }
      } catch {}
    }
  }

  /**
   * Subscribes to download progress updates
   */
  private lastNotifyTime = 0;
  private lastNotifyPercent = -1;

  public subscribe(cb: (progress: OfflineProgress) => void): () => void {
    this.subscribers.add(cb);
    cb(this.currentProgress);
    return () => {
      this.subscribers.delete(cb);
    };
  }

  private notify(update: Partial<OfflineProgress>) {
    this.currentProgress = { ...this.currentProgress, ...update };
    for (const sub of this.subscribers) {
      try {
        sub(this.currentProgress);
      } catch {}
    }
  }

  /**
   * Throttles UI notification dispatches to prevent 60fps lag and UI glitches
   */
  private notifyThrottled(update: Partial<OfflineProgress>, force = false) {
    const now = Date.now();
    const nextProgress = { ...this.currentProgress, ...update };
    const percent = nextProgress.percent;

    if (
      force ||
      percent === 100 ||
      percent === 0 ||
      now - this.lastNotifyTime >= 300 ||
      Math.abs(percent - this.lastNotifyPercent) >= 5
    ) {
      this.lastNotifyTime = now;
      this.lastNotifyPercent = percent;
      this.notify(update);
    } else {
      this.currentProgress = nextProgress;
    }
  }

  public getProgress(): OfflineProgress {
    return this.currentProgress;
  }

  public getMeta(): OfflineMapMeta | null {
    return this.cachedMeta;
  }

  /**
   * Automatically checks if 10km offline map for Home location exists,
   * and downloads in the background if needed when user enters room.
   */
  public async checkAndAutoDownloadHome(
    homeLat: number,
    homeLng: number,
    homeName: string = 'Home'
  ): Promise<void> {
    if (typeof window === 'undefined' || !homeLat || !homeLng) return;
    if (this.currentProgress.isDownloading) return;

    // Check if offline map already exists within 400m of this Home location
    if (this.cachedMeta && this.cachedMeta.status === 'complete') {
      const dist = calculateDistanceMeters(
        this.cachedMeta.homeLat,
        this.cachedMeta.homeLng,
        homeLat,
        homeLng
      );
      const isFresh = Date.now() - this.cachedMeta.downloadedAt < 7 * 24 * 60 * 60 * 1000;
      if (dist < 400 && isFresh) {
        // Already cached and fresh!
        return;
      }
    }

    // Start background download for 10km radius
    console.log(`[OfflineMap] Triggering 10km background map download for Home: ${homeName} (${homeLat.toFixed(4)}, ${homeLng.toFixed(4)})`);
    this.downloadArea(homeLat, homeLng, 10, homeName).catch((err) => {
      console.warn('[OfflineMap] Auto download error:', err);
    });
  }

  /**
   * Downloads map tiles for a 10km radius around Home with controlled concurrency
   */
  public async downloadArea(
    centerLat: number,
    centerLng: number,
    radiusKm: number = 10,
    homeName: string = 'Home'
  ): Promise<boolean> {
    if (this.activeDownloadController) {
      this.activeDownloadController.abort();
    }

    const controller = new AbortController();
    this.activeDownloadController = controller;
    const signal = controller.signal;

    const tiles = calculateTilesForHomeArea(centerLat, centerLng, radiusKm);
    const total = tiles.length;

    this.notify({
      total,
      completed: 0,
      failed: 0,
      percent: 0,
      isDownloading: true,
      isComplete: false,
      homeName,
      error: undefined
    });

    let completed = 0;
    let failed = 0;
    let totalBytes = 0;

    // Pool of 4 concurrent workers
    const concurrency = 4;
    let currentIndex = 0;

    const worker = async () => {
      while (currentIndex < tiles.length && !signal.aborted) {
        const tile = tiles[currentIndex++];
        if (!tile) break;

        try {
          // Check if already in IndexedDB
          const existing = await this.getTileBlob(tile.z, tile.x, tile.y);
          if (existing) {
            completed++;
            totalBytes += existing.size;
            this.notifyThrottled({
              completed,
              percent: Math.round(((completed + failed) / total) * 100)
            });
            continue;
          }

          // Polite throttle between HTTP fetches
          await new Promise((r) => setTimeout(r, 30));
          if (signal.aborted) break;

          const url = `https://tile.openstreetmap.org/${tile.z}/${tile.x}/${tile.y}.png`;
          const res = await fetch(url, { signal });
          if (res.ok) {
            const blob = await res.blob();
            await this.saveTile(tile.z, tile.x, tile.y, blob);
            completed++;
            totalBytes += blob.size;
          } else {
            failed++;
          }
        } catch (err: any) {
          if (signal.aborted) return;
          failed++;
        }

        this.notifyThrottled({
          completed,
          failed,
          percent: Math.round(((completed + failed) / total) * 100)
        });
      }
    };

    try {
      const workers = Array.from({ length: concurrency }, () => worker());
      await Promise.all(workers);

      if (signal.aborted) {
        return false;
      }

      const meta: OfflineMapMeta = {
        homeLat: centerLat,
        homeLng: centerLng,
        homeName,
        radiusKm,
        downloadedAt: Date.now(),
        tileCount: completed,
        sizeBytes: totalBytes,
        status: 'complete'
      };

      this.cachedMeta = meta;
      try {
        localStorage.setItem('nexus_offline_home_map_meta', JSON.stringify(meta));
      } catch {}

      this.notify({
        total,
        completed,
        failed,
        percent: 100,
        isDownloading: false,
        isComplete: true,
        homeName
      });

      console.log(`[OfflineMap] 10km offline map download complete for ${homeName}: ${completed} tiles (${(totalBytes / (1024 * 1024)).toFixed(2)} MB)`);
      return true;
    } catch (err: any) {
      if (!signal.aborted) {
        this.notify({
          isDownloading: false,
          isComplete: false,
          error: err.message || 'Download interrupted'
        });
      }
      return false;
    } finally {
      if (this.activeDownloadController === controller) {
        this.activeDownloadController = null;
      }
    }
  }

  /**
   * Clears offline tiles and metadata
   */
  public async clearCache(): Promise<void> {
    if (this.activeDownloadController) {
      this.activeDownloadController.abort();
      this.activeDownloadController = null;
    }

    try {
      const db = await this.getDB();
      await new Promise<void>((resolve) => {
        const tx = db.transaction(STORE_TILES, 'readwrite');
        tx.objectStore(STORE_TILES).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } catch {}

    if (typeof window !== 'undefined' && 'caches' in window) {
      try {
        await caches.delete(CACHE_NAME_TILES);
      } catch {}
    }

    for (const url of this.memoryBlobUrls.values()) {
      try {
        URL.revokeObjectURL(url);
      } catch {}
    }
    this.memoryBlobUrls.clear();

    localStorage.removeItem('nexus_offline_home_map_meta');
    this.cachedMeta = null;

    this.notify({
      total: 0,
      completed: 0,
      failed: 0,
      percent: 0,
      isDownloading: false,
      isComplete: false,
      error: undefined
    });
  }
}

export const offlineMapManager = new OfflineMapManager();
