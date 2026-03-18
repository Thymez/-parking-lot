import '../styles/globals.css'
import { AuthProvider } from '../lib/auth'
import { DialogProvider } from '../components/DialogProvider'
import { VehicleColumnsProvider } from '../components/VehicleColumnsProvider'
import { VehicleColorProvider } from '../components/VehicleColorProvider'
import { useEffect } from 'react'

export default function App({ Component, pageProps }) {
  useEffect(() => {
    // Clear cache and force reload once on app start
    const cacheCleared = sessionStorage.getItem('cache_cleared_v3');
    
    if (!cacheCleared) {
      console.log('🧹 Clearing cache and reloading...');
      
      // Clear all caches
      if ('caches' in window) {
        caches.keys().then(names => {
          names.forEach(name => {
            caches.delete(name);
          });
        });
      }
      
      // Clear localStorage (except auth token)
      const token = localStorage.getItem('token');
      localStorage.clear();
      if (token) {
        localStorage.setItem('token', token);
      }
      
      // Mark as cleared for this session
      sessionStorage.setItem('cache_cleared_v3', 'true');
      
      // Force hard reload
      window.location.reload(true);
    }
  }, []);

  return (
    <AuthProvider>
      <DialogProvider>
        <VehicleColumnsProvider>
          <VehicleColorProvider>
            <Component {...pageProps} />
          </VehicleColorProvider>
        </VehicleColumnsProvider>
      </DialogProvider>
    </AuthProvider>
  )
}
