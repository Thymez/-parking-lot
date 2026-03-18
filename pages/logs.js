import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/auth';
import { vehicleApi } from '../lib/api';
import { useVehicleColumns } from '../components/VehicleColumnsProvider';
import { io } from 'socket.io-client';

const PAGE_SIZE = 40;

const ACTION_STYLES = {
  create: { label: 'สร้างข้อมูล', badge: 'bg-emerald-50 text-emerald-700' },
  update: { label: 'แก้ไขข้อมูล', badge: 'bg-blue-50 text-blue-700' },
  bulk_update: { label: 'แก้ไขหลายรายการ', badge: 'bg-indigo-50 text-indigo-700' },
  delete: { label: 'ลบข้อมูล', badge: 'bg-red-50 text-red-700' },
  position_update: { label: 'ปรับตำแหน่ง', badge: 'bg-amber-50 text-amber-700' },
  workshop_send: { label: 'ส่งเข้าอู่', badge: 'bg-purple-50 text-purple-700' },
  workshop_return: { label: 'ออกจากอู่', badge: 'bg-purple-50 text-purple-700' },
  workshop_update: { label: 'แก้ไขข้อมูลอู่', badge: 'bg-purple-50 text-purple-700' },
  sale_send: { label: 'ส่งเข้าขาย', badge: 'bg-emerald-50 text-emerald-700' },
  sale_return: { label: 'ออกจากขาย', badge: 'bg-emerald-50 text-emerald-700' },
  sale_update: { label: 'แก้ไขข้อมูลขาย', badge: 'bg-emerald-50 text-emerald-700' },
  auction_send: { label: 'ส่งเข้าประมูล', badge: 'bg-orange-50 text-orange-700' },
  auction_return: { label: 'ออกจากประมูล', badge: 'bg-orange-50 text-orange-700' },
  auction_update: { label: 'แก้ไขข้อมูลประมูล', badge: 'bg-orange-50 text-orange-700' }
};

const POSITION_LABELS = {
  x: 'ตำแหน่ง X',
  y: 'ตำแหน่ง Y',
  rotation: 'องศาการหมุน'
};

const formatValue = (value) => {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'ใช่' : 'ไม่ใช่';
  if (typeof value === 'number') return value.toString();
  return String(value);
};

