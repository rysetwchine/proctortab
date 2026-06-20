import { createContext, useState, useEffect, ReactNode } from 'react';
import { Question } from '@/types';

const ASSESSMENTS_STORAGE_KEY = 'proctortab_assessments';

export interface Assessment {
  id: string;
  title: string;
  duration: number;
  questions: Question[];
  status: 'draft' | 'active' | 'completed';
  createdAt: Date;
  totalStudents?: number;
}

interface AssessmentContextType {
  assessments: Assessment[];
  addAssessment: (assessment: Omit<Assessment, 'id' | 'createdAt'>) => void;
  updateAssessmentStatus: (id: string, status: Assessment['status']) => void;
  deleteAssessment: (id: string) => void;
}

// eslint-disable-next-line react-refresh/only-export-components
export const AssessmentContext = createContext<AssessmentContextType | undefined>(undefined);

function loadAssessmentsFromStorage(): Assessment[] {
  try {
    const raw = localStorage.getItem(ASSESSMENTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Array<Omit<Assessment, 'createdAt'> & { createdAt: string }>;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((a) => ({
      ...a,
      questions: Array.isArray(a.questions) ? a.questions : [],
      createdAt: a.createdAt ? new Date(a.createdAt) : new Date(),
    }));
  } catch {
    return [];
  }
}

export const AssessmentProvider = ({ children }: { children: ReactNode }) => {
  const [assessments, setAssessments] = useState<Assessment[]>(() => loadAssessmentsFromStorage());

  useEffect(() => {
    localStorage.setItem(ASSESSMENTS_STORAGE_KEY, JSON.stringify(assessments));
  }, [assessments]);

  const addAssessment = (assessment: Omit<Assessment, 'id' | 'createdAt'>) => {
    const newAssessment: Assessment = {
      ...assessment,
      id: `exam-${Date.now()}`,
      createdAt: new Date(),
    };
    setAssessments((prev) => [...prev, newAssessment]);
  };

  const updateAssessmentStatus = (id: string, status: Assessment['status']) => {
    setAssessments((prev) =>
      prev.map((assessment) =>
        assessment.id === id ? { ...assessment, status } : assessment
      )
    );
  };

  const deleteAssessment = (id: string) => {
    setAssessments((prev) => prev.filter((assessment) => assessment.id !== id));
  };

  return (
    <AssessmentContext.Provider
      value={{ assessments, addAssessment, updateAssessmentStatus, deleteAssessment }}
    >
      {children}
    </AssessmentContext.Provider>
  );
};
