import React, { useState, useEffect, useMemo, useCallback } from 'react';
/**
 * Using esm.sh for external libraries to ensure compatibility 
 * with the browser-based preview environment.
 */
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line 
} from 'https://esm.sh/recharts@2.12.0';
import { 
  LayoutDashboard, Upload, Filter, TrendingUp, TrendingDown, 
  Users, Car, DollarSign, ChevronDown, FileSpreadsheet, 
  ArrowUpRight, ArrowDownRight, 
  Clock, X, CheckCircle, Download, Trash2, Calendar, AlertTriangle, Database, HardDrive, UserCheck
} from 'https://esm.sh/lucide-react@0.344.0';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.40.0';
import { format, parse, isValid, subMonths, subYears, startOfMonth, endOfMonth, isWithinInterval } from 'https://esm.sh/date-fns@3.3.1';

// --- CONFIGURATION & SETUP ---
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

const supabase = (supabaseUrl && supabaseAnonKey) 
  ? createClient(supabaseUrl, supabaseAnonKey) 
  : null;

// --- STYLES ---
const GlobalStyles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
    
    body {
      font-family: 'Inter', sans-serif;
      background-color: #f1f5f9;
      color: #0f172a;
      overflow-x: hidden;
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
      padding: 2px 12px;
      font-size: 10px;
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
  const lines = text.split(/\r?\n/).filter(l => l.trim());
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
    if (rawLine.includes('id') || rawLine.includes('lead') || rawLine.includes('vin') || rawLine.includes('dealer')) {
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
    rawHeaders.forEach((h, i) => { 
      const key = h.trim(); 
      if (key) row[key] = values[i] || ''; 
    });
    return row;
  });

  return { rows, rawHeaders }; 
};

const getVal = (d, keys) => {
  if (!d) return '';
  for(let k of keys) {
    if (d[k] !== undefined && d[k] !== null && d[k] !== '') return String(d[k]);
    const normalized = k.toLowerCase().replace(/[\s_().-]/g, '');
    if (d[normalized] !== undefined && d[normalized] !== null && d[normalized] !== '') return String(d[normalized]);
  }
  return '';
};

// --- DATA HANDLERS ---
const uploadToSupabase = async (userId, tableName, data, onProgress) => {
  if (!supabase) throw new Error("Supabase client not initialized.");
  
  const conflictColumn = tableName === 'opportunities' ? 'id' : (tableName === 'leads' ? 'leadid' : 'vin');
  
  // Prepare all records first
  const records = data.map(item => ({
    ...item,
    user_id: userId,
    id: tableName === 'opportunities' ? (getVal(item, ['id', 'opportunityid'])) : undefined,
    leadid: tableName === 'leads' ? (getVal(item, ['leadid', 'lead id'])) : undefined,
    vin: (tableName === 'inventory' || tableName === 'bookings') ? (getVal(item, ['vin', 'Vehicle ID No.'])) : undefined
  }));

  // Chunking logic: Split data into smaller batches (e.g., 100 rows)
  // This prevents 413 "Payload Too Large" errors and timeouts
  const CHUNK_SIZE = 100;
  for (let i = 0; i < records.length; i += CHUNK_SIZE) {
    const chunk = records.slice(i, i + CHUNK_SIZE);
    const { error } = await supabase
      .from(tableName)
      .upsert(chunk, { onConflict: conflictColumn });
      
    if (error) throw error;
    
    if (onProgress) {
      onProgress(Math.min(100, Math.round(((i + chunk.length) / records.length) * 100)));
    }
  }
  
  return data.length;
};

