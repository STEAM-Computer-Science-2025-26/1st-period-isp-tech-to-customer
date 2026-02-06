import { ISODateString } from "./commonTypes";

// ============================================
// Assignment Logging Types
// ============================================

export type TechnicianEligibilitySnapshot = {
	techId: string;
	techName: string;
	activeStatus: boolean;
	availabilityStatus: boolean;
	skillLevel: Record<string, number>;
	distanceToJobKm: number;
	currentWorkload: number;
	shiftStart: string | null; // "HH:MM"
	shiftEnd: string | null; // "HH:MM"
	emergencyCapable: boolean;
};

export type AssignmentScoringDetails = {
	distanceScore: number;
	availabilityScore: number;
	skillMatchScore: number;
	recentPerformanceScore: number;
	workloadBalanceScore: number;
	totalScore: number;
	rankAmongEligible: number;
	totalEligibleTechs: number;
};

export type JobAssignmentLogEntry = {
	id: string;
	jobId: string;
	assignedTechId: string;
	companyId: string;

	// Assignment metadata
	assignedAt: ISODateString;
	assignedByUserId: string | null;
	isManualOverride: boolean;
	overrideReason: string | null;
	isEmergency: boolean;
	requiresManualDispatch: boolean;

	// Technician snapshot
	technicianSnapshot: TechnicianEligibilitySnapshot;

	// Scoring
	scoringDetails: AssignmentScoringDetails;

	// Job snapshot
	jobType: string;
	jobComplexity: string | null;
	jobPriority: string;
	scheduledTime: ISODateString | null;

	createdAt: ISODateString;
};

// ============================================
// Completion Logging Types
// ============================================

export type PartsUsedEntry = {
	partId: string;
	partName: string;
	quantity: number;
	stockAvailableAtStart: boolean;
};

export type JobCompletionLogEntry = {
	id: string;
	jobId: string;
	techId: string;
	companyId: string;

	// Timing
	actualStartTime: ISODateString;
	actualCompletionTime: ISODateString;
	estimatedDurationMinutes: number | null;
	actualDurationMinutes: number;

	// Performance
	firstTimeFix: boolean;
	callbackRequired: boolean;
	customerRating: number | null;

	// Travel
	distanceDrivenKm: number;
	travelTimeMinutes: number;
	totalMilesDrivenToday: number;

	// Parts
	partsUsed: PartsUsedEntry[];
	stockAvailabilityNotes: string | null;
	reordersRequired: boolean;

	// Operational feedback
	techStressLevel: number | null; // 1-5
	dispatcherNotes: string | null;
	bottlenecksObserved: string | null;
	complications: string | null;

	// Software/system
	softwareUsed: string[];
	systemFailures: string | null;
	improvementSuggestions: string | null;

	// Additional context
	repeatCustomer: boolean;
	timeOfDayCategory: string;
	postJobTrainingNotes: string | null;

	completedAt: ISODateString;
};

// ============================================
// Performance Snapshot Types
// ============================================

export type RecentJobData = {
	jobId: string;
	completedAt: ISODateString;
	duration: number;
	firstTimeFix: boolean;
	customerRating: number | null;
};

export type TechPerformanceSnapshot = {
	id: string;
	techId: string;
	companyId: string;
	snapshotDate: string; // YYYY-MM-DD

	// Daily metrics
	jobsCompletedCount: number;
	totalDriveTimeMinutes: number;
	totalDistanceKm: number;
	averageJobDurationMinutes: number | null;
	firstTimeFixRate: number | null;
	averageCustomerRating: number | null;

	// Performance scores
	recentPerformanceScore: number;
	recentJobsData: RecentJobData[];

	createdAt: ISODateString;
};

// ============================================
// Input/Output Types for Logging Functions
// ============================================

export type LogAssignmentInput = {
	jobId: string;
	assignedTechId: string;
	companyId: string;
	assignedByUserId: string | null;
	isManualOverride: boolean;
	overrideReason: string | null;

	technicianSnapshot: TechnicianEligibilitySnapshot;
	scoringDetails: AssignmentScoringDetails;

	jobType: string;
	jobComplexity: string | null;
	jobPriority: string;
	scheduledTime: ISODateString | null;
	isEmergency: boolean;
	requiresManualDispatch: boolean;
};

export type LogCompletionInput = {
	jobId: string;
	techId: string;
	companyId: string;

	actualStartTime: ISODateString;
	actualCompletionTime: ISODateString;
	estimatedDurationMinutes: number | null;

	firstTimeFix: boolean;
	callbackRequired: boolean;
	customerRating: number | null;

	distanceDrivenKm: number;
	travelTimeMinutes: number;

	partsUsed: PartsUsedEntry[];
	stockAvailabilityNotes: string | null;
	reordersRequired: boolean;

	techStressLevel: number | null;
	dispatcherNotes: string | null;
	bottlenecksObserved: string | null;
	complications: string | null;

	softwareUsed: string[];
	systemFailures: string | null;
	improvementSuggestions: string | null;

	repeatCustomer: boolean;
	postJobTrainingNotes: string | null;
};

export type UpdatePerformanceSnapshotInput = {
	techId: string;
	companyId: string;
	date: string; // YYYY-MM-DD
};
