/**
 * Report Validation and Deduplication System
 * 
 * Ensures assessment reports are accurate by:
 * - Validating violations before including them
 * - Removing duplicate violations
 * - Removing unsupported violations
 * - Including confidence percentage for each violation
 * - Generating audit logs for all detected incidents
 */

// Extended TabLog type to include all possible properties from different sources
export interface ExtendedTabLog {
  id?: string;
  studentId?: string;
  studentName?: string;
  userId?: string;
  user?: string;
  course?: string;
  examTitle?: string;
  assessmentTitle?: string;
  assessmentId?: string;
  timestamp?: any;
  durationSeconds?: number;
  status?: string;
  autoSubmitted?: boolean;
  violation?: string;
  alert?: string;
  tabSwitched?: boolean;
  confidenceScore?: number;
  patternType?: 'accidental' | 'suspicious' | 'intentional';
}

export interface ValidatedViolation {
  id: string;
  studentId: string;
  studentName: string;
  violationType: string;
  confidenceScore: number; // 0-100
  patternType: 'accidental' | 'suspicious' | 'intentional';
  timestamp: Date;
  course?: string;
  assessmentTitle?: string;
  isVerified: boolean;
  reason: string;
  classification: 'Intentional Cheating' | 'System Event' | 'Internet Loss' | 'Window Switch' | 'Application Switch' | 'Technical Error';
}

export interface AuditLog {
  id: string;
  violationId: string;
  action: 'validated' | 'rejected' | 'deduplicated';
  reason: string;
  timestamp: Date;
  performedBy: 'system' | 'instructor';
}

/**
 * Validate and classify a single violation based on confidence score and evidence
 */
function validateViolation(log: ExtendedTabLog): {
  isValid: boolean;
  reason: string;
  confidenceScore: number;
  classification: ValidatedViolation['classification'];
} {
  const violationText = (log.violation || log.alert || '').toLowerCase();

  // 1. Internet Loss Detection
  if (violationText.includes('internet') || 
      violationText.includes('connection') ||
      violationText.includes('offline') ||
      violationText.includes('network') ||
      log.status === 'internet_loss') {
    return {
      isValid: false,
      classification: 'Internet Loss',
      reason: 'Internet disconnection - technical issue, not cheating',
      confidenceScore: 0,
    };
  }

  // 2. Technical Error Check
  if (!log.studentId && !log.userId && !log.studentName && !log.user) {
    return {
      isValid: false,
      classification: 'Technical Error',
      reason: 'Malformed log - missing user/student identification metadata',
      confidenceScore: 0,
    };
  }

  // 3. Screenshot Classification
  if (violationText.includes('screenshot') || 
      violationText.includes('printscreen') || 
      violationText.includes('snipping') || 
      violationText.includes('snip')) {
    
    // Direct keypresses like 'PrintScreen' or 'Snipping Tool' provide strong evidence of cheating
    const isDirectKeypress = violationText.includes('printscreen') || violationText.includes('snipping tool');
    
    if (isDirectKeypress) {
      return {
        isValid: true,
        classification: 'Intentional Cheating',
        reason: `Screenshot captured via keypress (${log.violation})`,
        confidenceScore: log.confidenceScore ?? 90,
      };
    } else {
      // General screenshot triggers are classified as system events
      return {
        isValid: false,
        classification: 'System Event',
        reason: 'General screenshot alert without verified keypress - possible OS overlay',
        confidenceScore: log.confidenceScore ?? 25,
      };
    }
  }

  // 4. Window Switch vs Application Switch
  if (log.tabSwitched || violationText.includes('tab') || violationText.includes('focus') || violationText.includes('exit')) {
    const duration = log.durationSeconds ?? 0;
    
    if (duration > 15) {
      return {
        isValid: true,
        classification: 'Intentional Cheating',
        reason: `Prolonged tab switch (${duration}s) - high probability of seek violation`,
        confidenceScore: log.confidenceScore ?? 95,
      };
    } else if (duration > 3) {
      return {
        isValid: true,
        classification: 'Window Switch',
        reason: `Medium tab switch (${duration}s) - suspicious window switch`,
        confidenceScore: log.confidenceScore ?? 60,
      };
    } else {
      return {
        isValid: false, // accidental
        classification: 'Application Switch',
        reason: `Brief blur event (${duration}s) - likely notification or background app swap`,
        confidenceScore: log.confidenceScore ?? 20,
      };
    }
  }

  // 5. Mouse exit count
  if (violationText.includes('mouse') || violationText.includes('boundary') || violationText.includes('exit')) {
    const confidence = log.confidenceScore ?? 50;
    if (confidence >= 70) {
      return {
        isValid: true,
        classification: 'Intentional Cheating',
        reason: 'Repeated/excessive mouse boundary exits',
        confidenceScore: confidence,
      };
    } else if (confidence >= 40) {
      return {
        isValid: true,
        classification: 'Window Switch',
        reason: 'Suspicious boundary exit behavior',
        confidenceScore: confidence,
      };
    } else {
      return {
        isValid: false,
        classification: 'Application Switch',
        reason: 'Brief cursor exit (accidental)',
        confidenceScore: confidence,
      };
    }
  }

  // 6. Default fallback
  const confidence = log.confidenceScore ?? 50;
  return {
    isValid: confidence >= 40,
    classification: confidence >= 70 ? 'Intentional Cheating' : 'System Event',
    reason: log.violation || 'General proctoring warning event',
    confidenceScore: confidence,
  };
}

