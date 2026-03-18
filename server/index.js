require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookie = require('cookie');
const path = require('path');
const rateLimit = require('express-rate-limit');
const XLSX = require('xlsx');
const multer = require('multer');

process.on('uncaughtException', (error) => {
  console.error('❌ [CRITICAL] Uncaught Exception:', error);
  console.error('Stack:', error.stack);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ [CRITICAL] Unhandled Rejection at:', promise, 'reason:', reason);
});

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  path: '/socket.io',
  cors: {
    origin: '*',
    credentials: true
  }
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  }
});

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const PORT = process.env.PORT || 8091;
const NODE_ENV = process.env.NODE_ENV || 'development';

const createToken = (user) => jwt.sign({
  id: user.id,
  username: user.username,
  role: user.role
}, JWT_SECRET, { expiresIn: '7d' });

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access denied' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user = user;
    next();
  });
};

const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

const allowCanvasEditors = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (!['admin', 'member'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Permission denied' });
  }
  next();
};

const formatDateTime = (value) => {
  if (!value) return '-';
  try {
    return new Intl.DateTimeFormat('th-TH', {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(new Date(value));
  } catch (error) {
    return '-';
  }
};

app.set('trust proxy', 1);

app.use(cors({
  origin: '*',
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));

const createRateLimiter = (options) => rateLimit({
  ...options
});

const apiLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: NODE_ENV === 'production' ? 100 : 1000,
  message: { error: 'Too many requests from this IP, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many login attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', apiLimiter);

app.use((req, res, next) => {
  req.setTimeout(30000);
  res.setTimeout(30000);
  next();
});

app.use((err, req, res, next) => {
  console.error('❌ [EXPRESS ERROR]:', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

let db;
try {
  db = new Database(path.join(__dirname, 'parking.db'));
  console.log('✅ Database connected successfully');
  
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('cache_size = -64000');
  db.pragma('temp_store = MEMORY');
  
  console.log('✅ Database optimizations applied (WAL mode, foreign keys enabled)');
} catch (error) {
  console.error('❌ [CRITICAL] Failed to connect to database:', error);
  process.exit(1);
}

const DEFAULT_VEHICLE_COLUMNS = [
  { column_key: 'sequence_no', label: 'ลำดับ', type: 'number', order_index: 10 },
  { column_key: 'license_plate', label: 'ทะเบียนรถ', type: 'text', order_index: 20 },
  { column_key: 'province', label: 'จังหวัด', type: 'text', order_index: 30 },
  { column_key: 'brand', label: 'ยี่ห้อ', type: 'text', order_index: 40 },
  { column_key: 'model', label: 'รุ่น', type: 'text', order_index: 50 },
  { column_key: 'color', label: 'สีรถ', type: 'text', order_index: 60 },
  { column_key: 'start_time', label: 'วันที่ย้ายรถ', type: 'datetime', order_index: 70 },
  { column_key: 'transaction_type', label: 'ประเภทรายการ', type: 'text', order_index: 80 },
  { column_key: 'parking_lot_name', label: 'ลาน', type: 'text', order_index: 90 },
  { column_key: 'rmo', label: 'RMO', type: 'text', order_index: 100 },
  { column_key: 'cmo', label: 'CMO', type: 'text', order_index: 110 },
  { column_key: 'gp_approval_status', label: 'สถานะการอนุมัติ(GP)', type: 'text', order_index: 120 },
  { column_key: 'policy_type', label: 'ประเภทกรมธรรม์', type: 'text', order_index: 150 },
  { column_key: 'policy_amount', label: 'ทุนประกัน', type: 'number', order_index: 160 },
  { column_key: 'note_summary', label: 'หมายเหตุ', type: 'text', order_index: 340 },
  { column_key: 'movement_entry_date', label: 'วันที่เข้าสถานะ', type: 'datetime', order_index: 355 },
  { column_key: 'workshop_name', label: 'ชื่ออู่', type: 'text', order_index: 600 },
  { column_key: 'workshop_notes', label: 'หมายเหตุอู่', type: 'text', order_index: 610 },
  { column_key: 'auction_name', label: 'ชื่อสนามประมูล', type: 'text', order_index: 620 },
  { column_key: 'auction_notes', label: 'หมายเหตุประมูล', type: 'text', order_index: 630 },
  { column_key: 'sale_notes', label: 'หมายเหตุการขาย', type: 'text', order_index: 640 }
];

const NEW_SYSTEM_COLUMN_KEYS = [
  'start_time',
  'updated_date',
  'transaction_type',
  'parking_lot_name',
  'document_status',
  'gp_approval_status',
  'policy_type',
  'policy_amount'
];

const SYSTEM_COLUMN_MIGRATIONS = NEW_SYSTEM_COLUMN_KEYS.map((key) => ({
  key,
  numeric: key === 'policy_amount'
}));

const IMPORT_TEMPLATE_CUSTOM_COLUMNS = [
  { column_key: 'gp_approver_name', label: 'ชื่อผู้อนุมัติ(GP)', type: 'text', order_index: 130 },
  { column_key: 'gp_approval_summary', label: 'สรุปสถานะอนุมัติ(GP)', type: 'text', order_index: 140 },
  { column_key: 'estimated_damage_amount', label: 'ประมาณการความเสียหาย', type: 'number', order_index: 170 },
  { column_key: 'salvage_value', label: 'มูลค่าซาก(ราคาขาย)', type: 'number', order_index: 180 },
  { column_key: 'salvage_sale_status', label: 'สถานะการขายซากรถยนต์', type: 'text', order_index: 190 },
  { column_key: 'salvage_sale_date', label: 'วันที่ขาย', type: 'datetime', order_index: 200 },
  { column_key: 'salvage_transfer_date', label: 'วันที่โอนเงิน', type: 'datetime', order_index: 210 },
  { column_key: 'salvage_received_amount', label: 'จำนวนเงินที่ได้รับ', type: 'number', order_index: 220 },
  { column_key: 'salvage_buyer_name', label: 'ชื่อผู้ซื้อซากรถยนต์', type: 'text', order_index: 240 },
  { column_key: 'claim_payment_amount', label: 'จ่ายค่าสินไหมจำนวน', type: 'number', order_index: 250 },
  { column_key: 'claim_payment_date', label: 'วันที่จ่ายค่าสินไหม', type: 'datetime', order_index: 260 },
  { column_key: 'claim_payee_name', label: 'ชื่อผู้รับเงิน', type: 'text', order_index: 270 }
];

const RMO_TEMPLATE_STATIC_COLUMNS = [
  { key: 'id', label: 'Vehicle ID', getValue: (vehicle) => vehicle?.id ?? '' },
  { key: 'license_plate', label: 'ทะเบียนรถ', getValue: (vehicle) => vehicle?.license_plate || '' },
  { key: 'province', label: 'จังหวัด', getValue: (vehicle) => vehicle?.province || '' },
  { key: 'brand', label: 'ยี่ห้อ', getValue: (vehicle) => vehicle?.brand || '' },
  { key: 'model', label: 'รุ่น', getValue: (vehicle) => vehicle?.model || '' },
  { key: 'color', label: 'สีรถ', getValue: (vehicle) => vehicle?.color || '' },
  { key: 'zone', label: 'โซน', getValue: (vehicle) => vehicle?.zone || '' },
  { key: 'origin_lot', label: 'ลานต้นทาง', getValue: (vehicle) => vehicle?.origin_lot || '' },
  { key: 'destination_lot', label: 'ลานปลายทาง', getValue: (vehicle) => vehicle?.destination_lot || '' }
];

const getRmoTemplateColumns = () => {
  const columns = getAllVehicleColumns();
  const rmoIndex = columns.findIndex((column) => column.column_key === 'rmo');
  if (rmoIndex === -1) {
    return [];
  }
  return columns.slice(rmoIndex).filter((column) => column.column_key && column.is_active !== 0);
};

const normalizeExcelDate = (value) => {
  if (value === undefined || value === null || value === '') return '';
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '' : value.toISOString();
  }
  if (typeof value === 'number') {
    const interpreted = value < 100000
      ? new Date((value - 25569) * 86400 * 1000)
      : new Date(value);
    return Number.isNaN(interpreted.getTime()) ? '' : interpreted.toISOString();
  }
  const text = String(value).trim();
  if (!text) return '';
  const numeric = Number(text);
  if (Number.isFinite(numeric) && text.length >= 5) {
    const numericDate = new Date(numeric);
    if (!Number.isNaN(numericDate.getTime())) {
      return numericDate.toISOString();
    }
  }
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }
  return text;
};

const normalizeNumericCell = (value) => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  const cleaned = value.toString().replace(/,/g, '').trim();
  if (!cleaned) return null;
  const numeric = Number(cleaned);
  return Number.isFinite(numeric) ? numeric : null;
};

const normalizeBooleanCell = (value) => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number') return value ? 1 : 0;
  const text = value.toString().trim().toLowerCase();
  if (!text) return null;
  if (['1', 'true', 'yes', 'y', 'ใช่'].includes(text)) return 1;
  if (['0', 'false', 'no', 'n', 'ไม่'].includes(text)) return 0;
  return null;
};

const normalizeTextCell = (value) => {
  if (value === undefined || value === null) return '';
  return value.toString().trim();
};

const getColumnLabel = (column) => {
  return (column?.label || column?.column_key || '').toString().trim();
};

const formatValueForCustomField = (column, rawValue) => {
  if (rawValue === undefined || rawValue === null || rawValue === '') return undefined;
  if (!column) return undefined;
  if (column.type === 'number') {
    const numeric = normalizeNumericCell(rawValue);
    return numeric === null ? undefined : numeric.toString();
  }
  if (column.type === 'datetime') {
    const normalized = normalizeExcelDate(rawValue);
    return normalized || undefined;
  }
  if (column.type === 'boolean') {
    const boolValue = normalizeBooleanCell(rawValue);
    if (boolValue === null) return undefined;
    return boolValue ? '1' : '0';
  }
  return normalizeTextCell(rawValue);
};

const formatValueForSystemField = (column, rawValue) => {
  if (rawValue === undefined || rawValue === null) return undefined;
  const value = typeof rawValue === 'string' ? rawValue.trim() : rawValue;
  if (value === '') return undefined;

  if (!column) {
    return typeof value === 'string' ? value : value?.toString?.();
  }

  if (column.type === 'number' || NUMERIC_EDITABLE_FIELDS.has(column.column_key)) {
    return normalizeNumericCell(value);
  }
  if (column.type === 'datetime') {
    return normalizeExcelDate(value) || null;
  }
  if (column.type === 'boolean') {
    const boolValue = normalizeBooleanCell(value);
    return boolValue === null ? undefined : boolValue;
  }
  return normalizeTextCell(value);
};

const normalizeRmoKey = (value) => {
  if (value === undefined || value === null) return '';
  return value.toString().trim().toLowerCase();
};

const normalizeHeaderLabel = (label) => {
  if (label === undefined || label === null) return '';
  return label.toString().trim().toLowerCase();
};

const normalizeLicensePlate = (value) => {
  if (value === undefined || value === null) return '';
  return value.toString().replace(/\s+/g, '').toLowerCase();
};

const hasMeaningfulCellValue = (value) => {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') {
    return value.trim() !== '';
  }
  return true;
};

const slugifyColumnKey = (label) => {
  return label
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64) || `col_${Date.now()}`;
};

// color endpoints moved below helper declarations

