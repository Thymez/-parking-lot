#!/usr/bin/env node

const Database = require('better-sqlite3');
const path = require('path');

// Connect to database
const db = new Database(path.join(__dirname, '../server/parking.db'));

console.log('🚗 Starting to move vehicles from Lot 1 to Auction...\n');

// Get all vehicles from parking lot 1
const vehiclesInLot1 = db.prepare(`
  SELECT id, license_plate, brand, model, parking_lot_number
  FROM vehicles 
  WHERE parking_lot_number = 1 
  AND in_auction = 0
`).all();

console.log(`Found ${vehiclesInLot1.length} vehicles in Lot 1\n`);

if (vehiclesInLot1.length === 0) {
  console.log('✅ No vehicles to move. Lot 1 is empty or all vehicles are already in auction.');
  db.close();
  process.exit(0);
}

// Show vehicles that will be moved
console.log('Vehicles to be moved:');
console.log('─'.repeat(80));
vehiclesInLot1.forEach((v, index) => {
  console.log(`${index + 1}. ${v.license_plate || 'No Plate'} - ${v.brand || ''} ${v.model || ''} (ID: ${v.id})`);
});
console.log('─'.repeat(80));
console.log('');

// Move all vehicles to auction
const updateStmt = db.prepare(`
  UPDATE vehicles SET
    in_auction = 1,
    auction_name = ?,
    auction_notes = ?,
    auction_entry_time = CURRENT_TIMESTAMP,
    updated_at = CURRENT_TIMESTAMP
  WHERE id = ?
`);

let successCount = 0;
let errorCount = 0;

const transaction = db.transaction((vehicles) => {
  for (const vehicle of vehicles) {
    try {
      updateStmt.run(
        'ลานประมูล', // auction_name
        `ย้ายจากลาน ${vehicle.parking_lot_number}`, // auction_notes
        vehicle.id
      );
      successCount++;
      console.log(`✅ Moved: ${vehicle.license_plate || 'No Plate'} (ID: ${vehicle.id})`);
    } catch (error) {
      errorCount++;
      console.error(`❌ Error moving vehicle ID ${vehicle.id}:`, error.message);
    }
  }
});

// Execute transaction
try {
  transaction(vehiclesInLot1);
  console.log('\n' + '═'.repeat(80));
  console.log(`✅ Successfully moved ${successCount} vehicles to auction`);
  if (errorCount > 0) {
    console.log(`❌ Failed to move ${errorCount} vehicles`);
  }
  console.log('═'.repeat(80));
} catch (error) {
  console.error('\n❌ Transaction failed:', error.message);
  process.exit(1);
}

// Verify the move
const verifyCount = db.prepare(`
  SELECT COUNT(*) as count 
  FROM vehicles 
  WHERE parking_lot_number = 1 
  AND in_auction = 1
`).get();

console.log(`\n📊 Verification: ${verifyCount.count} vehicles from Lot 1 are now in auction`);

db.close();
console.log('\n✅ Database connection closed. Operation completed!');
