import React, { useState, useEffect, useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell 
} from 'recharts';
import { 
  LayoutDashboard, Upload, Filter, TrendingUp, TrendingDown, 
  Users, Car, DollarSign, ChevronDown, FileSpreadsheet, 
  ArrowUpRight, ArrowDownRight, 
  Clock, X, CheckCircle, Download, Trash2, Calendar, AlertTriangle, Database, HardDrive
} from 'lucide-react';

/**
 * Using esm.sh to import Supabase directly in the browser environment.
 * This resolves the "Could not resolve @supabase/supabase-js" error in the preview.
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

// Initialize Supabase - No Firebase connection exists here.
try {
  if (supabaseUrl && supabaseAnonKey) {
    supabase = createClient(supabaseUrl, supabaseAnonKey);
  } else {
    console.warn("Supabase credentials missing. App will default to Local Storage mode until configured.");
  }
} catch (e) {
  console.error("Supabase Initialization Error:", e);
}

// --- STYLES ---
const GlobalStyles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    
    body {
      font-family: 'Inter', sans-serif;
    }

    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: #f1f5f9; }
    ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
    
    .animate-fade-in { animation: fadeIn 0.4s ease-out forwards; }
    .animate-fade-in-up { animation: fadeInUp 0.5s ease-out forwards; }
    
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes fadeInUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
    
    .rotate-135 { transform: rotate(135deg); }
    
    /* Ensure charts have a consistent look */
    .recharts-cartesian-grid-horizontal line,
    .recharts-cartesian-grid-vertical line {
      stroke: #f1f5f9;
    }
    .recharts-text {
      fill: #64748b;
      font-size: 11px;
    }
  `}</style>
);

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#f97316'];

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
    const keywords = ['id', 'lead id', 'order number', 'vin', 'company code'];
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

// --- DATA HANDLERS (SUPABASE ONLY) ---

const uploadToSupabase = async (userId, tableName, data) => {
  if (!supabase) throw new Error("Supabase client not initialized.");
  
  const records = data.map(item => ({
    ...item,
    user_id: userId,
    id: tableName === 'opportunities' ? (item['id'] || item['opportunityid']) : undefined,
    leadid: tableName === 'leads' ? (item['leadid'] || item['lead id']) : undefined,
    vin: tableName === 'inventory' ? (item['vehicleidentificationnumber'] || item['vin']) : undefined
  }));

  const conflictColumn = tableName === 'opportunities' ? 'id' : (tableName === 'leads' ? 'leadid' : 'vin');

  const { error } = await supabase
    .from(tableName)
    .upsert(records, { onConflict: conflictColumn });

  if (error) throw error;
  return data.length;
};

const mergeLocalData = (currentData, newData, type) => {
  const getKey = (item) => {
    if (type === 'opportunities') return item['id'] || item['opportunityid'];
    if (type === 'leads') return item['leadid'] || item['lead id'];
    if (type === 'inventory') return item['vehicleidentificationnumber'] || item['vin'];
    return Math.random().toString();
  };

  const mergedMap = new Map(currentData.map(item => [getKey(item), item]));
  newData.forEach(item => {
    const key = getKey(item);
    if (key) mergedMap.set(key, item);
  });
  return Array.from(mergedMap.values());
};

// --- COMPONENTS ---

const ImportWizard = ({ isOpen, onClose, onDataImported, isUploading, mode }) => {
  const [file, setFile] = useState(null);
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
      if (headerString.includes('opportunity offline score') || headerString.includes('order number')) type = 'opportunities';
      else if (headerString.includes('lead id') || headerString.includes('qualification level')) type = 'leads';
      else if (headerString.includes('vehicle identification number') || headerString.includes('vin')) type = 'inventory'; 

      await onDataImported(rows, type);
      setFile(null);
      onClose();
    } catch (error) {
      alert("Error processing file: " + error.message);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden animate-fade-in-up border border-slate-200">
        <div className="bg-slate-900 px-6 py-5 flex justify-between items-center">
          <h2 className="text-white font-bold text-lg flex items-center gap-3">
            <div className="p-1.5 bg-blue-500/20 rounded-lg"><Upload className="w-5 h-5 text-blue-400" /></div>
            Import CSV to {mode === 'cloud' ? 'Supabase' : 'Local'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors p-1 hover:bg-slate-800 rounded-lg"><X className="w-6 h-6" /></button>
        </div>
        
        <div className="p-8 space-y-6">
          <div className="p-4 rounded-xl text-sm bg-blue-50 border border-blue-100 text-blue-700 leading-relaxed">
             {mode === 'cloud' ? (
                <>Sync data with your <strong>Supabase SQL Database</strong>. High performance, relational storage.</>
             ) : (
                <><strong>Local Mode:</strong> Data is saved in your browser's private storage (unreliable for large sets).</>
             )}
          </div>

          <div className="border-2 border-dashed border-slate-200 rounded-2xl p-10 hover:border-blue-500 transition-all bg-slate-50 relative group flex flex-col items-center justify-center text-center cursor-pointer">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <FileSpreadsheet className="w-8 h-8 text-blue-600" /> 
                </div>
                <div className="text-slate-900 font-bold text-xl mb-2">{file ? file.name : "Choose CSV File"}</div>
                <p className="text-slate-400 text-sm">Drag and drop or click to browse</p>
                <input type="file" accept=".csv" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={handleFileChange} />
          </div>
        </div>

        <div className="px-8 py-5 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors">Cancel</button>
          <button onClick={processFiles} disabled={isUploading || !file} className={`px-6 py-2.5 text-sm font-bold text-white rounded-xl flex items-center gap-2 transition-all shadow-lg ${isUploading || !file ? 'bg-slate-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 hover:shadow-blue-500/20'}`}>
            {isUploading ? 'Uploading...' : 'Confirm Import'}
          </button>
        </div>
      </div>
    </div>
  );
};

const ComparisonTable = ({ rows, headers, timestamp }) => (
  <div className="flex flex-col h-full">
    <div className="overflow-x-auto flex-1">
      <table className="w-full text-sm text-left border-collapse">
        <thead className="text-[10px] uppercase text-slate-400 bg-slate-50/50 border-b border-slate-100 font-bold tracking-wider">
          <tr>
            <th className="py-2.5 pl-3 w-[28%] rounded-tl-lg">Metric</th>
            <th className="py-2.5 text-right w-[18%] px-2 border-l border-slate-100/50">{headers[0] || 'Prev'}</th>
            <th className="py-2.5 text-right w-[18%] px-2 text-slate-300">%</th>
            <th className="py-2.5 text-right w-[18%] px-2 border-l border-slate-100/50">{headers[1] || 'Curr'}</th>
            <th className="py-2.5 text-right w-[18%] px-2 text-blue-400 rounded-tr-lg">%</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {rows.map((row, idx) => {
            const v1 = row.v1 || 0;
            const v2 = row.v2 || 0;
            const isUp = v2 >= v1;
            const format = (val, type) => {
               if (type === 'currency') return `₹ ${(val/100000).toFixed(1)} L`;
               return val.toLocaleString();
            };

            return (
              <tr key={idx} className="hover:bg-slate-50 transition-colors group">
                <td className="py-2.5 pl-3 font-semibold text-slate-600 flex items-center gap-2 overflow-hidden text-ellipsis whitespace-nowrap">
                   {isUp ? <ArrowUpRight className="w-3.5 h-3.5 text-emerald-500" /> : <ArrowDownRight className="w-3.5 h-3.5 text-rose-500" />}
                   <span className="truncate group-hover:text-blue-600 transition-colors" title={row.label}>{row.label}</span>
                </td>
                <td className="py-2.5 text-right text-slate-500 font-mono px-2 border-l border-slate-50 border-dashed">{format(v1, row.type)}</td>
                <td className="py-2.5 text-right text-slate-300 text-[10px] px-2">{row.sub1 || '-'}</td>
                <td className="py-2.5 text-right font-bold text-slate-800 font-mono px-2 border-l border-slate-50 border-dashed">{format(v2, row.type)}</td>
                <td className="py-2.5 text-right text-blue-600 font-bold text-[10px] px-2">{row.sub2 || '-'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    <div className="mt-auto pt-3 border-t border-slate-100 flex items-center justify-between px-1 text-[10px] text-slate-400">
      <div className="flex items-center gap-1.5"><Clock className="w-3 h-3" /> {timestamp ? new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Ready'}</div>
      <div className="text-slate-300">Auto-refresh Active</div>
    </div>
  </div>
);

// --- MAIN APPLICATION ---
export default function App() {
  const [user, setUser] = useState(null);
  const [oppData, setOppData] = useState([]);
  const [leadData, setLeadData] = useState([]);
  const [invData, setInvData] = useState([]);
  const [showImport, setShowImport] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [viewMode, setViewMode] = useState('dashboard'); 
  const [detailedMetric, setDetailedMetric] = useState('Inquiries');
  const [successMsg, setSuccessMsg] = useState(''); 
  const [timeView, setTimeView] = useState('CY'); 
  const [filters, setFilters] = useState({ model: 'All', location: 'All', consultant: 'All' });
  const [storageMode, setStorageMode] = useState(supabase ? 'cloud' : 'local');

  // --- INITIALIZATION ---
  useEffect(() => {
    if (supabase) {
      const initAuth = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        setUser(session?.user || null);
      };
      initAuth();
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        setUser(session?.user || null);
      });
      return () => subscription.unsubscribe();
    } else {
      setStorageMode('local');
    }
  }, []);

  // --- DATA FETCHING ---
  useEffect(() => {
    const loadData = async () => {
      if (storageMode === 'cloud' && user) {
        try {
          const { data: opps } = await supabase.from('opportunities').select('*').eq('user_id', user.id);
          if (opps) setOppData(opps);
          const { data: leads } = await supabase.from('leads').select('*').eq('user_id', user.id);
          if (leads) setLeadData(leads);
          const { data: inventory } = await supabase.from('inventory').select('*').eq('user_id', user.id);
          if (inventory) setInvData(inventory);
        } catch (e) { console.error("Supabase Fetch Error", e); }
      } else {
        try {
          const savedOpp = localStorage.getItem('dashboard_oppData');
          const savedLead = localStorage.getItem('dashboard_leadData');
          const savedInv = localStorage.getItem('dashboard_invData');
          if (savedOpp) setOppData(JSON.parse(savedOpp));
          if (savedLead) setLeadData(JSON.parse(savedLead));
          if (savedInv) setInvData(JSON.parse(savedInv));
        } catch (e) { console.error("Local Load Error", e); }
      }
    };
    loadData();
  }, [user, storageMode]);

  // --- DATE HELPERS ---
  const getDateObj = (dateStr) => {
      if (!dateStr) return new Date(0);
      let d = new Date(dateStr);
      if (!isNaN(d.getTime())) return d;
      const parts = dateStr.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
      if (parts) {
         d = new Date(parts[3], parts[2] - 1, parts[1]);
         if (!isNaN(d.getTime())) return d;
      }
      return new Date(0);
  };

  const getMonthStr = (dateStr) => {
    const d = getDateObj(dateStr);
    if (d.getTime() === 0) return 'Unknown';
    return d.toLocaleString('default', { month: 'short', year: '2-digit' });
  };

  const timeLabels = useMemo(() => {
    if (oppData.length === 0) return { prevLabel: 'Prev', currLabel: 'Curr' };
    let maxDate = new Date(0);
    oppData.forEach(d => {
        const date = getDateObj(d['createdon'] || d['createddate']);
        if (date > maxDate) maxDate = date;
    });
    if (maxDate.getTime() === 0) return { prevLabel: 'Prev', currLabel: 'Curr' };
    const currMonth = maxDate; 
    let prevMonth = new Date(currMonth);
    
    // Switch comparison period based on timeView (CY = MoM, LY = YoY)
    if (timeView === 'CY') {
      prevMonth.setMonth(currMonth.getMonth() - 1);
    } else {
      prevMonth.setFullYear(currMonth.getFullYear() - 1);
    }

    const currLabel = currMonth.toLocaleString('default', { month: 'short', year: '2-digit' });
    const prevLabel = prevMonth.toLocaleString('default', { month: 'short', year: '2-digit' });
    return { prevLabel, currLabel };
  }, [oppData, timeView]);

  // --- UPLOAD HANDLER ---
  const handleDataImport = async (newData, type) => {
    setIsUploading(true);
    try {
      if (storageMode === 'cloud' && user) {
         const count = await uploadToSupabase(user.id, type, newData);
         setSuccessMsg(`Synced ${count} records to Supabase SQL`);
         const { data } = await supabase.from(type).select('*').eq('user_id', user.id);
         if (type === 'opportunities') setOppData(data);
         else if (type === 'leads') setLeadData(data);
         else if (type === 'inventory') setInvData(data);
      } else {
         const current = type === 'opportunities' ? oppData : (type === 'leads' ? leadData : invData);
         const merged = mergeLocalData(current, newData, type);
         localStorage.setItem(`dashboard_${type}Data`, JSON.stringify(merged));
         if (type === 'opportunities') setOppData(merged);
         else if (type === 'leads') setLeadData(merged);
         else if (type === 'inventory') setInvData(merged);
         setSuccessMsg(`Merged ${newData.length} records Locally`);
      }
      setTimeout(() => setSuccessMsg(''), 5000);
    } catch (e) {
      alert("Import failed: " + e.message);
    } finally {
      setIsUploading(false);
    }
  };

  const clearData = async () => {
    if(window.confirm("Delete ALL data from your database?")) {
       if (storageMode === 'cloud' && user) {
          await supabase.from('opportunities').delete().eq('user_id', user.id);
          await supabase.from('leads').delete().eq('user_id', user.id);
          await supabase.from('inventory').delete().eq('user_id', user.id);
       } else {
          localStorage.removeItem('dashboard_oppData');
          localStorage.removeItem('dashboard_leadData');
          localStorage.removeItem('dashboard_invData');
       }
       setOppData([]); setLeadData([]); setInvData([]);
       setSuccessMsg("All data has been cleared.");
       setTimeout(() => setSuccessMsg(''), 3000);
    }
  };

  // --- FILTERING ---
  const getFilteredData = (data) => {
    return data.filter(item => {
      const itemLoc = (item['Dealer Code'] || item['dealercode'] || item['city'] || '').trim();
      const itemCons = (item['Assigned To'] || item['assignedto'] || item['owner'] || '').trim();
      const itemModel = (item['modellinefe'] || item['modelline'] || item['Model Line'] || '').trim();
      const matchLoc = filters.location === 'All' || itemLoc === filters.location;
      const matchCons = filters.consultant === 'All' || itemCons === filters.consultant;
      const matchModel = filters.model === 'All' || itemModel === filters.model;
      return matchLoc && matchCons && matchModel;
    });
  };

  const filteredOppData = useMemo(() => getFilteredData(oppData), [oppData, filters]);
  const filteredLeadData = useMemo(() => getFilteredData(leadData), [leadData, filters]);
  const filteredInvData = useMemo(() => getFilteredData(invData), [invData, filters]);
  
  const allDataForFilters = useMemo(() => [...oppData, ...leadData, ...invData], [oppData, leadData, invData]);
  const locationOptions = useMemo(() => [...new Set(allDataForFilters.map(d => d['Dealer Code'] || d['dealercode']).filter(Boolean))].sort(), [allDataForFilters]);
  const consultantOptions = useMemo(() => [...new Set(allDataForFilters.map(d => d['Assigned To'] || d['assignedto']).filter(Boolean))].sort(), [allDataForFilters]);
  const modelOptions = useMemo(() => [...new Set(allDataForFilters.map(d => d['modellinefe'] || d['Model Line']).filter(Boolean))].sort(), [allDataForFilters]);

  // --- METRICS ---
  const funnelStats = useMemo(() => {
    if (!timeLabels.currLabel) return [];
    const getMonthData = (label) => filteredOppData.filter(d => getMonthStr(d['createdon'] || d['createddate']) === label);
    const currData = getMonthData(timeLabels.currLabel);
    const prevData = getMonthData(timeLabels.prevLabel);
    const getMetrics = (data) => {
      const inquiries = data.length;
      const testDrives = data.filter(d => ['yes', 'completed', 'done'].includes((d['testdrivecompleted'] || '').toLowerCase())).length;
      const hotLeads = data.filter(d => parseInt(d['opportunityofflinescore'] || '0') > 80 || (d['zqualificationlevel'] || d['status'] || '').toLowerCase().includes('hot')).length;
      const bookings = data.filter(d => (d['ordernumber'] || '').trim() !== '').length;
      const retails = data.filter(d => (d['invoicedatev'] || '').trim() !== '').length;
      return { inquiries, testDrives, hotLeads, bookings, retails };
    };
    const c = getMetrics(currData);
    const p = getMetrics(prevData);
    const calcPct = (num, den) => den > 0 ? Math.round((num / den) * 100) + '%' : '0%';
    return [
      { label: 'Inquiries', v1: p.inquiries, sub1: '100%', v2: c.inquiries, sub2: '100%' },
      { label: 'Test-drives', v1: p.testDrives, sub1: calcPct(p.testDrives, p.inquiries), v2: c.testDrives, sub2: calcPct(c.testDrives, c.inquiries) },
      { label: 'Hot Leads', v1: p.hotLeads, sub1: calcPct(p.hotLeads, p.inquiries), v2: c.hotLeads, sub2: calcPct(c.hotLeads, c.inquiries) },
      { label: 'Booking Conv.', v1: p.bookings, sub1: calcPct(p.bookings, p.inquiries), v2: c.bookings, sub2: calcPct(c.bookings, c.inquiries) },
      { label: 'Retail Conv.', v1: p.retails, sub1: calcPct(p.retails, p.inquiries), v2: c.retails, sub2: calcPct(c.retails, c.inquiries) },
    ];
  }, [filteredOppData, timeLabels]);

  const inventoryStats = useMemo(() => {
    const total = filteredInvData.length;
    const open = filteredInvData.filter(d => !['book', 'allot', 'block', 'invoice'].some(k => (d['Primary Status'] || d['primarystatus'] || '').toLowerCase().includes(k))).length;
    const booked = filteredInvData.filter(d => ['allotted', 'booked', 'blocked'].some(k => (d['Primary Status'] || d['primarystatus'] || '').toLowerCase().includes(k))).length;
    const ageing = filteredInvData.filter(d => parseInt(d['Ageing Days'] || d['ageingdays'] || '0') > 90).length;
    return [
      { label: 'Total Inventory', v1: 0, v2: total },
      { label: 'Open Inventory', v1: 0, v2: open, sub2: total ? Math.round((open/total)*100)+'%' : '-' },
      { label: 'Booked Inventory', v1: 0, v2: booked, sub2: total ? Math.round((booked/total)*100)+'%' : '-' },
      { label: 'Wholesale (MTD)', v1: 0, v2: 0 },
      { label: 'Ageing (>90D)', v1: 0, v2: ageing },
    ];
  }, [filteredInvData]);

  const sourceStats = useMemo(() => {
    const sourceDataset = filteredLeadData.length > 0 ? filteredLeadData : filteredOppData;
    const currData = sourceDataset.filter(d => getMonthStr(d['createdon'] || d['createddate']) === timeLabels.currLabel);
    const counts = {};
    currData.forEach(d => { const s = d['source'] || 'Other'; counts[s] = (counts[s] || 0) + 1; });
    return Object.entries(counts).sort(([,a], [,b]) => b - a).slice(0, 5)
      .map(([label, val]) => ({ label, v1: 0, v2: val, sub2: currData.length ? Math.round((val/currData.length)*100)+'%' : '0%' }));
  }, [filteredLeadData, filteredOppData, timeLabels]);

  // --- VIEWS ---
  const DashboardView = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 animate-fade-in">
       {/* 1. Sales Funnel */}
       <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col h-full hover:shadow-xl hover:shadow-blue-500/5 transition-all group cursor-pointer" onClick={() => { setDetailedMetric('Inquiries'); setViewMode('detailed'); }}>
          <div className="flex items-center gap-3 mb-5 border-b border-slate-50 pb-4">
            <div className="bg-blue-50 p-2 rounded-xl group-hover:bg-blue-600 group-hover:text-white transition-colors"><LayoutDashboard className="w-5 h-5 text-blue-600 group-hover:text-inherit" /></div>
            <h3 className="font-bold text-slate-800 text-lg">Sales Funnel</h3>
          </div>
          <ComparisonTable rows={funnelStats} headers={[timeLabels.prevLabel, timeLabels.currLabel]} timestamp={true} />
       </div>

       {/* 2. Inventory */}
       <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col h-full hover:shadow-xl hover:shadow-indigo-500/5 transition-all group">
          <div className="flex items-center gap-3 mb-5 border-b border-slate-50 pb-4">
            <div className="bg-indigo-50 p-2 rounded-xl group-hover:bg-indigo-600 group-hover:text-white transition-colors"><Car className="w-5 h-5 text-indigo-600 group-hover:text-inherit" /></div>
            <h3 className="font-bold text-slate-800 text-lg">Inventory</h3>
          </div>
          <ComparisonTable rows={inventoryStats} headers={['', 'Total']} timestamp={true} />
       </div>

       {/* 3. Lead Source */}
       <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col h-full hover:shadow-xl hover:shadow-emerald-500/5 transition-all group">
          <div className="flex items-center gap-3 mb-5 border-b border-slate-50 pb-4">
            <div className="bg-emerald-50 p-2 rounded-xl group-hover:bg-emerald-600 group-hover:text-white transition-colors"><TrendingUp className="w-5 h-5 text-emerald-600 group-hover:text-inherit" /></div>
            <h3 className="font-bold text-slate-800 text-lg">Lead Source</h3>
          </div>
          <ComparisonTable rows={sourceStats.length ? sourceStats : [{label: 'No Data', v1:0, v2:0}]} headers={[timeLabels.prevLabel, timeLabels.currLabel]} timestamp={true} />
       </div>

       {/* 4. Cross-Sell */}
       <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col h-full hover:shadow-xl hover:shadow-purple-500/5 transition-all group">
          <div className="flex items-center gap-3 mb-5 border-b border-slate-50 pb-4">
            <div className="bg-purple-50 p-2 rounded-xl group-hover:bg-purple-600 group-hover:text-white transition-colors"><FileSpreadsheet className="w-5 h-5 text-purple-600 group-hover:text-inherit" /></div>
            <h3 className="font-bold text-slate-800 text-lg">Cross-Sell</h3>
          </div>
          <ComparisonTable rows={[
               {label: 'Car Finance', v1: 0, v2: 0},
               {label: 'Insurance', v1: 0, v2: 0},
               {label: 'Exchange/Buy-in', v1: 0, v2: 0},
               {label: 'Accessories', v1: 0, v2: 0, type: 'currency'}
           ]} headers={[timeLabels.prevLabel, timeLabels.currLabel]} timestamp={true} />
       </div>

       {/* 5. Sales Management */}
       <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col h-full hover:shadow-xl hover:shadow-orange-500/5 transition-all group">
          <div className="flex items-center gap-3 mb-5 border-b border-slate-50 pb-4">
            <div className="bg-orange-50 p-2 rounded-xl group-hover:bg-orange-600 group-hover:text-white transition-colors"><Users className="w-5 h-5 text-orange-600 group-hover:text-inherit" /></div>
            <h3 className="font-bold text-slate-800 text-lg">Sales Management</h3>
          </div>
          <ComparisonTable rows={[
               {label: 'Bookings', v1: funnelStats[3]?.v1 || 0, v2: funnelStats[3]?.v2 || 0},
               {label: 'Dlr. Retail', v1: funnelStats[4]?.v1 || 0, v2: funnelStats[4]?.v2 || 0},
               {label: 'OEM Retail', v1: 0, v2: 0},
               {label: 'POC Sales', v1: 0, v2: 0}
           ]} headers={[timeLabels.prevLabel, timeLabels.currLabel]} timestamp={true} />
       </div>

       {/* 6. Profit & Productivity */}
       <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col h-full hover:shadow-xl hover:shadow-rose-500/5 transition-all group">
          <div className="flex items-center gap-3 mb-5 border-b border-slate-50 pb-4">
            <div className="bg-rose-50 p-2 rounded-xl group-hover:bg-rose-600 group-hover:text-white transition-colors"><DollarSign className="w-5 h-5 text-rose-600 group-hover:text-inherit" /></div>
            <h3 className="font-bold text-slate-800 text-lg">Profit & Productivity</h3>
          </div>
          <ComparisonTable rows={[
               {label: 'New car Margin', v1: 0, v2: 0, type: 'currency'},
               {label: 'Margin per car', v1: 0, v2: 0},
               {label: 'Used cars Margin', v1: 0, v2: 0, type: 'currency'},
               {label: 'SC Productivity', v1: 0, v2: 0},
           ]} headers={[timeLabels.prevLabel, timeLabels.currLabel]} timestamp={true} />
       </div>
    </div>
  );

  const DetailedView = () => {
    const consultantMix = useMemo(() => {
        const counts = {};
        filteredOppData.forEach(d => { const c = d['Assigned To'] || d['assignedto']; if(c) counts[c] = (counts[c] || 0) + 1; });
        return Object.entries(counts).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value);
    }, [filteredOppData]);

    return (
      <div className="space-y-8 animate-fade-in">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => setViewMode('dashboard')} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
               <ArrowDownRight className="w-6 h-6 text-slate-500 rotate-135" />
            </button>
            <div>
              <h2 className="text-2xl font-bold text-slate-900">{detailedMetric} Deep-Dive</h2>
              <p className="text-slate-400 text-sm">Granular analysis of performance metrics</p>
            </div>
          </div>
        </div>
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
           <h3 className="font-bold text-slate-800 mb-6 text-lg">Consultant Performance Distribution</h3>
           <div className="h-96">
             <ResponsiveContainer width="100%" height="100%">
               <BarChart data={consultantMix} layout="vertical">
                 <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                 <XAxis type="number" hide />
                 <YAxis dataKey="name" type="category" width={140} tick={{fontSize: 11, fontWeight: 500}} axisLine={false} tickLine={false} />
                 <RechartsTooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                 <Bar dataKey="value" fill="#3b82f6" radius={[0, 6, 6, 0]} barSize={24} />
               </BarChart>
             </ResponsiveContainer>
           </div>
        </div>
      </div>
    );
  };

  const TableView = () => (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden animate-fade-in">
       <div className="overflow-x-auto">
         <table className="w-full text-left text-sm text-slate-600">
           <thead className="bg-slate-50/50 text-slate-400 font-bold border-b border-slate-200">
             <tr><th className="p-4 uppercase text-[10px] tracking-widest">ID / Ref</th><th className="p-4 uppercase text-[10px] tracking-widest">Customer Name</th><th className="p-4 uppercase text-[10px] tracking-widest">Model</th><th className="p-4 uppercase text-[10px] tracking-widest">Created Date</th><th className="p-4 uppercase text-[10px] tracking-widest">Status</th></tr>
           </thead>
           <tbody className="divide-y divide-slate-100">
             {(filteredOppData.length > 0 ? filteredOppData : filteredLeadData).slice(0, 100).map((row, idx) => (
               <tr key={idx} className="hover:bg-blue-50/30 transition-colors">
                 <td className="p-4 font-mono text-slate-400 text-xs">{row['id'] || row['leadid'] || row['vin']}</td>
                 <td className="p-4 font-medium text-slate-800">{row['customer'] || row['name'] || 'Anonymous'}</td>
                 <td className="p-4"><span className="px-2.5 py-1 bg-slate-100 rounded-lg text-xs font-semibold text-slate-600 border border-slate-200">{row['modellinefe'] || row['modelline'] || 'N/A'}</span></td>
                 <td className="p-4 text-slate-500">{row['createdon'] || row['createddate'] || row['grndate']}</td>
                 <td className="p-4"><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border ${row['status']?.toLowerCase().includes('won') ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>{row['status'] || row['qualificationlevel'] || row['primarystatus'] || 'Active'}</span></td>
               </tr>
             ))}
           </tbody>
         </table>
       </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50/30 font-sans pb-16">
       <GlobalStyles />
       <ImportWizard isOpen={showImport} onClose={() => setShowImport(false)} onDataImported={handleDataImport} isUploading={isUploading} mode={storageMode} />

       <header className="bg-white border-b border-slate-200 sticky top-0 z-40 backdrop-blur-md bg-white/90">
         <div className="max-w-[1600px] mx-auto px-6 h-20 flex items-center justify-between">
           <div className="flex items-center gap-4">
             <div className="w-11 h-11 bg-gradient-to-tr from-blue-600 to-blue-400 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-500/20"><Car className="w-6 h-6" /></div>
             <div>
                <h1 className="text-xl font-bold text-slate-900 leading-tight">Sales Intelligence</h1>
                <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                  <Database className="w-3 h-3" />
                  <span>{timeLabels.currLabel} Snapshot</span>
                </div>
             </div>
           </div>

           <div className="flex items-center gap-6">
              <div className={`px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-widest border transition-all ${storageMode === 'cloud' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-orange-50 text-orange-700 border-orange-200'}`}>
                 {storageMode === 'cloud' ? 'Supabase Sync On' : 'Local Storage Only'}
              </div>
              <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200 shadow-inner">
                <button onClick={() => setViewMode('dashboard')} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${viewMode === 'dashboard' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>Dashboard</button>
                <button onClick={() => setViewMode('detailed')} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${viewMode === 'detailed' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>Analytics</button>
                <button onClick={() => setViewMode('table')} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${viewMode === 'table' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>Raw Data</button>
              </div>
              <div className="h-8 w-px bg-slate-200"></div>
              <button onClick={() => setShowImport(true)} className="bg-slate-900 text-white px-5 py-2.5 rounded-xl text-xs font-bold hover:bg-slate-800 transition-all shadow-lg hover:shadow-slate-500/10 flex items-center gap-2"><Upload className="w-4 h-4" /> Import</button>
              <button onClick={clearData} className="p-2.5 text-rose-500 hover:bg-rose-50 rounded-xl transition-colors border border-transparent hover:border-rose-100" title="Delete All Data"><Trash2 className="w-5 h-5" /></button>
           </div>
         </div>
         
         {successMsg && (
           <div className="bg-emerald-50 border-y border-emerald-100 px-6 py-2.5 text-xs font-bold text-emerald-700 flex items-center justify-center gap-2 animate-fade-in">
             <CheckCircle className="w-4 h-4" /> {successMsg}
           </div>
         )}
         
         <div className="border-t border-slate-100 bg-white/50 px-6 py-3 flex items-center gap-6 overflow-x-auto">
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><Filter className="w-3 h-3" /> Filters</span>
              <select className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-blue-500/20 transition-all outline-none" value={filters.model} onChange={e => setFilters({...filters, model: e.target.value})}>
                 <option value="All">All Vehicle Models</option>
                 {modelOptions.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <select className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-blue-500/20 transition-all outline-none" value={filters.location} onChange={e => setFilters({...filters, location: e.target.value})}>
                 <option value="All">All Locations</option>
                 {locationOptions.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            
            <div className="ml-auto flex items-center gap-3">
               <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Compare Period</span>
               <div className="flex bg-slate-100 rounded-2xl border border-slate-200 p-1 shadow-inner">
                 <button onClick={() => setTimeView('CY')} className={`px-4 py-1.5 text-[10px] font-bold rounded-xl transition-all ${timeView === 'CY' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>MoM (Month-on-Month)</button>
                 <button onClick={() => setTimeView('LY')} className={`px-4 py-1.5 text-[10px] font-bold rounded-xl transition-all ${timeView === 'LY' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>YoY (Year-on-Year)</button>
               </div>
            </div>
         </div>
       </header>

       <main className="max-w-[1600px] mx-auto px-6 py-10">
         {viewMode === 'dashboard' && <DashboardView />}
         {viewMode === 'detailed' && <DetailedView />}
         {viewMode === 'table' && <TableView />}
       </main>
    </div>
  );
}
