import { ISODateString } from "./commonTypes";

export type PartsUsedEntry = {
	partId: string;
	partName: string;
	quantity: number;
	stockAvailableAtStart: boolean;
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
	date: string;
};
