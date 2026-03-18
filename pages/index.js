import { useEffect, useMemo, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/auth';
import Layout from '../components/Layout';
import TableView, { EMPTY_LOT_FILTER_VALUE } from '../components/TableView';
import MapView from '../components/MapView';
import { vehicleApi, parkingLotApi } from '../lib/api';
import { useVehicleColumns } from '../components/VehicleColumnsProvider';
import { io } from 'socket.io-client';

const ALL_LOTS_FILTER_VALUE = '__ALL_LOTS__';

export default function Dashboard() {
  const { user, loading } = useAuth();
  const { loading: columnsLoading } = useVehicleColumns();
  const router = useRouter();
  const [view, setView] = useState('table');
  const [vehicles, setVehicles] = useState([]);
  const [parkingLots, setParkingLots] = useState([]);
  const [selectedLot, setSelectedLot] = useState(null);
  const [lotFilterValue, setLotFilterValue] = useState(ALL_LOTS_FILTER_VALUE);
  const [searchTerm, setSearchTerm] = useState('');
  const [socket, setSocket] = useState(null);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (user) {
      const abortController = new AbortController();
      
      const loadData = async () => {
        try {
          setDataLoading(true);
          const [vehiclesData, lotsData] = await Promise.all([
            vehicleApi.getAll({ signal: abortController.signal }),
            parkingLotApi.getAll({ signal: abortController.signal })
          ]);
          setVehicles(vehiclesData);
          setParkingLots(lotsData);
        } catch (error) {
          if (error.name !== 'AbortError') {
            console.error('Failed to load data:', error);
          }
        } finally {
          setDataLoading(false);
        }
      };
      
      loadData();
      
      // Connect to WebSocket - handle both domain (HTTPS) and IP (HTTP)
      let wsUrl;
      if (typeof window !== 'undefined') {
        const isHttps = window.location.protocol === 'https:';
        const hostname = window.location.hostname;
        
        // If using domain with HTTPS, connect to same domain (reverse proxy handles it)
        // If using IP with HTTP, connect to port 8091 directly
        if (isHttps || hostname.includes('.')) {
          // Production domain or HTTPS - use same origin
          wsUrl = `${window.location.protocol}//${hostname}`;
        } else {
          // Development IP - use port 8091
          wsUrl = `${window.location.protocol}//${hostname}:8091`;
        }
      } else {
        wsUrl = 'http://localhost:8091';
      }
      
      console.log('🔌 Connecting to WebSocket:', wsUrl);
      
      const newSocket = io(wsUrl, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 5,
        path: '/socket.io'
      });
      
      setSocket(newSocket);

      newSocket.on('connect', () => {
        console.log('WebSocket connected');
      });

      newSocket.on('vehicle:created', (vehicle) => {
        setVehicles(prev => [...prev, vehicle]);
      });

      newSocket.on('vehicle:updated', (vehicle) => {
        setVehicles(prev => prev.map(v => v.id === vehicle.id ? vehicle : v));
      });

      newSocket.on('vehicle:deleted', ({ id }) => {
        setVehicles(prev => prev.filter(v => v.id !== id));
      });

      newSocket.on('vehicle:position_updated', (vehicle) => {
        console.log('🔔 [WEBSOCKET] vehicle:position_updated received:', {
          vehicleId: vehicle.id,
          position: { x: vehicle.x, y: vehicle.y, rotation: vehicle.rotation }
        });
        setVehicles(prev => prev.map(v => v.id === vehicle.id ? vehicle : v));
      });

      newSocket.on('vehicles:bulk_created', (allVehicles) => {
        setVehicles(allVehicles);
      });

      newSocket.on('vehicles:bulk_updated', (allVehicles) => {
        setVehicles(allVehicles);
      });

      newSocket.on('disconnect', () => {
        console.log('WebSocket disconnected');
      });

      return () => {
        abortController.abort();
        if (newSocket) {
          newSocket.close();
        }
      };
    }
  }, [user]);

  const getLotFilterKey = useCallback((lot) => {
    if (!lot) return '';
    const nameKey = lot.parking_lot_name?.trim().toLowerCase();
    if (nameKey) return nameKey;
    if (lot.parking_lot_number) {
      return String(lot.parking_lot_number);
    }
    return EMPTY_LOT_FILTER_VALUE;
  }, []);

  const resolveLotNumberFromFilter = useCallback((filterValue) => {
    if (!filterValue || filterValue === ALL_LOTS_FILTER_VALUE) return null;
    const matchedLot = parkingLots.find((lot) => getLotFilterKey(lot) === filterValue);
    if (matchedLot?.parking_lot_number) {
      return matchedLot.parking_lot_number;
    }

    const matchedVehicle = vehicles.find((vehicle) => {
      const rawName = typeof vehicle.parking_lot_name === 'string' ? vehicle.parking_lot_name.trim().toLowerCase() : '';
      const nameKey = rawName || EMPTY_LOT_FILTER_VALUE;
      const numberKey = vehicle.parking_lot_number ? String(vehicle.parking_lot_number) : '';
      return filterValue === nameKey || (!!numberKey && filterValue === numberKey);
    });

    return matchedVehicle?.parking_lot_number ?? null;
  }, [parkingLots, vehicles, getLotFilterKey]);

  const handleLotFilterChange = useCallback((value) => {
    setLotFilterValue(value);
    if (value === ALL_LOTS_FILTER_VALUE) {
      setSelectedLot(null);
      return;
    }
    const lotNumber = resolveLotNumberFromFilter(value);
    setSelectedLot(lotNumber ?? null);
  }, [resolveLotNumberFromFilter]);

  useEffect(() => {
    if (view !== 'map') return;
    if (selectedLot == null) return;
    const matchedLot = parkingLots.find((lot) => lot.parking_lot_number === selectedLot);
    if (!matchedLot) return;
    const key = getLotFilterKey(matchedLot);
    if (key && lotFilterValue !== key) {
      setLotFilterValue(key);
    }
  }, [selectedLot, parkingLots, lotFilterValue, view, getLotFilterKey]);

  const matchesLotFilterValue = useCallback((vehicle = {}) => {
    if (!lotFilterValue || lotFilterValue === ALL_LOTS_FILTER_VALUE) return true;
    const rawName = typeof vehicle.parking_lot_name === 'string' ? vehicle.parking_lot_name.trim().toLowerCase() : '';
    const nameKey = rawName || EMPTY_LOT_FILTER_VALUE;
    const numberKey = vehicle.parking_lot_number ? String(vehicle.parking_lot_number) : EMPTY_LOT_FILTER_VALUE;
    return lotFilterValue === nameKey || lotFilterValue === numberKey;
  }, [lotFilterValue]);

  const filterByLotSelection = useCallback((list = []) => {
    if (!lotFilterValue || lotFilterValue === ALL_LOTS_FILTER_VALUE) return list;
    return list.filter((vehicle) => matchesLotFilterValue(vehicle));
  }, [lotFilterValue, matchesLotFilterValue]);

  const loadData = async () => {
    try {
      setDataLoading(true);
      const [vehiclesData, lotsData] = await Promise.all([
        vehicleApi.getAll(),
        parkingLotApi.getAll()
      ]);
      setVehicles(vehiclesData);
      setParkingLots(lotsData);
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error('Failed to load data:', error);
      }
    } finally {
      setDataLoading(false);
    }
  };

  const searchFilteredVehicles = useMemo(() => {
    const list = vehicles || [];
    const trimmed = searchTerm?.trim().toLowerCase();
    if (!trimmed) {
      return list;
    }
    return list.filter((vehicle) => {
      return (
        vehicle.license_plate?.toLowerCase().includes(trimmed) ||
        vehicle.brand?.toLowerCase().includes(trimmed) ||
        vehicle.model?.toLowerCase().includes(trimmed) ||
        vehicle.zone?.toLowerCase().includes(trimmed) ||
        vehicle.workshop_name?.toLowerCase().includes(trimmed) ||
        vehicle.auction_name?.toLowerCase().includes(trimmed) ||
        vehicle.sale_notes?.toLowerCase().includes(trimmed)
      );
    });
  }, [vehicles, searchTerm]);

  const tableVehicles = useMemo(() => {
    return (searchFilteredVehicles || []).filter((vehicle) => {
      if (!selectedLot) return true;
      return vehicle.parking_lot_number === selectedLot;
    });
  }, [searchFilteredVehicles, selectedLot]);

  const mapCurrentVehicles = useMemo(() => {
    const base = filterByLotSelection(searchFilteredVehicles).filter((vehicle) => (
      !vehicle.in_workshop && !vehicle.in_auction && !vehicle.in_sale
    ));
    if (!selectedLot) {
      return base;
    }
    return base.filter((vehicle) => vehicle.parking_lot_number === selectedLot);
  }, [filterByLotSelection, searchFilteredVehicles, selectedLot]);

  const filteredVehicles = useMemo(() => {
    if (view === 'workshop') {
      return searchFilteredVehicles.filter((vehicle) => (
        vehicle.in_workshop && (!selectedLot || vehicle.parking_lot_number === selectedLot)
      ));
    }
    if (view === 'auction') {
      return searchFilteredVehicles.filter((vehicle) => (
        vehicle.in_auction && (!selectedLot || vehicle.parking_lot_number === selectedLot)
      ));
    }
    if (view === 'sale') {
      return searchFilteredVehicles.filter((vehicle) => (
        vehicle.in_sale && (!selectedLot || vehicle.parking_lot_number === selectedLot)
      ));
    }
    if (view === 'table') {
      return tableVehicles;
    }
    if (view === 'map') {
      return mapCurrentVehicles;
    }
    return searchFilteredVehicles;
  }, [view, searchFilteredVehicles, selectedLot, tableVehicles, mapCurrentVehicles]);

  const lotFilterOptions = useMemo(() => {
    const stats = new Map();
    let totalCount = 0;
    (searchFilteredVehicles || []).forEach((vehicle) => {
      const rawName = typeof vehicle.parking_lot_name === 'string' ? vehicle.parking_lot_name.trim() : '';
      const lotNumberKey = vehicle.parking_lot_number ? String(vehicle.parking_lot_number) : '';
      const key = rawName ? rawName.toLowerCase() : (lotNumberKey || EMPTY_LOT_FILTER_VALUE);
      if (!stats.has(key)) {
        stats.set(key, {
          value: key,
          label: rawName || (lotNumberKey ? `ลาน ${lotNumberKey}` : 'ไม่ระบุลาน'),
          count: 0
        });
      }
      const entry = stats.get(key);
      entry.count += 1;
      if (rawName) {
        entry.label = rawName;
      }
      totalCount += 1;
    });
    const collator = new Intl.Collator('th-TH', { numeric: true, sensitivity: 'base' });
    const options = Array.from(stats.values()).sort((a, b) => collator.compare(a.label, b.label));
    options.unshift({
      value: ALL_LOTS_FILTER_VALUE,
      label: 'ทุกลาน',
      count: totalCount,
      isAll: true
    });
    return options;
  }, [searchFilteredVehicles]);

  const activeLotOption = useMemo(() => (
    lotFilterOptions.find((option) => option.value === lotFilterValue)
  ), [lotFilterOptions, lotFilterValue]);

  useEffect(() => {
    if (view !== 'map') return;
    const needsFallback = !lotFilterValue || lotFilterValue === ALL_LOTS_FILTER_VALUE;
    if (needsFallback && lotFilterOptions.length) {
      const fallbackValue = lotFilterOptions.find((option) => !option.isAll)?.value;
      if (fallbackValue) {
        handleLotFilterChange(fallbackValue);
      }
    }
  }, [view, lotFilterOptions, lotFilterValue, handleLotFilterChange]);

  if (loading || !user || columnsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">กำลังโหลด...</p>
        </div>
      </div>
    );
  }

  return (
    <Layout
      view={view}
      setView={setView}
      parkingLots={parkingLots}
      selectedLot={selectedLot}
      setSelectedLot={setSelectedLot}
      searchTerm={searchTerm}
      setSearchTerm={setSearchTerm}
      onRefresh={loadData}
      lotFilterValue={lotFilterValue}
      onLotFilterChange={handleLotFilterChange}
      lotFilterOptions={lotFilterOptions}
    >
      {dataLoading ? (
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
            <p className="mt-4 text-gray-600">กำลังโหลดข้อมูล...</p>
          </div>
        </div>
      ) : view === 'workshop' ? (
        <>
          <div className="mb-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h1 className="text-2xl font-bold text-gray-800">🔧 ลานอู่</h1>
                <p className="text-sm text-gray-600 mt-1">รถที่อยู่ในอู่ซ่อมบำรุง ({filteredVehicles.length} คัน)</p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="ค้นหาทะเบียน, ยี่ห้อ, รุ่น, ชื่ออู่..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  />
                  <svg
                    className="absolute left-3 top-3.5 h-5 w-5 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
              </div>
              <select
                value={selectedLot || ''}
                onChange={(e) => setSelectedLot(e.target.value ? parseInt(e.target.value) : null)}
                className="px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-white"
              >
                <option value="">ทุกลานจอด</option>
                {(parkingLots || []).map((lot) => (
                  <option key={lot.parking_lot_number} value={lot.parking_lot_number}>
                    ลาน {lot.parking_lot_number}: {lot.parking_lot_name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <TableView 
            vehicles={filteredVehicles}
            onRefresh={loadData}
            context="workshop"
          />
        </>
      ) : view === 'auction' ? (
        <>
          <div className="mb-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h1 className="text-2xl font-bold text-gray-800">🏛️ ลานประมูล</h1>
                <p className="text-sm text-gray-600 mt-1">รถที่อยู่ในลานประมูล ({filteredVehicles.length} คัน)</p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="ค้นหาทะเบียน, ยี่ห้อ, รุ่น, ชื่อลานประมูล..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
                  />
                  <svg
                    className="absolute left-3 top-3.5 h-5 w-5 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
              </div>
              <select
                value={selectedLot || ''}
                onChange={(e) => setSelectedLot(e.target.value ? parseInt(e.target.value) : null)}
                className="px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none bg-white"
              >
                <option value="">ทุกลานจอด</option>
                {(parkingLots || []).map((lot) => (
                  <option key={lot.parking_lot_number} value={lot.parking_lot_number}>
                    ลาน {lot.parking_lot_number}: {lot.parking_lot_name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <TableView 
            vehicles={filteredVehicles}
            onRefresh={loadData}
            context="auction"
          />
        </>
      ) : view === 'sale' ? (
        <>
          <div className="mb-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h1 className="text-2xl font-bold text-gray-800">🏷️ การขาย</h1>
                <p className="text-sm text-gray-600 mt-1">รถที่อยู่ในการขาย ({filteredVehicles.length} คัน)</p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="ค้นหาทะเบียน, ยี่ห้อ, รุ่น, หมายเหตุการขาย..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
                  />
                  <svg
                    className="absolute left-3 top-3.5 h-5 w-5 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
              </div>
              <select
                value={selectedLot || ''}
                onChange={(e) => setSelectedLot(e.target.value ? parseInt(e.target.value) : null)}
                className="px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none bg-white"
              >
                <option value="">ทุกลานจอด</option>
                {(parkingLots || []).map((lot) => (
                  <option key={lot.parking_lot_number} value={lot.parking_lot_number}>
                    ลาน {lot.parking_lot_number}: {lot.parking_lot_name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <TableView 
            vehicles={filteredVehicles}
            onRefresh={loadData}
            context="sale"
          />
        </>
      ) : view === 'table' ? (
        <TableView 
          vehicles={filteredVehicles}
          onRefresh={loadData}
          context="main"
          lotFilterValue={lotFilterValue}
          onLotFilterChange={handleLotFilterChange}
          lotFilterOptions={lotFilterOptions}
        />
      ) : (
        <MapView 
          vehicles={mapCurrentVehicles}
          allVehicles={searchFilteredVehicles}
          selectedLot={selectedLot}
          setSelectedLot={setSelectedLot}
          parkingLots={parkingLots}
          activeLotKey={lotFilterValue}
          activeLotLabel={activeLotOption?.label || ''}
          lotFilterValue={lotFilterValue}
          onLotFilterChange={handleLotFilterChange}
        />
      )}
    </Layout>
  );
}
