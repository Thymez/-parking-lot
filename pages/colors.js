import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/auth';
import { useVehicleColors } from '../components/VehicleColorProvider';
import { vehicleColorApi } from '../lib/api';
import { useDialog } from '../components/DialogProvider';

const DEFAULT_PRESET_FORM = {
  name: '',
  hex: '#2563EB',
  description: '',
  is_active: true
};

export default function ColorManagerPage() {
  const router = useRouter();
  const { user, loading: authLoading, isAdmin } = useAuth();
  const { presets, loading: colorLoading, refreshColors } = useVehicleColors();
  const { alert: showDialog, confirm: showConfirm } = useDialog();
  const notify = useCallback((message, options = {}) => showDialog({ confirmText: 'รับทราบ', icon: 'ℹ️', ...options, message }), [showDialog]);

  const [suggestions, setSuggestions] = useState([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [selectedSuggestions, setSelectedSuggestions] = useState(new Set());
  const [assignPresetId, setAssignPresetId] = useState('');
  const [formData, setFormData] = useState(DEFAULT_PRESET_FORM);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingForm, setEditingForm] = useState({});
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (!isAdmin) {
      router.replace('/');
    }
  }, [user, authLoading, isAdmin, router]);

  const loadSuggestions = useCallback(async () => {
    try {
      setLoadingSuggestions(true);
      const data = await vehicleColorApi.getSuggestions();
      setSuggestions(data?.suggestions || []);
      setSelectedSuggestions(new Set());
    } catch (error) {
      console.error('Failed to load suggestions:', error);
      notify(error.message || 'ไม่สามารถโหลดรายการสีที่ยังไม่ถูกแม็ปได้', { title: 'ผิดพลาด', variant: 'danger', icon: '⚠️' });
    } finally {
      setLoadingSuggestions(false);
    }
  }, [notify]);

  useEffect(() => {
    loadSuggestions();
  }, [loadSuggestions]);

  const handleFormChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleCreatePreset = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      notify('กรุณาใส่ชื่อสี', { title: 'ข้อมูลไม่ครบ', variant: 'warning', icon: '📝' });
      return;
    }

    setCreating(true);
    try {
      await vehicleColorApi.create({
        name: formData.name.trim(),
        hex: formData.hex,
        description: formData.description.trim(),
        is_active: formData.is_active
      });
      setFormData(DEFAULT_PRESET_FORM);
      notify('เพิ่มสีเรียบร้อย', { title: 'สำเร็จ', variant: 'success', icon: '✅' });
      await refreshColors();
    } catch (error) {
      console.error('Create preset failed:', error);
      notify(error.message || 'ไม่สามารถเพิ่มสีได้', { title: 'ผิดพลาด', variant: 'danger', icon: '⚠️' });
    } finally {
      setCreating(false);
    }
  };

  const handleStartEdit = (preset) => {
    setEditingId(preset.id);
    setEditingForm({
      name: preset.name,
      hex: preset.hex,
      description: preset.description || '',
      is_active: !!preset.is_active
    });
  };

  const handleEditChange = (e) => {
    const { name, value, type, checked } = e.target;
    setEditingForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSaveEdit = async (presetId) => {
    try {
      await vehicleColorApi.update(presetId, {
        name: editingForm.name,
        hex: editingForm.hex,
        description: editingForm.description,
        is_active: editingForm.is_active
      });
      setEditingId(null);
      notify('อัปเดตสีเรียบร้อย', { title: 'สำเร็จ', variant: 'success', icon: '✅' });
      await refreshColors();
    } catch (error) {
      console.error('Update preset failed:', error);
      notify(error.message || 'ไม่สามารถอัปเดตสีได้', { title: 'ผิดพลาด', variant: 'danger', icon: '⚠️' });
    }
  };

  const handleDeletePreset = async (preset) => {
    const confirmed = await showConfirm({
      message: `ต้องการลบสี "${preset.name}" หรือไม่?`,
      title: 'ยืนยันการลบสี',
      confirmText: 'ลบ',
      cancelText: 'ยกเลิก',
      icon: '🧨'
    });
    if (!confirmed) return;

    try {
      await vehicleColorApi.delete(preset.id);
      notify('ลบสีเรียบร้อย', { title: 'สำเร็จ', variant: 'success', icon: '✅' });
      await refreshColors();
      await loadSuggestions();
    } catch (error) {
      console.error('Delete preset failed:', error);
      notify(error.message || 'ไม่สามารถลบสีได้', { title: 'ผิดพลาด', variant: 'danger', icon: '⚠️' });
    }
  };

  const handleAliasToggle = (value) => {
    setSelectedSuggestions((prev) => {
      const next = new Set(prev);
      if (next.has(value)) {
        next.delete(value);
      } else {
        next.add(value);
      }
      return next;
    });
  };

  const handleAssignAliases = async () => {
    if (!assignPresetId) {
      notify('กรุณาเลือกสีที่ต้องการผูก alias', { title: 'ข้อมูลไม่ครบ', variant: 'warning', icon: '📝' });
      return;
    }
    if (selectedSuggestions.size === 0) {
      notify('กรุณาเลือก alias อย่างน้อยหนึ่งรายการ', { title: 'ข้อมูลไม่ครบ', variant: 'warning', icon: '📝' });
      return;
    }

    setAssigning(true);
    try {
      await vehicleColorApi.addAliases(assignPresetId, Array.from(selectedSuggestions));
      notify('ผูก alias กับสีเรียบร้อย', { title: 'สำเร็จ', variant: 'success', icon: '✅' });
      await refreshColors();
      await loadSuggestions();
    } catch (error) {
      console.error('Assign alias failed:', error);
      notify(error.message || 'ไม่สามารถผูก alias ได้', { title: 'ผิดพลาด', variant: 'danger', icon: '⚠️' });
    } finally {
      setAssigning(false);
    }
  };

  const handleRemoveAlias = async (alias) => {
    const confirmed = await showConfirm({
      message: `ต้องการนำ "${alias.raw_value}" ออกจากสีนี้หรือไม่?`,
      title: 'ยืนยันการนำ alias ออก',
      confirmText: 'นำออก',
      cancelText: 'ยกเลิก',
      icon: '🧨'
    });
    if (!confirmed) return;

    try {
      await vehicleColorApi.deleteAlias(alias.id);
      notify('นำ alias ออกแล้ว', { title: 'สำเร็จ', variant: 'success', icon: '✅' });
      await refreshColors();
      await loadSuggestions();
    } catch (error) {
      console.error('Remove alias failed:', error);
      notify(error.message || 'ไม่สามารถนำ alias ออกได้', { title: 'ผิดพลาด', variant: 'danger', icon: '⚠️' });
    }
  };

  const presetOptions = useMemo(() => presets.map((preset) => ({ value: preset.id, label: `${preset.name} (${preset.hex})` })), [presets]);

  if (authLoading || !isAdmin) {
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
    <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">จัดการสีรถ</h1>
            <p className="text-sm text-slate-600 mt-1">
              กำหนดชุดสีมาตรฐานและจับคู่ข้อความสีที่ผู้ใช้กรอกให้ตรงกัน
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => router.push('/')}
              className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-100"
            >
              ⬅ กลับแดชบอร์ด
            </button>
            <button
              onClick={() => {
                refreshColors();
                loadSuggestions();
              }}
              className="px-4 py-2 bg-blue-50 text-blue-700 rounded-lg text-sm font-semibold hover:bg-blue-100"
            >
              รีเฟรชข้อมูล
            </button>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-slate-900">สีทั้งหมด</h2>
                {colorLoading && <span className="text-sm text-slate-500">กำลังโหลด...</span>}
              </div>
              <div className="grid gap-4">
                {presets.length === 0 && (
                  <p className="text-sm text-slate-500">ยังไม่มีสี</p>
                )}
                {presets.map((preset) => {
                  const isEditing = editingId === preset.id;
                  return (
                    <div key={preset.id} className="border border-slate-200 rounded-xl p-4 bg-white shadow-xs">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-4">
                          <div className="w-14 h-14 rounded-lg border border-slate-200" style={{ backgroundColor: preset.hex }} />
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-lg font-semibold text-slate-900">{preset.name}</h3>
                              <span className={`text-xs px-2 py-1 rounded-full font-semibold ${preset.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                                {preset.is_active ? 'ใช้งาน' : 'ปิดอยู่'}
                              </span>
                            </div>
                            <p className="text-sm text-slate-500">{preset.hex}</p>
                            {preset.description && (
                              <p className="text-sm text-slate-500 mt-1">{preset.description}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col gap-2">
                          <button
                            onClick={() => (isEditing ? setEditingId(null) : handleStartEdit(preset))}
                            className="px-3 py-2 text-xs font-semibold rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50"
                          >
                            {isEditing ? 'ยกเลิก' : 'แก้ไข'}
                          </button>
                          <button
                            onClick={() => handleDeletePreset(preset)}
                            className="px-3 py-2 text-xs font-semibold rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
                          >
                            ลบ
                          </button>
                        </div>
                      </div>

                      {isEditing && (
                        <div className="mt-4 border-t border-slate-100 pt-4 sm:pt-5">
                          <div className="grid sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-sm font-medium text-slate-700 mb-1">ชื่อสี</label>
                              <input
                                type="text"
                                name="name"
                                value={editingForm.name}
                                onChange={handleEditChange}
                                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-slate-700 mb-1">Color Code</label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="color"
                                  name="hex"
                                  value={editingForm.hex}
                                  onChange={handleEditChange}
                                  className="h-10 rounded-lg border border-slate-200"
                                />
                                <input
                                  type="text"
                                  name="hex"
                                  value={editingForm.hex}
                                  onChange={handleEditChange}
                                  className="flex-1 px-3 py-2 border border-slate-200 rounded-lg"
                                />
                              </div>
                            </div>
                          </div>
                          <div className="mt-3">
                            <label className="block text-sm font-medium text-slate-700 mb-1">รายละเอียด</label>
                            <textarea
                              name="description"
                              rows={2}
                              value={editingForm.description}
                              onChange={handleEditChange}
                              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                          </div>
                          <label className="inline-flex items-center gap-2 text-sm text-slate-700 mt-3">
                            <input
                              type="checkbox"
                              name="is_active"
                              checked={editingForm.is_active}
                              onChange={handleEditChange}
                              className="rounded text-blue-600"
                            />
                            เปิดใช้งานสีนี้
                          </label>
                          <div className="mt-3 text-right">
                            <button
                              onClick={() => handleSaveEdit(preset.id)}
                              className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700"
                            >
                              บันทึกการแก้ไข
                            </button>
                          </div>
                        </div>
                      )}

                      {preset.aliases?.length > 0 && (
                        <div className="mt-4">
                          <p className="text-xs uppercase tracking-wide text-slate-500 mb-2">Alias</p>
                          <div className="flex flex-wrap gap-2">
                            {preset.aliases.map((alias) => (
                              <span
                                key={alias.id}
                                className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs bg-slate-100 text-slate-700"
                              >
                                {alias.raw_value}
                                <button
                                  type="button"
                                  onClick={() => handleRemoveAlias(alias)}
                                  className="text-slate-500 hover:text-red-500"
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">เพิ่มสีใหม่</h2>
              <form className="space-y-4" onSubmit={handleCreatePreset}>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">ชื่อสี *</label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleFormChange}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="เช่น ขาวมุก"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Color Code</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      name="hex"
                      value={formData.hex}
                      onChange={handleFormChange}
                      className="h-10 rounded-lg border border-slate-200"
                    />
                    <input
                      type="text"
                      name="hex"
                      value={formData.hex}
                      onChange={handleFormChange}
                      className="flex-1 px-3 py-2 border border-slate-200 rounded-lg"
                      placeholder="#2563EB"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">รายละเอียด</label>
                  <textarea
                    name="description"
                    rows={2}
                    value={formData.description}
                    onChange={handleFormChange}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="คำอธิบายเพิ่มเติม"
                  />
                </div>
                <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    name="is_active"
                    checked={formData.is_active}
                    onChange={handleFormChange}
                    className="rounded text-blue-600"
                  />
                  เปิดใช้งานทันที
                </label>
                <button
                  type="submit"
                  disabled={creating}
                  className="w-full py-2.5 bg-blue-600 text-white rounded-lg font-semibold disabled:opacity-60"
                >
                  {creating ? 'กำลังบันทึก...' : 'เพิ่มสี'}
                </button>
              </form>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">ค่า "สี" ที่ยังไม่ถูกแม็ป</h2>
                  <p className="text-xs text-slate-500">เลือกค่าแล้วผูกกับสีมาตรฐาน</p>
                </div>
                {loadingSuggestions && <span className="text-xs text-slate-500">กำลังโหลด...</span>}
              </div>
              <div className="space-y-3">
                <select
                  value={assignPresetId}
                  onChange={(e) => setAssignPresetId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">เลือกสีที่จะผูก</option>
                  {presetOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>

                <div className="max-h-60 overflow-auto border border-dashed border-slate-200 rounded-xl p-3 bg-slate-50">
                  {suggestions.length === 0 && (
                    <p className="text-sm text-slate-500">ไม่มีค่าเพิ่มเติม</p>
                  )}
                  <div className="space-y-2">
                    {suggestions.map((value) => (
                      <label key={value} className="flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={selectedSuggestions.has(value)}
                          onChange={() => handleAliasToggle(value)}
                          className="rounded text-blue-600"
                        />
                        {value}
                      </label>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleAssignAliases}
                  disabled={assigning || !assignPresetId || selectedSuggestions.size === 0}
                  className="w-full py-2.5 bg-emerald-600 text-white rounded-lg font-semibold disabled:opacity-60"
                >
                  {assigning ? 'กำลังผูก...' : `ผูก ${selectedSuggestions.size} รายการกับสีที่เลือก`}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
