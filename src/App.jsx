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

    if (tableName === 'opportunities') record.id = getVal(item, ['id', 'opportunityid']);
    if (tableName === 'leads') record.leadid = getVal(item, ['leadid', 'lead id']);
    if (tableName === 'inventory') record.vin = getVal(item, ['Vehicle Identification Number', 'vin']);
    
    return record;
  }).filter(r => {
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

const mergeLocalData = (currentData, newData, type) => {
  const getKey = (item) => {
    if (type === 'opportunities') return getVal(item, ['id', 'opportunityid']);
    if (type === 'leads') return getVal(item, ['leadid', 'lead id']);
    if (type === 'inventory') return getVal(item, ['Vehicle Identification Number', 'vin']);
    if (type === 'bookings') return getVal(item, ['Vehicle ID No.', 'VIN']);
    return Math.random().toString();
  };

  const mergedMap = new Map((currentData || []).map(item => [getKey(item), item]));
  newData.forEach(item => {
    const key = getKey(item);
    if (key) mergedMap.set(key, item);
  });
  return Array.from(mergedMap.values());
};

// --- COMPONENTS ---
const ImportWizard = ({ isOpen, onClose, onDataImported, isUploading, storageStatus }) => {
  const [file, setFile] = useState(null);
  const [overwrite, setOverwrite] = useState(false);
  
  const handleFileChange = (e) => { if (e.target.files[0]) setFile(e.target.files[0]); };

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
      else if (headerString.includes('booking to delivery') || headerString.includes('model text 1')) type = 'bookings';
      else if (headerString.includes('lead id')) type = 'leads';
      else if (headerString.includes('vehicle identification number') || headerString.includes('vin')) type = 'inventory'; 

      if (type === 'unknown') throw new Error("Could not detect CSV type based on headers.");

      await onDataImported(rows, type, overwrite);
      setFile(null);
      onClose();
    } catch (error) {
      alert("Error: " + error.message);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center backdrop-blur-sm px-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-fade-in border border-slate-200">
        <div className="bg-slate-900 px-5 py-3 flex justify-between items-center">
          <h2 className="text-white font-bold text-sm flex items-center gap-2">
            <Upload className="w-4 h-4 text-blue-400" />
            Import Master Data
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
        </div>
        
        <div className="p-5 space-y-4">
          <div className="flex items-center gap-2 p-2 bg-blue-50 border border-blue-100 rounded-lg">
             {storageStatus === 'cloud' ? <Cloud className="w-4 h-4 text-blue-600" /> : <HardDrive className="w-4 h-4 text-orange-600" />}
             <span className="text-[10px] font-bold text-slate-700">
                Target: {storageStatus === 'cloud' ? 'Supabase Cloud (Persistent)' : 'Local Browser Storage (Temporary)'}
             </span>
          </div>

          <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 hover:border-blue-500 transition-all bg-slate-50 relative group flex flex-col items-center justify-center text-center cursor-pointer">
                <FileSpreadsheet className="w-8 h-8 text-blue-600 mb-2" /> 
                <div className="text-slate-900 font-bold text-sm">{file ? file.name : "Select CSV to Upload"}</div>
                <input type="file" accept=".csv" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={handleFileChange} />
          </div>

          <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-lg border border-slate-100">
             <input type="checkbox" id="overwrite" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500" />
             <label htmlFor="overwrite" className="text-[11px] font-bold text-slate-600 cursor-pointer">Overwrite Existing Data (Start Fresh)</label>
          </div>
        </div>

        <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-200 rounded-lg">Cancel</button>
          <button onClick={processFiles} disabled={isUploading || !file} className={`px-5 py-1.5 text-[11px] font-bold text-white rounded-lg transition-all ${isUploading || !file ? 'bg-slate-400' : 'bg-blue-600 hover:bg-blue-700'}`}>
            {isUploading ? 'Importing...' : 'Sync System'}
          </button>
        </div>
      </div>
    </div>
  );
};

const ComparisonTable = ({ rows, headers, updatedAt }) => (
  <div className="flex flex-col h-full overflow-hidden">
    <table className="w-full text-xs text-left border-separate border-spacing-0">
      <thead className="text-[9px] uppercase text-slate-400 bg-slate-50/50 font-bold tracking-wider sticky top-0">
        <tr>
          <th className="py-1 pl-2 w-[35%] border-b border-slate-100">Metric</th>
          <th className="py-1 text-right w-[15%] px-1 border-l border-b border-slate-100/50">{headers[0] || 'Prv'}</th>
          <th className="py-1 text-right w-[15%] px-1 text-slate-300 border-b border-slate-100">%</th>
          <th className="py-1 text-right w-[15%] px-1 border-l border-b border-slate-100/50">{headers[1] || 'Cur'}</th>
          <th className="py-1 text-right w-[15%] px-1 text-blue-400 border-b border-slate-100">%</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-50">
        {(rows || []).map((row, idx) => {
          const v1 = row.v1 || 0;
          const v2 = row.v2 || 0;
          const isUp = v2 >= v1;
          const format = (val, type) => {
             if (type === 'currency') return `₹${(val/100000).toFixed(1)}L`;
             return val.toLocaleString();
          };

          return (
            <tr key={idx} className="hover:bg-slate-50/80 transition-colors group">
              <td className="py-1 pl-2 font-medium text-slate-600 flex items-center gap-1 truncate border-r border-slate-50/30">
                 {isUp ? <ArrowUpRight className="w-2.5 h-2.5 text-emerald-500 shrink-0" /> : <ArrowDownRight className="w-2.5 h-2.5 text-rose-500 shrink-0" />}
                 <span className="truncate text-[11px]" title={row.label}>{row.label}</span>
              </td>
              <td className="py-1 text-right text-slate-500 font-mono text-[10px] px-1">{format(v1, row.type)}</td>
              <td className="py-1 text-right text-slate-300 text-[8px] px-1">{row.sub1 || '-'}</td>
              <td className="py-1 text-right font-bold text-slate-900 font-mono text-[10px] px-1 border-l border-slate-50/50">{format(v2, row.type)}</td>
              <td className="py-1 text-right text-blue-600 font-bold text-[9px] px-1">{row.sub2 || '-'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
    <div className="mt-auto pt-1.5 border-t border-slate-100 flex items-center justify-end px-1 text-[8px] text-slate-800 gap-1 font-bold uppercase tracking-tighter">
       <Clock className="w-2 h-2" />
       <span>Refreshed: {updatedAt || 'Ready'}</span>
    </div>
  </div>
);

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

  // --- AUTH INITIALIZATION ---
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
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session?.user) {
          setUser(session.user);
          setStorageMode('cloud');
        }
      });
      return () => subscription.unsubscribe();
    } else {
      setStorageMode('local');
    }
  }, []);

  // --- DATA LOADING ---
  useEffect(() => {
    if (storageMode === 'initializing') return;

    const loadData = async () => {
      const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      if (storageMode === 'cloud' && user) {
        try {
          const fetchFromTable = async (table) => {
            const { data, error } = await supabase.from(table).select('data').eq('user_id', user.id);
            if (error) throw error;
            return (data || []).map(item => item.data);
          };

          const [opps, leads, invs, bks] = await Promise.all([
            fetchFromTable('opportunities'),
            fetchFromTable('leads'),
            fetchFromTable('inventory'),
            fetchFromTable('bookings')
          ]);

          setOppData(opps); setLeadData(leads); setInvData(invs); setBookingData(bks);
          setTimestamps({ opportunities: now, leads: now, inventory: now, bookings: now });
        } catch (e) {
          console.error("Fetch failed", e);
          setStorageMode('local');
        }
      } else if (storageMode === 'local') {
        const loadLocal = (key) => JSON.parse(localStorage.getItem(`dashboard_${key}`) || '[]');
        setOppData(loadLocal('oppData'));
        setLeadData(loadLocal('leadData'));
        setInvData(loadLocal('invData'));
        setBookingData(loadLocal('bookingData'));
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

  // --- ACTION HANDLERS ---
  const handleDataImport = async (newData, type, overwrite) => {
    setIsUploading(true);
    try {
      if (storageMode === 'cloud' && user) {
        if (overwrite) await supabase.from(type).delete().eq('user_id', user.id);
        const count = await uploadToSupabase(user.id, type, newData);
        setSuccessMsg(`Cloud Sync Success: ${count} records`);
      } else {
        const current = overwrite ? [] : (type === 'opportunities' ? oppData : type === 'leads' ? leadData : type === 'inventory' ? invData : bookingData);
        const merged = mergeLocalData(current, newData, type);
        localStorage.setItem(`dashboard_${type}Data`, JSON.stringify(merged));
        setSuccessMsg(`Local Save Success: ${newData.length} records`);
      }
      setStorageMode(prev => prev === 'cloud' ? 'cloud' : 'local'); // Trigger reload
      setTimeout(() => setSuccessMsg(''), 5000);
    } catch (e) {
      alert("Sync Error: " + e.message);
    } finally {
      setIsUploading(false);
    }
  };

  const clearData = async () => {
    if (window.confirm("Perform System Reset? This will wipe all current data.")) {
      if (storageMode === 'cloud' && user) {
        await Promise.all(['opportunities', 'leads', 'inventory', 'bookings'].map(t => supabase.from(t).delete().eq('user_id', user.id)));
      }
      localStorage.clear();
      window.location.reload();
    }
  };

  // --- FILTER LOGIC ---
  const getFilteredData = (data, type) => {
    return (data || []).filter(item => {
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

  // --- METRIC CALCULATIONS ---
  const funnelStats = useMemo(() => {
    if (!timeLabels.currLabel) return [];
    const getMonthData = (label) => filteredOppData.filter(d => getMonthStr(getVal(d, ['createdon', 'createddate'])) === label);
    const currData = getMonthData(timeLabels.currLabel);
    const prevData = getMonthData(timeLabels.prevLabel);
    const getMetrics = (data) => {
      const inquiries = data.length;
      const testDrives = data.filter(d => ['yes', 'completed', 'done'].includes((getVal(d, ['testdrivecompleted']) || '').toLowerCase())).length;
      const hotLeads = data.filter(d => parseInt(getVal(d, ['opportunityofflinescore']) || '0') > 80).length;
      const bookings = data.filter(d => (getVal(d, ['ordernumber']) || '').trim() !== '').length;
      const retails = data.filter(d => (getVal(d, ['invoicedatev', 'GST Invoice No.']) || '').trim() !== '').length;
      return { inquiries, testDrives, hotLeads, bookings, retails };
    };
    const c = getMetrics(currData);
    const p = getMetrics(prevData);
    const calcPct = (num, den) => den > 0 ? Math.round((num / den) * 100) + '%' : '0%';
    return [
      { label: 'Total Inquiries', v1: p.inquiries, sub1: '100%', v2: c.inquiries, sub2: '100%' },
      { label: 'Test-drives Done', v1: p.testDrives, sub1: calcPct(p.testDrives, p.inquiries), v2: c.testDrives, sub2: calcPct(c.testDrives, c.inquiries) },
      { label: 'Hot Lead Pool', v1: p.hotLeads, sub1: calcPct(p.hotLeads, p.inquiries), v2: c.hotLeads, sub2: calcPct(c.hotLeads, c.inquiries) },
      { label: 'Booking Conv.', v1: p.bookings, sub1: calcPct(p.bookings, p.inquiries), v2: c.bookings, sub2: calcPct(c.bookings, c.inquiries) },
      { label: 'Retail Conv.', v1: p.retails, sub1: calcPct(p.retails, p.inquiries), v2: c.retails, sub2: calcPct(c.retails, c.inquiries) },
    ];
  }, [filteredOppData, timeLabels]);

  const inventoryStats = useMemo(() => {
    const total = filteredInvData.length;
    return [
      { label: 'Total Inventory', v1: 0, v2: total },
      { label: 'Available Stock', v1: 0, v2: total, sub2: '100%' },
      { label: 'Pending PDI', v1: 0, v2: 0 },
      { label: 'Allocated', v1: 0, v2: 0 },
      { label: 'Ageing >90', v1: 0, v2: filteredInvData.filter(d => parseInt(getVal(d, ['Ageing Days']) || '0') > 90).length },
    ];
  }, [filteredInvData]);

  const sourceStats = useMemo(() => {
    const sourceDataset = filteredLeadData.length > 0 ? filteredLeadData : filteredOppData;
    const currData = sourceDataset.filter(d => getMonthStr(getVal(d, ['createdon', 'createddate'])) === timeLabels.currLabel);
    const counts = {};
    currData.forEach(d => { const s = getVal(d, ['source']) || 'Other'; counts[s] = (counts[s] || 0) + 1; });
    return Object.entries(counts).sort(([,a], [,b]) => b - a).slice(0, 5)
      .map(([label, val]) => ({ label, v1: 0, v2: val, sub2: currData.length ? Math.round((val/currData.length)*100)+'%' : '0%' }));
  }, [filteredLeadData, filteredOppData, timeLabels]);

  // --- RENDERING ---
  const DashboardView = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 animate-fade-in">
       <div className="bg-white rounded-lg card-shadow p-2 flex flex-col hover:border-blue-100 border border-transparent transition-all">
          <div className="flex items-center gap-1.5 mb-1.5 border-b border-slate-50 pb-1">
            <LayoutDashboard className="w-3 h-3 text-blue-600" />
            <h3 className="font-bold text-slate-800 text-[10px] uppercase tracking-tight">Sales Funnel</h3>
          </div>
          <ComparisonTable rows={funnelStats} headers={[timeLabels.prevLabel, timeLabels.currLabel]} updatedAt={timestamps.opportunities} />
       </div>

       <div className="bg-white rounded-lg card-shadow p-2 flex flex-col border border-transparent transition-all">
          <div className="flex items-center gap-1.5 mb-1.5 border-b border-slate-50 pb-1">
            <Car className="w-3 h-3 text-indigo-600" />
            <h3 className="font-bold text-slate-800 text-[10px] uppercase tracking-tight">System Inventory</h3>
          </div>
          <ComparisonTable rows={inventoryStats} headers={['', 'Stock']} updatedAt={timestamps.inventory} />
       </div>

       <div className="bg-white rounded-lg card-shadow p-2 flex flex-col border border-transparent transition-all">
          <div className="flex items-center gap-1.5 mb-1.5 border-b border-slate-50 pb-1">
            <TrendingUp className="w-3 h-3 text-emerald-600" />
            <h3 className="font-bold text-slate-800 text-[10px] uppercase tracking-tight">Channels</h3>
          </div>
          <ComparisonTable rows={sourceStats.length ? sourceStats : [{label: 'No Data', v1:0, v2:0}]} headers={[timeLabels.prevLabel, timeLabels.currLabel]} updatedAt={timestamps.leads} />
       </div>

       <div className="bg-white rounded-lg card-shadow p-2 flex flex-col border border-transparent transition-all">
          <div className="flex items-center gap-1.5 mb-1.5 border-b border-slate-50 pb-1">
            <FileSpreadsheet className="w-3 h-3 text-purple-600" />
            <h3 className="font-bold text-slate-800 text-[10px] uppercase tracking-tight">Value Added</h3>
          </div>
          <ComparisonTable rows={[{label: 'Finance Pen.', v1: 0, v2: 0}, {label: 'Insurance Pen.', v1: 0, v2: 0}, {label: 'Accessories', v1: 0, v2: 0, type: 'currency'}]} headers={[timeLabels.prevLabel, timeLabels.currLabel]} />
       </div>

       <div className="bg-white rounded-lg card-shadow p-2 flex flex-col border border-transparent transition-all">
          <div className="flex items-center gap-1.5 mb-1.5 border-b border-slate-50 pb-1">
            <Users className="w-3 h-3 text-orange-600" />
            <h3 className="font-bold text-slate-800 text-[10px] uppercase tracking-tight">Sales Ops</h3>
          </div>
          <ComparisonTable rows={[{label: 'Monthly Bookings', v1: 0, v2: 0}, {label: 'Monthly Retails', v1: 0, v2: 0}]} headers={[timeLabels.prevLabel, timeLabels.currLabel]} />
       </div>

       <div className="bg-white rounded-lg card-shadow p-2 flex flex-col border border-transparent transition-all">
          <div className="flex items-center gap-1.5 mb-1.5 border-b border-slate-50 pb-1">
            <DollarSign className="w-3 h-3 text-rose-600" />
            <h3 className="font-bold text-slate-800 text-[10px] uppercase tracking-tight">Efficiency</h3>
          </div>
          <ComparisonTable rows={[{label: 'Margin/Car', v1: 0, v2: 0, type: 'currency'}, {label: 'Total Margin', v1: 0, v2: 0, type: 'currency'}]} headers={[timeLabels.prevLabel, timeLabels.currLabel]} />
       </div>
    </div>
  );

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
            <button onClick={() => setShowImport(true)} className="bg-slate-900 text-white px-3 py-1 rounded text-[9px] font-bold flex items-center gap-1 hover:bg-slate-800"><Upload className="w-3 h-3" /> IMPORT</button>
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
        {successMsg && <div className="mb-3 p-2 bg-emerald-500 text-white text-[10px] font-bold rounded flex items-center gap-2 animate-fade-in shadow-sm"><CheckCircle className="w-3 h-3" /> {successMsg}</div>}
        <DashboardView />

        {showImport && <ImportWizard isOpen={showImport} onClose={() => setShowImport(false)} onDataImported={handleDataImport} isUploading={isUploading} storageStatus={storageMode} />}
      </main>
    </div>
  );
}
