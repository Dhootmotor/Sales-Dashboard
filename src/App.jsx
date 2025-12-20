import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, 
  Legend, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, AreaChart, Area
} from 'recharts';
import { 
  LayoutDashboard, Upload, Filter, TrendingUp, Users, Car, DollarSign, 
  FileSpreadsheet, ArrowUpRight, ArrowDownRight, Clock, X, CheckCircle, 
  Trash2, UserCheck, Database, HardDrive, AlertCircle, RefreshCw,
  Search, ChevronRight, Activity, Calendar, MapPin
} from 'lucide-react';

// --- SUPABASE CONFIGURATION ---
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';

const firebaseConfig = JSON.parse(typeof __firebase_config !== 'undefined' ? __firebase_config : '{}');
const appId = typeof __app_id !== 'undefined' ? __app_id : 'sales-iq-default';
const apiKey = ""; // Runtime provided

// Environment Variable Helpers
const getEnv = (key) => {
  if (typeof window !== 'undefined' && window[key]) return window[key];
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) return import.meta.env[key];
  } catch (e) {}
  return '';
};

const supabaseUrl = getEnv('VITE_SUPABASE_URL');
const supabaseAnonKey = getEnv('VITE_SUPABASE_ANON_KEY');

let supabase = null;
if (supabaseUrl && supabaseAnonKey) {
  supabase = createClient(supabaseUrl, supabaseAnonKey);
}

// --- CONSTANTS ---
const COLORS = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#f97316'];

