/**
 * Nexus Status Bar Notification Manager
 * 
 * Displays and maintains notifications in the mobile notification bar / status bar
 * while live tracking is active, and broadcasts high-priority emergency SOS alerts.
 */

export class NotificationManager {
  private isNotificationShown: boolean = false;

  public async requestPermission(): Promise<boolean> {
    if (typeof window === 'undefined') return false;

    // Check if running in native Android shell
    if ((window as any).NexusNative?.isNative?.()) {
      return true;
    }

    if (!('Notification' in window)) return false;

    try {
      if (Notification.permission === 'granted') {
        return true;
      }
      if (Notification.permission !== 'denied') {
        const result = await Notification.requestPermission();
        return result === 'granted';
      }
    } catch (e) {
      console.warn('Notification permission request error:', e);
    }
    return false;
  }

  private async getSwRegistration(timeoutMs = 800): Promise<ServiceWorkerRegistration | null> {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return null;
    try {
      const reg = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<null>(resolve => setTimeout(() => resolve(null), timeoutMs))
      ]);
      return reg || null;
    } catch {
      return null;
    }
  }

  public async showLiveTrackingNotification(circleName?: string, memberCount?: number): Promise<boolean> {
    if (typeof window === 'undefined') return false;

    const title = 'Nexus Family Tracker';
    const body = circleName 
      ? `🟢 Live Background Active • ${circleName} (${memberCount || 1} online)`
      : '🟢 Live Background Location Active (10s GPS intervals)';

    try {
      const hasPermission = await this.requestPermission();
      if (!hasPermission) return false;

      // 1. ServiceWorker registration
      const reg = await this.getSwRegistration();
      if (reg && reg.showNotification) {
        await reg.showNotification(title, {
          body,
          icon: '/pwa-192x192.png',
          badge: '/icon.svg',
          tag: 'nexus-live-status',
          renotify: false,
          silent: true,
          requireInteraction: false,
          data: { url: window.location.href }
        } as any);
        this.isNotificationShown = true;
        return true;
      }

      // 2. Fallback: window Notification
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, {
          body,
          icon: '/pwa-192x192.png',
          tag: 'nexus-live-status',
          silent: true
        });
        this.isNotificationShown = true;
        return true;
      }
    } catch (err) {
      console.warn('Failed to display status bar notification:', err);
    }
    return false;
  }

  /**
   * Broadcast high-urgency Emergency SOS alert notification to status bar / lockscreen
   */
  public async showSosAlertNotification(memberName: string, placeName?: string): Promise<boolean> {
    if (typeof window === 'undefined') return false;

    // 1. Primary: Native Android Heads-Up Notification (wakes phone screen, plays alarm, vibrates)
    if ((window as any).NexusNative?.triggerNativeSosAlert) {
      try {
        (window as any).NexusNative.triggerNativeSosAlert(memberName, placeName || '');
      } catch (err) {
        console.warn('Native SOS trigger failed:', err);
      }
    }

    const title = `🚨 EMERGENCY SOS: ${memberName} Needs Help!`;
    const body = placeName
      ? `${memberName} triggered emergency SOS near ${placeName}! Tap to view live location & directions.`
      : `${memberName} triggered emergency SOS! Live coordinates broadcasting. Tap to navigate.`;

    // 2. Native device vibration
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate([500, 200, 500, 200, 500, 200, 800]);
      } catch {}
    }

    try {
      const hasPermission = await this.requestPermission();
      if (!hasPermission) return false;

      // 3. ServiceWorker notification
      const reg = await this.getSwRegistration();
      if (reg && reg.showNotification) {
        await reg.showNotification(title, {
          body,
          icon: '/pwa-192x192.png',
          badge: '/icon.svg',
          tag: 'nexus-emergency-sos',
          renotify: true,
          silent: false,
          requireInteraction: true,
          vibrate: [500, 200, 500, 200, 500, 200, 800],
          data: { url: window.location.href, type: 'SOS' }
        } as any);
        return true;
      }

      // 4. Fallback window Notification
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, {
          body,
          icon: '/pwa-192x192.png',
          tag: 'nexus-emergency-sos',
          requireInteraction: true
        });
        return true;
      }
    } catch (err) {
      console.warn('Failed to display SOS emergency notification:', err);
    }
    return false;
  }

  /**
   * Important Notification for Family Feed events (Arrivals, Departures, Low Battery, Check-ins)
   */
  public async showImportantNotification(title: string, body: string, tag: string = 'nexus-feed-alert'): Promise<boolean> {
    if (typeof window === 'undefined') return false;

    if ((window as any).NexusNative?.showNativeNotification) {
      try {
        (window as any).NexusNative.showNativeNotification(title, body);
      } catch {}
    }

    try {
      const hasPermission = await this.requestPermission();
      if (!hasPermission) return false;

      const reg = await this.getSwRegistration();
      if (reg && reg.showNotification) {
        await reg.showNotification(title, {
          body,
          icon: '/pwa-192x192.png',
          badge: '/icon.svg',
          tag,
          renotify: true,
          data: { url: window.location.href }
        } as any);
        return true;
      }

      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body, icon: '/pwa-192x192.png', tag });
        return true;
      }
    } catch {}
    return false;
  }

  public async clearNotification() {
    if (typeof window === 'undefined') return;
    try {
      const reg = await this.getSwRegistration();
      if (reg && reg.getNotifications) {
        const notifications = await reg.getNotifications({ tag: 'nexus-live-status' });
        notifications.forEach(n => n.close());
      }
    } catch {}
    this.isNotificationShown = false;
  }

  public async clearSosNotification() {
    if (typeof window === 'undefined') return;

    if ((window as any).NexusNative?.clearNativeSosAlert) {
      try {
        (window as any).NexusNative.clearNativeSosAlert();
      } catch {}
    }

    try {
      const reg = await this.getSwRegistration();
      if (reg && reg.getNotifications) {
        const notifications = await reg.getNotifications({ tag: 'nexus-emergency-sos' });
        notifications.forEach(n => n.close());
      }
    } catch {}
  }
}

export const notificationManager = new NotificationManager();
