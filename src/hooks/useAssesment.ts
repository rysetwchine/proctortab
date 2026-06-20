import { useContext } from 'react';
import { AssessmentContext } from '@/context/AssesmentContext';

export const useAssessment = () => {
  const context = useContext(AssessmentContext);
  if (!context) {
    throw new Error('useAssessment must be used within AssessmentProvider');
  }
  return context;
};


