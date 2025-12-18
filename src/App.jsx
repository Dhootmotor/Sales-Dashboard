import React, { useState, useEffect, useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line 
} from 'recharts';
import { 
  LayoutDashboard, Upload, Filter, TrendingUp, TrendingDown, 
  Users, Car, DollarSign, ChevronDown, FileSpreadsheet, 
  ArrowUpRight, ArrowDownRight, 
  Clock, X, CheckCircle, Download, Trash2, Calendar, AlertTriangle, Database, HardDrive, UserCheck
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
      padding: 2px 8px;
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
    if (rawLine.includes('id') || rawLine.includes('lead id') || rawLine.includes('vin') || rawLine.includes('dealer code')) {
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
  }
  return '';
};

// --- DATA HANDLERS ---
const uploadToSupabase = async (userId, tableName, data) => {
  if (!supabase) throw new Error("Supabase client not initialized.");
  const records = data.map(item => ({
    ...item,
    user_id: userId,
    id: tableName === 'opportunities' ? (getVal(item, ['id', 'opportunityid'])) : undefined,
    leadid: tableName === 'leads' ? (getVal(item, ['leadid', 'lead id'])) : undefined,
    vin: (tableName === 'inventory' || tableName === 'bookings') ? (getVal(item, ['Vehicle Identification Number', 'vin', 'Vehicle ID No.'])) : undefined
  }));
  const conflictColumn = tableName === 'opportunities' ? 'id' : (tableName === 'leads' ? 'leadid' : 'vin');
  const { error } = await supabase.from(tableName).upsert(records, { onConflict: conflictColumn });
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
  const mergedMap = new Map(currentData.map(item => [getKey(item), item]));
  newData.forEach(item => { const key = getKey(item); if (key) mergedMap.set(key, item); });
  return Array.from(mergedMap.values());
};