// --- COMPONENTS ---
const ImportWizard = ({ isOpen, onClose, onDataImported, isUploading }) => {
  const [file, setFile] = useState(null);
  const [overwrite, setOverwrite] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleFileChange = (e) => { 
    if (e.target.files[0]) {
      setFile(e.target.files[0]);
      setProgress(0);
    }
  };

  const processFiles = async () => {
    if (!file) return;
    const readFile = (f) => new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(parseCSV(e.target.result));
      reader.readAsText(f);
    });

    try {
      const { rows, rawHeaders } = await readFile(file);
      const headerString = rawHeaders.join(',').toLowerCase();
      
      let type = 'unknown';
      if (headerString.includes('opportunity')) type = 'opportunities';
      else if (headerString.includes('booking') || headerString.includes('billing')) type = 'bookings';
      else if (headerString.includes('lead id')) type = 'leads';
      else if (headerString.includes('vin') || headerString.includes('grn')) type = 'inventory'; 

      if (type === 'unknown') {
        throw new Error("Could not identify file type. Ensure headers like 'ID', 'Lead ID', or 'VIN' are present.");
      }

      await onDataImported(rows, type, overwrite, (p) => setProgress(p));
      setFile(null); 
      onClose();
    } catch (error) { 
      alert("Error: " + error.message); 
      setProgress(0);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center backdrop-blur-sm px-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-fade-in border border-slate-200">
        <div className="bg-slate-900 px-5 py-4 flex justify-between items-center">
          <h2 className="text-white font-bold text-sm flex items-center gap-2">
            <Upload className="w-4 h-4 text-blue-400" /> Sync Intelligence Data
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors p-1 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div className="border-2 border-dashed border-slate-200 rounded-xl p-10 hover:border-blue-500 bg-slate-50 relative flex flex-col items-center justify-center text-center cursor-pointer group transition-all">
            <FileSpreadsheet className="w-10 h-10 text-blue-600 mb-3 group-hover:scale-110 transition-transform" /> 
            <div className="text-slate-900 font-bold text-sm">{file ? file.name : "Select CSV to Upload"}</div>
            <div className="text-slate-400 text-[10px] mt-1">Large files are automatically chunked for stability</div>
            <input type="file" accept=".csv" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={handleFileChange} />
          </div>
          
          {isUploading && progress > 0 && (
             <div className="space-y-1.5">
               <div className="flex justify-between text-[10px] font-black text-blue-600 uppercase italic">
                 <span>Processing Cloud Sync...</span>
                 <span>{progress}%</span>
               </div>
               <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                 <div className="bg-blue-600 h-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
               </div>
             </div>
          )}

          <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-lg border border-slate-100">
             <input 
              type="checkbox" 
              id="overwrite" 
              checked={overwrite} 
              onChange={(e) => setOverwrite(e.target.checked)} 
              className="w-4 h-4 rounded text-blue-600 cursor-pointer" 
             />
             <label htmlFor="overwrite" className="text-[11px] font-bold text-slate-600 cursor-pointer">
               Overwrite existing data for this category
             </label>
          </div>
        </div>
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-[11px] font-bold text-slate-500 hover:text-slate-800 transition-colors">Cancel</button>
          <button 
            onClick={processFiles} 
            disabled={isUploading || !file} 
            className={`px-6 py-2 text-[11px] font-bold text-white rounded-lg transition-all ${isUploading || !file ? 'bg-slate-300' : 'bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-500/20'}`}
          >
            {isUploading ? 'Syncing Batches...' : 'Upload & Sync'}
          </button>
        </div>
      </div>
    </div>
  );
};

