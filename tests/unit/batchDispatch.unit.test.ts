import { batchDispatch } from "../../services/dispatch/batchDispatch";

describe('Batch Dispatch – unit tests', () => {
  test('dispatches jobs without crashing', async () => {
    const jobs = [
      { id: 'job-001', requiredSkills: ['plumbing'] },
      { id: 'job-002', requiredSkills: ['electrical'] },
    ];
    const techs = [
      { id: 'tech-001', name: 'Alice', skills: ['plumbing'], available: true },
      { id: 'tech-002', name: 'Bob', skills: ['electrical'], available: true },
    ];

    // call with dummy companyId
    const jobIds = jobs.map(j => j.id);
    const results = await batchDispatch(jobIds, 'test-company');

    expect(results).toBeDefined();
    expect(results.assignments).toBeDefined();
  });

  test('handles empty job list gracefully', async () => {
    const results = await batchDispatch([], 'dummy-company');
    expect(results.assignments).toHaveLength(0);
    expect(results.stats.totalJobs).toBe(0);
  });
});
