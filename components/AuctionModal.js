import { useState, useCallback, useEffect } from 'react';
import { vehicleApi } from '../lib/api';
import { useDialog } from './DialogProvider';
import { toDateTimeInputValue, fromDateTimeInputValue } from '../lib/datetime';

export default function AuctionModal({ vehicle, onClose, onSuccess }) {
  const [auctionData, setAuctionData] = useState({
    auction_name: vehicle?.auction_name || '',
    auction_notes: vehicle?.auction_notes || ''
  });
  const [loading, setLoading] = useState(false);
  const isInAuction = !!(vehicle?.in_auction);
  const [entryDate, setEntryDate] = useState(() => toDateTimeInputValue(vehicle?.auction_entry_time || new Date()));
  const { alert: showDialog, confirm: showConfirm } = useDialog();
  const notify = useCallback((message, options = {}) => showDialog({ confirmText: 'รับทราบ', icon: 'ℹ️', ...options, message }), [showDialog]);
  const confirmAction = useCallback((message, options = {}) => showConfirm({ confirmText: 'ยืนยัน', cancelText: 'ยกเลิก', icon: '❓', ...options, message }), [showConfirm]);

  useEffect(() => {
    setEntryDate(toDateTimeInputValue(vehicle?.auction_entry_time || new Date()));
  }, [vehicle?.auction_entry_time]);

  const handleSendToAuction = async () => {
    if (!auctionData.auction_name.trim()) {
      notify('กรุณากรอกชื่อลานประมูล', { title: 'กรอกข้อมูลไม่ครบ', variant: 'warning', icon: '🏷️' });
      return;
    }

    setLoading(true);
    try {
      const entry_time = fromDateTimeInputValue(entryDate);
      if (isInAuction) {
        // Update existing auction info
        await vehicleApi.updateAuctionInfo(vehicle.id, { ...auctionData, entry_time });
      } else {
        // Send to auction
        await vehicleApi.sendToAuction(vehicle.id, { ...auctionData, entry_time });
      }
      onSuccess?.();
      onClose();
    } catch (error) {
      console.error('Auction operation failed:', error);
      notify(error.message || 'เกิดข้อผิดพลาดในการดำเนินการ', { title: 'บันทึกไม่สำเร็จ', variant: 'danger', icon: '⚠️' });
    } finally {
      setLoading(false);
    }
  };

  const handleReturnFromAuction = async () => {
    const confirmed = await confirmAction('ต้องการนำรถกลับจากลานประมูล?', {
      title: 'นำรถกลับจากประมูล',
      subtitle: 'รถจะถูกย้ายกลับมาที่ลานจอดหลัก',
      variant: 'info',
      icon: '🔁'
    });
    if (!confirmed) return;

    setLoading(true);
    try {
      await vehicleApi.returnFromAuction(vehicle.id);
      onSuccess?.();
      onClose();
    } catch (error) {
      console.error('Return from auction failed:', error);
      notify(error.message || 'เกิดข้อผิดพลาดในการนำรถกลับ', { title: 'ดำเนินการไม่สำเร็จ', variant: 'danger', icon: '⚠️' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[95vh] sm:max-h-[90vh] overflow-hidden flex flex-col">
        <div className="bg-gradient-to-r from-purple-500 to-pink-600 p-4 sm:p-6 text-white flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold">
                {isInAuction ? 'แก้ไขข้อมูลลานประมูล' : 'ส่งรถเข้าลานประมูล'}
              </h2>
              <p className="text-purple-100 text-xs sm:text-sm">{vehicle.license_plate}</p>
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
              🏛️ ชื่อลานประมูล *
            </label>
            <input
              type="text"
              value={auctionData.auction_name}
              onChange={(e) => setAuctionData(prev => ({ ...prev, auction_name: e.target.value }))}
              className="w-full px-3 sm:px-4 py-2 sm:py-3 text-sm sm:text-base border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-400 focus:border-purple-400 outline-none"
              placeholder="เช่น ลานประมูลกลาง, Bangkok Auction"
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-2">
              📝 รายละเอียด
            </label>
            <textarea
              value={auctionData.auction_notes}
              onChange={(e) => setAuctionData(prev => ({ ...prev, auction_notes: e.target.value }))}
              rows={3}
              className="w-full px-3 sm:px-4 py-2 sm:py-3 text-sm sm:text-base border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-400 focus:border-purple-400 outline-none resize-none"
              placeholder="เช่น ประมูลวันที่ 15/01/2025, ราคาเริ่มต้น 500,000..."
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-2">
              📅 วันที่เข้าประมูล
            </label>
            <input
              type="datetime-local"
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
              className="w-full px-3 sm:px-4 py-2 sm:py-3 text-sm sm:text-base border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-400 focus:border-purple-400 outline-none"
              disabled={loading}
              step="60"
            />
            <p className="mt-1 text-xs text-gray-500">ถ้าไม่เลือก ระบบจะตั้งเป็นเวลาปัจจุบัน</p>
          </div>

          {isInAuction && vehicle.auction_entry_time && (() => {
            const formatTimestamp = (timestamp) => {
              if (!timestamp) return 'ไม่ระบุ';
              
              try {
                // Try parsing as ISO string first
                let date = new Date(timestamp);
                
                // If invalid, check if it's a number
                if (isNaN(date.getTime())) {
                  const num = parseFloat(timestamp);
                  if (!isNaN(num)) {
                    // If it's a small number (< 100000), it's likely Excel serial date
                    if (num < 100000) {
                      // Convert Excel serial date to JavaScript Date
                      date = new Date((num - 25569) * 86400 * 1000);
                    } else {
                      // It's a Unix timestamp
                      date = new Date(num);
                    }
                  }
                }
                
                // Format the date
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
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-2 sm:p-3">
                <p className="text-xs sm:text-sm text-purple-800">
                  <span className="font-semibold">เข้าลานประมูลเมื่อ:</span>{' '}
                  {formatTimestamp(vehicle.auction_entry_time)}
                </p>
              </div>
            );
          })()}
        </div>

        <div className="border-t border-gray-200 p-3 sm:p-6 bg-gray-50 flex gap-2 sm:gap-3 flex-shrink-0 flex-wrap">
          {isInAuction ? (
            <>
              <button
                onClick={handleSendToAuction}
                disabled={loading}
                className="flex-1 min-w-[120px] px-3 sm:px-6 py-2.5 sm:py-3 text-sm sm:text-base bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 text-white rounded-xl font-semibold shadow-lg disabled:opacity-50"
              >
                {loading ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}
              </button>
              <button
                onClick={handleReturnFromAuction}
                disabled={loading}
                className="px-3 sm:px-6 py-2.5 sm:py-3 text-sm sm:text-base bg-green-500 hover:bg-green-600 text-white rounded-xl font-semibold shadow-lg disabled:opacity-50"
              >
                นำกลับจากลานประมูล
              </button>
            </>
          ) : (
            <button
              onClick={handleSendToAuction}
              disabled={loading}
              className="flex-1 min-w-[120px] px-3 sm:px-6 py-2.5 sm:py-3 text-sm sm:text-base bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 text-white rounded-xl font-semibold shadow-lg disabled:opacity-50"
            >
              {loading ? 'กำลังส่ง...' : 'ส่งเข้าลานประมูล'}
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