// --- COMPONENTS ---
const ImportWizard = ({ isOpen, onClose, onDataImported, isUploading, mode }) => {
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
      if (headerString.includes('opportunity offline score')) type = 'opportunities';
      else if (headerString.includes('booking to delivery') || headerString.includes('model text 1')) type = 'bookings';
      else if (headerString.includes('lead id') || headerString.includes('qualification level')) type = 'leads';
      else if (headerString.includes('vehicle identification number') || headerString.includes('grn date')) type = 'inventory'; 
      await onDataImported(rows, type, overwrite);
      setFile(null); onClose();
    } catch (error) { alert("Error processing file: " + error.message); }
  };
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center backdrop-blur-sm px-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-fade-in border border-slate-200">
        <div className="bg-slate-900 px-5 py-3 flex justify-between items-center">
          <h2 className="text-white font-bold text-sm flex items-center gap-2"><Upload className="w-4 h-4 text-blue-400" /> Import Master Data</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors p-1 hover:bg-slate-800 rounded"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 hover:border-blue-500 bg-slate-50 relative flex flex-col items-center justify-center text-center cursor-pointer group">
            <FileSpreadsheet className="w-8 h-8 text-blue-600 mb-2 group-hover:scale-110 transition-transform" /> 
            <div className="text-slate-900 font-bold text-sm">{file ? file.name : "Select CSV to Upload"}</div>
            <input type="file" accept=".csv" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={handleFileChange} />
          </div>
          <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-lg border border-slate-100">
             <input type="checkbox" id="overwrite" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} className="w-4 h-4 rounded text-blue-600" />
             <label htmlFor="overwrite" className="text-[11px] font-bold text-slate-600 cursor-pointer">Overwrite Existing Category Data</label>
          </div>
        </div>
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">Cancel</button>
          <button onClick={processFiles} disabled={isUploading || !file} className={`px-5 py-1.5 text-[11px] font-bold text-white rounded-lg transition-all ${isUploading || !file ? 'bg-slate-400' : 'bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-500/20'}`}>
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
        {rows.map((row, idx) => {
          const v1 = row.v1 || 0; const v2 = row.v2 || 0; const isUp = v2 >= v1;
          const format = (val, type) => { if (type === 'currency') return `₹${(val/100000).toFixed(1)}L`; return val.toLocaleString(); };
          return (
            <tr key={idx} className="hover:bg-slate-50/80 transition-colors group">
              <td className="py-1 pl-2 font-medium text-slate-600 flex items-center gap-1 truncate border-r border-slate-50/30">
                 {isUp ? <ArrowUpRight className="w-2.5 h-2.5 text-emerald-500 shrink-0" /> : <ArrowDownRight className="w-2.5 h-2.5 text-rose-500 shrink-0" />}
                 <span className="truncate text-[11px] leading-tight" title={row.label}>{row.label}</span>
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
    <div className="mt-auto pt-1 border-t border-slate-100 flex items-center justify-end px-1 text-[8px] text-slate-800 font-extrabold uppercase italic tracking-tighter">
       <Clock className="w-2 h-2 mr-1" /> Refreshed: {updatedAt || 'Ready'}
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
  
  // Separation of timestamps state
  const [timestamps, setTimestamps] = useState({ opportunities: null, leads: null, inventory: null, bookings: null });
  
  const [showImport, setShowImport] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [viewMode, setViewMode] = useState('dashboard'); 
  const [detailedMetric, setDetailedMetric] = useState('Inquiries');
  const [successMsg, setSuccessMsg] = useState(''); 
  const [timeView, setTimeView] = useState('CY'); 
  const [filters, setFilters] = useState({ model: 'All', location: 'All', consultant: 'All' });
  const [storageMode, setStorageMode] = useState(supabase ? 'cloud' : 'local');

  useEffect(() => {
    if (supabase) {
      const initAuth = async () => { const { data: { session } } = await supabase.auth.getSession(); setUser(session?.user || null); };
      initAuth();
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user || null));
      return () => subscription.unsubscribe();
    } else setStorageMode('local');
  }, []);

  useEffect(() => {
    const loadData = async () => {
      const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      if (storageMode === 'cloud' && user) {
        try {
          const { data: opps } = await supabase.from('opportunities').select('*').eq('user_id', user.id);
          if (opps) { setOppData(opps); setTimestamps(t => ({...t, opportunities: now})); }
          const { data: leads } = await supabase.from('leads').select('*').eq('user_id', user.id);
          if (leads) { setLeadData(leads); setTimestamps(t => ({...t, leads: now})); }
          const { data: inventory } = await supabase.from('inventory').select('*').eq('user_id', user.id);
          if (inventory) { setInvData(inventory); setTimestamps(t => ({...t, inventory: now})); }
          const { data: bks } = await supabase.from('bookings').select('*').eq('user_id', user.id);
          if (bks) { setBookingData(bks); setTimestamps(t => ({...t, bookings: now})); }
        } catch (e) { console.error(e); }
      } else {
        const savedOpp = localStorage.getItem('dashboard_oppData');
        const savedLead = localStorage.getItem('dashboard_leadData');
        const savedInv = localStorage.getItem('dashboard_invData');
        const savedBks = localStorage.getItem('dashboard_bookingData');
        if (savedOpp) { setOppData(JSON.parse(savedOpp)); setTimestamps(t => ({...t, opportunities: now})); }
        if (savedLead) { setLeadData(JSON.parse(savedLead)); setTimestamps(t => ({...t, leads: now})); }
        if (savedInv) { setInvData(JSON.parse(savedInv)); setTimestamps(t => ({...t, inventory: now})); }
        if (savedBks) { setBookingData(JSON.parse(savedBks)); setTimestamps(t => ({...t, bookings: now})); }
      }
    };
    loadData();
  }, [user, storageMode]);

  const getDateObj = (dateStr) => {
      if (!dateStr) return new Date(0);
      let d = new Date(dateStr);
      if (!isNaN(d.getTime())) return d;
      const parts = String(dateStr).match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
      if (parts) { d = new Date(parts[3], parts[2] - 1, parts[1]); if (!isNaN(d.getTime())) return d; }
      return new Date(0);
  };

  const getMonthStr = (dateStr) => { const d = getDateObj(dateStr); return d.getTime() === 0 ? 'Unknown' : d.toLocaleString('default', { month: 'short', year: '2-digit' }); };

  const timeLabels = useMemo(() => {
    if (oppData.length === 0) return { prevLabel: 'Prv', currLabel: 'Cur' };
    let maxDate = new Date(0); oppData.forEach(d => { const date = getDateObj(getVal(d, ['createdon', 'createddate'])); if (date > maxDate) maxDate = date; });
    if (maxDate.getTime() === 0) return { prevLabel: 'Prv', currLabel: 'Cur' };
    const currMonth = maxDate; let prevMonth = new Date(currMonth);
    if (timeView === 'CY') prevMonth.setMonth(currMonth.getMonth() - 1);
    else prevMonth.setFullYear(currMonth.getFullYear() - 1);
    return { currLabel: currMonth.toLocaleString('default', { month: 'short', year: '2-digit' }), prevLabel: prevMonth.toLocaleString('default', { month: 'short', year: '2-digit' }) };
  }, [oppData, timeView]);

  const handleDataImport = async (newData, type, overwrite) => {
    setIsUploading(true); const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    try {
      if (storageMode === 'cloud' && user) {
        if (overwrite) await supabase.from(type).delete().eq('user_id', user.id);
        await uploadToSupabase(user.id, type, newData);
        const { data } = await supabase.from(type).select('*').eq('user_id', user.id);
        if (type === 'opportunities') setOppData(data); else if (type === 'leads') setLeadData(data); else if (type === 'inventory') setInvData(data); else if (type === 'bookings') setBookingData(data);
      } else {
        let current = []; if (!overwrite) { if (type === 'opportunities') current = oppData; else if (type === 'leads') current = leadData; else if (type === 'inventory') current = invData; else if (type === 'bookings') current = bookingData; }
        const merged = mergeLocalData(current, newData, type);
        localStorage.setItem(`dashboard_${type}Data`, JSON.stringify(merged));
        if (type === 'opportunities') setOppData(merged); else if (type === 'leads') setLeadData(merged); else if (type === 'inventory') setInvData(merged); else if (type === 'bookings') setBookingData(merged);
      }
      setTimestamps(prev => ({...prev, [type]: now})); setSuccessMsg(`${type.toUpperCase()} Synchronized.`); setTimeout(() => setSuccessMsg(''), 5000);
    } catch (e) { alert("Error: " + e.message); } finally { setIsUploading(false); }
  };

  const clearData = async () => {
    if(window.confirm("System Reset?")) {
       if (storageMode === 'cloud' && user) {
          await supabase.from('opportunities').delete().eq('user_id', user.id);
          await supabase.from('leads').delete().eq('user_id', user.id);
          await supabase.from('inventory').delete().eq('user_id', user.id);
          await supabase.from('bookings').delete().eq('user_id', user.id);
       } else {
          localStorage.clear();
       }
       setOppData([]); setLeadData([]); setInvData([]); setBookingData([]);
       setTimestamps({opportunities: null, leads: null, inventory: null, bookings: null});
       setSuccessMsg("Cleared.");
       setTimeout(() => setSuccessMsg(''), 3000);
    }
  };

  const getFilteredData = (data, dataType) => {
    return data.filter(item => {
      const itemModel = getVal(item, ['modellinefe', 'Model Line', 'Model']).trim();
      const matchModel = filters.model === 'All' || itemModel === filters.model;
      if (dataType === 'inventory') return matchModel;
      const itemLocs = [getVal(item, ['Dealer Code']), getVal(item, ['city'])].map(v => v.trim()).filter(Boolean);
      const matchLoc = filters.location === 'All' || itemLocs.includes(filters.location);
      const itemCons = getVal(item, ['Assigned To', 'owner', 'Employee Name']).trim();
      const matchCons = filters.consultant === 'All' || itemCons === filters.consultant;
      return matchLoc && matchCons && matchModel;
    });
  };

  const filteredOppData = useMemo(() => getFilteredData(oppData, 'opportunities'), [oppData, filters]);
  const filteredLeadData = useMemo(() => getFilteredData(leadData, 'leads'), [leadData, filters]);
  const filteredInvData = useMemo(() => getFilteredData(invData, 'inventory'), [invData, filters]);
  const filteredBks = useMemo(() => getFilteredData(bookingData, 'bookings'), [bookingData, filters]);
  
  const allDataForFilters = useMemo(() => [...oppData, ...leadData, ...invData], [oppData, leadData, invData]);
  const locationOptions = useMemo(() => [...new Set(allDataForFilters.map(d => getVal(d, ['Dealer Code', 'city'])))].filter(Boolean).sort(), [allDataForFilters]);
  const consultantOptions = useMemo(() => [...new Set(oppData.map(d => getVal(d, ['Assigned To'])))].filter(Boolean).sort(), [oppData]);
  const modelOptions = useMemo(() => [...new Set(allDataForFilters.map(d => getVal(d, ['modellinefe', 'Model Line'])))].filter(Boolean).sort(), [allDataForFilters]);

  // --- BUSINESS LOGIC ---
  const funnelStats = useMemo(() => {
    if (!timeLabels.currLabel) return [];
    const getMonthData = (label) => filteredOppData.filter(d => getMonthStr(getVal(d, ['createdon', 'createddate'])) === label);
    const currData = getMonthData(timeLabels.currLabel); const prevData = getMonthData(timeLabels.prevLabel);
    const getMetrics = (data) => {
      const inquiries = data.length;
      const testDrives = data.filter(d => ['yes', 'completed', 'done'].includes((getVal(d, ['testdrivecompleted']) || '').toLowerCase())).length;
      const hotLeads = data.filter(d => parseInt(getVal(d, ['opportunityofflinescore']) || '0') > 80 || (getVal(d, ['zqualificationlevel', 'status']) || '').toLowerCase().includes('hot')).length;
      const bookings = data.filter(d => (getVal(d, ['ordernumber']) || '').trim() !== '').length;
      const retails = data.filter(d => (getVal(d, ['invoicedatev', 'actualdeliverydate']) || '').trim() !== '').length;
      return { inquiries, testDrives, hotLeads, bookings, retails };
    };
    const c = getMetrics(currData); const p = getMetrics(prevData);
    const calcPct = (num, den) => den > 0 ? Math.round((num / den) * 100) + '%' : '0%';
    return [
      { label: 'Total Inquiries', v1: p.inquiries, sub1: '100%', v2: c.inquiries, sub2: '100%' },
      { label: 'Test-drives Done', v1: p.testDrives, sub1: calcPct(p.testDrives, p.inquiries), v2: c.testDrives, sub2: calcPct(c.testDrives, c.inquiries) },
      { label: 'Hot Lead Pool', v1: p.hotLeads, sub1: calcPct(p.hotLeads, p.inquiries), v2: c.hotLeads, sub2: calcPct(c.hotLeads, c.inquiries) },
      { label: 'Booking Conversion', v1: p.bookings, sub1: calcPct(p.bookings, p.inquiries), v2: c.bookings, sub2: calcPct(c.bookings, c.inquiries) },
      { label: 'Retail Conversion', v1: p.retails, sub1: calcPct(p.retails, p.inquiries), v2: c.retails, sub2: calcPct(c.retails, c.inquiries) },
    ];
  }, [filteredOppData, timeLabels]);

  const inventoryStats = useMemo(() => {
    const bookingModelTexts = bookingData.map(b => getVal(b, ['Model Text 1']).toLowerCase());
    const checkIsBooked = (d) => {
      const salesOrder = getVal(d, ['Sales Order Number']).trim();
      const modelCode = getVal(d, ['Model Sales Code']).toLowerCase().trim();
      if (salesOrder) return true;
      if (modelCode && bookingModelTexts.some(txt => txt.includes(modelCode))) return true;
      return false;
    };

    const getStatsForMonth = (monthLabel) => {
      const dataForMonth = filteredInvData.filter(d => {
        const grnMonth = getMonthStr(getVal(d, ['GRN Date']));
        // For Curr month, we include all data. For Prev month, we only include GRNs up to then.
        if (monthLabel === timeLabels.currLabel) return true;
        return grnMonth === monthLabel || getDateObj(getVal(d, ['GRN Date'])) < getDateObj(monthLabel);
      });
      
      const total = dataForMonth.length;
      const bookedCount = dataForMonth.filter(checkIsBooked).length;
      const openCount = total - bookedCount;
      const openingStock = dataForMonth.filter(d => getMonthStr(getVal(d, ['GRN Date'])) !== monthLabel && !checkIsBooked(d)).length;
      const ageing90 = dataForMonth.filter(d => parseInt(getVal(d, ['Ageing Days']) || '0') > 90).length;

      return { total, openCount, bookedCount, openingStock, ageing90 };
    };

    const c = getStatsForMonth(timeLabels.currLabel);
    const p = getStatsForMonth(timeLabels.prevLabel);

    const calcPct = (num, den) => den > 0 ? Math.round((num / den) * 100) + '%' : '0%';

    return [
      { label: 'Total Inventory', v1: p.total, v2: c.total },
      { label: 'Opening Stock', v1: p.openingStock, sub1: calcPct(p.openingStock, p.total), v2: c.openingStock, sub2: calcPct(c.openingStock, c.total) },
      { label: 'Available (Open)', v1: p.openCount, sub1: calcPct(p.openCount, p.total), v2: c.openCount, sub2: calcPct(c.openCount, c.total) },
      { label: 'Customer Booked', v1: p.bookedCount, sub1: calcPct(p.bookedCount, p.total), v2: c.bookedCount, sub2: calcPct(c.bookedCount, c.total) },
      { label: 'Ageing (>90 Days)', v1: p.ageing90, v2: c.ageing90 },
    ];
  }, [filteredInvData, bookingData, timeLabels]);

  const financeEfficiencyStats = useMemo(() => {
    const retails = filteredBks.filter(b => getVal(b, ['Billing Date', 'Invoice number']).trim() !== '').length;
    const financed = filteredBks.filter(b => getVal(b, ['Financier', 'Financier Name']).trim() !== '').length;
    const insured = filteredBks.filter(b => getVal(b, ['Insurance Company']).trim() !== '').length;
    const scCount = new Set(filteredOppData.map(o => getVal(o, ['Assigned To']))).size || 1;
    return {
      finance: [
        { label: 'Finance Pen.', v1: 0, v2: financed, sub2: retails ? Math.round((financed/retails)*100)+'%' : '0%' },
        { label: 'Insurance Pen.', v1: 0, v2: insured, sub2: retails ? Math.round((insured/retails)*100)+'%' : '0%' },
        { label: 'Exchange Pen.', v1: 0, v2: 0 },
        { label: 'VAS Penetration', v1: 0, v2: 0 }
      ],
      efficiency: [
        { label: 'Retails / SC', v1: 0, v2: (retails / scCount).toFixed(1) },
        { label: 'Total Retails', v1: 0, v2: retails },
        { label: 'Margin / Unit', v1: 0, v2: 0, type: 'currency' },
        { label: 'System Margin', v1: 0, v2: 0, type: 'currency' }
      ]
    };
  }, [filteredBks, filteredOppData]);

  const sourceStats = useMemo(() => {
    const sourceDataset = leadData.length > 0 ? leadData : oppData;
    const currData = sourceDataset.filter(d => getMonthStr(getVal(d, ['createdon', 'createddate'])) === timeLabels.currLabel);
    const counts = {}; currData.forEach(d => { const s = getVal(d, ['source']) || 'Other'; counts[s] = (counts[s] || 0) + 1; });
    return Object.entries(counts).sort(([,a], [,b]) => b - a).slice(0, 5).map(([label, val]) => ({ label, v1: 0, v2: val, sub2: currData.length ? Math.round((val/currData.length)*100)+'%' : '0%' }));
  }, [leadData, oppData, timeLabels]);

  // --- VIEWS ---
  const DashboardView = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 animate-fade-in">
       <div className="bg-white rounded-lg card-shadow p-2 flex flex-col hover:border-blue-200 border border-transparent transition-all group cursor-pointer" onClick={() => { setDetailedMetric('Inquiries'); setViewMode('detailed'); }}>
          <div className="flex items-center gap-1.5 mb-1 border-b border-slate-50 pb-0.5"><LayoutDashboard className="w-3 h-3 text-blue-600" /><h3 className="font-bold text-slate-800 text-[10px] uppercase tracking-tight">Sales Funnel</h3></div>
          <ComparisonTable rows={funnelStats} headers={[timeLabels.prevLabel, timeLabels.currLabel]} updatedAt={timestamps.opportunities} />
       </div>
       <div className="bg-white rounded-lg card-shadow p-2 flex flex-col border border-transparent transition-all">
          <div className="flex items-center gap-1.5 mb-1 border-b border-slate-50 pb-0.5"><Car className="w-3 h-3 text-indigo-600" /><h3 className="font-bold text-slate-800 text-[10px] uppercase tracking-tight">Stock & Booked</h3></div>
          <ComparisonTable rows={inventoryStats} headers={[timeLabels.prevLabel, timeLabels.currLabel]} updatedAt={timestamps.inventory} />
       </div>
       <div className="bg-white rounded-lg card-shadow p-2 flex flex-col border border-transparent transition-all">
          <div className="flex items-center gap-1.5 mb-1 border-b border-slate-50 pb-0.5"><TrendingUp className="w-3 h-3 text-emerald-600" /><h3 className="font-bold text-slate-800 text-[10px] uppercase tracking-tight">Top Channels</h3></div>
          <ComparisonTable rows={sourceStats.length ? sourceStats : [{label: 'No Data', v1:0, v2:0}]} headers={[timeLabels.prevLabel, timeLabels.currLabel]} updatedAt={timestamps.leads} />
       </div>
       <div className="bg-white rounded-lg card-shadow p-2 flex flex-col border border-transparent transition-all">
          <div className="flex items-center gap-1.5 mb-1 border-b border-slate-50 pb-0.5"><FileSpreadsheet className="w-3 h-3 text-purple-600" /><h3 className="font-bold text-slate-800 text-[10px] uppercase tracking-tight">Finance & Insurance</h3></div>
          <ComparisonTable rows={financeEfficiencyStats.finance} headers={[timeLabels.prevLabel, timeLabels.currLabel]} updatedAt={timestamps.bookings} />
       </div>
       <div className="bg-white rounded-lg card-shadow p-2 flex flex-col border border-transparent transition-all">
          <div className="flex items-center gap-1.5 mb-1 border-b border-slate-50 pb-0.5"><Users className="w-3 h-3 text-orange-600" /><h3 className="font-bold text-slate-800 text-[10px] uppercase tracking-tight">Sales Activity</h3></div>
          <ComparisonTable rows={[
               {label: 'Monthly Bookings', v1: funnelStats[3]?.v1 || 0, v2: funnelStats[3]?.v2 || 0},
               {label: 'Monthly Retails', v1: funnelStats[4]?.v1 || 0, v2: funnelStats[4]?.v2 || 0},
               {label: 'Wholesale MTD', v1: 0, v2: 0},
               {label: 'Exchange In', v1: 0, v2: 0}
           ]} headers={[timeLabels.prevLabel, timeLabels.currLabel]} updatedAt={timestamps.opportunities} />
       </div>
       <div className="bg-white rounded-lg card-shadow p-2 flex flex-col border border-transparent transition-all">
          <div className="flex items-center gap-1.5 mb-1 border-b border-slate-50 pb-0.5"><DollarSign className="w-3 h-3 text-rose-600" /><h3 className="font-bold text-slate-800 text-[10px] uppercase tracking-tight">Efficiency Metrics</h3></div>
          <ComparisonTable rows={financeEfficiencyStats.efficiency} headers={[timeLabels.prevLabel, timeLabels.currLabel]} updatedAt={timestamps.bookings} />
       </div>
    </div>
  );

  const DetailedView = () => {
    const consultantMix = useMemo(() => {
        const counts = {}; filteredOppData.forEach(d => { const c = getVal(d, ['Assigned To', 'owner']); if(c) counts[c] = (counts[c] || 0) + 1; });
        return Object.entries(counts).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value).slice(0, 10);
    }, [filteredOppData]);
    const trendData = useMemo(() => {
      const months = {}; oppData.slice(-200).forEach(d => { const m = getMonthStr(getVal(d, ['createdon', 'createddate'])); months[m] = (months[m] || 0) + 1; });
      return Object.entries(months).map(([name, value]) => ({ name, value }));
    }, [oppData]);
    const modelMix = useMemo(() => {
        const counts = {}; filteredOppData.forEach(d => { const m = getVal(d, ['modellinefe', 'Model Line']); if(m) counts[m] = (counts[m] || 0) + 1; });
        return Object.entries(counts).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value).slice(0, 5);
    }, [filteredOppData]);
    return (
      <div className="space-y-2 animate-fade-in">
        <div className="bg-white p-2 rounded-lg shadow-sm border border-slate-200 flex items-center gap-2">
          <button onClick={() => setViewMode('dashboard')} className="p-1 hover:bg-slate-100 rounded transition-colors"><ArrowDownRight className="w-4 h-4 text-slate-500 rotate-135" /></button>
          <h2 className="text-xs font-black text-slate-900 uppercase tracking-widest">{detailedMetric} Graphics Analysis</h2>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
          <div className="bg-white p-3 rounded-lg shadow-sm border border-slate-200 h-60">
             <h3 className="font-bold text-slate-800 mb-2 text-[8px] uppercase tracking-widest">SC Volume (Top 10)</h3>
             <ResponsiveContainer width="100%" height="90%"><BarChart data={consultantMix} layout="vertical"><CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} /><XAxis type="number" hide /><YAxis dataKey="name" type="category" width={80} tick={{fontSize: 7, fontWeight: 700}} axisLine={false} tickLine={false} /><RechartsTooltip cursor={{fill: '#f8fafc'}} /><Bar dataKey="value" fill="#2563eb" radius={[0, 4, 4, 0]} barSize={10} /></BarChart></ResponsiveContainer>
          </div>
          <div className="bg-white p-3 rounded-lg shadow-sm border border-slate-200 h-60">
             <h3 className="font-bold text-slate-800 mb-2 text-[8px] uppercase tracking-widest">Pipeline Trend</h3>
             <ResponsiveContainer width="100%" height="90%"><LineChart data={trendData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" tick={{fontSize: 7}} /><YAxis tick={{fontSize: 7}} /><RechartsTooltip /><Line type="monotone" dataKey="value" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} /></LineChart></ResponsiveContainer>
          </div>
          <div className="bg-white p-3 rounded-lg shadow-sm border border-slate-200 h-60 lg:col-span-2 text-center">
             <h3 className="font-bold text-slate-800 mb-2 text-[8px] uppercase tracking-widest">Model Distribution</h3>
             <ResponsiveContainer width="100%" height="90%"><PieChart><Pie data={modelMix} innerRadius={40} outerRadius={60} paddingAngle={4} dataKey="value" nameKey="name">{modelMix.map((_, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}</Pie><RechartsTooltip /><Legend iconSize={7} wrapperStyle={{fontSize: '8px', fontWeight: 700}} /></PieChart></ResponsiveContainer>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen font-sans pb-4">
       <GlobalStyles />
       <ImportWizard isOpen={showImport} onClose={() => setShowImport(false)} onDataImported={handleDataImport} isUploading={isUploading} mode={storageMode} />

       <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-sm overflow-hidden">
         <div className="max-w-[1400px] mx-auto px-3 h-10 flex items-center justify-between gap-2 no-scrollbar">
           
           <div className="flex items-center gap-1.5 shrink-0">
             <div className="w-6 h-6 bg-blue-600 rounded flex items-center justify-center text-white"><Car className="w-3.5 h-3.5" /></div>
             <h1 className="text-[10px] font-black text-slate-900 leading-none uppercase tracking-tighter italic mr-1">Sales IQ</h1>
             
             <div className="flex bg-slate-100 p-0.5 rounded border border-slate-200 ml-1 shrink-0">
                <button onClick={() => setViewMode('dashboard')} className={`px-2 py-0.5 rounded text-[8px] font-extrabold ${viewMode === 'dashboard' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>DASHBOARD</button>
                <button onClick={() => setViewMode('detailed')} className={`px-2 py-0.5 rounded text-[8px] font-extrabold ${viewMode === 'detailed' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>ANALYTICS</button>
             </div>
           </div>

           <div className="flex items-center gap-1.5 shrink-0 px-1 border-l border-slate-100">
              <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 h-6">
                <UserCheck className="w-2.5 h-2.5 text-slate-400" />
                <select className="bg-transparent text-[8px] font-bold text-slate-700 outline-none min-w-[70px]" value={filters.consultant} onChange={e => setFilters({...filters, consultant: e.target.value})}>
                   <option value="All">All SCs</option>
                   {consultantOptions.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <select className="bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-[8px] font-bold text-slate-700 h-6" value={filters.model} onChange={e => setFilters({...filters, model: e.target.value})}>
                 <option value="All">All Models</option>
                 {modelOptions.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <select className="bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-[8px] font-bold text-slate-700 h-6" value={filters.location} onChange={e => setFilters({...filters, location: e.target.value})}>
                 <option value="All">All Branches</option>
                 {locationOptions.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
           </div>

           <div className="flex items-center gap-2 shrink-0 ml-auto">
              <div className="comparison-toggle shrink-0" onClick={() => setTimeView(timeView === 'CY' ? 'LY' : 'CY')}>
                  <div className={`comparison-toggle-item ${timeView === 'CY' ? 'comparison-toggle-active' : 'text-slate-500'}`}>CY</div>
                  <div className={`comparison-toggle-item ${timeView === 'LY' ? 'comparison-toggle-active' : 'text-slate-500'}`}>LY</div>
              </div>
              <button onClick={() => setShowImport(true)} className="bg-slate-900 text-white px-2 py-0.5 rounded text-[8px] font-black hover:bg-slate-800 flex items-center gap-1 shrink-0 h-6">IMPORT</button>
              <button onClick={clearData} className="p-1 text-rose-400 hover:bg-rose-50 rounded transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
           </div>
         </div>
       </header>

       <main className="max-w-[1400px] mx-auto px-3 py-2">
         {successMsg && <div className="bg-emerald-600 text-white rounded shadow-sm px-3 py-1 text-[9px] font-black mb-2 animate-fade-in flex items-center gap-2 uppercase tracking-wide"><CheckCircle className="w-2.5 h-2.5" /> {successMsg}</div>}
         {viewMode === 'dashboard' && <DashboardView />}
         {viewMode === 'detailed' && <DetailedView />}
         {viewMode === 'table' && (
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden animate-fade-in">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[10px] text-slate-600">
                  <thead className="bg-slate-50 text-slate-400 font-bold border-b border-slate-200 uppercase tracking-tighter">
                    <tr><th className="p-2">ID</th><th className="p-2">Customer</th><th className="p-2">Model</th><th className="p-2">Date</th><th className="p-2">Status</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(filteredOppData.length > 0 ? filteredOppData : filteredLeadData).slice(0, 50).map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 transition-colors">
                        <td className="p-2 font-mono text-slate-400 text-[8px]">{getVal(row, ['id', 'leadid', 'vin'])}</td>
                        <td className="p-2 font-semibold text-slate-800">{getVal(row, ['customer', 'name']) || 'Anonymous'}</td>
                        <td className="p-2">{getVal(row, ['modelline', 'Model Line'])}</td>
                        <td className="p-2">{getVal(row, ['createdon', 'createddate'])}</td>
                        <td className="p-2"><span className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-100 text-[8px] font-bold">{getVal(row, ['status', 'qualificationlevel']) || 'Active'}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
         )}
       </main>
    </div>
  );
}
