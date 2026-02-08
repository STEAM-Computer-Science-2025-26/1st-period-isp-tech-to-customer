/**
 * stage1-eligibility.test.ts
 * STEP 3.3: Stage 1 - Eligibility Filters
 */

import { checkEligibility, filterEligibleTechnicians } from '../algo/stage1-eligibility';

describe('Stage 1: Eligibility Filters', () => {

  const sampleJob = {
    id: 'job-001',
    companyId: 'company-123',
    latitude: 32.7767,    // Dallas
    longitude: -96.7970,
    requiredSkills: ['hvac_repair'],
    minimumSkillLevel: 2
  };

  const perfectTech = {
    id: 'tech-001',
    name: 'Alice Perfect',
    companyId: 'company-123',
    isActive: true,
    isAvailable: true,
    currentJobsCount: 0,
    maxConcurrentJobs: 3,
    latitude: 32.7768,
    longitude: -96.7969,
    maxTravelDistanceMiles: 10,
    skills: ['hvac_repair', 'electrical'],
    skillLevel: { hvac_repair: 3, electrical: 2 },
    recentCompletionRate: 1.0,
    recentJobCount: 10,
    dailyJobCount: 5,
    distanceMiles: 0
  };

  test('3.3.1 Perfect Technician passes all 7 rules', () => {
    const result = checkEligibility(perfectTech, sampleJob);
    expect(result.isEligible).toBe(true);
    expect(result.failedRules.length).toBe(0);
    expect(result.passedRules.length).toBe(7);
  });

  test('3.3.2 Inactive Technician fails Rule 1', () => {
    const tech = { ...perfectTech, id: 'tech-002', name: 'Jane Inactive', isActive: false };
    const result = checkEligibility(tech, sampleJob);
    expect(result.isEligible).toBe(false);
    expect(result.failedRules.some(r => r.includes('Rule 1'))).toBe(true);
  });

  test('3.3.3 Unavailable Technician fails Rule 2', () => {
    const tech = { ...perfectTech, id: 'tech-003', name: 'Bob Unavailable', isAvailable: false };
    const result = checkEligibility(tech, sampleJob);
    expect(result.isEligible).toBe(false);
    expect(result.failedRules.some(r => r.includes('Rule 2'))).toBe(true);
  });

  test('3.3.4 Max Capacity Technician fails Rule 3', () => {
    const tech = { ...perfectTech, id: 'tech-004', name: 'Sarah Busy', currentJobsCount: 3 };
    const result = checkEligibility(tech, sampleJob);
    expect(result.isEligible).toBe(false);
    expect(result.failedRules.some(r => r.includes('Rule 3'))).toBe(true);
  });

  test('3.3.5 Missing Location fails Rule 5', () => {
    const tech = { ...perfectTech, id: 'tech-005', name: 'Tom NoGPS', latitude: null, longitude: null };
    const result = checkEligibility(tech, sampleJob);
    expect(result.isEligible).toBe(false);
    expect(result.failedRules.some(r => r.includes('Rule 5'))).toBe(true);
  });

  test('3.3.6 Too Far Away fails Rule 6', () => {
    const tech = { ...perfectTech, id: 'tech-006', name: 'Emily Remote', latitude: 32.9000, longitude: -97.5000 };
    const result = checkEligibility(tech, sampleJob);
    expect(result.isEligible).toBe(false);
    expect(result.failedRules.some(r => r.includes('Rule 6'))).toBe(true);
  });

  test('3.3.7 Missing Required Skill fails Rule 7', () => {
    const tech = { ...perfectTech, id: 'tech-007', name: 'Mike NoSkill', skills: ['electrical'], skillLevel: { electrical: 3 } };
    const result = checkEligibility(tech, sampleJob);
    expect(result.isEligible).toBe(false);
    expect(result.failedRules.some(r => r.includes('Rule 7'))).toBe(true);
  });

  test('3.3.8 Insufficient Skill Level fails Rule 7', () => {
    const tech = { ...perfectTech, id: 'tech-008', name: 'Lisa Junior', skillLevel: { hvac_repair: 1 } };
    const result = checkEligibility(tech, sampleJob);
    expect(result.isEligible).toBe(false);
    expect(result.failedRules.some(r => r.includes('Rule 7'))).toBe(true);
  });

  test('3.3.9 Integration: filterEligibleTechnicians', () => {
    const allTechs = [
      perfectTech,
      { ...perfectTech, id: 'tech-002', isActive: false },
      { ...perfectTech, id: 'tech-003', isAvailable: false },
      { ...perfectTech, id: 'tech-004', currentJobsCount: 3 },
      { ...perfectTech, id: 'tech-005', latitude: null, longitude: null },
      { ...perfectTech, id: 'tech-006', latitude: 32.9000, longitude: -97.5000 },
      { ...perfectTech, id: 'tech-007', skills: ['electrical'], skillLevel: { electrical: 3, hvac_repair: 0 } },
      { ...perfectTech, id: 'tech-008', skillLevel: { hvac_repair: 1, electrical: 0 } }
    ];

    const filtered = filterEligibleTechnicians(allTechs, sampleJob);
    expect(filtered.eligible.length).toBe(1);
    expect(filtered.eligible[0].id).toBe('tech-001');
    expect(filtered.ineligible.length).toBe(allTechs.length - 1);
  });

});
