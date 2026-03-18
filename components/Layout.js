import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/auth';

export default function Layout({ 
  children, 
  view, 
  setView, 
  parkingLots, 
  selectedLot, 
  setSelectedLot,
  searchTerm,
  setSearchTerm,
  onRefresh,
  lotFilterValue = '',
  onLotFilterChange,
  lotFilterOptions = []
}) {
  const { user, logout, isAdmin } = useAuth();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);
  const isMapView = view === 'map';
  const canAccessRmo = !!(user && user.role === 'admin');
  const contentWrapperClass = isMapView
    ? 'max-w-full mx-auto px-0 sm:px-4 lg:px-8 pt-[calc(var(--mobile-top-bar,0px)+8px)] pb-0 md:pt-4 md:pb-4'
    : 'max-w-full mx-auto px-4 sm:px-6 lg:px-8 py-4 pt-16 md:pt-4';

  useEffect(() => {
    const updateMobileChromeVars = () => {
      if (typeof window === 'undefined') return;
      const isMobile = window.innerWidth < 768;
      const topBar = isMobile ? 56 : 0;
      const bottomNav = isMobile ? 64 : 0;
      document.documentElement.style.setProperty('--mobile-top-bar', `${topBar}px`);
      document.documentElement.style.setProperty('--mobile-bottom-nav', `${bottomNav}px`);
    };

    updateMobileChromeVars();
    window.addEventListener('resize', updateMobileChromeVars);
    return () => window.removeEventListener('resize', updateMobileChromeVars);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 pb-16 md:pb-0">
      <nav className="bg-white shadow-lg">
        <div className="hidden md:block">
          <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-16">
            <div className="flex items-center">
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden p-3 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100 active:bg-gray-200 touch-manipulation min-h-[48px] min-w-[48px]"
              >
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              
              <div className="flex items-center ml-2 md:ml-0">
                <div className="flex items-center justify-center w-10 h-10 bg-blue-500 rounded-lg">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                  </svg>
                </div>
                <h1 className="ml-3 text-xl font-bold text-gray-800 hidden sm:block">
                  ระบบจัดการลานจอดรถ
                </h1>
              </div>
            </div>

            <div className="hidden md:flex items-center space-x-4">
              <div className="flex bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setView('table')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition ${
                    view === 'table'
                      ? 'bg-white text-blue-600 shadow'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <svg className="w-5 h-5 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  ตาราง
                </button>
                <button
                  onClick={() => setView('map')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition ${
                    view === 'map'
                      ? 'bg-white text-blue-600 shadow'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <svg className="w-5 h-5 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                  </svg>
                  แผนที่
                </button>
                <button
                  onClick={() => setView('workshop')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition ${
                    view === 'workshop'
                      ? 'bg-white text-blue-600 shadow'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <svg className="w-5 h-5 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  อู่
                </button>
                <button
                  onClick={() => setView('auction')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition ${
                    view === 'auction'
                      ? 'bg-white text-purple-600 shadow'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <svg className="w-5 h-5 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                  ประมูล
                </button>
                <button
                  onClick={() => setView('sale')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition ${
                    view === 'sale'
                      ? 'bg-white text-emerald-600 shadow'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <svg className="w-5 h-5 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5h14v4H5zM5 13h10v4H5z" />
                  </svg>
                  ขาย
                </button>
              </div>

              <div className="flex items-center space-x-2">
                {canAccessRmo && (
                  <button
                    onClick={() => router.push('/rmo-update')}
                    className="px-4 py-2 border border-blue-200 text-blue-600 hover:bg-blue-50 rounded-lg text-sm font-medium transition"
                  >
                    อัปเดต RMO
                  </button>
                )}
                {isAdmin && (
                  <div className="relative">
                    <button
                      onClick={() => setAdminMenuOpen((open) => !open)}
                      className="px-4 py-2 border border-emerald-200 text-emerald-600 hover:bg-emerald-50 rounded-lg text-sm font-medium transition"
                    >
                      จัดการข้อมูล
                    </button>
                    {adminMenuOpen && (
                      <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-gray-100 z-50">
                        <div className="flex flex-col p-2 text-sm text-gray-700">
                          <button
                            onClick={() => {
                              setAdminMenuOpen(false);
                              router.push('/columns');
                            }}
                            className="px-3 py-2 rounded-lg text-left hover:bg-gray-50"
                          >
                            จัดการคอลัมน์
                          </button>
                          <button
                            onClick={() => {
                              setAdminMenuOpen(false);
                              router.push('/users');
                            }}
                            className="px-3 py-2 rounded-lg text-left hover:bg-gray-50"
                          >
                            จัดการผู้ใช้
                          </button>
                          <button
                            onClick={() => {
                              setAdminMenuOpen(false);
                              router.push('/colors');
                            }}
                            className="px-3 py-2 rounded-lg text-left hover:bg-gray-50"
                          >
                            จัดการสี
                          </button>
                          <button
                            onClick={() => {
                              setAdminMenuOpen(false);
                              router.push('/logs');
                            }}
                            className="px-3 py-2 rounded-lg text-left hover:bg-gray-50"
                          >
                            บันทึกการเปลี่ยนแปลง
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <span className="text-sm text-gray-600">ผู้ใช้:</span>
                <span className="text-sm font-semibold text-gray-800">{user?.username}</span>
                <button
                  onClick={logout}
                  className="ml-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium transition"
                >
                  ออกจากระบบ
                </button>
              </div>
            </div>

            <div className="flex md:hidden items-center space-x-3">
              {isAdmin && (
                <button
                  onClick={() => setAdminMenuOpen((open) => !open)}
                  className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg touch-manipulation"
                  title="จัดการข้อมูล"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>
              )}
              <span className="text-sm font-semibold text-gray-800">{user?.username}</span>
            </div>
            </div>
          </div>
        </div>

        {/* Mobile Top Bar - Simplified */}
        <div className="md:hidden fixed top-0 left-0 right-0 bg-white border-b border-gray-200 shadow-sm z-40">
          <div className="flex items-center justify-between px-4 h-14">
            <div className="flex items-center space-x-2">
              <div className="flex items-center justify-center w-8 h-8 bg-blue-500 rounded-lg">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                </svg>
              </div>
              <span className="text-sm font-bold text-gray-800">ลานจอดรถ</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-semibold text-gray-600">{user?.username}</span>
              <button
                onClick={logout}
                className="p-2 text-red-600 hover:bg-red-50 rounded-lg touch-manipulation"
                title="ออกจากระบบ"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Spacer for fixed mobile top bar */}
      <div className="md:hidden h-14" />

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-50">
        <div className="grid grid-cols-5 h-16">
          <button
            onClick={() => setView('table')}
            className={`flex flex-col items-center justify-center space-y-1 transition-all touch-manipulation ${
              view === 'table'
                ? 'text-blue-600 bg-blue-50'
                : 'text-gray-600 active:bg-gray-100'
            }`}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <span className="text-xs font-medium">ตาราง</span>
          </button>
          <button
            onClick={() => setView('map')}
            className={`flex flex-col items-center justify-center space-y-1 transition-all touch-manipulation ${
              view === 'map'
                ? 'text-blue-600 bg-blue-50'
                : 'text-gray-600 active:bg-gray-100'
            }`}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
            <span className="text-xs font-medium">แผนที่</span>
          </button>
          <button
            onClick={() => setView('workshop')}
            className={`flex flex-col items-center justify-center space-y-1 transition-all touch-manipulation ${
              view === 'workshop'
                ? 'text-blue-600 bg-blue-50'
                : 'text-gray-600 active:bg-gray-100'
            }`}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="text-xs font-medium">อู่</span>
          </button>
          <button
            onClick={() => setView('auction')}
            className={`flex flex-col items-center justify-center space-y-1 transition-all touch-manipulation ${
              view === 'auction'
                ? 'text-purple-600 bg-purple-50'
                : 'text-gray-600 active:bg-gray-100'
            }`}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
            <span className="text-xs font-medium">ประมูล</span>
          </button>
          <button
            onClick={() => setView('sale')}
            className={`flex flex-col items-center justify-center space-y-1 transition-all touch-manipulation ${
              view === 'sale'
                ? 'text-emerald-600 bg-emerald-50'
                : 'text-gray-600 active:bg-gray-100'
            }`}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5h14v4H5zM5 13h10v4H5z" />
            </svg>
            <span className="text-xs font-medium">ขาย</span>
          </button>
        </div>
      </nav>

      <div className={contentWrapperClass}>

        {view === 'map' && (
          <div className="mb-4 flex flex-col sm:flex-row gap-3 sm:items-end">
            <div className="flex-1 flex flex-col text-xs text-slate-500">
              <span className="mb-1 font-semibold">ลาน (ฟิลเตอร์แผนที่)</span>
              <select
                value={lotFilterValue}
                onChange={(e) => onLotFilterChange?.(e.target.value)}
                className="px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-white text-sm"
              >
                {lotFilterOptions.map((option) => (
                  <option key={option.value} value={option.value} disabled={option.isAll}>
                    {option.label}
                    {` (${option.count.toLocaleString('th-TH')} คัน)`}
                    {option.isAll ? ' - ใช้ได้เฉพาะในมุมมองอื่น' : ''}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={onRefresh}
              className="px-4 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition flex items-center justify-center min-w-[140px]"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              รีเฟรช
            </button>
          </div>
        )}

        {children}
      </div>
    </div>
  );
}
