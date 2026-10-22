/**
 * Nexus Status Bar Notification Manager
 * 
 * Displays and maintains a persistent notification in the mobile
 * notification bar / status bar while live tracking is active,
 * and broadcasts high-priority emergency SOS alerts.
 */

export class NotificationManager {
  private isNotificationShown: boolean = false;

  public async requestPermission(): Promise<boolean> {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return false;
    }

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

  public async showLiveTrackingNotification(circleName?: string, memberCount?: number): Promise<boolean> {
    if (typeof window === 'undefined' || !('Notification' in window)) return false;

    try {
      const hasPermission = await this.requestPermission();
      if (!hasPermission) return false;

      const title = 'Nexus Family Tracker';
      const body = circleName 
        ? `🟢 Live Background Active • ${circleName} (${memberCount || 1} online)`
        : '🟢 Live Background Location Active (10s GPS intervals)';

      // 1. Primary: Use ServiceWorker registration.showNotification for real Android notification bar persistence
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready;
        if (reg && reg.showNotification) {
          await reg.showNotification(title, {
            body,
            icon: '/pwa-192x192.png',
            badge: '/icon.svg',
            tag: 'nexus-live-status',
            renotify: false,
            silent: true,
            requireInteraction: true, // Keeps notification visible in notification drawer
            data: { url: window.location.href }
          } as any);
          this.isNotificationShown = true;
          return true;
        }
      }

      // 2. Fallback: window Notification
      if (Notification.permission === 'granted') {
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
    if (typeof window === 'undefined' || !('Notification' in window)) return false;

    try {
      const hasPermission = await this.requestPermission();
      if (!hasPermission) return false;

      const title = `🚨 EMERGENCY SOS: ${memberName} Needs Help!`;
      const body = placeName
        ? `${memberName} triggered emergency SOS near ${placeName}! Tap to view live location & directions.`
        : `${memberName} triggered emergency SOS! Live coordinates broadcasting. Tap to navigate.`;

      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready;
        if (reg && reg.showNotification) {
          await reg.showNotification(title, {
            body,
            icon: '/pwa-192x192.png',
            badge: '/icon.svg',
            tag: 'nexus-emergency-sos',
            renotify: true,
            silent: false,
            requireInteraction: true, // Remains on lockscreen until handled
            vibrate: [500, 200, 500, 200, 500, 200, 800],
            data: { url: window.location.href, type: 'SOS' }
          } as any);
          return true;
        }
      }

      if (Notification.permission === 'granted') {
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

  public async clearNotification() {
    if (typeof window === 'undefined') return;
    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready;
        if (reg && reg.getNotifications) {
          const notifications = await reg.getNotifications({ tag: 'nexus-live-status' });
          notifications.forEach(n => n.close());
        }
      }
    } catch {}
    this.isNotificationShown = false;
  }

  public async clearSosNotification() {
    if (typeof window === 'undefined') return;
    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready;
        if (reg && reg.getNotifications) {
          const notifications = await reg.getNotifications({ tag: 'nexus-emergency-sos' });
          notifications.forEach(n => n.close());
        }
      }
    } catch {}
  }
}

export const notificationManager = new NotificationManager();