const ensureVehicleMetadataTables = () => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS vehicles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      start_time TEXT,
      updated_date TEXT,
      parking_lot_number INTEGER,
      parking_lot_name TEXT,
      zone TEXT,
      license_plate TEXT,
      province TEXT,
      brand TEXT,
      model TEXT,
      color TEXT,
      grade TEXT,
      sequence_no INTEGER,
      transaction_type TEXT,
      document_status TEXT,
      rmo TEXT,
      cmo TEXT,
      gp_approval_status TEXT,
      policy_type TEXT,
      policy_amount REAL,
      note_summary TEXT,
      key_status TEXT,
      key_number TEXT,
      notes TEXT,
      in_workshop INTEGER DEFAULT 0,
      workshop_name TEXT,
      workshop_notes TEXT,
      workshop_entry_time TEXT,
      in_auction INTEGER DEFAULT 0,
      auction_name TEXT,
      auction_notes TEXT,
      auction_entry_time TEXT,
      in_sale INTEGER DEFAULT 0,
      sale_notes TEXT,
      sale_entry_time TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS vehicle_positions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vehicle_id INTEGER UNIQUE,
      x REAL DEFAULT 0,
      y REAL DEFAULT 0,
      rotation REAL DEFAULT 0,
      FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS vehicle_columns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      column_key TEXT UNIQUE NOT NULL,
      label TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'text',
      source TEXT NOT NULL DEFAULT 'custom',
      order_index INTEGER NOT NULL DEFAULT 1000,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS vehicle_custom_fields (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vehicle_id INTEGER NOT NULL,
      column_key TEXT NOT NULL,
      value TEXT,
      UNIQUE(vehicle_id, column_key),
      FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE,
      FOREIGN KEY (column_key) REFERENCES vehicle_columns(column_key) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_license_plate ON vehicles(license_plate);
    CREATE INDEX IF NOT EXISTS idx_parking_lot ON vehicles(parking_lot_number);
    CREATE INDEX IF NOT EXISTS idx_zone ON vehicles(zone);

    CREATE TABLE IF NOT EXISTS vehicle_color_presets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      hex TEXT NOT NULL,
      description TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      order_index INTEGER NOT NULL DEFAULT 100,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS vehicle_color_aliases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      preset_id INTEGER NOT NULL,
      raw_value TEXT UNIQUE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (preset_id) REFERENCES vehicle_color_presets(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS vehicle_change_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vehicle_id INTEGER,
      action TEXT NOT NULL,
      changed_fields TEXT,
      previous_snapshot TEXT,
      new_snapshot TEXT,
      performed_by_user_id INTEGER,
      performed_by_username TEXT,
      performed_by_role TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_vehicle_logs_vehicle_id ON vehicle_change_logs(vehicle_id);
    CREATE INDEX IF NOT EXISTS idx_vehicle_logs_created_at ON vehicle_change_logs(created_at);
  `);
};

ensureVehicleMetadataTables();
const getAllVehicleColumns = () => db.prepare('SELECT * FROM vehicle_columns ORDER BY order_index ASC, id ASC').all();

const ensureDefaultVehicleColumns = () => {
  const upsert = db.prepare(`
    INSERT INTO vehicle_columns (column_key, label, type, source, order_index, is_active)
    VALUES (@column_key, @label, @type, 'system', @order_index, 1)
    ON CONFLICT(column_key)
    DO UPDATE SET label = excluded.label, type = excluded.type, order_index = excluded.order_index, is_active = 1, source = 'system'
  `);
  const deactivateRemoved = db.prepare(`
    DELETE FROM vehicle_columns
    WHERE source = 'system' AND column_key NOT IN (${DEFAULT_VEHICLE_COLUMNS.map(() => '?').join(',')})
  `);

  const transaction = db.transaction((columns) => {
    columns.forEach((column) => upsert.run(column));
    if (columns.length) {
      deactivateRemoved.run(columns.map((column) => column.column_key));
    }
  });

  transaction(DEFAULT_VEHICLE_COLUMNS);
};

ensureDefaultVehicleColumns();
migrateCustomSystemColumns();

const COLOR_ORDER_STEP = 10;
const getAllColorPresets = () => db.prepare('SELECT * FROM vehicle_color_presets ORDER BY order_index ASC, id ASC').all();
const getAllColorAliases = () => db.prepare('SELECT * FROM vehicle_color_aliases').all();
const getColorPresetById = (id) => db.prepare('SELECT * FROM vehicle_color_presets WHERE id = ?').get(id);
const getAliasById = (id) => db.prepare('SELECT * FROM vehicle_color_aliases WHERE id = ?').get(id);

const groupAliasesByPreset = () => {
  const aliases = getAllColorAliases();
  return aliases.reduce((acc, alias) => {
    if (!acc.has(alias.preset_id)) {
      acc.set(alias.preset_id, []);
    }
    acc.get(alias.preset_id).push(alias);
    return acc;
  }, new Map());
};

const serializeColorPreset = (preset, aliasMap) => {
  const aliases = aliasMap.get(preset.id) || [];
  return {
    id: preset.id,
    name: preset.name,
    hex: preset.hex,
    description: preset.description,
    is_active: preset.is_active,
    order_index: preset.order_index,
    aliases: aliases.map(alias => ({
      id: alias.id,
      raw_value: alias.raw_value,
      preset_id: alias.preset_id,
      created_at: alias.created_at,
      updated_at: alias.updated_at
    })),
    created_at: preset.created_at,
    updated_at: preset.updated_at
  };
};

const getColorPresetsWithAliases = () => {
  const presets = getAllColorPresets();
  const aliasMap = groupAliasesByPreset();
  return presets.map(preset => serializeColorPreset(preset, aliasMap));
};

const normalizeHexColor = (hex) => {
  if (!hex) return '#2563EB';
  let value = hex.toString().trim().replace(/[^0-9a-fA-F#]/g, '');
  if (!value) return '#2563EB';
  if (!value.startsWith('#')) value = `#${value}`;
  if (value.length === 4) {
    value = `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`;
  }
  return value.substring(0, 7).toUpperCase();
};

const getNextColorOrderIndex = () => {
  const presets = getAllColorPresets();
  if (!presets.length) return COLOR_ORDER_STEP;
  const maxOrder = Math.max(...presets.map(p => p.order_index || 0));
  return maxOrder + COLOR_ORDER_STEP;
};

app.get('/api/vehicle-colors', authenticateToken, (req, res) => {
  try {
    res.json(getColorPresetsWithAliases());
  } catch (error) {
    console.error('Get color presets error:', error);
    res.status(500).json({ error: 'Failed to load vehicle colors' });
  }
});

app.post('/api/vehicle-colors', authenticateToken, requireAdmin, (req, res) => {
  try {
    const payload = req.body || {};
    const name = (payload.name || '').toString().trim() || 'สีใหม่';
    const hex = normalizeHexColor(payload.hex);
    const description = (payload.description || '').toString().trim();
    const orderIndex = Number.isFinite(payload.order_index) ? payload.order_index : getNextColorOrderIndex();
    const isActive = payload.is_active === false ? 0 : 1;

    const result = db.prepare(`
      INSERT INTO vehicle_color_presets (name, hex, description, is_active, order_index)
      VALUES (?, ?, ?, ?, ?)
    `).run(name, hex, description, isActive, orderIndex);

    const preset = getColorPresetById(result.lastInsertRowid);
    res.json(serializeColorPreset(preset, new Map()));
  } catch (error) {
    console.error('Create color preset error:', error);
    res.status(500).json({ error: 'Failed to create color preset' });
  }
});

app.patch('/api/vehicle-colors/:id', authenticateToken, requireAdmin, (req, res) => {
  try {
    const presetId = Number(req.params.id);
    const preset = getColorPresetById(presetId);
    if (!preset) {
      return res.status(404).json({ error: 'Color preset not found' });
    }

    const payload = req.body || {};
    const name = payload.name !== undefined ? payload.name.toString().trim() : preset.name;
    const hex = payload.hex !== undefined ? normalizeHexColor(payload.hex) : preset.hex;
    const description = payload.description !== undefined ? payload.description.toString().trim() : preset.description;
    const orderIndex = Number.isFinite(payload.order_index) ? payload.order_index : preset.order_index;
    const isActive = payload.is_active === undefined ? preset.is_active : (payload.is_active ? 1 : 0);

    db.prepare(`
      UPDATE vehicle_color_presets
      SET name = ?, hex = ?, description = ?, order_index = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(name, hex, description, orderIndex, isActive, presetId);

    const updated = getColorPresetById(presetId);
    const aliasMap = groupAliasesByPreset();
    res.json(serializeColorPreset(updated, aliasMap));
  } catch (error) {
    console.error('Update color preset error:', error);
    res.status(500).json({ error: 'Failed to update color preset' });
  }
});

app.delete('/api/vehicle-colors/:id', authenticateToken, requireAdmin, (req, res) => {
  try {
    const presetId = Number(req.params.id);
    const preset = getColorPresetById(presetId);
    if (!preset) {
      return res.status(404).json({ error: 'Color preset not found' });
    }

    db.prepare('DELETE FROM vehicle_color_presets WHERE id = ?').run(presetId);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete color preset error:', error);
    res.status(500).json({ error: 'Failed to delete color preset' });
  }
});

app.post('/api/vehicle-colors/:id/aliases', authenticateToken, requireAdmin, (req, res) => {
  try {
    const presetId = Number(req.params.id);
    const preset = getColorPresetById(presetId);
    if (!preset) {
      return res.status(404).json({ error: 'Color preset not found' });
    }

    const values = Array.isArray(req.body?.values) ? req.body.values : [];
    if (values.length === 0) {
      return res.status(400).json({ error: 'values array is required' });
    }

    const insert = db.prepare('INSERT OR IGNORE INTO vehicle_color_aliases (preset_id, raw_value) VALUES (?, ?)');
    const trimmedValues = values
      .map(value => (value ?? '').toString().trim())
      .filter(Boolean);

    const transaction = db.transaction((aliases) => {
      aliases.forEach(value => insert.run(presetId, value));
    });

    transaction(trimmedValues);
    const aliasMap = groupAliasesByPreset();
    const updatedPreset = getColorPresetById(presetId);
    res.json(serializeColorPreset(updatedPreset, aliasMap));
  } catch (error) {
    console.error('Add color aliases error:', error);
    res.status(500).json({ error: 'Failed to add aliases' });
  }
});

app.delete('/api/vehicle-color-aliases/:aliasId', authenticateToken, requireAdmin, (req, res) => {
  try {
    const aliasId = Number(req.params.aliasId);
    const alias = getAliasById(aliasId);
    if (!alias) {
      return res.status(404).json({ error: 'Alias not found' });
    }
    db.prepare('DELETE FROM vehicle_color_aliases WHERE id = ?').run(aliasId);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete color alias error:', error);
    res.status(500).json({ error: 'Failed to delete alias' });
  }
});

app.get('/api/vehicle-color-suggestions', authenticateToken, requireAdmin, (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT DISTINCT TRIM(color) AS value
      FROM vehicles
      WHERE color IS NOT NULL AND TRIM(color) != ''
        AND LOWER(TRIM(color)) NOT IN (
          SELECT LOWER(TRIM(raw_value)) FROM vehicle_color_aliases
        )
      ORDER BY value COLLATE NOCASE
    `).all();
    res.json({ suggestions: rows.map(row => row.value) });
  } catch (error) {
    console.error('Get color suggestions error:', error);
    res.status(500).json({ error: 'Failed to load suggestions' });
  }
});

function migrateCustomSystemColumns() {
  const columnInfo = db.prepare('PRAGMA table_info(vehicles)').all();
  const existingColumns = new Set(columnInfo.map((col) => col.name));
  const deleteStmt = db.prepare('DELETE FROM vehicle_custom_fields WHERE column_key = ?');

  SYSTEM_COLUMN_MIGRATIONS.forEach(({ key, numeric }) => {
    if (!existingColumns.has(key)) return;
    try {
      const valueSelector = numeric ? 'CAST(value AS REAL)' : 'value';
      db.prepare(`
        UPDATE vehicles
        SET ${key} = (
          SELECT ${valueSelector}
          FROM vehicle_custom_fields
          WHERE vehicle_custom_fields.vehicle_id = vehicles.id AND column_key = ?
        )
        WHERE EXISTS (
          SELECT 1 FROM vehicle_custom_fields WHERE vehicle_custom_fields.vehicle_id = vehicles.id AND column_key = ?
        )
      `).run(key, key);
      deleteStmt.run(key);
    } catch (error) {
      console.error(`⚠️ Failed to migrate custom column ${key}:`, error.message);
    }
  });
}

const ORDER_STEP = 10;
const DEFAULT_CUSTOM_ORDER_START = 200;
const VALID_CUSTOM_COLUMN_TYPES = new Set(['text', 'number', 'datetime', 'boolean']);
const BASE_VEHICLE_FIELDS = new Set([
  'start_time',
  'updated_date',
  'parking_lot_number',
  'parking_lot_name',
  'zone',
  'license_plate',
  'province',
  'brand',
  'model',
  'color',
  'grade',
  'sequence_no',
  'transaction_type',
  'document_status',
  'rmo',
  'cmo',
  'gp_approval_status',
  'policy_type',
  'policy_amount',
  'note_summary',
  'key_status',
  'key_number',
  'notes',
  'in_workshop',
  'workshop_name',
  'workshop_notes',
  'workshop_entry_time',
  'in_auction',
  'auction_name',
  'auction_notes',
  'auction_entry_time',
  'in_sale',
  'sale_notes',
  'sale_entry_time'
]);

const EDITABLE_VEHICLE_FIELDS = new Set([
  'start_time',
  'updated_date',
  'parking_lot_number',
  'parking_lot_name',
  'zone',
  'license_plate',
  'province',
  'brand',
  'model',
  'color',
  'grade',
  'sequence_no',
  'transaction_type',
  'document_status',
  'rmo',
  'cmo',
  'gp_approval_status',
  'policy_type',
  'policy_amount',
  'note_summary',
  'key_status',
  'key_number',
  'notes',
  'workshop_entry_time',
  'auction_entry_time',
  'sale_entry_time'
]);

const NUMERIC_EDITABLE_FIELDS = new Set(['parking_lot_number', 'sequence_no', 'policy_amount']);

const AUDITABLE_VEHICLE_FIELDS = new Set([
  ...BASE_VEHICLE_FIELDS,
  'x',
  'y',
  'rotation'
]);

const LOG_WITH_VEHICLE_BASE_SELECT = `
  SELECT logs.*, v.license_plate AS current_license_plate, v.zone AS current_zone,
         v.brand AS current_brand, v.model AS current_model
  FROM vehicle_change_logs logs
  LEFT JOIN vehicles v ON logs.vehicle_id = v.id
`;

const getVehicleColumnById = (id) => db.prepare('SELECT * FROM vehicle_columns WHERE id = ?').get(id);
const getVehicleColumnByKey = (key) => db.prepare('SELECT * FROM vehicle_columns WHERE column_key = ?').get(key);

const reindexVehicleColumns = () => {
  const columns = getAllVehicleColumns();
  const update = db.prepare('UPDATE vehicle_columns SET order_index = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
  columns
    .sort((a, b) => (a.order_index - b.order_index) || (a.id - b.id))
    .forEach((column, index) => {
      const newOrder = (index + 1) * ORDER_STEP;
      if (column.order_index !== newOrder) {
        update.run(newOrder, column.id);
      }
    });
};

const getOrderIndexBeforeKey = (columnKey) => {
  const columns = getAllVehicleColumns();
  const target = columns.find(col => col.column_key === columnKey);
  if (!target) return null;
  const newOrder = target.order_index - 1;
  return newOrder > 0 ? newOrder : ORDER_STEP;
};

const getNextCustomColumnOrderIndex = () => {
  const columns = getAllVehicleColumns();
  const maxCustom = columns
    .filter(col => col.source !== 'system')
    .reduce((max, col) => Math.max(max, col.order_index || 0), 0);
  return maxCustom ? maxCustom + ORDER_STEP : DEFAULT_CUSTOM_ORDER_START;
};

const ensureColumnsFromDefinitions = (definitions = []) => {
  if (!Array.isArray(definitions) || !definitions.length) return;
  let hasOrderChange = false;
  const insert = db.prepare(`
    INSERT INTO vehicle_columns (column_key, label, type, source, order_index, is_active)
    VALUES (?, ?, ?, 'custom', ?, 1)
  `);
  const update = db.prepare(`
    UPDATE vehicle_columns
    SET label = ?, type = ?, order_index = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
    WHERE column_key = ?
  `);

  definitions.forEach((definition) => {
    if (!definition) return;
    const label = (definition.label || '').toString().trim();
    const providedKey = (definition.column_key || '').toString().trim();
    const columnKey = (providedKey || slugifyColumnKey(label)).slice(0, 64);
    if (!columnKey) return;
    const type = VALID_CUSTOM_COLUMN_TYPES.has(definition.type) ? definition.type : 'text';
    let orderIndex = Number.isFinite(definition.order_index) ? definition.order_index : null;
    if (!orderIndex && definition.insert_before_key) {
      orderIndex = getOrderIndexBeforeKey(definition.insert_before_key) || getNextCustomColumnOrderIndex();
    }
    if (!orderIndex) {
      orderIndex = getNextCustomColumnOrderIndex();
    }

    const existing = getVehicleColumnByKey(columnKey);
    if (existing) {
      update.run(
        label || existing.label,
        type,
        orderIndex,
        definition.is_active === false ? 0 : 1,
        columnKey
      );
    } else {
      insert.run(columnKey, label || columnKey, type, orderIndex);
    }
    hasOrderChange = true;
  });

  if (hasOrderChange) {
    reindexVehicleColumns();
  }
};

ensureColumnsFromDefinitions(IMPORT_TEMPLATE_CUSTOM_COLUMNS);

const normalizeEntryTime = (value, { defaultToNow = false } = {}) => {
  if (value === undefined || value === null || value === '') {
    return defaultToNow ? new Date().toISOString() : null;
  }

  const directDate = new Date(value);
  if (!Number.isNaN(directDate.getTime())) {
    return directDate.toISOString();
  }

  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    const interpreted = numeric < 100000
      ? new Date((numeric - 25569) * 86400 * 1000)
      : new Date(numeric);
    if (!Number.isNaN(interpreted.getTime())) {
      return interpreted.toISOString();
    }
  }

  return defaultToNow ? new Date().toISOString() : null;
};

const updateVehicleWithAudit = (vehicleId, action, mutationFn, user) => {
  const beforeSnapshot = getVehicleWithPositionById(vehicleId);
  if (!beforeSnapshot) {
    throw new Error('Vehicle not found');
  }

  mutationFn(beforeSnapshot);

  const afterSnapshot = getVehicleWithPositionById(vehicleId);
  const changedFields = computeVehicleDiff(beforeSnapshot, afterSnapshot);

  if (hasDiffChanges(changedFields)) {
    logVehicleChange({
      vehicleId,
      action,
      previousSnapshot: beforeSnapshot,
      newSnapshot: afterSnapshot,
      changedFields,
      user
    });
  }

  return afterSnapshot;
};

const serializeVehicleColumn = (column) => {
  if (!column) return null;
  return {
    id: column.id,
    column_key: column.column_key,
    label: column.label,
    type: column.type,
    source: column.source,
    order_index: column.order_index,
    is_active: column.is_active,
    created_at: column.created_at,
    updated_at: column.updated_at
  };
};

const sanitizeCustomFieldsPayload = (customFields) => {
  if (!customFields || typeof customFields !== 'object') return {};
  const columnMap = new Map(getAllVehicleColumns().map(col => [col.column_key, col]));
  return Object.entries(customFields).reduce((acc, [key, value]) => {
    const column = columnMap.get(key);
    if (!column || column.is_active === 0) return acc;
    acc[key] = value == null ? '' : String(value);
    return acc;
  }, {});
};

const VEHICLE_WITH_POSITION_QUERY = `
  SELECT v.*, vp.x, vp.y, vp.rotation
  FROM vehicles v
  LEFT JOIN vehicle_positions vp ON v.id = vp.vehicle_id
  WHERE v.id = ?
`;

const getVehicleWithPositionById = (vehicleId) => {
  if (!vehicleId) return null;
  const vehicle = db.prepare(VEHICLE_WITH_POSITION_QUERY).get(vehicleId);
  return attachCustomFieldsToVehicle(vehicle);
};

const fetchCustomFieldsByVehicleIds = (vehicleIds = []) => {
  if (!vehicleIds.length) return {};
  const placeholders = vehicleIds.map(() => '?').join(',');
  const rows = db.prepare(`
    SELECT vehicle_id, column_key, value
    FROM vehicle_custom_fields
    WHERE vehicle_id IN (${placeholders})
  `).all(...vehicleIds);

  return rows.reduce((acc, row) => {
    if (!acc[row.vehicle_id]) acc[row.vehicle_id] = {};
    acc[row.vehicle_id][row.column_key] = row.value;
    return acc;
  }, {});
};

const attachCustomFieldsToVehicles = (vehicles = []) => {
  if (!vehicles.length) return vehicles;
  const customFieldMap = fetchCustomFieldsByVehicleIds(vehicles.map(v => v.id));
  return vehicles.map(vehicle => ({
    ...vehicle,
    custom_fields: customFieldMap[vehicle.id] || {}
  }));
};

const attachCustomFieldsToVehicle = (vehicle) => {
  if (!vehicle) return vehicle;
  const fields = fetchCustomFieldsByVehicleIds([vehicle.id]);
  return { ...vehicle, custom_fields: fields[vehicle.id] || {} };
};

const saveVehicleCustomFields = db.transaction((vehicleId, customFields) => {
  if (!customFields || typeof customFields !== 'object') return;
  const keys = Object.keys(customFields);
  if (!keys.length) {
    db.prepare('DELETE FROM vehicle_custom_fields WHERE vehicle_id = ?').run(vehicleId);
    return;
  }

  const upsert = db.prepare(`
    INSERT INTO vehicle_custom_fields (vehicle_id, column_key, value)
    VALUES (?, ?, ?)
    ON CONFLICT(vehicle_id, column_key) DO UPDATE SET value = excluded.value
  `);

  keys.forEach((key) => {
    upsert.run(vehicleId, key, customFields[key]);
  });

  const placeholders = keys.map(() => '?').join(',');
  db.prepare(`
    DELETE FROM vehicle_custom_fields
    WHERE vehicle_id = ?
      AND column_key NOT IN (${placeholders})
  `).run(vehicleId, ...keys);
});

const safeParseJSON = (value) => {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch (error) {
    console.warn('Failed to parse JSON from log payload:', error);
    return null;
  }
};

const flattenSnapshotForDiff = (snapshot) => {
  if (!snapshot) return {};
  const flat = {};
  AUDITABLE_VEHICLE_FIELDS.forEach((field) => {
    flat[field] = snapshot[field] ?? null;
  });

  if (snapshot.custom_fields && typeof snapshot.custom_fields === 'object') {
    Object.entries(snapshot.custom_fields).forEach(([key, value]) => {
      flat[`custom:${key}`] = value ?? '';
    });
  }

  return flat;
};

const computeVehicleDiff = (previousSnapshot, nextSnapshot) => {
  const prevFlat = flattenSnapshotForDiff(previousSnapshot);
  const nextFlat = flattenSnapshotForDiff(nextSnapshot);
  const allKeys = new Set([...Object.keys(prevFlat), ...Object.keys(nextFlat)]);
  const diff = {};

  allKeys.forEach((key) => {
    const before = prevFlat[key] ?? null;
    const after = nextFlat[key] ?? null;
    if (before !== after) {
      diff[key] = { before, after };
    }
  });

  return diff;
};

const hasDiffChanges = (diff = {}) => Object.keys(diff).length > 0;

const mapLogRowToResponse = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    vehicle_id: row.vehicle_id,
    action: row.action,
    changed_fields: safeParseJSON(row.changed_fields) || {},
    previous_snapshot: safeParseJSON(row.previous_snapshot),
    new_snapshot: safeParseJSON(row.new_snapshot),
    performed_by: {
      id: row.performed_by_user_id,
      username: row.performed_by_username,
      role: row.performed_by_role
    },
    created_at: row.created_at,
    current_vehicle: row.current_license_plate ? {
      license_plate: row.current_license_plate,
      zone: row.current_zone,
      brand: row.current_brand,
      model: row.current_model
    } : null
  };
};

