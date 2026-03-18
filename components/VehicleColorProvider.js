import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { vehicleColorApi } from '../lib/api';
import { useAuth } from '../lib/auth';

const VehicleColorContext = createContext({
  presets: [],
  loading: false,
  error: null,
  refreshColors: async () => {},
  resolveColor: () => ({ hex: '#3B82F6', name: 'สีไม่ระบุ', presetId: null })
});

const FALLBACK_COLOR_MAP = {
  'ขาว': '#F0F0F0',
  'ดำ': '#2C2C2C',
  'เทา': '#808080',
  'เงิน': '#C0C0C0',
  'แดง': '#DC2626',
  'น้ำเงิน': '#2563EB',
  'เขียว': '#16A34A',
  'เหลือง': '#EAB308',
  'ส้ม': '#EA580C',
  'ชมพู': '#EC4899',
  'น้ำตาล': '#92400E',
  'ทอง': '#F59E0B',
  'ม่วง': '#9333EA'
};

export const VehicleColorProvider = ({ children }) => {
  const { user, loading: authLoading } = useAuth();
  const [presets, setPresets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadColors = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await vehicleColorApi.getAll();
      setPresets(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load vehicle colors:', err);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Only load colors after user is authenticated
    if (!authLoading && user) {
      loadColors();
    } else if (!authLoading && !user) {
      // User is not authenticated, reset state
      setPresets([]);
      setLoading(false);
    }
  }, [authLoading, user, loadColors]);

  const aliasMap = useMemo(() => {
    const map = new Map();
    presets.forEach((preset) => {
      const normalizedName = (preset.name || '').trim().toLowerCase();
      if (normalizedName) {
        map.set(normalizedName, preset);
      }
      preset.aliases?.forEach((alias) => {
        const normalizedAlias = (alias.raw_value || '').trim().toLowerCase();
        if (normalizedAlias) {
          map.set(normalizedAlias, preset);
        }
      });
    });
    return map;
  }, [presets]);

  const resolveColor = useCallback(
    (rawValue) => {
      const rawString = (rawValue ?? '').toString().trim();
      if (!rawString) {
        return { hex: '#94A3B8', name: 'สีไม่ระบุ', presetId: null };
      }

      const normalized = rawString.toLowerCase();
      const matchedPreset = aliasMap.get(normalized);
      if (matchedPreset) {
        return {
          hex: matchedPreset.hex,
          name: matchedPreset.name,
          presetId: matchedPreset.id
        };
      }

      const fallbackHex = FALLBACK_COLOR_MAP[rawString];
      if (fallbackHex) {
        return { hex: fallbackHex, name: rawString, presetId: null };
      }

      return { hex: '#475569', name: rawString, presetId: null };
    },
    [aliasMap]
  );

  const value = useMemo(
    () => ({
      presets,
      loading,
      error,
      refreshColors: loadColors,
      resolveColor
    }),
    [presets, loading, error, loadColors, resolveColor]
  );

  return (
    <VehicleColorContext.Provider value={value}>
      {children}
    </VehicleColorContext.Provider>
  );
};

export const useVehicleColors = () => useContext(VehicleColorContext);
