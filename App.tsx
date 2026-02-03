import React, { useState, useMemo, useRef, useEffect } from 'react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { 
  PUPILS, 
  TEACHERS, 
  SUBJECTS, 
  TIMESLOTS 
} from './constants';
import { Subject, Timeslot, SavedReport, SubjectStats } from './types';

// URL Google Apps Script yang telah di-deploy
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzcwYvFACKA0E08QH8P6Gqbb-P_azjiaF_DF0RIFIDd36HF2jtV6c8LhKF9PG0Pa_59Nw/exec"; 

interface Notification {
  id: string;
  message: string;
  type: 'success' | 'info' | 'error';
}

const App: React.FC = () => {
  // Navigation state
  const [activeTab, setActiveTab] = useState<'record' | 'preview' | 'history' | 'analytics'>('record');
  
  // Dashboard state (Current Session)
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>('');
  const [selectedSubject, setSelectedSubject] = useState<Subject | ''>('');
  const [selectedTimeslot, setSelectedTimeslot] = useState<Timeslot | ''>('');
  const [attendance, setAttendance] = useState<Record<string, boolean>>({});
  
  // UI state
  const [expandedYear, setExpandedYear] = useState<number | null>(null);
  const [analyticsYear, setAnalyticsYear] = useState<number>(new Date().getFullYear());
  const [analyticsMonth, setAnalyticsMonth] = useState<number>(new Date().getMonth());
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isSavingToCloud, setIsSavingToCloud] = useState(false);

  // Persistence state
  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
  const [isExporting, setIsExporting] = useState(false);

  // Refs
  const reportRef = useRef<HTMLDivElement>(null);
  const analyticsReportRef = useRef<HTMLDivElement>(null);

  // Load from localStorage on mount
  useEffect(() => {
    const data = localStorage.getItem('sk_attendance_history_v2');
    if (data) {
      try {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) {
          setSavedReports(parsed);
        }
      } catch (e) {
        console.error("Failed to load history", e);
      }
    }
    setHasLoaded(true);
  }, []);

  // Sync state to localStorage ONLY after initial load has completed
  useEffect(() => {
    if (hasLoaded) {
      localStorage.setItem('sk_attendance_history_v2', JSON.stringify(savedReports));
    }
  }, [savedReports, hasLoaded]);

  // Derived state for current session
  const teacherName = useMemo(() => 
    TEACHERS.find(t => t.id === selectedTeacherId)?.name || 'Tiada Guru Dipilih', 
  [selectedTeacherId]);

  const formattedDate = useMemo(() => {
    if (!selectedDate) return 'N/A';
    return new Date(selectedDate).toLocaleDateString('ms-MY', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });
  }, [selectedDate]);

  const totalPresent = useMemo(() => 
    Object.values(attendance).filter(val => val).length, 
  [attendance]);

  // Notification helper
  const addNotification = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
    const id = Math.random().toString(36).substring(2, 9);
    setNotifications(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 4000);
  };

  // Analytics Calculation
  const stats = useMemo(() => {
    const filterByMonth = (r: SavedReport) => {
      const d = new Date(r.date);
      return d.getFullYear() === analyticsYear && d.getMonth() === analyticsMonth;
    };

    const filterByYear = (r: SavedReport) => {
      return new Date(r.date).getFullYear() === analyticsYear;
    };

    const calculate = (reports: SavedReport[]): SubjectStats[] => {
      return SUBJECTS.map(subject => {
        const subReports = reports.filter(r => r.subject === subject);
        const totalPresentInSubject = subReports.reduce((acc, r) => acc + r.totalPresent, 0);
        const totalPossibleInSubject = subReports.length * PUPILS.length;
        return {
          subject,
          totalPresent: totalPresentInSubject,
          totalPossible: totalPossibleInSubject,
          percentage: totalPossibleInSubject > 0 ? Math.round((totalPresentInSubject / totalPossibleInSubject) * 100) : 0,
          sessionCount: subReports.length
        };
      });
    };

    return {
      monthly: calculate(savedReports.filter(filterByMonth)),
      yearly: calculate(savedReports.filter(filterByYear))
    };
  }, [savedReports, analyticsYear, analyticsMonth]);

  // Attendance logic
  const toggleAttendance = (pupilId: string) => {
    setAttendance(prev => ({ ...prev, [pupilId]: !prev[pupilId] }));
  };

  const selectAllInYear = (year: number) => {
    const newState = { ...attendance };
    PUPILS.filter(p => p.year === year).forEach(p => newState[p.id] = true);
    setAttendance(newState);
    addNotification(`Semua murid Tahun ${year} ditanda hadir.`, 'info');
  };

  const deselectAllInYear = (year: number) => {
    const newState = { ...attendance };
    PUPILS.filter(p => p.year === year).forEach(p => newState[p.id] = false);
    setAttendance(newState);
    addNotification(`Kehadiran Tahun ${year} telah diset semula.`, 'info');
  };

  // Actions
  const handleSaveSession = async () => {
    if (!selectedTeacherId || !selectedSubject || !selectedTimeslot) {
      addNotification("Sila pilih Guru, Subjek, dan Slot Masa.", "error");
      return;
    }

    const reportId = Date.now().toString();
    const timestampStr = new Date().toLocaleTimeString('ms-MY');

    const newReport: SavedReport = {
      id: reportId,
      date: selectedDate,
      timestamp: timestampStr,
      teacherId: selectedTeacherId,
      teacherName,
      subject: selectedSubject as Subject,
      timeslot: selectedTimeslot as Timeslot,
      attendance: { ...attendance },
      totalPresent
    };

    // Prepare data for Google Sheets
    const pupilData = PUPILS.map(p => ({
      name: p.name,
      year: p.year,
      isPresent: !!attendance[p.id]
    }));

    setIsSavingToCloud(true);
    
    // Save locally first
    setSavedReports(prev => [newReport, ...prev]);
    addNotification(`Rekod disimpan secara lokal!`, "info");

    // Save to Google Sheets if URL provided
    if (GOOGLE_SCRIPT_URL) {
      try {
        const response = await fetch(GOOGLE_SCRIPT_URL, {
          method: 'POST',
          mode: 'no-cors', // Apps Script requires no-cors often or handles it via redirect
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...newReport,
            pupilData
          })
        });
        addNotification(`Berjaya dihantar ke Google Sheets!`, "success");
      } catch (error) {
        console.error("Cloud save failed", error);
        addNotification("Gagal simpan ke awan, tetapi disimpan di peranti.", "error");
      }
    } else {
      addNotification("URL Google Script tidak ditetapkan. Data hanya disimpan di peranti ini.", "info");
    }

    setIsSavingToCloud(false);
  };

  const exportPDF = async (ref: React.RefObject<HTMLDivElement | null>, filename: string) => {
    if (!ref.current) return;
    setIsExporting(true);
    addNotification("Menjana PDF, sila tunggu...", "info");
    try {
      const canvas = await html2canvas(ref.current, { scale: 2 });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const width = pdf.internal.pageSize.getWidth();
      const height = (canvas.height * width) / canvas.width;
      pdf.addImage(imgData, 'PNG', 0, 0, width, height);
      pdf.save(filename);
      addNotification("PDF berjaya dimuat turun!", "success");
    } catch (e) {
      console.error(e);
      addNotification("Gagal menjana PDF.", "error");
    } finally {
      setIsExporting(false);
    }
  };

  const deleteFromHistory = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (window.confirm("Padam rekod ini secara kekal?")) {
      const updated = savedReports.filter(r => r.id !== id);
      setSavedReports(updated);
      addNotification("Rekod telah dipadam daripada sejarah.", "info");
    }
  };

  const handleClearHistory = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm("Padam SEMUA rekod sejarah? Tindakan ini tidak boleh dibatalkan.")) {
      setSavedReports([]);
      addNotification("Semua rekod sejarah telah dikosongkan.", "info");
    }
  };

  const BarChart = ({ data, colorClass = "bg-indigo-600" }: { data: SubjectStats[], colorClass?: string }) => (
    <div className="space-y-6">
      <div className="flex items-end gap-4 h-64 border-b-2 border-slate-200 pb-2 relative pt-12 px-4">
        {data.map((s, idx) => (
          <div key={idx} className="flex-1 flex flex-col items-center group relative h-full justify-end">
            <div 
              className={`w-full ${colorClass} rounded-t-lg transition-all duration-700 ease-out shadow-lg shadow-indigo-100 group-hover:opacity-80`}
              style={{ height: `${Math.max(s.percentage, 2)}%` }}
            >
              <div className="absolute -top-8 left-1/2 -translate-x-1/2 text-[10px] font-black text-slate-700 bg-white border border-slate-200 px-2 py-1 rounded shadow-sm opacity-0 group-hover:opacity-100 transition-opacity z-10 whitespace-nowrap">
                {s.percentage}% ({s.totalPresent}/{s.totalPossible})
              </div>
            </div>
            <div className="mt-4 text-[9px] font-black text-slate-400 uppercase tracking-tighter text-center h-10 flex items-center justify-center leading-tight">
              {s.subject}
            </div>
          </div>
        ))}
        <div className="absolute -left-2 top-0 bottom-0 flex flex-col justify-between text-[10px] font-black text-slate-300 pointer-events-none pr-2">
          <span>100%</span>
          <span>75%</span>
          <span>50%</span>
          <span>25%</span>
          <span>0%</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* Toast Notifications */}
      <div className="fixed top-6 right-6 z-[100] flex flex-col gap-3 w-80 pointer-events-none">
        {notifications.map(n => (
          <div 
            key={n.id} 
            className={`pointer-events-auto p-4 rounded-2xl shadow-2xl border flex items-start gap-3 animate-in slide-in-from-right-10 fade-in duration-300 backdrop-blur-md
              ${n.type === 'success' ? 'bg-emerald-50/90 border-emerald-200 text-emerald-900' : 
                n.type === 'error' ? 'bg-rose-50/90 border-rose-200 text-rose-900' : 
                'bg-white/90 border-slate-200 text-slate-900'}`}
          >
            <span className="text-xl">
              {n.type === 'success' ? '✅' : n.type === 'error' ? '⚠️' : 'ℹ️'}
            </span>
            <div className="flex-1">
              <p className="text-sm font-bold leading-tight">{n.message}</p>
            </div>
            <button onClick={() => setNotifications(prev => prev.filter(x => x.id !== n.id))} className="text-slate-400 hover:text-slate-600">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
          </div>
        ))}
      </div>

      <header className="bg-indigo-800 text-white shadow-xl px-6 py-5 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="text-center md:text-left">
            <h1 className="text-2xl font-black tracking-tight leading-none">SK KG KLID/PLAJAU</h1>
            <p className="text-indigo-300 text-xs font-bold uppercase tracking-widest mt-1">Dashboard Kehadiran • Kelas Gilap Permata</p>
          </div>

          <div className="flex bg-indigo-900/50 p-1 rounded-2xl border border-indigo-700/50 backdrop-blur-md overflow-x-auto max-w-full">
            {[
              { id: 'record', label: 'Rekod', icon: '📝' },
              { id: 'preview', label: 'Pratonton', icon: '📄' },
              { id: 'history', label: 'Sejarah', icon: '📚' },
              { id: 'analytics', label: 'Analisis', icon: '📊' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-5 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 whitespace-nowrap
                  ${activeTab === tab.id 
                    ? 'bg-white text-indigo-900 shadow-lg scale-105' 
                    : 'text-indigo-200 hover:text-white hover:bg-indigo-700/30'}`}
              >
                <span className="text-sm">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto p-6 lg:p-10">
        
        {/* RECORD TAB */}
        {activeTab === 'record' && (
          <div className="space-y-8 animate-in fade-in duration-500">
            <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200 grid grid-cols-1 md:grid-cols-4 gap-8">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Tarikh Sesi</label>
                <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-slate-700 outline-none focus:border-indigo-500 transition-colors" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Guru</label>
                <select value={selectedTeacherId} onChange={(e) => setSelectedTeacherId(e.target.value)} className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-slate-700 outline-none focus:border-indigo-500 transition-colors">
                  <option value="">Pilih Guru</option>
                  {TEACHERS.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Subjek</label>
                <select value={selectedSubject} onChange={(e) => setSelectedSubject(e.target.value as Subject)} className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-slate-700 outline-none focus:border-indigo-500 transition-colors">
                  <option value="">Pilih Subjek</option>
                  {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Slot Masa</label>
                <select value={selectedTimeslot} onChange={(e) => setSelectedTimeslot(e.target.value as Timeslot)} className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-slate-700 outline-none focus:border-indigo-500 transition-colors">
                  <option value="">Pilih Slot Masa</option>
                  {TIMESLOTS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 max-w-4xl mx-auto">
              {[1, 2, 3, 4, 5, 6].map(year => {
                const isExpanded = expandedYear === year;
                const yearPupils = PUPILS.filter(p => p.year === year);
                const presentInYear = yearPupils.filter(p => attendance[p.id]).length;
                return (
                  <div key={year} className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden flex flex-col transition-all">
                    <button onClick={() => setExpandedYear(isExpanded ? null : year)} className={`w-full px-8 py-6 flex justify-between items-center transition-colors ${isExpanded ? 'bg-indigo-50/30' : 'hover:bg-slate-50'}`}>
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-black ${isExpanded ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-100 text-slate-600'}`}>{year}</div>
                        <div className="text-left">
                          <h3 className="font-black text-slate-800">Tahun {year}</h3>
                          <p className="text-[10px] font-bold text-slate-400 uppercase">{presentInYear} / {yearPupils.length} Hadir</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="hidden sm:flex gap-2">
                          <button onClick={(e) => { e.stopPropagation(); selectAllInYear(year); }} className="text-[10px] font-black uppercase text-indigo-600 border border-indigo-100 px-3 py-1 rounded-full bg-white hover:bg-indigo-50">Semua</button>
                          <button onClick={(e) => { e.stopPropagation(); deselectAllInYear(year); }} className="text-[10px] font-black uppercase text-rose-500 border border-rose-100 px-3 py-1 rounded-full bg-white hover:bg-rose-50">Reset</button>
                        </div>
                        <svg className={`w-6 h-6 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7"></path></svg>
                      </div>
                    </button>
                    {isExpanded && (
                      <div className="px-8 pb-8 animate-in slide-in-from-top-4 duration-300">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4 border-t border-slate-100 pt-6">
                          {yearPupils.map(p => (
                            <label key={p.id} className={`flex items-center p-4 rounded-2xl cursor-pointer transition-all border-2 ${attendance[p.id] ? 'bg-indigo-50 border-indigo-200' : 'bg-slate-50/30 border-transparent hover:border-slate-100'}`}>
                              <input type="checkbox" checked={!!attendance[p.id]} onChange={() => toggleAttendance(p.id)} className="h-6 w-6 appearance-none rounded-lg border-2 border-slate-300 checked:bg-indigo-600 transition-all cursor-pointer" />
                              <span className={`ml-4 text-sm font-bold ${attendance[p.id] ? 'text-indigo-900 font-extrabold' : 'text-slate-600'}`}>{p.name}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            
            <div className="flex justify-center pt-8">
              <button onClick={() => { setActiveTab('preview'); window.scrollTo(0, 0); }} className="px-12 py-5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full font-black shadow-2xl active:scale-95 transition-all flex items-center gap-3">
                Teruskan ke Pratonton & Simpan
              </button>
            </div>
          </div>
        )}

        {/* PREVIEW TAB */}
        {activeTab === 'preview' && (
          <div className="max-w-4xl mx-auto space-y-10 animate-in slide-in-from-bottom-6 duration-500">
            <div className="bg-white p-6 rounded-3xl border border-slate-200 flex flex-col sm:flex-row justify-between items-center gap-4">
              <div className="text-center sm:text-left">
                <h2 className="text-xl font-black text-slate-800">Pratonton Sesi</h2>
                <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">{selectedSubject || 'Tiada Subjek'} • {formattedDate}</p>
              </div>
              <div className="flex gap-3">
                <button 
                  onClick={handleSaveSession} 
                  disabled={isSavingToCloud}
                  className="px-6 py-3 bg-indigo-600 text-white rounded-2xl font-black shadow-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {isSavingToCloud ? 'Menyimpan...' : 'Simpan Sesi'}
                </button>
                <button onClick={() => exportPDF(reportRef, `Kehadiran_${selectedDate}_${selectedSubject}.pdf`)} disabled={isExporting} className="px-6 py-3 bg-emerald-600 text-white rounded-2xl font-black shadow-lg hover:bg-emerald-700 transition-colors disabled:opacity-50">Muat Turun PDF</button>
              </div>
            </div>

            <div className="bg-white shadow-2xl rounded-[2.5rem] border border-slate-200 overflow-hidden ring-8 ring-slate-100">
              <div ref={reportRef} className="p-16 bg-white min-h-[1000px] text-slate-900">
                <div className="border-b-8 border-indigo-700 pb-10 mb-12 flex justify-between items-end">
                  <div className="space-y-1">
                    <h1 className="text-4xl font-black text-indigo-900 uppercase tracking-tighter">Rekod Kehadiran</h1>
                    <p className="text-xl font-bold text-slate-500">SK KG KLID/PLAJAU</p>
                    <p className="text-lg font-medium text-slate-400">Kelas Bimbingan dan Gilap Permata</p>
                  </div>
                  <div className="text-right">
                    <div className="bg-indigo-50 px-4 py-2 rounded-xl mb-1"><p className="text-xl font-black text-indigo-700 leading-none">{formattedDate}</p></div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tarikh Laporan</p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-8 mb-12 bg-slate-50 p-10 rounded-3xl border-2 border-slate-100">
                  <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Guru</p><p className="text-lg font-black leading-tight">{teacherName}</p></div>
                  <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Subjek</p><p className="text-lg font-black text-indigo-700 leading-tight">{selectedSubject || 'N/A'}</p></div>
                  <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Slot Masa</p><p className="text-lg font-black leading-tight">{selectedTimeslot || 'N/A'}</p></div>
                </div>

                <div className="grid grid-cols-2 gap-x-12 gap-y-10">
                  {[1, 2, 3, 4, 5, 6].map(year => (
                    <div key={year} className="break-inside-avoid">
                      <div className="flex items-center gap-3 mb-4"><span className="bg-indigo-700 text-white text-[10px] font-black px-2 py-1 rounded">TAHUN {year}</span><div className="h-[2px] flex-1 bg-slate-100"></div></div>
                      <div className="space-y-2">
                        {PUPILS.filter(p => p.year === year).map(p => (
                          <div key={p.id} className="flex items-center justify-between border-b border-slate-50 pb-1">
                            <span className={`text-[11px] font-bold ${attendance[p.id] ? 'text-slate-800 font-extrabold' : 'text-slate-300'}`}>{p.name}</span>
                            <div className={`w-3 h-3 rounded-full ${attendance[p.id] ? 'bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]' : 'bg-slate-100'}`}></div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-20 pt-10 border-t-2 border-slate-100 flex flex-wrap justify-between items-end gap-12">
                  <div className="w-56 border-b-2 border-slate-200 pb-2 flex flex-col">
                    <span className="text-[10px] font-black text-slate-300 italic mb-4">Disediakan oleh:</span>
                    <p className="text-[11px] font-black text-slate-500 uppercase">({teacherName})</p>
                    <p className="text-[9px] font-bold text-slate-300 mt-1">Guru Bertugas</p>
                  </div>
                  
                  <div className="w-56 border-b-2 border-slate-200 pb-2 flex flex-col">
                    <span className="text-[10px] font-black text-slate-300 italic mb-4">Disemak oleh:</span>
                    <p className="text-[11px] font-black text-slate-500 uppercase">(ENCIK RAFFI BIN SMAIL)</p>
                    <p className="text-[9px] font-bold text-slate-300 mt-1 leading-tight">Penolong Kanan Pentadbiran dan Akademik</p>
                    <p className="text-[8px] font-black text-slate-300 uppercase mt-0.5 tracking-tighter">SK KG KLID/PLAJAU, DALAT</p>
                  </div>

                  <div className="w-56 border-b-2 border-slate-200 pb-2 flex flex-col">
                    <span className="text-[10px] font-black text-slate-300 italic mb-4">Disahkan oleh:</span>
                    <p className="text-[11px] font-black text-slate-500 uppercase">(ENCIK RAZELI BIN SIRAT)</p>
                    <p className="text-[9px] font-bold text-slate-300 mt-1 leading-tight">Guru Besar</p>
                    <p className="text-[8px] font-black text-slate-300 uppercase mt-0.5 tracking-tighter">SK KG KLID/PLAJAU, DALAT</p>
                  </div>

                  <div className="text-right flex-1 min-w-[120px]">
                    <p className="text-4xl font-black text-indigo-900 leading-none">{totalPresent} <span className="text-xl text-slate-300 font-bold">/ {PUPILS.length}</span></p>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2">Jumlah Murid Hadir</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* HISTORY TAB */}
        {activeTab === 'history' && (
          <div className="space-y-8 animate-in slide-in-from-right-8 duration-500">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-black text-slate-800">Sejarah Rekod</h2>
                <p className="text-slate-500 text-sm font-medium">Senarai semua sesi kehadiran yang telah disimpan.</p>
              </div>
              {savedReports.length > 0 && (
                <button onClick={(e) => handleClearHistory(e)} className="px-4 py-2 bg-rose-50 text-rose-600 rounded-xl text-xs font-black hover:bg-rose-100 transition-colors flex items-center gap-2">
                  🗑️ Kosongkan Sejarah
                </button>
              )}
            </div>
            {savedReports.length === 0 ? (
              <div className="bg-white p-32 text-center rounded-[3rem] border-4 border-dashed border-slate-200 text-slate-400 font-bold">
                Tiada rekod ditemui. Sila rekod kehadiran di tab pertama.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {savedReports.map(report => (
                  <div key={report.id} className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200 hover:shadow-xl transition-all group relative overflow-hidden">
                    <div className="flex justify-between items-start mb-4">
                      <span className="bg-indigo-100 text-indigo-700 text-[10px] font-black px-3 py-1 rounded-lg uppercase tracking-widest">{report.subject}</span>
                      <button onClick={(e) => deleteFromHistory(e, report.id)} className="text-rose-400 hover:text-rose-600 transition-colors p-2 rounded-lg hover:bg-rose-50 bg-slate-50 border border-slate-100">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                      </button>
                    </div>
                    <h4 className="text-2xl font-black text-slate-800 leading-none mb-1">{new Date(report.date).toLocaleDateString('ms-MY', { day: '2-digit', month: 'short', year: 'numeric' })}</h4>
                    <p className="text-xs font-bold text-slate-400 uppercase mb-6 tracking-wider">{report.timeslot}</p>
                    <div className="space-y-2 mb-6 text-xs font-bold text-slate-500">
                      <div className="flex items-center gap-2">✅ <span className="text-slate-700">{report.totalPresent} / {PUPILS.length} Hadir</span></div>
                      <div className="flex items-center gap-2">👤 <span className="text-slate-400 italic">{report.teacherName}</span></div>
                    </div>
                    <button onClick={() => { setSelectedDate(report.date); setSelectedTeacherId(report.teacherId); setSelectedSubject(report.subject); setSelectedTimeslot(report.timeslot); setAttendance(report.attendance); setActiveTab('preview'); window.scrollTo(0,0); }} className="w-full py-4 bg-slate-50 hover:bg-indigo-600 hover:text-white text-indigo-600 rounded-2xl font-black transition-all border border-slate-100 group-hover:border-indigo-600 shadow-sm">Lihat Perincian Rekod</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ANALYTICS TAB */}
        {activeTab === 'analytics' && (
          <div className="space-y-10 animate-in fade-in duration-500">
            {/* Filter Controls */}
            <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200 flex flex-col md:flex-row gap-8 items-end justify-between">
              <div className="flex gap-6 w-full md:w-auto">
                <div className="space-y-2 flex-1 md:w-32">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pilih Tahun</label>
                  <select 
                    value={analyticsYear} 
                    onChange={(e) => setAnalyticsYear(Number(e.target.value))}
                    className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-slate-700 focus:border-indigo-500 outline-none"
                  >
                    {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                <div className="space-y-2 flex-1 md:w-48">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pilih Bulan</label>
                  <select 
                    value={analyticsMonth} 
                    onChange={(e) => setAnalyticsMonth(Number(e.target.value))}
                    className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-slate-700 focus:border-indigo-500 outline-none"
                  >
                    {Array.from({ length: 12 }).map((_, i) => (
                      <option key={i} value={i}>{new Date(0, i).toLocaleString('ms-MY', { month: 'long' })}</option>
                    ))}
                  </select>
                </div>
              </div>
              <button 
                onClick={() => exportPDF(analyticsReportRef, `Analisis_Kehadiran_${analyticsYear}_Bulan_${analyticsMonth + 1}.pdf`)}
                disabled={isExporting}
                className="px-8 py-4 bg-indigo-600 text-white rounded-2xl font-black shadow-lg flex items-center gap-3 w-full md:w-auto justify-center hover:bg-indigo-700 transition-colors disabled:opacity-50"
              >
                💾 Simpan Laporan Analisis PDF
              </button>
            </div>

            <div className="bg-white shadow-xl rounded-[2.5rem] border border-slate-200 overflow-hidden ring-8 ring-slate-100">
              <div ref={analyticsReportRef} className="p-16 bg-white min-h-[800px] text-slate-900">
                <div className="mb-12 border-b-4 border-slate-100 pb-8">
                  <h2 className="text-4xl font-black text-indigo-900 uppercase tracking-tighter leading-none mb-2">Analisis Prestasi Subjek</h2>
                  <p className="text-xl font-bold text-slate-400">SK KG KLID/PLAJAU • {new Date(0, analyticsMonth).toLocaleString('ms-MY', { month: 'long' })} {analyticsYear}</p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
                  {/* Monthly Section */}
                  <div className="space-y-8">
                    <div className="border-l-8 border-indigo-700 pl-6 flex justify-between items-end">
                      <div>
                        <h3 className="text-2xl font-black text-slate-800">Kehadiran Subjek Bulanan</h3>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pecahan Mengikut Subjek</p>
                      </div>
                      <span className="text-[10px] font-black bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full uppercase">Bulanan</span>
                    </div>
                    
                    <div className="bg-slate-50/50 p-6 rounded-[2rem] border border-slate-100">
                      <BarChart data={stats.monthly} colorClass="bg-indigo-600" />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      {stats.monthly.map(s => (
                        <div key={s.subject} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1">{s.subject}</p>
                          <div className="flex items-baseline gap-2">
                            <p className="text-2xl font-black text-indigo-700">{s.percentage}%</p>
                            <p className="text-[10px] text-slate-400 font-bold">({s.totalPresent}/{s.totalPossible})</p>
                          </div>
                          <p className="text-[10px] text-slate-300 font-black mt-2 uppercase tracking-tighter">{s.sessionCount} Kelas Direkodkan</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Yearly Summary Section */}
                  <div className="space-y-8">
                    <div className="border-l-8 border-emerald-500 pl-6 flex justify-between items-end">
                      <div>
                        <h3 className="text-2xl font-black text-slate-800">Kehadiran Subjek Tahunan</h3>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Ringkasan Tahunan {analyticsYear}</p>
                      </div>
                      <span className="text-[10px] font-black bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full uppercase">Tahunan</span>
                    </div>

                    <div className="bg-emerald-50/20 p-6 rounded-[2rem] border border-emerald-50">
                      <BarChart data={stats.yearly} colorClass="bg-emerald-500" />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      {stats.yearly.map(s => (
                        <div key={s.subject} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1">{s.subject}</p>
                          <div className="flex items-baseline gap-2">
                            <p className="text-2xl font-black text-emerald-600">{s.percentage}%</p>
                            <p className="text-[10px] text-slate-400 font-bold">({s.totalPresent}/{s.totalPossible})</p>
                          </div>
                          <p className="text-[10px] text-slate-300 font-black mt-2 uppercase tracking-tighter">{s.sessionCount} Jumlah Sesi</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-24 pt-10 border-t-2 border-slate-100 flex flex-wrap justify-between items-end bg-slate-50 -mx-16 -mb-16 p-16 gap-12">
                  <div className="w-64 border-b-2 border-slate-200 pb-2 flex flex-col">
                    <span className="text-[10px] font-black text-slate-300 italic mb-4">Disemak oleh:</span>
                    <p className="text-xs font-black text-slate-400 uppercase">(ENCIK RAFFI BIN SMAIL)</p>
                    <p className="text-[9px] font-bold text-slate-300 mt-1 leading-tight">Penolong Kanan Pentadbiran dan Akademik</p>
                    <p className="text-[8px] font-black text-slate-300 uppercase mt-0.5 tracking-tighter">SK KG KLID/PLAJAU, DALAT</p>
                  </div>

                  <div className="w-64 border-b-2 border-slate-200 pb-2 flex flex-col">
                    <span className="text-[10px] font-black text-slate-300 italic mb-4">Disahkan oleh:</span>
                    <p className="text-xs font-black text-slate-400 uppercase">(ENCIK RAZELI BIN SIRAT)</p>
                    <p className="text-[9px] font-bold text-slate-300 mt-1 leading-tight">Guru Besar</p>
                    <p className="text-[8px] font-black text-slate-300 uppercase mt-0.5 tracking-tighter">SK KG KLID/PLAJAU, DALAT</p>
                  </div>
                  
                  <div className="text-right flex-1 min-w-[200px]">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Purata Kadar Kehadiran Tahunan</p>
                    <div className="flex items-baseline justify-end gap-3">
                      <p className="text-5xl font-black text-indigo-900 leading-none">
                        {stats.yearly.length > 0 && stats.yearly.some(s => s.sessionCount > 0) 
                          ? Math.round(stats.yearly.reduce((acc, s) => acc + s.percentage, 0) / stats.yearly.filter(s => s.sessionCount > 0).length || 1) 
                          : 0}%
                      </p>
                      <span className="text-sm font-black text-slate-300 uppercase">Jumlah Keseluruhan</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Floating Action Bar (Record Tab Only) */}
      {activeTab === 'record' && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-full max-w-xl px-4 z-50">
          <div className="bg-white/90 backdrop-blur-xl border border-slate-200 p-5 rounded-[2.5rem] shadow-2xl flex justify-between items-center ring-8 ring-indigo-500/5">
             <div className="flex gap-8 px-4">
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Subjek</p>
                  <p className="text-xs font-black text-indigo-700 truncate max-w-[120px] uppercase">{selectedSubject || 'Tiada'}</p>
                </div>
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Jumlah Hadir</p>
                  <p className="text-xl font-black text-emerald-600 leading-none">
                    {totalPresent} <span className="text-slate-300 text-xs">/ {PUPILS.length}</span>
                  </p>
                </div>
             </div>
             <button onClick={() => { setActiveTab('preview'); window.scrollTo(0,0); }} className="bg-indigo-600 text-white px-8 py-4 rounded-full font-black text-xs shadow-xl shadow-indigo-100 hover:bg-indigo-700 hover:scale-105 active:scale-95 transition-all flex items-center gap-2">
                Pratonton Laporan
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
             </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;