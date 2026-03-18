const API_URL = '/api';

const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
};

export async function apiRequest(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...getAuthHeader(),
    ...options.headers,
  };

  try {
    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers,
      signal: options.signal,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || 'Request failed');
    }

    return response.json();
  } catch (error) {
    if (error.name === 'AbortError') {
      return;
    }
    throw error;
  }
}

export const vehicleApi = {
  getAll: (options = {}) => {
    return apiRequest('/vehicles', options);
  },
  
  getById: (id) => apiRequest(`/vehicles/${id}`),
  
  create: (data) => apiRequest('/vehicles', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  
  update: (id, data) => apiRequest(`/vehicles/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  }),
  
  delete: (id) => apiRequest(`/vehicles/${id}`, {
    method: 'DELETE',
  }),
  
  bulkCreate: (vehicles) => apiRequest('/vehicles/bulk', {
    method: 'POST',
    body: JSON.stringify(vehicles),
  }),

  bulkUpdate: (updates) => apiRequest('/vehicles/bulk-update', {
    method: 'PUT',
    body: JSON.stringify(updates),
  }),
  
  updatePosition: (id, position) => apiRequest(`/vehicles/${id}/position`, {
    method: 'PUT',
    body: JSON.stringify(position),
  }),
  
  autoArrange: (parking_lot_number = null) => apiRequest('/vehicles/auto-arrange', {
    method: 'POST',
    body: JSON.stringify({ parking_lot_number }),
  }),
  
  clearCanvas: (parking_lot_number) => apiRequest('/vehicles/clear-canvas', {
    method: 'POST',
    body: JSON.stringify({ parking_lot_number }),
  }),
  
  clearAll: () => apiRequest('/vehicles/clear', {
    method: 'DELETE',
  }),
  
  // Workshop operations
  sendToWorkshop: (id, data) => apiRequest(`/vehicles/${id}/workshop/send`, {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  
  returnFromWorkshop: (id) => apiRequest(`/vehicles/${id}/workshop/return`, {
    method: 'POST',
  }),
  
  updateWorkshopInfo: (id, data) => apiRequest(`/vehicles/${id}/workshop`, {
    method: 'PUT',
    body: JSON.stringify(data),
  }),
  
  getWorkshopVehicles: () => apiRequest('/vehicles/workshop/list'),
  
  // Auction operations
  sendToAuction: (id, data) => apiRequest(`/vehicles/${id}/auction/send`, {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  
  returnFromAuction: (id) => apiRequest(`/vehicles/${id}/auction/return`, {
    method: 'POST',
  }),
  
  updateAuctionInfo: (id, data) => apiRequest(`/vehicles/${id}/auction`, {
    method: 'PUT',
    body: JSON.stringify(data),
  }),
  
  getAuctionVehicles: () => apiRequest('/vehicles/auction/list'),

  // Sale lot operations
  sendToSale: (id, data) => apiRequest(`/vehicles/${id}/sale/send`, {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  returnFromSale: (id) => apiRequest(`/vehicles/${id}/sale/return`, {
    method: 'POST',
  }),

  updateSaleInfo: (id, data) => apiRequest(`/vehicles/${id}/sale`, {
    method: 'PUT',
    body: JSON.stringify(data),
  }),

  getSaleVehicles: () => apiRequest('/vehicles/sale/list'),

  getLogs: ({ limit = 100, offset = 0, vehicleId } = {}) => {
    const params = new URLSearchParams();
    if (limit) params.set('limit', String(limit));
    if (offset) params.set('offset', String(offset));
    if (vehicleId) params.set('vehicle_id', String(vehicleId));
    const query = params.toString();
    const endpoint = `/vehicle-logs${query ? `?${query}` : ''}`;
    return apiRequest(endpoint);
  },

  // Vehicle column management
  getColumns: () => apiRequest('/vehicle-columns'),
  createColumn: (data) => apiRequest('/vehicle-columns', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  updateColumn: (id, data) => apiRequest(`/vehicle-columns/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data)
  }),
  deleteColumn: (id) => apiRequest(`/vehicle-columns/${id}`, {
    method: 'DELETE'
  })
};

