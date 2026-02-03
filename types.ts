
export interface Pupil {
  id: string;
  name: string;
  year: number;
}

export interface Teacher {
  id: string;
  name: string;
}

export interface AttendanceRecord {
  pupilId: string;
  isPresent: boolean;
}

export interface SavedReport {
  id: string;
  date: string; // ISO format: YYYY-MM-DD
  timestamp: string;
  teacherId: string;
  teacherName: string;
  subject: Subject;
  timeslot: Timeslot;
  attendance: Record<string, boolean>;
  totalPresent: number;
}

export interface SubjectStats {
  subject: Subject;
  totalPresent: number;
  totalPossible: number;
  percentage: number;
  sessionCount: number;
}

export type Subject = 'Sains' | 'Bahasa Inggeris' | 'Matematik' | 'Sejarah';

export type Timeslot = '02:30 - 03:30 pm' | '07:00 - 08:00 pm' | '08:00 - 09:00 pm' | '08:30 - 09:30 pm';