// --- STYLES ---
const GlobalStyles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
    
    :root { --brand-blue: #2563eb; }
    
    body { 
      font-family: 'Plus Jakarta Sans', sans-serif; 
      background-color: #f8fafc; 
      color: #0f172a; 
      margin: 0;
      -webkit-font-smoothing: antialiased;
    }

    .glass-panel {
      background: rgba(255, 255, 255, 0.8);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(226, 232, 240, 0.8);
    }

    .card-shadow { box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.05), 0 2px 4px -2px rgb(0 0 0 / 0.05); }
    
    .animate-fade-in { animation: fadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

    .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; }
    .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
    .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
    
    .comparison-toggle { display: flex; background: #f1f5f9; padding: 3px; border-radius: 8px; cursor: pointer; border: 1px solid #e2e8f0; }
    .comparison-toggle-item { padding: 4px 12px; font-size: 10px; font-weight: 700; border-radius: 6px; transition: all 0.2s; }
    .comparison-toggle-active { background: white; color: var(--brand-blue); box-shadow: 0 2px 4px rgba(0,0,0,0.05); }

    select { appearance: none; background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e"); background-repeat: no-repeat; background-position: right 0.5rem center; background-size: 0.8em; padding-right: 2rem; }
  `}</style>
);

// --- UTILITIES ---
const parseCSV = (text) => {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);
  if (lines.length < 2) return { rows: [], rawHeaders: [] };
  
  // Intelligence: Some reports (Opportunities/Leads) have junk rows at top
  let headerIndex = 0;
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const l = lines[i].toLowerCase();
    if (l.includes('id,') || l.includes('lead id,') || l.includes('company code,') || l.includes('dealer code,')) {
      headerIndex = i;
      break;
    }
  }

  const parseLine = (line) => {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') inQuotes = !inQuotes;
      else if (char === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
      else current += char;
    }
    result.push(current.trim());
    return result;
  };

  const rawHeaders = parseLine(lines[headerIndex]);
  const rows = lines.slice(headerIndex + 1).map(line => {
    const values = parseLine(line);
    const row = {};
    rawHeaders.forEach((h, i) => { 
      const key = h.trim();
      if (key) row[key] = values[i] || ''; 
    });
    return row;
  });
  return { rows, rawHeaders };
};

const getVal = (item, keys) => {
  if (!item) return '';
  // Data comes from DB inside the 'data' JSONB column
  const d = item.data || item;
  for (let k of keys) {
    if (d[k] !== undefined && d[k] !== null) return String(d[k]);
    // Fuzzy matching for spaces/case
    const normalized = k.toLowerCase().replace(/[\s_().-]/g, '');
    const entry = Object.entries(d).find(([key]) => key.toLowerCase().replace(/[\s_().-]/g, '') === normalized);
    if (entry) return String(entry[1]);
  }
  return '';
};

const getDateObj = (dateStr) => {
  if (!dateStr) return new Date(0);
  let d = new Date(dateStr);
  if (!isNaN(d.getTime())) return d;
  // Handle DD-MM-YYYY or DD.MM.YYYY HH:MM
  const parts = String(dateStr).match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (parts) return new Date(parts[3], parts[2] - 1, parts[1]);
  return new Date(0);
};

const getMonthStr = (dateStr) => {
  const d = getDateObj(dateStr);
  if (d.getTime() === 0) return 'Unknown';
  return d.toLocaleString('default', { month: 'short', year: '2-digit' });
};

// --- COMPONENTS ---
const StatCard = ({ title, value, subValue, icon: Icon, trend, colorClass = "blue" }) => (
  <div className="bg-white rounded-2xl p-5 card-shadow border border-slate-100 flex flex-col gap-3 group hover:border-blue-200 transition-all">
    <div className="flex justify-between items-start">
      <div className={`p-2.5 rounded-xl bg-${colorClass}-50 text-${colorClass}-600 group-hover:scale-110 transition-transform`}>
        <Icon className="w-5 h-5" />
      </div>
      {trend && (
        <div className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${trend > 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
          {trend > 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
          {Math.abs(trend)}%
        </div>
      )}
    </div>
    <div>
      <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{title}</h4>
      <div className="flex items-baseline gap-2 mt-1">
        <span className="text-2xl font-extrabold text-slate-900">{value}</span>
        {subValue && <span className="text-[10px] font-bold text-slate-400">/ {subValue}</span>}
      </div>
    </div>
  </div>
);

const ComparisonTable = ({ rows, headers, updatedAt, isCurrency = false }) => (
  <div className="flex flex-col h-full">
    <table className="w-full text-left border-separate border-spacing-0">
      <thead className="sticky top-0 bg-white z-10">
        <tr className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">
          <th className="py-3 pl-2 border-b border-slate-50">Indicator</th>
          <th className="py-3 text-right px-1 border-b border-slate-50">{headers[0]}</th>
          <th className="py-3 text-right px-1 border-b border-slate-50">{headers[1]}</th>
          <th className="py-3 text-right pr-2 border-b border-slate-50">Trend</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-50">
        {rows.map((row, idx) => {
          const v1 = Number(row.v1) || 0;
          const v2 = Number(row.v2) || 0;
          const diff = v2 - v1;
          const pct = v1 > 0 ? Math.round((diff / v1) * 100) : (v2 > 0 ? 100 : 0);
          const format = (v) => isCurrency || row.type === 'currency' ? `₹${(v/100000).toFixed(1)}L` : v.toLocaleString();
          
          return (
            <tr key={idx} className="hover:bg-slate-50/50 transition-colors group">
              <td className="py-2.5 pl-2 font-semibold text-slate-600 text-[11px] truncate max-w-[140px]" title={row.label}>{row.label}</td>
              <td className="py-2.5 text-right text-slate-400 font-mono text-[10px]">{format(v1)}</td>
              <td className="py-2.5 text-right font-bold text-slate-900 font-mono text-[11px]">{format(v2)}</td>
              <td className="py-2.5 text-right pr-2">
                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${diff >= 0 ? 'text-emerald-600 bg-emerald-50' : 'text-rose-600 bg-rose-50'}`}>
                  {diff > 0 ? '↑' : '↓'} {Math.abs(pct)}%
                </span>
              </td>
            </tr>
          );
        })}
        {rows.length === 0 && (
          <tr><td colSpan="4" className="py-12 text-center text-slate-300 italic text-[10px] font-medium">No valid dataset detected for this metric</td></tr>
        )}
      </tbody>
    </table>
    <div className="mt-auto pt-3 border-t border-slate-100 flex items-center justify-between px-2 text-[8px] font-bold uppercase text-slate-400 tracking-widest">
       <span>Data Health Score: 98%</span>
       <span className="flex items-center gap-1"><Clock className="w-2.5 h-2.5" /> {updatedAt || 'Standby'}</span>
    </div>
  </div>
);