const logVehicleChange = ({
  vehicleId,
  action,
  previousSnapshot,
  newSnapshot,
  changedFields,
  user
}) => {
  try {
    const result = db.prepare(`
      INSERT INTO vehicle_change_logs (
        vehicle_id,
        action,
        changed_fields,
        previous_snapshot,
        new_snapshot,
        performed_by_user_id,
        performed_by_username,
        performed_by_role
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      vehicleId || null,
      action,
      JSON.stringify(changedFields || {}),
      previousSnapshot ? JSON.stringify(previousSnapshot) : null,
      newSnapshot ? JSON.stringify(newSnapshot) : null,
      user?.id || null,
      user?.username || null,
      user?.role || null
    );

    if (result?.lastInsertRowid) {
      const logRow = db.prepare(`${LOG_WITH_VEHICLE_BASE_SELECT} WHERE logs.id = ?`).get(result.lastInsertRowid);
      const payload = mapLogRowToResponse(logRow);
      if (payload) {
        io.emit('vehicle:log_created', payload);
        const totalLogs = db.prepare('SELECT COUNT(*) as count FROM vehicle_change_logs').get()?.count || 0;
        io.emit('vehicle:logs_total', { total: totalLogs });
        return payload;
      }
    }
  } catch (error) {
    console.error('Failed to log vehicle change:', error);
  }
  return null;
};

try {
  const userColumns = db.prepare('PRAGMA table_info(users)').all();
  const hasRoleColumn = userColumns.some(column => column.name === 'role');
  if (!hasRoleColumn) {
    db.prepare("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'member'").run();
    console.log('✅ Added role column to users table');
  }
} catch (error) {
  console.error('⚠️ Failed to ensure role column on users table:', error.message);
}

const ensureVehicleColumn = (name, definition) => {
  try {
    const columns = db.prepare('PRAGMA table_info(vehicles)').all();
    const exists = columns.some(column => column.name === name);
    if (!exists) {
      db.prepare(`ALTER TABLE vehicles ADD COLUMN ${name} ${definition}`).run();
      console.log(`✅ Added ${name} column to vehicles table`);
    }
  } catch (error) {
    console.error(`⚠️ Failed to ensure ${name} column on vehicles table:`, error.message);
  }
};

ensureVehicleColumn('sequence_no', 'INTEGER');
ensureVehicleColumn('updated_date', 'TEXT');
ensureVehicleColumn('transaction_type', 'TEXT');
ensureVehicleColumn('document_status', 'TEXT');
ensureVehicleColumn('grade', 'TEXT');
ensureVehicleColumn('rmo', 'TEXT');
ensureVehicleColumn('cmo', 'TEXT');
ensureVehicleColumn('gp_approval_status', 'TEXT');
ensureVehicleColumn('policy_type', 'TEXT');
ensureVehicleColumn('policy_amount', 'REAL');
ensureVehicleColumn('note_summary', 'TEXT');
ensureVehicleColumn('key_number', 'TEXT');
ensureVehicleColumn('in_workshop', 'INTEGER DEFAULT 0');
ensureVehicleColumn('workshop_name', 'TEXT');
ensureVehicleColumn('workshop_notes', 'TEXT');
ensureVehicleColumn('workshop_entry_time', 'TEXT');
ensureVehicleColumn('in_auction', 'INTEGER DEFAULT 0');
ensureVehicleColumn('auction_name', 'TEXT');
ensureVehicleColumn('auction_notes', 'TEXT');
ensureVehicleColumn('auction_entry_time', 'TEXT');
ensureVehicleColumn('in_sale', 'INTEGER DEFAULT 0');
ensureVehicleColumn('sale_notes', 'TEXT');
ensureVehicleColumn('sale_entry_time', 'TEXT');

const adminExists = db.prepare('SELECT * FROM users WHERE username = ?').get('admin');
if (!adminExists) {
  bcrypt.hash('admin123', 10, (err, hashedPassword) => {
    if (err) {
      console.error('❌ Failed to hash admin password:', err);
      return;
    }
    db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)').run('admin', hashedPassword, 'admin');
    console.log('Default admin user created (username: admin, password: admin123)');
  });
} else if (adminExists.role !== 'admin') {
  db.prepare('UPDATE users SET role = ? WHERE username = ?').run('admin', 'admin');
}

process.on('SIGTERM', () => {
  console.log('⚠️ SIGTERM received, closing server gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    if (db) db.close();
    process.exit(0);
  });
});

app.get('/api/vehicle-columns', authenticateToken, (req, res) => {
  try {
    const columns = getAllVehicleColumns();
    res.json(columns.map(serializeVehicleColumn));
  } catch (error) {
    console.error('Get vehicle columns error:', error);
    res.status(500).json({ error: 'Failed to load columns' });
  }
});

app.post('/api/vehicle-columns', authenticateToken, requireAdmin, (req, res) => {
  try {
    const payload = req.body || {};
    const rawLabel = (payload.label ?? '').toString().trim();
    let columnKey = (payload.column_key ?? '').toString().trim();

    if (!rawLabel && !columnKey) {
      return res.status(400).json({ error: 'label or column_key is required' });
    }

    if (!columnKey) {
      columnKey = slugifyColumnKey(rawLabel);
    }

    const type = VALID_CUSTOM_COLUMN_TYPES.has(payload.type) ? payload.type : 'text';
    let orderIndex = Number.isFinite(payload.order_index) ? payload.order_index : null;
    if (!orderIndex && payload.insert_before_key) {
      orderIndex = getOrderIndexBeforeKey(payload.insert_before_key) || null;
    }
    if (!orderIndex) {
      orderIndex = getNextCustomColumnOrderIndex();
    }

    if (getVehicleColumnByKey(columnKey)) {
      return res.status(400).json({ error: 'column_key already exists' });
    }

    const result = db.prepare(`
      INSERT INTO vehicle_columns (column_key, label, type, source, order_index, is_active)
      VALUES (?, ?, ?, 'custom', ?, ?)
    `).run(
      columnKey,
      rawLabel || columnKey,
      type,
      orderIndex,
      payload.is_active === false ? 0 : 1
    );

    reindexVehicleColumns();
    const column = getVehicleColumnById(result.lastInsertRowid);
    res.json(serializeVehicleColumn(column));
  } catch (error) {
    console.error('Create vehicle column error:', error);
    res.status(500).json({ error: 'Failed to create column' });
  }
});

app.patch('/api/vehicle-columns/:id', authenticateToken, requireAdmin, (req, res) => {
  try {
    const columnId = Number(req.params.id);
    const column = getVehicleColumnById(columnId);
    if (!column) {
      return res.status(404).json({ error: 'Column not found' });
    }

    const payload = req.body || {};
    const nextLabel = payload.label !== undefined ? payload.label.toString().trim() : column.label;
    const nextType = payload.type ? (VALID_CUSTOM_COLUMN_TYPES.has(payload.type) ? payload.type : column.type) : column.type;
    let nextOrderIndex = Number.isFinite(payload.order_index) ? payload.order_index : column.order_index;
    if (!Number.isFinite(nextOrderIndex) && payload.insert_before_key) {
      nextOrderIndex = getOrderIndexBeforeKey(payload.insert_before_key) || column.order_index;
    }
    if (!Number.isFinite(nextOrderIndex)) {
      nextOrderIndex = column.order_index;
    }
    const nextIsActive = payload.is_active === undefined ? column.is_active : (payload.is_active ? 1 : 0);

    db.prepare(`
      UPDATE vehicle_columns
      SET label = ?, type = ?, order_index = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(nextLabel || column.label, nextType, nextOrderIndex, nextIsActive, columnId);

    reindexVehicleColumns();
    const updated = getVehicleColumnById(columnId);
    res.json(serializeVehicleColumn(updated));
  } catch (error) {
    console.error('Update vehicle column error:', error);
    res.status(500).json({ error: 'Failed to update column' });
  }
});

