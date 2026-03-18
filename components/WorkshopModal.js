import { useState, useCallback, useEffect } from 'react';
import { vehicleApi } from '../lib/api';
import { useDialog } from './DialogProvider';
import { toDateTimeInputValue, fromDateTimeInputValue } from '../lib/datetime';

export default function WorkshopModal({ vehicle, onClose, onSuccess }) {
  const [workshopData, setWorkshopData] = useState({
    workshop_name: vehicle?.workshop_name || '',
    workshop_notes: vehicle?.workshop_notes || ''
  });
  const [entryDate, setEntryDate] = useState(() => toDateTimeInputValue(vehicle?.workshop_entry_time || new Date()));
  const [loading, setLoading] = useState(false);
  const { alert: showDialog, confirm: showConfirm } = useDialog();
  const notify = useCallback((message, options = {}) => showDialog({ confirmText: 'รับทราบ', icon: 'ℹ️', ...options, message }), [showDialog]);
  const confirmAction = useCallback((message, options = {}) => showConfirm({ confirmText: 'ยืนยัน', cancelText: 'ยกเลิก', icon: '❓', ...options, message }), [showConfirm]);

  useEffect(() => {
    setEntryDate(toDateTimeInputValue(vehicle?.workshop_entry_time || new Date()));
  }, [vehicle?.workshop_entry_time]);

  const handleSendToWorkshop = async () => {
    if (!workshopData.workshop_name.trim()) {
      notify('กรุณากรอกชื่ออู่', { title: 'กรอกข้อมูลไม่ครบ', variant: 'warning', icon: '🏷️' });
      return;
    }

    setLoading(true);
    try {
      const entry_time = fromDateTimeInputValue(entryDate);
      if (vehicle.in_workshop) {
        // Update existing workshop info
        await vehicleApi.updateWorkshopInfo(vehicle.id, { ...workshopData, entry_time });
      } else {
        // Send to workshop
        await vehicleApi.sendToWorkshop(vehicle.id, { ...workshopData, entry_time });
      }
      onSuccess?.();
      onClose();
    } catch (error) {
      console.error('Workshop operation failed:', error);
      notify(error.message || 'เกิดข้อผิดพลาดในการดำเนินการ', { title: 'บันทึกไม่สำเร็จ', variant: 'danger', icon: '⚠️' });
    } finally {
      setLoading(false);
    }
  };

  const handleReturnFromWorkshop = async () => {
    const confirmed = await confirmAction('ต้องการนำรถกลับจากอู่?', {
      title: 'นำรถกลับจากอู่',
      subtitle: 'รถจะถูกย้ายกลับมาที่ลานจอด',
      variant: 'info',
      icon: '🔁'
    });
    if (!confirmed) return;

    setLoading(true);
    try {
      await vehicleApi.returnFromWorkshop(vehicle.id);
      onSuccess?.();
      onClose();
    } catch (error) {
      console.error('Return from workshop failed:', error);
      notify(error.message || 'เกิดข้อผิดพลาดในการนำรถกลับ', { title: 'ดำเนินการไม่สำเร็จ', variant: 'danger', icon: '⚠️' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[95vh] sm:max-h-[90vh] overflow-hidden flex flex-col">
        <div className="bg-gradient-to-r from-orange-500 to-red-600 p-4 sm:p-6 text-white flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold">
                {vehicle.in_workshop ? 'แก้ไขข้อมูลอู่' : 'ส่งรถเข้าอู่'}
              </h2>
              <p className="text-orange-100 text-xs sm:text-sm">{vehicle.license_plate}</p>
            </div>
            <button
              onClick={onClose}
              className="w-10 h-10 hover:bg-white/20 rounded-full flex items-center justify-center"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-3 sm:p-6 space-y-3 sm:space-y-4 overflow-y-auto flex-1">
          <div>
            <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-2">
              🔧 ชื่ออู่ *
            </label>
            <input
              type="text"
              value={workshopData.workshop_name}
              onChange={(e) => setWorkshopData(prev => ({ ...prev, workshop_name: e.target.value }))}
              className="w-full px-3 sm:px-4 py-2 sm:py-3 text-sm sm:text-base border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-400 focus:border-orange-400 outline-none"
              placeholder="เช่น อู่ช่างโต้ง, Toyota Service Center"
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-2">
              📝 รายละเอียด
            </label>
            <textarea
              value={workshopData.workshop_notes}
              onChange={(e) => setWorkshopData(prev => ({ ...prev, workshop_notes: e.target.value }))}
              rows={3}
              className="w-full px-3 sm:px-4 py-2 sm:py-3 text-sm sm:text-base border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-400 focus:border-orange-400 outline-none resize-none"
              placeholder="เช่น เข้าซ่อมเครื่อง, เปลี่ยนยาง, ตรวจเช็คระยะ..."
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-2">
              📅 วันที่เข้าอู่
            </label>
            <input
              type="datetime-local"
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
              className="w-full px-3 sm:px-4 py-2 sm:py-3 text-sm sm:text-base border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-400 focus:border-orange-400 outline-none"
              disabled={loading}
              step="60"
            />
            <p className="mt-1 text-xs text-gray-500">หากไม่ระบุ ระบบจะใช้วันและเวลาปัจจุบัน</p>
          </div>

          {vehicle.in_workshop && vehicle.workshop_entry_time && vehicle.workshop_entry_time !== 0 ? (() => {
            const formatTimestamp = (timestamp) => {
              if (!timestamp || timestamp === 0) return 'ไม่ระบุ';
              
              // Check if it's a number (Excel serial date or Unix timestamp)
              const num = parseFloat(timestamp);
              if (!isNaN(num) && num !== 0) {
                // If it's a small number (< 100000), it's Excel serial date
                if (num < 100000) {
                  // Convert Excel serial date to JavaScript Date
                  // Excel epoch is 1899-12-30 (with 1900 leap year bug)
                  const date = new Date((num - 25569) * 86400 * 1000);
                  return date.toLocaleString('th-TH', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  });
                }
              }
              
              // Try to parse as regular date string
              try {
                const date = new Date(timestamp);
                if (!isNaN(date.getTime())) {
                  return date.toLocaleString('th-TH', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  });
                }
              } catch (e) {
                console.error('Error formatting timestamp:', e);
              }
              
              return 'รูปแบบวันที่ไม่ถูกต้อง';
            };
            
            return (
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-2 sm:p-3">
                <p className="text-xs sm:text-sm text-orange-800">
                  <span className="font-semibold">เข้าอู่เมื่อ:</span>{' '}
                  {formatTimestamp(vehicle.workshop_entry_time)}
                </p>
              </div>
            );
          })() : null}
        </div>

        <div className="border-t border-gray-200 p-3 sm:p-6 bg-gray-50 flex gap-2 sm:gap-3 flex-shrink-0 flex-wrap">
          {vehicle.in_workshop ? (
            <>
              <button
                onClick={handleSendToWorkshop}
                disabled={loading}
                className="flex-1 min-w-[120px] px-3 sm:px-6 py-2.5 sm:py-3 text-sm sm:text-base bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white rounded-xl font-semibold shadow-lg disabled:opacity-50"
              >
                {loading ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}
              </button>
              <button
                onClick={handleReturnFromWorkshop}
                disabled={loading}
                className="px-3 sm:px-6 py-2.5 sm:py-3 text-sm sm:text-base bg-green-500 hover:bg-green-600 text-white rounded-xl font-semibold shadow-lg disabled:opacity-50"
              >
                นำกลับจากอู่
              </button>
            </>
          ) : (
            <button
              onClick={handleSendToWorkshop}
              disabled={loading}
              className="flex-1 min-w-[120px] px-3 sm:px-6 py-2.5 sm:py-3 text-sm sm:text-base bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white rounded-xl font-semibold shadow-lg disabled:opacity-50"
            >
              {loading ? 'กำลังส่ง...' : 'ส่งเข้าอู่'}
            </button>
          )}
          <button
            onClick={onClose}
            disabled={loading}
            className="w-full sm:w-auto px-3 sm:px-6 py-2.5 sm:py-3 text-sm sm:text-base bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-xl font-semibold disabled:opacity-50"
          >
            ยกเลิก
          </button>
        </div>
      </div>
    </div>
  );
}
