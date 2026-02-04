import { computePerformanceScore } from './performanceUtils';

function assert(condition: boolean, label: string) {
  if (!condition) {
    console.error('FAIL', label);
    process.exitCode = 1;
  } else {
    console.log('PASS', label);
  }
}

console.log('Running computePerformanceScore unit checks...');

// aggregate-based checks
const s1 = computePerformanceScore({ avgCustomerRating: 5, firstTimeFixRate: 1, avgJobDuration: 30 });
assert(s1 >= 0.9, 'aggregate: perfect tech ~1');

const s2 = computePerformanceScore({ avgCustomerRating: 2, firstTimeFixRate: 0, avgJobDuration: 180 });
assert(s2 <= 0.25, 'aggregate: poor tech ~0');

const s3 = computePerformanceScore({ avgCustomerRating: null, firstTimeFixRate: null, avgJobDuration: null });
assert(typeof s3 === 'number', 'aggregate: nulls produce number');

// recentJobs checks
const recent = [
  { firstTimeFix: true, customerRating: 5, actualDurationMinutes: 30, estimatedDurationMinutes: 30 },
  { firstTimeFix: false, customerRating: 4, actualDurationMinutes: 45, estimatedDurationMinutes: 40 },
];
const s4 = computePerformanceScore({ recentJobs: recent });
assert(s4 > 0 && s4 <= 1, 'recentJobs: normalized 0..1');

console.log('Done.');
