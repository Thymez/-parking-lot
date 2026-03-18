import { useEffect, useMemo, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/auth';
import { vehicleApi } from '../lib/api';
import { useVehicleColumns } from '../components/VehicleColumnsProvider';
import { useDialog } from '../components/DialogProvider';

const DEFAULT_FORM = {
  label: '',
  column_key: '',
  type: 'text',
  insert_before_key: '',
  is_active: true
};

export default function ColumnManagerPage() {
  const router = useRouter();
  const { user, loading, isAdmin } = useAuth();
  const { columns, refreshColumns, loading: columnLoading } = useVehicleColumns();
  const { alert: showDialog, confirm: showConfirm } = useDialog();
  const notify = useCallback((message, options = {}) => showDialog({ confirmText: 'รับทราบ', icon: 'ℹ️', ...options, message }), [showDialog]);
  const confirmAction = useCallback((message, options = {}) => showConfirm({ confirmText: 'ยืนยัน', cancelText: 'ยกเลิก', icon: '❓', ...options, message }), [showConfirm]);

  const [formData, setFormData] = useState(DEFAULT_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [updatingId, setUpdatingId] = useState(null);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (!isAdmin) {
      router.replace('/');
    }
  }, [user, loading, isAdmin, router]);

  const orderedColumns = useMemo(() => {
    return [...(columns || [])].sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
  }, [columns]);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleCreateColumn = async (e) => {
    e.preventDefault();
    if (!formData.label.trim() && !formData.column_key.trim()) {
      notify('กรุณาระบุชื่อคอลัมน์หรือคีย์อย่างน้อยหนึ่งอย่าง', { title: 'ข้อมูลไม่ครบ', variant: 'warning', icon: '📝' });
      return;
    }

    setSubmitting(true);
    try {
      await vehicleApi.createColumn({
        label: formData.label.trim(),
        column_key: formData.column_key.trim(),
        type: formData.type,
        insert_before_key: formData.insert_before_key || undefined,
        is_active: formData.is_active
      });
      setFormData(DEFAULT_FORM);
      notify('เพิ่มคอลัมน์ใหม่เรียบร้อย', { title: 'สำเร็จ', variant: 'success', icon: '✅' });
      refreshColumns();
    } catch (error) {
      console.error('Create column failed:', error);
      notify(error.message || 'ไม่สามารถเพิ่มคอลัมน์ได้', { title: 'ผิดพลาด', variant: 'danger', icon: '⚠️' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (column) => {
    setUpdatingId(column.id);
    try {
      await vehicleApi.updateColumn(column.id, { is_active: column.is_active ? 0 : 1 });
      refreshColumns();
    } catch (error) {
      console.error('Toggle column failed:', error);
      notify(error.message || 'ไม่สามารถอัปเดตสถานะได้', { title: 'ผิดพลาด', variant: 'danger', icon: '⚠️' });
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDelete = async (column) => {
    const confirmed = await confirmAction(`ต้องการลบคอลัมน์ "${column.label}" หรือไม่?`, {
      title: 'ยืนยันการลบคอลัมน์',
      subtitle: 'ข้อมูล custom fields ของคอลัมน์นี้จะถูกลบด้วย',
      variant: 'danger',
      icon: '🧨'
    });
    if (!confirmed) return;

    setUpdatingId(column.id);
    try {
      await vehicleApi.deleteColumn(column.id);
      refreshColumns();
      notify('ลบคอลัมน์เรียบร้อย', { title: 'สำเร็จ', variant: 'success', icon: '✅' });
    } catch (error) {
      console.error('Delete column failed:', error);
      notify(error.message || 'ไม่สามารถลบคอลัมน์ได้', { title: 'ผิดพลาด', variant: 'danger', icon: '⚠️' });
    } finally {
      setUpdatingId(null);
    }
  };

  if (loading || !isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto" />
          <p className="mt-4 text-gray-600">กำลังโหลด...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">จัดการคอลัมน์</h1>
            <p className="text-sm text-gray-600 mt-1">กำหนดฟิลด์ที่ใช้แสดงใน Table และ Export</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => router.push('/')}
              className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-100"
            >
              ⬅ กลับแดชบอร์ด
            </button>
            <button
              onClick={refreshColumns}
              className="px-4 py-2 bg-blue-50 text-blue-700 rounded-lg text-sm font-semibold hover:bg-blue-100"
            >
              รีเฟรชคอลัมน์
            </button>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="bg-white rounded-2xl shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">เพิ่มคอลัมน์ใหม่</h2>
            <form className="space-y-4" onSubmit={handleCreateColumn}>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">ชื่อที่แสดง *</label>
                <input
                  type="text"
                  name="label"
                  value={formData.label}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  placeholder="เช่น รุ่นย่อย"
                  required={!formData.column_key}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Column Key</label>
                <input
                  type="text"
                  name="column_key"
                  value={formData.column_key}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  placeholder="เว้นว่างเพื่อให้ระบบสร้างจากชื่อ"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">ชนิดข้อมูล</label>
                  <select
                    name="type"
                    value={formData.type}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-white"
                  >
                    <option value="text">ข้อความ</option>
                    <option value="number">ตัวเลข</option>
                    <option value="datetime">วันเวลา</option>
                    <option value="boolean">ใช่ / ไม่ใช่</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">แทรกก่อนคอลัมน์</label>
                  <select
                    name="insert_before_key"
                    value={formData.insert_before_key}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-white"
                  >
                    <option value="">วางท้ายรายการ</option>
                    {orderedColumns.map((col) => (
                      <option key={col.id} value={col.column_key}>
                        {col.label} ({col.column_key})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <label className="inline-flex items-center space-x-2 text-sm font-medium text-gray-700">
                <input
                  type="checkbox"
                  name="is_active"
                  checked={formData.is_active}
                  onChange={handleInputChange}
                  className="rounded text-blue-600 focus:ring-blue-500"
                />
                <span>เปิดใช้งานทันที</span>
              </label>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition disabled:opacity-60"
              >
                {submitting ? 'กำลังเพิ่ม...' : 'เพิ่มคอลัมน์'}
              </button>
            </form>
          </div>

          <div className="bg-white rounded-2xl shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-900">คอลัมน์ทั้งหมด</h2>
              {columnLoading && <span className="text-sm text-gray-500">กำลังโหลด...</span>}
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">ชื่อ</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden sm:table-cell">คีย์</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">ชนิด</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">สถานะ</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">การจัดการ</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200 text-sm">
                  {orderedColumns.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-gray-500">ยังไม่มีคอลัมน์</td>
                    </tr>
                  )}
                  {orderedColumns.map((column) => (
                    <tr key={column.id}>
                      <td className="px-4 py-3 font-semibold text-gray-900">
                        {column.label}
                        <div className="text-xs text-gray-400">{column.source === 'system' ? 'System' : 'Custom'}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-600 hidden sm:table-cell">{column.column_key}</td>
                      <td className="px-4 py-3 text-gray-600">{column.type}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${column.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-600'}`}>
                          {column.is_active ? 'เปิดใช้งาน' : 'ปิดอยู่'}
                        </span>
                      </td>
                      <td className="px-4 py-3 space-y-2">
                        <button
                          onClick={() => handleToggleActive(column)}
                          disabled={updatingId === column.id}
                          className="w-full px-3 py-2 rounded-lg text-xs font-semibold text-white bg-blue-500 hover:bg-blue-600 disabled:opacity-50"
                        >
                          {column.is_active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                        </button>
                        {column.source !== 'system' && (
                          <button
                            onClick={() => handleDelete(column)}
                            disabled={updatingId === column.id}
                            className="w-full px-3 py-2 rounded-lg text-xs font-semibold text-white bg-red-500 hover:bg-red-600 disabled:opacity-50"
                          >
                            ลบคอลัมน์
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
