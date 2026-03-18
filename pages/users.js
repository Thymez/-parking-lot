import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/auth';
import { userApi } from '../lib/api';

export default function UsersPage() {
  const { user, loading, isAdmin } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState([]);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    role: 'member',
  });
  const [creating, setCreating] = useState(false);

  const loadUsers = async () => {
    try {
      setFetching(true);
      setError('');
      const data = await userApi.getAll();
      setUsers(data);
    } catch (err) {
      console.error('Failed to load users:', err);
      setError(err.message || 'ไม่สามารถดึงรายชื่อผู้ใช้ได้');
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (!isAdmin) {
      router.replace('/');
      return;
    }
    loadUsers();
  }, [user, loading, isAdmin, router]);

  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!formData.username.trim() || !formData.password.trim()) {
      setError('กรุณากรอกชื่อผู้ใช้และรหัสผ่าน');
      return;
    }
    try {
      setCreating(true);
      setError('');
      await userApi.create({
        username: formData.username.trim(),
        password: formData.password,
        role: formData.role,
      });
      setFormData({ username: '', password: '', role: 'member' });
      await loadUsers();
    } catch (err) {
      console.error('Create user failed:', err);
      setError(err.message || 'ไม่สามารถสร้างผู้ใช้ได้');
    } finally {
      setCreating(false);
    }
  };

  if (loading || fetching && !users.length) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">กำลังโหลด...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">จัดการผู้ใช้</h1>
            <p className="text-gray-600 mt-1">เพิ่มผู้ใช้ใหม่หรือดูรายการผู้ใช้ทั้งหมดในระบบ</p>
          </div>
          <button
            onClick={() => router.push('/')}
            className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-100"
          >
            ⬅ กลับแดชบอร์ด
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
            {error}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          {isAdmin && (
          <div className="bg-white rounded-2xl shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">เพิ่มผู้ใช้ใหม่</h2>
            <form className="space-y-4" onSubmit={handleCreateUser}>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  ชื่อผู้ใช้ *
                </label>
                <input
                  type="text"
                  value={formData.username}
                  onChange={(e) => setFormData(prev => ({ ...prev, username: e.target.value }))}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  placeholder="เช่น parking_admin"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  รหัสผ่าน *
                </label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  placeholder="กำหนดรหัสผ่าน"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  ระดับสิทธิ์ *
                </label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData(prev => ({ ...prev, role: e.target.value }))}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-white"
                >
                  <option value="member">สมาชิก (อ่านอย่างเดียว)</option>
                  <option value="admin">ผู้ดูแลระบบ</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={creating}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creating ? 'กำลังสร้าง...' : 'เพิ่มผู้ใช้'}
              </button>
            </form>
          </div>
          )}

          <div className="bg-white rounded-2xl shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-900">ผู้ใช้ทั้งหมด</h2>
              <button
                onClick={loadUsers}
                className="px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg font-medium text-gray-700"
              >
                รีเฟรช
              </button>
            </div>

            {fetching && (
              <p className="text-sm text-gray-500 mb-4">กำลังโหลดรายการ...</p>
            )}

            {!fetching && users.length === 0 && (
              <p className="text-sm text-gray-500">ยังไม่มีผู้ใช้ในระบบ</p>
            )}

            {users.length > 0 && (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ชื่อผู้ใช้</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">บทบาท</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">สร้างเมื่อ</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200 text-sm">
                    {users.map((u) => (
                      <tr key={u.id}>
                        <td className="px-4 py-3 font-semibold text-gray-900">{u.username}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                            u.role === 'admin'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-blue-100 text-blue-700'
                          }`}>
                            {u.role === 'admin' ? 'ผู้ดูแลระบบ' : 'สมาชิก'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-500">
                          {new Date(u.created_at).toLocaleString('th-TH', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
