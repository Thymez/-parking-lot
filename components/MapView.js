import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { vehicleApi } from '../lib/api';
import { useAuth } from '../lib/auth';
import WorkshopModal from './WorkshopModal';
import AuctionModal from './AuctionModal';
import SaleModal from './SaleModal';
import { useDialog } from './DialogProvider';
import { useVehicleColumns } from './VehicleColumnsProvider';
import { useVehicleColors } from './VehicleColorProvider';
import { EMPTY_LOT_FILTER_VALUE } from './TableView';

const MAP_EDIT_FIELD_KEYS = [
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
  'gp_approval_name',
  'gp_approval_summary',
  'policy_type',
  'policy_amount',
  'estimated_damage',
  'salvage_value',
  'sale_status',
  'sale_date',
  'transfer_date',
  'transfer_amount',
  'buyer_name',
  'claim_payment_amount',
  'claim_payment_date',
  'payment_recipient_name',
  'note_summary',
  'movement_info',
  'movement_notes'
];

const buildEditDataFromVehicle = (vehicle) => {
  const data = {};
  MAP_EDIT_FIELD_KEYS.forEach((key) => {
    const value = vehicle?.[key];
    data[key] = value === undefined || value === null ? '' : value;
  });
  return data;
};

export default function MapView({ vehicles, allVehicles, selectedLot, setSelectedLot, parkingLots, activeLotKey, activeLotLabel, lotFilterValue, onLotFilterChange, isTableViewModal = false, onClose = null }) {
  const { user, isAdmin } = useAuth();
  const { columns: columnMetadata = [] } = useVehicleColumns();
  const { resolveColor } = useVehicleColors();
  const canEditCanvas = !!(user && (user.role === 'admin' || user.role === 'member'));
  const canArrangeVehicles = !!(user && (user.role === 'admin' || user.role === 'member'));
  const canClearCanvas = !!(user && user.role === 'admin');
  const { alert: showDialog, confirm: showConfirm } = useDialog();
  const notify = useCallback((message, options = {}) => showDialog({ confirmText: 'รับทราบ', icon: 'ℹ️', ...options, message }), [showDialog]);
  const confirmAction = useCallback((message, options = {}) => showConfirm({ confirmText: 'ยืนยัน', cancelText: 'ยกเลิก', icon: '❓', ...options, message }), [showConfirm]);
  const canvasRef = useRef(null);
  const animationFrameRef = useRef(null);
  const isMovingRef = useRef(false);
  const pendingPositionUpdate = useRef(null);
  
  // Canvas state
  const [viewport, setViewport] = useState({ scale: 1, offsetX: 0, offsetY: 0 });
  const [canvasSize, setCanvasSize] = useState({ width: 1200, height: 800 });
  
  // Vehicle interaction state
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [hoveredVehicle, setHoveredVehicle] = useState(null);
  const [isHoveringRotationBorder, setIsHoveringRotationBorder] = useState(false);
  const [interaction, setInteraction] = useState({ type: null, startX: 0, startY: 0, data: null });
  const lastUpdateTimestamp = useRef(0);
  const lastUpdatedVehicleId = useRef(null);
  
  // UI state
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('current');
  const [showEditModal, setShowEditModal] = useState(false);
  const [showWorkshopModal, setShowWorkshopModal] = useState(false);
  const [showAuctionModal, setShowAuctionModal] = useState(false);
  const [showSaleModal, setShowSaleModal] = useState(false);
  const [showMoveLotSelector, setShowMoveLotSelector] = useState(false);
  const [selectedMoveLotValue, setSelectedMoveLotValue] = useState('');
  const [showInfoBox, setShowInfoBox] = useState(true);
  const [editData, setEditData] = useState(() => buildEditDataFromVehicle(null));
  const [dragFromSidebar, setDragFromSidebar] = useState(null);
  const [workshopData, setWorkshopData] = useState({ workshop_name: '', workshop_notes: '' });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showMobileHint, setShowMobileHint] = useState(true);
  const [isMobileDragging, setIsMobileDragging] = useState(false);
  const [isDragOverCancel, setIsDragOverCancel] = useState(false);
  const [mobileDragPosition, setMobileDragPosition] = useState({ x: 0, y: 0 });
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const mobileLongPressTimeoutRef = useRef(null);
  const touchStartRef = useRef({ x: 0, y: 0 });
  const activeCustomColumns = useMemo(
    () => columnMetadata.filter((column) => column?.column_key && column.source !== 'system' && column.is_active !== 0),
    [columnMetadata]
  );

  const currentVehicleLotKey = useMemo(() => {
    if (!selectedVehicle) return '';
    const numberPart = selectedVehicle.parking_lot_number ?? '';
    const namePart = selectedVehicle.parking_lot_name?.trim().toLowerCase() || '';
    return `${numberPart}::${namePart}`;
  }, [selectedVehicle?.parking_lot_number, selectedVehicle?.parking_lot_name]);

  const moveLotOptions = useMemo(() => {
    if (!selectedVehicle) return [];
    const options = [];
    const seenKeys = new Set();

    const computeFilterValue = (number, normalizedName) => {
      if (normalizedName) {
        return normalizedName.toLowerCase();
      }
      if (number !== null && number !== undefined && number !== '') {
        return String(number);
      }
      return EMPTY_LOT_FILTER_VALUE;
    };

    const pushOption = (number, name, label, value) => {
      const normalizedName = name?.trim() || '';
      const key = `${number ?? ''}::${normalizedName.toLowerCase()}`;
      if (key === currentVehicleLotKey || seenKeys.has(key)) return;
      seenKeys.add(key);
      options.push({
        value,
        number: number ?? null,
        name: normalizedName,
        label,
        filterValue: computeFilterValue(number ?? null, normalizedName)
      });
    };

    pushOption(null, '', 'ไม่ระบุลาน (ค่าว่าง)', 'lot-empty');

    (parkingLots || []).forEach((lot, index) => {
      const trimmedName = typeof lot.parking_lot_name === 'string' ? lot.parking_lot_name.trim() : '';
      const parts = [];
      if (lot.parking_lot_number) {
        parts.push(`ลาน ${lot.parking_lot_number}`);
      }
      if (trimmedName) {
        parts.push(trimmedName);
      }
      const label = parts.length ? parts.join(': ') : 'ไม่ระบุลาน';
      pushOption(lot.parking_lot_number ?? null, trimmedName, label, `lot-${index}`);
    });

    return options;
  }, [parkingLots, currentVehicleLotKey, selectedVehicle]);

  useEffect(() => {
    setShowMoveLotSelector(false);
    setSelectedMoveLotValue('');
  }, [selectedVehicle]);

  useEffect(() => {
    if (!showMoveLotSelector) return;
    if (!moveLotOptions.length) {
      setSelectedMoveLotValue('');
      return;
    }
    const exists = moveLotOptions.some((option) => option.value === selectedMoveLotValue);
    if (!exists) {
      setSelectedMoveLotValue(moveLotOptions[0].value);
    }
  }, [moveLotOptions, showMoveLotSelector, selectedMoveLotValue]);

  // Ensure mobile 100vh behaves correctly when browser chrome is visible/hidden
  useEffect(() => {
    const updateViewportHeightVar = () => {
      if (typeof window === 'undefined') return;
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--app-vh', `${vh}px`);
    };

    updateViewportHeightVar();
    window.addEventListener('resize', updateViewportHeightVar);
    window.addEventListener('orientationchange', updateViewportHeightVar);
    return () => {
      window.removeEventListener('resize', updateViewportHeightVar);
      window.removeEventListener('orientationchange', updateViewportHeightVar);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const updateViewportFlag = () => setIsMobileViewport(window.innerWidth < 1024);
    updateViewportFlag();
    window.addEventListener('resize', updateViewportFlag);
    return () => window.removeEventListener('resize', updateViewportFlag);
  }, []);

  useEffect(() => {
    return () => {
      if (typeof document !== 'undefined') {
        document.body.classList.remove('overflow-hidden');
      }
    };
  }, []);

  const handleEditFieldChange = useCallback((field, value) => {
    setEditData(prev => ({
      ...prev,
      [field]: value
    }));
  }, []);

  const formatCustomFieldValue = useCallback((vehicle, column) => {
    const raw = vehicle?.custom_fields?.[column.column_key];
    if (raw === undefined || raw === null || raw === '') return '-';
    if (column.type === 'boolean') {
      return raw === true || raw === 1 || raw === '1' ? 'ใช่' : 'ไม่ใช่';
    }
    return raw;
  }, []);
  
  // Constants - Base sizes that will be scaled by zoom
  const GRID_MIN_SCALE = 0.4;
  const GRID_MAX_SCALE = 3;
  const BODY_WIDTH_FACTOR = 0.78;
  const BODY_HEIGHT_FACTOR = 0.82;
  const CABIN_WIDTH_FACTOR = 0.56;
  const CABIN_HEIGHT_FACTOR = 0.6;
  const ROTATION_RING_RADIUS_FACTOR = 0.6;
  const ROTATION_RING_STROKE_WIDTH = 10; // px before scale
  const BASE_VEHICLE_WIDTH = 120;
  const BASE_VEHICLE_HEIGHT = 140;
  const BASE_CORNER_HANDLE_SIZE = 12;
  const BASE_CORNER_HANDLE_OFFSET = 6;
  
  // Get scaled sizes based on viewport
  const getScaledSizes = useCallback(() => {
    return {
      VEHICLE_WIDTH: BASE_VEHICLE_WIDTH * viewport.scale,
      VEHICLE_HEIGHT: BASE_VEHICLE_HEIGHT * viewport.scale,
      CORNER_HANDLE_SIZE: BASE_CORNER_HANDLE_SIZE * viewport.scale,
      CORNER_HANDLE_OFFSET: BASE_CORNER_HANDLE_OFFSET * viewport.scale
    };
  }, [viewport.scale]);
  
  // Sync selectedVehicle with vehicles prop updates (for real-time WebSocket updates)
  useEffect(() => {
    // Always sync from vehicles prop when selectedVehicle becomes null (deselected)
    // This ensures the canvas shows the correct position after deselection
    const timeSinceLastUpdate = Date.now() - lastUpdateTimestamp.current;
    
    if (selectedVehicle) {
      const updatedVehicle = vehicles.find(v => v.id === selectedVehicle.id);
      
      // Check if this is the vehicle we just updated (increased to 5000ms for mobile)
      const isRecentlyUpdated = selectedVehicle.id === lastUpdatedVehicleId.current && timeSinceLastUpdate <= 5000;
      
      // Only update if not currently dragging AND not moving AND not recently updated
      const shouldSync = updatedVehicle && !interaction.type && !isMovingRef.current && !isRecentlyUpdated;
      
      if (shouldSync) {
        setSelectedVehicle(updatedVehicle);
      }
    }
  }, [vehicles, interaction.type, selectedVehicle]);
  
  // ============================================================================
  // CORE LOGIC: Vehicle Management
  // ============================================================================
  
  const getVehicleTransform = useCallback((vehicle) => {
    if (!vehicle || vehicle.x === null || vehicle.y === null) return null;
    return {
      screenX: vehicle.x * viewport.scale + viewport.offsetX,
      screenY: vehicle.y * viewport.scale + viewport.offsetY,
      rotation: (vehicle.rotation || 0) * Math.PI / 180,
      scale: viewport.scale
    };
  }, [viewport]);
  
  const getVehicleAtPoint = useCallback((screenX, screenY) => {
    const placed = (vehicles || []).filter(v => 
      v.x !== null && v.y !== null &&
      !v.in_workshop && !v.in_auction && !v.in_sale &&
      (!selectedLot || v.parking_lot_number === selectedLot)
    );
    
    const { VEHICLE_WIDTH, VEHICLE_HEIGHT } = getScaledSizes();
    
    for (let i = placed.length - 1; i >= 0; i--) {
      const vehicle = placed[i];
      const transform = getVehicleTransform(vehicle);
      if (!transform) continue;
      
      const dx = screenX - transform.screenX;
      const dy = screenY - transform.screenY;
      const cos = Math.cos(-transform.rotation);
      const sin = Math.sin(-transform.rotation);
      const localX = dx * cos - dy * sin;
      const localY = dx * sin + dy * cos;
      
      // Scaled size based on zoom
      const halfWidth = VEHICLE_WIDTH / 2;
      const halfHeight = VEHICLE_HEIGHT / 2;
      
      if (Math.abs(localX) <= halfWidth && Math.abs(localY) <= halfHeight) {
        return vehicle;
      }
    }
    return null;
  }, [vehicles, selectedLot, getVehicleTransform, getScaledSizes, activeTab]);
  
  const isNearRotationBorder = useCallback((screenX, screenY, transform) => {
    if (!transform) return false;
    
    const { VEHICLE_WIDTH, VEHICLE_HEIGHT } = getScaledSizes();
    const dx = screenX - transform.screenX;
    const dy = screenY - transform.screenY;
    const distanceFromCenter = Math.sqrt(dx * dx + dy * dy);
    
    // Match the rendered rotation ring (radius tied to body size)
    const bodyWidth = VEHICLE_WIDTH * BODY_WIDTH_FACTOR;
    const bodyHeight = VEHICLE_HEIGHT * BODY_HEIGHT_FACTOR;
    const ringRadius = Math.max(bodyWidth, bodyHeight) * ROTATION_RING_RADIUS_FACTOR;
    const visualThickness = ROTATION_RING_STROKE_WIDTH * viewport.scale;
    const detectionThickness = visualThickness * 1.1; // only 10% wider than stroke
    const innerRadius = Math.max(0, ringRadius - detectionThickness / 2);
    const outerRadius = ringRadius + detectionThickness / 2;
    
    // Check if click is within the rotation border ring
    // This allows clicking anywhere in the blue circle area, even if it's over canvas
    const isInRing = distanceFromCenter >= innerRadius && distanceFromCenter <= outerRadius;
    
    return isInRing;
  }, [getScaledSizes, viewport.scale]);
  
  // ============================================================================
  // CORE LOGIC: Interaction Handlers
  // ============================================================================
  
  // Check if a position overlaps with existing vehicles
  const isPositionOccupied = useCallback((x, y, excludeId = null) => {
    const placedVehicles = (vehicles || []).filter(v => 
      v.x !== null && v.y !== null && v.id !== excludeId &&
      !v.in_workshop && !v.in_auction && !v.in_sale &&
      (activeTab === 'all' || !selectedLot || v.parking_lot_number === selectedLot)
    );
    
    const padding = 10;
    const checkWidth = BASE_VEHICLE_WIDTH + padding;
    const checkHeight = BASE_VEHICLE_HEIGHT + padding;
    
    for (const vehicle of placedVehicles) {
      const dx = Math.abs(x - vehicle.x);
      const dy = Math.abs(y - vehicle.y);
      
      if (dx < checkWidth && dy < checkHeight) {
        return true;
      }
    }
    return false;
  }, [vehicles, activeTab, selectedLot]);
  
  // Find nearest empty position in a spiral pattern
  const findEmptyPosition = useCallback((targetX, targetY) => {
    if (!isPositionOccupied(targetX, targetY)) {
      return { x: targetX, y: targetY };
    }
    
    const step = BASE_VEHICLE_WIDTH + 20;
    const maxRadius = 10;
    
    for (let radius = 1; radius <= maxRadius; radius++) {
      for (let angle = 0; angle < 360; angle += 45) {
        const rad = (angle * Math.PI) / 180;
        const x = targetX + Math.cos(rad) * step * radius;
        const y = targetY + Math.sin(rad) * step * radius;
        
        if (!isPositionOccupied(x, y)) {
          return { x, y };
        }
      }
    }
    
    return { x: targetX, y: targetY };
  }, [isPositionOccupied]);

  const placeVehicleFromSidebar = useCallback((vehicleId, clientX, clientY) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return false;
    if (
      clientX < rect.left ||
      clientX > rect.right ||
      clientY < rect.top ||
      clientY > rect.bottom
    ) {
      return false;
    }

    const relativeX = clientX - rect.left;
    const relativeY = clientY - rect.top;
    const worldX = (relativeX - viewport.offsetX) / viewport.scale;
    const worldY = (relativeY - viewport.offsetY) / viewport.scale;
    const { x: finalX, y: finalY } = findEmptyPosition(worldX, worldY);

    vehicleApi.updatePosition(vehicleId, {
      x: finalX,
      y: finalY,
      rotation: 0
    }).catch(console.error);

    return true;
  }, [findEmptyPosition, viewport.offsetX, viewport.offsetY, viewport.scale]);

  // Enable drag-drop for unplaced vehicles
  const handleCanvasDrop = useCallback((e) => {
    e.preventDefault();
    if (!canEditCanvas) return;
    if (!dragFromSidebar || activeTab !== 'current') return;

    const success = placeVehicleFromSidebar(dragFromSidebar.id, e.clientX, e.clientY);
    if (!success) {
      notify('กรุณาวางรถภายในพื้นที่ Canvas', { title: 'วางรถไม่สำเร็จ', variant: 'warning', icon: '📍' });
    }
    setDragFromSidebar(null);
  }, [activeTab, canEditCanvas, dragFromSidebar, placeVehicleFromSidebar]);

  const handleCanvasDragOver = useCallback((e) => {
    if (!canEditCanvas) return;
    e.preventDefault();
  }, [canEditCanvas]);

  const clearMobileLongPressTimeout = useCallback(() => {
    if (mobileLongPressTimeoutRef.current) {
      clearTimeout(mobileLongPressTimeoutRef.current);
      mobileLongPressTimeoutRef.current = null;
    }
  }, []);

  const stopMobileDrag = useCallback(() => {
    setIsMobileDragging(false);
    setIsDragOverCancel(false);
    setMobileDragPosition({ x: 0, y: 0 });
    if (typeof document !== 'undefined') {
      document.body.classList.remove('overflow-hidden');
    }
  }, []);

  const startMobileDrag = useCallback((vehicle, touch) => {
    if (!vehicle || vehicle.x !== null || vehicle.y !== null) return;
    if (!canEditCanvas || activeTab !== 'current') return;

    setDragFromSidebar(vehicle);
    setIsMobileDragging(true);
    setIsDragOverCancel(false);
    setSidebarOpen(false);
    setMobileDragPosition({ x: touch.clientX, y: touch.clientY });

    if (typeof document !== 'undefined') {
      document.body.classList.add('overflow-hidden');
    }
  }, [activeTab, canEditCanvas]);

  const handleAutoArrange = useCallback(async () => {
    if (!canArrangeVehicles) {
      notify('มีเฉพาะ Admin หรือ Member เท่านั้นที่จัดเรียงได้', { title: 'สิทธิ์ไม่เพียงพอ', variant: 'warning', icon: '🔒' });
      return;
    }

    const confirmed = await confirmAction('จัดเรียงรถทั้งหมดให้ไม่ซ้อนกัน?', {
      title: 'ยืนยันการจัดเรียงรถ',
      subtitle: selectedLot ? `ระบบจะจัดตำแหน่งรถในลาน ${selectedLot}` : 'ระบบจะจัดตำแหน่งรถทุกลาน',
      variant: 'info',
      icon: '🧩'
    });
    if (!confirmed) return;

    try {
      await vehicleApi.autoArrange(selectedLot || null);
      notify('จัดเรียงรถเรียบร้อยแล้ว', { title: 'สำเร็จ', variant: 'success', icon: '✅' });
    } catch (error) {
      console.error('Auto arrange failed:', error);
      notify(error.message || 'ไม่สามารถจัดเรียงรถได้', { title: 'จัดเรียงไม่สำเร็จ', variant: 'danger', icon: '⚠️' });
    }
  }, [canArrangeVehicles, confirmAction, notify, selectedLot]);

  const handleClearCanvas = useCallback(async () => {
    if (!canClearCanvas) {
      notify('มีเฉพาะ Admin เท่านั้นที่ล้างแผนที่ได้', { title: 'สิทธิ์ไม่เพียงพอ', variant: 'warning', icon: '🔒' });
      return;
    }

    if (!selectedLot && !activeLotKey) {
      notify('กรุณาเลือกลานจอดก่อนล้างแผนที่', { title: 'ต้องเลือกลานก่อน', variant: 'warning', icon: '📍' });
      return;
    }

    const lotNumber = selectedLot || activeLotKey;
    const lotLabel = selectedLot ? (parkingLots.find(l => l.key === selectedLot)?.label || selectedLot) : activeLotLabel;

    const confirmed = await confirmAction(
      `ต้องการล้างตำแหน่งรถทั้งหมดในลาน "${lotLabel}" ใช่หรือไม่? การกระทำนี้ไม่สามารถยกเลิกได้`,
      { title: 'ยืนยันการล้างแผนที่' }
    );

    if (!confirmed) return;

    try {
      await vehicleApi.clearCanvas(lotNumber);
      setSelectedVehicle(null);
      notify('ล้างตำแหน่งรถในลานนี้เรียบร้อย', { title: 'สำเร็จ', variant: 'success', icon: '✅' });
    } catch (error) {
      console.error('Failed to clear canvas:', error);
      notify('ไม่สามารถล้างแผนที่ได้', { title: 'เกิดข้อผิดพลาด', variant: 'danger', icon: '⚠️' });
    }
  }, [canClearCanvas, selectedLot, activeLotKey, activeLotLabel, confirmAction, notify]);

  const finalizeMobileDrag = useCallback((clientX, clientY) => {
    if (!dragFromSidebar) {
      stopMobileDrag();
      return;
    }

    if (!isDragOverCancel) {
      const placed = placeVehicleFromSidebar(dragFromSidebar.id, clientX, clientY);
      if (!placed) {
        notify('กรุณาวางรถภายในพื้นที่ Canvas', { title: 'วางรถไม่สำเร็จ', variant: 'warning', icon: '📍' });
      }
    }

    stopMobileDrag();
    setDragFromSidebar(null);
  }, [dragFromSidebar, isDragOverCancel, placeVehicleFromSidebar, stopMobileDrag]);

  const handleSidebarVehicleTouchStart = useCallback((event, vehicle) => {
    if (!isMobileViewport || isMobileDragging) return;
    if (!canEditCanvas || activeTab !== 'current') return;
    if (vehicle.x !== null || vehicle.y !== null) return;

    const touch = event.touches?.[0];
    if (!touch) return;

    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    clearMobileLongPressTimeout();
    mobileLongPressTimeoutRef.current = setTimeout(() => {
      startMobileDrag(vehicle, touch);
    }, 400);
  }, [activeTab, canEditCanvas, clearMobileLongPressTimeout, isMobileDragging, isMobileViewport, startMobileDrag]);

  const handleSidebarVehicleTouchMove = useCallback((event) => {
    if (!isMobileViewport) return;
    const touch = event.touches?.[0];
    if (!touch) return;

    if (!isMobileDragging && mobileLongPressTimeoutRef.current) {
      const deltaX = touch.clientX - touchStartRef.current.x;
      const deltaY = touch.clientY - touchStartRef.current.y;
      if (Math.hypot(deltaX, deltaY) > 15) {
        clearMobileLongPressTimeout();
      }
    }
  }, [clearMobileLongPressTimeout, isMobileDragging, isMobileViewport]);

  const handleSidebarVehicleTouchEnd = useCallback(() => {
    if (!isMobileDragging) {
      clearMobileLongPressTimeout();
    }
  }, [clearMobileLongPressTimeout, isMobileDragging]);

  useEffect(() => {
    if (!isMobileDragging) return;

    const handleMove = (e) => {
      if (!dragFromSidebar) return;
      const touch = e.touches?.[0];
      if (!touch) return;

      setMobileDragPosition({ x: touch.clientX, y: touch.clientY });
      if (typeof window !== 'undefined') {
        const cancelThreshold = window.innerHeight - 110;
        setIsDragOverCancel(touch.clientY >= cancelThreshold);
      }
      e.preventDefault();
    };

    const handleEnd = (e) => {
      const touch = e.changedTouches?.[0];
      if (!touch) return;
      finalizeMobileDrag(touch.clientX, touch.clientY);
    };

    const handleCancel = () => {
      stopMobileDrag();
      setDragFromSidebar(null);
    };

    window.addEventListener('touchmove', handleMove, { passive: false });
    window.addEventListener('touchend', handleEnd);
    window.addEventListener('touchcancel', handleCancel);

    return () => {
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleEnd);
      window.removeEventListener('touchcancel', handleCancel);
    };
  }, [isMobileDragging, dragFromSidebar, finalizeMobileDrag, stopMobileDrag]);

  const getPointerPosition = useCallback((event) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = event.touches ? event.touches[0].clientX : event.clientX;
    const clientY = event.touches ? event.touches[0].clientY : event.clientY;
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  }, []);

  const handleCanvasMouseDown = useCallback((e) => {
    if (!canEditCanvas || !canvasRef.current) return;
    const { x, y } = getPointerPosition(e);

    if (selectedVehicle && selectedVehicle.x !== null && selectedVehicle.y !== null) {
      const transform = getVehicleTransform(selectedVehicle);
      if (transform && isNearRotationBorder(x, y, transform)) {
        isMovingRef.current = true;
        const dx = x - transform.screenX;
        const dy = y - transform.screenY;
        const startAngle = Math.atan2(dx, -dy) * (180 / Math.PI);

        setInteraction({
          type: 'rotate',
          startX: x,
          startY: y,
          data: {
            initialRotation: selectedVehicle.rotation || 0,
            startAngle,
            vehicleId: selectedVehicle.id,
            centerX: transform.screenX,
            centerY: transform.screenY
          }
        });
        return;
      }
    }

    const vehicle = getVehicleAtPoint(x, y);

    if (vehicle) {
      if (selectedVehicle && selectedVehicle.id === vehicle.id) {
        isMovingRef.current = true;
        setInteraction({
          type: 'move',
          startX: x,
          startY: y,
          data: {
            initialX: vehicle.x,
            initialY: vehicle.y,
            vehicleId: vehicle.id
          }
        });
      } else {
        setSelectedVehicle(vehicle);
        setInteraction({
          type: 'pan',
          startX: x,
          startY: y,
          data: { initialOffsetX: viewport.offsetX, initialOffsetY: viewport.offsetY }
        });
      }
    } else {
      setInteraction({
        type: 'pan',
        startX: x,
        startY: y,
        data: { initialOffsetX: viewport.offsetX, initialOffsetY: viewport.offsetY }
      });
      setSelectedVehicle(null);
      setShowEditModal(false);
    }
  }, [canEditCanvas, getPointerPosition, getVehicleAtPoint, getVehicleTransform, isNearRotationBorder, selectedVehicle, viewport.offsetX, viewport.offsetY]);

  const handleCanvasMouseMove = useCallback((e) => {
    if (!canEditCanvas || !canvasRef.current) return;
    if (e.touches && e.touches.length > 1) return;

    const { x, y } = getPointerPosition(e);

    if (!interaction.type) {
      const vehicle = getVehicleAtPoint(x, y);
      setHoveredVehicle(vehicle);

      if (selectedVehicle && selectedVehicle.x !== null && selectedVehicle.y !== null) {
        const transform = getVehicleTransform(selectedVehicle);
        if (transform) {
          setIsHoveringRotationBorder(isNearRotationBorder(x, y, transform));
        } else {
          setIsHoveringRotationBorder(false);
        }
      } else {
        setIsHoveringRotationBorder(false);
      }
      return;
    }

    if (interaction.type === 'pan') {
      const dx = x - interaction.startX;
      const dy = y - interaction.startY;

      setViewport(prev => ({
        ...prev,
        offsetX: interaction.data.initialOffsetX + dx,
        offsetY: interaction.data.initialOffsetY + dy
      }));
      return;
    }

    if (!selectedVehicle) return;

    if (interaction.type === 'move') {
      const dx = (x - interaction.startX) / viewport.scale;
      const dy = (y - interaction.startY) / viewport.scale;

      const newX = interaction.data.initialX + dx;
      const newY = interaction.data.initialY + dy;

      pendingPositionUpdate.current = {
        vehicleId: selectedVehicle.id,
        x: newX,
        y: newY,
        rotation: selectedVehicle.rotation || 0
      };

      // Use requestAnimationFrame for smoother dragging
      if (!canvasRef.current._dragUpdateScheduled) {
        canvasRef.current._dragUpdateScheduled = true;
        requestAnimationFrame(() => {
          setSelectedVehicle(prev => (prev ? { ...prev, x: newX, y: newY } : prev));
          lastUpdateTimestamp.current = Date.now();
          canvasRef.current._dragUpdateScheduled = false;
        });
      }
      return;
    }

    if (interaction.type === 'rotate') {
      const dx = x - interaction.data.centerX;
      const dy = y - interaction.data.centerY;
      const currentAngle = Math.atan2(dx, -dy) * (180 / Math.PI);
      const angleDelta = currentAngle - interaction.data.startAngle;
      const newRotation = interaction.data.initialRotation + angleDelta;

      pendingPositionUpdate.current = {
        vehicleId: selectedVehicle.id,
        x: selectedVehicle.x,
        y: selectedVehicle.y,
        rotation: newRotation
      };

      // Use requestAnimationFrame for smoother rotation
      if (!canvasRef.current._rotateUpdateScheduled) {
        canvasRef.current._rotateUpdateScheduled = true;
        requestAnimationFrame(() => {
          setSelectedVehicle(prev => (prev ? { ...prev, rotation: newRotation } : prev));
          canvasRef.current._rotateUpdateScheduled = false;
        });
      }
    }
  }, [canEditCanvas, getPointerPosition, interaction, selectedVehicle, viewport.scale, getVehicleAtPoint, getVehicleTransform, isNearRotationBorder]);

  const handleCanvasMouseUp = useCallback(async () => {
    if (!canEditCanvas) return;

    const shouldSave = interaction.type === 'move' || interaction.type === 'rotate';
    const updateData = pendingPositionUpdate.current || (selectedVehicle ? {
      vehicleId: selectedVehicle.id,
      x: selectedVehicle.x,
      y: selectedVehicle.y,
      rotation: selectedVehicle.rotation || 0
    } : null);

    if (shouldSave && updateData) {
      try {
        await vehicleApi.updatePosition(updateData.vehicleId, {
          x: updateData.x,
          y: updateData.y,
          rotation: updateData.rotation
        });

        if (selectedVehicle && selectedVehicle.id === updateData.vehicleId) {
          lastUpdateTimestamp.current = Date.now();
          lastUpdatedVehicleId.current = updateData.vehicleId;
          setSelectedVehicle(prev => (prev ? {
            ...prev,
            x: updateData.x,
            y: updateData.y,
            rotation: updateData.rotation
          } : prev));
        }
      } catch (error) {
        console.error('Failed to update vehicle position:', error);
      }
    }

    pendingPositionUpdate.current = null;
    isMovingRef.current = false;
    setInteraction({ type: null, startX: 0, startY: 0, data: null });
  }, [canEditCanvas, interaction, selectedVehicle]);

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setViewport(prev => ({
      ...prev,
      scale: Math.max(0.3, Math.min(2.5, prev.scale * delta))
    }));
  }, []);

  const handleCanvasDoubleClick = useCallback((e) => {
    if (!canEditCanvas || !canvasRef.current) return;
    e.preventDefault();
    const { x, y } = getPointerPosition(e);
    const vehicle = getVehicleAtPoint(x, y);

    if (!vehicle) return;

    setSelectedVehicle(vehicle);
    setEditData(buildEditDataFromVehicle(vehicle));
    setShowEditModal(true);
  }, [canEditCanvas, getPointerPosition, getVehicleAtPoint]);

  // Touch handlers for mobile
  const lastTouchDistance = useRef(null);
  const lastTapTime = useRef(0);
  const lastTapVehicle = useRef(null);

  const handleTouchStart = useCallback((e) => {
    if (!canEditCanvas || !canvasRef.current) return;

    if (e.touches.length === 2) {
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const distance = Math.hypot(
        touch2.clientX - touch1.clientX,
        touch2.clientY - touch1.clientY
      );
      lastTouchDistance.current = distance;
      e.preventDefault();
      return;
    }

    const { x, y } = getPointerPosition(e);
    const vehicle = getVehicleAtPoint(x, y);
    const now = Date.now();
    const timeSinceLastTap = now - lastTapTime.current;

    if (timeSinceLastTap < 500 && vehicle && lastTapVehicle.current?.id === vehicle.id) {
      setSelectedVehicle(vehicle);
      setEditData(buildEditDataFromVehicle(vehicle));
      setShowEditModal(true);
      lastTapTime.current = 0;
      lastTapVehicle.current = null;
      e.preventDefault();
      return;
    }

    lastTapTime.current = now;
    lastTapVehicle.current = vehicle;
    e.preventDefault();
    handleCanvasMouseDown(e);
  }, [canEditCanvas, getPointerPosition, getVehicleAtPoint, handleCanvasMouseDown]);

  const handleTouchMove = useCallback((e) => {
    if (!canEditCanvas) return;

    if (e.touches.length === 2) {
      e.preventDefault();
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const distance = Math.hypot(
        touch2.clientX - touch1.clientX,
        touch2.clientY - touch1.clientY
      );

      if (lastTouchDistance.current) {
        const delta = distance / lastTouchDistance.current;
        const smoothDelta = Math.max(0.95, Math.min(1.05, delta));
        setViewport(prev => ({
          ...prev,
          scale: Math.max(0.3, Math.min(2.5, prev.scale * smoothDelta))
        }));
      }

      lastTouchDistance.current = distance;
      return;
    }

    if (!interaction.type) {
      return;
    }

    e.preventDefault();
    handleCanvasMouseMove(e);
  }, [canEditCanvas, handleCanvasMouseMove, interaction.type]);

  const handleTouchEnd = useCallback((e) => {
    if (!canEditCanvas) return;
    if (e.touches && e.touches.length > 0) return;
    e.preventDefault();
    handleCanvasMouseUp();
  }, [canEditCanvas, handleCanvasMouseUp]);

  const handleRemoveFromCanvas = useCallback(async () => {
    if (!selectedVehicle || !canEditCanvas) return;

    try {
      await vehicleApi.updatePosition(selectedVehicle.id, {
        x: null,
        y: null,
        rotation: 0
      });

      setSelectedVehicle(prev => prev ? {
        ...prev,
        x: null,
        y: null,
        rotation: 0
      } : prev);
      notify('นำรถออกจาก Canvas แล้ว', { title: 'สำเร็จ', variant: 'success', icon: '✅' });
    } catch (error) {
      console.error('Failed to remove vehicle from canvas:', error);
      notify('ไม่สามารถนำรถออกจากแผนที่ได้', { title: 'เกิดข้อผิดพลาด', variant: 'danger', icon: '⚠️' });
    }
  }, [selectedVehicle, canEditCanvas, notify, setSelectedVehicle]);

  const handleMoveLot = useCallback(async () => {
    if (!selectedVehicle || !canEditCanvas || !selectedMoveLotValue) {
      return;
    }

    const targetOption = moveLotOptions.find((option) => option.value === selectedMoveLotValue);
    if (!targetOption) {
      notify('กรุณาเลือกลานใหม่ก่อน', { title: 'เลือกไม่สำเร็จ', variant: 'warning', icon: 'ℹ️' });
      return;
    }

    try {
      const baseData = buildEditDataFromVehicle(selectedVehicle);
      const updatePayload = {
        ...baseData,
        parking_lot_number: targetOption.number,
        parking_lot_name: targetOption.name,
        x: null,
        y: null,
        rotation: 0,
        custom_fields: selectedVehicle?.custom_fields || {}
      };

      await vehicleApi.update(selectedVehicle.id, updatePayload);

      setSelectedVehicle((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          parking_lot_number: targetOption.number,
          parking_lot_name: targetOption.name,
          x: null,
          y: null,
          rotation: 0
        };
      });

      setShowMoveLotSelector(false);
      setSelectedMoveLotValue('');
      setActiveTab('current');
      if (typeof setSelectedLot === 'function') {
        setSelectedLot(targetOption.number ?? null);
      }
      if (typeof onLotFilterChange === 'function') {
        onLotFilterChange(targetOption.filterValue ?? lotFilterValue);
      }
      notify('ย้ายลานเรียบร้อย', { title: 'สำเร็จ', variant: 'success', icon: '✅' });
    } catch (error) {
      console.error('Failed to move vehicle lot:', error);
      notify('ไม่สามารถย้ายลานได้', { title: 'เกิดข้อผิดพลาด', variant: 'danger', icon: '⚠️' });
    }
  }, [selectedVehicle, canEditCanvas, selectedMoveLotValue, moveLotOptions, notify, setSelectedLot, onLotFilterChange, lotFilterValue]);

  // ============================================================================
  // CORE LOGIC: Edit Modal
  // ============================================================================

  const handleSaveEdit = useCallback(async () => {
    if (!selectedVehicle || !canEditCanvas) return;
    
    try {
      // Include current position, rotation, and parking lot info to prevent data loss
      const updateData = {
        ...editData,
        x: selectedVehicle.x,
        y: selectedVehicle.y,
        rotation: selectedVehicle.rotation || 0,
        parking_lot_number: selectedVehicle.parking_lot_number,
        parking_lot_name: selectedVehicle.parking_lot_name,
        zone: selectedVehicle.zone
      };
      console.log('Saving vehicle with position:', updateData);
      await vehicleApi.update(selectedVehicle.id, updateData);
      console.log('Vehicle saved successfully');
      setShowEditModal(false);
      setEditData(buildEditDataFromVehicle(null));
    } catch (error) {
      console.error('Failed to update vehicle:', error);
      notify('ไม่สามารถบันทึกข้อมูลได้', { title: 'เกิดข้อผิดพลาด', variant: 'danger', icon: '⚠️' });
    }
  }, [canEditCanvas, selectedVehicle, editData, notify]);

  const handleDeleteVehicle = useCallback(async () => {
    if (!selectedVehicle || !isAdmin) {
      notify('มีเฉพาะผู้ดูแลระบบเท่านั้นที่ลบรถได้', { title: 'สิทธิ์ไม่เพียงพอ', variant: 'warning', icon: '🔒' });
      return;
    }

    const confirmed = await confirmAction('คุณต้องการลบรถคันนี้ถาวรหรือไม่?', {
      title: 'ลบข้อมูลรถ',
      subtitle: selectedVehicle.license_plate ? `ทะเบียน ${selectedVehicle.license_plate}` : undefined,
      variant: 'danger',
      icon: '🗑️'
    });
    if (!confirmed) return;

    try {
      await vehicleApi.delete(selectedVehicle.id);
      notify('ลบรถเรียบร้อยแล้ว', { title: 'สำเร็จ', variant: 'success', icon: '✅' });
      setShowEditModal(false);
      setSelectedVehicle(null);
    } catch (error) {
      console.error('Failed to delete vehicle:', error);
      notify('ไม่สามารถลบรถได้', { title: 'เกิดข้อผิดพลาด', variant: 'danger', icon: '⚠️' });
    }
  }, [confirmAction, isAdmin, notify, selectedVehicle]);
  
  // ============================================================================
  // RENDERING: Canvas Drawing
  // ============================================================================
  
  const shadeColor = (color, percent) => {
    const num = parseInt(color.replace("#",""), 16);
    const amt = Math.round(2.55 * percent);
    const R = Math.max(0, Math.min(255, (num >> 16) + amt));
    const G = Math.max(0, Math.min(255, (num >> 8 & 0x00FF) + amt));
    const B = Math.max(0, Math.min(255, (num & 0x0000FF) + amt));
    return "#" + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
  };
  
  const drawVehicle = useCallback((ctx, vehicle, isSelected, isHovered, isHoveringRotation) => {
    const transform = getVehicleTransform(vehicle);
    if (!transform) return;

    const { VEHICLE_WIDTH, VEHICLE_HEIGHT } = getScaledSizes();

    ctx.save();
    ctx.translate(transform.screenX, transform.screenY);
    ctx.rotate(transform.rotation);

    const resolved = resolveColor(vehicle.color);
    const color = resolved.hex || '#3B82F6';
    const w = VEHICLE_WIDTH;
    const h = VEHICLE_HEIGHT;
    const scale = viewport.scale;
    const textScale = Math.max(0.6, Math.min(2.5, scale));

    const bodyWidth = w * BODY_WIDTH_FACTOR;
    const bodyHeight = h * BODY_HEIGHT_FACTOR;
    const cabinWidth = bodyWidth * CABIN_WIDTH_FACTOR;
    const cabinHeight = bodyHeight * CABIN_HEIGHT_FACTOR;
    const noseDepth = bodyHeight * 0.24;
    const tailDepth = bodyHeight * 0.22;

    const wheelOffsetX = bodyWidth * 0.4;
    const wheelRadius = Math.max(11, 11.5 * textScale);

    // Glow while hovering/selected
    if (isSelected || isHovered) {
      ctx.shadowColor = isSelected ? 'rgba(59, 130, 246, 0.55)' : 'rgba(0,0,0,0.25)';
      ctx.shadowBlur = isSelected ? 28 : 14;
      ctx.shadowOffsetY = isSelected ? 6 : 3;
    }

    // Wheels (shadow first so it stays below body)
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(-wheelOffsetX / 2, bodyHeight * 0.45, wheelRadius, wheelRadius * 0.45, 0, 0, Math.PI * 2);
    ctx.ellipse(wheelOffsetX / 2, bodyHeight * 0.45, wheelRadius, wheelRadius * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#0F172A';
    [ -wheelOffsetX / 2, wheelOffsetX / 2 ].forEach((x) => {
      ctx.beginPath();
      ctx.ellipse(x, bodyHeight * 0.46, wheelRadius * 0.85, wheelRadius * 0.95, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(x, bodyHeight * 0.46, wheelRadius * 0.55, wheelRadius * 0.75, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#1E293B';
      ctx.fill();
      ctx.fillStyle = '#94A3B8';
      ctx.beginPath();
      ctx.ellipse(x, bodyHeight * 0.46, wheelRadius * 0.25, wheelRadius * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0F172A';
    });

    // Car body
    const carGradient = ctx.createLinearGradient(-bodyWidth / 2, 0, bodyWidth / 2, 0);
    carGradient.addColorStop(0, shadeColor(color, 10));
    carGradient.addColorStop(0.5, color);
    carGradient.addColorStop(1, shadeColor(color, -10));

    ctx.beginPath();
    ctx.moveTo(-bodyWidth / 2, -bodyHeight / 2 + noseDepth);
    ctx.quadraticCurveTo(-bodyWidth / 2, -bodyHeight / 2, -bodyWidth * 0.28, -bodyHeight / 2);
    ctx.lineTo(bodyWidth * 0.28, -bodyHeight / 2);
    ctx.quadraticCurveTo(bodyWidth / 2, -bodyHeight / 2, bodyWidth / 2, -bodyHeight / 2 + noseDepth);
    ctx.lineTo(bodyWidth / 2, bodyHeight / 2 - tailDepth);
    ctx.quadraticCurveTo(bodyWidth / 2, bodyHeight / 2, bodyWidth * 0.25, bodyHeight / 2);
    ctx.lineTo(-bodyWidth * 0.25, bodyHeight / 2);
    ctx.quadraticCurveTo(-bodyWidth / 2, bodyHeight / 2, -bodyWidth / 2, bodyHeight / 2 - tailDepth);
    ctx.closePath();
    ctx.fillStyle = carGradient;
    ctx.fill();
    ctx.lineWidth = (isSelected ? 3.5 : 2) * scale;
    ctx.strokeStyle = isSelected ? '#2563EB' : shadeColor(color, -30);
    ctx.stroke();

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // Central highlight to mimic glossy paint
    const highlightWidth = bodyWidth * 0.22;
    const highlightGradient = ctx.createLinearGradient(0, -bodyHeight / 2, 0, bodyHeight / 2);
    highlightGradient.addColorStop(0, 'rgba(255,255,255,0.35)');
    highlightGradient.addColorStop(0.5, 'rgba(255,255,255,0.05)');
    highlightGradient.addColorStop(1, 'rgba(255,255,255,0.25)');
    ctx.fillStyle = highlightGradient;
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.roundRect(-highlightWidth / 2, -bodyHeight / 2 + noseDepth * 0.35, highlightWidth, bodyHeight - (noseDepth + tailDepth), highlightWidth / 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Side mirrors
    const mirrorLength = bodyWidth * 0.16;
    const mirrorWidth = bodyHeight * 0.08;
    const mirrorOffsetY = -bodyHeight * 0.05;
    const mirrorColor = shadeColor(color, -25);
    [-1, 1].forEach((direction) => {
      ctx.fillStyle = mirrorColor;
      ctx.beginPath();
      ctx.ellipse(direction * (bodyWidth / 2 + mirrorWidth * 0.2), mirrorOffsetY, mirrorLength * 0.4, mirrorWidth, 0, 0, Math.PI * 2);
      ctx.fill();
    });

    // Windows (top view)
    const glassGradient = ctx.createLinearGradient(0, -bodyHeight / 2, 0, bodyHeight / 2);
    glassGradient.addColorStop(0, 'rgba(188, 230, 253, 0.95)');
    glassGradient.addColorStop(0.4, 'rgba(59, 130, 246, 0.4)');
    glassGradient.addColorStop(1, 'rgba(15, 23, 42, 0.95)');
    ctx.fillStyle = glassGradient;

    const frontWindowHeight = bodyHeight * 0.22;
    const rearWindowHeight = bodyHeight * 0.2;
    const roofWindowHeight = bodyHeight * 0.18;
    const windowRadius = 12 * scale;

    ctx.beginPath();
    ctx.roundRect(-cabinWidth * 0.52, -bodyHeight / 2 + noseDepth * 0.12, cabinWidth * 1.04, frontWindowHeight, windowRadius);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(-cabinWidth * 0.45, -roofWindowHeight / 2, cabinWidth * 0.9, roofWindowHeight, windowRadius * 0.6);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(-cabinWidth * 0.52, bodyHeight / 2 - tailDepth - rearWindowHeight - 4 * scale, cabinWidth * 1.04, rearWindowHeight, windowRadius);
    ctx.fill();

    // Door seams & pillars
    ctx.strokeStyle = 'rgba(15,23,42,0.45)';
    ctx.lineWidth = 1.4 * scale;
    ctx.beginPath();
    ctx.moveTo(-cabinWidth / 2, -cabinHeight / 2);
    ctx.lineTo(-cabinWidth / 2, cabinHeight / 2);
    ctx.moveTo(cabinWidth / 2, -cabinHeight / 2);
    ctx.lineTo(cabinWidth / 2, cabinHeight / 2);
    ctx.moveTo(0, -cabinHeight / 2);
    ctx.lineTo(0, cabinHeight / 2);
    ctx.stroke();

    // Door handles
    const handleWidth = bodyWidth * 0.08;
    const handleHeight = bodyHeight * 0.035;
    const handleColor = 'rgba(15,23,42,0.6)';
    const handleOffsetY = bodyHeight * 0.02;
    [-1, 1].forEach((direction) => {
      ctx.fillStyle = handleColor;
      ctx.beginPath();
      ctx.roundRect(direction * bodyWidth * 0.22 - handleWidth / 2, -handleOffsetY - handleHeight / 2, handleWidth, handleHeight, handleHeight / 2);
      ctx.fill();
      ctx.beginPath();
      ctx.roundRect(direction * bodyWidth * 0.22 - handleWidth / 2, handleOffsetY - handleHeight / 2, handleWidth, handleHeight, handleHeight / 2);
      ctx.fill();
    });

    // Headlights & taillights
    const lightWidth = bodyWidth * 0.15;
    const lightHeight = 6 * scale;
    ctx.fillStyle = '#FACC15';
    ctx.beginPath();
    ctx.roundRect(-lightWidth / 2, -bodyHeight / 2 + 2, lightWidth, lightHeight, 4);
    ctx.fill();
    ctx.fillStyle = '#F87171';
    ctx.beginPath();
    ctx.roundRect(-lightWidth / 2, bodyHeight / 2 - lightHeight - 2, lightWidth, lightHeight, 4);
    ctx.fill();

    // Central info panel (text only, border shows color)
    const panelWidth = Math.min(bodyWidth * 0.78, 125 * textScale);
    const panelHeight = Math.min(bodyHeight * 0.5, 62 * textScale);
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath();
    ctx.roundRect(-panelWidth / 2, -panelHeight / 2, panelWidth, panelHeight, 10 * scale);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5 * scale;
    ctx.stroke();

    ctx.fillStyle = '#0F172A';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.font = `bold ${12 * textScale}px 'Courier New', monospace`;
    ctx.fillText(vehicle.license_plate || 'NEW', 0, -panelHeight * 0.32);

    ctx.font = `700 ${12 * textScale}px 'Noto Sans Thai', 'Segoe UI', sans-serif`;
    ctx.fillText(vehicle.brand || vehicle.model || '—', 0, 0);

    ctx.font = `600 ${10 * textScale}px 'Noto Sans Thai', 'Segoe UI', sans-serif`;
    ctx.fillText((resolved.name || vehicle.color || 'สีไม่ระบุ').slice(0, 14), 0, panelHeight * 0.32);

    // Direction indicator
    ctx.fillStyle = '#3B82F6';
    ctx.beginPath();
    ctx.moveTo(0, -bodyHeight / 2 - 4);
    ctx.lineTo(-6 * scale, -bodyHeight / 2 + 8);
    ctx.lineTo(6 * scale, -bodyHeight / 2 + 8);
    ctx.closePath();
    ctx.fill();

    // Rotation ring if selected
    if (isSelected) {
      const midRadius = Math.max(bodyWidth, bodyHeight) * ROTATION_RING_RADIUS_FACTOR;
      const borderThickness = ROTATION_RING_STROKE_WIDTH * scale;
      ctx.strokeStyle = isHoveringRotation ? 'rgba(59,130,246,0.8)' : 'rgba(59,130,246,0.35)';
      ctx.lineWidth = isHoveringRotation ? borderThickness * 1.3 : borderThickness;
      ctx.setLineDash([8 * scale, 4 * scale]);
      ctx.beginPath();
      ctx.arc(0, 0, midRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      const indicatorPositions = [0, Math.PI / 2, Math.PI, Math.PI * 3 / 2];
      indicatorPositions.forEach(angle => {
        const x = Math.cos(angle) * midRadius;
        const y = Math.sin(angle) * midRadius;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(-transform.rotation + angle + Math.PI / 2);
        ctx.fillStyle = '#2563EB';
        ctx.beginPath();
        ctx.arc(0, 0, 10 * scale, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#FFFFFF';
        ctx.font = `bold ${12 * scale}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('↻', 0, 0);
        ctx.restore();
      });
    }

    ctx.restore();
  }, [getVehicleTransform, getScaledSizes, viewport.scale]);
  
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    
    // Only resize canvas if size actually changed
    if (canvas.offsetWidth !== rect.width || canvas.offsetHeight !== rect.height) {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      ctx.scale(dpr, dpr);
    }
    
    // Background
    ctx.fillStyle = '#F9FAFB';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Skip grid rendering during active dragging to improve performance
    const isDragging = interaction.type === 'move' || interaction.type === 'rotate';
    if (!isDragging) {
      // Grid
      const gridSize = 50 * viewport.scale;
      ctx.strokeStyle = '#E5E7EB';
      ctx.lineWidth = 1;
      
      for (let x = viewport.offsetX % gridSize; x < canvas.width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      
      for (let y = viewport.offsetY % gridSize; y < canvas.height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }
    }
    
    // Vehicles - always respect selected lot, regardless of sidebar tab, exclude workshop/auction/sale vehicles
    const placedVehicles = vehicles.filter(v => 
      v.x !== null && v.y !== null &&
      !v.in_workshop &&
      !v.in_auction &&
      !v.in_sale &&
      (!selectedLot || v.parking_lot_number === selectedLot)
    );
    
    placedVehicles.forEach(vehicle => {
      const isSelected = selectedVehicle?.id === vehicle.id;
      const isHovered = hoveredVehicle?.id === vehicle.id && !interaction.type;
      const isHoveringRotation = isSelected && isHoveringRotationBorder;
      
      // Always use selectedVehicle if it's the same vehicle (for real-time drag updates)
      // Otherwise use vehicle from vehicles prop (which has the latest saved position)
      if (isSelected && selectedVehicle) {
        drawVehicle(ctx, selectedVehicle, true, false, isHoveringRotation);
      } else {
        // Use vehicle from vehicles prop - this ensures we show the latest saved position
        drawVehicle(ctx, vehicle, isSelected, isHovered, isHoveringRotation);
      }
    });
  }, [vehicles, selectedLot, viewport, selectedVehicle, hoveredVehicle, interaction, drawVehicle, activeTab, isHoveringRotationBorder]);

  
  // ============================================================================
  // EFFECTS
  // ============================================================================
  
  useEffect(() => {
    // Only animate continuously when there's active interaction
    // Otherwise just draw once to save CPU/Memory
    if (interaction.type) {
      let lastDrawTime = 0;
      const minDrawInterval = 16; // ~60fps, but allow skipping frames if needed
      
      const animate = () => {
        const now = performance.now();
        // Only draw if enough time has passed since last draw
        if (now - lastDrawTime >= minDrawInterval) {
          drawCanvas();
          lastDrawTime = now;
        }
        animationFrameRef.current = requestAnimationFrame(animate);
      };
      animate();
      
      return () => {
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }
      };
    } else {
      // Draw once when not interacting (but will redraw when vehicles update from WebSocket)
      drawCanvas();
    }
  }, [drawCanvas, interaction.type, vehicles]);
  
  useEffect(() => {
    const handleResize = () => drawCanvas();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [drawCanvas]);

  useEffect(() => {
    const updateCanvasSize = () => {
      if (canvasRef.current) {
        const container = canvasRef.current.parentElement;
        if (container) {
          const rect = container.getBoundingClientRect();
          setCanvasSize({
            width: rect.width,
            height: rect.height
          });
          return;
        }
      }
      if (typeof window !== 'undefined') {
        const docStyle = typeof document !== 'undefined' ? getComputedStyle(document.documentElement) : null;
        const topVar = docStyle ? parseInt(docStyle.getPropertyValue('--mobile-top-bar')) || 0 : 0;
        const bottomVar = docStyle ? parseInt(docStyle.getPropertyValue('--mobile-bottom-nav')) || 0 : 0;
        setCanvasSize({
          width: window.innerWidth,
          height: window.innerHeight - topVar - bottomVar
        });
      }
    };

    updateCanvasSize();
    window.addEventListener('resize', updateCanvasSize);
    return () => window.removeEventListener('resize', updateCanvasSize);
  }, []);

  useEffect(() => {
    if (isTableViewModal && vehicles && vehicles.length > 0) {
      setSelectedVehicle(vehicles[0]);
      setEditData(buildEditDataFromVehicle(vehicles[0]));
      setShowEditModal(true);
    }
  }, [isTableViewModal, vehicles]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Delete' && selectedVehicle && !showEditModal) {
        handleRemoveFromCanvas();
      }
      // Rotate with arrow keys
      if (selectedVehicle && !showEditModal) {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          const newRotation = (selectedVehicle.rotation || 0) - 15;
          setSelectedVehicle(prev => ({ ...prev, rotation: newRotation }));
          vehicleApi.updatePosition(selectedVehicle.id, {
            x: selectedVehicle.x,
            y: selectedVehicle.y,
            rotation: newRotation
          }).catch(console.error);
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          const newRotation = (selectedVehicle.rotation || 0) + 15;
          setSelectedVehicle(prev => ({ ...prev, rotation: newRotation }));
          vehicleApi.updatePosition(selectedVehicle.id, {
            x: selectedVehicle.x,
            y: selectedVehicle.y,
            rotation: newRotation
          }).catch(console.error);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedVehicle, showEditModal, handleRemoveFromCanvas]);
  
  // ============================================================================
  // SIDEBAR LOGIC
  // ============================================================================
  
  const effectiveAllVehicles = useMemo(() => (allVehicles && allVehicles.length ? allVehicles : vehicles) || [], [allVehicles, vehicles]);

  const searchList = useCallback((list = []) => {
    if (!searchQuery) return list;
    const query = searchQuery.toLowerCase();
    return list.filter(v =>
      v.license_plate?.toLowerCase().includes(query) ||
      v.brand?.toLowerCase().includes(query) ||
      v.model?.toLowerCase().includes(query) ||
      v.zone?.toLowerCase().includes(query)
    );
  }, [searchQuery]);

  const sanitizeList = useCallback((list = []) => (
    list.filter(v => !v.in_workshop && !v.in_auction && !v.in_sale)
  ), []);

  const currentTabVehicles = useMemo(() => {
    const base = sanitizeList(vehicles || []);
    const scoped = selectedLot ? base.filter(v => v.parking_lot_number === selectedLot) : base;
    return searchList(scoped);
  }, [vehicles, selectedLot, searchList, sanitizeList]);

  const allTabVehicles = useMemo(() => {
    const base = sanitizeList(effectiveAllVehicles);
    return searchList(base);
  }, [effectiveAllVehicles, searchList, sanitizeList]);

  // In 'current' tab: show only vehicles matching dropdown filter (already scoped via props)
  // In 'all' tab: show every active vehicle across lots for quick search/navigation
  const displayVehicles = activeTab === 'current' ? currentTabVehicles : allTabVehicles;
  
  const unplacedVehicles = displayVehicles.filter(v => v.x === null || v.y === null);
  const placedVehicles = displayVehicles.filter(v => v.x !== null && v.y !== null);
  
  const handleVehicleClick = useCallback((vehicle) => {
    // If clicking from 'all' tab and vehicle is in different lot, switch to that lot
    if (activeTab === 'all' && vehicle.parking_lot_number !== selectedLot) {
      console.log('Switching lot from', selectedLot, 'to', vehicle.parking_lot_number);
      setSelectedLot(vehicle.parking_lot_number);
    }
    
    // Switch to 'current' tab to show the vehicle in sidebar
    setActiveTab('current');
    
    // If vehicle is placed on canvas, center and zoom to it
    // Use current zoom level (don't reset)
    if (vehicle.x !== null && vehicle.y !== null) {
      const canvas = canvasRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const currentScale = viewport.scale; // Use current zoom level
        
        setViewport({
          scale: currentScale,
          offsetX: centerX - vehicle.x * currentScale,
          offsetY: centerY - vehicle.y * currentScale
        });
      }
    }
    
    // Always select the vehicle (will show in sidebar of 'current' tab)
    setSelectedVehicle(vehicle);
  }, [activeTab, selectedLot, setSelectedLot, viewport]);
  
  // ============================================================================
  // RENDER
  // ============================================================================
  
  const getCursor = () => {
    if (interaction.type === 'pan') return 'grabbing';
    if (interaction.type === 'move') return 'move';
    if (interaction.type === 'rotate') return 'grabbing';
    if (isHoveringRotationBorder) return 'grab';
    if (hoveredVehicle) return 'grab';
    if (dragFromSidebar) return 'copy';
    return 'default';
  };
  
  const isMobile = isMobileViewport;
  const sidebarClasses = isMobile
    ? `lg:hidden fixed inset-x-0 bottom-0 z-50 max-h-[85vh] h-[75vh] w-full border-t border-gray-200 bg-gray-50 rounded-t-3xl shadow-[0_-8px_30px_rgba(0,0,0,0.25)] flex flex-col transform transition-transform duration-300 ease-out ${sidebarOpen ? 'translate-y-0' : 'translate-y-full'}`
    : `hidden lg:flex lg:relative lg:w-80 border-r border-gray-200 bg-gray-50 flex-col`;
  const showMobileOverlay = isMobile && sidebarOpen;

  // If in table modal mode, only render the edit modal, not the full map view
  if (isTableViewModal) {
    return (
      <>
        {showWorkshopModal && (
          <WorkshopModal
            vehicle={selectedVehicle}
            onClose={() => {
              setShowWorkshopModal(false);
              setShowEditModal(true);
            }}
            onSuccess={() => {
              setShowWorkshopModal(false);
              setShowEditModal(false);
              if (onClose) {
                onClose();
              }
              window.location.reload();
            }}
          />
        )}

        {showAuctionModal && (
          <AuctionModal
            vehicle={selectedVehicle}
            onClose={() => {
              setShowAuctionModal(false);
              setShowEditModal(true);
            }}
            onSuccess={() => {
              setShowAuctionModal(false);
              setShowEditModal(false);
              if (onClose) {
                onClose();
              }
              window.location.reload();
            }}
          />
        )}

        {showSaleModal && (
          <SaleModal
            vehicle={selectedVehicle}
            onClose={() => {
              setShowSaleModal(false);
              setShowEditModal(true);
            }}
            onSuccess={() => {
              setShowSaleModal(false);
              setShowEditModal(false);
              if (onClose) {
                onClose();
              }
              window.location.reload();
            }}
          />
        )}

        {showEditModal && selectedVehicle && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[100] p-2 sm:p-4">
            <div className="bg-white rounded-xl sm:rounded-2xl shadow-2xl w-full max-w-[95vw] sm:max-w-2xl max-h-[88vh] overflow-hidden flex flex-col relative">
              <div className="sticky top-0 z-10 bg-gradient-to-r from-blue-500 to-indigo-600 p-3 text-white flex-shrink-0">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl sm:text-2xl font-bold">ข้อมูลรถ</h2>
                    <p className="text-blue-100 text-xs sm:text-sm">{selectedVehicle.license_plate}</p>
                  </div>
                  <button
                    onClick={() => {
                      setShowEditModal(false);
                      if (onClose) {
                        onClose();
                      }
                    }}
                    className="w-10 h-10 hover:bg-white/20 rounded-full flex items-center justify-center"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
              
              <div className="p-3 overflow-y-auto flex-1 min-h-0">
                <div className="space-y-0">
                  {/* Table-like layout with rows - matching table columns */}
                  {[
                    { label: 'ลำดับ', field: 'sequence_no', placeholder: 'เช่น 1' },
                    { label: 'ทะเบียนรถ', field: 'license_plate', placeholder: 'เช่น กก-1234' },
                    { label: 'จังหวัด', field: 'province', placeholder: 'เช่น กรุงเทพฯ' },
                    { label: 'ยี่ห้อ', field: 'brand', placeholder: 'เช่น Toyota' },
                    { label: 'รุ่น', field: 'model', placeholder: 'เช่น Camry' },
                    { label: 'สีรถ', field: 'color', placeholder: 'เช่น ขาว' },
                    { label: 'วันที่ย้ายรถ', field: 'start_time', placeholder: 'เช่น 2024-01-01', type: 'datetime' },
                    { label: 'ประเภทรายการ', field: 'transaction_type', placeholder: 'เช่น ซื้อ' },
                    { label: 'ลาน', field: 'parking_lot_name', placeholder: 'เช่น ลาน A' },
                    { label: 'RMO', field: 'rmo', placeholder: 'เช่น RMO-01' },
                    { label: 'CMO', field: 'cmo', placeholder: 'เช่น CMO-01' },
                    { label: 'สถานะการอนุมัติ (GP)', field: 'gp_approval_status', placeholder: 'เช่น อนุมัติ' },
                    { label: 'ชื่อผู้อนุมัติ (GP)', field: 'gp_approval_name', placeholder: 'เช่น นาย สมชาย' },
                    { label: 'สรุปสถานะอนุมัติ (GP)', field: 'gp_approval_summary', placeholder: 'เช่น อนุมัติแล้ว' },
                    { label: 'ประเภทกรมธรรม์', field: 'policy_type', placeholder: 'เช่น ประกันภัย' },
                    { label: 'ทุนประกัน', field: 'policy_amount', placeholder: 'เช่น 100000' },
                    { label: 'ประมาณการความเสียหาย', field: 'estimated_damage', placeholder: 'เช่น 500000' },
                    { label: 'มูลค่าซาก (ราคาขาย)', field: 'salvage_value', placeholder: 'เช่น 300000' },
                    { label: 'สถานะการขายซากรถยนต์', field: 'salvage_sale_status', placeholder: 'เช่น ขายแล้ว' },
                    { label: 'วันที่ขาย', field: 'sale_date', placeholder: 'เช่น 2024-01-15', type: 'datetime' },
                    { label: 'วันที่โอนเงิน', field: 'transfer_date', placeholder: 'เช่น 2024-01-20', type: 'datetime' },
                    { label: 'จำนวนเงินที่ได้รับ', field: 'amount_received', placeholder: 'เช่น 300000' },
                    { label: 'ชื่อผู้ซื้อซากรถยนต์', field: 'buyer_name', placeholder: 'เช่น บริษัท ABC' },
                    { label: 'จ่ายค่าสินไหม', field: 'claim_payment_amount', placeholder: 'เช่น 200000' },
                    { label: 'วันที่จ่ายค่าสินไหม', field: 'claim_payment_date', placeholder: 'เช่น 2024-01-25', type: 'datetime' },
                    { label: 'ชื่อผู้รับเงิน', field: 'payment_recipient_name', placeholder: 'เช่น นาย สมชาย' },
                    { label: 'หมายเหตุ', field: 'note_summary', placeholder: 'บันทึกเพิ่มเติม', textarea: true },
                    { label: 'สถานะ', field: 'movement_info', isStatus: true },
                    { label: 'หมายเหตุสถานะ', field: 'movement_notes', placeholder: 'บันทึก', textarea: true }
                  ].map(({ label, field, placeholder, textarea, type, isStatus }, index) => (
                    <div key={field} className={`flex flex-col sm:flex-row sm:items-center gap-2 px-3 py-2.5 border-b border-gray-200 ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                      <div className="flex items-center gap-2 sm:w-48 flex-shrink-0">
                        <label className="text-xs font-semibold text-gray-700 whitespace-nowrap">{label}</label>
                      </div>
                      <div className="flex-1">
                        {isStatus ? (
                          <div>
                            {selectedVehicle.in_workshop ? (
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-orange-100 text-orange-800">
                                🔧 เข้าอู่
                              </span>
                            ) : selectedVehicle.in_auction ? (
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-800">
                                🔨 ประมูล
                              </span>
                            ) : selectedVehicle.in_sale ? (
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                                🏷️ ขาย
                              </span>
                            ) : (
                              <span className="text-gray-400">ว่าง</span>
                            )}
                          </div>
                        ) : field === 'movement_notes' ? (
                          <textarea
                            value={editData[field] || ''}
                            onChange={(e) => handleEditFieldChange(field, e.target.value)}
                            placeholder={placeholder}
                            className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-400 focus:border-blue-400 resize-none"
                            rows={2}
                          />
                        ) : textarea ? (
                          <textarea
                            value={editData[field] || ''}
                            onChange={(e) => handleEditFieldChange(field, e.target.value)}
                            placeholder={placeholder}
                            className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-400 focus:border-blue-400 resize-none"
                            rows={2}
                          />
                        ) : type === 'datetime' ? (
                          <input
                            type="datetime-local"
                            value={editData[field] || ''}
                            onChange={(e) => handleEditFieldChange(field, e.target.value)}
                            placeholder={placeholder}
                            className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
                            step="60"
                          />
                        ) : (
                          <input
                            type="text"
                            value={editData[field] || ''}
                            onChange={(e) => handleEditFieldChange(field, e.target.value)}
                            placeholder={placeholder}
                            className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <section className="rounded-2xl border border-gray-200 bg-white/90 shadow-sm mt-4">
                  <div className="px-4 py-2.5 border-b border-gray-100">
                    <p className="text-sm font-semibold text-gray-700">การจัดการสถานะ</p>
                    <p className="text-xs text-gray-500">เลือกรูปแบบการย้ายรถไปยังขั้นตอนต่าง ๆ</p>
                  </div>
                  <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {!selectedVehicle.in_workshop && (
                      <button
                        onClick={() => {
                          setShowEditModal(false);
                          setShowWorkshopModal(true);
                        }}
                        className="w-full rounded-2xl border border-orange-200/80 bg-orange-50/80 px-4 py-3 text-sm font-semibold text-orange-900 shadow-sm transition hover:border-orange-300 hover:bg-orange-100 flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/90 text-orange-500">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                            </svg>
                          </div>
                          <div className="text-left">
                            <p>ส่งเข้าอู่</p>
                            <p className="text-xs font-normal text-orange-600/90">บันทึกเข้าศูนย์บริการ</p>
                          </div>
                        </div>
                        <svg className="w-4 h-4 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    )}
                    {!selectedVehicle.in_auction && (
                      <button
                        onClick={() => {
                          setShowEditModal(false);
                          setShowAuctionModal(true);
                        }}
                        className="w-full rounded-2xl border border-purple-200/80 bg-purple-50/80 px-4 py-3 text-sm font-semibold text-purple-900 shadow-sm transition hover:border-purple-300 hover:bg-purple-100 flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/90 text-purple-500">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
                            </svg>
                          </div>
                          <div className="text-left">
                            <p>ส่งเข้าประมูล</p>
                            <p className="text-xs font-normal text-purple-600/90">โอนสถานะไปยังทีมประมูล</p>
                          </div>
                        </div>
                        <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    )}
                    {!selectedVehicle.in_sale && (
                      <button
                        onClick={() => {
                          setShowEditModal(false);
                          setShowSaleModal(true);
                        }}
                        className="w-full rounded-2xl border border-emerald-200/80 bg-emerald-50/80 px-4 py-3 text-sm font-semibold text-emerald-900 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-100 flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/90 text-emerald-500">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h18v4H3V3zm0 6h13v4H3V9zm0 6h18v4H3v-4z" />
                            </svg>
                          </div>
                          <div className="text-left">
                            <p>ส่งขาย</p>
                            <p className="text-xs font-normal text-emerald-600/90">โอนสถานะไปยังทีมขาย</p>
                          </div>
                        </div>
                        <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    )}
                  </div>
                </section>
              </div>
              
              <div className="flex items-center justify-end gap-2 p-4 border-t bg-gray-50 sticky bottom-0">
                <button
                  onClick={() => {
                    setShowEditModal(false);
                    if (onClose) {
                      onClose();
                    }
                  }}
                  className="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-gray-600 shadow-sm transition hover:bg-gray-50 flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  ปิด
                </button>
                <button
                  onClick={async () => {
                    try {
                      const response = await fetch(`/api/vehicles/${selectedVehicle.id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(selectedVehicle)
                      });
                      if (response.ok) {
                        setShowEditModal(false);
                        if (onClose) {
                          onClose();
                        }
                        window.location.reload();
                      }
                    } catch (error) {
                      console.error('Error updating vehicle:', error);
                    }
                  }}
                  className="w-full rounded-2xl border border-blue-300 bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  บันทึก
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <div
      className="flex flex-col relative bg-white md:rounded-2xl md:shadow-xl w-full h-full"
      style={{
        height: 'calc(var(--app-vh, 1vh) * 100 - var(--mobile-top-bar, 0px) - var(--mobile-bottom-nav, 0px))',
        minHeight: 'calc(var(--app-vh, 1vh) * 100 - var(--mobile-top-bar, 0px) - var(--mobile-bottom-nav, 0px))'
      }}
    >
      {/* Header */}
      <div className="sticky top-0 z-30 p-2 sm:p-4 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50 flex-shrink-0">
        <div className="flex gap-1 sm:gap-3 items-center justify-between">
          {/* Mobile menu button */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="lg:hidden p-2.5 hover:bg-white/50 active:bg-white/80 rounded-lg min-h-[44px] min-w-[44px] touch-manipulation"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          
          <div className="flex-1 min-w-0">
            <h2 className="text-base sm:text-xl font-bold text-gray-800 truncate">แผนที่จัดเก็บรถ</h2>
            <p className="text-xs sm:text-sm text-gray-600 hidden sm:block">ลากรถจากแถบซ้ายมาวางบนแผนที่</p>
          </div>
          
          <div className="flex gap-2 flex-shrink-0">
            <button
              onClick={handleClearCanvas}
              disabled={!canClearCanvas}
              className={`px-3 sm:px-4 py-2.5 sm:py-2.5 border-2 rounded-lg sm:rounded-xl font-semibold transition-all flex items-center gap-1.5 sm:gap-2 min-h-[44px] touch-manipulation ${canClearCanvas ? 'bg-red-500 hover:bg-red-600 active:bg-red-700 text-white border-red-600' : 'bg-gray-200 text-gray-500 border-gray-300 cursor-not-allowed'}`}
              title={canClearCanvas ? 'ล้างรถบนแผนที่ลานปัจจุบัน' : 'เฉพาะ Admin เท่านั้น'}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              <span className="hidden sm:inline text-sm">ล้างแผนที่</span>
            </button>
            <button
              onClick={() => setViewport(v => ({ ...v, scale: Math.min(2.5, v.scale * 1.2) }))}
              className="p-2.5 bg-white hover:bg-gray-50 active:bg-gray-100 border-2 border-gray-200 rounded-lg sm:rounded-xl min-h-[44px] min-w-[44px] touch-manipulation"
              title="ซูมเข้า"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" />
              </svg>
            </button>
            <button
              onClick={() => setViewport(v => ({ ...v, scale: Math.max(0.3, v.scale * 0.8) }))}
              className="p-2.5 bg-white hover:bg-gray-50 active:bg-gray-100 border-2 border-gray-200 rounded-lg sm:rounded-xl min-h-[44px] min-w-[44px] touch-manipulation"
              title="ซูมออก"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" />
              </svg>
            </button>
            <button
              onClick={handleAutoArrange}
              disabled={!canArrangeVehicles}
              className={`p-2.5 min-h-[44px] min-w-[44px] touch-manipulation hidden sm:flex border-2 rounded-lg sm:rounded-xl ${canArrangeVehicles ? 'bg-white hover:bg-green-50 active:bg-green-100 border-green-300 text-green-700' : 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'}`}
              title={canArrangeVehicles ? 'จัดเรียงรถอัตโนมัติ' : 'เฉพาะ Admin/Member เท่านั้น'}
            >
              <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </div>
      </div>
      
      <div className="flex-1 flex overflow-hidden relative min-h-0">
        {/* Sidebar - Mobile overlay, Desktop fixed */}
        <div className={sidebarClasses}>
          {/* Mobile grab handle + header */}
          {isMobile && (
            <div className="px-5 pt-4 pb-2 bg-white rounded-t-3xl border-b border-gray-200 shadow-sm">
              <div className="mx-auto h-1.5 w-12 rounded-full bg-gray-300 mb-3" />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-800">รถทั้งหมด</p>
                  <p className="text-xs text-gray-500">แตะค้างรถเพื่อเริ่มลากวาง</p>
                </div>
                <button
                  onClick={() => setSidebarOpen(false)}
                  className="p-2 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600"
                  aria-label="ปิดรายการรถ"
                >
                  ✕
                </button>
              </div>
            </div>
          )}

          {/* Search in sidebar */}
          <div className="p-3 bg-white border-b border-gray-200">
            <input
              type="text"
              placeholder="🔍 ค้นหาทะเบียน, ยี่ห้อ, โซน..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-3 text-base border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none touch-manipulation"
            />
          </div>

          <div className="flex border-b border-gray-200 bg-white">
            <button
              onClick={() => setActiveTab('current')}
              className={`flex-1 px-2 py-3 font-semibold text-xs sm:text-sm transition-all touch-manipulation ${
                activeTab === 'current' ? 'text-blue-600 bg-blue-50 border-b-3 border-blue-600' : 'text-gray-600 hover:bg-gray-50 active:bg-gray-100'
              }`}
            >
              <div className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5">
                <svg className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                </svg>
                <span className="leading-tight text-center whitespace-nowrap">ปัจจุบัน</span>
              </div>
            </button>
            <button
              onClick={() => setActiveTab('all')}
              className={`flex-1 px-2 py-3 font-semibold text-xs sm:text-sm transition-all touch-manipulation ${
                activeTab === 'all' ? 'text-purple-600 bg-purple-50 border-b-3 border-purple-600' : 'text-gray-600 hover:bg-gray-50 active:bg-gray-100'
              }`}
            >
              <div className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5">
                <svg className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
                <span className="leading-tight text-center whitespace-nowrap">ค้นหาทั้งหมด</span>
              </div>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            {/* Show ALL vehicles in sidebar - both placed and unplaced */}
            {displayVehicles.length > 0 && (
              <div>
                {!isMobile && (
                  <div className="text-xs font-bold text-gray-500 uppercase mb-2 px-2">รถทั้งหมด ({displayVehicles.length})</div>
                )}
                <div className="space-y-2">
                  {displayVehicles.map(vehicle => {
                    const isSelected = selectedVehicle?.id === vehicle.id;
                    const isOnCanvas = vehicle.x !== null && vehicle.y !== null;
                    return (
                    <div
                      key={vehicle.id}
                      draggable={!isMobileViewport && !isOnCanvas && activeTab === 'current'}
                      onDragStart={(e) => {
                        if (!isOnCanvas && activeTab === 'current') {
                          e.dataTransfer.effectAllowed = 'move';
                          setDragFromSidebar(vehicle);
                        } else {
                          e.preventDefault();
                        }
                      }}
                      onDragEnd={() => setDragFromSidebar(null)}
                      onTouchStart={(e) => handleSidebarVehicleTouchStart(e, vehicle)}
                      onTouchMove={handleSidebarVehicleTouchMove}
                      onTouchEnd={handleSidebarVehicleTouchEnd}
                      onTouchCancel={handleSidebarVehicleTouchEnd}
                      onClick={() => {
                        setSelectedVehicle(vehicle);
                        if (isOnCanvas) {
                          handleVehicleClick(vehicle);
                        }
                      }}
                      onDoubleClick={() => {
                        if (isOnCanvas) {
                          handleVehicleClick(vehicle);
                        }
                      }}
                      className={`p-4 rounded-xl border-2 transition-all touch-manipulation ${
                        isSelected
                          ? 'bg-blue-50 border-blue-500 shadow-lg ring-2 ring-blue-300'
                          : !isOnCanvas && activeTab === 'current'
                            ? `bg-white cursor-move hover:border-blue-400 hover:shadow-md active:shadow-lg ${
                                dragFromSidebar?.id === vehicle.id ? 'border-blue-500 shadow-lg scale-105' : 'border-gray-200'
                              }`
                            : 'bg-white border-gray-200 hover:border-green-400 hover:shadow-md active:shadow-lg cursor-pointer'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="text-3xl flex-shrink-0">
                          {isOnCanvas ? '✅' : '🚗'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-gray-800 truncate text-[clamp(0.95rem,1vw+0.45rem,1.25rem)]">{vehicle.license_plate}</div>
                          <div className="text-gray-500 truncate mt-0.5 text-[clamp(0.8rem,0.7vw+0.35rem,1rem)]">{vehicle.brand} {vehicle.model}</div>
                          <div className="text-gray-400 mt-1 text-[clamp(0.78rem,0.6vw+0.35rem,0.95rem)]">{vehicle.zone}</div>
                          {vehicle.key_number && (
                            <div className="text-indigo-600 mt-1.5 text-[clamp(0.78rem,0.6vw+0.35rem,0.95rem)]">🔢 เลขกุญแจ: {vehicle.key_number}</div>
                          )}
                          {activeTab === 'all' && vehicle.parking_lot_name && (
                            <div className="text-green-600 mt-1.5 font-semibold text-[clamp(0.78rem,0.6vw+0.35rem,0.95rem)]">📍 {vehicle.parking_lot_name}</div>
                          )}
                          {!isOnCanvas && activeTab === 'current' && (
                            <div className="text-blue-600 mt-1 italic text-[clamp(0.7rem,0.5vw+0.3rem,0.9rem)]">ลากไปวางบน Canvas</div>
                          )}
                        </div>
                      </div>
                    </div>
                    );
                  })}
                </div>
              </div>
            )}
            
            {displayVehicles.length === 0 && (
              <div className="text-center py-12 text-gray-500">
                <div className="text-4xl mb-3">📭</div>
                <p className="text-sm font-semibold">ไม่พบรถ</p>
                <p className="text-xs mt-1">ลองค้นหาหรือเปลี่ยนแท็บ</p>
              </div>
            )}
          </div>
        </div>
        
        {/* Mobile overlay backdrop */}
        {showMobileOverlay && (
          <div 
            className="fixed inset-0 bg-black/40 z-40"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        
        {/* Canvas */}
        {!isTableViewModal && (
          <div className="flex-1 relative min-h-0 flex">
            <div className="relative flex-1">
              {!canEditCanvas && (
              <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
                <div className="px-4 py-2 bg-white/90 rounded-2xl shadow text-sm text-gray-700">
                  จำกัดเฉพาะผู้ดูแลระบบ
                </div>
              </div>
            )}
            {showMobileHint && isMobile && !isMobileDragging && (
              <div className="lg:hidden absolute top-16 inset-x-3 z-20">
                <div className="bg-blue-600/95 text-white text-xs rounded-2xl px-3 py-2 flex items-start gap-2 shadow-lg">
                  <span className="text-base">📱</span>
                  <div className="flex-1 leading-snug">
                    แตะค้าง ~0.5 วิ บนรถเพื่อเริ่มลาก วางนิ้วลงบน Canvas เพื่อปล่อย หากไม่ต้องการให้ลากไปยังกล่อง "ยกเลิก" ด้านล่าง
                  </div>
                  <button
                    onClick={() => setShowMobileHint(false)}
                    className="text-white/80 hover:text-white"
                    aria-label="ปิดคำแนะนำ"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}
            <canvas
              ref={canvasRef}
              onMouseDown={canEditCanvas ? handleCanvasMouseDown : undefined}
              onMouseMove={canEditCanvas ? handleCanvasMouseMove : undefined}
              onMouseUp={canEditCanvas ? handleCanvasMouseUp : undefined}
              onDoubleClick={canEditCanvas ? handleCanvasDoubleClick : undefined}
              onDragOver={canEditCanvas ? handleCanvasDragOver : undefined}
              onDrop={canEditCanvas ? handleCanvasDrop : undefined}
              onTouchStart={canEditCanvas ? handleTouchStart : undefined}
              onTouchMove={canEditCanvas ? handleTouchMove : undefined}
              onTouchEnd={canEditCanvas ? handleTouchEnd : undefined}
              width={canvasSize.width}
              height={canvasSize.height}
              className={`w-full h-full rounded-3xl shadow-inner ${canEditCanvas ? 'bg-gradient-to-br from-slate-100 via-white to-slate-100' : 'bg-gray-100'}`}
              style={{ touchAction: canEditCanvas ? 'none' : 'manipulation' }}
            />
          </div>
          
          {dragFromSidebar && !isMobileDragging && (
            <div className="absolute inset-0 bg-blue-500/10 backdrop-blur-[1px] pointer-events-none flex items-center justify-center">
              <div className="bg-white rounded-2xl shadow-2xl p-6 border-2 border-blue-400 animate-pulse">
                <div className="text-center">
                  <div className="text-5xl mb-3">🚗</div>
                  <p className="font-bold text-gray-800 text-lg">{dragFromSidebar.license_plate}</p>
                  <p className="text-sm text-gray-600 mt-2">ลากมาวางบนแผนที่</p>
                  <div className="mt-3 flex items-center justify-center gap-2 text-blue-600">
                    <svg className="w-5 h-5 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                    </svg>
                    <span className="text-xs font-semibold">วางที่นี่</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {isMobileDragging && dragFromSidebar && (
            <div className="pointer-events-none fixed inset-0 z-40 lg:hidden">
              <div className="absolute inset-0 bg-black/10" />
              <div
                className="absolute"
                style={{
                  transform: `translate(${mobileDragPosition.x - 90}px, ${mobileDragPosition.y - 55}px)`
                }}
              >
                <div className="w-40 rounded-2xl border-2 border-blue-400 bg-white shadow-2xl p-4">
                  <div className="text-center">
                    <div className="text-4xl mb-2">🚗</div>
                    <p className="font-bold text-gray-800 truncate">{dragFromSidebar.license_plate}</p>
                    <p className="text-xs text-gray-500 mt-1 truncate">ลากไปยัง Canvas เพื่อวาง</p>
                  </div>
                </div>
              </div>
              <div className="absolute inset-x-0 bottom-6 flex justify-center">
                <div
                  className={`px-6 py-3 rounded-2xl border-2 text-sm font-semibold transition-all ${
                    isDragOverCancel
                      ? 'bg-red-600 text-white border-red-700 shadow-lg scale-105'
                      : 'bg-white/90 text-gray-800 border-gray-200 shadow'
                  }`}
                >
                  ลากมาปล่อยบริเวณนี้เพื่อยกเลิก
                </div>
              </div>
            </div>
          )}
          
          {/* Info Box - Collapsible */}
          <div className="hidden lg:block absolute bottom-4 right-4">
            {showInfoBox ? (
              <div className="bg-white/95 backdrop-blur rounded-xl shadow-lg p-3 text-xs border border-gray-200">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-bold text-gray-800">คำแนะนำ</div>
                  <button
                    onClick={() => setShowInfoBox(false)}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                    title="ซ่อน"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>
                <div className="space-y-1 text-gray-600">
                  <p>• คลิกรถเพื่อเลือก</p>
                  <p>• ลากรถเพื่อย้าย</p>
                  <p>• ลากจุดสีน้ำเงินเพื่อหมุน</p>
                  <p>• Double-click เพื่อแก้ไข</p>
                  <p>• กด Delete เพื่อลบ</p>
                  <p className="text-blue-600 font-semibold mt-2">ซูม: {Math.round(viewport.scale * 100)}%</p>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowInfoBox(true)}
                className="bg-white/95 backdrop-blur rounded-xl shadow-lg p-2 border border-gray-200 hover:bg-white transition-colors"
                title="แสดงคำแนะนำ"
              >
                <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>
            )}
            </div>
          </div>
        )}

      {isMobile && !sidebarOpen && (
        <button
          onClick={() => setSidebarOpen(true)}
          className="lg:hidden fixed right-4 rounded-full shadow-xl border border-blue-200 bg-white text-blue-600 font-semibold px-4 py-2.5 flex items-center gap-2"
          style={{ bottom: `calc(var(--mobile-bottom-nav, 0px) + 16px)` }}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h18M3 12h18m-7 7h7" />
          </svg>
          รายการรถ
        </button>
      )}

      {/* Modals - Outside canvas container for proper centering */}
      {showEditModal && selectedVehicle && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[100] p-2 sm:p-4">
          <div className="bg-white rounded-xl sm:rounded-2xl shadow-2xl w-full max-w-[95vw] sm:max-w-2xl max-h-[88vh] overflow-hidden flex flex-col relative">
            <div className="sticky top-0 z-10 bg-gradient-to-r from-blue-500 to-indigo-600 p-3 text-white flex-shrink-0">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl sm:text-2xl font-bold">ข้อมูลรถ</h2>
                  <p className="text-blue-100 text-xs sm:text-sm">{selectedVehicle.license_plate}</p>
                </div>
                <button
                  onClick={() => {
                    setShowEditModal(false);
                    if (isTableViewModal && onClose) {
                      onClose();
                    }
                  }}
                  className="w-10 h-10 hover:bg-white/20 rounded-full flex items-center justify-center"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            
            <div className="p-3 overflow-y-auto flex-1 min-h-0">
              <div className="space-y-2.5">
                {/* Desktop and Mobile - Same grid layout */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {[
                    { icon: '🚗', label: 'ทะเบียนรถ', field: 'license_plate', placeholder: 'เช่น กก-1234' },
                    { icon: '📍', label: 'จังหวัด', field: 'province', placeholder: 'เช่น กรุงเทพฯ' },
                    { icon: '🏭', label: 'ยี่ห้อ', field: 'brand', placeholder: 'เช่น Toyota' },
                    { icon: '🚙', label: 'รุ่น', field: 'model', placeholder: 'เช่น Camry' },
                    { icon: '🎨', label: 'สี', field: 'color', placeholder: 'เช่น ขาว' },
                    { icon: '🏷️', label: 'RMO', field: 'rmo', placeholder: 'เช่น RMO-01' },
                    { icon: '🏷️', label: 'CMO', field: 'cmo', placeholder: 'เช่น CMO-01' },
                    { icon: '🗂️', label: 'โซน', field: 'zone', placeholder: 'เช่น Z-1' },
                    { icon: '🔑', label: 'สถานะกุญแจ', field: 'key_status', placeholder: 'เช่น พร้อม' },
                    { icon: '🔢', label: 'เลขกุญแจ', field: 'key_number', placeholder: 'เช่น 12' },
                    { icon: '📝', label: 'หมายเหตุ', field: 'notes', placeholder: 'บันทึกเพิ่มเติม', textarea: true }
                  ].map(({ icon, label, field, placeholder, textarea }) => (
                    <label key={field} className="flex flex-col gap-1 bg-gray-50 rounded-xl p-3 border border-gray-200">
                      <span className="text-xs font-semibold text-gray-600 flex items-center gap-1">
                        <span>{icon}</span>{label}
                      </span>
                      {textarea ? (
                        <textarea
                          value={editData[field] || ''}
                          onChange={(e) => handleEditFieldChange(field, e.target.value)}
                          placeholder={placeholder}
                          className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400 focus:border-blue-400 resize-none"
                          rows={3}
                        />
                      ) : (
                        <input
                          type="text"
                          value={editData[field] || ''}
                          onChange={(e) => handleEditFieldChange(field, e.target.value)}
                          placeholder={placeholder}
                          className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
                        />
                      )}
                    </label>
                  ))}
                </div>
                {activeCustomColumns.length > 0 && (
                  <div className="mt-4 border-t border-gray-200 pt-3">
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">ข้อมูลเพิ่มเติม</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {activeCustomColumns.map((column) => (
                        <div key={column.column_key} className="bg-white rounded-lg border border-gray-200 p-3">
                          <p className="text-xs font-semibold text-gray-500">{column.label || column.column_key}</p>
                          <p className="text-sm text-gray-800 mt-1">
                            {formatCustomFieldValue(selectedVehicle, column)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {
                ((!
                  selectedVehicle.in_workshop &&
                  !selectedVehicle.in_auction &&
                  !selectedVehicle.in_sale
                ) || Boolean(selectedVehicle?.in_sale)) && (
                  <section className="rounded-2xl border border-gray-200 bg-white/90 shadow-sm">
                    <div className="px-4 py-2.5 border-b border-gray-100">
                      <p className="text-sm font-semibold text-gray-700">การจัดการสถานะ</p>
                      <p className="text-xs text-gray-500">เลือกรูปแบบการย้ายรถไปยังขั้นตอนต่าง ๆ</p>
                    </div>
                    <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {!selectedVehicle.in_workshop && !selectedVehicle.in_auction && !selectedVehicle.in_sale && (
                        <>
                          <button
                            onClick={() => {
                              setShowEditModal(false);
                              setShowWorkshopModal(true);
                            }}
                            className="w-full rounded-2xl border border-orange-200/80 bg-orange-50/80 px-4 py-3 text-sm font-semibold text-orange-900 shadow-sm transition hover:border-orange-300 hover:bg-orange-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-200 flex items-center justify-between gap-3"
                          >
                            <div className="flex items-center gap-3">
                              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/90 text-orange-500">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                </svg>
                              </div>
                              <div className="text-left">
                                <p>ส่งเข้าอู่</p>
                                <p className="text-xs font-normal text-orange-600/90">บันทึกเข้าศูนย์บริการ</p>
                              </div>
                            </div>
                            <svg className="w-4 h-4 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </button>
                          <button
                            onClick={() => {
                              setShowEditModal(false);
                              setShowAuctionModal(true);
                            }}
                            className="w-full rounded-2xl border border-purple-200/80 bg-purple-50/80 px-4 py-3 text-sm font-semibold text-purple-900 shadow-sm transition hover:border-purple-300 hover:bg-purple-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-200 flex items-center justify-between gap-3"
                          >
                            <div className="flex items-center gap-3">
                              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/90 text-purple-500">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
                                </svg>
                              </div>
                              <div className="text-left">
                                <p>ส่งเข้าประมูล</p>
                                <p className="text-xs font-normal text-purple-600/90">โอนสถานะไปยังทีมประมูล</p>
                              </div>
                            </div>
                            <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </button>
                          <button
                            onClick={() => {
                              setShowEditModal(false);
                              setShowSaleModal(true);
                            }}
                            className="w-full rounded-2xl border border-emerald-200/80 bg-emerald-50/80 px-4 py-3 text-sm font-semibold text-emerald-900 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200 flex items-center justify-between gap-3"
                          >
                            <div className="flex items-center gap-3">
                              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/90 text-emerald-500">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h18v4H3V3zm0 6h13v4H3V9zm0 6h18v4H3v-4z" />
                                </svg>
                              </div>
                              <div className="text-left">
                                <p>ส่งขาย</p>
                                <p className="text-xs font-normal text-emerald-600/90">ย้ายไปยังขั้นตอนการขาย</p>
                              </div>
                            </div>
                            <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </button>
                          <div className="sm:col-span-2">
                            <div className="rounded-2xl border border-sky-200/80 bg-sky-50/80 px-4 py-3 shadow-sm">
                              <div className="flex items-center justify-between gap-3 flex-wrap">
                                <div className="flex items-center gap-3">
                                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/90 text-sky-500">
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14m-7-7l7 7-7 7" />
                                    </svg>
                                  </div>
                                  <div className="text-left">
                                    <p>ย้ายลาน</p>
                                    <p className="text-xs font-normal text-sky-600/90">เลือกย้ายไปลานอื่นหรือค่าว่าง</p>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setShowMoveLotSelector((prev) => !prev)}
                                  className="text-xs font-semibold text-sky-700 hover:text-sky-900"
                                >
                                  {showMoveLotSelector ? 'ปิด' : 'เลือก'}
                                </button>
                              </div>
                              {showMoveLotSelector && (
                                <div className="mt-4 space-y-3">
                                  <label className="flex flex-col gap-1 text-sm text-gray-700">
                                    <span className="text-xs font-semibold text-gray-600">เลือกลานใหม่</span>
                                    <select
                                      value={selectedMoveLotValue}
                                      onChange={(e) => setSelectedMoveLotValue(e.target.value)}
                                      className="w-full rounded-xl border-2 border-sky-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-800 focus:border-sky-400 focus:ring-2 focus:ring-sky-200"
                                    >
                                      {!moveLotOptions.length && (
                                        <option value="" disabled>ไม่มีลานอื่นให้เลือก</option>
                                      )}
                                      {moveLotOptions.map((option) => (
                                        <option key={option.value} value={option.value}>
                                          {option.label}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                  <div className="flex flex-wrap gap-2">
                                    <button
                                      type="button"
                                      onClick={handleMoveLot}
                                      disabled={!selectedMoveLotValue}
                                      className="flex-1 min-w-[140px] rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700 disabled:opacity-50"
                                    >
                                      ยืนยันการย้ายลาน
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setShowMoveLotSelector(false);
                                        setSelectedMoveLotValue('');
                                      }}
                                      className="rounded-xl border border-sky-200 px-4 py-2.5 text-sm font-semibold text-sky-700 bg-white hover:bg-sky-50"
                                    >
                                      ยกเลิก
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </>
                      )}
                      {Boolean(selectedVehicle?.in_sale) && (
                        <button
                          onClick={() => {
                            setShowEditModal(false);
                            setShowSaleModal(true);
                          }}
                          className="w-full rounded-2xl border border-emerald-200/80 bg-emerald-50/80 px-4 py-3 text-sm font-semibold text-emerald-900 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200 flex items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/90 text-emerald-500">
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h18v4H3V3zm0 6h18v4H3V9zm0 6h18v4H3v-4z" />
                              </svg>
                            </div>
                            <div className="text-left">
                              <p>จัดการขาย</p>
                              <p className="text-xs font-normal text-emerald-600/90">อัปเดตข้อมูลการขายของรถคันนี้</p>
                            </div>
                          </div>
                          <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </section>
                )
              }
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {isAdmin && selectedVehicle.x !== null && selectedVehicle.y !== null && (
                  <button
                    onClick={handleRemoveFromCanvas}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-slate-500">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div className="text-left">
                        <p>นำออกจาก Canvas</p>
                        <p className="text-xs font-normal text-slate-500">ล้างตำแหน่งของรถคันนี้</p>
                      </div>
                    </div>
                    <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                )}
                {canEditCanvas && (
                  <button
                    onClick={handleSaveEdit}
                    className="w-full rounded-2xl border border-blue-600 bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/20 text-white">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <div className="text-left">
                        <p>บันทึกการแก้ไข</p>
                        <p className="text-xs font-normal text-blue-100">บันทึกข้อมูลทั้งหมดที่ปรับปรุง</p>
                      </div>
                    </div>
                    <svg className="w-4 h-4 text-white/80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                )}
                {isAdmin && (
                  <button
                    onClick={handleDeleteVehicle}
                    className="w-full rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 shadow-sm transition hover:border-rose-300 hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-rose-500">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </div>
                      <div className="text-left">
                        <p>ลบข้อมูลถาวร</p>
                        <p className="text-xs font-normal text-rose-500">ลบรถและข้อมูลทั้งหมด</p>
                      </div>
                    </div>
                    <svg className="w-4 h-4 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                )}
                <button
                  onClick={() => setShowEditModal(false)}
                  className="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-gray-600 shadow-sm transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-200 flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  ยกเลิก
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      
      {showWorkshopModal && selectedVehicle && (
        <WorkshopModal
          vehicle={selectedVehicle}
          onClose={() => setShowWorkshopModal(false)}
          onSuccess={() => {
            // Refresh will happen via socket.io
            setShowWorkshopModal(false);
            setSelectedVehicle(null);
          }}
        />
      )}
      
      
      {showAuctionModal && selectedVehicle && (
        <AuctionModal
          vehicle={selectedVehicle}
          onClose={() => setShowAuctionModal(false)}
          onSuccess={() => {
            // Refresh will happen via socket.io
            setShowAuctionModal(false);
            setSelectedVehicle(null);
          }}
        />
      )}

      {showSaleModal && selectedVehicle && (
        <SaleModal
          vehicle={selectedVehicle}
          onClose={() => setShowSaleModal(false)}
          onSuccess={() => {
            setShowSaleModal(false);
            setSelectedVehicle(null);
          }}
        />
      )}
      </div>
    </div>
  );
}