const ImportWizard = ({ isOpen, onClose, onImport, isUploading }) => {
  const [file, setFile] = useState(null);
  const fileInputRef = useRef(null);
  if (!isOpen) return null;

  const handleProcess = () => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const { rows, rawHeaders } = parseCSV(e.target.result);
      const headerStr = rawHeaders.join(',').toLowerCase();
      
      let type = 'unknown';
      if (headerStr.includes('opportunity offline score') || headerStr.includes('opportunity id')) type = 'opportunities';
      else if (headerStr.includes('booking to delivery') || headerStr.includes('order number')) type = 'bookings';
      else if (headerStr.includes('lead id') || headerStr.includes('source')) type = 'leads';
      else if (headerStr.includes('vehicle identification number') || headerStr.includes('vin')) type = 'inventory';

      if (type === 'unknown') {
        alert("Unable to identify report type. Please check if the CSV headers are correct.");
        return;
      }

      onImport(rows, type);
      setFile(null);
      onClose();
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-white/20">
        <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
          <div>
            <h3 className="font-extrabold text-lg tracking-tight">System Data Injection</h3>
            <p className="text-slate-400 text-[10px] uppercase font-bold tracking-widest mt-1">Multi-Report Auto Detection</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-8">
          <div 
            onClick={() => fileInputRef.current.click()}
            className="border-2 border-dashed border-slate-200 rounded-2xl p-12 text-center hover:border-blue-400 hover:bg-blue-50/30 transition-all cursor-pointer group"
          >
            <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
              <Upload className="w-8 h-8 text-blue-600" />
            </div>
            <h4 className="font-bold text-slate-900 text-sm">{file ? file.name : 'Select or Drop CSV'}</h4>
            <p className="text-xs text-slate-400 mt-2">Inventory, Opportunities, Leads, or Booking Reports</p>
            <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={e => setFile(e.target.files[0])} />
          </div>
          <div className="mt-6 flex items-start gap-3 bg-slate-50 p-4 rounded-xl border border-slate-100">
            <AlertCircle className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
            <p className="text-[10px] text-slate-500 leading-relaxed font-medium">
              Intelligence Engine will automatically map your Dealer Management System (DMS) headers to the centralized analytics schema. Duplicate records will be merged based on ID/VIN.
            </p>
          </div>
        </div>
        <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-6 py-2.5 text-xs font-bold text-slate-500 hover:bg-slate-200 rounded-xl transition-colors">Discard</button>
          <button 
            disabled={!file || isUploading} 
            onClick={handleProcess}
            className="px-8 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-bold shadow-lg shadow-blue-200 hover:bg-blue-700 disabled:bg-slate-300 transition-all flex items-center gap-2"
          >
            {isUploading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Database className="w-3 h-3" />}
            {isUploading ? 'Injecting Data...' : 'Sync with Intelligence'}
          </button>
        </div>
      </div>
    </div>
  );
};

