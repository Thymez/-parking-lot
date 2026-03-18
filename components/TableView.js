import { useState, useRef, useCallback, useMemo, useEffect, useDeferredValue } from 'react';
import * as XLSX from 'xlsx';
import { vehicleApi } from '../lib/api';
import VehicleModal from './VehicleModal';
import MapView from './MapView';
import { useAuth } from '../lib/auth';
import { useDialog } from './DialogProvider';
import { useVehicleColumns } from './VehicleColumnsProvider';
import { SYSTEM_COLUMN_KEYS } from './vehicleColumnsConfig';
import Resizer from './Resizer';

export const EMPTY_LOT_FILTER_VALUE = '__EMPTY__';
export const ALL_LOTS_FILTER_VALUE = '__ALL_LOTS__';

const NUMERIC_FIELD_KEYS = new Set(['sequence_no', 'parking_lot_number', 'rmo', 'cmo', 'policy_amount']);
const EDITABLE_COLUMN_KEYS = new Set([
  'sequence_no',
  'updated_date',
  'zone',
  'license_plate',
  'province',
  'brand',
  'model',
  'grade',
  'transaction_type',
  'document_status',
  'rmo',
  'cmo',
  'gp_approval_status',
  'policy_type',
  'policy_amount',
  'note_summary',
  'color',
  'key_status',
  'notes',
  'key_number',
  'parking_lot_number',
  'parking_lot_name',
  'start_time',
  'movement_entry_date'
]);

const CORE_TABLE_COLUMN_KEYS = [
  'sequence_no',
  'license_plate',
  'province',
  'brand',
  'model',
  'color',
  'start_time',
  'transaction_type',
  'parking_lot_name',
  'rmo',
  'cmo',
  'gp_approval_status',
  'policy_type',
  'policy_amount',
  'note_summary'
];
const CORE_TABLE_COLUMN_SET = new Set(CORE_TABLE_COLUMN_KEYS);
const MULTILINE_FIELD_KEYS = new Set(['note_summary', 'notes']);
const COLUMN_WIDTHS = {
  sequence_no: 75,
  updated_date: 160,
  license_plate: 135,
  province: 100,
  brand: 125,
  model: 125,
  color: 100,
  start_time: 160,
  transaction_type: 135,
  parking_lot_name: 150,
  rmo: 115,
  cmo: 115,
  gp_approval_status: 160,
  policy_type: 140,
  policy_amount: 125,
  note_summary: 230,
  movement_info: 150,
  movement_entry_date: 160,
  movement_date: 160,
  movement_notes: 230,
  zone: 115,
  grade: 90,
  key_status: 125,
  notes: 230,
  key_number: 100,
  parking_lot_number: 115
};

const HIDDEN_SYSTEM_COLUMNS = new Set(['workshop_name', 'workshop_notes', 'auction_name', 'auction_notes', 'sale_notes', 'movement_date', 'movement_entry_date', 'movement_info', 'movement_notes']);
const SYSTEM_ORDER_LOCKED_COLUMNS = new Set(['movement_entry_date']);

const getActiveMovementEntryFieldKey = (vehicle) => {
  if (!vehicle) return null;
  if (vehicle.in_workshop) return 'workshop_entry_time';
  if (vehicle.in_auction) return 'auction_entry_time';
  if (vehicle.in_sale) return 'sale_entry_time';
  return null;
};

const toDateTimeInputValue = (value) => {
  const date = normalizeTimestampInput(value);
  if (!date) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};

const fromDateTimeInputValue = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString();
};

const PAGE_SIZE_OPTIONS = [20, 50, 100];

const ISO_DATE_TIME_REGEX = /^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?Z?)?$/i;
const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const DMY_SLASH_REGEX = /^\d{1,2}\/\d{1,2}\/\d{4}$/;
const DATE_LIKE_KEYWORDS = ['date', 'time', 'timestamp', '_at'];
const DATE_LIKE_SYSTEM_KEYS = new Set([
  'updated_date',
  'start_time',
  'workshop_entry_time',
  'auction_entry_time',
  'sale_entry_time',
  'created_at',
  'updated_at',
  'movement_entry_date',
  'movement_date'
]);

const pad2 = (value) => value.toString().padStart(2, '0');

const normalizeTimestampInput = (value) => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number') {
    const dateFromNumber = new Date(value);
    return Number.isNaN(dateFromNumber.getTime()) ? null : dateFromNumber;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (DMY_SLASH_REGEX.test(trimmed)) {
      const [dayStr, monthStr, yearStr] = trimmed.split('/');
      const normalized = `${yearStr}-${pad2(monthStr)}-${pad2(dayStr)}T00:00:00`;
      const dateFromSlash = new Date(normalized);
      return Number.isNaN(dateFromSlash.getTime()) ? null : dateFromSlash;
    }
    if (DATE_ONLY_REGEX.test(trimmed)) {
      const dateOnly = new Date(`${trimmed}T00:00:00`);
      return Number.isNaN(dateOnly.getTime()) ? null : dateOnly;
    }
    if (!trimmed.includes('T') && trimmed.includes(' ')) {
      const converted = trimmed.replace(' ', 'T');
      const dateFromSpace = new Date(converted);
      if (!Number.isNaN(dateFromSpace.getTime())) return dateFromSpace;
    }
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const coerced = new Date(value);
  return Number.isNaN(coerced.getTime()) ? null : coerced;
};

