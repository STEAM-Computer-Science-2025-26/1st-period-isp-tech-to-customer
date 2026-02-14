import { scoreAndRankCandidates } from '../services/dispatch/scorer';
import { getBatchDriveTimes } from '../services/dispatch/routing';

jest.mock('../services/dispatch/routing');

const mockedGetBatchDriveTimes = getBatchDriveTimes as jest.Mock;

describe('scoreAndRankCandidates – edge cases', () => {
  const baseJob = {
    id: 'job-edge',
    latitude: 40,
    longitude: -74,
    requiredSkills: ['hvac'],
    isEmergency: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('1. defaults avgRating to 3 if undefined', async () => {
    mockedGetBatchDriveTimes.mockResolvedValue([{ durationMinutes: 5 }]);

    const techs = [
      {
        id: 't1',
        currentLocation: { latitude: 40, longitude: -74 },
        isAvailable: true,
        skills: ['hvac'],
        currentJobCount: 0,
      },
    ];

    const result = await scoreAndRankCandidates(techs, baseJob, false);
    expect(result[0].breakdown.performanceScore).toBe(6);
  });

  test('2. clamps workload score at 0 for heavy load', async () => {
    mockedGetBatchDriveTimes.mockResolvedValue([{ durationMinutes: 5 }]);

    const techs = [
      {
        id: 't2',
        currentLocation: { latitude: 40, longitude: -74 },
        isAvailable: true,
        skills: ['hvac'],
        avgRating: 5,
        currentJobCount: 10,
      },
    ];

    const result = await scoreAndRankCandidates(techs, baseJob, false);
    expect(result[0].breakdown.workloadScore).toBe(0);
  });

  test('3. skillScore = 0 if missing required skill', async () => {
    mockedGetBatchDriveTimes.mockResolvedValue([{ durationMinutes: 5 }]);

    const techs = [
      {
        id: 't3',
        currentLocation: { latitude: 40, longitude: -74 },
        isAvailable: true,
        skills: ['plumbing'],
        avgRating: 5,
        currentJobCount: 0,
      },
    ];

    const result = await scoreAndRankCandidates(techs, baseJob, false);
    expect(result[0].breakdown.skillScore).toBe(0);
  });

  test('4. treats undefined requiredSkills as full match', async () => {
    mockedGetBatchDriveTimes.mockResolvedValue([{ durationMinutes: 5 }]);

    const techs = [
      {
        id: 't4',
        currentLocation: { latitude: 40, longitude: -74 },
        isAvailable: true,
        skills: [],
        avgRating: 5,
        currentJobCount: 0,
      },
    ];

    const job = { ...baseJob, requiredSkills: undefined };

    const result = await scoreAndRankCandidates(techs, job, false);
    expect(result[0].breakdown.skillScore).toBe(20);
  });

  test('5. availabilityScore = 0 when unavailable', async () => {
    mockedGetBatchDriveTimes.mockResolvedValue([{ durationMinutes: 5 }]);

    const techs = [
      {
        id: 't5',
        currentLocation: { latitude: 40, longitude: -74 },
        isAvailable: false,
        skills: ['hvac'],
        avgRating: 5,
        currentJobCount: 0,
      },
    ];

    const result = await scoreAndRankCandidates(techs, baseJob, false);
    expect(result[0].breakdown.availabilityScore).toBe(0);
  });

  test('6. distanceScore clamps to 0 if driveTime exceeds maxMinutes', async () => {
    mockedGetBatchDriveTimes.mockResolvedValue([{ durationMinutes: 60 }]);

    const techs = [
      {
        id: 't6',
        currentLocation: { latitude: 40, longitude: -74 },
        isAvailable: true,
        skills: ['hvac'],
        avgRating: 5,
        currentJobCount: 0,
      },
    ];

    const result = await scoreAndRankCandidates(techs, baseJob, false);
    expect(result[0].breakdown.distanceScore).toBe(0);
  });

  test('7. emergency uses 20-minute window and 60 weight', async () => {
    mockedGetBatchDriveTimes.mockResolvedValue([{ durationMinutes: 10 }]);

    const techs = [
      {
        id: 't7',
        currentLocation: { latitude: 40, longitude: -74 },
        isAvailable: true,
        skills: ['hvac'],
        avgRating: 5,
        currentJobCount: 0,
      },
    ];

    const result = await scoreAndRankCandidates(techs, baseJob, true);
    expect(result[0].breakdown.distanceScore).toBeCloseTo(30);
  });

  test('8. missing currentLocation filters out tech (does not call routing)', async () => {
    // FIXED: The scorer now filters out techs without valid locations
    // before calling getBatchDriveTimes, which is the correct behavior
    mockedGetBatchDriveTimes.mockResolvedValue([{ durationMinutes: 10 }]);

    const techs = [
      {
        id: 't8',
        // NO currentLocation provided
        isAvailable: true,
        skills: ['hvac'],
        avgRating: 5,
        currentJobCount: 0,
      },
    ];

    const result = await scoreAndRankCandidates(techs, baseJob, false);

    // Expect: tech is filtered out, routing is not called, empty result
    expect(mockedGetBatchDriveTimes).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });

  test('9. returns empty array when no eligible techs', async () => {
    mockedGetBatchDriveTimes.mockResolvedValue([]);
    const result = await scoreAndRankCandidates([], baseJob, false);
    expect(result).toEqual([]);
  });

  test('10. preserves stable descending sort order by score', async () => {
    mockedGetBatchDriveTimes.mockResolvedValue([
      { durationMinutes: 5 },
      { durationMinutes: 30 },
    ]);

    const techs = [
      {
        id: 'high',
        currentLocation: { latitude: 40, longitude: -74 },
        isAvailable: true,
        skills: ['hvac'],
        avgRating: 5,
        currentJobCount: 0,
      },
      {
        id: 'low',
        currentLocation: { latitude: 40, longitude: -74 },
        isAvailable: false,
        skills: [],
        avgRating: 1,
        currentJobCount: 5,
      },
    ];

    const result = await scoreAndRankCandidates(techs, baseJob, false);
    expect(result[0].tech.id).toBe('high');
    expect(result[1].tech.id).toBe('low');
  });
});

describe('scoreAndRankCandidates – routing failure & corruption cases', () => {
  const baseJob = {
    id: 'job-failure',
    latitude: 40,
    longitude: -74,
    requiredSkills: ['hvac'],
    isEmergency: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('11. propagates error if getBatchDriveTimes rejects', async () => {
    mockedGetBatchDriveTimes.mockRejectedValue(new Error('Routing API failed'));

    const techs = [
      {
        id: 't1',
        currentLocation: { latitude: 40, longitude: -74 },
        isAvailable: true,
        skills: ['hvac'],
      },
    ];

    await expect(
      scoreAndRankCandidates(techs, baseJob, false)
    ).rejects.toThrow('Routing API failed');
  });

  test('12. handles driveTimes shorter than tech list safely', async () => {
    mockedGetBatchDriveTimes.mockResolvedValue([{ durationMinutes: 5 }]);

    const techs = [
      {
        id: 't1',
        currentLocation: { latitude: 40, longitude: -74 },
        isAvailable: true,
        skills: ['hvac'],
      },
      {
        id: 't2',
        currentLocation: { latitude: 40, longitude: -74 },
        isAvailable: true,
        skills: ['hvac'],
      },
    ];

    const result = await scoreAndRankCandidates(techs, baseJob, false);
    expect(result.length).toBe(2);
  });

  test('13. negative duration does not inflate distanceScore', async () => {
    mockedGetBatchDriveTimes.mockResolvedValue([{ durationMinutes: -10 }]);

    const techs = [
      {
        id: 't3',
        currentLocation: { latitude: 40, longitude: -74 },
        isAvailable: true,
        skills: ['hvac'],
      },
    ];

    const result = await scoreAndRankCandidates(techs, baseJob, false);
    expect(result[0].breakdown.distanceScore).toBeLessThanOrEqual(40);
  });

  test('14. NaN duration does not corrupt score', async () => {
    mockedGetBatchDriveTimes.mockResolvedValue([{ durationMinutes: NaN }]);

    const techs = [
      {
        id: 't4',
        currentLocation: { latitude: 40, longitude: -74 },
        isAvailable: true,
        skills: ['hvac'],
      },
    ];

    const result = await scoreAndRankCandidates(techs, baseJob, false);
    expect(result[0].score).not.toBeNaN();
  });

  test('15. latitude or longitude = 0 does not throw', async () => {
    mockedGetBatchDriveTimes.mockResolvedValue([{ durationMinutes: 5 }]);

    const job = { ...baseJob, latitude: 0, longitude: 0 };

    const techs = [
      {
        id: 't5',
        currentLocation: { latitude: 0, longitude: 0 },
        isAvailable: true,
        skills: ['hvac'],
      },
    ];

    await expect(
      scoreAndRankCandidates(techs, job, false)
    ).resolves.toBeDefined();
  });
});