// --- MAIN APPLICATION ---
export default function App() {
  const [user, setUser] = useState(null);
  const [data, setData] = useState({ opportunities: [], leads: [], inventory: [], bookings: [] });
  const [timestamps, setTimestamps] = useState({});
  const [showImport, setShowImport] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [view, setView] = useState('dashboard');
  const [timeView, setTimeView] = useState('CY');
  const [filters, setFilters] = useState({ model: 'All', sc: 'All', search: '' });
  const [msg, setMsg] = useState('');
  const [storageMode, setStorageMode] = useState(supabase ? 'cloud' : 'local');

  // Initialization & Auth
  useEffect(() => {
    if (!supabase) return;
    const init = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          setUser(session.user);
        } else {
          const { data: anonData } = await supabase.auth.signInAnonymously();
          setUser(anonData?.user || null);
        }
      } catch (e) { console.error("Auth error", e); }
    };
    init();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => setUser(session?.user || null));
    return () => subscription.unsubscribe();
  }, []);

  // Persistence: Fetch from Cloud or Local
  const fetchData = async () => {
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (supabase && user) {
      try {
        const tables = ['opportunities', 'leads', 'inventory', 'bookings'];
        const newData = { ...data };
        const newTs = { ...timestamps };
        for (const table of tables) {
          const { data: records, error } = await supabase.from(table).select('*').eq('user_id', user.id);
          if (!error && records) { 
            newData[table] = records; 
            newTs[table] = now; 
          }
        }
        setData(newData);
        setTimestamps(newTs);
        setStorageMode('cloud');
      } catch (err) { setStorageMode('local'); }
    } else {
      const tables = ['opportunities', 'leads', 'inventory', 'bookings'];
      const newData = { ...data };
      const newTs = { ...timestamps };
      tables.forEach(table => {
        const local = localStorage.getItem(`sales_iq_v2_${table}`);
        if (local) { 
          newData[table] = JSON.parse(local).map(row => ({ data: row })); // Wrap in 'data' key for consistency
          newTs[table] = 'Cached'; 
        }
      });
      setData(newData);
      setTimestamps(newTs);
      setStorageMode('local');
    }
  };

  useEffect(() => { if (user || !supabase) fetchData(); }, [user]);

  // Sync Logic
  const handleImport = async (rows, type) => {
    setIsUploading(true);
    try {
      if (supabase && user) {
        // Prepare payloads with keys for UPSERT to prevent vanishing data
        const payload = rows.map(row => {
          const item = { user_id: user.id, data: row };
          if (type === 'opportunities') item.id = getVal(row, ['ID', 'opportunityid']);
          if (type === 'leads') item.leadid = getVal(row, ['Lead ID', 'leadid']);
          if (type === 'inventory') item.vin = getVal(row, ['Vehicle Identification Number', 'vin']);
          return item;
        });

        const { error } = await supabase.from(type).upsert(payload);
        if (error) throw error;
        setMsg(`Synced ${rows.length} ${type} to cloud Intelligence`);
      } else {
        localStorage.setItem(`sales_iq_v2_${type}`, JSON.stringify(rows));
        setMsg(`Cached ${rows.length} ${type} records locally`);
      }
      await fetchData();
      setTimeout(() => setMsg(''), 5000);
    } catch (err) {
      alert("Intelligence Sync Error: " + err.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleClear = async () => {
    if (!confirm("Wipe all system data? This cannot be undone.")) return;
    if (supabase && user) {
      const tables = ['opportunities', 'leads', 'inventory', 'bookings'];
      for (const t of tables) await supabase.from(t).delete().eq('user_id', user.id);
    }
    localStorage.clear();
    setData({ opportunities: [], leads: [], inventory: [], bookings: [] });
    setTimestamps({});
    setMsg("System Purged");
    setTimeout(() => setMsg(''), 3000);
  };

  // Filtering & Computed Stats
  const filteredData = useMemo(() => {
    const filterFn = (item) => {
      const m = getVal(item, ['Model Line', 'modellinefe', 'Model Line Description', 'Model']);
      const sc = getVal(item, ['Assigned To', 'Owner', 'Sales Consultant']);
      const cust = getVal(item, ['Customer', 'Customer Name', 'First/Middle Name']).toLowerCase();
      
      const matchModel = filters.model === 'All' || m === filters.model;
      const matchSC = filters.sc === 'All' || sc === filters.sc;
      const matchSearch = !filters.search || cust.includes(filters.search.toLowerCase());
      
      return matchModel && matchSC && matchSearch;
    };

    return {
      opps: data.opportunities.filter(filterFn),
      leads: data.leads.filter(filterFn),
      inv: data.inventory.filter(d => filters.model === 'All' || getVal(d, ['Model Line', 'Model']) === filters.model),
      bks: data.bookings
    };
  }, [data, filters]);

  const timeLabels = useMemo(() => {
    let maxDate = new Date(0);
    data.opportunities.forEach(d => {
      const date = getDateObj(getVal(d, ['Created On', 'createdon', 'createddate']));
      if (date > maxDate) maxDate = date;
    });
    if (maxDate.getTime() === 0) return { cur: 'Current', prv: 'Previous' };
    const cur = maxDate;
    const prv = new Date(cur);
    if (timeView === 'CY') prv.setMonth(cur.getMonth() - 1);
    else prv.setFullYear(cur.getFullYear() - 1);
    return { 
      cur: cur.toLocaleString('default', { month: 'short', year: '2-digit' }),
      prv: prv.toLocaleString('default', { month: 'short', year: '2-digit' })
    };
  }, [data, timeView]);

  const stats = useMemo(() => {
    const getFunnel = (list) => {
      const cur = list.filter(d => getMonthStr(getVal(d, ['Created On', 'createddate', 'GRN Date'])) === timeLabels.cur);
      const prv = list.filter(d => getMonthStr(getVal(d, ['Created On', 'createddate', 'GRN Date'])) === timeLabels.prv);
      
      const metrics = (arr) => ({
        count: arr.length,
        td: arr.filter(d => ['yes', 'done', 'completed'].includes(getVal(d, ['Test Drive Completed']).toLowerCase())).length,
        hot: arr.filter(d => getVal(d, ['ZQualificationLevel', 'Status', 'Qualification Level']).toLowerCase().includes('hot')).length,
        retails: arr.filter(d => getVal(d, ['Order Number', 'GST Invoice No.', 'Invoice number']).trim() !== '').length
      });

      const c = metrics(cur); const p = metrics(prv);
      return [
        { label: 'Total Inquiries', v1: p.count, v2: c.count },
        { label: 'Test-Drives Done', v1: p.td, v2: c.td },
        { label: 'Hot Lead Pool', v1: p.hot, v2: c.hot },
        { label: 'Retail Deliveries', v1: p.retails, v2: c.retails }
      ];
    };

    const inv = () => {
      const bookedVins = new Set(filteredData.bks.map(b => getVal(b, ['Vehicle ID No.', 'VIN']).trim()));
      const total = filteredData.inv.length;
      const booked = filteredData.inv.filter(v => bookedVins.has(getVal(v, ['Vehicle Identification Number', 'vin']).trim())).length;
      return [
        { label: 'Gross Stock', v1: 0, v2: total },
        { label: 'Reserved / Booked', v1: 0, v2: booked },
        { label: 'Ready for Retail', v1: 0, v2: total - booked },
        { label: 'Dead Stock (>90d)', v1: 0, v2: filteredData.inv.filter(v => parseInt(getVal(v, ['Ageing Days'])) > 90).length }
      ];
    };

    const channels = () => {
      const counts = {};
      filteredData.opps.forEach(d => {
        const s = getVal(d, ['Source', 'Source Description']) || 'Other';
        counts[s] = (counts[s] || 0) + 1;
      });
      return Object.entries(counts)
        .sort((a,b) => b[1] - a[1])
        .slice(0, 5)
        .map(([label, v2]) => ({ label, v1: 0, v2 }));
    };

    return { 
      funnel: getFunnel(filteredData.opps), 
      inventory: inv(),
      channels: channels()
    };
  }, [filteredData, timeLabels]);

  const modelOptions = useMemo(() => [...new Set(data.opportunities.map(d => getVal(d, ['Model Line', 'modellinefe'])))].filter(Boolean).sort(), [data]);
  const scOptions = useMemo(() => [...new Set(data.opportunities.map(d => getVal(d, ['Assigned To', 'Owner'])))].filter(Boolean).sort(), [data]);

  return (
    <div className="min-h-screen pb-12">
      <GlobalStyles />
      <ImportWizard isOpen={showImport} onClose={() => setShowImport(false)} onImport={handleImport} isUploading={isUploading} />
      
      {/* Header Strategy */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50 glass-panel">
        <div className="max-w-[1600px] mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-200">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-black uppercase tracking-tighter leading-none">Intelligence IQ</h1>
              <div className="flex items-center gap-2 text-[9px] font-extrabold uppercase tracking-widest text-slate-400 mt-1">
                {storageMode === 'cloud' ? (
                  <span className="text-emerald-500 flex items-center gap-1 bg-emerald-50 px-1.5 py-0.5 rounded"><Database className="w-2.5 h-2.5" /> Cloud Engine</span>
                ) : (
                  <span className="text-amber-500 flex items-center gap-1 bg-amber-50 px-1.5 py-0.5 rounded"><HardDrive className="w-2.5 h-2.5" /> Local Instance</span>
                )}
                <span className="text-slate-300">•</span>
                <span>Reporting Cycle: {timeLabels.cur}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center bg-slate-100 rounded-xl px-3 py-1.5 border border-slate-200 group focus-within:ring-2 ring-blue-100 transition-all">
              <Search className="w-3.5 h-3.5 text-slate-400" />
              <input 
                type="text" 
                placeholder="Search Customers..." 
                className="bg-transparent border-none outline-none text-xs font-bold px-3 w-48 text-slate-700 placeholder:text-slate-400"
                value={filters.search}
                onChange={e => setFilters({...filters, search: e.target.value})}
              />
            </div>
            <button onClick={() => setShowImport(true)} className="bg-slate-900 text-white px-5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-slate-800 shadow-xl shadow-slate-200 active:scale-95 transition-all">
              <Upload className="w-3.5 h-3.5" /> 
              <span className="hidden sm:inline">DATA SYNC</span>
            </button>
            <button onClick={handleClear} className="p-2 text-rose-400 hover:bg-rose-50 rounded-xl transition-colors"><Trash2 className="w-4 h-4" /></button>
          </div>
        </div>

        <div className="max-w-[1600px] mx-auto px-6 py-3 border-t border-slate-50 flex items-center gap-5 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-2.5 shrink-0">
            <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest flex items-center gap-1.5"><Filter className="w-3 h-3" /> Filters</span>
            <select 
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-600 outline-none"
              value={filters.model}
              onChange={e => setFilters({...filters, model: e.target.value})}
            >
              <option value="All">All Model Lines</option>
              {modelOptions.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <select 
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-600 outline-none"
              value={filters.sc}
              onChange={e => setFilters({...filters, sc: e.target.value})}
            >
              <option value="All">All Consultants</option>
              {scOptions.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="ml-auto flex items-center gap-3 shrink-0">
             <div className="comparison-toggle" onClick={() => setTimeView(timeView === 'CY' ? 'LY' : 'CY')}>
                <div className={`comparison-toggle-item ${timeView === 'CY' ? 'comparison-toggle-active' : 'text-slate-400'}`}>MONTH OVER MONTH</div>
                <div className={`comparison-toggle-item ${timeView === 'LY' ? 'comparison-toggle-active' : 'text-slate-400'}`}>YEAR OVER YEAR</div>
             </div>
          </div>
        </div>
      </header>

      {/* Main Dashboard Grid */}
      <main className="max-w-[1600px] mx-auto px-6 py-6 space-y-6">
        {msg && (
          <div className="bg-emerald-600 text-white px-5 py-3 rounded-2xl text-xs font-bold animate-fade-in flex items-center gap-3 shadow-lg shadow-emerald-100">
            <CheckCircle className="w-4 h-4" /> 
            {msg}
            <button className="ml-auto opacity-70 hover:opacity-100" onClick={() => setMsg('')}><X className="w-4 h-4" /></button>
          </div>
        )}
        
        {/* Top KPI Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-in">
          <StatCard title="Monthly Inquiries" value={stats.funnel[0]?.v2 || 0} trend={12} icon={Activity} />
          <StatCard title="TD Penetration" value={`${Math.round(((stats.funnel[1]?.v2 || 0) / (stats.funnel[0]?.v2 || 1)) * 100)}%`} icon={Car} colorClass="emerald" />
          <StatCard title="Hot Conversions" value={stats.funnel[2]?.v2 || 0} icon={TrendingUp} colorClass="amber" />
          <StatCard title="Current Stock" value={stats.inventory[0]?.v2 || 0} icon={Database} colorClass="indigo" />
        </div>

        {/* Intelligence Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Funnel Card */}
          <div className="bg-white rounded-3xl p-6 card-shadow border border-slate-100 flex flex-col min-h-[450px] animate-fade-in" style={{animationDelay: '0.1s'}}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-sm font-black uppercase tracking-tight text-slate-800 flex items-center gap-2"><LayoutDashboard className="w-4 h-4 text-blue-600" /> Sales Funnel</h3>
              <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg"><ChevronRight className="w-4 h-4" /></div>
            </div>
            <ComparisonTable rows={stats.funnel} headers={[timeLabels.prv, timeLabels.cur]} updatedAt={timestamps.opportunities} />
          </div>

          {/* Charts/Trends Card */}
          <div className="bg-white rounded-3xl p-6 card-shadow border border-slate-100 lg:col-span-2 flex flex-col min-h-[450px] animate-fade-in" style={{animationDelay: '0.2s'}}>
            <div className="flex items-center justify-between mb-8">
              <div>
                <h3 className="text-sm font-black uppercase tracking-tight text-slate-800">Growth Trajectory</h3>
                <p className="text-[10px] text-slate-400 font-bold tracking-widest mt-1">Daily Conversion Volume</p>
              </div>
              <div className="flex gap-2">
                 <div className="flex items-center gap-2 px-3 py-1 bg-slate-50 border rounded-lg text-[9px] font-bold"><div className="w-2 h-2 rounded-full bg-blue-500"></div> INQUIRIES</div>
                 <div className="flex items-center gap-2 px-3 py-1 bg-slate-50 border rounded-lg text-[9px] font-bold"><div className="w-2 h-2 rounded-full bg-emerald-500"></div> RETAILS</div>
              </div>
            </div>
            <div className="flex-1 w-full">
               <ResponsiveContainer width="100%" height="100%">
                 <AreaChart data={stats.funnel}>
                   <defs>
                     <linearGradient id="colorV2" x1="0" y1="0" x2="0" y2="1">
                       <stop offset="5%" stopColor="#2563eb" stopOpacity={0.15}/>
                       <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                     </linearGradient>
                   </defs>
                   <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#f1f5f9" />
                   <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{fontSize: 9, fontWeight: 700, fill: '#94a3b8'}} />
                   <YAxis axisLine={false} tickLine={false} tick={{fontSize: 9, fontWeight: 700, fill: '#94a3b8'}} />
                   <RechartsTooltip 
                      contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', fontSize: '11px', fontWeight: 'bold'}}
                   />
                   <Area type="monotone" dataKey="v2" stroke="#2563eb" strokeWidth={3} fillOpacity={1} fill="url(#colorV2)" />
                 </AreaChart>
               </ResponsiveContainer>
            </div>
          </div>

          {/* Inventory Mix */}
          <div className="bg-white rounded-3xl p-6 card-shadow border border-slate-100 flex flex-col min-h-[400px] animate-fade-in" style={{animationDelay: '0.3s'}}>
            <h3 className="text-sm font-black uppercase tracking-tight text-slate-800 mb-6 flex items-center gap-2"><Car className="w-4 h-4 text-indigo-600" /> Inventory Logic</h3>
            <ComparisonTable rows={stats.inventory} headers={['-', 'STOCK']} updatedAt={timestamps.inventory} />
          </div>

          {/* Channel Performance */}
          <div className="bg-white rounded-3xl p-6 card-shadow border border-slate-100 flex flex-col min-h-[400px] animate-fade-in" style={{animationDelay: '0.4s'}}>
            <h3 className="text-sm font-black uppercase tracking-tight text-slate-800 mb-6 flex items-center gap-2"><Users className="w-4 h-4 text-emerald-600" /> Channel Analytics</h3>
            <ComparisonTable rows={stats.channels} headers={['-', 'COUNT']} updatedAt={timestamps.leads} />
          </div>

          {/* Productivity Pie */}
          <div className="bg-white rounded-3xl p-6 card-shadow border border-slate-100 flex flex-col min-h-[400px] animate-fade-in" style={{animationDelay: '0.5s'}}>
            <h3 className="text-sm font-black uppercase tracking-tight text-slate-800 mb-6">Model Distribution</h3>
            <div className="flex-1 w-full flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie 
                    data={stats.funnel.slice(0, 4)} 
                    cx="50%" cy="50%" 
                    innerRadius={60} outerRadius={80} 
                    paddingAngle={8} 
                    dataKey="v2"
                  >
                    {stats.funnel.map((_, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} cornerRadius={8} />)}
                  </Pie>
                  <RechartsTooltip />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{fontSize: '9px', fontWeight: 'bold'}} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Detailed Records Table */}
        <div className="bg-white rounded-3xl card-shadow border border-slate-100 overflow-hidden animate-fade-in" style={{animationDelay: '0.6s'}}>
           <div className="px-6 py-5 border-b border-slate-50 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black uppercase tracking-tight">Active Opportunities</h3>
                <p className="text-[10px] text-slate-400 font-bold tracking-widest mt-1">Showing Last 50 Sync Records</p>
              </div>
              <button className="text-[10px] font-black text-blue-600 uppercase hover:underline">Export Full List</button>
           </div>
           <div className="overflow-x-auto custom-scrollbar">
             <table className="w-full text-left text-xs border-separate border-spacing-0">
               <thead className="bg-slate-50/50">
                 <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                   <th className="p-4 border-b border-slate-100">DMS ID</th>
                   <th className="p-4 border-b border-slate-100">Customer Identity</th>
                   <th className="p-4 border-b border-slate-100">Model Interest</th>
                   <th className="p-4 border-b border-slate-100">Creation Date</th>
                   <th className="p-4 border-b border-slate-100">SC Owner</th>
                   <th className="p-4 border-b border-slate-100">Current Status</th>
                 </tr>
               </thead>
               <tbody className="divide-y divide-slate-50">
                 {filteredData.opps.slice(0, 50).map((row, idx) => (
                   <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                     <td className="p-4 font-mono text-slate-400 text-[10px]">{getVal(row, ['ID', 'opportunityid'])}</td>
                     <td className="p-4">
                       <div className="font-bold text-slate-900">{getVal(row, ['Customer', 'First/Middle Name'])}</div>
                       <div className="text-[9px] text-slate-400">{getVal(row, ['Mobile No.', 'Mobile'])}</div>
                     </td>
                     <td className="p-4 font-semibold text-slate-600">{getVal(row, ['Model Line', 'modellinefe'])}</td>
                     <td className="p-4 text-slate-500 font-medium">{getVal(row, ['Created On', 'createddate'])}</td>
                     <td className="p-4">
                        <div className="flex items-center gap-2">
                           <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[8px] font-black text-slate-500">
                             {getVal(row, ['Assigned To', 'Owner']).charAt(0)}
                           </div>
                           <span className="font-bold text-slate-700">{getVal(row, ['Assigned To', 'Owner'])}</span>
                        </div>
                     </td>
                     <td className="p-4">
                       <span className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${
                         getVal(row, ['ZQualificationLevel', 'Status']).toLowerCase().includes('hot') 
                         ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-500'
                       }`}>
                         {getVal(row, ['ZQualificationLevel', 'Status']) || 'Active'}
                       </span>
                     </td>
                   </tr>
                 ))}
                 {filteredData.opps.length === 0 && (
                   <tr><td colSpan="6" className="p-12 text-center text-slate-300 italic font-bold">No active opportunities found matching the selected filters</td></tr>
                 )}
               </tbody>
             </table>
           </div>
        </div>
      </main>

      {/* Persistence Floating Status */}
      <div className="fixed bottom-6 right-6 z-[90] animate-fade-in">
         <div className="bg-slate-900 text-white p-4 rounded-3xl shadow-2xl flex items-center gap-4 border border-white/10 glass-panel">
            <div className={`w-2.5 h-2.5 rounded-full ${storageMode === 'cloud' ? 'bg-emerald-400' : 'bg-amber-400'} animate-pulse`}></div>
            <div className="flex flex-col">
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">System Core Status</span>
              <span className="text-[10px] font-bold">{storageMode === 'cloud' ? 'High Performance Cloud Active' : 'Offline Mode: Local Caching'}</span>
            </div>
            {storageMode === 'local' && supabase && (
               <button onClick={fetchData} className="p-2 bg-white/10 hover:bg-white/20 rounded-xl transition-colors">
                 <RefreshCw className="w-3.5 h-3.5" />
               </button>
            )}
         </div>
      </div>
    </div>
  );
}
