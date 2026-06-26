/**
 * Violation Confidence Scoring System
 * 
 * This module provides a transparent scoring model for detecting violations
 * with confidence levels to reduce false positives.
 */

export type ViolationType = 
  | 'tab_switch'
  | 'mouse_boundary_exit'
  | 'screenshot'
  | 'copy_paste'
  | 'fullscreen_exit'
  | 'internet_loss';

export type PatternType = 'accidental' | 'suspicious' | 'intentional';

export interface ViolationScore {
  confidenceScore: number; // 0-100
  patternType: PatternType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  shouldDeductTime: boolean;
  shouldAutoSubmit: boolean;
  deductionMinutes: number;
  reasoning: string;
  violationType?: ViolationType;
}

export function calculateTabSwitchConfidence(
  durationSeconds: number,
  isQuiz: boolean,
  previousViolations: number = 0
): ViolationScore {
  // Base confidence on duration
  let confidenceScore = 0;
  let patternType: PatternType = 'accidental';
  let severity: ViolationScore['severity'] = 'low';
  let shouldDeductTime = false;
  let shouldAutoSubmit = false;
  let deductionMinutes = 0;
  let reasoning = '';

  if (durationSeconds <= 1.5) {
    confidenceScore = 20; // Low confidence - likely accidental
    patternType = 'accidental';
    severity = 'low';
    shouldDeductTime = true;
    deductionMinutes = isQuiz ? 2 : 5;
    reasoning = `Brief tab switch (${durationSeconds}s) - likely accidental`;
  } else if (durationSeconds <= 5) {
    confidenceScore = 45; // Medium confidence - suspicious
    patternType = 'suspicious';
    severity = 'medium';
    shouldDeductTime = true;
    deductionMinutes = isQuiz ? 5 : 10;
    reasoning = `Tab switch (${durationSeconds}s) - suspicious activity`;
  } else if (durationSeconds <= 15) {
    confidenceScore = 75; // High confidence - highly suspicious
    patternType = 'suspicious';
    severity = 'high';
    shouldDeductTime = true;
    deductionMinutes = isQuiz ? 10 : 15;
    reasoning = `Prolonged tab switch (${durationSeconds}s) - high-risk activity`;
  } else {
    confidenceScore = 95; // Intentional cheating - stayed away for too long
    patternType = 'intentional';
    severity = 'critical';
    shouldDeductTime = true;
    shouldAutoSubmit = true;
    deductionMinutes = isQuiz ? 15 : 20;
    reasoning = `Extremely prolonged tab switch (${durationSeconds}s) - intentional cheating detected`;
  }

  // Increase confidence based on previous violations
  if (previousViolations > 0) {
    confidenceScore = Math.min(100, confidenceScore + (previousViolations * 10));
    if (previousViolations >= 3) {
      patternType = 'intentional';
      severity = 'critical';
      shouldAutoSubmit = true;
    }
  }

  return {
    confidenceScore,
    patternType,
    severity,
    shouldDeductTime,
    shouldAutoSubmit,
    deductionMinutes,
    reasoning,
  };
}

/**
 * Calculate confidence score for mouse boundary exit
 */
export function calculateMouseBoundaryConfidence(
  exitCountInWindow: number,
  timeWindowSeconds: number = 30,
  previousViolations: number = 0
): ViolationScore {
  let confidenceScore = 0;
  let patternType: PatternType = 'accidental';
  let severity: ViolationScore['severity'] = 'low';
  let shouldDeductTime = false;
  let deductionMinutes = 0;
  let reasoning = '';

  // Require pattern detection (multiple exits)
  if (exitCountInWindow < 3) {
    confidenceScore = 15; // Very low confidence - likely accidental
    patternType = 'accidental';
    severity = 'low';
    shouldDeductTime = false;
    reasoning = `Only ${exitCountInWindow} edge exit(s) in ${timeWindowSeconds}s - normal navigation`;
  } else if (exitCountInWindow < 5) {
    confidenceScore = 50; // Medium confidence - suspicious pattern
    patternType = 'suspicious';
    severity = 'medium';
    shouldDeductTime = true;
    deductionMinutes = 5;
    reasoning = `${exitCountInWindow} edge exits in ${timeWindowSeconds}s - suspicious behavior`;
  } else {
    confidenceScore = 80; // High confidence - intentional exit pattern
    patternType = 'intentional';
    severity = 'high';
    shouldDeductTime = true;
    deductionMinutes = 10;
    reasoning = `${exitCountInWindow}+ edge exits in ${timeWindowSeconds}s - abnormal boundary violations`;
  }

  // Increase confidence based on previous violations
  if (previousViolations > 0) {
    confidenceScore = Math.min(100, confidenceScore + (previousViolations * 5));
  }

  return {
    confidenceScore,
    patternType,
    severity,
    shouldDeductTime,
    shouldAutoSubmit: false,
    deductionMinutes,
    reasoning,
    violationType: 'mouse_boundary_exit',
  };
}

/**
 * Calculate confidence score for screenshot attempt
 */
