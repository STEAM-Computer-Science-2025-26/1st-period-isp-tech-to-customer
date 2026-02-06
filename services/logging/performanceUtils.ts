// Utility for computing a normalized performance score (0..1)
// Supports two input modes:
//  - recentJobs: array of job objects { firstTimeFix, customerRating (1-5), actualDurationMinutes, estimatedDurationMinutes }
//  - aggregates: { avgCustomerRating (1-5), firstTimeFixRate (0..1), avgJobDuration (minutes) }

export function computePerformanceScore(input: {
  recentJobs?: Array<any>;
  avgCustomerRating?: number | null;
  firstTimeFixRate?: number | null;
  avgJobDuration?: number | null;
}): number {
  // If recentJobs provided prefer that path
  if (Array.isArray(input.recentJobs)) {
    const recentJobs = input.recentJobs as any[];
    if (recentJobs.length === 0) return 0.5; // neutral in 0..1

    const weights = {
      firstTimeFix: 0.4,
      customerRating: 0.3,
      efficiency: 0.3,
    };

    let total = 0;
    for (const job of recentJobs) {
      const fff = job.firstTimeFix ? 1 : 0; // 0..1
      const rating = job.customerRating ? Number(job.customerRating) / 5 : 0; // 0..1

      // efficiency: map actual/estimated ratio into 0..1 where 1 is ideal
      let efficiency = 1;
      if (job.estimatedDurationMinutes && job.actualDurationMinutes) {
        const ratio = Number(job.actualDurationMinutes) / Number(job.estimatedDurationMinutes);
        if (ratio > 1.5) efficiency = 0.2;
        else if (ratio > 1.2) efficiency = 0.4;
        else if (ratio > 0.8) efficiency = 1;
        else efficiency = 0.8; // faster than estimate but not ideal
      }

      const jobScore = fff * weights.firstTimeFix + rating * weights.customerRating + efficiency * weights.efficiency;
      total += jobScore;
    }
    return Number((total / recentJobs.length).toFixed(3));
  }

  // Otherwise use aggregates
  const ratingScore = (Number(input.avgCustomerRating) || 0) / 5; // 0..1
  const fffScore = Number(input.firstTimeFixRate) || 0; // assume already 0..1
  const avgDuration = Number(input.avgJobDuration) || 0;
  const durationScore = avgDuration > 0 ? Math.max(0, 1 - avgDuration / 120) : 1; // 0..1

  const score = ratingScore * 0.5 + fffScore * 0.3 + durationScore * 0.2;
  return Number(score.toFixed(3));
}