const formatDateTime = (value) => {
  if (!value) return '-';
  try {
    return new Intl.DateTimeFormat('th-TH', {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(new Date(value));
  } catch (error) {
    return '-';
  }
};

export default function VehicleLogsPage() {
  const router = useRouter();
  const { user, loading: authLoading, isAdmin, getToken } = useAuth();
  const { columns } = useVehicleColumns();

  const [logs, setLogs] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, offset: 0 });
  const [loading, setLoading] = useState(true);
  const [fetchingMore, setFetchingMore] = useState(false);
  const [error, setError] = useState('');
  const [vehicleIdInput, setVehicleIdInput] = useState('');
  const [activeVehicleId, setActiveVehicleId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);
  const [viewMode, setViewMode] = useState('cards');
  const [exportingFormat, setExportingFormat] = useState(null);

  const socketRef = useRef(null);
  const activeVehicleIdRef = useRef(activeVehicleId);

  useEffect(() => {
    activeVehicleIdRef.current = activeVehicleId;
  }, [activeVehicleId]);

  const columnLabelMap = useMemo(() => {
    const map = new Map();
    (columns || []).forEach((column) => {
      if (column?.column_key) {
        map.set(column.column_key, column.label || column.column_key);
      }
    });
    return map;
  }, [columns]);

  const getFieldLabel = useCallback((key) => {
    if (!key) return 'ไม่ทราบฟิลด์';
    if (key.startsWith('custom:')) {
      const originalKey = key.replace('custom:', '');
      return columnLabelMap.get(originalKey) || `Custom: ${originalKey}`;
    }
    return (
      columnLabelMap.get(key) ||
      POSITION_LABELS[key] ||
      {
        license_plate: 'ทะเบียน',
        province: 'หมวด / จังหวัด',
        brand: 'ยี่ห้อ',
        model: 'รุ่น',
        grade: 'เกรด',
        color: 'สี',
        updated_date: 'วันที่ (อัปเดต)',
        transaction_type: 'ประเภทรายการ',
        origin_lot: 'ลานต้นทาง',
        destination_lot: 'ลานปลายทาง',
        document_status: 'สถานะเอกสาร',
        zone: 'โซน',
        gp_approval_status: 'สถานะการอนุมัติ (GP)',
        policy_type: 'ประเภทกรมธรรม์',
        policy_amount: 'ทุนประกัน',
        parking_lot_number: 'ลำดับจอด',
        parking_lot_name: 'ชื่อลานจอด',
        sequence_no: 'ลำดับระบบ',
        rmo: 'RMO',
        cmo: 'CMO',
        note_summary: 'หมายเหตุ',
        key_status: 'สถานะกุญแจ',
        key_number: 'เลขกุญแจ',
        start_time: 'เวลาเริ่มต้น',
        workshop_name: 'ชื่ออู่',
        workshop_notes: 'หมายเหตุอู่',
        auction_name: 'ชื่อประมูล',
        auction_notes: 'หมายเหตุประมูล',
        sale_notes: 'หมายเหตุขาย',
        in_sale: 'สถานะขาย',
        in_workshop: 'สถานะอู่',
        in_auction: 'สถานะประมูล',
        notes: 'หมายเหตุอื่นๆ'
      }[key] || key
    );
  }, [columnLabelMap]);

  const fetchLogs = useCallback(async ({ reset = false, offset = 0, vehicleId = null } = {}) => {
    if (reset) {
      setLoading(true);
    } else {
      setFetchingMore(true);
    }
    setError('');

    try {
      const data = await vehicleApi.getLogs({
        limit: PAGE_SIZE,
        offset,
        vehicleId: vehicleId || undefined
      });

      setLogs((prev) => (reset ? data.logs : [...prev, ...data.logs]));
      setPagination({
        total: data.pagination.total,
        offset: offset + data.logs.length
      });
      setLastUpdated(new Date().toISOString());
    } catch (err) {
      console.error('Failed to fetch logs:', err);
      setError(err.message || 'ไม่สามารถโหลดบันทึกได้');
    } finally {
      if (reset) {
        setLoading(false);
      } else {
        setFetchingMore(false);
      }
    }
  }, []);

  const canViewLogs = !!user && ['admin', 'member'].includes(user.role);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (!canViewLogs) {
      router.replace('/');
      return;
    }

    fetchLogs({ reset: true, offset: 0, vehicleId: activeVehicleId });
  }, [user, authLoading, canViewLogs, router, fetchLogs, activeVehicleId]);

  useEffect(() => {
    if (authLoading || !user || !canViewLogs) return;

    let wsUrl;
    if (typeof window !== 'undefined') {
      const isHttps = window.location.protocol === 'https:';
      const hostname = window.location.hostname;
      if (isHttps || hostname.includes('.')) {
        wsUrl = `${window.location.protocol}//${hostname}`;
      } else {
        wsUrl = `${window.location.protocol}//${hostname}:8091`;
      }
    } else {
      wsUrl = 'http://localhost:8091';
    }

    const socket = io(wsUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
      path: '/socket.io'
    });

    socketRef.current = socket;

    const handleLogCreated = (log) => {
      let inserted = false;
      setLogs((prev) => {
        if (activeVehicleIdRef.current && log.vehicle_id !== activeVehicleIdRef.current) {
          return prev;
        }
        if (prev.some((item) => item.id === log.id)) {
          return prev;
        }
        inserted = true;
        return [log, ...prev];
      });

      if (inserted) {
        setPagination((prev) => ({ ...prev, offset: prev.offset + 1 }));
        setLastUpdated(new Date().toISOString());
      }
    };

    const handleLogsTotal = ({ total }) => {
      setPagination((prev) => ({ ...prev, total }));
    };

    socket.on('vehicle:log_created', handleLogCreated);
    socket.on('vehicle:logs_total', handleLogsTotal);

    return () => {
      socket.off('vehicle:log_created', handleLogCreated);
      socket.off('vehicle:logs_total', handleLogsTotal);
      socket.close();
      socketRef.current = null;
    };
  }, [authLoading, user, canViewLogs]);

  const handleLoadMore = () => {
    if (fetchingMore) return;
    fetchLogs({ reset: false, offset: pagination.offset, vehicleId: activeVehicleId });
  };

  const handleApplyVehicleFilter = (e) => {
    e?.preventDefault();
    const trimmed = vehicleIdInput.trim();
    if (!trimmed) {
      setActiveVehicleId(null);
      return;
    }

    const numeric = Number(trimmed);
    if (Number.isNaN(numeric) || numeric <= 0) {
      setError('กรุณากรอกรหัสรถเป็นตัวเลขเท่านั้น');
      return;
    }

    setActiveVehicleId(numeric);
  };

  const handleExport = async (format = 'xlsx') => {
    try {
      setError('');
      setExportingFormat(format);
      const token = getToken?.();
      if (!token) {
        throw new Error('กรุณาเข้าสู่ระบบอีกครั้งเพื่อส่งออกข้อมูล');
      }

      const params = new URLSearchParams();
      if (activeVehicleId) params.set('vehicle_id', String(activeVehicleId));
      params.set('limit', '5000');
      params.set('format', format);
      const query = params.toString();

      const response = await fetch(`/api/vehicle-logs/export${query ? `?${query}` : ''}`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        throw new Error(errorPayload.error || 'ไม่สามารถส่งออกข้อมูลได้');
      }

      const blob = await response.blob();
      const disposition = response.headers.get('content-disposition') || '';
      const match = disposition.match(/filename\*=UTF-8''(.+)$|filename="?([^";]+)"?/i);
      let filename = match?.[1] || match?.[2] || `vehicle-logs.${format}`;
      try {
        filename = decodeURIComponent(filename);
      } catch (e) {
        // ignore decode errors
      }

      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
      setError(err.message || 'ไม่สามารถส่งออกข้อมูลได้');
    } finally {
      setExportingFormat(null);
    }
  };

  const handleExportFull = async (format = 'xlsx') => {
    try {
      setError('');
      setExportingFormat('full');
      const token = getToken?.();
      if (!token) {
        throw new Error('กรุณาเข้าสู่ระบบอีกครั้งเพื่อส่งออกข้อมูล');
      }

      const params = new URLSearchParams();
      params.set('limit', '5000');
      params.set('format', format);
      const query = params.toString();

      const response = await fetch(`/api/vehicle-logs/export-full?${query}`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        throw new Error(errorPayload.error || 'ไม่สามารถส่งออกข้อมูลได้');
      }

      const blob = await response.blob();
      const disposition = response.headers.get('content-disposition') || '';
      const match = disposition.match(/filename\*=UTF-8''(.+)$|filename="?([^";]+)"?/i);
      let filename = match?.[1] || match?.[2] || `vehicle-logs-full.${format}`;
      try {
        filename = decodeURIComponent(filename);
      } catch (e) {
        // ignore decode errors
      }

      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export full failed:', err);
      setError(err.message || 'ไม่สามารถส่งออกข้อมูลได้');
    } finally {
      setExportingFormat(null);
    }
  };

  const filteredLogs = useMemo(() => {
    if (!searchTerm.trim()) return logs;
    const keyword = searchTerm.trim().toLowerCase();

    return logs.filter((log) => {
      const targets = [
        log.current_vehicle?.license_plate,
        log.current_vehicle?.brand,
        log.current_vehicle?.model,
        log.performed_by?.username,
        ACTION_STYLES[log.action]?.label
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return targets.includes(keyword);
    });
  }, [logs, searchTerm]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto" />
          <p className="mt-4 text-gray-600">กำลังโหลดบันทึกการเปลี่ยนแปลง...</p>
        </div>
      </div>
    );
  }

  if (!canViewLogs) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">📕 บันทึกการเปลี่ยนแปลงรถ</h1>
            <p className="text-gray-600 mt-1">
              ติดตามว่าใครแก้ไขข้อมูลอะไร เมื่อไร พร้อมไฮไลต์ช่องที่มีการเปลี่ยนแปลงด้วยกรอบสีแดง
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => fetchLogs({ reset: true, offset: 0, vehicleId: activeVehicleId })}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition disabled:opacity-50"
              disabled={loading}
            >
              รีเฟรช
            </button>
            <button
              onClick={() => handleExportFull('xlsx')}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold transition"
              disabled={exportingFormat === 'full'}
            >
              ⬇ ส่งออก Excel
            </button>
            <button
              onClick={() => router.push('/')}
              className="px-5 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-100"
            >
              ⬅ กลับแดชบอร์ด
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-gray-500">รูปแบบการแสดงผล:</span>
          <div className="inline-flex rounded-2xl border border-gray-200 bg-white p-1">
            <button
              onClick={() => setViewMode('cards')}
              className={`px-4 py-1.5 rounded-2xl font-medium transition ${viewMode === 'cards' ? 'bg-gray-900 text-white shadow' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              การ์ด
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`px-4 py-1.5 rounded-2xl font-medium transition ${viewMode === 'table' ? 'bg-gray-900 text-white shadow' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              ตาราง
            </button>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
        )}

        <div className="grid gap-4 rounded-2xl bg-white shadow p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <form onSubmit={handleApplyVehicleFilter} className="space-y-2">
              <label className="block text-sm font-semibold text-gray-700">รหัสรถ (Vehicle ID)</label>
              <div className="flex gap-3">
                <input
                  type="text"
                  value={vehicleIdInput}
                  onChange={(e) => setVehicleIdInput(e.target.value)}
                  placeholder="กรอกเลข ID แล้วกด Enter หรือปุ่มค้นหา"
                  className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
                <button
                  type="submit"
                  className="px-4 py-2.5 bg-gray-900 text-white rounded-xl font-semibold text-sm"
                >
                  ค้นหา
                </button>
              </div>
              <p className="text-xs text-gray-500">ปล่อยว่างเพื่อดูทุกคัน</p>
            </form>

            <div className="space-y-2">
              <label className="block text-sm font-semibold text-gray-700">ค้นหาอย่างรวดเร็ว</label>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="ค้นหาทะเบียน ยี่ห้อ รุ่น หรือผู้ใช้ที่แก้ไข"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
              />
              <p className="text-xs text-gray-500">เป็นการค้นหาในผลลัพธ์ที่โหลดมาแล้ว</p>
            </div>
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4">
              <p className="text-sm text-gray-500">จำนวนบันทึกทั้งหมด</p>
              <p className="text-2xl font-bold text-gray-900">{pagination.total.toLocaleString()}</p>
            </div>
            <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4">
              <p className="text-sm text-gray-500">โหลดมาแล้ว</p>
              <p className="text-2xl font-bold text-gray-900">{logs.length.toLocaleString()} รายการ</p>
            </div>
            <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4">
              <p className="text-sm text-gray-500">ตัวกรองรถ ID</p>
              <p className="text-2xl font-bold text-gray-900">{activeVehicleId || 'ทั้งหมด'}</p>
            </div>
          </div>

          {lastUpdated && (
            <p className="text-sm text-gray-500 text-right">
              อัปเดตล่าสุด: <span className="font-semibold text-gray-900">{formatDateTime(lastUpdated)}</span>
            </p>
          )}
        </div>

        {filteredLogs.length === 0 ? (
          <div className="bg-white rounded-2xl shadow p-10 text-center text-gray-500">
            ไม่พบบันทึกที่ตรงกับเงื่อนไข
          </div>
        ) : viewMode === 'table' ? (
          <div className="bg-white shadow-md border border-gray-300 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-300 text-[14px] sm:text-[15px]">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="px-4 py-3 text-left font-bold text-slate-800 border-b border-slate-300 whitespace-nowrap">วันเวลา</th>
                    <th className="px-4 py-3 text-left font-bold text-slate-800 border-b border-slate-300 whitespace-nowrap">ทะเบียน</th>
                    <th className="px-4 py-3 text-left font-bold text-slate-800 border-b border-slate-300 whitespace-nowrap">การดำเนินการ</th>
                    <th className="px-4 py-3 text-left font-bold text-slate-800 border-b border-slate-300 whitespace-nowrap">ช่องข้อมูล</th>
                    <th className="px-4 py-3 text-left font-bold text-slate-800 border-b border-slate-300 min-w-[150px]">ค่าเดิม</th>
                    <th className="px-4 py-3 text-left font-bold text-slate-800 border-b border-slate-300 min-w-[150px]">ค่าใหม่</th>
                    <th className="px-4 py-3 text-left font-bold text-slate-800 border-b border-slate-300 whitespace-nowrap">ผู้แก้ไข</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {filteredLogs.flatMap((log) => {
                    const changedEntries = Object.entries(log.changed_fields || {});
                    const createdAt = formatDateTime(log.created_at);
                    const licensePlate = log.current_vehicle?.license_plate || 'ไม่ทราบทะเบียน';
                    const actionStyle = ACTION_STYLES[log.action] || { label: log.action };
                    const userText = log.performed_by?.username || 'ระบบ';

                    if (changedEntries.length === 0) {
                      return (
                        <tr key={`${log.id}-empty`} className="hover:bg-blue-50 transition-colors">
                          <td className="px-4 py-3 text-gray-800 border-b border-gray-200">{createdAt}</td>
                          <td className="px-4 py-3 font-bold text-blue-700 border-b border-gray-200">{licensePlate}</td>
                          <td className="px-4 py-3 text-gray-700 border-b border-gray-200">{actionStyle.label}</td>
                          <td colSpan="3" className="px-4 py-3 text-gray-500 italic text-center border-b border-gray-200">ไม่มีข้อมูลการเปลี่ยนแปลง</td>
                          <td className="px-4 py-3 text-gray-800 border-b border-gray-200">{userText}</td>
                        </tr>
                      );
                    }

                    return changedEntries.map(([fieldKey, change], idx) => (
                      <tr key={`${log.id}-${fieldKey}`} className="hover:bg-blue-50 transition-colors">
                        <td className="px-4 py-3 text-gray-800 border-b border-gray-200">{createdAt}</td>
                        <td className="px-4 py-3 font-bold text-blue-700 border-b border-gray-200">{licensePlate}</td>
                        <td className="px-4 py-3 text-gray-700 border-b border-gray-200">{actionStyle.label}</td>
                        <td className="px-4 py-3 font-semibold text-gray-900 border-b border-gray-200">{getFieldLabel(fieldKey)}</td>
                        <td className="px-4 py-3 text-gray-500 bg-red-50/20 border-b border-gray-200">
                          <span className="line-through">{formatValue(change.before)}</span>
                        </td>
                        <td className="px-4 py-3 font-bold text-emerald-700 bg-emerald-50/20 border-b border-gray-200">
                          {formatValue(change.after)}
                        </td>
                        <td className="px-4 py-3 text-gray-800 border-b border-gray-200">{userText}</td>
                      </tr>
                    ));
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {filteredLogs.map((log) => {
              const actionStyle = ACTION_STYLES[log.action] || { label: log.action, badge: 'bg-gray-100 text-gray-600' };
              const changedEntries = Object.entries(log.changed_fields || {});
              const createdAt = formatDateTime(log.created_at);

              return (
                <div key={log.id} className="bg-white rounded-2xl shadow border border-gray-100 p-5">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                    <div>
                      <div className="flex items-center gap-3">
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${actionStyle.badge}`}>
                          {actionStyle.label}
                        </span>
                        <span className="text-sm text-gray-500">#{log.id}</span>
                      </div>
                      <p className="text-lg font-semibold text-gray-900 mt-1">
                        {log.current_vehicle?.license_plate || 'ไม่ทราบทะเบียน'}
                      </p>
                      <p className="text-sm text-gray-500">
                        {log.current_vehicle?.brand || '-'} {log.current_vehicle?.model || ''} · โซน {log.current_vehicle?.zone || '-'}
                      </p>
                    </div>
                    <div className="text-sm text-gray-500">
                      <p>เวลา: <span className="font-semibold text-gray-900">{createdAt}</span></p>
                      <p>
                        โดย: <span className="font-semibold text-gray-900">{log.performed_by?.username || 'ระบบ'}</span>
                        {log.performed_by?.role && (
                          <span className="ml-2 px-2 py-0.5 bg-gray-100 rounded-full text-xs text-gray-600">
                            {log.performed_by.role}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  {changedEntries.length > 0 ? (
                    <div className="grid gap-4 sm:grid-cols-2">
                      {changedEntries.map(([fieldKey, change]) => (
                        <div
                          key={fieldKey}
                          className="border-2 border-red-200 rounded-2xl p-4 bg-red-50/50 shadow-inner"
                        >
                          <p className="text-sm font-semibold text-red-700">
                            {getFieldLabel(fieldKey)}
                          </p>
                          <div className="mt-1 text-xs text-gray-600">
                            เดิม: <span className="line-through text-gray-500">{formatValue(change.before)}</span>
                          </div>
                          <div className="mt-1 text-sm text-gray-900">
                            ใหม่: <span className="font-semibold">{formatValue(change.after)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">ไม่มีข้อมูลฟิลด์ที่เปลี่ยนแปลงในบันทึกนี้</p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {pagination.offset < pagination.total && (
          <div className="text-center">
            <button
              onClick={handleLoadMore}
              disabled={fetchingMore}
              className="px-6 py-3 bg-gray-900 hover:bg-gray-800 text-white rounded-2xl font-semibold shadow disabled:opacity-50"
            >
              {fetchingMore ? 'กำลังโหลด...' : 'โหลดเพิ่มเติม'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
