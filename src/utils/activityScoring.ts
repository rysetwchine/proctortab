/**
 * Activity Scoring System
 * 
 * Provides a transparent scoring model for student activity during assessments
 * based on multiple factors: attendance, completion, focus, violations, etc.
 */

export interface ActivityScoreBreakdown {
  attendanceScore: number; // 0-100 (20% weight)
  completionScore: number; // 0-100 (25% weight)
  focusDurationScore: number; // 0-100 (25% weight)
  suspiciousActivityScore: number; // 0-100 (15% weight)
  verifiedViolationsScore: number; // 0-100 (15% weight)
  focusScore: number; // compatibility alias
  violationPenalty: number; // compatibility alias
  overallScore: number; // 0-100
  grade: string; // A, B, C, D, F
  recommendations: string[];
}

export interface ActivityScoreInput {
  // Attendance factors
  sessionsAttended: number;
  totalSessions: number;
  onTimePercentage: number; // 0-100
  
  // Assessment completion
  assessmentsCompleted: number;
  totalAssessments: number;
  averageScore: number; // 0-100
  
  // Focus metrics
  totalFocusTime: number; // minutes
  expectedFocusTime: number; // minutes
  tabSwitches: number;
  mouseBoundaryExits: number;
  
  // Violations
  verifiedViolations: number;
  totalViolations: number;
  internetLossEvents: number;
  
  // Engagement
  questionsAnswered: number;
  totalQuestions: number;
  timePerQuestion: number; // average seconds
}

/**
 * Calculate attendance score
 */
function calculateAttendanceScore(input: ActivityScoreInput): number {
  if (input.totalSessions === 0) return 100;
  return (input.sessionsAttended / input.totalSessions) * 100;
}

/**
 * Calculate completion score
 */
function calculateCompletionScore(input: ActivityScoreInput): number {
  if (input.totalAssessments === 0) return 100;
  return (input.assessmentsCompleted / input.totalAssessments) * 100;
}

/**
 * Calculate focus duration score
 */
function calculateFocusDurationScore(input: ActivityScoreInput): number {
  if (input.expectedFocusTime === 0) return 100;
  const ratio = Math.min(1, input.totalFocusTime / input.expectedFocusTime);
  return ratio * 100;
}

/**
 * Calculate suspicious activity score
 */
function calculateSuspiciousActivityScore(input: ActivityScoreInput): number {
  // Deduct 5 points per suspicious activity (tab switch, mouse exit)
  const suspiciousCount = input.tabSwitches + input.mouseBoundaryExits;
  return Math.max(0, 100 - suspiciousCount * 5);
}

/**
 * Calculate verified violations score
 */
function calculateVerifiedViolationsScore(input: ActivityScoreInput): number {
  // Deduct 25 points per verified violation (confirmed cheating attempt)
  return Math.max(0, 100 - input.verifiedViolations * 25);
}

/**
 * Generate grade letter based on overall score
 */
function calculateGrade(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

/**
 * Generate recommendations based on scores
 */
function generateRecommendations(breakdown: ActivityScoreBreakdown): string[] {
  const recommendations: string[] = [];
  
  if (breakdown.attendanceScore < 80) {
    recommendations.push('Improve attendance by attending all scheduled sessions on time.');
  }
  
  if (breakdown.completionScore < 80) {
    recommendations.push('Complete all assessments on time and aim for higher completion rates.');
  }
  
  if (breakdown.focusDurationScore < 70) {
    recommendations.push('Maintain active focus on the examination tab throughout assessments.');
  }
  
  if (breakdown.suspiciousActivityScore < 80) {
    recommendations.push('Avoid switching tabs or moving your cursor outside the exam viewport.');
  }
  
  if (breakdown.verifiedViolationsScore < 100) {
    recommendations.push('Verified cheating violations detected. Please strictly adhere to exam rules.');
  }
  
  if (breakdown.overallScore >= 90) {
    recommendations.push('Excellent performance! Keep up the good work.');
  }
  
  return recommendations;
}

/**
 * Calculate overall activity score with detailed breakdown
 */
export function calculateActivityScore(input: ActivityScoreInput): ActivityScoreBreakdown {
  const attendanceScore = calculateAttendanceScore(input);
  const completionScore = calculateCompletionScore(input);
  const focusDurationScore = calculateFocusDurationScore(input);
  const suspiciousActivityScore = calculateSuspiciousActivityScore(input);
  const verifiedViolationsScore = calculateVerifiedViolationsScore(input);
  
  // Weighted overall calculation:
  // Attendance (20%), Completion (25%), Focus Duration (25%), Suspicious (15%), Verified Violations (15%)
  const overallScore = (
    attendanceScore * 0.20 +
    completionScore * 0.25 +
    focusDurationScore * 0.25 +
    suspiciousActivityScore * 0.15 +
    verifiedViolationsScore * 0.15
  );
  
  const grade = calculateGrade(overallScore);
  
  const breakdown: ActivityScoreBreakdown = {
    attendanceScore: Math.round(attendanceScore),
    completionScore: Math.round(completionScore),
    focusDurationScore: Math.round(focusDurationScore),
    suspiciousActivityScore: Math.round(suspiciousActivityScore),
    verifiedViolationsScore: Math.round(verifiedViolationsScore),
    focusScore: Math.round(focusDurationScore),
    violationPenalty: Math.round(100 - verifiedViolationsScore),
    overallScore: Math.round(overallScore),
    grade,
    recommendations: [],
  };
  
  breakdown.recommendations = generateRecommendations(breakdown);
  
  return breakdown;
}

/**
 * Format activity score for display
 */
export function formatActivityScoreForDisplay(breakdown: ActivityScoreBreakdown): {
  summary: string;
  details: { label: string; value: number; color: string }[];
} {
  const details = [
    { label: 'Attendance (20%)', value: breakdown.attendanceScore, color: getScoreColor(breakdown.attendanceScore) },
    { label: 'Completion (25%)', value: breakdown.completionScore, color: getScoreColor(breakdown.completionScore) },
    { label: 'Focus Duration (25%)', value: breakdown.focusDurationScore, color: getScoreColor(breakdown.focusDurationScore) },
    { label: 'Suspicious Activity (15%)', value: breakdown.suspiciousActivityScore, color: getScoreColor(breakdown.suspiciousActivityScore) },
    { label: 'Verified Violations (15%)', value: breakdown.verifiedViolationsScore, color: getScoreColor(breakdown.verifiedViolationsScore) },
  ];
  
  const summary = `Overall Score: ${breakdown.overallScore}/100 (${breakdown.grade})`;
  
  return { summary, details };
}

function getScoreColor(score: number): string {
  if (score >= 90) return 'green';
  if (score >= 75) return 'blue';
  if (score >= 60) return 'yellow';
  return 'red';
}
