import { Student } from '@/types';

export const mockStudents: Student[] = [
  {
    id: 'TA202300123',
    name: 'Jade Roa',
    course: 'BSIT-N001',
    violations: 1,
    status: 'warning',
  },
  {
    id: 'TA202300124',
    name: 'Marisa Tomo',
    course: 'BSIT-N001',
    violations: 0,
    status: 'active',
  },
  {
    id: 'TA202300125',
    name: 'Kristine Villasoto',
    course: 'BSIT-N002',
    violations: 0,
    status: 'active',
  },
  {
    id: 'TA202300126',
    name: 'Edrick Apaya',
    course: 'BSIT-N001',
    violations: 2,
    status: 'warning',
  },
  {
    id: 'TA202300127',
    name: 'DM Esplana',
    course: 'BSIT-N002',
    violations: 0,
    status: 'active',
  },
  {
    id: 'TA202300128',
    name: 'Jo-Ann Rosal',
    course: 'BSIT-N001',
    violations: 0,
    status: 'active',
  },
  {
    id: 'TA202300129',
    name: 'Francine Olivar',
    course: 'BSIT-N001',
    violations: 3,
    status: 'flagged',
  },
  {
    id: 'TA202300130',
    name: 'Brent Joseph Santos',
    course: 'BSIT-N003',
    violations: 1,
    status: 'warning',
  },
  {
    id: 'TA202300131',
    name: 'Christian Albert Moloboco',
    course: 'BSIT-N002',
    violations: 0,
    status: 'active',
  },
  {
    id: 'TA202300132',
    name: 'Angelie Benesano',
    course: 'BSIT-N003',
    violations: 0,
    status: 'active',
  },
];

export interface Report {
  id: string;
  examTitle: string;
  date: Date;
  totalStudents: number;
  averageScore: number;
  passRate: number;
  totalViolations: number;
}

export const mockReports: Report[] = [
  {
    id: 'rpt-001',
    examTitle: 'Data Structures Midterm',
    date: new Date('2026-03-25'),
    totalStudents: 25,
    averageScore: 82.5,
    passRate: 88,
    totalViolations: 12,
  },
  {
    id: 'rpt-002',
    examTitle: 'Database Fundamentals Quiz',
    date: new Date('2026-03-20'),
    totalStudents: 28,
    averageScore: 75.3,
    passRate: 82,
    totalViolations: 8,
  },
  {
    id: 'rpt-003',
    examTitle: 'Web Development Final',
    date: new Date('2026-03-15'),
    totalStudents: 30,
    averageScore: 88.7,
    passRate: 93,
    totalViolations: 5,
  },
  {
    id: 'rpt-004',
    examTitle: 'Programming Logic Test',
    date: new Date('2026-03-10'),
    totalStudents: 22,
    averageScore: 79.2,
    passRate: 86,
    totalViolations: 15,
  },
];
