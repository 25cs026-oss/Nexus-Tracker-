import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(async (registration) => {
      console.log('Nexus ServiceWorker registered:', registration.scope);

      // Register periodic background sync if supported by browser (e.g. Chrome on Android)
      if ('periodicSync' in registration) {
        try {
          const status = await (navigator as any).permissions.query({
            name: 'periodic-background-sync',
          });
          if (status.state === 'granted') {
            await (registration as any).periodicSync.register('nexus-periodic-location', {
              minInterval: 15 * 1000, // 15 seconds
            });
            console.log('Nexus Periodic Sync active (15s interval)');
          }
        } catch {
          // Periodic sync permission not granted or unsupported
        }
      }
    }).catch(registrationError => {
      console.warn('ServiceWorker registration error:', registrationError);
    });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
