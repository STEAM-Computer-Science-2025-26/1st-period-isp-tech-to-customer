import { scoreTechnician, scoreAllTechnicians } from '../algo/scoring';

describe('Stage 2 — Scoring System: Ultimate Bulletproof Tests', () => {
  const baseJob = {
    latitude: 32.7767,
    longitude: -96.7970,
    priority: 'high',
    requiredSkills: ['hvac_repair', 'plumbing', 'electric'],
    minimumSkillLevel: 2
  };

  const emergencyJob = { ...baseJob, priority: 'emergency' };

  const baseTech = {
    id: 'tech-001',
    name: 'Alice',
    latitude: 32.7767,
    longitude: -96.7970,
    currentJobsCount: 0,
    maxConcurrentJobs: 3,
    skills: ['hvac_repair', 'plumbing', 'electric'],
    skillLevel: { hvac_repair: 2, plumbing: 2, electric: 2 },
    distanceMiles: 0,
    recentCompletionRate: 0.95,
    recentJobCount: 15,
    dailyJobCount: 0
  };

  /** --- EXTREME DISTANCE CASES --- */
  it('Distance: exactly 0, 50, >50 miles', () => {
    const zero = scoreTechnician({ ...baseTech, id: 'zero' }, baseJob);
    const max = scoreTechnician({ ...baseTech, id: 'max', latitude: 32.0, longitude: -96.0 }, baseJob);
    const beyond = scoreTechnician({ ...baseTech, id: 'beyond', latitude: 0, longitude: 0 }, baseJob);

    console.log('Distance Extremes:', { zero, max, beyond });

    expect(zero.distanceScore).toBe(40);
    expect(max.distanceScore).toBeGreaterThanOrEqual(0);
    expect(max.distanceScore).toBeLessThanOrEqual(40);
    expect(beyond.distanceScore).toBe(0);
  });

  /** --- AVAILABILITY EXTREMES --- */
  it('Availability: 0, full, over max', () => {
    const free = scoreTechnician({ ...baseTech, currentJobsCount: 0 }, baseJob);
    const full = scoreTechnician({ ...baseTech, currentJobsCount: 3 }, baseJob);
    const over = scoreTechnician({ ...baseTech, currentJobsCount: 10 }, baseJob);

    console.log('Availability Extremes:', { free, full, over });

    expect(free.availabilityScore).toBe(20);
    expect(full.availabilityScore).toBe(0);
    expect(over.availabilityScore).toBeLessThanOrEqual(0);
  });

  /** --- SKILL EDGE CASES --- */
  it('Skills: missing, overqualified, underqualified, mixed', () => {
    const missing = scoreTechnician({ ...baseTech, skillLevel: { hvac_repair: 2 } }, baseJob);
    const over = scoreTechnician({ ...baseTech, skillLevel: { hvac_repair: 4, plumbing: 3, electric: 5 } }, baseJob);
    const under = scoreTechnician({ ...baseTech, skillLevel: { hvac_repair: 1, plumbing: 1, electric: 1 } }, baseJob);
    const mixed = scoreTechnician({ ...baseTech, skillLevel: { hvac_repair: 2, plumbing: 1, electric: 3 } }, baseJob);

    console.log('Skill Extremes:', { missing, over, under, mixed });

    expect(missing.skillMatchScore).toBeLessThanOrEqual(20);
    expect(over.skillMatchScore).toBe(15);
    expect(under.skillMatchScore).toBe(10);
    expect(mixed.skillMatchScore).toBeGreaterThan(10);
    expect(mixed.skillMatchScore).toBeLessThan(20);
  });

  /** --- PERFORMANCE EDGE CASES --- */
  it('Performance: <10 jobs, perfect, mid, poor', () => {
    const newTech = scoreTechnician({ ...baseTech, recentJobCount: 5, recentCompletionRate: 1 }, baseJob);
    const perfect = scoreTechnician({ ...baseTech, recentJobCount: 15, recentCompletionRate: 0.95 }, baseJob);
    const mid = scoreTechnician({ ...baseTech, recentJobCount: 20, recentCompletionRate: 0.85 }, baseJob);
    const poor = scoreTechnician({ ...baseTech, recentJobCount: 12, recentCompletionRate: 0.72 }, baseJob);

    console.log('Performance Extremes:', { newTech, perfect, mid, poor });

    expect(newTech.performanceScore).toBe(7);
    expect(perfect.performanceScore).toBe(10);
    expect(mid.performanceScore).toBe(7);
    expect(poor.performanceScore).toBe(3);
  });

  /** --- WORKLOAD EXTREMES --- */
  it('Workload: 0, half, max, emergency ignored', () => {
    const zero = scoreTechnician({ ...baseTech, dailyJobCount: 0 }, baseJob);
    const half = scoreTechnician({ ...baseTech, dailyJobCount: 3 }, baseJob);
    const max = scoreTechnician({ ...baseTech, dailyJobCount: 6 }, baseJob);
    const emergency = scoreTechnician({ ...baseTech, dailyJobCount: 3 }, emergencyJob);

    console.log('Workload Extremes:', { zero, half, max, emergency });

    expect(zero.workloadScore).toBe(10);
    expect(half.workloadScore).toBeCloseTo(5);
    expect(max.workloadScore).toBe(0);
    expect(emergency.workloadScore).toBe(0);
  });

  /** --- EMERGENCY MODE --- */
  it('Emergency: weighted correctly', () => {
    const s = scoreTechnician(baseTech, emergencyJob);
    console.log('Emergency:', s);
    expect(s.distanceScore).toBe(60);
    expect(s.availabilityScore).toBe(10);
    expect(s.workloadScore).toBe(0);
  });

  /** --- RANDOMIZED STRESS TESTS --- */
  it('Stress test: 100 random technicians', () => {
    const techs = Array.from({ length: 100 }).map((_, i) => ({
      ...baseTech,
      id: `tech-${i + 100}`,
      latitude: 32.5 + Math.random(),
      longitude: -96.5 - Math.random(),
      currentJobsCount: Math.floor(Math.random() * 5),
      dailyJobCount: Math.floor(Math.random() * 8),
      recentCompletionRate: Math.random(),
      recentJobCount: Math.floor(Math.random() * 20),
      skillLevel: { hvac_repair: Math.floor(Math.random() * 5), plumbing: Math.floor(Math.random() * 5), electric: Math.floor(Math.random() * 5) }
    }));

    const scores = scoreAllTechnicians(techs, baseJob);
    const totalScores = scores.map(s => s.totalScore);
    console.log('Stress test scores:', totalScores.slice(0, 10), '...');

    // ensure no negative or NaN total scores
    totalScores.forEach(s => expect(s).toBeGreaterThanOrEqual(0));
    totalScores.forEach(s => expect(s).toBeLessThanOrEqual(100));
  });

  /** --- INVALID INPUTS --- */
  it('Invalid / null / undefined fields', () => {
    const invalidTechs = [
      { ...baseTech, skillLevel: null },
      { ...baseTech, latitude: NaN, longitude: NaN },
      { ...baseTech, currentJobsCount: -5 },
      { ...baseTech, dailyJobCount: -1 }
    ];

    const scores = invalidTechs.map(t => scoreTechnician(t, baseJob));
    console.log('Invalid Inputs:', scores);

    scores.forEach(s => {
      expect(s.totalScore).toBeGreaterThanOrEqual(0);
      expect(s.totalScore).toBeLessThanOrEqual(100);
    });
  });
});
