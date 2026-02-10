// services/types/technicianInput.ts

export interface TechnicianInput {
    // Identification
    id: string;
    name: string;
    companyId: string;

    // Status & availability
    isActive: boolean;
    isAvailable: boolean;

    // Job load
    currentJobsCount: number;
    maxConcurrentJobs: number;
    dailyJobCount: number;
    recentJobCount: number;
    recentCompletionRate: number;

    // Location & travel
    latitude: number;
    longitude: number;
    maxTravelDistanceMiles: number;

    // Skills
    skills: string[];
    skillLevel: Record<string, number>; // e.g. { hvac_repair: 3, electrical: 2 }

    // Performance metrics (optional)
    customerSatisfactionScore?: number;
    averageCompletionTimeMins?: number;
    emergencyResponseScore?: number;

    // Equipment & certification flags (optional)
    certifiedForGas?: boolean;
    certifiedForElectric?: boolean;
    ownsTruck?: boolean;
    ownsTools?: boolean;

    // Historical data (optional)
    yearsExperience?: number;
    lastActiveDate?: Date;

    // Distance cache (used by scoring)
    distanceMiles?: number;
}

export const createMockTechnician = (overrides: Partial<TechnicianInput> = {}): TechnicianInput => {
    return {
        id: 'tech-001',
        name: 'Alice Example',
        companyId: 'comp-123',
        isActive: true,
        isAvailable: true,
        currentJobsCount: 0,
        maxConcurrentJobs: 3,
        dailyJobCount: 0,
        recentJobCount: 5,
        recentCompletionRate: 0.9,
        latitude: 40.7128,
        longitude: -74.006,
        maxTravelDistanceMiles: 50,
        skills: ['hvac_repair', 'plumbing'],
        skillLevel: { hvac_repair: 3, plumbing: 2 },
        customerSatisfactionScore: 95,
        averageCompletionTimeMins: 60,
        emergencyResponseScore: 90,
        certifiedForGas: true,
        certifiedForElectric: false,
        ownsTruck: true,
        ownsTools: true,
        yearsExperience: 5,
        lastActiveDate: new Date(),
        ...overrides
    };
};

