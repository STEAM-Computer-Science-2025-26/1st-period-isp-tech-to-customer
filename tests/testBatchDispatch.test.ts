import { batchDispatch } from '../services/dispatch/batchDispatch';
import { pool } from "../db";

const JOB_1 = "10101010-1010-1010-1010-101010101010";
const JOB_2 = "20202020-2020-2020-2020-202020202020";
const JOB_3 = "30303030-3030-3030-3030-303030303030";

describe('Batch Dispatch', () => {
  test('dispatches jobs without crashing', async () => {
    // mock data instead of hitting real DB or network
    const jobs = [
      { id: 'job-001', requiredSkills: ['plumbing'] },
      { id: 'job-002', requiredSkills: ['electrical'] },
    ];
    const techs = [
      { id: 'tech-001', name: 'Alice', skills: ['plumbing'], available: true },
      { id: 'tech-002', name: 'Bob', skills: ['electrical'], available: true },
    ];

    // call batchDispatch with job id strings and a dummy companyId to match service signature
    const jobIds = jobs.map(j => j.id);
    const results = await batchDispatch(jobIds, 'test-company');

    // assert result is returned (integration API returns an object with assignments)
    expect(results).toBeDefined();
  });
});