/**
 * Remove duplicate violations based on student, time window, and violation type
 */
function removeDuplicates(violations: ValidatedViolation[]): ValidatedViolation[] {
  const duplicates = new Set<string>();
  const uniqueViolations: ValidatedViolation[] = [];

  // Sort by timestamp
  const sorted = [...violations].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  for (const violation of sorted) {
    const key = `${violation.studentId}-${violation.violationType}`;
    
    // Check if there's a similar violation within 30 seconds
    const isDuplicate = sorted.some(other => {
      if (other.id === violation.id) return false;
      if (other.studentId !== violation.studentId) return false;
      if (other.violationType !== violation.violationType) return false;
      
      const timeDiff = Math.abs(other.timestamp.getTime() - violation.timestamp.getTime());
      return timeDiff < 30000; // 30 seconds
    });

    if (isDuplicate) {
      duplicates.add(violation.id);
    } else {
      uniqueViolations.push(violation);
    }
  }

  return uniqueViolations;
}

/**
 * Generate audit log for validation actions
 */
function generateAuditLog(
  violationId: string,
  action: 'validated' | 'rejected' | 'deduplicated',
  reason: string
): AuditLog {
  return {
    id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    violationId,
    action,
    reason,
    timestamp: new Date(),
    performedBy: 'system',
  };
}

/**
 * Main validation function for assessment reports
 */
export function validateAssessmentViolations(
  logs: ExtendedTabLog[]
): {
  validatedViolations: ValidatedViolation[];
  auditLogs: AuditLog[];
  summary: {
    total: number;
    validated: number;
    rejected: number;
    deduplicated: number;
  };
} {
  const validatedViolations: ValidatedViolation[] = [];
  const auditLogs: AuditLog[] = [];
  let validatedCount = 0;
  let rejectedCount = 0;

  // Step 1: Validate each violation
  for (const log of logs) {
    const validation = validateViolation(log);
    
    if (validation.isValid) {
      validatedCount++;
      validatedViolations.push({
        id: log.id || `violation-${Date.now()}-${Math.random()}`,
        studentId: log.userId || log.studentId || 'unknown',
        studentName: log.studentName || log.user || 'Unknown',
        violationType: log.violation || log.alert || 'Unknown',
        confidenceScore: validation.confidenceScore,
        patternType: validation.confidenceScore >= 70 ? 'intentional' : (validation.confidenceScore >= 30 ? 'suspicious' : 'accidental'),
        timestamp: log.timestamp?.toDate?.() || new Date(),
        course: log.course,
        assessmentTitle: log.examTitle || log.assessmentTitle,
        isVerified: validation.confidenceScore >= 70,
        reason: validation.reason,
        classification: validation.classification,
      });
      
      auditLogs.push(generateAuditLog(log.id || 'unknown', 'validated', validation.reason));
    } else {
      rejectedCount++;
      auditLogs.push(generateAuditLog(log.id || 'unknown', 'rejected', validation.reason));
    }
  }

  // Step 2: Remove duplicates
  const deduplicatedViolations = removeDuplicates(validatedViolations);
  const deduplicatedCount = validatedViolations.length - deduplicatedViolations.length;

  // Add audit logs for deduplication
  for (const violation of validatedViolations) {
    if (!deduplicatedViolations.find(v => v.id === violation.id)) {
      auditLogs.push(generateAuditLog(violation.id, 'deduplicated', 'Duplicate violation removed'));
    }
  }

  return {
    validatedViolations: deduplicatedViolations,
    auditLogs,
    summary: {
      total: logs.length,
      validated: validatedCount,
      rejected: rejectedCount,
      deduplicated: deduplicatedCount,
    },
  };
}

/**
 * Filter violations by confidence threshold
 */
export function filterByConfidence(
  violations: ValidatedViolation[],
  minConfidence: number
): ValidatedViolation[] {
  return violations.filter(v => v.confidenceScore >= minConfidence);
}

/**
 * Filter violations by verification status
 */
export function filterByVerification(
  violations: ValidatedViolation[],
  verifiedOnly: boolean
): ValidatedViolation[] {
  if (verifiedOnly) {
    return violations.filter(v => v.isVerified);
  }
  return violations;
}

/**
 * Get violation statistics for a student
 */
export function getStudentViolationStats(
  studentId: string,
  violations: ValidatedViolation[]
): {
  total: number;
  verified: number;
  unverified: number;
  byType: Record<string, number>;
  averageConfidence: number;
} {
  const studentViolations = violations.filter(v => v.studentId === studentId);
  
  const byType: Record<string, number> = {};
  let totalConfidence = 0;

  for (const v of studentViolations) {
    byType[v.violationType] = (byType[v.violationType] || 0) + 1;
    totalConfidence += v.confidenceScore;
  }

  return {
    total: studentViolations.length,
    verified: studentViolations.filter(v => v.isVerified).length,
    unverified: studentViolations.filter(v => !v.isVerified).length,
    byType,
    averageConfidence: studentViolations.length > 0 ? totalConfidence / studentViolations.length : 0,
  };
}
