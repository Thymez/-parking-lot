export const SYSTEM_COLUMN_KEYS = new Set([
  'sequence_no',
  'updated_date',
  'license_plate',
  'province',
  'brand',
  'model',
  'transaction_type',
  'parking_lot_name',
  'start_time',
  'document_status',
  'rmo',
  'cmo',
  'gp_approval_status',
  'policy_type',
  'policy_amount',
  'note_summary',
  'color',
  'movement_info',
  'status_location',
  'movement_entry_date',
  'movement_date',
  'movement_notes',
  'workshop_name',
  'workshop_notes',
  'auction_name',
  'auction_notes',
  'sale_notes'
]);

export const HIDDEN_SYSTEM_COLUMN_KEYS = new Set([
  'workshop_name',
  'workshop_notes',
  'auction_name',
  'auction_notes',
  'sale_notes',
  'movement_date'
]);
