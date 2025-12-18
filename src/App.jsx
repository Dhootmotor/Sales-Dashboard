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
  } else {
    console.warn("Supabase credentials missing. Defaulting to Local Storage.");
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
      background-color: #f8fafc;
    }

    ::-webkit-scrollbar { width: 4px; height: 4px; }
    ::-webkit-scrollbar-track { background: #f1f5f9; }
    ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
    
    .animate-fade-in { animation: fadeIn 0.3s ease-out forwards; }
    
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    
    .comparison-toggle {
      display: flex;
      background: #f1f5f9;
      padding: 2px;
      border-radius: 8px;
      cursor: pointer;
    }
    
    .comparison-toggle-item {
      padding: 4px 10px;
      font-size: 9px;
      font-weight: 700;
      border-radius: 6px;
      transition: all 0.2s ease;
    }
    
    .comparison-toggle-active {
      background: white;
      color: #2563eb;
      box-shadow: 0 1px 2px rgba(0,0,0,0.05);
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
    const keywords = ['id', 'lead id', 'order number', 'vin', 'vehicle identification number'];
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

// --- DATA HANDLERS ---
const uploadToSupabase = async (userId, tableName, data) => {
  if (!supabase) throw new Error("Supabase client not initialized.");
  
  const records = data.map(item => ({
    ...item,
    user_id: userId,
    id: tableName === 'opportunities' ? (item['id'] || item['opportunityid']) : undefined,
    leadid: tableName === 'leads' ? (item['leadid'] || item['lead id']) : undefined,
    vin: tableName === 'inventory' ? (item['vehicleidentificationnumber'] || item['Vehicle Identification Number'] || item['vin']) : undefined
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
    if (type === 'inventory') return item['vehicleidentificationnumber'] || item['Vehicle Identification Number'] || item['vin'];
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
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-fade-in border border-slate-200">
        <div className="bg-slate-900 px-5 py-4 flex justify-between items-center">
          <h2 className="text-white font-bold text-base flex items-center gap-2">
            <Upload className="w-4 h-4 text-blue-400" />
            Import CSV
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
        </div>
        
        <div className="p-6 space-y-4">
          <div className="p-3 rounded-lg text-xs bg-blue-50 border border-blue-100 text-blue-700">
             {mode === 'cloud' ? 'Syncing to Supabase SQL' : 'Saving to Local Storage'}
          </div>

          <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 hover:border-blue-500 transition-all bg-slate-50 relative group flex flex-col items-center justify-center text-center cursor-pointer">
                <FileSpreadsheet className="w-8 h-8 text-blue-600 mb-2" /> 
                <div className="text-slate-900 font-bold text-sm">{file ? file.name : "Choose CSV File"}</div>
                <input type="file" accept=".csv" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={handleFileChange} />
          </div>
        </div>

        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-lg">Cancel</button>
          <button onClick={processFiles} disabled={isUploading || !file} className={`px-5 py-2 text-xs font-bold text-white rounded-lg transition-all ${isUploading || !file ? 'bg-slate-400' : 'bg-blue-600 hover:bg-blue-700'}`}>
            {isUploading ? 'Importing...' : 'Start Import'}
          </button>
        </div>
      </div>
    </div>
  );
};

const ComparisonTable = ({ rows, headers }) => (
  <div className="flex flex-col h-full overflow-hidden">
    <table className="w-full text-xs text-left border-collapse">
      <thead className="text-[9px] uppercase text-slate-400 bg-slate-50/50 border-b border-slate-100 font-bold tracking-wider">
        <tr>
          <th className="py-2 pl-2 w-[35%]">Metric</th>
          <th className="py-2 text-right w-[15%] px-1 border-l border-slate-100/30">{headers[0] || 'Prv'}</th>
          <th className="py-2 text-right w-[15%] px-1 text-slate-300">%</th>
          <th className="py-2 text-right w-[15%] px-1 border-l border-slate-100/30">{headers[1] || 'Cur'}</th>
          <th className="py-2 text-right w-[15%] px-1 text-blue-400">%</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-50">
        {rows.map((row, idx) => {
          const v1 = row.v1 || 0;
          const v2 = row.v2 || 0;
          const isUp = v2 >= v1;
          const format = (val, type) => {
             if (type === 'currency') return `₹${(val/100000).toFixed(1)}L`;
             return val.toLocaleString();
          };

          return (
            <tr key={idx} className="hover:bg-slate-50/50 transition-colors group">
              <td className="py-1.5 pl-2 font-medium text-slate-600 flex items-center gap-1.5 truncate">
                 {isUp ? <ArrowUpRight className="w-3 h-3 text-emerald-500 shrink-0" /> : <ArrowDownRight className="w-3 h-3 text-rose-500 shrink-0" />}
                 <span className="truncate" title={row.label}>{row.label}</span>
              </td>
              <td className="py-1.5 text-right text-slate-500 font-mono px-1">{format(v1, row.type)}</td>
              <td className="py-1.5 text-right text-slate-300 text-[9px] px-1">{row.sub1 || '-'}</td>
              <td className="py-1.5 text-right font-bold text-slate-800 font-mono px-1 border-l border-slate-100/30">{format(v2, row.type)}</td>
              <td className="py-1.5 text-right text-blue-600 font-bold text-[9px] px-1">{row.sub2 || '-'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
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
        } catch (e) { console.error(e); }
      } else {
        try {
          const savedOpp = localStorage.getItem('dashboard_oppData');
          const savedLead = localStorage.getItem('dashboard_leadData');
          const savedInv = localStorage.getItem('dashboard_invData');
          if (savedOpp) setOppData(JSON.parse(savedOpp));
          if (savedLead) setLeadData(JSON.parse(savedLead));
          if (savedInv) setInvData(JSON.parse(savedInv));
        } catch (e) { console.error(e); }
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
    if (oppData.length === 0) return { prevLabel: 'Prv', currLabel: 'Cur' };
    let maxDate = new Date(0);
    oppData.forEach(d => {
        const date = getDateObj(d['createdon'] || d['createddate']);
        if (date > maxDate) maxDate = date;
    });
    if (maxDate.getTime() === 0) return { prevLabel: 'Prv', currLabel: 'Cur' };
    const currMonth = maxDate; 
    let prevMonth = new Date(currMonth);
    
    if (timeView === 'CY') prevMonth.setMonth(currMonth.getMonth() - 1);
    else prevMonth.setFullYear(currMonth.getFullYear() - 1);

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
         setSuccessMsg(`Synced ${count} to Supabase SQL`);
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
         setSuccessMsg(`Merged ${newData.length} records locally`);
      }
      setTimeout(() => setSuccessMsg(''), 5000);
    } catch (e) {
      alert("Error: " + e.message);
    } finally {
      setIsUploading(false);
    }
  };

  const clearData = async () => {
    if(window.confirm("Delete ALL data?")) {
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
       setSuccessMsg("Cleared.");
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
  const consultantOptions = useMemo(() => [...new Set(allDataForFilters.map(d => d['Assigned To'] || d['assignedto'] || d['owner']).filter(Boolean))].sort(), [allDataForFilters]);
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
    const getVal = (d, keys) => {
      for(let k of keys) {
        if (d[k] !== undefined) return d[k];
        const normalized = k.toLowerCase().replace(/ /g, '');
        if (d[normalized] !== undefined) return d[normalized];
      }
      return '';
    };

    const open = filteredInvData.filter(d => {
      const status = (getVal(d, ['Primary Status', 'Description of Primary Status', 'primarystatus']) || '').toLowerCase();
      // "Incoming Invoice Created" is an open/stock status. 
      // We filter OUT anything that means sold or booked.
      return !['book', 'allot', 'block', 'retail', 'deliver'].some(k => status.includes(k));
    }).length;

    const booked = filteredInvData.filter(d => {
      const status = (getVal(d, ['Primary Status', 'Description of Primary Status', 'primarystatus']) || '').toLowerCase();
      return ['allotted', 'booked', 'blocked'].some(k => status.includes(k));
    }).length;

    const ageing = filteredInvData.filter(d => {
      const days = parseInt(getVal(d, ['Ageing Days', 'ageingdays']) || '0');
      return days > 90;
    }).length;

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
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 animate-fade-in">
       <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-col hover:shadow-md transition-all group cursor-pointer" onClick={() => { setDetailedMetric('Inquiries'); setViewMode('detailed'); }}>
          <div className="flex items-center gap-2 mb-3 border-b border-slate-50 pb-2">
            <LayoutDashboard className="w-4 h-4 text-blue-600" />
            <h3 className="font-bold text-slate-800 text-sm">Sales Funnel</h3>
          </div>
          <ComparisonTable rows={funnelStats} headers={[timeLabels.prevLabel, timeLabels.currLabel]} />
       </div>

       <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-col hover:shadow-md transition-all">
          <div className="flex items-center gap-2 mb-3 border-b border-slate-50 pb-2">
            <Car className="w-4 h-4 text-indigo-600" />
            <h3 className="font-bold text-slate-800 text-sm">Inventory</h3>
          </div>
          <ComparisonTable rows={inventoryStats} headers={['', 'Total']} />
       </div>

       <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-col hover:shadow-md transition-all">
          <div className="flex items-center gap-2 mb-3 border-b border-slate-50 pb-2">
            <TrendingUp className="w-4 h-4 text-emerald-600" />
            <h3 className="font-bold text-slate-800 text-sm">Lead Source</h3>
          </div>
          <ComparisonTable rows={sourceStats.length ? sourceStats : [{label: 'No Data', v1:0, v2:0}]} headers={[timeLabels.prevLabel, timeLabels.currLabel]} />
       </div>

       <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-col hover:shadow-md transition-all">
          <div className="flex items-center gap-2 mb-3 border-b border-slate-50 pb-2">
            <FileSpreadsheet className="w-4 h-4 text-purple-600" />
            <h3 className="font-bold text-slate-800 text-sm">Cross-Sell</h3>
          </div>
          <ComparisonTable rows={[
               {label: 'Finance', v1: 0, v2: 0},
               {label: 'Insurance', v1: 0, v2: 0},
               {label: 'Exchange', v1: 0, v2: 0},
               {label: 'Accessories', v1: 0, v2: 0, type: 'currency'}
           ]} headers={[timeLabels.prevLabel, timeLabels.currLabel]} />
       </div>

       <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-col hover:shadow-md transition-all">
          <div className="flex items-center gap-2 mb-3 border-b border-slate-50 pb-2">
            <Users className="w-4 h-4 text-orange-600" />
            <h3 className="font-bold text-slate-800 text-sm">Sales Management</h3>
          </div>
          <ComparisonTable rows={[
               {label: 'Bookings', v1: funnelStats[3]?.v1 || 0, v2: funnelStats[3]?.v2 || 0},
               {label: 'Dlr. Retail', v1: funnelStats[4]?.v1 || 0, v2: funnelStats[4]?.v2 || 0},
               {label: 'OEM Retail', v1: 0, v2: 0},
               {label: 'POC Sales', v1: 0, v2: 0}
           ]} headers={[timeLabels.prevLabel, timeLabels.currLabel]} />
       </div>

       <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-col hover:shadow-md transition-all">
          <div className="flex items-center gap-2 mb-3 border-b border-slate-50 pb-2">
            <DollarSign className="w-4 h-4 text-rose-600" />
            <h3 className="font-bold text-slate-800 text-sm">Profit & Productivity</h3>
          </div>
          <ComparisonTable rows={[
               {label: 'New car Margin', v1: 0, v2: 0, type: 'currency'},
               {label: 'Margin per car', v1: 0, v2: 0},
               {label: 'Used car Margin', v1: 0, v2: 0, type: 'currency'},
               {label: 'Productivity', v1: 0, v2: 0},
           ]} headers={[timeLabels.prevLabel, timeLabels.currLabel]} />
       </div>
    </div>
  );

  const DetailedView = () => {
    const consultantMix = useMemo(() => {
        const counts = {};
        filteredOppData.forEach(d => { const c = d['Assigned To'] || d['assignedto'] || d['owner']; if(c) counts[c] = (counts[c] || 0) + 1; });
        return Object.entries(counts).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value);
    }, [filteredOppData]);

    const trendData = useMemo(() => {
      const months = {};
      oppData.slice(-100).forEach(d => {
        const m = getMonthStr(d['createdon'] || d['createddate']);
        months[m] = (months[m] || 0) + 1;
      });
      return Object.entries(months).map(([name, value]) => ({ name, value }));
    }, [oppData]);

    return (
      <div className="space-y-5 animate-fade-in">
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => setViewMode('dashboard')} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
               <ArrowDownRight className="w-5 h-5 text-slate-500 rotate-135" />
            </button>
            <h2 className="text-lg font-bold text-slate-900">{detailedMetric} Analytics</h2>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
             <h3 className="font-bold text-slate-800 mb-4 text-sm">Consultant Performance</h3>
             <div className="h-64">
               <ResponsiveContainer width="100%" height="100%">
                 <BarChart data={consultantMix} layout="vertical">
                   <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                   <XAxis type="number" hide />
                   <YAxis dataKey="name" type="category" width={100} tick={{fontSize: 10}} axisLine={false} tickLine={false} />
                   <RechartsTooltip cursor={{fill: '#f8fafc'}} />
                   <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={20} />
                 </BarChart>
               </ResponsiveContainer>
             </div>
          </div>

          <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
             <h3 className="font-bold text-slate-800 mb-4 text-sm">Monthly Trend</h3>
             <div className="h-64">
               <ResponsiveContainer width="100%" height="100%">
                 <LineChart data={trendData}>
                   <CartesianGrid strokeDasharray="3 3" />
                   <XAxis dataKey="name" tick={{fontSize: 10}} />
                   <YAxis tick={{fontSize: 10}} />
                   <RechartsTooltip />
                   <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} />
                 </LineChart>
               </ResponsiveContainer>
             </div>
          </div>
          
          <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 lg:col-span-2">
             <h3 className="font-bold text-slate-800 mb-4 text-sm">Source Distribution</h3>
             <div className="h-64 flex justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={sourceStats} innerRadius={50} outerRadius={80} paddingAngle={5} dataKey="v2" nameKey="label">
                      {sourceStats.map((_, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                    </Pie>
                    <RechartsTooltip />
                    <Legend iconSize={10} wrapperStyle={{fontSize: '11px'}} />
                  </PieChart>
                </ResponsiveContainer>
             </div>
          </div>
        </div>
      </div>
    );
  };

  const TableView = () => (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden animate-fade-in">
       <div className="overflow-x-auto">
         <table className="w-full text-left text-xs text-slate-600">
           <thead className="bg-slate-50/50 text-slate-400 font-bold border-b border-slate-200 uppercase tracking-tighter">
             <tr><th className="p-3">Ref ID</th><th className="p-3">Customer</th><th className="p-3">Model</th><th className="p-3">Date</th><th className="p-3">Status</th></tr>
           </thead>
           <tbody className="divide-y divide-slate-100">
             {(filteredOppData.length > 0 ? filteredOppData : filteredLeadData).slice(0, 50).map((row, idx) => (
               <tr key={idx} className="hover:bg-slate-50 transition-colors">
                 <td className="p-3 font-mono text-slate-400 text-[10px]">{row['id'] || row['leadid'] || row['vin']}</td>
                 <td className="p-3 font-medium text-slate-800">{row['customer'] || row['name'] || 'Anonymous'}</td>
                 <td className="p-3">{row['modellinefe'] || row['modelline'] || 'N/A'}</td>
                 <td className="p-3">{row['createdon'] || row['createddate']}</td>
                 <td className="p-3"><span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-[10px]">{row['status'] || row['qualificationlevel'] || 'Active'}</span></td>
               </tr>
             ))}
           </tbody>
         </table>
       </div>
    </div>
  );

  return (
    <div className="min-h-screen font-sans pb-10">
       <GlobalStyles />
       <ImportWizard isOpen={showImport} onClose={() => setShowImport(false)} onDataImported={handleDataImport} isUploading={isUploading} mode={storageMode} />

       <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
         <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
           <div className="flex items-center gap-3">
             <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white"><Car className="w-5 h-5" /></div>
             <div>
                <h1 className="text-sm font-bold text-slate-900">Sales Intelligence</h1>
                <div className="text-[9px] text-slate-400 uppercase font-bold tracking-tight">{timeLabels.currLabel} Snapshot</div>
             </div>
           </div>

           <div className="flex items-center gap-4">
              <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
                <button onClick={() => setViewMode('dashboard')} className={`px-3 py-1.5 rounded-md text-[11px] font-bold ${viewMode === 'dashboard' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>Dashboard</button>
                <button onClick={() => setViewMode('detailed')} className={`px-3 py-1.5 rounded-md text-[11px] font-bold ${viewMode === 'detailed' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>Analytics</button>
                <button onClick={() => setViewMode('table')} className={`px-3 py-1.5 rounded-md text-[11px] font-bold ${viewMode === 'table' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>Data</button>
              </div>
              <button onClick={() => setShowImport(true)} className="bg-slate-900 text-white px-4 py-1.5 rounded-lg text-[11px] font-bold hover:bg-slate-800 flex items-center gap-2"><Upload className="w-3.5 h-3.5" /> Import</button>
              <button onClick={clearData} className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
           </div>
         </div>
         
         <div className="border-t border-slate-100 bg-white px-4 py-2 flex items-center gap-4 overflow-x-auto">
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1 min-w-max"><Filter className="w-3 h-3" /> Filters:</span>
              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1">
                <UserCheck className="w-3 h-3 text-slate-400" />
                <select className="bg-transparent text-[11px] font-bold text-slate-700 outline-none min-w-[100px]" value={filters.consultant} onChange={e => setFilters({...filters, consultant: e.target.value})}>
                   <option value="All">Consultant</option>
                   {consultantOptions.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <select className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-[11px] font-bold text-slate-700 outline-none" value={filters.model} onChange={e => setFilters({...filters, model: e.target.value})}>
                 <option value="All">Models</option>
                 {modelOptions.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <select className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-[11px] font-bold text-slate-700 outline-none" value={filters.location} onChange={e => setFilters({...filters, location: e.target.value})}>
                 <option value="All">Locations</option>
                 {locationOptions.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            
            <div className="ml-auto flex items-center gap-2 min-w-max">
               <div className="comparison-toggle" onClick={() => setTimeView(timeView === 'CY' ? 'LY' : 'CY')}>
                  <div className={`comparison-toggle-item ${timeView === 'CY' ? 'comparison-toggle-active' : 'text-slate-400'}`}>CY (MoM)</div>
                  <div className={`comparison-toggle-item ${timeView === 'LY' ? 'comparison-toggle-active' : 'text-slate-400'}`}>LY (YoY)</div>
               </div>
            </div>
         </div>
       </header>

       <main className="max-w-7xl mx-auto px-4 py-6">
         {successMsg && <div className="bg-emerald-50 border border-emerald-100 rounded-lg px-4 py-2 text-[10px] font-bold text-emerald-700 mb-5 animate-fade-in flex items-center gap-2"><CheckCircle className="w-3.5 h-3.5" /> {successMsg}</div>}
         {viewMode === 'dashboard' && <DashboardView />}
         {viewMode === 'detailed' && <DetailedView />}
         {viewMode === 'table' && <TableView />}
       </main>
    </div>
  );
}
