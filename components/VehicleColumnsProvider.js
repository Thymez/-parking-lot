import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { vehicleApi } from '../lib/api';
import { useAuth } from '../lib/auth';

const VehicleColumnsContext = createContext({
  columns: [],
  refreshColumns: async () => {},
  loading: false,
  error: null
});

export const VehicleColumnsProvider = ({ children }) => {
  const { user, loading: authLoading } = useAuth();
  const [columns, setColumns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadColumns = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await vehicleApi.getColumns();
      setColumns(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load vehicle columns:', err);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Only load columns after user is authenticated
    if (!authLoading && user) {
      loadColumns();
    } else if (!authLoading && !user) {
      // User is not authenticated, reset state
      setColumns([]);
      setLoading(false);
    }
  }, [authLoading, user, loadColumns]);

  const value = useMemo(() => ({
    columns,
    refreshColumns: loadColumns,
    loading,
    error
  }), [columns, loadColumns, loading, error]);

  return (
    <VehicleColumnsContext.Provider value={value}>
      {children}
    </VehicleColumnsContext.Provider>
  );
};

export const useVehicleColumns = () => useContext(VehicleColumnsContext);
