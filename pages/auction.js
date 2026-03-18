import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/auth';
import Layout from '../components/Layout';
import TableView from '../components/TableView';
import { vehicleApi } from '../lib/api';
import { io } from 'socket.io-client';

export default function Auction() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [vehicles, setVehicles] = useState([]);
  const [socket, setSocket] = useState(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredVehicles, setFilteredVehicles] = useState([]);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  const loadData = async () => {
    try {
      setDataLoading(true);
      const response = await fetch('http://localhost:8091/api/vehicles/auction/list', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      const data = await response.json();
      setVehicles(data);
    } catch (error) {
      console.error('Failed to load auction vehicles:', error);
    } finally {
      setDataLoading(false);
    }
  };

  useEffect(() => {
    const filtered = vehicles.filter(v => {
      const search = searchTerm.toLowerCase();
      return (
        v.license_plate?.toLowerCase().includes(search) ||
        v.brand?.toLowerCase().includes(search) ||
        v.model?.toLowerCase().includes(search) ||
        v.auction_name?.toLowerCase().includes(search) ||
        v.color?.toLowerCase().includes(search) ||
        v.province?.toLowerCase().includes(search)
      );
    });
    setFilteredVehicles(filtered);
  }, [vehicles, searchTerm]);

  useEffect(() => {
    if (user) {
      loadData();
      
      // Setup WebSocket
      const newSocket = io('http://localhost:8091', {
        path: '/socket.io',
        transports: ['websocket', 'polling']
      });
      
      newSocket.on('connect', () => {
        console.log('Connected to WebSocket');
      });
      
      newSocket.on('vehicleUpdate', (updatedVehicle) => {
        setVehicles(prev => {
          const index = prev.findIndex(v => v.id === updatedVehicle.id);
          if (updatedVehicle.in_auction) {
            if (index >= 0) {
              const newVehicles = [...prev];
              newVehicles[index] = updatedVehicle;
              return newVehicles;
            } else {
              return [...prev, updatedVehicle];
            }
          } else {
            return prev.filter(v => v.id !== updatedVehicle.id);
          }
        });
      });
      
      setSocket(newSocket);
      
      return () => {
        newSocket.disconnect();
      };
    }
  }, [user, loadData]);

  if (loading || dataLoading) {
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
      view="auction" 
      setView={(v) => router.push(v === 'table' ? '/' : v === 'map' ? '/' : `/${v}`)}
      searchTerm={searchTerm}
      setSearchTerm={setSearchTerm}
      onRefresh={loadData}
    >
      <div className="mb-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">🏛️ ลานประมูล</h1>
            <p className="text-sm text-gray-600 mt-1">รถที่อยู่ในลานประมูล ({filteredVehicles.length} คัน)</p>
          </div>
        </div>
      </div>
      <TableView vehicles={filteredVehicles} onRefresh={loadData} context="auction" />
    </Layout>
  );
}
