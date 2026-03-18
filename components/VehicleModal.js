import { useState, useEffect, useCallback, useMemo } from 'react';
import { vehicleApi } from '../lib/api';
import { useDialog } from './DialogProvider';
import { useVehicleColumns } from './VehicleColumnsProvider';

const toDateTimeInputValue = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 16);
};

const fromDateTimeInputValue = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString();
};

export default function VehicleModal({ vehicle, onClose, onSave }) {
  const [formData, setFormData] = useState({
    parking_lot_number: '',
    parking_lot_name: '',
    zone: '',
    license_plate: '',
    province: '',
    brand: '',
    model: '',
    color: '',
    sequence_no: '',
    grade: '',
    rmo: '',
    cmo: '',
    note_summary: '',
    key_status: '',
    key_number: '',
    notes: '',
    transaction_type: '',
    document_status: '',
    gp_approval_status: '',
    policy_type: '',
    policy_amount: '',
    updated_date: '',
    start_time: ''
  });
  const [customFields, setCustomFields] = useState({});
  const [saving, setSaving] = useState(false);
  const { alert: showDialog } = useDialog();
  const notify = useCallback((message, options = {}) => showDialog({ confirmText: 'รับทราบ', icon: 'ℹ️', ...options, message }), [showDialog]);
  const { columns: columnMetadata = [] } = useVehicleColumns();
  const activeCustomColumns = useMemo(
    () => columnMetadata.filter((col) => col && col.is_active !== 0 && col.column_key && col.source !== 'system'),
    [columnMetadata]
  );

  useEffect(() => {
    if (vehicle) {
      setFormData({
        parking_lot_number: vehicle.parking_lot_number ?? '',
        parking_lot_name: vehicle.parking_lot_name || '',
        zone: vehicle.zone || '',
        license_plate: vehicle.license_plate || '',
        province: vehicle.province || '',
        brand: vehicle.brand || '',
        model: vehicle.model || '',
        color: vehicle.color || '',
        sequence_no: vehicle.sequence_no ?? '',
        grade: vehicle.grade || '',
        rmo: vehicle.rmo || '',
        cmo: vehicle.cmo || '',
        note_summary: vehicle.note_summary || '',
        key_status: vehicle.key_status || '',
        key_number: vehicle.key_number || '',
        notes: vehicle.notes || '',
        transaction_type: vehicle.transaction_type || '',
        document_status: vehicle.document_status || '',
        gp_approval_status: vehicle.gp_approval_status || '',
        policy_type: vehicle.policy_type || '',
        policy_amount: vehicle.policy_amount ?? '',
        updated_date: toDateTimeInputValue(vehicle.updated_date),
        start_time: toDateTimeInputValue(vehicle.start_time)
      });
      setCustomFields(vehicle.custom_fields || {});
    } else {
      setFormData({
        parking_lot_number: '',
        parking_lot_name: '',
        zone: '',
        license_plate: '',
        province: '',
        brand: '',
        model: '',
        color: '',
        sequence_no: '',
        grade: '',
        rmo: '',
        cmo: '',
        note_summary: '',
        key_status: '',
        key_number: '',
        notes: '',
        transaction_type: '',
        document_status: '',
        gp_approval_status: '',
        policy_type: '',
        policy_amount: '',
        updated_date: '',
        start_time: ''
      });
      setCustomFields({});
    }
  }, [vehicle]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const plate = formData.license_plate.trim();
    if (!plate) {
      notify('กรุณากรอกทะเบียนรถ', { title: 'กรอกข้อมูลไม่ครบ', variant: 'warning', icon: '🪪' });
      return;
    }

    if (formData.parking_lot_number === '') {
      notify('กรุณากรอกหมายเลขลานจอด', { title: 'กรอกข้อมูลไม่ครบ', variant: 'warning', icon: '📍' });
      return;
    }

    const parsedLot = parseInt(formData.parking_lot_number, 10);
    if (Number.isNaN(parsedLot)) {
      notify('หมายเลขลานจอดไม่ถูกต้อง', { title: 'ข้อมูลไม่ถูกต้อง', variant: 'warning', icon: '❗' });
      return;
    }

    const parsedSequence = formData.sequence_no === '' ? null : parseInt(formData.sequence_no, 10);
    if (parsedSequence !== null && Number.isNaN(parsedSequence)) {
      notify('ลำดับต้องเป็นตัวเลข', { title: 'ข้อมูลไม่ถูกต้อง', variant: 'warning', icon: '🔢' });
      return;
    }

    const parsedPolicyAmount = formData.policy_amount === '' ? null : Number(formData.policy_amount);
    if (formData.policy_amount !== '' && (parsedPolicyAmount === null || Number.isNaN(parsedPolicyAmount))) {
      notify('ทุนประกันต้องเป็นตัวเลข', { title: 'ข้อมูลไม่ถูกต้อง', variant: 'warning', icon: '💰' });
      return;
    }

    const updatedDateValue = fromDateTimeInputValue(formData.updated_date);
    const startTimeValue = fromDateTimeInputValue(formData.start_time) || vehicle?.start_time || new Date().toISOString();

    setSaving(true);

    try {
      const payload = {
        parking_lot_number: parsedLot,
        parking_lot_name: formData.parking_lot_name.trim(),
        zone: formData.zone.trim(),
        license_plate: plate,
        province: formData.province.trim(),
        brand: formData.brand.trim(),
        model: formData.model.trim(),
        color: formData.color.trim(),
        sequence_no: parsedSequence,
        grade: formData.grade.trim(),
        rmo: formData.rmo.trim(),
        cmo: formData.cmo.trim(),
        note_summary: formData.note_summary.trim(),
        key_status: formData.key_status.trim(),
        key_number: formData.key_number.trim(),
        notes: formData.notes.trim(),
        transaction_type: formData.transaction_type.trim(),
        document_status: formData.document_status.trim(),
        gp_approval_status: formData.gp_approval_status.trim(),
        policy_type: formData.policy_type.trim(),
        policy_amount: parsedPolicyAmount,
        updated_date: updatedDateValue,
        start_time: startTimeValue,
        custom_fields: activeCustomColumns.length
          ? activeCustomColumns.reduce((acc, column) => {
              const value = customFields[column.column_key];
              acc[column.column_key] = value == null ? '' : String(value);
              return acc;
            }, {})
          : undefined
      };

      if (vehicle) {
        await vehicleApi.update(vehicle.id, payload);
      } else {
        await vehicleApi.create(payload);
      }
      onSave();
    } catch (error) {
      notify('เกิดข้อผิดพลาดในการบันทึกข้อมูล', { title: 'บันทึกไม่สำเร็จ', variant: 'danger', icon: '⚠️' });
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleCustomFieldChange = (key, value) => {
    setCustomFields((prev) => ({ ...prev, [key]: value }));
  };

  const renderCustomFieldInput = (column) => {
    const value = customFields[column.column_key] ?? '';
    const commonProps = {
      className: 'w-full px-3 sm:px-4 py-2 sm:py-2.5 text-sm sm:text-base border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none transition-all'
    };

    if (column.type === 'number') {
      return (
        <input
          type="number"
          value={value}
          onChange={(e) => handleCustomFieldChange(column.column_key, e.target.value)}
          {...commonProps}
        />
      );
    }

    if (column.type === 'boolean') {
      return (
        <select
          value={value === '' ? '' : value === '1' || value === true ? '1' : '0'}
          onChange={(e) => handleCustomFieldChange(column.column_key, e.target.value)}
          {...commonProps}
        >
          <option value="">-</option>
          <option value="1">ใช่</option>
          <option value="0">ไม่ใช่</option>
        </select>
      );
    }

    if (column.type === 'datetime') {
      return (
        <input
          type="datetime-local"
          value={value}
          onChange={(e) => handleCustomFieldChange(column.column_key, e.target.value)}
          {...commonProps}
        />
      );
    }

    return (
      <input
        type="text"
        value={value}
        onChange={(e) => handleCustomFieldChange(column.column_key, e.target.value)}
        {...commonProps}
      />
    );
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 z-50">
      <div className="bg-white rounded-xl sm:rounded-2xl shadow-2xl w-full max-w-[95vw] sm:max-w-3xl lg:max-w-4xl max-h-[95vh] sm:max-h-[90vh] overflow-hidden flex flex-col">
        <div className="bg-gradient-to-r from-blue-500 to-indigo-600 p-4 sm:p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold">{vehicle ? 'แก้ไขข้อมูลรถ' : 'เพิ่มรถใหม่'}</h2>
              {vehicle && vehicle.license_plate && (
                <p className="text-blue-100 text-xs sm:text-sm mt-1">{vehicle.license_plate}</p>
              )}
            </div>
            <button
              onClick={onClose}
              className="w-10 h-10 hover:bg-white/20 rounded-full flex items-center justify-center transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                หมายเลขลานจอด *
              </label>
              <input
                type="number"
                name="parking_lot_number"
                value={formData.parking_lot_number}
                onChange={handleChange}
                required
                min="0"
                className="w-full px-3 sm:px-4 py-2 sm:py-2.5 text-sm sm:text-base border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none transition-all"
                placeholder="3"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                ลำดับ (Sequence)
              </label>
              <input
                type="number"
                name="sequence_no"
                value={formData.sequence_no}
                onChange={handleChange}
                className="w-full px-3 sm:px-4 py-2 sm:py-2.5 text-sm sm:text-base border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none transition-all"
                placeholder="1"
                min="1"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                ชื่อลานจอด
              </label>
              <input
                type="text"
                name="parking_lot_name"
                value={formData.parking_lot_name}
                onChange={handleChange}
                className="w-full px-3 sm:px-4 py-2 sm:py-2.5 text-sm sm:text-base border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none transition-all"
                placeholder="สะพานสูงเทคโน(Motto)"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                โซนจอดรถ
              </label>
              <input
                type="text"
                name="zone"
                value={formData.zone}
                onChange={handleChange}
                className="w-full px-3 sm:px-4 py-2 sm:py-2.5 text-sm sm:text-base border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none transition-all"
                placeholder="A1"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                เกรด
              </label>
              <input
                type="text"
                name="grade"
                value={formData.grade}
                onChange={handleChange}
                className="w-full px-3 sm:px-4 py-2 sm:py-2.5 text-sm sm:text-base border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none transition-all"
                placeholder="A, B, Premium ฯลฯ"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  RMO
                </label>
                <input
                  type="text"
                  name="rmo"
                  value={formData.rmo}
                  onChange={handleChange}
                  className="w-full px-3 sm:px-4 py-2 sm:py-2.5 text-sm sm:text-base border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none transition-all"
                  placeholder="ระบุ RMO"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  CMO
                </label>
                <input
                  type="text"
                  name="cmo"
                  value={formData.cmo}
                  onChange={handleChange}
                  className="w-full px-3 sm:px-4 py-2 sm:py-2.5 text-sm sm:text-base border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none transition-all"
                  placeholder="ระบุ CMO"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                เลขทะเบียน *
              </label>
              <input
                type="text"
                name="license_plate"
                value={formData.license_plate}
                onChange={handleChange}
                required
                className="w-full px-3 sm:px-4 py-2 sm:py-2.5 text-sm sm:text-base border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none transition-all"
                placeholder="กก-1234"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                จังหวัด
              </label>
              <input
                type="text"
                name="province"
                value={formData.province}
                onChange={handleChange}
                className="w-full px-3 sm:px-4 py-2 sm:py-2.5 text-sm sm:text-base border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none transition-all"
                placeholder="กรุงเทพ"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                ยี่ห้อ
              </label>
              <input
                type="text"
                name="brand"
                value={formData.brand}
                onChange={handleChange}
                className="w-full px-3 sm:px-4 py-2 sm:py-2.5 text-sm sm:text-base border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none transition-all"
                placeholder="TOYOTA"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                รุ่นรถ
              </label>
              <input
                type="text"
                name="model"
                value={formData.model}
                onChange={handleChange}
                className="w-full px-3 sm:px-4 py-2 sm:py-2.5 text-sm sm:text-base border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none transition-all"
                placeholder="Camry"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                สีรถ
              </label>
              <input
                type="text"
                name="color"
                value={formData.color}
                onChange={handleChange}
                className="w-full px-3 sm:px-4 py-2 sm:py-2.5 text-sm sm:text-base border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none transition-all"
                placeholder="ขาว"
              />
            </div>

            <div>
              <label className="block text-sm script font-medium text-gray-700 mb-2">
                ประเภทรายการ
              </label>
              <input
                type="text"
                name="transaction_type"
                value={formData.transaction_type}
                onChange={handleChange}
                className="w-full px-3 sm:px-4 py-2 sm:py-2.5 text-sm sm:text-base border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none transition-all"
                placeholder="เช่น รับเข้า, โอนย้าย"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                สถานะเอกสาร
              </label>
              <input
                type="text"
                name="document_status"
                value={formData.document_status}
                onChange={handleChange}
                className="w-full px-3 sm:px-4 py-2 sm:py-2.5 text-sm sm:text-base border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none transition-all"
                placeholder="เช่น ครบถ้วน / รอเอกสาร"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                สถานะการอนุมัติ (GP)
              </label>
              <input
                type="text"
                name="gp_approval_status"
                value={formData.gp_approval_status}
                onChange={handleChange}
                className="w-full px-3 sm:px-4 py-2 sm:py-2.5 text-sm sm:text-base border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none transition-all"
                placeholder="เช่น อนุมัติแล้ว"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                ประเภทกรมธรรม์
              </label>
              <input
                type="text"
                name="policy_type"
                value={formData.policy_type}
                onChange={handleChange}
                className="w-full px-3 sm:px-4 py-2 sm:py-2.5 text-sm sm:text-base border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none transition-all"
                placeholder="ประเภทกรมธรรม์"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                ทุนประกัน (บาท)
              </label>
              <input
                type="number"
                step="any"
                name="policy_amount"
                value={formData.policy_amount}
                onChange={handleChange}
                className="w-full px-3 sm:px-4 py-2 sm:py-2.5 text-sm sm:text-base border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none transition-all"
                placeholder="0"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                วันที่ (อัปเดต)
              </label>
              <input
                type="datetime-local"
                name="updated_date"
                value={formData.updated_date}
                onChange={handleChange}
                className="w-full px-3 sm:px-4 py-2 sm:py-2.5 text-sm sm:text-base border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                วันที่ย้ายรถ
              </label>
              <input
                type="datetime-local"
                name="start_time"
                value={formData.start_time}
                onChange={handleChange}
                className="w-full px-3 sm:px-4 py-2 sm:py-2.5 text-sm sm:text-base border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                สถานะกุญแจ
              </label>
              <input
                type="text"
                name="key_status"
                value={formData.key_status}
                onChange={handleChange}
                className="w-full px-3 sm:px-4 py-2 sm:py-2.5 text-sm sm:text-base border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none transition-all"
                placeholder="มี, ไม่มี, เปิดประตูไม่ได้"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                เลขกุญแจ
              </label>
              <input
                type="text"
                name="key_number"
                value={formData.key_number}
                onChange={handleChange}
                className="w-full px-3 sm:px-4 py-2 sm:py-2.5 text-sm sm:text-base border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none transition-all"
                placeholder="เลขกุญแจ"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                หมายเหตุย่อ (Note Summary)
              </label>
              <input
                type="text"
                name="note_summary"
                value={formData.note_summary}
                onChange={handleChange}
                className="w-full px-3 sm:px-4 py-2 sm:py-2.5 text-sm sm:text-base border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none transition-all"
                placeholder="ข้อความสั้น ๆ เช่น สภาพพร้อมใช้"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                หมายเหตุ
              </label>
              <textarea
                name="notes"
                value={formData.notes}
                onChange={handleChange}
                rows={3}
                className="w-full px-3 sm:px-4 py-2 sm:py-2.5 text-sm sm:text-base border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none transition-all"
                placeholder="หมายเหตุเพิ่มเติม..."
              />
            </div>
          </div>

          {activeCustomColumns.length > 0 && (
            <div className="mt-6 border-t border-gray-200 pt-4">
              <h3 className="text-base font-semibold text-gray-800 mb-3">ข้อมูลเพิ่มเติม</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                {activeCustomColumns.map((column) => (
                  <div key={column.column_key}>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {column.label}
                    </label>
                    {renderCustomFieldInput(column)}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-4 sm:mt-6 flex flex-col sm:flex-row justify-end gap-2 sm:gap-3">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto px-4 sm:px-6 py-2.5 sm:py-2 border-2 border-gray-300 rounded-lg text-sm sm:text-base text-gray-700 hover:bg-gray-50 font-semibold transition-all touch-manipulation"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={saving}
              className="w-full sm:w-auto px-4 sm:px-6 py-2.5 sm:py-2 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white rounded-lg text-sm sm:text-base font-semibold transition-all disabled:opacity-50 touch-manipulation"
            >
              {saving ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