app.delete('/api/vehicle-columns/:id', authenticateToken, requireAdmin, (req, res) => {
  try {
    const columnId = Number(req.params.id);
    const column = getVehicleColumnById(columnId);
    if (!column) {
      return res.status(404).json({ error: 'Column not found' });
    }

    if (column.source === 'system') {
      return res.status(400).json({ error: 'System columns cannot be deleted' });
    }

    db.prepare('DELETE FROM vehicle_columns WHERE id = ?').run(columnId);
    reindexVehicleColumns();
    res.json({ success: true });
  } catch (error) {
    console.error('Delete vehicle column error:', error);
    res.status(500).json({ error: 'Failed to delete column' });
  }
});

app.post('/api/vehicles/clear-canvas', authenticateToken, requireAdmin, (req, res) => {
  const { parking_lot_number } = req.body;

  if (!parking_lot_number) {
    return res.status(400).json({ error: 'parking_lot_number is required' });
  }

  const vehiclesInLot = db
    .prepare('SELECT id FROM vehicles WHERE parking_lot_number = ?')
    .all(parking_lot_number);

  if (!vehiclesInLot.length) {
    return res.json({ cleared: 0 });
  }

  const ids = vehiclesInLot.map((v) => v.id);
  const placeholders = ids.map(() => '?').join(',');
  db.prepare(`DELETE FROM vehicle_positions WHERE vehicle_id IN (${placeholders})`).run(...ids);

  const updatedVehicles = db.prepare(`
    SELECT v.*, vp.x, vp.y, vp.rotation
    FROM vehicles v
    LEFT JOIN vehicle_positions vp ON v.id = vp.vehicle_id
    WHERE v.id IN (${placeholders})
  `).all(...ids);

  updatedVehicles.forEach(vehicle => io.emit('vehicle:updated', vehicle));

  res.json({ cleared: updatedVehicles.length });
});

app.put('/api/vehicles/bulk-update', authenticateToken, requireAdmin, (req, res) => {
  try {
    const updates = Array.isArray(req.body) ? req.body : req.body?.updates;

    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ error: 'Invalid payload: updates array required' });
    }

    const processUpdates = db.transaction((items) => {
      items.forEach((item) => {
        const vehicleId = Number(item?.id);
        if (!vehicleId) {
          throw new Error('Vehicle ID is required for bulk update');
        }

        const beforeSnapshot = getVehicleWithPositionById(vehicleId);
        if (!beforeSnapshot) {
          throw new Error(`Vehicle not found for ID ${vehicleId}`);
        }

        const fieldEntries = Object.entries(item || {}).filter(([key]) => EDITABLE_VEHICLE_FIELDS.has(key));
        const updatesToApply = {};

        fieldEntries.forEach(([key, value]) => {
          if (NUMERIC_EDITABLE_FIELDS.has(key)) {
            if (value === '' || value === null || value === undefined) {
              updatesToApply[key] = null;
            } else {
              const numValue = Number(value);
              updatesToApply[key] = Number.isFinite(numValue) ? numValue : null;
            }
          } else {
            updatesToApply[key] = value === undefined || value === null ? '' : value;
          }
        });

        if (Object.keys(updatesToApply).length > 0) {
          const setClauses = Object.keys(updatesToApply).map((key) => `${key} = ?`);
          const values = Object.values(updatesToApply);
          values.push(vehicleId);
          db.prepare(`
            UPDATE vehicles
            SET ${setClauses.join(', ')}, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(...values);
        }

        if (item?.custom_fields !== undefined) {
          const sanitizedCustomFields = sanitizeCustomFieldsPayload(item.custom_fields);
          saveVehicleCustomFields(vehicleId, sanitizedCustomFields);
        }

        const afterSnapshot = getVehicleWithPositionById(vehicleId);
        const changedFields = computeVehicleDiff(beforeSnapshot, afterSnapshot);
        if (hasDiffChanges(changedFields)) {
          logVehicleChange({
            vehicleId,
            action: 'bulk_update',
            previousSnapshot: beforeSnapshot,
            newSnapshot: afterSnapshot,
            changedFields,
            user: req.user
          });
        }
      });
    });

    processUpdates(updates);

    const refreshedVehicles = attachCustomFieldsToVehicles(db.prepare(`
      SELECT v.*, vp.x, vp.y, vp.rotation
      FROM vehicles v
      LEFT JOIN vehicle_positions vp ON v.id = vp.vehicle_id
    `).all());

    io.emit('vehicles:bulk_updated', refreshedVehicles);
    res.json({ success: true, count: updates.length });
  } catch (error) {
    console.error('Bulk update error:', error);
    res.status(500).json({ error: 'Failed to update vehicles', details: error.message });
  }
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;

    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = createToken(user);
    
    res.json({ 
      token, 
      user: { 
        id: user.id, 
        username: user.username,
        role: user.role
      } 
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post('/api/auth/register', authLimiter, authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { username, password, role = 'member' } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    if (!['admin', 'member'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const existingUser = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (existingUser) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)').run(username, hashedPassword, role);

    res.json({ 
      user: { 
        id: result.lastInsertRowid, 
        username, 
        role 
      } 
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/users', authenticateToken, requireAdmin, (req, res) => {
  try {
    const users = db.prepare('SELECT id, username, role, created_at FROM users ORDER BY created_at DESC').all();
    res.json(users);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

app.get('/api/vehicles', authenticateToken, (req, res) => {
  try {
    const { parking_lot, search } = req.query;
    
    let query = 'SELECT v.*, vp.x, vp.y, vp.rotation FROM vehicles v LEFT JOIN vehicle_positions vp ON v.id = vp.vehicle_id';
    const params = [];
    const conditions = [];

    if (parking_lot) {
      conditions.push('v.parking_lot_number = ?');
      params.push(parking_lot);
    }

    if (search) {
      conditions.push('(v.license_plate LIKE ? OR v.brand LIKE ? OR v.model LIKE ? OR v.zone LIKE ?)');
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern, searchPattern);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY v.id ASC';

    const vehicles = db.prepare(query).all(...params);
    res.json(attachCustomFieldsToVehicles(vehicles));
  } catch (error) {
    console.error('Get vehicles error:', error);
    res.status(500).json({ error: 'Failed to fetch vehicles' });
  }
});

app.get('/api/vehicles/:id', authenticateToken, (req, res) => {
  try {
    const vehicle = db.prepare(`
      SELECT v.*, vp.x, vp.y, vp.rotation 
      FROM vehicles v 
      LEFT JOIN vehicle_positions vp ON v.id = vp.vehicle_id 
      WHERE v.id = ?
    `).get(req.params.id);
    
    if (!vehicle) {
      return res.status(404).json({ error: 'Vehicle not found' });
    }

    res.json(attachCustomFieldsToVehicle(vehicle));
  } catch (error) {
    console.error('Get vehicle error:', error);
    res.status(500).json({ error: 'Failed to fetch vehicle' });
  }
});

app.get('/api/vehicle-logs', authenticateToken, allowCanvasEditors, (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 200);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    const vehicleId = req.query.vehicle_id ? Number(req.query.vehicle_id) : null;

    const conditions = [];
    const params = [];

    if (vehicleId) {
      conditions.push('logs.vehicle_id = ?');
      params.push(vehicleId);
    }

    let query = `
      ${LOG_WITH_VEHICLE_BASE_SELECT}
    `;

    if (conditions.length) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ' ORDER BY logs.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const rows = db.prepare(query).all(...params);
    const total = vehicleId
      ? db.prepare('SELECT COUNT(*) as count FROM vehicle_change_logs WHERE vehicle_id = ?').get(vehicleId)?.count || 0
      : db.prepare('SELECT COUNT(*) as count FROM vehicle_change_logs').get()?.count || 0;

    const logs = rows.map(mapLogRowToResponse);

    res.json({
      logs,
      pagination: {
        limit,
        offset,
        total
      }
    });
  } catch (error) {
    console.error('Get vehicle logs error:', error);
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

app.get('/api/vehicle-logs/export', authenticateToken, allowCanvasEditors, (req, res) => {
  try {
    const vehicleId = req.query.vehicle_id ? Number(req.query.vehicle_id) : null;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 5000, 1), 10000);
    const formatParam = (req.query.format || 'xlsx').toString().toLowerCase();
    const allowedFormats = new Set(['xlsx', 'csv', 'json']);
    const exportFormat = allowedFormats.has(formatParam) ? formatParam : 'xlsx';

    const conditions = [];
    const params = [];

    if (vehicleId) {
      conditions.push('logs.vehicle_id = ?');
      params.push(vehicleId);
    }

    let query = `${LOG_WITH_VEHICLE_BASE_SELECT}`;
    if (conditions.length) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }
    query += ' ORDER BY logs.created_at DESC LIMIT ?';
    params.push(limit);

    const rows = db.prepare(query).all(...params);
    const logs = rows.map(mapLogRowToResponse);

    // Sort by license_plate first, then by created_at (ascending for chronological order)
    logs.sort((a, b) => {
      const plateA = (a.current_vehicle?.license_plate || '').toLowerCase();
      const plateB = (b.current_vehicle?.license_plate || '').toLowerCase();
      
      if (plateA !== plateB) {
        return plateA.localeCompare(plateB);
      }
      
      // Same license plate, sort by date ascending (oldest first)
      return new Date(a.created_at) - new Date(b.created_at);
    });

    // Get all vehicle columns from database to match table structure
    const vehicleColumns = db.prepare('SELECT column_key, label FROM vehicle_columns WHERE is_active = 1 ORDER BY order_index').all();
    
    // Fetch custom fields for all vehicles in logs
    const vehicleIds = logs.map(log => log.current_vehicle?.id).filter(id => id);
    const customFieldsMap = vehicleIds.length > 0 
      ? fetchCustomFieldsByVehicleIds(vehicleIds)
      : {};
    
    const workbook = XLSX.utils.book_new();
    
    // Build header row
    const headerRow = [];
    vehicleColumns.forEach((col) => {
      headerRow.push(col.label);
    });
    // Add log info columns at the end
    headerRow.push('ลำดับ Log');
    headerRow.push('การดำเนินการ');
    headerRow.push('ฟิลด์ที่เปลี่ยน');
    headerRow.push('รายละเอียดการเปลี่ยนแปลง');
    headerRow.push('วันที่ Log');
    headerRow.push('ผู้ดำเนินการ');
    headerRow.push('บทบาท');

    // Build data rows
    const dataRows = logs.map((log) => {
      const vehicle = log.current_vehicle || {};
      const vehicleId = vehicle.id;
      const customFields = customFieldsMap[vehicleId] || {};
      const changedFields = log.changed_fields || {};
      const changeDetails = Object.entries(changedFields).map(([field, change]) => {
        if (typeof change === 'object' && change !== null && 'before' in change && 'after' in change) {
          return `${field}: ${change.before} → ${change.after}`;
        }
        return `${field}: ${JSON.stringify(change)}`;
      }).join('\n');

      const row = [];
      
      // Add vehicle columns in order (both system and custom)
      vehicleColumns.forEach((col) => {
        const columnKey = col.column_key;
        // Check if it's a custom field first, then fall back to system field
        const value = customFields[columnKey] !== undefined ? customFields[columnKey] : (vehicle[columnKey] || '');
        row.push(value);
      });
      
      // Add log info columns
      row.push(log.id);
      row.push(log.action);
      row.push(Object.keys(changedFields).join(', '));
      row.push(changeDetails);
      row.push(log.created_at);
      row.push(log.performed_by?.username || 'ระบบ');
      row.push(log.performed_by?.role || '');

      return row;
    });

    const worksheet = XLSX.utils.aoa_to_sheet([headerRow, ...dataRows]);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Vehicle Logs');
    const dateStamp = new Date().toISOString().split('T')[0];
    const filenameBase = `vehicle-logs${vehicleId ? `-${vehicleId}` : ''}-${dateStamp}`;

    if (exportFormat === 'json') {
      // Convert array data to JSON objects
      const jsonData = dataRows.map((row) => {
        const obj = {};
        headerRow.forEach((header, index) => {
          obj[header] = row[index] || '';
        });
        return obj;
      });
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${filenameBase}.json"`);
      return res.send(JSON.stringify(jsonData, null, 2));
    }

    if (exportFormat === 'csv') {
      const csv = XLSX.utils.sheet_to_csv(worksheet);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filenameBase}.csv"`);
      return res.send(csv);
    }

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filenameBase}.xlsx"`);
    return res.send(buffer);
  } catch (error) {
    console.error('Export vehicle logs error:', error);
    res.status(500).json({ error: 'Failed to export logs' });
  }
});

