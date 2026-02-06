import { computeRecentPerformanceScore, getTimeOfDayCategory, calculateDuration } from './completionLogger';

function ok(label: string) {
  console.log(`PASS ${label}`);
}
function fail(label: string, msg?: string) {
  console.error(`FAIL ${label}${msg ? ': ' + msg : ''}`);
  process.exitCode = 1;
}

console.log('Running complete unit test suite...');

// 1) Scoring function scenarios
try {
  const a = computeRecentPerformanceScore(5, 1, 30);
  if (a < 0.9) fail('scoring: perfect tech', `score=${a}`);
  else ok('scoring: perfect tech');

  const b = computeRecentPerformanceScore(2, 0, 180);
  if (b > 0.25) fail('scoring: poor tech', `score=${b}`);
  else ok('scoring: poor tech');

  const c = computeRecentPerformanceScore(null, null, null);
  if (typeof c !== 'number' || Number.isNaN(c)) fail('scoring: null inputs', `score=${c}`);
  else ok('scoring: null inputs');
} catch (err) {
  fail('scoring: exception', String(err));
}

// 2) Time-of-day classification (timezone awareness)
try {
  // ISO time at 08:30Z -> in Europe/Rome (UTC+1 or +2 depending on DST) should be morning
  const t1 = '2025-03-15T08:30:00Z';
  const cat1 = getTimeOfDayCategory(t1, 'Europe/Rome');
  if (cat1 !== 'morning') fail('timeOfDay: Rome morning', cat1);
  else ok('timeOfDay: Rome morning');

  // ISO time 23:00Z -> Los Angeles (UTC-8) => 15:00 local -> afternoon
  const t2 = '2025-11-10T23:00:00Z';
  const cat2 = getTimeOfDayCategory(t2, 'America/Los_Angeles');
  if (cat2 !== 'afternoon') fail('timeOfDay: LA afternoon', cat2);
  else ok('timeOfDay: LA afternoon');
} catch (err) {
  fail('timeOfDay: exception', String(err));
}

// 3) Duration calculation
try {
  const start = '2025-02-03T08:00:00Z';
  const end = '2025-02-03T09:30:00Z';
  const mins = calculateDuration(start, end);
  if (mins !== 90) fail('duration: 90 minutes', `got ${mins}`);
  else ok('duration: 90 minutes');
} catch (err) {
  fail('duration: exception', String(err));
}

console.log('All unit tests ran.');