export function calculateScreenshotConfidence(
  method: 'PrintScreen' | 'SnippingTool' | 'Unknown',
  previousViolations: number = 0
): ViolationScore {
  let confidenceScore = 90; // High confidence - screenshots are intentional
  let patternType: PatternType = 'intentional';
  let severity: ViolationScore['severity'] = 'high';
  let shouldDeductTime = true;
  let deductionMinutes = 5;
  let reasoning = '';

  if (method === 'PrintScreen') {
    reasoning = 'PrintScreen key detected - intentional screenshot attempt';
  } else if (method === 'SnippingTool') {
    reasoning = 'Snipping Tool shortcut detected - intentional screenshot attempt';
  } else {
    reasoning = 'Screenshot attempt detected - intentional violation';
  }

  // Increase confidence based on previous violations
  if (previousViolations > 0) {
    confidenceScore = Math.min(100, confidenceScore + (previousViolations * 5));
    if (previousViolations >= 2) {
      severity = 'critical';
    }
  }

  return {
    confidenceScore,
    patternType,
    severity,
    shouldDeductTime,
    shouldAutoSubmit: false,
    deductionMinutes,
    reasoning,
    violationType: 'screenshot',
  };
}

/**
 * Calculate confidence score for copy/paste attempt
 */
export function calculateCopyPasteConfidence(
  action: 'copy' | 'paste' | 'cut',
  previousViolations: number = 0
): ViolationScore {
  let confidenceScore = 85; // High confidence - copy/paste is intentional
  let patternType: PatternType = 'intentional';
  let severity: ViolationScore['severity'] = 'medium';
  let shouldDeductTime = true;
  let deductionMinutes = 5;
  let reasoning = `${action} attempt detected - intentional violation`;

  // Increase confidence based on previous violations
  if (previousViolations > 0) {
    confidenceScore = Math.min(100, confidenceScore + (previousViolations * 5));
    if (previousViolations >= 3) {
      severity = 'high';
      deductionMinutes = 10;
    }
  }

  return {
    confidenceScore,
    patternType,
    severity,
    shouldDeductTime,
    shouldAutoSubmit: false,
    deductionMinutes,
    reasoning,
    violationType: 'copy_paste',
  };
}

/**
 * Calculate confidence score for fullscreen exit
 */
export function calculateFullscreenExitConfidence(
  previousViolations: number = 0,
  isQuiz: boolean = false
): ViolationScore {
  let confidenceScore = 75; // Medium-high confidence
  let patternType: PatternType = 'suspicious';
  let severity: ViolationScore['severity'] = 'medium';
  let shouldDeductTime = true;
  let deductionMinutes = isQuiz ? 5 : 10;
  let reasoning = 'Fullscreen mode exited - suspicious behavior';

  // Increase confidence based on previous violations
  if (previousViolations > 0) {
    confidenceScore = Math.min(100, confidenceScore + (previousViolations * 10));
    if (previousViolations >= 2) {
      patternType = 'intentional';
      severity = 'high';
    }
  }

  return {
    confidenceScore,
    patternType,
    severity,
    shouldDeductTime,
    shouldAutoSubmit: false,
    deductionMinutes,
    reasoning,
    violationType: 'fullscreen_exit',
  };
}

/**
 * Calculate confidence score for internet loss
 * Note: Internet loss should NOT be treated as cheating
 */
export function calculateInternetLossConfidence(
  durationSeconds: number,
): ViolationScore {
  let confidenceScore = 0; // Zero confidence for cheating
  let patternType: PatternType = 'accidental';
  let severity: ViolationScore['severity'] = 'low';
  let shouldDeductTime = false; // Never deduct for internet loss
  let shouldAutoSubmit = false;
  let deductionMinutes = 0;
  let reasoning = `Internet disconnected for ${durationSeconds}s - technical issue, not cheating`;

  return {
    confidenceScore,
    patternType,
    severity,
    shouldDeductTime,
    shouldAutoSubmit,
    deductionMinutes,
    reasoning,
    violationType: 'internet_loss',
  };
}

/**
 * Aggregate multiple violation scores to determine overall behavior
 */
export function aggregateViolationScores(scores: ViolationScore[]): {
  overallConfidence: number;
  overallPattern: PatternType;
  totalDeductionMinutes: number;
  shouldAutoSubmit: boolean;
  summary: string;
} {
  if (scores.length === 0) {
    return {
      overallConfidence: 0,
      overallPattern: 'accidental',
      totalDeductionMinutes: 0,
      shouldAutoSubmit: false,
      summary: 'No violations detected',
    };
  }

  // Identify unique indicators of cheating
  const uniqueTypes = new Set(scores.map(s => s.violationType).filter(Boolean));
  let finalConfidence = scores.reduce((sum, s) => sum + s.confidenceScore, 0) / scores.length;
  
  // Apply a bonus of +15% per additional unique cheating indicator to support multi-indicator detection
  // Skip boosting internet loss
  const hasCheatingIndicators = Array.from(uniqueTypes).some(t => t !== 'internet_loss');
  if (uniqueTypes.size > 1 && hasCheatingIndicators) {
    const cheatingTypesCount = Array.from(uniqueTypes).filter(t => t !== 'internet_loss').length;
    if (cheatingTypesCount > 1) {
      finalConfidence = Math.min(100, finalConfidence + (cheatingTypesCount - 1) * 15);
    }
  }

  const totalDeduction = scores.reduce((sum, s) => sum + s.deductionMinutes, 0);
  const hasAutoSubmit = scores.some(s => s.shouldAutoSubmit);

  // Determine overall pattern based on final confidence
  let overallPattern: PatternType = 'accidental';
  if (finalConfidence >= 70) overallPattern = 'intentional';
  else if (finalConfidence >= 40) overallPattern = 'suspicious';

  const summary = `${scores.length} violation(s) detected. Confidence: ${Math.round(finalConfidence)}%. Pattern: ${overallPattern}.`;

  return {
    overallConfidence: Math.round(finalConfidence),
    overallPattern,
    totalDeductionMinutes: totalDeduction,
    shouldAutoSubmit: hasAutoSubmit,
    summary,
  };
}