app.get('/api/vehicle-logs/export-full', authenticateToken, requireAdmin, (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 5000, 50000);
    const exportFormat = req.query.format || 'xlsx';

    // Get all vehicle columns from database to match table structure
    const vehicleColumns = db.prepare('SELECT column_key, label FROM vehicle_columns WHERE is_active = 1 ORDER BY order_index').all();

    const logsRaw = db.prepare(`
      SELECT l.id as log_id, l.vehicle_id, l.action, l.changed_fields, l.new_snapshot, l.created_at, l.performed_by_username, l.performed_by_role
      FROM vehicle_change_logs l
      ORDER BY l.vehicle_id ASC, l.created_at ASC
      LIMIT ?
    `).all(limit);

    const allLogs = [];
    logsRaw.forEach(row => {
      allLogs.push({
        logId: row.log_id,
        vehicleId: row.vehicle_id,
        action: row.action,
        changedFields: row.changed_fields ? JSON.parse(row.changed_fields) : {},
        snapshot: row.new_snapshot ? JSON.parse(row.new_snapshot) : {},
        createdAt: row.created_at,
        performedByUsername: row.performed_by_username,
        performedByRole: row.performed_by_role
      });
    });

    // Fetch custom fields for all vehicles in logs
    const vehicleIds = allLogs.map(log => log.vehicleId).filter(id => id);
    const customFieldsMap = vehicleIds.length > 0 
      ? fetchCustomFieldsByVehicleIds(vehicleIds)
      : {};

    // Build header row
    const headerRow = [];
    vehicleColumns.forEach((col) => {
      headerRow.push(col.label);
    });
    // Add log info columns at the end
    headerRow.push('ลำดับ Log');
    headerRow.push('การดำเนินการ');
    headerRow.push('ฟิลด์ที่เปลี่ยน');
    headerRow.push('รายละเอียดการเปลี่ยนแปลง');
    headerRow.push('วันที่ Log');
    headerRow.push('ผู้ดำเนินการ');
    headerRow.push('บทบาท');

    // Build data rows
    const dataRows = allLogs.map((log) => {
      const vehicleSnapshot = log.snapshot || {};
      const vehicleId = log.vehicleId;
      const customFields = customFieldsMap[vehicleId] || {};
      const changedFields = log.changedFields || {};
      const changeDetails = Object.entries(changedFields).map(([field, change]) => {
        if (typeof change === 'object' && change !== null && 'before' in change && 'after' in change) {
          return `${field}: ${change.before} → ${change.after}`;
        }
        return `${field}: ${JSON.stringify(change)}`;
      }).join('\n');

      const row = [];
      
      // Add vehicle columns in order (both system and custom)
      vehicleColumns.forEach((col) => {
        const columnKey = col.column_key;
        // Check if it's a custom field first, then fall back to snapshot field
        const value = customFields[columnKey] !== undefined ? customFields[columnKey] : (vehicleSnapshot[columnKey] || '');
        row.push(value);
      });
      
      // Add log info columns
      row.push(log.logId);
      row.push(log.action);
      row.push(Object.keys(changedFields).join(', '));
      row.push(changeDetails);
      row.push(log.createdAt);
      row.push(log.performedByUsername || 'ระบบ');
      row.push(log.performedByRole || '');

      return row;
    });

    const worksheet = XLSX.utils.aoa_to_sheet([headerRow, ...dataRows]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Vehicle Logs Full');

    const dateStamp = new Date().toISOString().split('T')[0];
    const filenameBase = `vehicle-logs-full-${dateStamp}`;

    if (exportFormat === 'json') {
      // Convert array data to JSON objects
      const jsonData = dataRows.map((row) => {
        const obj = {};
        headerRow.forEach((header, index) => {
          obj[header] = row[index] || '';
        });
        return obj;
      });
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${filenameBase}.json"`);
      return res.send(JSON.stringify(jsonData, null, 2));
    }

    if (exportFormat === 'csv') {
      const csv = XLSX.utils.sheet_to_csv(worksheet);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filenameBase}.csv"`);
      return res.send(csv);
    }

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filenameBase}.xlsx"`);
    return res.send(buffer);
  } catch (error) {
    console.error('Export full vehicle logs error:', error);
    res.status(500).json({ error: 'ไม่สามารถส่งออกบันทึกได้', details: error.message });
  }
});

app.get('/api/rmo-export', authenticateToken, allowCanvasEditors, (req, res) => {
  try {
    const templateColumns = getRmoTemplateColumns();
    if (!templateColumns.length) {
      return res.status(400).json({ error: 'ไม่พบคอลัมน์ RMO ในระบบ' });
    }

    const headerDefinitions = [
      ...RMO_TEMPLATE_STATIC_COLUMNS.map((column) => ({
        key: column.key,
        label: column.label,
        getValue: column.getValue
      })),
      ...templateColumns.map((column) => ({
        key: column.column_key,
        label: getColumnLabel(column)
      }))
    ];

    const vehicles = db.prepare('SELECT * FROM vehicles ORDER BY id ASC').all();
    const headerLabels = headerDefinitions.map((column) => column.label);
    const rows = vehicles.map((vehicle) => (
      headerDefinitions.map((column) => {
        if (column.getValue) {
          return column.getValue(vehicle) ?? '';
        }
        // Get value from vehicle object using the column key
        const value = vehicle?.[column.key];
        return value || '';
      })
    ));

    const worksheet = XLSX.utils.aoa_to_sheet([
      headerLabels,
      ...rows
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'RMO Update');

    const dateStamp = new Date().toISOString().split('T')[0];
    const filename = `rmo-update-${dateStamp}.xlsx`;

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(buffer);
  } catch (error) {
    console.error('RMO export error:', error);
    res.status(500).json({ error: 'ไม่สามารถส่งออกไฟล์ RMO ได้' });
  }
});

app.post('/api/rmo-import', authenticateToken, allowCanvasEditors, upload.single('file'), (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'กรุณาอัปโหลดไฟล์ Excel' });
    }

    const templateColumns = getRmoTemplateColumns();
    if (!templateColumns.length) {
      return res.status(400).json({ error: 'ไม่พบคอลัมน์ RMO ในระบบ' });
    }

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const sheetName = workbook.SheetNames?.[0];
    if (!sheetName) {
      return res.status(400).json({ error: 'ไม่พบชีตข้อมูลในไฟล์' });
    }

    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
    if (!rows.length) {
      return res.status(400).json({ error: 'ไฟล์ไม่มีข้อมูลสำหรับนำเข้า' });
    }

    const headerRow = rows.shift();
    if (!headerRow || !headerRow.length) {
      return res.status(400).json({ error: 'ไฟล์ไม่มีส่วนหัวคอลัมน์' });
    }

    const staticHeaderMap = new Map();
    RMO_TEMPLATE_STATIC_COLUMNS.forEach((column) => {
      const labelKey = normalizeHeaderLabel(column.label);
      const keyKey = normalizeHeaderLabel(column.key);
      if (labelKey) staticHeaderMap.set(labelKey, column.key);
      if (keyKey) staticHeaderMap.set(keyKey, column.key);
    });

    const templateHeaderMap = new Map();
    templateColumns.forEach((column) => {
      const labelKey = normalizeHeaderLabel(getColumnLabel(column));
      const keyKey = normalizeHeaderLabel(column.column_key);
      if (labelKey) templateHeaderMap.set(labelKey, column);
      if (keyKey) templateHeaderMap.set(keyKey, column);
    });

    const headerParsers = headerRow.map((label, columnIndex) => {
      const normalized = normalizeHeaderLabel(label);
      if (!normalized) return null;
      if (staticHeaderMap.has(normalized)) {
        return { type: 'static', key: staticHeaderMap.get(normalized), columnIndex };
      }
      const templateColumn = templateHeaderMap.get(normalized);
      if (templateColumn) {
        return { type: 'template', column: templateColumn, columnIndex };
      }
      return null;
    });

    const hasRmoColumn = headerParsers.some((parser) => parser?.type === 'template' && parser.column?.column_key === 'rmo');
    if (!hasRmoColumn) {
      return res.status(400).json({ error: 'ไฟล์ต้องมีคอลัมน์ RMO เพื่อใช้นำเข้าข้อมูล' });
    }

    const vehicles = db.prepare('SELECT id, license_plate, rmo FROM vehicles').all();
    if (!vehicles.length) {
      return res.status(400).json({ error: 'ยังไม่มีข้อมูลรถในระบบ' });
    }

    const vehicleById = new Map();
    const vehiclesByRmo = new Map();
    const vehiclesByPlate = new Map();

    vehicles.forEach((vehicle) => {
      vehicleById.set(vehicle.id, vehicle);

      const rmoKey = normalizeRmoKey(vehicle.rmo);
      if (rmoKey) {
        if (!vehiclesByRmo.has(rmoKey)) {
          vehiclesByRmo.set(rmoKey, []);
        }
        vehiclesByRmo.get(rmoKey).push(vehicle);
      }

      const plateKey = normalizeLicensePlate(vehicle.license_plate);
      if (plateKey) {
        if (!vehiclesByPlate.has(plateKey)) {
          vehiclesByPlate.set(plateKey, []);
        }
        vehiclesByPlate.get(plateKey).push(vehicle);
      }
    });

    const resolveVehicle = ({ idValue, rmoValue, plateValue }) => {
      if (Number.isFinite(idValue) && idValue > 0 && vehicleById.has(idValue)) {
        return { vehicle: vehicleById.get(idValue) };
      }

      const rmoKey = normalizeRmoKey(rmoValue);
      if (rmoKey) {
        const matches = vehiclesByRmo.get(rmoKey) || [];
        if (matches.length === 1) {
          return { vehicle: matches[0] };
        }
        if (matches.length > 1) {
          return { error: 'พบเลข RMO ซ้ำหลายคัน กรุณาระบุ ID' };
        }
      }

      const plateKey = normalizeLicensePlate(plateValue);
      if (plateKey) {
        const matches = vehiclesByPlate.get(plateKey) || [];
        if (matches.length === 1) {
          return { vehicle: matches[0] };
        }
        if (matches.length > 1) {
          return { error: 'ทะเบียนรถนี้มีหลายคัน กรุณาระบุ ID หรือ RMO' };
        }
      }

      return { error: 'ไม่พบรถจากข้อมูลในแถวนี้' };
    };

    const templateColumnKeyMap = new Map(templateColumns.map((column) => [column.column_key, column]));
    const isSystemColumn = (columnKey) => BASE_VEHICLE_FIELDS.has(columnKey) || EDITABLE_VEHICLE_FIELDS.has(columnKey);

    let processed = 0;
    let updated = 0;
    let skipped = 0;
    const failures = [];
    const updatedVehicleIds = new Set();

    rows.forEach((row, dataIndex) => {
      const excelRowNumber = dataIndex + 2; // account for header row
      const hasAnyValue = Array.isArray(row) && row.some((value) => hasMeaningfulCellValue(value));
      if (!hasAnyValue) {
        skipped += 1;
        return;
      }

      processed += 1;
      const staticValues = {};
      const templateValues = {};

      headerParsers.forEach((parser) => {
        if (!parser) return;
        const cellValue = row[parser.columnIndex];
        if (!hasMeaningfulCellValue(cellValue)) return;
        if (parser.type === 'static') {
          staticValues[parser.key] = cellValue;
        } else if (parser.type === 'template' && parser.column?.column_key) {
          templateValues[parser.column.column_key] = cellValue;
        }
      });

      // Handle destination_lot as a special case if it appears in the header but not in template columns
      // For RMO updates, we use destination_lot instead of origin_lot
      const headerRowStr = headerRow.map(h => normalizeHeaderLabel(h)).join('|');
      if (headerRowStr.includes('ลานปลายทาง') || headerRowStr.includes('destination_lot')) {
        const destinationLotIndex = headerRow.findIndex(h => {
          const normalized = normalizeHeaderLabel(h);
          return normalized === normalizeHeaderLabel('ลานปลายทาง') || normalized === normalizeHeaderLabel('destination_lot');
        });
        // Include destination_lot even if it's empty (for RMO updates to clear the lot)
        if (destinationLotIndex !== -1) {
          const cellValue = row[destinationLotIndex];
          if (cellValue !== undefined && cellValue !== null) {
            templateValues.destination_lot = cellValue;
          }
        }
      }

      const rawId = staticValues.id;
      const parsedId = rawId === undefined || rawId === null || rawId === '' ? null : Number(rawId);
      const rmoValue = templateValues.rmo ?? staticValues.rmo;
      const licenseValue = staticValues.license_plate;

      console.log(`RMO import row ${excelRowNumber}: id=${parsedId}, rmo=${rmoValue}, license=${licenseValue}, templateValues=${JSON.stringify(templateValues)}`);

      const { vehicle, error: resolveError } = resolveVehicle({
        idValue: parsedId,
        rmoValue,
        plateValue: licenseValue
      });

      if (!vehicle) {
        console.log(`RMO import row ${excelRowNumber} failed: ${resolveError || 'ไม่พบข้อมูลรถ'}`);
        failures.push({ row: excelRowNumber, reason: resolveError || 'ไม่พบข้อมูลรถ' });
        return;
      }

      const systemUpdates = {};
      const customUpdates = {};
      
      console.log(`RMO import row ${excelRowNumber}: found vehicle ${vehicle.id}`);

      Object.entries(templateValues).forEach(([columnKey, rawValue]) => {
        const column = templateColumnKeyMap.get(columnKey);
        if (!column) return;

        if (isSystemColumn(columnKey) && EDITABLE_VEHICLE_FIELDS.has(columnKey)) {
          if (columnKey === 'rmo') {
            const currentValue = vehicle?.rmo || '';
            const normalizedCurrent = normalizeRmoKey(currentValue);
            const normalizedIncoming = normalizeRmoKey(rawValue);
            if (normalizedCurrent === normalizedIncoming) {
              return;
            }
          }

          const formatted = formatValueForSystemField(column, rawValue);
          // For RMO updates, allow empty values to overwrite existing data
          if (formatted !== undefined || rawValue === '' || rawValue === null) {
            systemUpdates[columnKey] = formatted !== undefined ? formatted : '';
          }
        } else if (!isSystemColumn(columnKey)) {
          const formatted = formatValueForCustomField(column, rawValue);
          // For RMO updates, allow empty values to overwrite existing data
          if (formatted !== undefined || rawValue === '' || rawValue === null) {
            customUpdates[columnKey] = formatted !== undefined ? formatted : '';
          }
        }
      });

      // Handle destination_lot mapping to parking_lot_name for RMO updates
      // For RMO updates, destination_lot is the primary source for parking_lot_name
      if (templateValues.destination_lot !== undefined) {
        // If destination_lot has a value (including empty string), use it
        systemUpdates.parking_lot_name = templateValues.destination_lot;
        systemUpdates.destination_lot = templateValues.destination_lot;
      } else if (templateValues.origin_lot !== undefined && !systemUpdates.parking_lot_name) {
        // Fall back to origin_lot only if destination_lot is not provided
        systemUpdates.parking_lot_name = templateValues.origin_lot;
      }

      // If parking_lot_name is being updated from other sources, also update destination_lot
      if (systemUpdates.parking_lot_name && !systemUpdates.destination_lot) {
        systemUpdates.destination_lot = systemUpdates.parking_lot_name;
      }

      if (!Object.keys(systemUpdates).length && !Object.keys(customUpdates).length) {
        skipped += 1;
        return;
      }

      try {
        updateVehicleWithAudit(vehicle.id, 'rmo_bulk_update', (beforeSnapshot) => {
          const systemKeys = Object.keys(systemUpdates);
          if (systemKeys.length) {
            const setClauses = systemKeys.map((key) => `${key} = ?`).concat('updated_at = CURRENT_TIMESTAMP');
            const values = systemKeys.map((key) => systemUpdates[key]);
            values.push(vehicle.id);
            db.prepare(`
              UPDATE vehicles
              SET ${setClauses.join(', ')}
              WHERE id = ?
            `).run(...values);
          } else {
            db.prepare('UPDATE vehicles SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(vehicle.id);
          }

          if (Object.keys(customUpdates).length) {
            const sanitized = sanitizeCustomFieldsPayload(customUpdates);
            if (Object.keys(sanitized).length) {
              saveVehicleCustomFields(vehicle.id, sanitized);
            }
          }
        }, req.user);

        updated += 1;
        updatedVehicleIds.add(vehicle.id);
      } catch (error) {
        console.error(`RMO import row ${excelRowNumber} failed:`, error);
        failures.push({ row: excelRowNumber, reason: error.message || 'อัปเดตไม่สำเร็จ' });
      }
    });

    if (updatedVehicleIds.size > 0) {
      const refreshedVehicles = attachCustomFieldsToVehicles(db.prepare(`
        SELECT v.*, vp.x, vp.y, vp.rotation
        FROM vehicles v
        LEFT JOIN vehicle_positions vp ON v.id = vp.vehicle_id
      `).all());

      io.emit('vehicles:bulk_updated', refreshedVehicles);
    }

    res.json({
      success: failures.length === 0,
      processed,
      updated,
      skipped,
      failures,
      updated_vehicle_ids: Array.from(updatedVehicleIds)
    });
  } catch (error) {
    console.error('RMO import error:', error);
    res.status(500).json({ error: 'ไม่สามารถนำเข้าไฟล์ RMO ได้', details: error.message });
  }
});