const extractFilenameFromDisposition = (disposition, fallback = 'download.xlsx') => {
  if (!disposition) return fallback;
  const utfMatch = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utfMatch && utfMatch[1]) {
    try {
      return decodeURIComponent(utfMatch[1]);
    } catch (error) {
      return utfMatch[1];
    }
  }
  const asciiMatch = disposition.match(/filename="?([^";]+)"?/i);
  if (asciiMatch && asciiMatch[1]) {
    return asciiMatch[1];
  }
  return fallback;
};

export const rmoApi = {
  exportTemplate: async () => {
    const headers = {
      ...getAuthHeader()
    };

    const response = await fetch(`${API_URL}/rmo-export`, { headers });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'ไม่สามารถส่งออกไฟล์ได้' }));
      throw new Error(error.error || 'ไม่สามารถส่งออกไฟล์ได้');
    }

    const blob = await response.blob();
    const disposition = response.headers.get('content-disposition');
    const filename = extractFilenameFromDisposition(disposition, `rmo-update-${new Date().toISOString().split('T')[0]}.xlsx`);
    return { blob, filename };
  },
  importTemplate: async (file) => {
    if (!file) {
      throw new Error('กรุณาเลือกไฟล์ Excel ก่อน');
    }

    const formData = new FormData();
    formData.append('file', file);

    const headers = {
      ...getAuthHeader()
    };

    const response = await fetch(`${API_URL}/rmo-import`, {
      method: 'POST',
      headers,
      body: formData
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'ไม่สามารถนำเข้าไฟล์ได้' }));
      throw new Error(error.error || 'ไม่สามารถนำเข้าไฟล์ได้');
    }

    return response.json();
  },
  directUpdate: async (updates) => {
    const token = localStorage.getItem('token');
    if (!token) throw new Error('ไม่พบ token');

    const response = await fetch(`${API_URL}/vehicles/direct-update`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify({ updates })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'ไม่สามารถอัปเดตข้อมูลได้' }));
      throw new Error(error.error || 'ไม่สามารถอัปเดตข้อมูลได้');
    }

    return response.json();
  }
};

export const vehicleColorApi = {
  getAll: () => apiRequest('/vehicle-colors'),
  create: (data) => apiRequest('/vehicle-colors', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  update: (id, data) => apiRequest(`/vehicle-colors/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data)
  }),
  delete: (id) => apiRequest(`/vehicle-colors/${id}`, {
    method: 'DELETE'
  }),
  addAliases: (id, values) => apiRequest(`/vehicle-colors/${id}/aliases`, {
    method: 'POST',
    body: JSON.stringify({ values })
  }),
  deleteAlias: (aliasId) => apiRequest(`/vehicle-color-aliases/${aliasId}`, {
    method: 'DELETE'
  }),
  getSuggestions: () => apiRequest('/vehicle-color-suggestions')
};

export const parkingLotApi = {
  getAll: (options = {}) => apiRequest('/parking-lots', options),
  getLogs: (options = {}) => apiRequest('/vehicle-logs', options),
  exportFullLogs: async (format = 'xlsx') => {
    const token = localStorage.getItem('token');
    if (!token) throw new Error('ไม่พบ token');

    const params = new URLSearchParams();
    params.set('limit', '5000');
    params.set('format', format);

    const response = await fetch(`${API_URL}/vehicle-logs/export-full?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'ไม่สามารถส่งออกบันทึกได้' }));
      throw new Error(error.error || 'ไม่สามารถส่งออกบันทึกได้');
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
  },
};

export const statsApi = {
  get: () => apiRequest('/stats'),
};

export const userApi = {
  getAll: () => apiRequest('/users'),
  create: ({ username, password, role }) =>
    apiRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password, role }),
    }),
};