const formatTimestamp = (timestamp) => {
  if (!timestamp) return '-';
  const date = normalizeTimestampInput(timestamp);
  if (!date) return '-';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

const cloneDraftRecord = (draft = {}) => ({
  ...draft,
  custom_fields: draft?.custom_fields ? { ...draft.custom_fields } : undefined
});

const isLikelyDateColumn = (columnKey) => {
  if (!columnKey) return false;
  if (DATE_LIKE_SYSTEM_KEYS.has(columnKey)) return true;
  return DATE_LIKE_KEYWORDS.some((keyword) => columnKey.includes(keyword));
};

const isDateTimeColumn = (column) => {
  if (!column) return false;
  if (column.type === 'datetime') return true;
  return isLikelyDateColumn(column.key);
};

const tryFormatDateLikeValue = (value, columnKey) => {
  if (value === undefined || value === null || value === '') return null;
  const stringValue = value instanceof Date ? value.toISOString() : String(value).trim();
  if (!stringValue) return null;
  const matchedPattern = ISO_DATE_TIME_REGEX.test(stringValue) || DATE_ONLY_REGEX.test(stringValue) || DMY_SLASH_REGEX.test(stringValue);
  if (!matchedPattern && !isLikelyDateColumn(columnKey)) {
    return null;
  }
  const formatted = formatTimestamp(stringValue);
  return formatted === '-' ? null : formatted;
};

const formatCustomFieldDisplayValue = (value, type) => {
  if (value === undefined || value === null || value === '') {
    return '-';
  }
  if (type === 'boolean') {
    return value === true || value === '1' || value === 1 ? 'ใช่' : 'ไม่ใช่';
  }
  if (type === 'number') {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue.toLocaleString('th-TH') : value;
  }
  if (type === 'datetime') {
    const formatted = formatTimestamp(value);
    return formatted === '-' ? value : formatted;
  }
  const inferredDate = tryFormatDateLikeValue(value);
  if (inferredDate) {
    return inferredDate;
  }
  return value;
};

const getCustomFieldExportValue = (value, type) => {
  if (value === undefined || value === null) return '';
  if (type === 'datetime') {
    const formatted = formatTimestamp(value);
    return formatted === '-' ? value : formatted;
  }
  if (type === 'number') {
    return value === '' ? '' : Number(value);
  }
  const inferredDate = tryFormatDateLikeValue(value);
  if (inferredDate) {
    return inferredDate;
  }
  return value;
};

export default function TableView({
  vehicles,
  onRefresh,
  context = 'main',
  lotFilterValue = '',
  onLotFilterChange,
  lotFilterOptions = []
}) {
  const [editingVehicle, setEditingVehicle] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [selectedVehicleForMap, setSelectedVehicleForMap] = useState(null);
  const [showMapModal, setShowMapModal] = useState(false);
  const lastClickRef = useRef({ time: 0, target: null });
  const fileInputRef = useRef(null);
  const [importing, setImporting] = useState(false);
  const [returningId, setReturningId] = useState(null);
  const { isAdmin } = useAuth();
  const allowAdminActions = isAdmin;
  const allowMainAdminActions = isAdmin && context === 'main';
  const { alert: showDialog, confirm: showConfirm } = useDialog();
  const notify = useCallback((message, options = {}) => showDialog({ confirmText: 'รับทราบ', icon: 'ℹ️', ...options, message }), [showDialog]);
  const confirmAction = useCallback((message, options = {}) => showConfirm({ confirmText: 'ยืนยัน', cancelText: 'ยกเลิก', icon: '❓', ...options, message }), [showConfirm]);
  const [pendingEdits, setPendingEdits] = useState(new Map());
  const [saving, setSaving] = useState(false);
  const tableScrollRef = useRef(null);
  const stickyScrollbarRef = useRef(null);
  const [tableScrollWidth, setTableScrollWidth] = useState(0);
  const [columnFilters, setColumnFilters] = useState({});
  const [globalSearch, setGlobalSearch] = useState('');
  const deferredColumnFilters = useDeferredValue(columnFilters);
  const deferredGlobalSearch = useDeferredValue(globalSearch);
  const filterInputRefs = useRef(new Map());
  const globalSearchInputRef = useRef(null);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0]);
  const [currentPage, setCurrentPage] = useState(1);
  const [openFilterDropdown, setOpenFilterDropdown] = useState(null);
  const [bottomBarCollapsed, setBottomBarCollapsed] = useState(false);
  const filterDropdownRef = useRef(null);
  const [customColumnWidths, setCustomColumnWidths] = useState({});

  useEffect(() => {
    try {
      const savedWidths = localStorage.getItem('tableCustomWidths');
      if (savedWidths) {
        setCustomColumnWidths(JSON.parse(savedWidths));
      }
    } catch (e) {
      console.error('Failed to load column widths:', e);
    }
  }, []);

  const handleResize = useCallback((columnKey, deltaX, isFinal) => {
    setCustomColumnWidths(prev => {
      const currentWidth = prev[columnKey] || columnWidthMap.get(columnKey) || COLUMN_WIDTHS[columnKey] || 150;
      const newWidth = Math.max(60, currentWidth + deltaX); // Min width 60px
      const next = { ...prev, [columnKey]: newWidth };
      
      if (isFinal) {
        try {
          localStorage.setItem('tableCustomWidths', JSON.stringify(next));
        } catch (e) {
          console.error('Failed to save column widths:', e);
        }
      }
      return next;
    });
  }, []);
  const activeColumnFilterEntries = useMemo(
    () =>
      Object.entries(columnFilters)
        .map(([key, value]) => {
          const raw = typeof value === 'string' ? value : '';
          const trimmed = raw.trim();
          return {
            key,
            raw,
            trimmed,
            normalized: trimmed.toLowerCase()
          };
        })
        .filter(({ trimmed }) => trimmed.length > 0),
    [columnFilters]
  );
  const getStatusText = (vehicle) => {
    if (vehicle.in_workshop) return 'เข้าอู่';
    if (vehicle.in_auction) return 'เข้าประมูล';
    if (vehicle.in_sale) return 'ขาย';
    return 'ปกติ';
  };

  const formatSystemDisplayValue = (value, column) => {
    if (value === undefined || value === null || value === '') return '-';
    const key = column?.key || '';
    const columnType = column?.type;
    const shouldFormatDate = isDateTimeColumn(column) || isLikelyDateColumn(key);
    if (shouldFormatDate) {
      const formatted = formatTimestamp(value);
      return formatted === '-' ? value : formatted;
    }
    if (columnType === 'number' || NUMERIC_FIELD_KEYS.has(key)) {
      const numericValue = Number(value);
      // Show "-" for 0 values in specific columns
      if (numericValue === 0 && (key === 'claim_payment_amount' || key === 'claim_payee_name')) {
        return '-';
      }
      return Number.isFinite(numericValue) ? numericValue.toLocaleString('th-TH') : value;
    }
    // Show "-" for 0 or empty values in specific text columns
    if (key === 'claim_payee_name' && (value === 0 || value === '0')) {
      return '-';
    }
    return value;
  };

  const baseColumns = useMemo(() => ([
    {
      key: 'sequence_no',
      label: 'ลำดับ',
      className: 'text-gray-900',
      render: (vehicle, index) => vehicle.sequence_no ?? (index + 1),
      exportValue: (vehicle, index) => vehicle.sequence_no ?? (index + 1),
      editable: true
    },
    {
      key: 'license_plate',
      label: 'ทะเบียนรถ',
      className: 'font-semibold text-blue-600',
      render: (vehicle) => vehicle.license_plate || '-',
      exportValue: (vehicle) => vehicle.license_plate || '',
      editable: true
    },
    { key: 'province', label: 'จังหวัด', className: 'text-gray-900', render: (vehicle) => vehicle.province || '-', exportValue: (vehicle) => vehicle.province || '', editable: true },
    { key: 'brand', label: 'ยี่ห้อ', className: 'text-gray-900', render: (vehicle) => vehicle.brand || '-', exportValue: (vehicle) => vehicle.brand || '', editable: true },
    { key: 'model', label: 'รุ่น', className: 'text-gray-900', render: (vehicle) => vehicle.model || '-', exportValue: (vehicle) => vehicle.model || '', editable: true },
    { key: 'color', label: 'สีรถ', className: 'text-gray-900', render: (vehicle) => vehicle.color || '-', exportValue: (vehicle) => vehicle.color || '', editable: true },
    { key: 'transaction_type', label: 'ประเภทรายการ', className: 'text-gray-900', render: (vehicle) => vehicle.transaction_type || '-', exportValue: (vehicle) => vehicle.transaction_type || '', editable: true },
    { key: 'parking_lot_name', label: 'ลาน', className: 'text-gray-900', render: (vehicle) => vehicle.parking_lot_name || '-', exportValue: (vehicle) => vehicle.parking_lot_name || '', editable: true },
    { key: 'rmo', label: 'RMO', className: 'text-gray-900 tabular-nums text-center', render: (vehicle) => vehicle.rmo || '-', exportValue: (vehicle) => vehicle.rmo || '', editable: true },
    { key: 'cmo', label: 'CMO', className: 'text-gray-900 tabular-nums text-center', render: (vehicle) => vehicle.cmo || '-', exportValue: (vehicle) => vehicle.cmo || '', editable: true },
    { key: 'gp_approval_status', label: 'สถานะการอนุมัติ (GP)', className: 'text-gray-900', render: (vehicle) => vehicle.gp_approval_status || '-', exportValue: (vehicle) => vehicle.gp_approval_status || '', editable: true },
    { key: 'policy_type', label: 'ประเภทกรมธรรม์', className: 'text-gray-900', render: (vehicle) => vehicle.policy_type || '-', exportValue: (vehicle) => vehicle.policy_type || '', editable: true },
    {
      key: 'policy_amount',
      label: 'ทุนประกัน',
      className: 'text-gray-900 text-right tabular-nums',
      render: (vehicle) => (vehicle.policy_amount !== null && vehicle.policy_amount !== undefined
        ? vehicle.policy_amount.toLocaleString('th-TH', { maximumFractionDigits: 2 })
        : '-'),
      exportValue: (vehicle) => vehicle.policy_amount ?? '',
      editable: true
    },
    {
      key: 'note_summary',
      label: 'หมายเหตุ',
      className: 'text-gray-900 whitespace-pre-wrap min-w-[200px]',
      render: (vehicle) => vehicle.note_summary || '-',
      exportValue: (vehicle) => vehicle.note_summary || '',
      editable: true
    }
  ]), []);

  const getMovementEntryDateValue = useCallback((vehicle) => {
    const entryFieldKey = getActiveMovementEntryFieldKey(vehicle);
    return entryFieldKey ? vehicle?.[entryFieldKey] : '';
  }, []);

  const getSystemMovementDateValue = useCallback((vehicle) => vehicle?.movement_date || '', []);

  const getMovementStatusLabel = useCallback((vehicle) => {
    if (vehicle.in_workshop) return 'เข้าอู่';
    if (vehicle.in_auction) return 'เข้าประมูล';
    if (vehicle.in_sale) return 'ขาย';
    return 'ว่าง';
  }, []);

  const getStatusLocationLabel = useCallback((vehicle) => {
    if (vehicle.in_workshop) {
      const name = vehicle.workshop_name?.trim();
      return `ส่งเข้าอู่${name ? `: ${name}` : ''}`;
    }
    if (vehicle.in_auction) {
      const name = vehicle.auction_name?.trim();
      if (name) return name;
      return 'ส่งเข้าประมูล';
    }
    if (vehicle.in_sale) {
      return 'ส่งขาย: ทีมขาย';
    }
    const lotName = vehicle.parking_lot_name?.trim();
    if (lotName) {
      return `อยู่ที่ลาน: ${lotName}`;
    }
    if (vehicle.parking_lot_number) {
      return `อยู่ที่ลานหมายเลข ${vehicle.parking_lot_number}`;
    }
    return 'อยู่ในลาน (ไม่ระบุชื่อ)';
  }, []);

  const getCombinedMovementNotes = useCallback((vehicle) => {
    const notes = [vehicle.workshop_notes, vehicle.auction_notes, vehicle.sale_notes]
      .filter((value) => typeof value === 'string' && value.trim().length > 0)
      .map((value) => value.trim());
    if (!notes.length) {
      return '';
    }
    return notes.join(' • ');
  }, []);

  const movementColumns = useMemo(() => ([
    {
      key: 'movement_info',
      label: 'สถานะ',
      className: 'text-gray-900',
      editable: false,
      render: (vehicle) => {
        if (vehicle.in_workshop) {
          return (
            <div className="inline-flex flex-col gap-1">
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-orange-100 text-orange-800">
                🔧 เข้าอู่
              </span>
            </div>
          );
        }
        if (vehicle.in_auction) {
          return (
            <div className="inline-flex flex-col gap-1">
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-800">
                🔨 ประมูล
              </span>
            </div>
          );
        }
        if (vehicle.in_sale) {
          return (
            <div className="inline-flex flex-col gap-1">
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                🏷️ การขาย
              </span>
            </div>
          );
        }
        return <span className="text-gray-400">ว่าง</span>;
      },
      exportValue: (vehicle) => {
        if (vehicle.in_workshop) {
          return `เข้าอู่ (${vehicle.workshop_entry_time || '-'})`;
        }
        if (vehicle.in_auction) {
          return `เข้าประมูล (${vehicle.auction_entry_time || '-'})`;
        }
        if (vehicle.in_sale) {
          return `ขาย (${vehicle.sale_entry_time || '-'})`;
        }
        return 'ว่าง';
      },
      filterAccessor: (vehicle) => getMovementStatusLabel(vehicle)
    },
    {
      key: 'start_time',
      label: 'วันที่ย้ายรถ',
      className: 'text-gray-900 whitespace-nowrap',
      type: 'datetime',
      render: (vehicle) => formatTimestamp(vehicle.start_time),
      exportValue: (vehicle) => {
        const formatted = formatTimestamp(vehicle.start_time);
        return formatted === '-' ? '' : formatted;
      },
      editable: true
    },
    {
      key: 'movement_entry_date',
      label: 'วันที่เข้าสถานะ',
      className: 'text-gray-900 whitespace-nowrap',
      editable: true,
      render: (vehicle) => {
        const dateValue = getMovementEntryDateValue(vehicle);
        return dateValue ? formatTimestamp(dateValue) : '-';
      },
      exportValue: (vehicle) => {
        const formatted = formatTimestamp(getMovementEntryDateValue(vehicle));
        return formatted === '-' ? '' : formatted;
      },
      filterAccessor: (vehicle) => {
        const formatted = formatTimestamp(getMovementEntryDateValue(vehicle));
        return formatted === '-' ? '' : formatted;
      },
      type: 'datetime'
    },
    {
      key: 'movement_date',
      label: 'วันที่เข้าสถานะ (ระบบ)',
      className: 'text-gray-900 whitespace-nowrap',
      editable: false,
      render: (vehicle) => {
        const dateValue = getSystemMovementDateValue(vehicle);
        return dateValue ? formatTimestamp(dateValue) : '-';
      },
      exportValue: (vehicle) => {
        const formatted = formatTimestamp(getSystemMovementDateValue(vehicle));
        return formatted === '-' ? '' : formatted;
      },
      filterAccessor: (vehicle) => {
        const formatted = formatTimestamp(getSystemMovementDateValue(vehicle));
        return formatted === '-' ? '' : formatted;
      },
      exportOnly: true
    },
    {
      key: 'movement_notes',
      label: 'หมายเหตุสถานะ',
      className: 'max-w-xs truncate text-gray-900',
      editable: false,
      render: (vehicle) => getCombinedMovementNotes(vehicle) || '-',
      exportValue: (vehicle) => {
        const value = getCombinedMovementNotes(vehicle);
        return value === '-' ? '' : value;
      },
      filterAccessor: (vehicle) => getCombinedMovementNotes(vehicle)
    }
  ]), [getMovementStatusLabel, getMovementEntryDateValue, getSystemMovementDateValue, getCombinedMovementNotes]);

  const systemColumns = useMemo(() => ([
    ...baseColumns,
    ...movementColumns
  ]), [movementColumns, baseColumns]);

  const defaultColumns = useMemo(() => (
    systemColumns.filter((column) => !column?.exportOnly && !HIDDEN_SYSTEM_COLUMNS.has(column?.key))
  ), [systemColumns]);

  const { columns: columnMetadata = [], loading: columnsLoading } = useVehicleColumns();

  const customColumnLookup = useMemo(() => {
    const map = new Map();
    columnMetadata.forEach((column) => {
      if (!column || column.source === 'system' || column.is_active === 0) return;
      const columnKey = column.column_key?.toString().trim();
      const label = column.label?.toString().trim();
      if (columnKey) {
        map.set(columnKey.toLowerCase(), column);
      }
      if (label) {
        map.set(label.toLowerCase(), column);
      }
    });
    return map;
  }, [columnMetadata]);

  const buildCustomColumnDefinition = useCallback((meta) => {
    if (!meta?.column_key) return null;
    const columnKey = meta.column_key;
    const normalizedLabel = (meta.label || columnKey || '').toString().trim() || columnKey;
    const columnType = meta.type || 'text';
    const width = meta.width || (columnType === 'number' ? 150 : columnType === 'datetime' ? 170 : 180);

    return {
      key: columnKey,
      label: normalizedLabel,
      width,
      type: columnType,
      render: (vehicle) => formatCustomFieldDisplayValue(vehicle.custom_fields?.[columnKey], columnType),
      exportValue: (vehicle) => {
        const value = vehicle.custom_fields?.[columnKey];
        // Show "-" for 0 values in specific columns
        if ((columnKey === 'claim_payment_amount' || columnKey === 'claim_payee_name') && (value === 0 || value === '0')) {
          return '';
        }
        return getCustomFieldExportValue(value, columnType);
      },
      filterAccessor: (vehicle) => vehicle.custom_fields?.[columnKey] ?? ''
    };
  }, []);

  const metadataHeaderMap = useMemo(() => {
    const map = new Map();
    columnMetadata.forEach((meta) => {
      if (!meta?.column_key) return;
      map.set(meta.column_key.toLowerCase(), meta.column_key);
      const normalizedLabel = meta.label?.toString().trim();
      if (normalizedLabel) {
        map.set(normalizedLabel.toLowerCase(), meta.column_key);
      }
    });
    return map;
  }, [columnMetadata]);

  const visibleColumns = useMemo(() => {
    // If columns are still loading, wait for them to load before rendering
    // Don't return early with defaultColumns if we're still loading
    if (!columnMetadata.length && !columnsLoading) {
      return defaultColumns;
    }
    
    // If columns are loading or empty, return defaultColumns for now
    if (!columnMetadata.length) {
      return defaultColumns;
    }

    const systemColumnMap = new Map();
    defaultColumns.forEach((column) => {
      if (column?.key) {
        systemColumnMap.set(column.key, column);
      }
    });

    const orderedColumns = [];
    const lockedColumnLabels = new Map();

    columnMetadata.forEach((meta) => {
      const key = meta.column_key;
      // Skip inactive columns, hidden columns, and columns without keys
      if (!key || HIDDEN_SYSTEM_COLUMNS.has(key) || meta.is_active === 0) return;
      if (SYSTEM_ORDER_LOCKED_COLUMNS.has(key)) {
        const normalizedLabel = meta.label?.toString().trim();
        if (normalizedLabel) {
          lockedColumnLabels.set(key, normalizedLabel);
        }
        return;
      }

      if (systemColumnMap.has(key)) {
        const baseColumn = systemColumnMap.get(key);
        const normalizedLabel = meta.label?.toString().trim();
        orderedColumns.push(normalizedLabel ? { ...baseColumn, label: normalizedLabel } : baseColumn);
        systemColumnMap.delete(key);
      } else {
        const customColumn = buildCustomColumnDefinition(meta);
        if (customColumn) {
          orderedColumns.push(customColumn);
        }
      }
    });

    systemColumnMap.forEach((column) => {
      if (!column) return;
      const labelOverride = lockedColumnLabels.get(column.key);
      orderedColumns.push(labelOverride ? { ...column, label: labelOverride } : column);
    });

    return orderedColumns;
  }, [buildCustomColumnDefinition, columnMetadata, columnsLoading, defaultColumns]);
  const totalColumns = visibleColumns.length;
  const actionColumnCount = allowAdminActions ? 1 : 0;

  const isSheetMode = context === 'main';
  const hasPendingChanges = pendingEdits.size > 0;
  const scrollTrackWidth = Math.max(tableScrollWidth, 1200);
  const filterableColumns = useMemo(() => visibleColumns.filter((column) => column?.key && column.filterable !== false), [visibleColumns]);
  const filterableColumnMap = useMemo(() => {
    const map = new Map();
    filterableColumns.forEach((column) => {
      map.set(column.key, column);
    });
    return map;
  }, [filterableColumns]);

  const getVehicleLotKey = useCallback((vehicle) => {
    const rawName = typeof vehicle.parking_lot_name === 'string' ? vehicle.parking_lot_name : '';
    const trimmed = rawName.trim();
    return trimmed ? trimmed.toLowerCase() : EMPTY_LOT_FILTER_VALUE;
  }, []);

  const selectedParkingLotLabel = useMemo(() => {
    if (!lotFilterValue || lotFilterValue === ALL_LOTS_FILTER_VALUE) return '';
    const match = lotFilterOptions.find((option) => option.value === lotFilterValue);
    return match?.label || '';
  }, [lotFilterValue, lotFilterOptions]);

  const { pendingRowCount, pendingCellCount } = useMemo(() => {
    let cellCount = 0;
    pendingEdits.forEach((draft) => {
      Object.keys(draft).forEach((key) => {
        if (key === 'custom_fields') return;
        cellCount += 1;
      });
      if (draft.custom_fields) {
        cellCount += Object.keys(draft.custom_fields).length;
      }
    });
    return {
      pendingRowCount: pendingEdits.size,
      pendingCellCount: cellCount
    };
  }, [pendingEdits]);

  const getFilterableValue = useCallback((vehicle, column) => {
    if (!column) return '';
    if (typeof column.filterAccessor === 'function') {
      return column.filterAccessor(vehicle);
    }
    if (!column.key) return '';
    if (SYSTEM_COLUMN_KEYS.has(column.key)) {
      return vehicle[column.key];
    }
    return vehicle.custom_fields?.[column.key];
  }, []);

  const getUniqueColumnValues = useCallback((columnKey) => {
    const valueMap = new Map(); // Map to store normalized -> original value
    vehicles.forEach((vehicle) => {
      const column = filterableColumnMap.get(columnKey);
      if (column) {
        const value = getFilterableValue(vehicle, column);
        if (value && String(value).trim()) {
          const trimmedValue = String(value).trim();
          const normalizedKey = trimmedValue.toLowerCase();
          // Keep the first occurrence of each normalized value
          if (!valueMap.has(normalizedKey)) {
            valueMap.set(normalizedKey, trimmedValue);
          }
        }
      }
    });
    return Array.from(valueMap.values()).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  }, [vehicles, filterableColumnMap, getFilterableValue]);

  const filteredVehicles = useMemo(() => {
    const searchTerm = deferredGlobalSearch.trim().toLowerCase();
    const activeColumnFilters = Object.entries(deferredColumnFilters)
      .filter(([, value]) => typeof value === 'string' && value.trim().length > 0)
      .map(([key, value]) => [key, value.trim().toLowerCase()]);

    const normalizeValue = (value) => {
      if (value === undefined || value === null) return '';
      return String(value).toLowerCase();
    };

    return vehicles.filter((vehicle) => {
      if (lotFilterValue && lotFilterValue !== ALL_LOTS_FILTER_VALUE) {
        const lotKey = getVehicleLotKey(vehicle);
        if (lotFilterValue === EMPTY_LOT_FILTER_VALUE) {
          if (lotKey !== EMPTY_LOT_FILTER_VALUE) {
            return false;
          }
        } else if (lotKey !== lotFilterValue) {
          return false;
        }
      }

      if (searchTerm) {
        const matchesSearch = filterableColumns.some((column) => {
          const value = getFilterableValue(vehicle, column);
          return normalizeValue(value).includes(searchTerm);
        });
        if (!matchesSearch) {
          return false;
        }
      }

      for (const [key, filterValue] of activeColumnFilters) {
        const column = filterableColumnMap.get(key);
        if (!column) continue;
        const value = normalizeValue(getFilterableValue(vehicle, column));
        
        // Handle multiple filters separated by '|'
        const filterParts = filterValue.split('|').map(p => p.trim()).filter(p => p.length > 0);
        
        if (filterParts.length > 0) {
          // If any of the parts match, it's considered a match (OR logic within the same column)
          const matchesAny = filterParts.some(part => value.includes(part));
          if (!matchesAny) {
            return false;
          }
        } else {
          // Fallback just in case (should not reach here if filterValue is properly formatted)
          if (!value.includes(filterValue)) {
            return false;
          }
        }
      }

      return true;
    });
  }, [vehicles, deferredGlobalSearch, deferredColumnFilters, filterableColumns, filterableColumnMap, getFilterableValue, lotFilterValue, getVehicleLotKey]);

  const filteredVehicleCount = filteredVehicles.length;
  const totalPages = Math.max(1, Math.ceil(filteredVehicleCount / pageSize));
  const paginatedVehicles = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredVehicles.slice(startIndex, startIndex + pageSize);
  }, [filteredVehicles, currentPage, pageSize]);
  const showingFrom = filteredVehicleCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const showingTo = Math.min(filteredVehicleCount, currentPage * pageSize);

  const filterSignature = useMemo(() => {
    const sortedFilters = Object.entries(deferredColumnFilters || {})
      .filter(([, value]) => typeof value === 'string' && value.trim().length > 0)
      .sort(([a], [b]) => a.localeCompare(b));
    return JSON.stringify({
      search: deferredGlobalSearch.trim().toLowerCase(),
      filters: sortedFilters
    });
  }, [deferredColumnFilters, deferredGlobalSearch]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filterSignature, pageSize]);

  useEffect(() => {
    setCurrentPage((prev) => {
      const maxPage = Math.max(1, Math.ceil(filteredVehicleCount / pageSize));
      return prev > maxPage ? maxPage : prev;
    });
  }, [filteredVehicleCount, pageSize]);

  const columnWidthMap = useMemo(() => {
    const map = new Map();
    
    // Create a temporary canvas context to measure actual text width
    let ctx = null;
    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      ctx = canvas.getContext('2d');
      // Set to match the font size of the table cells (e.g., 14px sans-serif)
      if (ctx) ctx.font = '14px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
    }

    visibleColumns.forEach((column) => {
      const key = column?.key;
      const baseWidth = column.width ?? COLUMN_WIDTHS[key] ?? 140;
      if (!key) {
        map.set(key, baseWidth);
        return;
      }
      
      let maxPixelWidth = 0;
      
      // Measure header text first
      if (ctx && column.label) {
        // Add roughly 60px for padding, sort icon, and filter icon
        maxPixelWidth = ctx.measureText(column.label).width + 60; 
      }
      
      vehicles.forEach((vehicle) => {
        let valueStr = '';
        
        // Handle special formatting for measurement
        if (column.type === 'datetime' || isLikelyDateColumn(key)) {
          const rawValue = getFilterableValue(vehicle, column);
          valueStr = formatTimestamp(rawValue);
        } else if (NUMERIC_FIELD_KEYS.has(key)) {
          const rawValue = getFilterableValue(vehicle, column);
          valueStr = rawValue !== null && rawValue !== undefined ? rawValue.toLocaleString('th-TH') : '';
        } else {
          const rawValue = getFilterableValue(vehicle, column);
          valueStr = rawValue === undefined || rawValue === null ? '' : String(rawValue);
        }
        
        if (valueStr) {
          if (ctx) {
            // Add ~30px for padding and borders
            const pxWidth = ctx.measureText(valueStr).width + 30;
            if (pxWidth > maxPixelWidth) {
              maxPixelWidth = pxWidth;
            }
          } else {
            // Fallback to character length estimation if canvas fails
            const length = valueStr.length;
            const estimatedPx = 24 + length * 8; // tighter estimation
            if (estimatedPx > maxPixelWidth) {
              maxPixelWidth = estimatedPx;
            }
          }
        }
      });
      
      // Allow it to be smaller than baseWidth if content is short, but set minimum to 80px, max to 500px
      const finalWidth = Math.min(Math.max(Math.max(80, maxPixelWidth), baseWidth * 0.5), 500);
      map.set(key, finalWidth);
    });
    return map;
  }, [visibleColumns, vehicles, getFilterableValue]);

  const hasColumnFilters = useMemo(() => Object.values(columnFilters).some((value) => value && value.trim().length > 0), [columnFilters]);
  const hasParkingLotFilter = Boolean(lotFilterValue && lotFilterValue !== ALL_LOTS_FILTER_VALUE);
  const hasActiveFilters = hasColumnFilters || globalSearch.trim().length > 0 || hasParkingLotFilter;

  const handleGlobalSearch = useCallback((event) => {
    setGlobalSearch(event.target.value);
  }, []);

  const handleColumnFilterChange = useCallback((key, value) => {
    setColumnFilters((prev) => ({
      ...prev,
      [key]: value
    }));
  }, []);

  const handleClearFilters = useCallback(() => {
    setColumnFilters({});
    setGlobalSearch('');
    globalSearchInputRef.current?.focus();
    if (onLotFilterChange) {
      onLotFilterChange('');
    }
  }, [onLotFilterChange]);

  useEffect(() => {
    if (!vehicles?.length && pendingEdits.size === 0) return;
    setPendingEdits((prev) => {
      if (!prev.size) return prev;
      const next = new Map();
      vehicles.forEach((vehicle) => {
        if (prev.has(vehicle.id)) {
          next.set(vehicle.id, prev.get(vehicle.id));
        }
      });
      return next;
    });
  }, [vehicles]);

  useEffect(() => {
    if (!isSheetMode && pendingEdits.size) {
      setPendingEdits(new Map());
    }
  }, [isSheetMode, pendingEdits.size]);

  useEffect(() => {
    filterInputRefs.current = new Map();
  }, [visibleColumns]);

  useEffect(() => {
    const handleShortcut = (event) => {
      if (event.ctrlKey && event.key === '/') {
        event.preventDefault();
        globalSearchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);

  const normalizeCompareValue = useCallback((value) => {
    if (value === undefined || value === null) return '';
    if (typeof value === 'string') return value;
    return String(value);
  }, []);

  const getOriginalCellValue = useCallback((vehicle, column) => {
    if (!vehicle) return '';
    if (column?.key === 'movement_entry_date') {
      const entryFieldKey = getActiveMovementEntryFieldKey(vehicle);
      return entryFieldKey ? vehicle[entryFieldKey] : '';
    }
    if (SYSTEM_COLUMN_KEYS.has(column.key)) {
      return vehicle[column.key];
    }
    return vehicle.custom_fields?.[column.key];
  }, []);

  const getPendingCellValue = useCallback((vehicle, column) => {
    const draft = pendingEdits.get(vehicle.id);
    if (!draft) return undefined;
    if (column?.key === 'movement_entry_date') {
      const entryFieldKey = getActiveMovementEntryFieldKey(vehicle);
      return entryFieldKey ? draft[entryFieldKey] : undefined;
    }
    if (SYSTEM_COLUMN_KEYS.has(column.key)) {
      return draft[column.key];
    }
    return draft.custom_fields?.[column.key];
  }, [pendingEdits]);

  const getInputValue = useCallback((vehicle, column) => {
    const pendingValue = getPendingCellValue(vehicle, column);
    if (pendingValue !== undefined) {
      return pendingValue ?? '';
    }
    const original = getOriginalCellValue(vehicle, column);
    if (original === undefined || original === null) return '';
    if (typeof original === 'string') return original;
    return String(original);
  }, [getOriginalCellValue, getPendingCellValue]);

  const isCellDirty = useCallback((vehicle, column) => {
    const pendingValue = getPendingCellValue(vehicle, column);
    return pendingValue !== undefined;
  }, [getPendingCellValue]);

  const applySheetChange = useCallback((vehicle, column, newValue) => {
    if (!isSheetMode) return;
    setPendingEdits((prev) => {
      const next = new Map(prev);
      const currentDraft = next.get(vehicle.id) || {};
      const updatedDraft = cloneDraftRecord(currentDraft);
      const targetKey = column.key === 'movement_entry_date'
        ? getActiveMovementEntryFieldKey(vehicle)
        : column.key;
      if (!targetKey) {
        return prev;
      }
      const originalValue = column.key === 'movement_entry_date'
        ? vehicle[targetKey]
        : getOriginalCellValue(vehicle, column);
      const normalizedOriginal = normalizeCompareValue(originalValue);
      const normalizedNew = normalizeCompareValue(newValue);
      const isCustomColumn = !SYSTEM_COLUMN_KEYS.has(targetKey);

      if (normalizedNew === normalizedOriginal) {
        if (isCustomColumn && updatedDraft.custom_fields) {
          delete updatedDraft.custom_fields[targetKey];
          if (!Object.keys(updatedDraft.custom_fields).length) {
            delete updatedDraft.custom_fields;
          }
        } else {
          delete updatedDraft[targetKey];
        }
      } else {
        if (isCustomColumn) {
          updatedDraft.custom_fields = {
            ...(updatedDraft.custom_fields || {}),
            [targetKey]: newValue
          };
        } else {
          updatedDraft[targetKey] = newValue;
        }
      }

      const hasSystemChanges = Object.keys(updatedDraft).some((key) => key !== 'custom_fields');
      const hasCustomChanges = updatedDraft.custom_fields && Object.keys(updatedDraft.custom_fields).length > 0;
      if (hasSystemChanges || hasCustomChanges) {
        next.set(vehicle.id, updatedDraft);
      } else {
        next.delete(vehicle.id);
      }
      return next;
    });
  }, [getOriginalCellValue, isSheetMode, normalizeCompareValue]);

  const handleSheetCellChange = useCallback((vehicle, column, rawValue) => {
    if (!isSheetMode) return;
    let value = rawValue;
    if (NUMERIC_FIELD_KEYS.has(column.key)) {
      value = rawValue.replace(/[^0-9.-]/g, '');
    }
    applySheetChange(vehicle, column, value);
  }, [applySheetChange, isSheetMode]);

  const handleCancelAll = useCallback(() => {
    setPendingEdits(new Map());
  }, []);

  const buildBulkPayload = useCallback(() => {
    return Array.from(pendingEdits.entries()).map(([vehicleId, draft]) => {
      const record = { id: Number(vehicleId) };
      Object.entries(draft).forEach(([key, value]) => {
        if (key === 'custom_fields') return;
        if (NUMERIC_FIELD_KEYS.has(key)) {
          record[key] = value === '' || value === null || value === undefined ? null : Number(value);
          if (!Number.isFinite(record[key])) {
            record[key] = null;
          }
        } else {
          record[key] = value ?? '';
        }
      });
      if (draft.custom_fields) {
        record.custom_fields = {};
        Object.entries(draft.custom_fields).forEach(([fieldKey, fieldValue]) => {
          record.custom_fields[fieldKey] = fieldValue ?? '';
        });
      }
      return record;
    });
  }, [pendingEdits]);

  const handleSaveAll = useCallback(async () => {
    if (!hasPendingChanges || saving) return;
    const payload = buildBulkPayload();
    if (!payload.length) return;
    try {
      setSaving(true);
      await vehicleApi.bulkUpdate(payload);
      notify('บันทึกการแก้ไขเรียบร้อย', { title: 'สำเร็จ', variant: 'success', icon: '✅' });
      setPendingEdits(new Map());
      onRefresh?.();
    } catch (error) {
      console.error('Bulk save error:', error);
      notify(error.message || 'บันทึกไม่สำเร็จ', { title: 'เกิดข้อผิดพลาด', variant: 'danger', icon: '⚠️' });
    } finally {
      setSaving(false);
    }
  }, [buildBulkPayload, hasPendingChanges, notify, onRefresh, saving]);

  useEffect(() => {
    const node = tableScrollRef.current;
    if (!node) return;
    const updateWidth = () => {
      setTableScrollWidth(node.scrollWidth);
    };
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, [visibleColumns, vehicles]);

  useEffect(() => {
    const tableNode = tableScrollRef.current;
    const stickyNode = stickyScrollbarRef.current;
    if (!tableNode || !stickyNode) return undefined;

    const handleTableScroll = () => {
      stickyNode.scrollLeft = tableNode.scrollLeft;
    };
    const handleStickyScroll = () => {
      tableNode.scrollLeft = stickyNode.scrollLeft;
    };

    tableNode.addEventListener('scroll', handleTableScroll);
    stickyNode.addEventListener('scroll', handleStickyScroll);
    return () => {
      tableNode.removeEventListener('scroll', handleTableScroll);
      stickyNode.removeEventListener('scroll', handleStickyScroll);
    };
  }, [visibleColumns]);

  const isColumnEditable = useCallback((column) => {
    if (column?.editable === false) return false;
    if (!isSheetMode || !column?.key) return false;
    if (SYSTEM_COLUMN_KEYS.has(column.key)) {
      return EDITABLE_COLUMN_KEYS.has(column.key);
    }
    return true;
  }, [isSheetMode]);

  const getDisplayValue = useCallback((vehicle, column, index) => {
    if (!column) return '';
    if (typeof column.render === 'function' && (!isSheetMode || !isColumnEditable(column))) {
      return column.render(vehicle, index);
    }

    if (!column.key) {
      return '-';
    }

    if (SYSTEM_COLUMN_KEYS.has(column.key)) {
      return formatSystemDisplayValue(vehicle[column.key], column);
    }

    const customValue = vehicle.custom_fields?.[column.key];
    if (customValue === undefined || customValue === null || customValue === '') {
      return '-';
    }
    // Show "-" for 0 values in specific custom field columns
    if ((column.key === 'claim_payment_amount' || column.key === 'claim_payee_name') && (customValue === 0 || customValue === '0')) {
      return '-';
    }
    return customValue;
  }, [isColumnEditable, isSheetMode]);

  const renderCellContent = useCallback((vehicle, column, index) => {
    if (!column) return null;
    const editable = isSheetMode && isColumnEditable(column);
    if (!editable) {
      return getDisplayValue(vehicle, column, index);
    }

    if (column.key === 'movement_entry_date' && !getActiveMovementEntryFieldKey(vehicle)) {
      return getDisplayValue(vehicle, column, index);
    }

    const value = getInputValue(vehicle, column);
    const dirty = isCellDirty(vehicle, column);
    const alignmentClasses = NUMERIC_FIELD_KEYS.has(column.key) ? 'text-center tabular-nums' : 'text-left';
    const commonClasses = `w-full px-2 py-1 text-[14px] sm:text-[15px] ${alignmentClasses} rounded-md border ${dirty ? 'border-blue-400 bg-blue-50/80' : 'border-transparent bg-transparent hover:border-gray-300'} transition-colors cursor-text min-h-[32px] flex items-center ${NUMERIC_FIELD_KEYS.has(column.key) ? 'justify-center' : 'justify-start'}`;

    if (isDateTimeColumn(column)) {
      const dateValue = toDateTimeInputValue(value);
      return (
        <input
          type="date"
          value={dateValue ? dateValue.split('T')[0] : ''}
          onChange={(e) => {
            if (e.target.value) {
              const date = new Date(e.target.value + 'T00:00:00');
              handleSheetCellChange(vehicle, column, date.toISOString());
            } else {
              handleSheetCellChange(vehicle, column, '');
            }
          }}
          onClick={(e) => e.stopPropagation()}
          onMouseUp={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          className={commonClasses}
          aria-label={column.label}
        />
      );
    }

    if (MULTILINE_FIELD_KEYS.has(column.key)) {
      return (
        <textarea
          value={value}
          onChange={(e) => handleSheetCellChange(vehicle, column, e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onMouseUp={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          className={`${commonClasses} resize-y min-h-[56px]`}
          rows={2}
          aria-label={column.label}
        />
      );
    }

    const inputMode = NUMERIC_FIELD_KEYS.has(column.key) ? 'numeric' : 'text';
    // Show "-" for 0 values in specific columns
    const displayValue = (column.key === 'claim_payment_amount' || column.key === 'claim_payee_name') && (value === '0' || value === 0)
      ? '-'
      : value;
    return (
      <input
        type="text"
        inputMode={inputMode}
        value={displayValue}
        onChange={(e) => handleSheetCellChange(vehicle, column, e.target.value)}
        onClick={(e) => e.stopPropagation()}
        onMouseUp={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        className={commonClasses}
        aria-label={column.label}
      />
    );
  }, [getDisplayValue, getInputValue, handleSheetCellChange, isCellDirty, isColumnEditable, isSheetMode]);

  const getRowStyleClasses = useCallback((vehicle, index) => {
    const base = 'align-top transition-colors duration-150';
    if (vehicle.in_workshop) {
      return `${base} bg-orange-50/50 hover:bg-orange-50 text-orange-900`;
    }
    if (vehicle.in_auction) {
      return `${base} bg-purple-50/50 hover:bg-purple-50 text-purple-900`;
    }
    if (vehicle.in_sale) {
      return `${base} bg-emerald-50/50 hover:bg-emerald-50 text-emerald-900`;
    }
    const zebra = index % 2 === 0 ? 'bg-white' : 'bg-slate-50/30';
    return `${base} ${zebra} hover:bg-slate-50`;
  }, []);

  const getColumnMeta = useCallback(
    (column) => {
      const columnKey = column?.key;
      let filterValue = columnKey ? columnFilters[columnKey] || '' : '';
      
      // Format datetime filter values for display
      if (filterValue && (column?.type === 'datetime' || isLikelyDateColumn(columnKey))) {
        const parts = filterValue.split('|').map((part) => {
          const trimmed = part.trim();
          const formatted = formatTimestamp(trimmed);
          return formatted === '-' ? trimmed : formatted;
        });
        filterValue = parts.join('|');
      }
      
      const activeFilterEntry = activeColumnFilterEntries.find((entry) => entry.key === columnKey);
      const hasFilter = Boolean(activeFilterEntry);
      const filterDescription = hasFilter ? `กรอง: "${activeFilterEntry.trimmed}"` : '';
      const clipboardValue = columnKey && pendingEdits.size > 0 ? 'มีการแก้ไขบางส่วน' : '';
      return {
        filterValue,
        filterDescription,
        hasFilter,
        clipboardValue
      };
    },
    [activeColumnFilterEntries, columnFilters, pendingEdits.size]
  );

  const guardMainAdminAction = () => {
    if (!isAdmin) {
      notify('การดำเนินการนี้ใช้ได้เฉพาะผู้ดูแลระบบ', { title: 'สิทธิ์ไม่เพียงพอ', variant: 'warning', icon: '🔒' });
      return false;
    }
    if (!allowMainAdminActions) {
      notify('สมาชิกทั่วไปสามารถดูแถบและเลื่อนตารางได้ แต่ไม่สามารถแก้ไขข้อมูล', { title: 'โหมดอ่านอย่างเดียว', variant: 'info', icon: 'ℹ️' });
      return false;
    }
    return true;
  };

  const handleEdit = (vehicle) => {
    if (!guardMainAdminAction()) return;
    setEditingVehicle(vehicle);
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!guardMainAdminAction()) return;
    const confirmed = await confirmAction('คุณต้องการลบรถคันนี้หรือไม่?', {
      title: 'ลบข้อมูลรถ',
      subtitle: 'ข้อมูลจะถูกลบออกจากระบบถาวร',
      variant: 'danger',
      icon: '🗑️'
    });
    if (!confirmed) return;
    
    try {
      await vehicleApi.delete(id);
      notify('ลบรถเรียบร้อยแล้ว', { title: 'สำเร็จ', variant: 'success', icon: '✅' });
    } catch (error) {
      notify('เกิดข้อผิดพลาดในการลบข้อมูล', { title: 'ลบไม่สำเร็จ', variant: 'danger', icon: '⚠️' });
    }
  };

  const handleReturnVehicle = async (vehicle, type) => {
    if (!isAdmin) {
      notify('การดำเนินการนี้ใช้ได้เฉพาะผู้ดูแลระบบ', { title: 'สิทธิ์ไม่เพียงพอ', variant: 'warning', icon: '🔒' });
      return;
    }

    const config = {
      workshop: {
        confirm: 'ต้องการนำรถกลับจากอู่หรือไม่?',
        title: 'นำรถกลับจากอู่',
        success: 'นำรถกลับจากอู่เรียบร้อย',
        action: () => vehicleApi.returnFromWorkshop(vehicle.id)
      },
      auction: {
        confirm: 'ต้องการนำรถกลับจากสนามประมูลหรือไม่?',
        title: 'นำรถกลับจากประมูล',
        success: 'นำรถกลับจากประมูลเรียบร้อย',
        action: () => vehicleApi.returnFromAuction(vehicle.id)
      },
      sale: {
        confirm: 'ต้องการนำรถกลับจากการขายหรือไม่?',
        title: 'นำรถกลับจากการขาย',
        success: 'นำรถกลับจากการขายเรียบร้อย',
        action: () => vehicleApi.returnFromSale(vehicle.id)
      }
    };

    const target = config[type];
    if (!target) return;

    const confirmed = await confirmAction(target.confirm, {
      title: target.title,
      subtitle: vehicle.license_plate,
      variant: 'info',
      icon: '🔁'
    });
    if (!confirmed) return;

    setReturningId(vehicle.id);
    try {
      await target.action();
      notify(target.success, { title: 'สำเร็จ', variant: 'success', icon: '✅' });
      onRefresh?.();
    } catch (error) {
      console.error('Return vehicle error:', error);
      notify(error.message || 'เกิดข้อผิดพลาดในการนำรถกลับ', { title: 'ดำเนินการไม่สำเร็จ', variant: 'danger', icon: '⚠️' });
    } finally {
      setReturningId(null);
    }
  };

  const handleMoveToParkingLot = async (vehicle) => {
    if (!isAdmin) {
      notify('การดำเนินการนี้ใช้ได้เฉพาะผู้ดูแลระบบ', { title: 'สิทธิ์ไม่เพียงพอ', variant: 'warning', icon: '🔒' });
      return;
    }

    let moveType = null;
    if (vehicle.in_workshop) {
      moveType = 'workshop';
    } else if (vehicle.in_auction) {
      moveType = 'auction';
    } else if (vehicle.in_sale) {
      moveType = 'sale';
    }

    if (!moveType) {
      notify('รถคันนี้อยู่ในลานแล้ว', { title: 'ข้อมูล', variant: 'info', icon: 'ℹ️' });
      return;
    }

    const confirmed = await confirmAction('ต้องการย้ายรถกลับไปยังลานจอดหรือไม่?', {
      title: 'ย้ายรถไปยังลาน',
      subtitle: vehicle.license_plate,
      variant: 'info',
      icon: '🚗'
    });
    if (!confirmed) return;

    setReturningId(vehicle.id);
    try {
      await handleReturnVehicle(vehicle, moveType);
    } finally {
      setReturningId(null);
    }
  };

  const renderActionButtons = (vehicle) => {
    if (!allowAdminActions) return null;
    const isProcessing = returningId === vehicle.id;

    if (context === 'main') {
      return (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => handleEdit(vehicle)}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded text-xs font-medium flex items-center gap-1 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L7.5 20.5l-4 1 1-4 12.732-12.732z" />
            </svg>
            แก้ไข
          </button>
          {(vehicle.in_workshop || vehicle.in_auction || vehicle.in_sale) && (
            <button
              onClick={() => handleMoveToParkingLot(vehicle)}
              disabled={isProcessing}
              className={`px-3 py-1.5 rounded text-xs font-medium flex items-center gap-1 transition-colors ${isProcessing ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 text-white'}`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.593 3.322a1 1 0 001.414 0L22.282 0m0 0a1 1 0 00-1.414-1.414L17.593 3.322m4.689-4.689a1 1 0 00-1.414 1.414L22.282 0M3 13a9 9 0 110-18 9 9 0 010 18zm0-2a7 7 0 100-14 7 7 0 000 14z" />
              </svg>
              ย้ายกลับลาน
            </button>
          )}
          <button
            onClick={() => handleDelete(vehicle.id)}
            className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-medium flex items-center gap-1 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            ลบ
          </button>
        </div>
      );
    }

    if (context === 'workshop') {
      return (
        <button
          onClick={() => handleReturnVehicle(vehicle, 'workshop')}
          disabled={isProcessing}
          className={`px-3 py-1.5 rounded text-xs font-medium flex items-center gap-1 transition-colors ${isProcessing ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700 text-white'}`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v13a1 1 0 001 1h14a1 1 0 001-1V7m-4 4l-5-5-5 5" />
          </svg>
          {isProcessing ? 'กำลังนำกลับ...' : 'นำกลับจากอู่'}
        </button>
      );
    }

    if (context === 'auction') {
      return (
        <button
          onClick={() => handleReturnVehicle(vehicle, 'auction')}
          disabled={isProcessing}
          className={`px-3 py-1.5 rounded text-xs font-medium flex items-center gap-1 transition-colors ${isProcessing ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700 text-white'}`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
          {isProcessing ? 'กำลังนำกลับ...' : 'นำกลับจากประมูล'}
        </button>
      );
    }

    if (context === 'sale') {
      return (
        <button
          onClick={() => handleReturnVehicle(vehicle, 'sale')}
          disabled={isProcessing}
          className={`px-3 py-1.5 rounded text-xs font-medium flex items-center gap-1 transition-colors ${isProcessing ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700 text-white'}`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14" />
          </svg>
          {isProcessing ? 'กำลังนำกลับ...' : 'นำกลับจากขาย'}
        </button>
      );
    }

    return null;
  };

  const handleAdd = () => {
    if (!guardMainAdminAction()) return;
    setEditingVehicle(null);
    setShowModal(true);
  };

  const getExportColumns = useCallback(() => {
    const initialColumns = visibleColumns.filter(Boolean);
    const columnMap = new Map(initialColumns.map((column) => [column.key, column]));
    systemColumns.forEach((column) => {
      if (!column?.exportOnly) return;
      if (!column?.key) return;
      if (!columnMap.has(column.key)) {
        columnMap.set(column.key, column);
      }
    });
    
    // Reorder columns: วันที่เข้าสถานะ should come before วันที่ย้ายรถ
    const columns = Array.from(columnMap.values());
    const reorderedColumns = [];
    const movementEntryDateCol = columns.find(col => col.key === 'movement_entry_date');
    const startTimeCol = columns.find(col => col.key === 'start_time');
    
    columns.forEach((col) => {
      if (col.key === 'movement_entry_date' || col.key === 'start_time') {
        return; // Skip, we'll add them in order
      }
      reorderedColumns.push(col);
    });
    
    // Find position of start_time and insert movement_entry_date before it
    const startTimeIndex = reorderedColumns.findIndex(col => col.key === 'start_time');
    if (startTimeIndex !== -1 && movementEntryDateCol) {
      reorderedColumns.splice(startTimeIndex, 0, movementEntryDateCol);
    } else if (movementEntryDateCol && startTimeCol) {
      // If start_time not found, add both at the end
      reorderedColumns.push(movementEntryDateCol);
      reorderedColumns.push(startTimeCol);
    } else if (startTimeCol) {
      reorderedColumns.push(startTimeCol);
    }
    
    return reorderedColumns;
  }, [systemColumns, visibleColumns]);

  const handleExport = () => {
    const columnDefinitions = getExportColumns();
    const exportData = vehicles.map((vehicle, index) => {
      const row = {};
      columnDefinitions.forEach(({ key, label, exportValue }) => {
        let cellValue;
        if (typeof exportValue === 'function') {
          cellValue = exportValue(vehicle, index);
        } else if (key) {
          if (SYSTEM_COLUMN_KEYS.has(key)) {
            cellValue = vehicle[key];
          } else {
            cellValue = vehicle.custom_fields?.[key];
          }
        }
        const columnDef = columnDefinitions.find(col => col.key === key);
        if (columnDef?.type === 'number' && cellValue !== undefined && cellValue !== null && cellValue !== '') {
          cellValue = Number(cellValue);
        }
        if (columnDef) {
          if (columnDef.type === 'datetime' || (SYSTEM_COLUMN_KEYS.has(columnDef.key) && isLikelyDateColumn(columnDef.key))) {
            const formatted = formatTimestamp(cellValue);
            cellValue = formatted === '-' ? '' : formatted;
          } else if (SYSTEM_COLUMN_KEYS.has(columnDef.key)) {
            cellValue = formatSystemDisplayValue(cellValue, columnDef);
            cellValue = cellValue === '-' ? '' : cellValue;
          }
        }
        row[label || key] = cellValue ?? '';
      });
      return row;
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Vehicles');

    ws['!cols'] = columnDefinitions.map(({ label }) => ({ wch: Math.max(label.length + 4, 14) }));

    const prefix = context === 'workshop' ? 'workshop' : context === 'auction' ? 'auction' : 'parking';
    XLSX.writeFile(wb, `${prefix}-data-${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleClearData = async () => {
    if (!guardMainAdminAction()) return;
    const confirmed = await confirmAction('คุณต้องการลบข้อมูลทั้งหมดหรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้!', {
      title: 'ลบข้อมูลทั้งหมด',
      subtitle: 'รถทุกคันจะถูกลบออกจากระบบ',
      variant: 'danger',
      icon: '🧨'
    });
    if (!confirmed) return;
    
    try {
      await vehicleApi.clearAll();
      notify('ลบข้อมูลทั้งหมดเรียบร้อยแล้ว', { title: 'สำเร็จ', variant: 'success', icon: '✅' });
      onRefresh();
    } catch (error) {
      console.error('Clear data error:', error);
      notify('เกิดข้อผิดพลาดในการลบข้อมูล', { title: 'ลบไม่สำเร็จ', variant: 'danger', icon: '⚠️' });
    }
  };

  const handleImport = async (event) => {
    if (!guardMainAdminAction()) return;
    const file = event.target.files[0];
    if (!file) return;

    setImporting(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      let jsonData = XLSX.utils.sheet_to_json(worksheet);
      
      // Fix __EMPTY_* column names by mapping them to actual header values
      if (jsonData.length > 0) {
        const firstRow = jsonData[0];
        const emptyKeyMap = {};
        
        // Check if first row has __EMPTY keys (meaning headers are in data)
        const hasEmptyKeys = Object.keys(firstRow).some(k => k.startsWith('__EMPTY'));
        
        if (hasEmptyKeys && firstRow.__EMPTY) {
          // First row contains headers, use it to create mapping
          Object.entries(firstRow).forEach(([key, value]) => {
            if (key.startsWith('__EMPTY')) {
              emptyKeyMap[key] = String(value).trim();
            }
          });
          
          // Remove first row (header row) and remap all keys
          jsonData = jsonData.slice(1).map(row => {
            const newRow = {};
            Object.entries(row).forEach(([key, value]) => {
              const newKey = emptyKeyMap[key] || key;
              newRow[newKey] = value;
            });
            return newRow;
          });
        }
      }
      
      console.log('Parsed Excel data:', jsonData.length, 'rows', jsonData[0]);

      const normalizeText = (value) => (value === undefined || value === null) ? '' : String(value).trim();
      const parseInteger = (value) => {
        if (value === undefined || value === null || value === '') return null;
        const num = parseInt(value, 10);
        return Number.isNaN(num) ? null : num;
      };
      const parseDecimal = (value) => {
        if (value === undefined || value === null || value === '') return null;
        if (typeof value === 'number') {
          return Number.isFinite(value) ? value : null;
        }
        const cleaned = String(value).replace(/,/g, '').trim();
        if (!cleaned) return null;
        const num = Number(cleaned);
        return Number.isFinite(num) ? num : null;
      };
      const normalizeDateTimeValue = (value) => {
        if (value === undefined || value === null || value === '') return null;
        if (typeof value === 'number') {
          const excelDate = new Date(Math.round((value - 25569) * 86400 * 1000));
          if (!Number.isNaN(excelDate.getTime())) {
            return excelDate.toISOString();
          }
        }
        const text = String(value).trim();
        if (!text) return null;
        const numeric = Number(text);
        if (!Number.isNaN(numeric) && text.length >= 5) {
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
      const getValue = (row, keys) => {
        // First, create a map of trimmed keys to values for case-insensitive lookup
        const trimmedRowMap = {};
        Object.entries(row).forEach(([k, v]) => {
          const trimmedKey = k?.toString().trim();
          if (trimmedKey) {
            trimmedRowMap[trimmedKey] = v;
          }
        });
        
        for (const key of keys) {
          const trimmedKey = key?.toString().trim();
          if (trimmedRowMap[trimmedKey] !== undefined && trimmedRowMap[trimmedKey] !== null && trimmedRowMap[trimmedKey] !== '') {
            return trimmedRowMap[trimmedKey];
          }
        }
        return '';
      };

      const vehicles = [];
      const PAUSE_EVERY_ROWS = 500;
      const pause = () => new Promise(resolve => setTimeout(resolve, 0));

      for (let index = 0; index < jsonData.length; index += 1) {
        const row = jsonData[index];
        const normalizedRow = {};
        Object.entries(row).forEach(([rawKey, value]) => {
          if (value === undefined || value === null) return;
          const trimmedKey = rawKey?.toString().trim();
          if (!trimmedKey) return;
          normalizedRow[trimmedKey] = value;
        });

        const gpApprovalRaw = getValue(normalizedRow, ['สถานะการอนุมัติ(GP)', 'สถานะการอนุมัติ (GP)', 'สถานะการอนุมัติ', 'gp_approval_status']);
        const policyTypeRaw = getValue(normalizedRow, ['ประเภทกรมธรรม์', 'policy_type']);
        const policyAmountRaw = getValue(normalizedRow, ['ทุนประกัน', 'policy_amount']);
        const movementDateRaw = getValue(normalizedRow, ['วันที่ย้ายรถ', 'เวลาเริ่มต้น', 'start time', 'start_time']);
        const updatedDateRaw = getValue(normalizedRow, ['วันที่(อัพเดท)', 'วันที่ (อัพเดท)', 'updated_date', 'updated date']);
        const parkingLotRaw = getValue(normalizedRow, ['ลาน', 'ลานรถ', 'ลานจอด', 'ชื่อลานจอด', 'parking_lot_name']);
        const originLotRaw = getValue(normalizedRow, ['ลานต้นทาง', 'origin_lot']);
        const destinationLotRaw = getValue(normalizedRow, ['ลานปลายทาง', 'destination_lot']);
        const normalizedParkingLotName = normalizeText(parkingLotRaw) || normalizeText(originLotRaw);

        const customFields = {};
        const setCustomFieldValue = (rawKey, rawValue) => {
          if (rawValue === undefined || rawValue === null || rawValue === '') return;
          const lookupKey = rawKey?.toString().trim().toLowerCase();
          if (!lookupKey || !customColumnLookup.has(lookupKey)) return;
          const column = customColumnLookup.get(lookupKey);
          if (!column?.column_key) return;
          let formattedValue = rawValue;
          if (column.type === 'number') {
            const numericValue = Number(rawValue);
            formattedValue = Number.isFinite(numericValue) ? numericValue.toString() : rawValue.toString();
          } else if (column.type === 'datetime') {
            formattedValue = normalizeDateTimeValue(rawValue) || rawValue;
          } else if (column.type === 'boolean') {
            if (typeof rawValue === 'string') {
              const normalized = rawValue.trim().toLowerCase();
              if (['1', 'true', 'yes', 'y', 'ใช่'].includes(normalized)) {
                formattedValue = '1';
              } else if (['0', 'false', 'no', 'n', 'ไม่'].includes(normalized)) {
                formattedValue = '0';
              }
            } else {
              formattedValue = rawValue ? '1' : '0';
            }
          } else {
            formattedValue = rawValue?.toString().trim();
          }

          if (formattedValue === '' || formattedValue === undefined || formattedValue === null) return;
          customFields[column.column_key] = formattedValue;
        };

        Object.entries(normalizedRow).forEach(([key, value]) => {
          setCustomFieldValue(key, value);
        });

        // Get license plate - prioritize the one without "(map)" suffix
        let licensePlateValue = '';
        // First try to get the non-map version
        licensePlateValue = normalizeText(getValue(normalizedRow, ['ทะเบียนรถ', 'ทะเบียน', 'เลขทะเบียนเช่นกก-111', 'license_plate']));
        // If not found or empty, try other variations
        if (!licensePlateValue) {
          licensePlateValue = normalizeText(getValue(normalizedRow, ['ทะเบียนรถ(map)', 'ทะเบียนรถ (map)']));
        }

        vehicles.push({
          sequence_no: parseInteger(getValue(normalizedRow, ['ลำดับ', '#', 'sequence_no'])) ?? (index + 1),
          updated_date: normalizeDateTimeValue(updatedDateRaw),
          license_plate: licensePlateValue,
          province: normalizeText(getValue(normalizedRow, ['หมวด จว.', 'จังหวัด', 'province'])),
          brand: normalizeText(getValue(normalizedRow, ['ยี่ห้อ', 'brand'])),
          model: normalizeText(getValue(normalizedRow, ['รุ่น', 'รุ่นรถ', 'model'])),
          color: normalizeText(getValue(normalizedRow, ['สีรถ', 'สีรถ เช่น ขาว', 'color'])),
          transaction_type: normalizeText(getValue(normalizedRow, ['ประเภทรายการ', 'transaction_type', 'transaction', 'ประเภทรถ'])),
          parking_lot_name: normalizedParkingLotName,
          document_status: normalizeText(getValue(normalizedRow, ['สถานะเอกสาร', 'document_status'])),
          rmo: normalizeText(getValue(normalizedRow, ['rmo', 'RMO'])),
          cmo: normalizeText(getValue(normalizedRow, ['cmo', 'CMO'])),
          gp_approval_status: normalizeText(gpApprovalRaw),
          policy_type: normalizeText(policyTypeRaw),
          policy_amount: parseDecimal(policyAmountRaw),
          note_summary: normalizeText(getValue(normalizedRow, ['หมายเหตุ', 'note_summary'])),
          zone: normalizeText(getValue(normalizedRow, ['พิกัดลาน', 'โซนจอดรถ เช่น A1', 'zone'])),
          grade: normalizeText(getValue(normalizedRow, ['เกรด', 'grade'])),
          key_status: normalizeText(getValue(normalizedRow, ['มีกุญแจหรือไม่', 'มีกุญแจหรือไม่ เช่น มี, ไม่มี, เปิดประตูไม่ได้ หรืออื่นๆ (อธิบาย)', 'key_status'])),
          notes: normalizeText(getValue(normalizedRow, ['หมายเหตุ อื่นๆ เช่น ยกไปซ่อมเอง', 'หมายเหตุ อื่นๆ เช่น ยกไปซ่อมเอง, ยกไปอู่ชื่อ..... , ย้ายจาก A1 ไป B1', 'notes'])),
          key_number: normalizeText(getValue(normalizedRow, ['กุญแจ', 'key_number', 'key no'])),
          parking_lot_number: parseInteger(getValue(normalizedRow, ['ลำดับจอด', 'parking_lot_number'])),
          start_time: normalizeDateTimeValue(movementDateRaw),
          destination_lot: normalizeText(destinationLotRaw),
          custom_fields: customFields
        });

        if ((index + 1) % PAUSE_EVERY_ROWS === 0) {
          await pause();
        }
      }

      console.log('Importing vehicles:', vehicles.length, vehicles);
      const result = await vehicleApi.bulkCreate(vehicles);
      console.log('Import result:', result);
      notify(`นำเข้าข้อมูลสำเร็จ ${vehicles.length} รายการ`, { title: 'นำเข้าข้อมูลสำเร็จ', variant: 'success', icon: '✅' });
      onRefresh();
    } catch (error) {
      console.error('Import error:', error);
      const errorMsg = error.message || 'เกิดข้อผิดพลาดในการนำเข้าข้อมูล';
      notify(errorMsg, { title: 'นำเข้าไม่สำเร็จ', variant: 'danger', icon: '⚠️' });
    } finally {
      setImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const paginationControls = (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between w-full">
      <div className="text-sm text-slate-600">
        แสดง {showingFrom}-{showingTo} จาก {filteredVehicleCount.toLocaleString()} รายการ
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <span>จำนวนต่อหน้า:</span>
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="border border-slate-300 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            {PAGE_SIZE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
            disabled={currentPage <= 1}
            className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm font-medium text-slate-600 disabled:opacity-50"
          >
            ก่อนหน้า
          </button>
          <span className="text-sm text-slate-600">
            หน้า {Math.min(currentPage, totalPages)} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
            disabled={currentPage >= totalPages}
            className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm font-medium text-slate-600 disabled:opacity-50"
          >
            ถัดไป
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 pb-4">
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h2 className="text-xl font-bold text-slate-800 tracking-tight">ข้อมูลรถทั้งหมด <span className="text-slate-500 font-medium text-base ml-2">({filteredVehicles.length} / {vehicles.length} คัน)</span></h2>
          <div className="flex flex-wrap gap-2 sm:gap-3 items-center">
            {allowMainAdminActions ? (
              <>
                <button
                  onClick={handleAdd}
                  className="px-4 sm:px-5 py-3 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white rounded-lg sm:rounded-xl font-semibold transition-all flex items-center touch-manipulation min-h-[48px]"
                >
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  <span className="text-sm sm:text-base">เพิ่มรถ</span>
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={importing}
                  className="px-4 sm:px-5 py-3 bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white rounded-lg sm:rounded-xl font-semibold transition-all flex items-center disabled:opacity-50 touch-manipulation min-h-[48px]"
                >
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <span className="text-sm sm:text-base">{importing ? 'กำลังนำเข้า...' : 'นำเข้า Excel'}</span>
                </button>
                <button
                  onClick={handleClearData}
                  className="px-4 sm:px-5 py-3 bg-red-500 hover:bg-red-600 active:bg-red-700 text-white rounded-lg sm:rounded-xl font-semibold transition-all flex items-center touch-manipulation min-h-[48px]"
                >
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  <span className="text-sm sm:text-base">ล้างข้อมูล</span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleImport}
                  className="hidden"
                />
              </>
            ) : null}
            <button
              onClick={handleExport}
              className="px-4 sm:px-5 py-3 bg-purple-500 hover:bg-purple-600 active:bg-purple-700 text-white rounded-lg sm:rounded-xl font-semibold transition-all flex items-center touch-manipulation min-h-[48px]"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
              </svg>
              <span className="text-sm sm:text-base">ส่งออก Excel</span>
            </button>
          </div>
        </div>
        <div className="px-3 sm:px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-slate-50 to-white flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
          <div className="flex items-center gap-3 w-full lg:w-auto flex-wrap">
            <div className="relative flex-1 lg:flex-none min-w-[220px]">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="7" />
                <line x1="16.5" y1="16.5" x2="21" y2="21" />
              </svg>
              <input
                ref={globalSearchInputRef}
                type="text"
                value={globalSearch}
                onChange={handleGlobalSearch}
                placeholder="ค้นหาทุกคอลัมน์ (Ctrl+/)"
                className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 bg-white text-sm shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <button
              onClick={handleClearFilters}
              disabled={!hasActiveFilters}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 18L18 6M6 6l12 12" />
              </svg>
              ล้างทั้งหมด
            </button>
            <div className="flex items-center gap-2">
              <select
                value={lotFilterValue}
                onChange={(e) => onLotFilterChange?.(e.target.value)}
                className="px-3 py-2 border border-slate-200 rounded-lg bg-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              >
                {lotFilterOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label} ({option.count.toLocaleString('th-TH')} คัน)
                  </option>
                ))}
              </select>
              <button
                onClick={onRefresh}
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition flex items-center justify-center gap-2 text-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                รีเฟรช
              </button>
            </div>
          </div>
          {hasActiveFilters && (
            <div className="text-xs font-medium text-slate-500">
              กำลังกรอง:
              {globalSearch.trim() && <span className="ml-2 text-blue-600">ค้นหา "{globalSearch.trim()}"</span>}
              {activeColumnFilterEntries.map((entry) => (
                <span key={entry.key} className="ml-2 text-emerald-600">
                  {visibleColumns.find((col) => col.key === entry.key)?.label}: "{entry.trimmed}"
                </span>
              ))}
              {hasParkingLotFilter && (
                <span className="ml-2 text-emerald-600">
                  ลาน: "{selectedParkingLotLabel || 'ไม่ระบุ'}"
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="relative border border-slate-200 rounded-lg shadow-sm bg-white overflow-hidden">
        <div ref={tableScrollRef} className="overflow-x-auto scrollbar-hide pb-24">
          <table className="w-full min-w-[1200px] border-collapse text-[13px] sm:text-[14px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                {visibleColumns.map((column) => {
                  const meta = getColumnMeta(column);
                  const baseWidth = columnWidthMap.get(column.key) ?? COLUMN_WIDTHS[column.key];
                  const width = customColumnWidths[column.key] ?? baseWidth;
                  const columnStyle = width ? { minWidth: width, width } : undefined;
                  return (
                    <th
                      key={column.key || `col-${column.label}`}
                      style={columnStyle}
                      className={`px-3 py-2.5 text-left font-semibold text-slate-700 border-r border-slate-200 last:border-r-0 ${meta.hasFilter ? 'bg-blue-50/50' : ''} whitespace-nowrap relative group select-none`}
                    >
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between">
                          <span className="truncate">{column.label}</span>
                          {meta.hasFilter && <span className="inline-flex h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0" title={meta.filterDescription} />}
                        </div>
                        {column?.key && (
                          <div className="relative">
                            <div className="flex items-center gap-1 rounded border border-slate-200 bg-white px-1.5 py-0.5 focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-400 transition-shadow">
                              <input
                                ref={(node) => {
                                  if (node && column.key) {
                                    filterInputRefs.current.set(column.key, node);
                                  }
                                }}
                                type="text"
                                value={meta.filterValue}
                                onChange={(event) => handleColumnFilterChange(column.key, event.target.value)}
                                placeholder="ค้นหา..."
                                className="flex-1 bg-transparent text-[12px] text-slate-700 placeholder:text-slate-400 focus:outline-none w-full min-w-[40px]"
                              />
                              <button
                                onClick={() => setOpenFilterDropdown(openFilterDropdown === column.key ? null : column.key)}
                                className={`p-0.5 rounded transition ${meta.hasFilter ? 'text-blue-500 hover:bg-blue-50' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}
                                title="ตัวกรอง"
                              >
                                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                                </svg>
                              </button>
                            </div>
                            {openFilterDropdown === column.key && (
                              <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl z-50 max-h-64 overflow-y-auto min-w-[200px] font-normal">
                                <div className="p-2">
                                  <div className="flex items-center justify-between mb-1">
                                    <button
                                      onClick={() => {
                                        handleColumnFilterChange(column.key, '');
                                        setOpenFilterDropdown(null);
                                      }}
                                      className="flex-1 text-left px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded font-medium transition-colors"
                                    >
                                      ล้างตัวกรอง
                                    </button>
                                    <button
                                      onClick={() => setOpenFilterDropdown(null)}
                                      className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600 transition"
                                      title="ปิดเมนูกรอง"
                                    >
                                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M18 6L6 18M6 6l12 12" />
                                      </svg>
                                    </button>
                                  </div>
                                  <div className="border-t border-slate-100 my-1" />
                                  {getUniqueColumnValues(column.key).map((value) => {
                                    const displayValue = (column?.type === 'datetime' || isLikelyDateColumn(column.key)) 
                                      ? (formatTimestamp(value) === '-' ? value : formatTimestamp(value))
                                      : value;
                                    // Check if this value is selected in the filter
                                    const currentFilters = meta.filterValue.split('|').map(f => f.trim()).filter(f => f);
                                    const isChecked = currentFilters.some(f => f.toLowerCase() === value.toLowerCase());
                                    return (
                                      <label key={value} className="flex items-center gap-2 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 rounded cursor-pointer transition-colors">
                                        <input
                                          type="checkbox"
                                          checked={isChecked}
                                          onChange={(e) => {
                                            if (e.target.checked) {
                                              if (!isChecked) {
                                                currentFilters.push(value);
                                                handleColumnFilterChange(column.key, currentFilters.join('|'));
                                              }
                                            } else {
                                              const filtered = currentFilters.filter(f => f.toLowerCase() !== value.toLowerCase());
                                              handleColumnFilterChange(column.key, filtered.join('|'));
                                            }
                                          }}
                                          className="rounded border-slate-300 text-blue-500 focus:ring-blue-500"
                                        />
                                        <span className="truncate">{displayValue}</span>
                                      </label>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      <Resizer onResize={(deltaX, isFinal) => handleResize(column.key, deltaX, isFinal)} className="hover:bg-blue-500" />
                    </th>
                  );
                })}
                {allowAdminActions && (
                  <th className="px-3 py-2.5 text-center text-[12px] font-semibold tracking-wide text-slate-700 border-b border-slate-200 whitespace-nowrap bg-slate-50">
                    การจัดการ
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200">
              {paginatedVehicles.length === 0 && (
                <tr>
                  <td colSpan={visibleColumns.length + actionColumnCount} className="text-center py-12 text-slate-500">
                    ไม่พบข้อมูลที่ตรงกับเงื่อนไขการค้นหา
                  </td>
                </tr>
              )}
              {paginatedVehicles.length > 0 &&
                paginatedVehicles.map((vehicle, index) => (
                  <tr 
                    key={vehicle.id} 
                    className={`${getRowStyleClasses(vehicle, index)} cursor-pointer hover:opacity-80 select-none`}
                    onMouseUp={(e) => {
                      if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
                        const now = Date.now();
                        const isDoubleClick = lastClickRef.current.target === vehicle.id && (now - lastClickRef.current.time) < 300;
                        
                        if (isDoubleClick) {
                          e.preventDefault();
                          e.stopPropagation();
                          setSelectedVehicleForMap(vehicle);
                          setShowMapModal(true);
                          lastClickRef.current = { time: 0, target: null };
                        } else {
                          lastClickRef.current = { time: now, target: vehicle.id };
                        }
                      }
                    }}
                  >
                    {visibleColumns.map((column) => {
                      const dirty = isCellDirty(vehicle.id, column);
                      const baseWidth = columnWidthMap.get(column.key) ?? COLUMN_WIDTHS[column.key];
                      const width = customColumnWidths[column.key] ?? baseWidth;
                      const columnStyle = width ? { minWidth: width, width } : undefined;
                      return (
                        <td
                          key={column.key}
                          className={`px-4 py-2.5 text-sm align-top border-x border-slate-100 first:border-l-0 last:border-r-0 ${dirty ? 'bg-blue-50/60' : ''} ${column.className || 'text-gray-900'} user-select-none`}
                          style={columnStyle}
                        >
                          {renderCellContent(vehicle, column, index)}
                        </td>
                      );
                    })}
                    {allowAdminActions && (
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {renderActionButtons(vehicle)}
                      </td>
                    )}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {!isSheetMode && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-2xl z-40">
          <div className="px-4 py-2 border-b border-gray-200 flex items-center justify-between">
            <div
              ref={stickyScrollbarRef}
              className="overflow-x-auto h-3 rounded-full bg-gray-300/70 shadow-inner flex-1"
            >
              <div style={{ width: Math.max(scrollTrackWidth, 1200) }} className="h-3" />
            </div>
            <button
              onClick={() => setBottomBarCollapsed(!bottomBarCollapsed)}
              className="ml-3 p-1 hover:bg-gray-100 rounded text-gray-600 hover:text-gray-800 transition"
              title={bottomBarCollapsed ? 'แสดงแถบควบคุม' : 'ซ่อนแถบควบคุม'}
            >
              <svg className={`w-5 h-5 transition-transform ${bottomBarCollapsed ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
            </button>
          </div>
          {!bottomBarCollapsed && (
            <div className="px-4 py-3 border-t border-gray-200">
              {paginationControls}
            </div>
          )}
        </div>
      )}

      {isSheetMode && (
        <>
          <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-2xl z-40">
            <div className="px-4 py-2 border-b border-gray-200 flex items-center justify-between">
              <div
                ref={stickyScrollbarRef}
                className="overflow-x-auto h-3 rounded-full bg-gray-300/70 shadow-inner flex-1"
              >
                <div style={{ width: Math.max(scrollTrackWidth, 1200) }} className="h-3" />
              </div>
              <button
                onClick={() => setBottomBarCollapsed(!bottomBarCollapsed)}
                className="ml-3 p-1 hover:bg-gray-100 rounded text-gray-600 hover:text-gray-800 transition"
                title={bottomBarCollapsed ? 'แสดงแถบควบคุม' : 'ซ่อนแถบควบคุม'}
              >
                <svg className={`w-5 h-5 transition-transform ${bottomBarCollapsed ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
              </button>
            </div>
            {!bottomBarCollapsed && (
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between px-4 py-3 border-t border-gray-200">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4 flex-1 w-full">
                  <div className="text-sm text-gray-700">
                    {hasPendingChanges ? (
                      <span>มีการแก้ไข {pendingCellCount} ช่อง ใน {pendingRowCount} แถว</span>
                    ) : (
                      <span className="text-gray-500">ไม่มีการแก้ไขที่ค้างอยู่</span>
                    )}
                  </div>
                  <div className="flex gap-2 w-full lg:w-auto">
                    <button
                      onClick={handleCancelAll}
                      disabled={!hasPendingChanges || saving}
                      className="flex-1 lg:flex-none px-4 py-2 rounded-lg border border-gray-300 text-gray-700 font-semibold disabled:opacity-50"
                    >
                      ยกเลิกการแก้ไข
                    </button>
                    <button
                      onClick={handleSaveAll}
                      disabled={!hasPendingChanges || saving}
                      className="flex-1 lg:flex-none px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold disabled:opacity-50"
                    >
                      {saving ? 'กำลังบันทึก...' : 'บันทึกทั้งหมด'}
                    </button>
                  </div>
                </div>
                <div className="w-full xl:w-auto">{paginationControls}</div>
              </div>
            )}
          </div>
        </>
      )}

      {showMapModal && selectedVehicleForMap && (
        <div className="fixed inset-0 z-[100] pointer-events-auto">
          <MapView 
            vehicles={[selectedVehicleForMap]} 
            allVehicles={vehicles}
            selectedLot={null}
            setSelectedLot={() => {}}
            parkingLots={[]}
            activeLotKey={null}
            activeLotLabel={null}
            lotFilterValue={EMPTY_LOT_FILTER_VALUE}
            onLotFilterChange={() => {}}
            isTableViewModal={true}
            onClose={() => {
              setShowMapModal(false);
              setSelectedVehicleForMap(null);
            }}
          />
        </div>
      )}
    </>
  );
}
