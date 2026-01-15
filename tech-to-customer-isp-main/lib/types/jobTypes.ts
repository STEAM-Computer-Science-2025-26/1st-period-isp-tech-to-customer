/* File: jobTypes.ts
Overview: Type definitions for job-related operations (HVAC service calls)
Types:
  JobStatus: All possible job statuses
  JobPriority: Job priority levels
  JobType: Standardized job types
  DispatchTimeSettings: Time-based dispatch rules (customizable per company)
  JobDTO: Canonical job shape exposed via API
  CreateJobInput: Input for creating a new job
  CreateJobSuccess: Success response for job creation
  UpdateJobStatusInput: Input for updating job status
  UpdateJobStatusSuccess: Success response for status update
  GetJobsInput: Input for fetching/filtering jobs
  GetJobsSuccess: Success response with job list
  AssignTechInput: Input for manually assigning a tech
  AssignTechSuccess: Success response for assignment
*/
//DTO = Data Transfer Object
export type JobStatus =
  | 'unassigned'
  | 'assigned'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export type JobPriority =
  | 'low'
  | 'medium'
  | 'high'
  | 'emergency';

export type JobType =
  | 'installation'
  | 'repair'
  | 'maintenance'
  | 'inspection';

/**
 * Time-based dispatch rules (customizable per company)
 */
export type DispatchTimeSettings = {
  emergencyOnlyAfterTime: `${number}${number}:${number}${number}` | null; // "HH:MM" or null
};

/**
 * Canonical job shape exposed via API
 */
export type JobDTO = {
  id: string;
  companyId: string;

  // Customer info
  customerName: string;
  address: string;
  phone: string;

  // Job details
  jobType: JobType;
  status: JobStatus;
  priority: JobPriority;

  // Assignment
  assignedTechId?: string;

  // Timing
  scheduledTime?: string;    // ISO 8601
  createdAt: string;         // ISO 8601
  completedAt?: string;      // ISO 8601

  // Notes
  initialNotes?: string;
  completionNotes?: string;
};

/**
 * Create job
 */
export type CreateJobInput = {
  companyId: string;
  customerName: string;
  address: string;
  phone: string;
  jobType: JobType;
  priority: JobPriority;
  scheduledTime?: string;  // ISO 8601
  initialNotes?: string;
};

export type CreateJobSuccess = {
  jobId: string;
  job?: JobDTO; // optional: return full job for convenience
};

/**
 * Update job status
 */
export type UpdateJobStatusInput = {
  jobId: string;
  status: JobStatus;
  completionNotes?: string;
};

export type UpdateJobStatusSuccess = {
  success: true;
  updatedJob?: JobDTO; // optional: return updated job
};

/**
 * Get jobs (with optional filters)
 */
export type GetJobsInput = {
  companyId: string;
  status?: JobStatus;
  assignedTechId?: string;
  priority?: JobPriority;
};

export type GetJobsSuccess = {
  jobs: JobDTO[];
};

/**
 * Assign tech to job (manual override)
 */
export type AssignTechInput = {
  jobId: string;
  assignedTechId: string;
};

export type AssignTechSuccess = {
  success: true;
  updatedJob?: JobDTO; // optional: return updated job
};
