import { useState, useCallback, useEffect } from 'react';
import { vehicleApi } from '../lib/api';
import { useDialog } from './DialogProvider';
import { toDateTimeInputValue, fromDateTimeInputValue } from '../lib/datetime';

export default function SaleModal({ vehicle, onClose, onSuccess }) {
  const [saleNotes, setSaleNotes] = useState(vehicle?.sale_notes || '');
  const [loading, setLoading] = useState(false);
  const isInSale = !!vehicle?.in_sale;
  const [entryDate, setEntryDate] = useState(() => toDateTimeInputValue(vehicle?.sale_entry_time || new Date()));
  const { alert: showDialog, confirm: showConfirm } = useDialog();
  const notify = useCallback((message, options = {}) => showDialog({ confirmText: 'รับทราบ', icon: 'ℹ️', ...options, message }), [showDialog]);
  const confirmAction = useCallback((message, options = {}) => showConfirm({ confirmText: 'ยืนยัน', cancelText: 'ยกเลิก', icon: '❓', ...options, message }), [showConfirm]);

  useEffect(() => {
    setEntryDate(toDateTimeInputValue(vehicle?.sale_entry_time || new Date()));
  }, [vehicle?.sale_entry_time]);

  const handleSendToSale = async () => {
    setLoading(true);
    try {
      const entry_time = fromDateTimeInputValue(entryDate);
      if (isInSale) {
        await vehicleApi.updateSaleInfo(vehicle.id, { sale_notes: saleNotes, entry_time });
        notify('บันทึกข้อมูลขายแล้ว', { title: 'อัปเดตเรียบร้อย', variant: 'success', icon: '✅' });
      } else {
        await vehicleApi.sendToSale(vehicle.id, { sale_notes: saleNotes, entry_time });
        notify('ส่งรถขายเรียบร้อย', { title: 'สำเร็จ', variant: 'success', icon: '✅' });
      }
      onSuccess?.();
      onClose();
    } catch (error) {
      console.error('Sale operation failed:', error);
      notify(error.message || 'เกิดข้อผิดพลาดในการดำเนินการ', { title: 'บันทึกไม่สำเร็จ', variant: 'danger', icon: '⚠️' });
    } finally {
      setLoading(false);
    }
  };

  const handleReturnFromSale = async () => {
    const confirmed = await confirmAction('ต้องการนำรถกลับจากการขาย?', {
      title: 'นำรถกลับจากการขาย',
      subtitle: 'รถจะกลับมาที่ลานปกติ',
      variant: 'info',
      icon: '🔁'
    });
    if (!confirmed) return;

    setLoading(true);
    try {
      await vehicleApi.returnFromSale(vehicle.id);
      notify('นำรถกลับจากการขายแล้ว', { title: 'สำเร็จ', variant: 'success', icon: '✅' });
      onSuccess?.();
      onClose();
    } catch (error) {
      console.error('Return from sale failed:', error);
      notify(error.message || 'เกิดข้อผิดพลาดในการนำรถกลับ', { title: 'ดำเนินการไม่สำเร็จ', variant: 'danger', icon: '⚠️' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[95vh] sm:max-h-[90vh] overflow-hidden flex flex-col">
        <div className="bg-gradient-to-r from-emerald-500 to-teal-600 p-4 sm:p-6 text-white flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold">
                {isInSale ? 'แก้ไขข้อมูลการขาย' : 'ส่งรถเข้าลานการขาย'}
              </h2>
              <p className="text-emerald-100 text-xs sm:text-sm">{vehicle.license_plate}</p>
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
              📝 หมายเหตุการขาย (ไม่บังคับ)
            </label>
            <textarea
              value={saleNotes}
              onChange={(e) => setSaleNotes(e.target.value)}
              rows={4}
              className="w-full px-3 sm:px-4 py-2 sm:py-3 text-sm sm:text-base border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 outline-none resize-none"
              placeholder="ระบุรายละเอียดเพิ่มเติม เช่น ผู้ติดต่อ, วันนัดหมาย, ราคาเสนอ ฯลฯ"
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-2">
              📅 วันที่เข้าสถานะขาย
            </label>
            <input
              type="datetime-local"
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
              className="w-full px-3 sm:px-4 py-2 sm:py-3 text-sm sm:text-base border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 outline-none"
              disabled={loading}
              step="60"
            />
            <p className="mt-1 text-xs text-gray-500">ค่าเริ่มต้นเป็นเวลาปัจจุบัน สามารถปรับย้อนไป-ล่วงหน้าได้</p>
          </div>

          {isInSale && vehicle.sale_entry_time && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2 sm:p-3">
              <p className="text-xs sm:text-sm text-emerald-800">
                <span className="font-semibold">เข้าการขายเมื่อ:</span>{' '}
                {new Date(vehicle.sale_entry_time).toLocaleString('th-TH', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </p>
            </div>
          )}
        </div>

        <div className="border-t border-gray-200 p-3 sm:p-6 bg-gray-50 flex gap-2 sm:gap-3 flex-shrink-0 flex-wrap">
          <button
            onClick={handleSendToSale}
            disabled={loading}
            className="flex-1 min-w-[120px] px-3 sm:px-6 py-2.5 sm:py-3 text-sm sm:text-base bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white rounded-xl font-semibold shadow-lg disabled:opacity-50"
          >
            {loading ? 'กำลังบันทึก...' : isInSale ? 'บันทึกการแก้ไข' : 'ส่งขาย'}
          </button>
          {isInSale && (
            <button
              onClick={handleReturnFromSale}
              disabled={loading}
              className="px-3 sm:px-6 py-2.5 sm:py-3 text-sm sm:text-base bg-green-500 hover:bg-green-600 text-white rounded-xl font-semibold shadow-lg disabled:opacity-50"
            >
              นำกลับจากการขาย
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