app.post('/api/vehicles/direct-update', authenticateToken, requireAdmin, (req, res) => {
  try {
    const { updates } = req.body;
    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ error: 'ต้องระบุข้อมูลการอัปเดตอย่างน้อย 1 รายการ' });
    }

    const updatedVehicleIds = new Set();
    const failures = [];
    let processed = 0;
    let updated = 0;

    updates.forEach((item, idx) => {
      try {
        const { vehicle_id, updates: vehicleUpdates, custom_fields } = item;
        if (!vehicle_id || typeof vehicle_id !== 'number') {
          failures.push({ index: idx, error: 'vehicle_id ต้องเป็นตัวเลข' });
          return;
        }

        processed++;
        const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(vehicle_id);
        if (!vehicle) {
          failures.push({ index: idx, error: `ไม่พบรถ ID ${vehicle_id}` });
          return;
        }

        const updateData = {};
        const validFields = [
          'license_plate', 'province', 'brand', 'model', 'color', 'grade',
          'transaction_type', 'document_status', 'rmo', 'cmo', 'gp_approval_status',
          'policy_type', 'policy_amount', 'note_summary', 'key_status', 'key_number',
          'zone', 'parking_lot_number', 'parking_lot_name', 'sequence_no', 'start_time',
          'updated_date', 'notes'
        ];

        Object.entries(vehicleUpdates || {}).forEach(([key, value]) => {
          if (validFields.includes(key)) {
            if (key === 'policy_amount') {
              updateData[key] = value === '' || value === null ? null : Number(value);
            } else {
              updateData[key] = value;
            }
          }
        });

        if (Object.keys(updateData).length === 0 && (!custom_fields || Object.keys(custom_fields).length === 0)) {
          failures.push({ index: idx, error: 'ไม่มีข้อมูลการอัปเดต' });
          return;
        }

        updateVehicleWithAudit(vehicle_id, 'direct_update', (snapshot) => {
          Object.assign(snapshot, updateData);
          db.prepare(`
            UPDATE vehicles SET ${Object.keys(updateData).map(k => `${k} = ?`).join(', ')}
            WHERE id = ?
          `).run(...Object.values(updateData), vehicle_id);
        }, req.user);

        if (custom_fields && Object.keys(custom_fields).length > 0) {
          const sanitized = sanitizeCustomFieldsPayload(custom_fields);
          saveVehicleCustomFields(vehicle_id, sanitized);
        }

        updatedVehicleIds.add(vehicle_id);
        updated++;
      } catch (err) {
        failures.push({ index: idx, error: err.message });
      }
    });

    if (updatedVehicleIds.size > 0) {
      const refreshedVehicles = Array.from(updatedVehicleIds).map(id =>
        db.prepare(`
          SELECT v.*, 
                 json_object(
                   'x', vp.x,
                   'y', vp.y,
                   'rotation', vp.rotation
                 ) as position,
                 json_group_object(vcf.column_key, vcf.value) as custom_fields
          FROM vehicles v
          LEFT JOIN vehicle_positions vp ON v.id = vp.vehicle_id
          LEFT JOIN vehicle_custom_fields vcf ON v.id = vcf.vehicle_id
          WHERE v.id = ?
          GROUP BY v.id
        `).get(id)
      );

      io.emit('vehicles:bulk_updated', refreshedVehicles);
    }

    res.json({
      success: failures.length === 0,
      processed,
      updated,
      failures,
      updated_vehicle_ids: Array.from(updatedVehicleIds)
    });
  } catch (error) {
    console.error('Direct update error:', error);
    res.status(500).json({ error: 'ไม่สามารถอัปเดตข้อมูลได้', details: error.message });
  }
});

app.post('/api/vehicles', authenticateToken, requireAdmin, (req, res) => {
  try {
    const {
      start_time,
      updated_date,
      parking_lot_number,
      parking_lot_name,
      zone,
      license_plate,
      province,
      brand,
      model,
      color,
      sequence_no,
      grade,
      transaction_type,
      document_status,
      rmo,
      cmo,
      gp_approval_status,
      policy_type,
      policy_amount,
      note_summary,
      key_status,
      key_number,
      notes,
      custom_fields
    } = req.body;

    const parsedPolicyAmount = policy_amount === '' || policy_amount === null || policy_amount === undefined
      ? null
      : Number(policy_amount);
    const policyAmountValue = Number.isFinite(parsedPolicyAmount) ? parsedPolicyAmount : null;

    const result = db.prepare(`
      INSERT INTO vehicles (
        start_time,
        updated_date,
        parking_lot_number,
        parking_lot_name,
        zone,
        license_plate,
        province,
        brand,
        model,
        color,
        sequence_no,
        grade,
        transaction_type,
        document_status,
        rmo,
        cmo,
        gp_approval_status,
        policy_type,
        policy_amount,
        note_summary,
        key_status,
        key_number,
        notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      start_time,
      updated_date,
      parking_lot_number,
      parking_lot_name,
      zone,
      license_plate,
      province,
      brand,
      model,
      color,
      sequence_no,
      grade,
      transaction_type,
      document_status,
      rmo,
      cmo,
      gp_approval_status,
      policy_type,
      policyAmountValue,
      note_summary,
      key_status,
      key_number,
      notes
    );

    const sanitizedCustomFields = sanitizeCustomFieldsPayload(custom_fields);
    if (Object.keys(sanitizedCustomFields).length > 0) {
      saveVehicleCustomFields(result.lastInsertRowid, sanitizedCustomFields);
    }

    db.prepare('INSERT INTO vehicle_positions (vehicle_id, x, y, rotation) VALUES (?, NULL, NULL, 0)').run(result.lastInsertRowid);

    const vehicle = attachCustomFieldsToVehicle(db.prepare(`
      SELECT v.*, vp.x, vp.y, vp.rotation 
      FROM vehicles v 
      LEFT JOIN vehicle_positions vp ON v.id = vp.vehicle_id 
      WHERE v.id = ?
    `).get(result.lastInsertRowid));

    const changeDiff = computeVehicleDiff(null, vehicle);
    logVehicleChange({
      vehicleId: vehicle.id,
      action: 'create',
      previousSnapshot: null,
      newSnapshot: vehicle,
      changedFields: changeDiff,
      user: req.user
    });

    io.emit('vehicle:created', vehicle);
    res.json(vehicle);
  } catch (error) {
    console.error('Create vehicle error:', error);
    res.status(500).json({ error: 'Failed to create vehicle' });
  }
});

app.put('/api/vehicles/:id', authenticateToken, allowCanvasEditors, (req, res) => {
  try {
    const vehicleId = Number(req.params.id);
    const beforeSnapshot = getVehicleWithPositionById(vehicleId);
    if (!beforeSnapshot) {
      return res.status(404).json({ error: 'Vehicle not found' });
    }

    const {
      start_time,
      updated_date,
      parking_lot_number,
      parking_lot_name,
      zone,
      license_plate,
      province,
      brand,
      model,
      color,
      sequence_no,
      grade,
      transaction_type,
      document_status,
      rmo,
      cmo,
      gp_approval_status,
      policy_type,
      policy_amount,
      note_summary,
      key_status,
      key_number,
      notes,
      x,
      y,
      rotation,
      custom_fields
    } = req.body;

    const parsedPolicyAmount = policy_amount === '' || policy_amount === null || policy_amount === undefined
      ? null
      : Number(policy_amount);
    const policyAmountValue = Number.isFinite(parsedPolicyAmount) ? parsedPolicyAmount : null;
    
    // Auto-update updated_date to current timestamp
    const currentDateTime = new Date().toISOString();

    db.prepare(`
      UPDATE vehicles SET
        start_time = ?,
        updated_date = ?,
        parking_lot_number = ?,
        parking_lot_name = ?,
        zone = ?,
        license_plate = ?,
        province = ?,
        brand = ?,
        model = ?,
        color = ?,
        sequence_no = ?,
        grade = ?,
        transaction_type = ?,
        document_status = ?,
        rmo = ?,
        cmo = ?,
        gp_approval_status = ?,
        policy_type = ?,
        policy_amount = ?,
        note_summary = ?,
        key_status = ?,
        key_number = ?,
        notes = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      start_time,
      currentDateTime,
      parking_lot_number,
      parking_lot_name,
      zone,
      license_plate,
      province,
      brand,
      model,
      color,
      sequence_no,
      grade,
      transaction_type,
      document_status,
      rmo,
      cmo,
      gp_approval_status,
      policy_type,
      policyAmountValue,
      note_summary,
      key_status,
      key_number,
      notes,
      vehicleId
    );

    // Update position if provided
    if (x !== undefined && y !== undefined) {
      db.prepare(`
        INSERT INTO vehicle_positions (vehicle_id, x, y, rotation)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(vehicle_id) DO UPDATE SET
          x = excluded.x,
          y = excluded.y,
          rotation = excluded.rotation
      `).run(vehicleId, x, y, rotation || 0);
    }

    if (custom_fields !== undefined) {
      const sanitizedCustomFields = sanitizeCustomFieldsPayload(custom_fields);
      saveVehicleCustomFields(vehicleId, sanitizedCustomFields);
    }

    const vehicle = attachCustomFieldsToVehicle(db.prepare(`
      SELECT v.*, vp.x, vp.y, vp.rotation 
      FROM vehicles v 
      LEFT JOIN vehicle_positions vp ON v.id = vp.vehicle_id 
      WHERE v.id = ?
    `).get(vehicleId));

    const changedFields = computeVehicleDiff(beforeSnapshot, vehicle);
    if (hasDiffChanges(changedFields)) {
      logVehicleChange({
        vehicleId,
        action: 'update',
        previousSnapshot: beforeSnapshot,
        newSnapshot: vehicle,
        changedFields,
        user: req.user
      });
    }

    io.emit('vehicle:updated', vehicle);
    res.json(vehicle);
  } catch (error) {
    console.error('Update vehicle error:', error);
    res.status(500).json({ error: 'Failed to update vehicle' });
  }
});

