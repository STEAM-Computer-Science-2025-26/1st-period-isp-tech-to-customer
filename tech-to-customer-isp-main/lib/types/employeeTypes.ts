export type EmployeeSkill = // List of skills that a tech can have
  | 'hvac_install'
  | 'hvac_repair'
  | 'hvac_maintenance'
  | 'electrical'
  | 'refrigeration'
  | 'ductwork'
  | 'plumbing';

export type SkillLevel = 1 | 2 | 3; // Good for now but we need to add specific criteria for each skill level in the future


export type EmployeeDataType = {
  id: string;
  userId: string;          // Links to the user account
  companyId: string;

  // Tech capabilities (REQUIRED)
  skills: EmployeeSkill[];
  skillLevel: Partial<Record<EmployeeSkill, SkillLevel>>; // Empty object {} if no assessments

  // Location (REQUIRED for routing)
  homeAddress: string;
  currentLocation: string | null; // Updated on each job assignment/completion, null if unknown

  // Contact (explicit null if not provided)
  phone: string | null;
  email: string | null;

  // Status (REQUIRED with defaults)
  isAvailable: boolean;       // Default: true
  availabilityUpdatedAt: string; // ISO 8601 - set on creation and every update
  currentJobId: string | null;   // null if no current job
  maxConcurrentJobs: number;     // Default: 1
  isActive: boolean;             // Controls wether the tech is on a job or not, default: false

  // Performance (REQUIRED with defaults)
  rating: number;                // 1-5 (default: 3.0)
  lastJobCompletedAt: string | null; // ISO 8601 - null until first job completed

  // Internal (admin fields - explicit null if not provided)
  internalNotes: string | null;     // null if no notes
  createdByUserId: string | null;   // null if system-created

  // Timestamps (REQUIRED)
  createdAt: string;          // ISO 8601
};


export type AvailableTechDataType = EmployeeDataType & {
  distanceKm: number | null;     // Calculated distance from job location (null if can't calculate)
  currentJobsCount: number;      // Current number of active jobs (always computed)
};

/**
 * Create employee profile
 * Optional fields will use defaults if not provided
 */
export type CreateEmployeeProfileInput = {
  userId: string;          // Must have a user account first
  companyId: string;

  // Required
  skills: EmployeeSkill[];
  homeAddress: string;

  // Optional - backend applies defaults if not provided
  skillLevel?: Partial<Record<EmployeeSkill, SkillLevel>>;
  phone?: string | null;
  email?: string | null;
  maxConcurrentJobs?: number;  // Default: 1
  internalNotes?: string | null;
};

export type CreateEmployeeProfileSuccess = {
  profileId: string;
  profile?: EmployeeDataType;   // Optional: return full profile for convenience
};

/**
 * Get employee profile
 */
export type GetEmployeeProfileInput = {
  userId: string;
};

export type GetEmployeeProfileSuccess = {
  profile: EmployeeDataType;
};

/**
 * Update employee availability
 * (Tech marks themselves as available/unavailable)
 */
export type UpdateEmployeeAvailabilityInput = {
  userId: string;
  isAvailable: boolean;
};

export type UpdateEmployeeAvailabilitySuccess = {
  success: true;
  profile?: EmployeeDataType;   // Optional: return updated profile
};

/**
 * Update employee profile
 * (Admin updates tech info)
 * All fields optional - only update what's provided
 */
export type UpdateEmployeeProfileInput = {
  userId: string;
  skills?: EmployeeSkill[];
  skillLevel?: Partial<Record<EmployeeSkill, SkillLevel>>;
  homeAddress?: string;
  phone?: string | null;
  email?: string | null;
  maxConcurrentJobs?: number;
  isActive?: boolean;
  internalNotes?: string | null;
};

export type UpdateEmployeeProfileSuccess = {
  success: true;
  profile?: EmployeeDataType;   // Optional: return updated profile
};

/**
 * Get available techs (for job assignment algorithm)
 */
export type GetAvailableTechsInput = {
  companyId: string;
  requiredSkills?: EmployeeSkill[];  // Filter by skills needed for job
  minSkillLevel?: SkillLevel;        // Minimum skill level required
  maxDistanceKm?: number;            // Max distance in km from job location
  jobLocation?: string;              // Job address (for distance calculation)
};

export type GetAvailableTechsSuccess = {
  techs: AvailableTechDataType[];
};