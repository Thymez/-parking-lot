import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { useAuth } from '../lib/auth';
import { rmoApi } from '../lib/api';
import { useDialog } from '../components/DialogProvider';

const ACCESS_ROLES = ['admin', 'member'];

const formatNumber = (value) => (typeof value === 'number' ? value.toLocaleString('th-TH') : '-');

export default function RmoUpdatePage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const canAccess = !!(user && ACCESS_ROLES.includes(user.role));
  const { alert: showDialog } = useDialog();
  const notify = useCallback((message, options = {}) => showDialog({ confirmText: 'รับทราบ', icon: 'ℹ️', ...options, message }), [showDialog]);

  const fileInputRef = useRef(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [showFailures, setShowFailures] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (!canAccess) {
      router.replace('/');
    }
  }, [user, loading, router, canAccess]);

  const resetFileInput = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setSelectedFile(null);
  };

  const handleExport = async () => {
    try {
      setExporting(true);
      const { blob, filename } = await rmoApi.exportTemplate();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
      notify('ดาวน์โหลดแม่แบบ RMO สำเร็จ', { title: 'ส่งออกสำเร็จ', variant: 'success', icon: '✅' });
    } catch (error) {
      console.error('RMO export failed:', error);
      notify(error.message || 'ไม่สามารถส่งออกไฟล์ได้', { title: 'ส่งออกไม่สำเร็จ', variant: 'danger', icon: '⚠️' });
    } finally {
      setExporting(false);
    }
  };

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    setSelectedFile(file || null);
    setImportResult(null);
  };

  const handleImport = async () => {
    if (!selectedFile) {
      notify('กรุณาเลือกไฟล์ Excel ก่อน', { title: 'ยังไม่ได้เลือกไฟล์', variant: 'warning', icon: '📄' });
      return;
    }

    try {
      setImporting(true);
      const result = await rmoApi.importTemplate(selectedFile);
      setImportResult(result);
      setShowFailures(false);
      notify(`อัปเดตข้อมูลสำเร็จ ${result.updated || 0} รายการ`, { title: 'นำเข้าเสร็จแล้ว', variant: 'success', icon: '✅' });
      resetFileInput();
    } catch (error) {
      console.error('RMO import failed:', error);
      notify(error.message || 'ไม่สามารถนำเข้าไฟล์ได้', { title: 'นำเข้าไม่สำเร็จ', variant: 'danger', icon: '⚠️' });
    } finally {
      setImporting(false);
    }
  };

  if (loading || !user || !canAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto" />
          <p className="mt-4 text-gray-600">กำลังตรวจสอบสิทธิ์...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>RMO Update • Parking Admin</title>
      </Head>
      <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto space-y-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">🪪 อัปเดตข้อมูล RMO</h1>
              <p className="text-gray-600 mt-1">
                ส่งออกแม่แบบ RMO แล้วเติมข้อมูลคอลัมน์หลัง RMO จากนั้นนำเข้าเพื่ออัปเดตรถพร้อมบันทึก Log ให้อัตโนมัติ
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => router.push('/')}
                className="px-4 py-2 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-100"
              >
                ⬅ กลับหน้าหลัก
              </button>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 space-y-4">
              <div>
                <p className="text-sm font-semibold text-gray-900 uppercase tracking-wide">ขั้นที่ 1</p>
                <h2 className="text-xl font-bold text-gray-800 mt-1">ดาวน์โหลดแม่แบบ RMO</h2>
                <p className="text-gray-600 mt-2">
                  ไฟล์ Excel จะมีข้อมูลคงที่ (ID, ทะเบียน, จังหวัด ฯลฯ) และช่องจาก RMO เป็นต้นไปที่เปิดให้แก้ไข
                </p>
              </div>
              <button
                onClick={handleExport}
                disabled={exporting}
                className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition disabled:opacity-60"
              >
                {exporting ? 'กำลังสร้างไฟล์…' : '⬇ ดาวน์โหลดแม่แบบ RMO' }
              </button>
              <ul className="text-sm text-gray-500 space-y-1">
                <li>• ใช้ฟิลด์ RMO เพื่อ map รถกลับเข้าระบบ</li>
                <li>• ช่องหลัง RMO จะว่างเพื่อให้เติมข้อมูลใหม่</li>
                <li>• ห้ามลบแถวหัวตารางหรือเปลี่ยนลำดับคอลัมน์</li>
              </ul>
            </div>

            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 space-y-4">
              <div>
                <p className="text-sm font-semibold text-gray-900 uppercase tracking-wide">ขั้นที่ 2</p>
                <h2 className="text-xl font-bold text-gray-800 mt-1">อัปโหลดไฟล์ที่เติมข้อมูลแล้ว</h2>
                <p className="text-gray-600 mt-2">
                  ระบบจะอัปเดตเฉพาะคอลัมน์ตั้งแต่ RMO เป็นต้นไป และบันทึก log ทุกการเปลี่ยนแปลง
                </p>
              </div>
              <div>
                <label
                  htmlFor="rmo-file"
                  className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-gray-300 rounded-2xl text-center cursor-pointer hover:border-blue-400 transition"
                >
                  <svg className="w-10 h-10 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <p className="mt-3 text-sm text-gray-600">
                    {selectedFile ? selectedFile.name : 'คลิกเพื่อเลือกไฟล์ .xlsx'}
                  </p>
                  <p className="text-xs text-gray-400">สูงสุด 5 MB</p>
                  <input
                    id="rmo-file"
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </label>
                {selectedFile && (
                  <button
                    type="button"
                    onClick={resetFileInput}
                    className="mt-2 text-xs text-gray-500 hover:text-gray-700"
                  >
                    ล้างไฟล์ที่เลือก
                  </button>
                )}
              </div>
              <button
                onClick={handleImport}
                disabled={importing}
                className="w-full px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold transition disabled:opacity-60"
              >
                {importing ? 'กำลังนำเข้า…' : '⬆ นำเข้าไฟล์ RMO'}
              </button>
              <ul className="text-sm text-gray-500 space-y-1">
                <li>• ระบบจะค้นหารถจาก ID &gt; RMO &gt; ทะเบียน</li>
                <li>• บรรทัดที่ไม่เปลี่ยนแปลงจะถูกข้ามอัตโนมัติ</li>
                <li>• ผลลัพธ์จะแสดงด้านล่างพร้อมรายละเอียดข้อผิดพลาด</li>
              </ul>
            </div>
          </div>

          {importResult && (
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900 uppercase tracking-wide">ผลการนำเข้า</p>
                  <h2 className="text-2xl font-bold text-gray-800 mt-1">สรุปการอัปเดตล่าสุด</h2>
                  <p className="text-gray-500">อัปเดต {formatNumber(importResult.updated)} รายการจาก {formatNumber(importResult.processed)} แถว</p>
                </div>
                <div className={`px-4 py-2 rounded-xl text-sm font-semibold ${importResult.success ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                  {importResult.success ? 'สำเร็จครบทุกแถว' : 'มีบรรทัดที่ไม่สำเร็จ'}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="p-4 rounded-2xl bg-blue-50 border border-blue-100">
                  <p className="text-sm text-blue-600">ประมวลผล</p>
                  <p className="text-2xl font-bold text-blue-800">{formatNumber(importResult.processed)}</p>
                </div>
                <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-100">
                  <p className="text-sm text-emerald-600">อัปเดตสำเร็จ</p>
                  <p className="text-2xl font-bold text-emerald-800">{formatNumber(importResult.updated)}</p>
                </div>
                <div className="p-4 rounded-2xl bg-amber-50 border border-amber-100">
                  <p className="text-sm text-amber-600">ข้าม / ไม่เปลี่ยน</p>
                  <p className="text-2xl font-bold text-amber-800">{formatNumber(importResult.skipped)}</p>
                </div>
              </div>

              {Array.isArray(importResult.failures) && importResult.failures.length > 0 && (
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => setShowFailures((prev) => !prev)}
                    className="flex items-center justify-between w-full px-4 py-2 rounded-xl border border-gray-200 bg-gray-50 text-left"
                  >
                    <span className="font-semibold text-gray-800">รายละเอียดข้อผิดพลาด ({importResult.failures.length} แถว)</span>
                    <span className="text-sm text-gray-500">{showFailures ? 'ซ่อน' : 'แสดง'}</span>
                  </button>
                  {showFailures && (
                    <div className="max-h-72 overflow-auto border border-gray-100 rounded-xl">
                      <table className="min-w-full text-sm">
                        <thead className="bg-gray-50 text-gray-600 uppercase text-xs">
                          <tr>
                            <th className="px-4 py-2 text-left">แถว</th>
                            <th className="px-4 py-2 text-left">สาเหตุ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {importResult.failures.map((failure, idx) => (
                            <tr key={`${failure.row}-${idx}`} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                              <td className="px-4 py-2 font-semibold text-gray-800">#{failure.row}</td>
                              <td className="px-4 py-2 text-gray-600">{failure.reason}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
