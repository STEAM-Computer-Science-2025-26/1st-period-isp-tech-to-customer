// /server/db/test-connection.ts
// Run this with: npx tsx server/db/test-connection.ts

import { getSql, testConnection, toCamelCase } from './connection';

async function runTests() {
  console.log('🔍 Testing Neon Database Connection...\n');

  // Test 1: Basic connection
  const { success: connected, error, currentTime } = await testConnection();
  
  if (!connected) {
    console.error('❌ Connection test failed. Check your DATABASE_URL in .env.local', error);
    process.exit(1);
  }

  console.log('✅ Database connected successfully! Current time:', currentTime);
  console.log('\n📊 Testing schema...\n');

  // Test 2: Check if tables exist
  try {
    const sql = getSql();
    const rows = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    ` as { table_name: string }[];

    const tables = rows.map(toCamelCase<{ tableName: string }>);

    console.log('✅ Tables in database:');
    tables.forEach(t => console.log(`   - ${t.tableName}`));

    const expectedTables = ['companies', 'users', 'employees', 'jobs'];
    const existingTables = tables.map(t => t.tableName);
    const missingTables = expectedTables.filter(t => !existingTables.includes(t));

    if (missingTables.length > 0) {
      console.warn('\n⚠️  Missing tables:', missingTables.join(', '));
      console.log('Run the SQL from server/db/schema.sql in your Neon SQL Editor');
      process.exit(1);
    } else {
      console.log('\n✅ All required tables exist!');
    }

  } catch (err) {
    console.error('❌ Error checking schema:', err);
    process.exit(1);
  }

  console.log('\n✨ Connection test complete!\n');
}

runTests().catch(err => {
  console.error('❌ Unexpected error during tests:', err);
  process.exit(1);
});