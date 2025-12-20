import React, { useState, useEffect, useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line 
} from 'recharts';
import { 
  LayoutDashboard, Upload, Filter, TrendingUp, TrendingDown, 
  Users, Car, DollarSign, ChevronDown, FileSpreadsheet, 
  ArrowUpRight, ArrowDownRight, 
  Clock, X, CheckCircle, Download, Trash2, Calendar, AlertTriangle, Database, HardDrive, UserCheck, Cloud, CloudOff
} from 'lucide-react';

/**
 * Using esm.sh to import Supabase directly in the browser environment.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';

// --- CONFIGURATION & SETUP ---
let supabase = null;

const getEnv = (key) => {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) {
      return import.meta.env[key];
    }
  } catch (e) {}
  return (typeof window !== 'undefined' ? window[key] : '') || '';
};

const supabaseUrl = getEnv('VITE_SUPABASE_URL');
const supabaseAnonKey = getEnv('VITE_SUPABASE_ANON_KEY');

try {
  if (supabaseUrl && supabaseAnonKey) {
    supabase = createClient(supabaseUrl, supabaseAnonKey);
  }
} catch (e) {
  console.error("Supabase Initialization Error:", e);
}

// --- STYLES ---
const GlobalStyles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
    
    body {
      font-family: 'Inter', sans-serif;
      background-color: #f1f5f9;
      color: #0f172a;
    }

    ::-webkit-scrollbar { width: 4px; height: 4px; }
    ::-webkit-scrollbar-track { background: #f1f5f9; }
    ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
    
    .animate-fade-in { animation: fadeIn 0.2s ease-out forwards; }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    
    .comparison-toggle {
      display: flex;
      background: #e2e8f0;
      padding: 2px;
      border-radius: 6px;
      cursor: pointer;
    }
    
    .comparison-toggle-item {
      padding: 3px 8px;
      font-size: 9px;
      font-weight: 800;
      border-radius: 4px;
      transition: all 0.15s ease;
    }
    
    .comparison-toggle-active {
      background: white;
      color: #2563eb;
      box-shadow: 0 1px 2px rgba(0,0,0,0.1);
    }

    .card-shadow {
      box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1);
    }
    
    .no-scrollbar::-webkit-scrollbar { display: none; }
  `}</style>
);

const COLORS = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#f97316'];

// --- HELPERS ---
const parseCSV = (text) => {
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length < 2) return { headers: [], rows: [] };
  
  const parseLine = (line) => {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') { inQuotes = !inQuotes; }
      else if (char === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
      else { current += char; }
    }
    result.push(current.trim());
    return result;
  };

  let headerIndex = 0;
  for (let i = 0; i < Math.min(lines.length, 20); i++) {
    const rawLine = lines[i].toLowerCase();
    const keywords = ['id', 'lead id', 'order number', 'vin', 'vehicle identification number', 'dealer code'];
    if (keywords.some(k => rawLine.includes(k))) {
      headerIndex = i;
      break;
    }
  }

  const rawHeaders = parseLine(lines[headerIndex]);
  const headers = rawHeaders.map(h => h.toLowerCase().trim().replace(/[\s_().-]/g, ''));
  
  const rows = lines.slice(headerIndex + 1).map((line) => {
    const values = parseLine(line);
    const row = {};
    headers.forEach((h, i) => { if (h) row[h] = values[i] || ''; });
    rawHeaders.forEach((h, i) => { const key = h.trim(); if (key) row[key] = values[i] || ''; });
    return row;
  });

  return { rows, rawHeaders }; 
};

const getVal = (d, keys) => {
  if (!d) return '';
  for(let k of keys) {
    if (d[k] !== undefined && d[k] !== null) return String(d[k]);
    const normalized = k.toLowerCase().replace(/ /g, '');
    if (d[normalized] !== undefined && d[normalized] !== null) return String(d[normalized]);
    const snake = k.toLowerCase().replace(/ /g, '_');
    if (d[snake] !== undefined && d[snake] !== null) return String(d[snake]);
  }
  return '';
};

// --- DATA HANDLERS ---
const uploadToSupabase = async (userId, tableName, data) => {
  if (!supabase) throw new Error("Supabase client not initialized.");
  
  const records = data.map(item => {
    const record = {
      user_id: userId,
      data: item 
    };

    // Primary keys based on schema provided in the SQL script
    if (tableName === 'opportunities') record.id = getVal(item, ['id', 'opportunityid']);
    if (tableName === 'leads') record.leadid = getVal(item, ['leadid', 'lead id']);
    if (tableName === 'inventory') record.vin = getVal(item, ['Vehicle Identification Number', 'vin']);
    
    return record;
  }).filter(r => {
    // Basic validation: ensure primary keys exist for non-identity tables
    if (tableName === 'opportunities' && !r.id) return false;
    if (tableName === 'leads' && !r.leadid) return false;
    if (tableName === 'inventory' && !r.vin) return false;
    return true;
  });

  const conflictColumn = tableName === 'opportunities' ? 'id' : (tableName === 'leads' ? 'leadid' : (tableName === 'inventory' ? 'vin' : 'id'));

  const { error } = await supabase
    .from(tableName)
    .upsert(records, { onConflict: tableName === 'bookings' ? undefined : conflictColumn });

  if (error) throw error;
  return data.length;
};

// --- MAIN APPLICATION ---
export default function App() {
  const [user, setUser] = useState(null);
  const [oppData, setOppData] = useState([]);
  const [leadData, setLeadData] = useState([]);
  const [invData, setInvData] = useState([]);
  const [bookingData, setBookingData] = useState([]);
  const [storageMode, setStorageMode] = useState('initializing');
  const [isUploading, setIsUploading] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [viewMode, setViewMode] = useState('dashboard');
  const [filters, setFilters] = useState({ model: 'All', location: 'All', consultant: 'All' });
  const [timeView, setTimeView] = useState('CY');

  const [timestamps, setTimestamps] = useState({
    opportunities: null, leads: null, inventory: null, bookings: null
  });

  // --- AUTH ---
  useEffect(() => {
    if (supabase) {
      const initAuth = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          setUser(session.user);
          setStorageMode('cloud');
        } else {
          const { data: anon, error } = await supabase.auth.signInAnonymously();
          if (!error && anon.user) {
            setUser(anon.user);
            setStorageMode('cloud');
          } else {
            setStorageMode('local');
          }
        }
      };
      initAuth();
    } else {
      setStorageMode('local');
    }
  }, []);

  // --- FETCH DATA ---
  useEffect(() => {
    if (storageMode === 'initializing') return;

    const loadData = async () => {
      const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      if (storageMode === 'cloud' && user) {
        try {
          const fetch = async (table) => {
            const { data, error } = await supabase.from(table).select('data').eq('user_id', user.id);
            if (error) throw error;
            return data.map(i => i.data);
          };

          const [opps, leads, invs, bks] = await Promise.all([
            fetch('opportunities'), fetch('leads'), fetch('inventory'), fetch('bookings')
          ]);

          setOppData(opps); setLeadData(leads); setInvData(invs); setBookingData(bks);
          setTimestamps({ opportunities: now, leads: now, inventory: now, bookings: now });
        } catch (e) {
          console.error("Fetch failed", e);
          setStorageMode('local');
        }
      } else if (storageMode === 'local') {
        const load = (key) => JSON.parse(localStorage.getItem(`dashboard_${key}`) || '[]');
        setOppData(load('oppData'));
        setLeadData(load('leadData'));
        setInvData(load('invData'));
        setBookingData(load('bookingData'));
      }
    };
    loadData();
  }, [user, storageMode]);

  // --- HELPERS ---
  const getDateObj = (dateStr) => {
    if (!dateStr) return new Date(0);
    let d = new Date(dateStr);
    if (!isNaN(d.getTime())) return d;
    const parts = String(dateStr).match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
    if (parts) return new Date(parts[3], parts[2] - 1, parts[1]);
    return new Date(0);
  };

  const getMonthStr = (dateStr) => {
    const d = getDateObj(dateStr);
    return d.getTime() === 0 ? 'Unknown' : d.toLocaleString('default', { month: 'short', year: '2-digit' });
  };

  const timeLabels = useMemo(() => {
    if (oppData.length === 0) return { prevLabel: 'Prv', currLabel: 'Cur' };
    let maxDate = new Date(0);
    oppData.forEach(d => {
      const date = getDateObj(getVal(d, ['createdon', 'createddate']));
      if (date > maxDate) maxDate = date;
    });
    if (maxDate.getTime() === 0) return { prevLabel: 'Prv', currLabel: 'Cur' };
    const currMonth = maxDate; 
    let prevMonth = new Date(currMonth);
    if (timeView === 'CY') prevMonth.setMonth(currMonth.getMonth() - 1);
    else prevMonth.setFullYear(currMonth.getFullYear() - 1);
    return { 
      currLabel: currMonth.toLocaleString('default', { month: 'short', year: '2-digit' }), 
      prevLabel: prevMonth.toLocaleString('default', { month: 'short', year: '2-digit' }) 
    };
  }, [oppData, timeView]);

  // --- ACTIONS ---
  const handleDataImport = async (newData, type, overwrite) => {
    setIsUploading(true);
    try {
      if (storageMode === 'cloud' && user) {
        if (overwrite) await supabase.from(type).delete().eq('user_id', user.id);
        await uploadToSupabase(user.id, type, newData);
        setSuccessMsg(`Cloud: Synced ${newData.length} records`);
      } else {
        const current = overwrite ? [] : (type === 'opportunities' ? oppData : type === 'leads' ? leadData : type === 'inventory' ? invData : bookingData);
        // Simple merge logic for local
        const merged = [...current, ...newData]; 
        localStorage.setItem(`dashboard_${type}Data`, JSON.stringify(merged));
        setSuccessMsg(`Local: Saved ${newData.length} records`);
      }
      // Re-trigger reload
      setStorageMode(prev => prev === 'cloud' ? 'cloud' : 'local'); 
      setTimeout(() => setSuccessMsg(''), 5000);
    } catch (e) {
      alert("Error: " + e.message);
    } finally {
      setIsUploading(false);
    }
  };

  const clearData = async () => {
    if (window.confirm("System Reset?")) {
      if (storageMode === 'cloud' && user) {
        await Promise.all(['opportunities', 'leads', 'inventory', 'bookings'].map(t => supabase.from(t).delete().eq('user_id', user.id)));
      }
      localStorage.clear();
      window.location.reload();
    }
  };

  // --- FILTERING ---
  const getFilteredData = (data, type) => {
    return data.filter(item => {
      if (type === 'inventory') {
        const m = getVal(item, ['modellinefe', 'Model Line', 'Model']).trim();
        return filters.model === 'All' || m === filters.model;
      }
      const loc = [getVal(item, ['Dealer Code']), getVal(item, ['Branch Name']), getVal(item, ['city'])].map(v => v.trim()).filter(Boolean);
      const m = getVal(item, ['modellinefe', 'Model Line', 'Model']).trim();
      const con = getVal(item, ['Assigned To', 'owner']).trim();
      return (filters.location === 'All' || loc.includes(filters.location)) &&
             (filters.model === 'All' || m === filters.model) &&
             (filters.consultant === 'All' || con === filters.consultant);
    });
  };

  const filteredOppData = useMemo(() => getFilteredData(oppData, 'opportunities'), [oppData, filters]);
  const filteredLeadData = useMemo(() => getFilteredData(leadData, 'leads'), [leadData, filters]);
  const filteredInvData = useMemo(() => getFilteredData(invData, 'inventory'), [invData, filters]);
  const consultantOptions = useMemo(() => [...new Set(oppData.map(d => getVal(d, ['Assigned To'])))].filter(Boolean).sort(), [oppData]);
  const modelOptions = useMemo(() => [...new Set([...oppData, ...invData].map(d => getVal(d, ['modellinefe', 'Model Line'])))].filter(Boolean).sort(), [oppData, invData]);
  const locationOptions = useMemo(() => [...new Set([...oppData, ...leadData].map(d => getVal(d, ['Dealer Code', 'city'])))].filter(Boolean).sort(), [oppData, leadData]);

  // --- RENDER ---
  return (
    <div className="min-h-screen font-sans bg-slate-50">
      <GlobalStyles />
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50 p-3 shadow-sm">
        <div className="max-w-[1400px] mx-auto flex justify-between items-center h-8">
          <div className="flex items-center gap-2">
            <div className="bg-blue-600 p-1.5 rounded text-white"><Car className="w-4 h-4" /></div>
            <div>
              <h1 className="text-xs font-black italic tracking-tighter uppercase">Sales IQ</h1>
              <div className="flex items-center gap-1">
                {storageMode === 'cloud' ? <Cloud className="w-2 h-2 text-emerald-500" /> : <CloudOff className="w-2 h-2 text-amber-500" />}
                <span className="text-[7px] font-bold text-slate-400 uppercase">{storageMode === 'cloud' ? 'Persistent Cloud' : 'Temporary Session'}</span>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowImport(true)} className="bg-slate-900 text-white px-3 py-1 rounded text-[9px] font-bold flex items-center gap-1"><Upload className="w-3 h-3" /> IMPORT</button>
            <button onClick={clearData} className="text-slate-300 hover:text-rose-500 transition-colors"><Trash2 className="w-4 h-4" /></button>
          </div>
        </div>

        <div className="max-w-[1400px] mx-auto mt-2 flex gap-2 overflow-x-auto no-scrollbar pb-1">
           <select className="bg-slate-100 border-none rounded px-2 py-0.5 text-[9px] font-bold outline-none" value={filters.consultant} onChange={e => setFilters({...filters, consultant: e.target.value})}><option value="All">All SCs</option>{consultantOptions.map(c => <option key={c} value={c}>{c}</option>)}</select>
           <select className="bg-slate-100 border-none rounded px-2 py-0.5 text-[9px] font-bold outline-none" value={filters.model} onChange={e => setFilters({...filters, model: e.target.value})}><option value="All">All Models</option>{modelOptions.map(m => <option key={m} value={m}>{m}</option>)}</select>
           <select className="bg-slate-100 border-none rounded px-2 py-0.5 text-[9px] font-bold outline-none" value={filters.location} onChange={e => setFilters({...filters, location: e.target.value})}><option value="All">All Branches</option>{locationOptions.map(l => <option key={l} value={l}>{l}</option>)}</select>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto p-3">
        {successMsg && <div className="mb-3 p-2 bg-emerald-500 text-white text-[10px] font-bold rounded flex items-center gap-2 animate-fade-in"><CheckCircle className="w-3 h-3" /> {successMsg}</div>}
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {/* Example Funnel Card */}
          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-3 border-b border-slate-50 pb-2">
               <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><LayoutDashboard className="w-3 h-3 text-blue-600" /> Sales Funnel</h3>
               <div className="text-[8px] font-bold text-slate-300">MoM Growth</div>
            </div>
            <div className="space-y-3">
               <div className="flex justify-between items-center">
                  <span className="text-[11px] font-bold text-slate-600">Total Inquiries</span>
                  <span className="text-xs font-black text-slate-900">{filteredOppData.length}</span>
               </div>
               <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                  <div className="bg-blue-600 h-full" style={{width: '100%'}}></div>
               </div>
            </div>
          </div>

          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-3 border-b border-slate-50 pb-2">
               <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Car className="w-3 h-3 text-indigo-600" /> System Inventory</h3>
               <div className="text-[8px] font-bold text-slate-300">Live Stock</div>
            </div>
            <div className="flex items-end justify-between">
               <div>
                  <div className="text-2xl font-black text-slate-900 tracking-tighter">{filteredInvData.length}</div>
                  <div className="text-[9px] font-bold text-slate-400 uppercase">Vehicles On-hand</div>
               </div>
               <TrendingUp className="w-8 h-8 text-emerald-100" />
            </div>
          </div>
        </div>

        {showImport && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-fade-in">
              <div className="p-4 bg-slate-900 text-white flex justify-between items-center">
                <h2 className="text-xs font-black uppercase tracking-widest flex items-center gap-2"><Database className="w-4 h-4 text-blue-400" /> Data Synchronizer</h2>
                <button onClick={() => setShowImport(false)}><X className="w-5 h-5" /></button>
              </div>
              <div className="p-6">
                <div className="border-2 border-dashed border-slate-200 rounded-xl p-10 text-center relative hover:border-blue-500 transition-colors">
                   <FileSpreadsheet className="w-10 h-10 text-blue-500 mx-auto mb-2" />
                   <p className="text-[11px] font-bold text-slate-500">Drop Sales Master CSV here</p>
                   <input type="file" accept=".csv" className="absolute inset-0 opacity-0 cursor-pointer" onChange={async (e) => {
                     const file = e.target.files[0];
                     if (file) {
                        const reader = new FileReader();
                        reader.onload = async (ev) => {
                          const { rows, rawHeaders } = parseCSV(ev.target.result);
                          const headerStr = rawHeaders.join(',').toLowerCase();
                          let type = 'unknown';
                          if (headerStr.includes('opportunity')) type = 'opportunities';
                          else if (headerStr.includes('lead id')) type = 'leads';
                          else if (headerStr.includes('vin')) type = 'inventory';
                          else if (headerStr.includes('booking')) type = 'bookings';

                          if (type === 'unknown') return alert("Invalid CSV Structure");
                          await handleDataImport(rows, type, true);
                          setShowImport(false);
                        };
                        reader.readAsText(file);
                     }
                   }} />
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
