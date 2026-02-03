
import { Pupil, Teacher, Subject, Timeslot } from './types';

export const SUBJECTS: Subject[] = ['Sains', 'Bahasa Inggeris', 'Matematik', 'Sejarah'];

export const TIMESLOTS: Timeslot[] = [
  '02:30 - 03:30 pm',
  '07:00 - 08:00 pm',
  '08:00 - 09:00 pm',
  '08:30 - 09:30 pm'
];

export const TEACHERS: Teacher[] = [
  { id: 't1', name: 'ALYSA JULIA ANAK THORNLEY' },
  { id: 't2', name: 'DAYANG ERINA NATASHA BINTI ABANG ABBEHA' },
  { id: 't3', name: 'DAVE BIN ASON' },
  { id: 't4', name: 'FAID BIN ZULKIFLI' },
  { id: 't5', name: 'GRACE ANAK KANA' },
  { id: 't6', name: 'JESSICA ANAK KATANG' },
  { id: 't7', name: 'MARIATI BINTI PADLAM' },
  { id: 't8', name: 'MUHAMMAD AIMAN CYPRIAN BIN MUHD NIZAM' },
  { id: 't9', name: 'RAFFI BIN SMAIL' },
  { id: 't10', name: 'RAZELI BIN SIRAT' },
  { id: 't11', name: 'REBENA BINTI ASIN' },
  { id: 't12', name: 'SAHARUDDIN BIN SAPIAE' },
  { id: 't13', name: 'IZWANSYAH BIN LAMUHAMMADE' }
].sort((a, b) => a.name.localeCompare(b.name));

export const RAW_PUPILS: Omit<Pupil, 'id'>[] = [
  // Tahun 1
  { year: 1, name: 'CLARARISSA LIVONIA BINTI LEHAN' },
  { year: 1, name: 'MIA ARIANA BINTI ANDUKHA ELRONDY' },
  { year: 1, name: 'DANIELSON BIN JASON' },
  // Tahun 2
  { year: 2, name: 'MELYSHA' },
  { year: 2, name: 'MICHAEL ABRAHAM MELKISEDEK' },
  { year: 2, name: 'NUR QYSSTINA QHAYSARA BINTI MOHD IQBAL QUSSYAIRI' },
  { year: 2, name: 'RAZIA ROSSA ANAK STEFFENS ANDY' },
  { year: 2, name: 'FARIZ NAUFAL BIN FIRDAUS AHSENG' },
  { year: 2, name: 'ASHRIQ AQIEL BIN RAZAN' },
  // Tahun 3
  { year: 3, name: 'RAYYEN HAYDEN BIN ALOYSIS' },
  { year: 3, name: 'LUCIA AMANDA BINTI ZUINI' },
  { year: 3, name: 'VELLVET GEORGIANA ZHI LIM' },
  { year: 3, name: 'KAYZILL KAYNOVIL BIN INI' },
  { year: 3, name: 'RACHELL ERCILIA' },
  // Tahun 4
  { year: 4, name: 'NUR FARINA BINTI ABDULLAH' },
  { year: 4, name: 'ABDULLAH HANIF BIN RAFFI' },
  { year: 4, name: 'CYRIL IGNATIUS BIN KALUNI' },
  { year: 4, name: 'MOHAMAD AADI PUTRA BIN ABDULLAH' },
  // Tahun 5
  { year: 5, name: 'ARMELLICIANA BINTI ARYANG' },
  { year: 5, name: 'JACKSON BIN JULUIENG' },
  { year: 5, name: 'JERALD DAMIAN BIN JASON' },
  { year: 5, name: 'KYRA KIRANA BINTI MAULANA' },
  { year: 5, name: 'VINCE DENZEL ZHEN LIM' },
  // Tahun 6
  { year: 6, name: 'DANNY ALVES BIN MAULANA' },
  { year: 6, name: 'KEARLY FAYREENDY BIN KENNEDY' },
  { year: 6, name: 'NUR ANISYA BINTI JAMEJAMY' },
  { year: 6, name: 'RACHEL JANE ANAK STEFFENS ANDY' }
];

// Processed pupils: added IDs and sorted alphabetically within years
export const PUPILS: Pupil[] = RAW_PUPILS
  .map((p, index) => ({ ...p, id: `p-${index}` }))
  .sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return a.name.localeCompare(b.name);
  });