// Clear all vehicles - must come BEFORE /:id route
app.delete('/api/vehicles/clear', authenticateToken, requireAdmin, (req, res) => {
  try {
    console.log('Starting clear all vehicles...');
    
    // Delete in correct order to avoid foreign key issues
    const deletePositions = db.prepare('DELETE FROM vehicle_positions');
    const posResult = deletePositions.run();
    console.log('Deleted positions:', posResult.changes);
    
    const deleteVehicles = db.prepare('DELETE FROM vehicles');
    const vehResult = deleteVehicles.run();
    console.log('Deleted vehicles:', vehResult.changes);
    
    // Reset auto-increment counter - force reset to 0
    try {
      // Always try to update, even if no record exists
      const resetVehicles = db.prepare('UPDATE sqlite_sequence SET seq = 0 WHERE name = ?');
      const vehResetResult = resetVehicles.run('vehicles');
      console.log('Reset vehicles sequence - changes:', vehResetResult.changes);
      
      const resetPositions = db.prepare('UPDATE sqlite_sequence SET seq = 0 WHERE name = ?');
      const posResetResult = resetPositions.run('vehicle_positions');
      console.log('Reset vehicle_positions sequence - changes:', posResetResult.changes);
      
      // Verify the reset
      const checkSeq = db.prepare('SELECT name, seq FROM sqlite_sequence WHERE name IN (?, ?)').all('vehicles', 'vehicle_positions');
      console.log('Current sequences after reset:', checkSeq);
    } catch (e) {
      console.error('sqlite_sequence reset error:', e.message);
    }
    
    console.log('Clear all completed successfully');
    io.emit('vehicles:bulk_created', []);
    res.json({ success: true, message: 'All data cleared', deleted: vehResult.changes });
  } catch (error) {
    console.error('Clear data error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ error: 'Failed to clear data', details: error.message });
  }
});

// Clear all vehicle logs
app.delete('/api/vehicle-logs/clear', authenticateToken, requireAdmin, (req, res) => {
  try {
    console.log('Starting clear all vehicle logs...');
    
    const deleteResult = db.prepare('DELETE FROM vehicle_change_logs').run();
    console.log('Deleted logs:', deleteResult.changes);
    
    res.json({ success: true, message: 'All logs cleared', deleted: deleteResult.changes });
  } catch (error) {
    console.error('Clear logs error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ error: 'Failed to clear logs', details: error.message });
  }
});

// Delete single vehicle - must come AFTER /clear route
app.delete('/api/vehicles/:id', authenticateToken, requireAdmin, (req, res) => {
  try {
    const vehicleId = Number(req.params.id);
    const existingSnapshot = getVehicleWithPositionById(vehicleId);
    if (!existingSnapshot) {
      return res.status(404).json({ error: 'Vehicle not found' });
    }

    db.prepare('DELETE FROM vehicle_positions WHERE vehicle_id = ?').run(vehicleId);
    db.prepare('DELETE FROM vehicle_custom_fields WHERE vehicle_id = ?').run(vehicleId);

    const result = db.prepare('DELETE FROM vehicles WHERE id = ?').run(vehicleId);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Vehicle not found' });
    }

    const changedFields = computeVehicleDiff(existingSnapshot, null);
    logVehicleChange({
      vehicleId,
      action: 'delete',
      previousSnapshot: existingSnapshot,
      newSnapshot: null,
      changedFields,
      user: req.user
    });

    console.log('Deleted vehicle:', req.params.id);
    io.emit('vehicle:deleted', { id: parseInt(req.params.id) });
    res.json({ success: true });
  } catch (error) {
    console.error('Delete vehicle error:', error);
    res.status(500).json({ error: 'Failed to delete vehicle' });
  }
});

app.post('/api/vehicles/bulk', authenticateToken, requireAdmin, (req, res) => {
  const vehicles = req.body;
  
  if (!vehicles || !Array.isArray(vehicles) || vehicles.length === 0) {
    return res.status(400).json({ error: 'Invalid vehicle data' });
  }

  try {
    db.prepare('DELETE FROM vehicle_positions').run();
    db.prepare('DELETE FROM vehicles').run();
    db.prepare('DELETE FROM vehicle_custom_fields').run();

    const insertVehicle = db.prepare(`
      INSERT INTO vehicles (
        start_time,
        updated_date,
        parking_lot_number,
        parking_lot_name,
        zone,
        license_plate,
        province,
        brand,
        model,
        color,
        sequence_no,
        grade,
        transaction_type,
        document_status,
        rmo,
        cmo,
        gp_approval_status,
        policy_type,
        policy_amount,
        note_summary,
        key_status,
        key_number,
        notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertPosition = db.prepare('INSERT INTO vehicle_positions (vehicle_id, x, y, rotation) VALUES (?, NULL, NULL, 0)');

    const insertMany = db.transaction((vehicleList) => {
      for (const vehicle of vehicleList) {
        // For normal import, use origin_lot as the primary source for parking_lot_name
        // If origin_lot is not available, use parking_lot_name directly
        const parkingLotName = vehicle.parking_lot_name || vehicle.origin_lot || '';
        
        const result = insertVehicle.run(
          vehicle.start_time || '',
          vehicle.updated_date || '',
          vehicle.parking_lot_number ?? null,
          parkingLotName,
          vehicle.zone || '',
          vehicle.license_plate || '',
          vehicle.province || '',
          vehicle.brand || '',
          vehicle.model || '',
          vehicle.color || '',
          vehicle.sequence_no != null ? vehicle.sequence_no : null,
          vehicle.grade || '',
          vehicle.transaction_type || '',
          vehicle.document_status || '',
          vehicle.rmo || '',
          vehicle.cmo || '',
          vehicle.gp_approval_status || '',
          vehicle.policy_type || '',
          vehicle.policy_amount != null && vehicle.policy_amount !== ''
            ? Number(vehicle.policy_amount) || null
            : null,
          vehicle.note_summary || '',
          vehicle.key_status || '',
          vehicle.key_number || '',
          vehicle.notes || ''
        );

        const sanitizedCustomFields = sanitizeCustomFieldsPayload(vehicle.custom_fields);
        if (Object.keys(sanitizedCustomFields).length > 0) {
          saveVehicleCustomFields(result.lastInsertRowid, sanitizedCustomFields);
        }

        insertPosition.run(result.lastInsertRowid);
      }
    });

    insertMany(vehicles);

    const allVehicles = attachCustomFieldsToVehicles(db.prepare(`
      SELECT v.*, vp.x, vp.y, vp.rotation 
      FROM vehicles v 
      LEFT JOIN vehicle_positions vp ON v.id = vp.vehicle_id
    `).all());

    io.emit('vehicles:bulk_created', allVehicles);
    res.json({ success: true, count: vehicles.length });
  } catch (error) {
    console.error('Bulk insert error:', error);
    res.status(500).json({ error: 'Failed to import vehicles', details: error.message });
  }
});

app.put('/api/vehicles/:id/position', authenticateToken, allowCanvasEditors, (req, res) => {
  try {
    const vehicleId = Number(req.params.id);
    const beforeSnapshot = getVehicleWithPositionById(vehicleId);
    if (!beforeSnapshot) {
      return res.status(404).json({ error: 'Vehicle not found' });
    }

    const { x, y, rotation } = req.body;
    
    const existing = db.prepare('SELECT * FROM vehicle_positions WHERE vehicle_id = ?').get(vehicleId);
    
    if (existing) {
      db.prepare('UPDATE vehicle_positions SET x = ?, y = ?, rotation = ? WHERE vehicle_id = ?')
        .run(x, y, rotation, vehicleId);
    } else {
      db.prepare('INSERT INTO vehicle_positions (vehicle_id, x, y, rotation) VALUES (?, ?, ?, ?)')
        .run(vehicleId, x, y, rotation);
    }

    const vehicle = db.prepare(`
      SELECT v.*, vp.x, vp.y, vp.rotation 
      FROM vehicles v 
      LEFT JOIN vehicle_positions vp ON v.id = vp.vehicle_id 
      WHERE v.id = ?
    `).get(vehicleId);

    const changedFields = computeVehicleDiff(beforeSnapshot, vehicle);
    if (hasDiffChanges(changedFields)) {
      logVehicleChange({
        vehicleId,
        action: 'position_update',
        previousSnapshot: beforeSnapshot,
        newSnapshot: vehicle,
        changedFields,
        user: req.user
      });
    }

    console.log('🔔 [BACKEND] Emitting vehicle:position_updated:', {
      vehicleId: vehicle.id,
      position: { x: vehicle.x, y: vehicle.y, rotation: vehicle.rotation },
      connectedClients: io.engine.clientsCount
    });
    
    io.emit('vehicle:position_updated', vehicle);
    res.json(vehicle);
  } catch (error) {
    console.error('Update position error:', error);
    res.status(500).json({ error: 'Failed to update position' });
  }
});

app.post('/api/vehicles/auto-arrange', authenticateToken, allowCanvasEditors, (req, res) => {
  try {
    const { parking_lot_number } = req.body;
    
    // Get vehicles for the specified parking lot (or all if not specified)
    let query = 'SELECT id, parking_lot_number FROM vehicles';
    const params = [];
    
    if (parking_lot_number) {
      query += ' WHERE parking_lot_number = ?';
      params.push(parking_lot_number);
    }
    
    query += ' ORDER BY parking_lot_number, id';
    const vehiclesToArrange = db.prepare(query).all(...params);
    
    // Auto-arrange configuration
    const VEHICLE_WIDTH = 85;
    const VEHICLE_HEIGHT = 95;
    const SPACING_X = 120;
    const SPACING_Y = 130;
    const VEHICLES_PER_ROW = 8;
    const LOT_OFFSET_Y = 300; // Space between different parking lots
    
    // Group vehicles by parking lot
    const vehiclesByLot = {};
    vehiclesToArrange.forEach(v => {
      const lot = v.parking_lot_number || 0;
      if (!vehiclesByLot[lot]) vehiclesByLot[lot] = [];
      vehiclesByLot[lot].push(v);
    });
    
    // Arrange vehicles
    const updatePosition = db.prepare('UPDATE vehicle_positions SET x = ?, y = ?, rotation = ? WHERE vehicle_id = ?');
    const insertPosition = db.prepare('INSERT INTO vehicle_positions (vehicle_id, x, y, rotation) VALUES (?, ?, ?, ?)');
    
    const arrangeMany = db.transaction(() => {
      let lotIndex = 0;
      
      for (const lot in vehiclesByLot) {
        const vehicles = vehiclesByLot[lot];
        const baseY = 100 + (lotIndex * LOT_OFFSET_Y);
        
        vehicles.forEach((vehicle, index) => {
          const row = Math.floor(index / VEHICLES_PER_ROW);
          const col = index % VEHICLES_PER_ROW;
          
          const x = 100 + (col * SPACING_X);
          const y = baseY + (row * SPACING_Y);
          
          const existing = db.prepare('SELECT * FROM vehicle_positions WHERE vehicle_id = ?').get(vehicle.id);
          
          if (existing) {
            updatePosition.run(x, y, 0, vehicle.id);
          } else {
            insertPosition.run(vehicle.id, x, y, 0);
          }
        });
        
        lotIndex++;
      }
    });
    
    arrangeMany();
    
    // Get all updated vehicles
    const allVehicles = db.prepare(`
      SELECT v.*, vp.x, vp.y, vp.rotation 
      FROM vehicles v 
      LEFT JOIN vehicle_positions vp ON v.id = vp.vehicle_id
    `).all();
    
    io.emit('vehicles:bulk_updated', allVehicles);
    res.json({ success: true, count: vehiclesToArrange.length, vehicles: allVehicles });
  } catch (error) {
    console.error('Auto-arrange error:', error);
    res.status(500).json({ error: 'Failed to auto-arrange vehicles', details: error.message });
  }
});

app.get('/api/parking-lots', authenticateToken, (req, res) => {
  try {
    const lots = db.prepare(`
      SELECT DISTINCT parking_lot_number, parking_lot_name 
      FROM vehicles 
      WHERE parking_lot_number IS NOT NULL 
      ORDER BY parking_lot_number
    `).all();
    
    res.json(lots);
  } catch (error) {
    console.error('Get parking lots error:', error);
    res.status(500).json({ error: 'Failed to fetch parking lots' });
  }
});

app.get('/api/stats', authenticateToken, (req, res) => {
  try {
    const totalVehicles = db.prepare('SELECT COUNT(*) as count FROM vehicles').get();
    const parkingLots = db.prepare('SELECT COUNT(DISTINCT parking_lot_number) as count FROM vehicles').get();
    const positioned = db.prepare('SELECT COUNT(*) as count FROM vehicle_positions WHERE x != 0 OR y != 0').get();
    const inWorkshop = db.prepare('SELECT COUNT(*) as count FROM vehicles WHERE in_workshop = 1').get();
    const inSale = db.prepare('SELECT COUNT(*) as count FROM vehicles WHERE in_sale = 1').get();
    
    res.json({
      totalVehicles: totalVehicles.count,
      parkingLots: parkingLots.count,
      positioned: positioned.count,
      inWorkshop: inWorkshop.count,
      inSale: inSale.count
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Find and send repair type vehicles to workshop
app.post('/api/vehicles/auto-workshop/send-repairs', authenticateToken, requireAdmin, (req, res) => {
  try {
    // Find all vehicles with transaction_type = "ซ่อม" that are not already in workshop
    const repairVehicles = db.prepare(`
      SELECT id, license_plate, transaction_type 
      FROM vehicles 
      WHERE transaction_type LIKE '%ซ่อม%' 
        AND in_workshop = 0
    `).all();

    if (!repairVehicles.length) {
      return res.json({ success: true, message: 'No repair vehicles found', count: 0 });
    }

    const sentVehicles = [];
    const entryTime = new Date().toISOString();

    repairVehicles.forEach(vehicle => {
      try {
        const updated = updateVehicleWithAudit(vehicle.id, 'auto_workshop_send', () => {
          db.prepare(`
            UPDATE vehicles SET
              in_workshop = 1,
              workshop_name = 'ซ่อม',
              workshop_notes = 'ส่งอัตโนมัติจากประเภทรายการ',
              workshop_entry_time = ?,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(entryTime, vehicle.id);
        }, req.user);

        sentVehicles.push(updated);
        io.emit('vehicle:updated', updated);
      } catch (error) {
        console.error(`Error sending vehicle ${vehicle.id} to workshop:`, error);
      }
    });

    res.json({ 
      success: true, 
      message: `Sent ${sentVehicles.length} repair vehicles to workshop`,
      count: sentVehicles.length,
      vehicles: sentVehicles
    });
  } catch (error) {
    console.error('Auto workshop send error:', error);
    res.status(500).json({ error: 'Failed to send repair vehicles to workshop', details: error.message });
  }
});