const ComparisonTable = ({ rows, headers, updatedAt }) => {
  const formatValue = (val, type) => {
    if (type === 'currency') return `₹${(val/100000).toFixed(1)}L`;
    return val.toLocaleString();
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <table className="w-full text-xs text-left border-separate border-spacing-0">
        <thead className="text-[9px] uppercase text-slate-400 bg-slate-50/50 font-bold tracking-wider sticky top-0">
          <tr>
            <th className="py-2 pl-2 w-[35%] border-b border-slate-100">Metric</th>
            <th className="py-2 text-right w-[15%] px-1 border-b border-slate-100">{headers[0] || 'Prv'}</th>
            <th className="py-2 text-right w-[15%] px-1 border-b border-slate-100 text-slate-300">/</th>
            <th className="py-2 text-right w-[15%] px-1 border-b border-slate-100 text-slate-900">{headers[1] || 'Cur'}</th>
            <th className="py-2 text-right w-[15%] px-1 border-b border-slate-100 text-blue-500">Var</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {rows.map((row, idx) => {
            const v1 = row.v1 || 0; 
            const v2 = row.v2 || 0; 
            const isUp = v2 >= v1;
            
            return (
              <tr key={idx} className="hover:bg-slate-50/80 transition-colors group">
                <td className="py-2 pl-2 font-medium text-slate-600 flex items-center gap-1.5 truncate">
                   <span className="truncate text-[10px] font-bold uppercase tracking-tight" title={row.label}>{row.label}</span>
                </td>
                <td className="py-2 text-right text-slate-400 font-mono text-[9px] px-1">{formatValue(v1, row.type)}</td>
                <td className="py-2 text-right text-slate-300 text-[8px] px-1">{row.sub1 || '-'}</td>
                <td className="py-2 text-right font-black text-slate-900 font-mono text-[9px] px-1">{formatValue(v2, row.type)}</td>
                <td className={`py-2 text-right font-bold text-[8px] px-1 ${isUp ? 'text-emerald-500' : 'text-rose-500'}`}>
                  {row.sub2 || (v1 > 0 ? `${Math.round(((v2-v1)/v1)*100)}%` : '+100%')}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="mt-auto pt-2 border-t border-slate-50 flex items-center justify-between px-2 text-[8px] text-slate-400 font-bold uppercase">
         <div className="flex items-center gap-1"><Database className="w-2.5 h-2.5" /> Source: CSV</div>
         <div className="flex items-center gap-1"><Clock className="w-2.5 h-2.5" /> {updatedAt || 'N/A'}</div>
      </div>
    </div>
  );
};

// --- MAIN APPLICATION ---
export default function App() {
  const [user, setUser] = useState(null);
  const [oppData, setOppData] = useState([]);
  const [leadData, setLeadData] = useState([]);
  const [invData, setInvData] = useState([]);
  const [bookingData, setBookingData] = useState([]);
  
  const [timestamps, setTimestamps] = useState({ opportunities: null, leads: null, inventory: null, bookings: null });
  const [showImport, setShowImport] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [viewMode, setViewMode] = useState('dashboard'); 
  const [successMsg, setSuccessMsg] = useState(''); 
  const [timeView, setTimeView] = useState('CY'); 
  const [filters, setFilters] = useState({ model: 'All', location: 'All', consultant: 'All' });
  const [storageMode, setStorageMode] = useState(supabase ? 'cloud' : 'local');

  useEffect(() => {
    if (supabase) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        setUser(session?.user || null);
      });

      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        setUser(session?.user || null);
      });
      return () => subscription.unsubscribe();
    }
  }, []);

  const loadData = useCallback(async () => {
    const now = format(new Date(), 'HH:mm');
    if (storageMode === 'cloud' && user) {
      try {
        const fetchTable = async (name) => {
          const { data, error } = await supabase.from(name).select('*').eq('user_id', user.id);
          if (error) throw error;
          return data || [];
        };

        const [opps, leads, inv, bks] = await Promise.all([
          fetchTable('opportunities'), fetchTable('leads'), fetchTable('inventory'), fetchTable('bookings')
        ]);

        setOppData(opps);
        setLeadData(leads);
        setInvData(inv);
        setBookingData(bks);
        setTimestamps({
          opportunities: opps.length ? now : null,
          leads: leads.length ? now : null,
          inventory: inv.length ? now : null,
          bookings: bks.length ? now : null
        });
      } catch (e) { console.error("Load Error:", e); }
    } else {
      const getLocal = (k) => JSON.parse(localStorage.getItem(`sales_iq_${k}`) || '[]');
      setOppData(getLocal('opps'));
      setLeadData(getLocal('leads'));
      setInvData(getLocal('inv'));
      setBookingData(getLocal('bookings'));
      setTimestamps(t => ({ ...t, opportunities: now }));
    }
  }, [user, storageMode]);

  useEffect(() => { loadData(); }, [loadData]);

  const parseDateHelper = (val) => {
    if (!val) return null;
    const d = new Date(val);
    if (isValid(d)) return d;
    const formats = ['dd/MM/yyyy', 'MM/dd/yyyy', 'yyyy-MM-dd', 'dd-MM-yyyy', 'MM-dd-yyyy HH:mm'];
    for (const f of formats) {
      const parsed = parse(val.split(' ')[0], f, new Date());
      if (isValid(parsed)) return parsed;
    }
    return null;
  };

  const timeLabels = useMemo(() => {
    const today = new Date();
    if (timeView === 'CY') {
      return {
        curr: startOfMonth(today),
        prev: startOfMonth(subMonths(today, 1)),
        currLabel: format(today, 'MMM yy'),
        prevLabel: format(subMonths(today, 1), 'MMM yy')
      };
    } else {
      return {
        curr: startOfMonth(today),
        prev: startOfMonth(subYears(today, 1)),
        currLabel: format(today, 'yyyy'),
        prevLabel: format(subYears(today, 1), 'yyyy')
      };
    }
  }, [timeView]);

  const handleDataImport = async (newData, type, overwrite, onProgress) => {
    setIsUploading(true);
    try {
      if (storageMode === 'cloud' && user) {
        if (overwrite) {
          const { error: delErr } = await supabase.from(type).delete().eq('user_id', user.id);
          if (delErr) throw delErr;
        }
        await uploadToSupabase(user.id, type, newData, onProgress);
      } else {
        const key = `sales_iq_${type === 'opportunities' ? 'opps' : type === 'inventory' ? 'inv' : type === 'bookings' ? 'bookings' : 'leads'}`;
        let current = overwrite ? [] : JSON.parse(localStorage.getItem(key) || '[]');
        const merged = [...current, ...newData];
        localStorage.setItem(key, JSON.stringify(merged));
        if (onProgress) onProgress(100);
      }
      await loadData();
      setSuccessMsg(`${type.toUpperCase()} Synchronized Successfully.`);
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (e) {
      alert("Sync Error: " + e.message);
    } finally {
      setIsUploading(false);
    }
  };

  const clearAll = async () => {
    if (!window.confirm("Format entire system? This will erase all uploaded data.")) return;
    if (storageMode === 'cloud' && user) {
      await Promise.all(['opportunities', 'leads', 'inventory', 'bookings'].map(t => 
        supabase.from(t).delete().eq('user_id', user.id)
      ));
    } else {
      localStorage.clear();
    }
    window.location.reload();
  };

  const getFiltered = (data) => {
    return data.filter(item => {
      const m = getVal(item, ['modellinefe', 'Model Line', 'Model']).trim();
      const l = getVal(item, ['Dealer Code', 'city']).trim();
      const c = getVal(item, ['Assigned To', 'owner', 'Employee Name']).trim();
      
      return (filters.model === 'All' || m === filters.model) &&
             (filters.location === 'All' || l === filters.location) &&
             (filters.consultant === 'All' || c === filters.consultant);
    });
  };

  const fOpps = useMemo(() => getFiltered(oppData), [oppData, filters]);
  const fLeads = useMemo(() => getFiltered(leadData), [leadData, filters]);
  const fInv = useMemo(() => getFiltered(invData), [invData, filters]);

  const funnelStats = useMemo(() => {
    const getStats = (dateRange) => {
      const start = dateRange;
      const end = endOfMonth(dateRange);
      const inPeriod = fOpps.filter(d => {
        const dt = parseDateHelper(getVal(d, ['createdon', 'createddate']));
        return dt && isWithinInterval(dt, { start, end });
      });

      return {
        total: inPeriod.length,
        td: inPeriod.filter(d => ['yes', 'completed', 'done'].includes(getVal(d, ['testdrivecompleted']).toLowerCase())).length,
        hot: inPeriod.filter(d => getVal(d, ['zqualificationlevel', 'status']).toLowerCase().includes('hot')).length,
        booked: inPeriod.filter(d => getVal(d, ['ordernumber']).trim() !== '').length,
        retails: inPeriod.filter(d => getVal(d, ['invoicedatev', 'actualdeliverydate']).trim() !== '').length
      };
    };

    const c = getStats(timeLabels.curr);
    const p = getStats(timeLabels.prev);
    const pct = (n, d) => d > 0 ? Math.round((n/d)*100)+'%' : '0%';

    return [
      { label: 'Total Inquiries', v1: p.total, sub1: '100%', v2: c.total, sub2: '100%' },
      { label: 'Test-Drives', v1: p.td, sub1: pct(p.td, p.total), v2: c.td, sub2: pct(c.td, c.total) },
      { label: 'Hot Lead Pool', v1: p.hot, sub1: pct(p.hot, p.total), v2: c.hot, sub2: pct(c.hot, c.total) },
      { label: 'Bookings', v1: p.booked, sub1: pct(p.booked, p.total), v2: c.booked, sub2: pct(c.booked, c.total) },
      { label: 'Retails', v1: p.retails, sub1: pct(p.retails, p.total), v2: c.retails, sub2: pct(c.retails, c.total) },
    ];
  }, [fOpps, timeLabels]);

  const invStats = useMemo(() => {
    const total = fInv.length;
    const aged = fInv.filter(d => parseInt(getVal(d, ['Ageing Days']) || '0') > 90).length;
    const booked = fInv.filter(d => getVal(d, ['Sales Order Number']).trim() !== '').length;
    return [
      { label: 'Total Stock', v1: 0, v2: total },
      { label: 'Customer Booked', v1: 0, v2: booked, sub2: (total ? Math.round((booked/total)*100) : 0) + '%' },
      { label: 'Fresh Stock', v1: 0, v2: total - aged - booked },
      { label: 'Ageing >90D', v1: 0, v2: aged, sub2: (total ? Math.round((aged/total)*100) : 0) + '%' },
    ];
  }, [fInv]);

  const sourceStats = useMemo(() => {
    const counts = {};
    const dataset = fLeads.length ? fLeads : fOpps;
    dataset.forEach(d => {
      const s = getVal(d, ['source', 'Lead Source']) || 'Organic';
      counts[s] = (counts[s] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a,b) => b[1] - a[1])
      .slice(0, 4)
      .map(([label, v2]) => ({ label, v1: 0, v2 }));
  }, [fLeads, fOpps]);

  const modelOptions = useMemo(() => [...new Set([...oppData, ...leadData].map(d => getVal(d, ['modellinefe', 'Model Line'])))].filter(Boolean).sort(), [oppData, leadData]);

  return (
    <div className="min-h-screen bg-slate-50">
       <GlobalStyles />
       <ImportWizard isOpen={showImport} onClose={() => setShowImport(false)} onDataImported={handleDataImport} isUploading={isUploading} />

       <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-sm px-4">
         <div className="max-w-[1400px] mx-auto h-12 flex items-center justify-between gap-4">
           
           <div className="flex items-center gap-2">
             <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
               <TrendingUp className="w-4 h-4" />
             </div>
             <div>
               <h1 className="text-xs font-black text-slate-900 leading-none uppercase tracking-tighter italic">Sales IQ</h1>
               <div className="text-[8px] font-bold text-slate-400 mt-0.5">V2.4 PREVIEW</div>
             </div>
           </div>

           <div className="flex items-center gap-2">
              <select className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-[9px] font-bold text-slate-700 outline-none" value={filters.model} onChange={e => setFilters({...filters, model: e.target.value})}>
                 <option value="All">All Models</option>
                 {modelOptions.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <div className="comparison-toggle" onClick={() => setTimeView(timeView === 'CY' ? 'LY' : 'CY')}>
                  <div className={`comparison-toggle-item ${timeView === 'CY' ? 'comparison-toggle-active' : 'text-slate-500'}`}>MTD</div>
                  <div className={`comparison-toggle-item ${timeView === 'LY' ? 'comparison-toggle-active' : 'text-slate-500'}`}>YTD</div>
              </div>
              <button onClick={() => setShowImport(true)} className="bg-slate-900 text-white px-4 py-1.5 rounded-lg text-[9px] font-black hover:bg-blue-600 transition-all flex items-center gap-2">
                <Upload className="w-3 h-3" /> SYNC
              </button>
              <button onClick={clearAll} className="p-2 text-rose-400 hover:bg-rose-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
           </div>
         </div>
       </header>

       <main className="max-w-[1400px] mx-auto p-4 space-y-4">
         {successMsg && (
           <div className="bg-blue-600 text-white rounded-lg shadow-xl px-4 py-2 text-[10px] font-black animate-fade-in flex items-center gap-3 uppercase tracking-wider">
             <CheckCircle className="w-3 h-3" /> {successMsg}
           </div>
         )}

         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl card-shadow p-4 border border-slate-100 hover:border-blue-200 transition-all cursor-pointer group" onClick={() => setViewMode('detailed')}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <LayoutDashboard className="w-4 h-4 text-blue-600" />
                  <h3 className="font-black text-slate-800 text-[11px] uppercase tracking-tight">Conversion Funnel</h3>
                </div>
                <ArrowUpRight className="w-3 h-3 text-slate-300 group-hover:text-blue-500 transition-colors" />
              </div>
              <ComparisonTable rows={funnelStats} headers={[timeLabels.prevLabel, timeLabels.currLabel]} updatedAt={timestamps.opportunities} />
            </div>

            <div className="bg-white rounded-xl card-shadow p-4 border border-slate-100">
              <div className="flex items-center gap-2 mb-4">
                <Car className="w-4 h-4 text-indigo-600" />
                <h3 className="font-black text-slate-800 text-[11px] uppercase tracking-tight">Inventory Health</h3>
              </div>
              <ComparisonTable rows={invStats} headers={['Snapshot', 'Live']} updatedAt={timestamps.inventory} />
            </div>

            <div className="bg-white rounded-xl card-shadow p-4 border border-slate-100">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="w-4 h-4 text-emerald-600" />
                <h3 className="font-black text-slate-800 text-[11px] uppercase tracking-tight">Top Channels</h3>
              </div>
              <ComparisonTable rows={sourceStats.length ? sourceStats : [{label: 'Awaiting Data', v1:0, v2:0}]} headers={['-', 'Inflow']} updatedAt={timestamps.leads} />
            </div>
         </div>

         {viewMode === 'detailed' && (
           <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 animate-fade-in">
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 h-80">
                <h3 className="font-black text-slate-900 mb-4 text-[10px] uppercase tracking-widest text-center">Model Distribution</h3>
                <ResponsiveContainer width="100%" height="90%">
                  <PieChart>
                    <Pie 
                      data={modelOptions.map(m => ({ name: m, value: fOpps.filter(o => getVal(o, ['Model Line(fe)', 'Model']) === m).length }))} 
                      innerRadius={60} 
                      outerRadius={80} 
                      paddingAngle={5} 
                      dataKey="value"
                    >
                      {modelOptions.map((_, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                    </Pie>
                    <RechartsTooltip />
                    <Legend iconSize={8} wrapperStyle={{ fontSize: '10px', fontWeight: 800 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 h-80">
                <h3 className="font-black text-slate-900 mb-4 text-[10px] uppercase tracking-widest text-center">Inquiry Momentum</h3>
                <ResponsiveContainer width="100%" height="90%">
                  <LineChart data={fOpps.slice(-10).map((d, i) => ({ name: i, value: i * 2 }))}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" hide />
                    <YAxis tick={{fontSize: 9, fontWeight: 700}} axisLine={false} tickLine={false} />
                    <RechartsTooltip />
                    <Line type="monotone" dataKey="value" stroke="#2563eb" strokeWidth={3} dot={{ r: 4, fill: '#2563eb' }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
           </div>
         )}
       </main>
    </div>
  );
}