// Workshop endpoints
app.post('/api/vehicles/:id/workshop/send', authenticateToken, allowCanvasEditors, (req, res) => {
  try {
    const vehicleId = Number(req.params.id);
    const { workshop_name, workshop_notes, entry_time } = req.body;
    const entryTime = normalizeEntryTime(entry_time);

    const vehicle = updateVehicleWithAudit(vehicleId, 'workshop_send', () => {
      db.prepare(`
        UPDATE vehicles SET
          in_workshop = 1,
          workshop_name = ?,
          workshop_notes = ?,
          workshop_entry_time = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(workshop_name || '', workshop_notes || '', entryTime, vehicleId);
    }, req.user);

    io.emit('vehicle:updated', vehicle);
    res.json(vehicle);
  } catch (error) {
    console.error('Workshop send error:', error);
    res.status(500).json({ error: 'Failed to send vehicle to workshop' });
  }
});

app.post('/api/vehicles/:id/workshop/return', authenticateToken, allowCanvasEditors, (req, res) => {
  try {
    const vehicleId = Number(req.params.id);

    const vehicle = updateVehicleWithAudit(vehicleId, 'workshop_return', () => {
      db.prepare(`
        UPDATE vehicles SET
          in_workshop = 0,
          workshop_name = NULL,
          workshop_notes = NULL,
          workshop_entry_time = NULL,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(vehicleId);
    }, req.user);

    io.emit('vehicle:updated', vehicle);
    res.json(vehicle);
  } catch (error) {
    console.error('Workshop return error:', error);
    res.status(500).json({ error: 'Failed to return vehicle from workshop' });
  }
});

app.put('/api/vehicles/:id/workshop', authenticateToken, allowCanvasEditors, (req, res) => {
  try {
    const vehicleId = Number(req.params.id);
    const { workshop_name, workshop_notes, entry_time } = req.body;
    const entryTime = normalizeEntryTime(entry_time);

    const vehicle = updateVehicleWithAudit(vehicleId, 'workshop_update', () => {
      db.prepare(`
        UPDATE vehicles SET
          workshop_name = ?,
          workshop_notes = ?,
          workshop_entry_time = CASE WHEN ? IS NULL THEN workshop_entry_time ELSE ? END,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(workshop_name || '', workshop_notes || '', entryTime, entryTime, vehicleId);
    }, req.user);

    io.emit('vehicle:updated', vehicle);
    res.json(vehicle);
  } catch (error) {
    console.error('Workshop update error:', error);
    res.status(500).json({ error: 'Failed to update workshop info' });
  }
});

app.get('/api/vehicles/workshop/list', authenticateToken, (req, res) => {
  const vehicles = attachCustomFieldsToVehicles(db.prepare(`
    SELECT v.*, vp.x, vp.y, vp.rotation 
    FROM vehicles v 
    LEFT JOIN vehicle_positions vp ON v.id = vp.vehicle_id 
    WHERE v.in_workshop = 1
    ORDER BY v.workshop_entry_time DESC
  `).all());
  
  res.json(vehicles);
});

// Sales lot endpoints
app.post('/api/vehicles/:id/sale/send', authenticateToken, allowCanvasEditors, (req, res) => {
  try {
    const vehicleId = Number(req.params.id);
    const { sale_notes, entry_time } = req.body;
    const entryTime = normalizeEntryTime(entry_time);

    const vehicle = updateVehicleWithAudit(vehicleId, 'sale_send', () => {
      db.prepare(`
        UPDATE vehicles SET
          in_sale = 1,
          sale_notes = ?,
          sale_entry_time = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(sale_notes || '', entryTime, vehicleId);
    }, req.user);

    io.emit('vehicle:updated', vehicle);
    res.json(vehicle);
  } catch (error) {
    console.error('Sale send error:', error);
    res.status(500).json({ error: 'Failed to send vehicle to sale lot' });
  }
});

app.post('/api/vehicles/:id/sale/return', authenticateToken, allowCanvasEditors, (req, res) => {
  try {
    const vehicleId = Number(req.params.id);

    const vehicle = updateVehicleWithAudit(vehicleId, 'sale_return', () => {
      db.prepare(`
        UPDATE vehicles SET
          in_sale = 0,
          sale_notes = NULL,
          sale_entry_time = NULL,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(vehicleId);
    }, req.user);

    io.emit('vehicle:updated', vehicle);
    res.json(vehicle);
  } catch (error) {
    console.error('Sale return error:', error);
    res.status(500).json({ error: 'Failed to return vehicle from sale lot' });
  }
});

app.put('/api/vehicles/:id/sale', authenticateToken, allowCanvasEditors, (req, res) => {
  try {
    const vehicleId = Number(req.params.id);
    const { sale_notes, entry_time } = req.body;
    const entryTime = normalizeEntryTime(entry_time);

    const vehicle = updateVehicleWithAudit(vehicleId, 'sale_update', () => {
      db.prepare(`
        UPDATE vehicles SET
          sale_notes = ?,
          sale_entry_time = CASE WHEN ? IS NULL THEN sale_entry_time ELSE ? END,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(sale_notes || '', entryTime, entryTime, vehicleId);
    }, req.user);

    io.emit('vehicle:updated', vehicle);
    res.json(vehicle);
  } catch (error) {
    console.error('Sale update error:', error);
    res.status(500).json({ error: 'Failed to update sale information' });
  }
});

app.get('/api/vehicles/sale/list', authenticateToken, (req, res) => {
  const vehicles = db.prepare(`
    SELECT v.*, vp.x, vp.y, vp.rotation 
    FROM vehicles v 
    LEFT JOIN vehicle_positions vp ON v.id = vp.vehicle_id 
    WHERE v.in_sale = 1
    ORDER BY v.sale_entry_time DESC
  `).all();

  res.json(vehicles);
});

// Auction endpoints
app.post('/api/vehicles/:id/auction/send', authenticateToken, allowCanvasEditors, (req, res) => {
  try {
    const vehicleId = Number(req.params.id);
    const { auction_name, auction_notes, entry_time } = req.body;
    const entryTime = normalizeEntryTime(entry_time);

    const vehicle = updateVehicleWithAudit(vehicleId, 'auction_send', () => {
      db.prepare(`
        UPDATE vehicles SET
          in_auction = 1,
          auction_name = ?,
          auction_notes = ?,
          auction_entry_time = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(auction_name || '', auction_notes || '', entryTime, vehicleId);
    }, req.user);

    io.emit('vehicle:updated', vehicle);
    res.json(vehicle);
  } catch (error) {
    console.error('Auction send error:', error);
    res.status(500).json({ error: 'Failed to send vehicle to auction' });
  }
});

app.post('/api/vehicles/:id/auction/return', authenticateToken, allowCanvasEditors, (req, res) => {
  try {
    const vehicleId = Number(req.params.id);

    const vehicle = updateVehicleWithAudit(vehicleId, 'auction_return', () => {
      db.prepare(`
        UPDATE vehicles SET
          in_auction = 0,
          auction_name = NULL,
          auction_notes = NULL,
          auction_entry_time = NULL,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(vehicleId);
    }, req.user);

    io.emit('vehicle:updated', vehicle);
    res.json(vehicle);
  } catch (error) {
    console.error('Auction return error:', error);
    res.status(500).json({ error: 'Failed to return vehicle from auction' });
  }
});

app.put('/api/vehicles/:id/auction', authenticateToken, allowCanvasEditors, (req, res) => {
  try {
    const vehicleId = Number(req.params.id);
    const { auction_name, auction_notes, entry_time } = req.body;
    const entryTime = normalizeEntryTime(entry_time);

    const vehicle = updateVehicleWithAudit(vehicleId, 'auction_update', () => {
      db.prepare(`
        UPDATE vehicles SET
          auction_name = ?,
          auction_notes = ?,
          auction_entry_time = CASE WHEN ? IS NULL THEN auction_entry_time ELSE ? END,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(auction_name || '', auction_notes || '', entryTime, entryTime, vehicleId);
    }, req.user);

    io.emit('vehicle:updated', vehicle);
    res.json(vehicle);
  } catch (error) {
    console.error('Auction update error:', error);
    res.status(500).json({ error: 'Failed to update auction info' });
  }
});

app.get('/api/vehicles/auction/list', authenticateToken, (req, res) => {
  const vehicles = db.prepare(`
    SELECT v.*, vp.x, vp.y, vp.rotation 
    FROM vehicles v 
    LEFT JOIN vehicle_positions vp ON v.id = vp.vehicle_id 
    WHERE v.in_auction = 1
    ORDER BY v.auction_entry_time DESC
  `).all();

  res.json(vehicles);
});

io.on('connection', (socket) => {
  console.log('✅ [WEBSOCKET] Client connected:', socket.id, '| Total clients:', io.engine.clientsCount);

  socket.on('error', (error) => {
    console.error('❌ [WEBSOCKET] Socket error:', socket.id, error);
  });

  socket.on('disconnect', (reason) => {
    console.log('❌ [WEBSOCKET] Client disconnected:', socket.id, '| Reason:', reason, '| Remaining clients:', io.engine.clientsCount);
  });
});

io.on('error', (error) => {
  console.error('❌ [WEBSOCKET] IO error:', error);
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
