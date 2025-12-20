import React, { useState, useEffect, useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line 
} from 'recharts';
import { 
  LayoutDashboard, Upload, Filter, TrendingUp, TrendingDown, 
  Users, Car, DollarSign, ChevronDown, FileSpreadsheet, 
  ArrowUpRight, ArrowDownRight, 
  Clock, X, CheckCircle, Download, Trash2, Calendar, AlertTriangle, Database, HardDrive, UserCheck, RefreshCw, DatabaseBackup
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
    console.warn("Supabase credentials missing. App defaulting to Local Storage.");
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
    // Keywords for specific file types
    const keywords = ['lead id', 'order number', 'vin', 'engine number', 'engine code', 'grn date', 'opportunity id'];
    if (keywords.some(k => rawLine.includes(k))) {
      headerIndex = i;
      break;
    }
  }

  const rawHeaders = parseLine(lines[headerIndex]);
  // Strictly clean headers for internal key mapping
  const headers = rawHeaders.map(h => h.toLowerCase().trim().replace(/[\s_().-]/g, ''));
  
  const rows = lines.slice(headerIndex + 1).map((line) => {
    const values = parseLine(line);
    const row = {};
    headers.forEach((h, i) => { if (h) row[h] = values[i] || ''; });
    // Also store lowercase spaced version for flexibility
    rawHeaders.forEach((h, i) => {
        const key = h.trim().toLowerCase();
        if (key && !row[key]) row[key] = values[i] || '';
    });
    return row;
  });

  return { rows, rawHeaders }; 
};

// Extremely robust getter for CSV/SQL objects
const getVal = (d, keys) => {
  if (!d) return '';
  for(let k of keys) {
    // Try provided key as-is
    if (d[k] !== undefined && d[k] !== null) return String(d[k]);
    // Try normalized version (lowercase, no spaces)
    const normalized = k.toLowerCase().replace(/[\s_().-]/g, '');
    if (d[normalized] !== undefined && d[normalized] !== null) return String(d[normalized]);
    // Try lowercase with spaces
    const lower = k.toLowerCase().trim();
    if (d[lower] !== undefined && d[lower] !== null) return String(d[lower]);
  }
  return '';
};

// --- DATA HANDLERS ---
const uploadToSupabase = async (userId, tableName, data) => {
  if (!supabase) throw new Error("Supabase client not initialized.");
  
  const records = data.map(item => {
    const base = { user_id: userId };
    
    // Logic: Map common automotive identifiers to standardized SQL columns
    if (tableName === 'inventory') {
      base.enginenumber = getVal(item, ['enginenumber', 'engine number', 'engine code']).trim().toUpperCase();
      base.modelline = getVal(item, ['modelline', 'model line']);
      base.modelsalescode = getVal(item, ['modelsalescode', 'model sales code']);
      base.vehicleidentificationnumber = getVal(item, ['vehicleidentificationnumber', 'vin', 'vehicle identification number']);
      base.grndate = getVal(item, ['grndate', 'grn date']);
      base.ageingdays = getVal(item, ['ageingdays', 'ageing days']);
      base.salesordernumber = getVal(item, ['salesordernumber', 'sales order number']);
      base.gstinvoiceno = getVal(item, ['gstinvoiceno', 'gst invoice no', 'gst invoice number']);
      base.colordescription = getVal(item, ['colordescription', 'color description', 'color']);
    } else if (tableName === 'opportunities') {
      base.id = getVal(item, ['id', 'opportunityid', 'opportunity id']);
      base.customer = getVal(item, ['customer', 'customername', 'customer name']);
      base.modelline = getVal(item, ['modelline', 'model line']);
      base.createdon = getVal(item, ['createdon', 'createddate', 'document date']);
      base.testdrivecompleted = getVal(item, ['testdrivecompleted', 'test drive vehicle']);
      base.ordernumber = getVal(item, ['ordernumber', 'sales order number', 'salesorder']);
      base.assignedto = getVal(item, ['assignedto', 'owner', 'employee name']);
    } else if (tableName === 'leads') {
      base.leadid = getVal(item, ['leadid', 'lead id', 'lead_id']);
      base.name = getVal(item, ['name', 'customer name', 'customer']);
      base.source = getVal(item, ['source', 'source description']);
      base.qualificationlevel = getVal(item, ['qualificationlevel', 'status']);
    } else if (tableName === 'bookings') {
      // Header in delivery file is 'Engine Code'
      base.enginenumber = getVal(item, ['enginecode', 'engine code', 'enginenumber', 'engine number']).trim().toUpperCase();
      base.modeltext1 = getVal(item, ['modeltext1', 'model text 1']);
      base.ordernumber = getVal(item, ['invoice number', 'invoicenumber', 'ordernumber', 'sales order number']);
      base.vin = getVal(item, ['vehicleidno', 'vehicle id no', 'vin']);
    }
    
    return base;
  });

  // Critical: Only send records with valid unique identifiers
  const validRecords = records.filter(r => {
    if (tableName === 'opportunities') return !!r.id;
    if (tableName === 'leads') return !!r.leadid;
    return !!r.enginenumber;
  });

  if (validRecords.length === 0) {
    throw new Error(`No valid data found in CSV for table ${tableName}. Please check headers.`);
  }

  const conflictColumn = tableName === 'opportunities' ? 'id' : (tableName === 'leads' ? 'leadid' : 'enginenumber');

  const { error } = await supabase
    .from(tableName)
    .upsert(validRecords, { onConflict: conflictColumn });

  if (error) {
    console.error(`Supabase persistence failed for ${tableName}:`, error);
    throw new Error(`${tableName} Sync Failed: ${error.message}`);
  }
  return validRecords.length;
};

// --- COMPONENTS ---
const ImportWizard = ({ isOpen, onClose, onDataImported, isUploading }) => {
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
      
      // Intelligent detection based on specific file signatures
      if (headerString.includes('opportunity id') || headerString.includes('test drive vehicle')) type = 'opportunities';
      else if (headerString.includes('engine code') || headerString.includes('model text 1')) type = 'bookings';
      else if (headerString.includes('lead id') || headerString.includes('lead_id')) type = 'leads';
      else if (headerString.includes('engine number') || headerString.includes('grn date') || headerString.includes('ageing days')) type = 'inventory'; 

      if (type === 'unknown') throw new Error("CSV structure unrecognized. Please ensure you are uploading the 'EXPORT' format files.");

      await onDataImported(rows, type, overwrite);
      setFile(null);
      onClose();
    } catch (error) {
      alert("Import Error: " + error.message);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center backdrop-blur-sm px-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-fade-in border border-slate-200">
        <div className="bg-slate-900 px-5 py-3 flex justify-between items-center">
          <h2 className="text-white font-bold text-sm flex items-center gap-2">
            <Upload className="w-4 h-4 text-blue-400" /> Sync Master Data
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        
        <div className="p-5 space-y-4">
          <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 hover:border-blue-500 transition-all bg-slate-50 relative flex flex-col items-center justify-center text-center cursor-pointer">
                <FileSpreadsheet className="w-8 h-8 text-blue-600 mb-2" /> 
                <div className="text-slate-900 font-bold text-sm">{file ? file.name : "Select Inventory or Booking CSV"}</div>
                <input type="file" accept=".csv" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={handleFileChange} />
          </div>

          <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-lg border border-slate-100">
             <input type="checkbox" id="overwrite" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} className="w-4 h-4 rounded text-blue-600" />
             <label htmlFor="overwrite" className="text-[11px] font-bold text-slate-600 cursor-pointer">Clear existing SQL records before sync</label>
          </div>
        </div>

        <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-200 rounded-lg">Cancel</button>
          <button onClick={processFiles} disabled={isUploading || !file} className={`px-5 py-1.5 text-[11px] font-bold text-white rounded-lg transition-all ${isUploading || !file ? 'bg-slate-400' : 'bg-blue-600 hover:bg-blue-700'}`}>
            {isUploading ? 'Updating SQL...' : 'Sync to Cloud'}
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
        {rows.map((row, idx) => (
          <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
            <td className="py-1 pl-2 font-medium text-slate-600 flex items-center gap-1 truncate text-[11px]">
               {row.v2 >= row.v1 ? <ArrowUpRight className="w-2.5 h-2.5 text-emerald-500" /> : <ArrowDownRight className="w-2.5 h-2.5 text-rose-500" />}
               <span className="truncate">{row.label}</span>
            </td>
            <td className="py-1 text-right text-slate-500 font-mono text-[10px] px-1">{row.type === 'currency' ? `₹${(row.v1/100000).toFixed(1)}L` : row.v1.toLocaleString()}</td>
            <td className="py-1 text-right text-slate-300 text-[8px] px-1">{row.sub1 || '-'}</td>
            <td className="py-1 text-right font-bold text-slate-900 font-mono text-[10px] px-1 border-l border-slate-50/50">{row.type === 'currency' ? `₹${(row.v2/100000).toFixed(1)}L` : row.v2.toLocaleString()}</td>
            <td className="py-1 text-right text-blue-600 font-bold text-[9px] px-1">{row.sub2 || '-'}</td>
          </tr>
        ))}
      </tbody>
    </table>
    <div className="mt-auto pt-1.5 border-t border-slate-100 flex items-center justify-end px-1 text-[8px] text-slate-400 gap-1 font-bold uppercase">
       <Database className="w-2 h-2" /> <span>SQL Sync: {updatedAt || 'N/A'}</span>
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
  
  const [timestamps, setTimestamps] = useState({ opportunities: null, leads: null, inventory: null, bookings: null });
  const [showImport, setShowImport] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [viewMode, setViewMode] = useState('dashboard'); 
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
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user || null));
      return () => subscription.unsubscribe();
    }
  }, []);

  // --- DATA FETCHING ---
  const loadCloudData = async () => {
    if (!user) return;
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    try {
      const fetchSet = async (table, setter, key) => {
        const { data, error } = await supabase.from(table).select('*').eq('user_id', user.id);
        if (error) throw error;
        if (data) {
          setter(data);
          setTimestamps(prev => ({ ...prev, [key]: now }));
          console.log(`[Persistence] Loaded ${data.length} records for ${table}`);
        }
      };
      await Promise.all([
        fetchSet('opportunities', setOppData, 'opportunities'),
        fetchSet('leads', setLeadData, 'leads'),
        fetchSet('inventory', setInvData, 'inventory'),
        fetchSet('bookings', setBookingData, 'bookings')
      ]);
    } catch (e) { 
        console.error("Persistence Load Error:", e);
        setSuccessMsg(`Fetch Error: ${e.message}`);
    }
  };

  useEffect(() => {
    if (storageMode === 'cloud' && user) {
      loadCloudData();
    } else if (storageMode === 'local') {
      const savedOpp = localStorage.getItem('dashboard_oppData');
      const savedLead = localStorage.getItem('dashboard_leadData');
      const savedInv = localStorage.getItem('dashboard_invData');
      const savedBks = localStorage.getItem('dashboard_bookingData');
      if (savedOpp) setOppData(JSON.parse(savedOpp));
      if (savedLead) setLeadData(JSON.parse(savedLead));
      if (savedInv) setInvData(JSON.parse(savedInv));
      if (savedBks) setBookingData(JSON.parse(savedBks));
    }
  }, [user, storageMode]);

  // --- DATE HELPERS ---
  const getDateObj = (dateStr) => {
    if (!dateStr) return new Date(0);
    let d = new Date(dateStr);
    if (!isNaN(d.getTime())) return d;
    const parts = String(dateStr).match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
    if (parts) {
      d = new Date(parts[3], parts[2] - 1, parts[1]);
      if (!isNaN(d.getTime())) return d;
    }
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
      const date = getDateObj(getVal(d, ['createdon']));
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

  // --- UPLOAD HANDLER ---
  const handleDataImport = async (newData, type, overwrite) => {
    setIsUploading(true);
    try {
      if (storageMode === 'cloud' && user) {
        if (overwrite) await supabase.from(type).delete().eq('user_id', user.id);
        const count = await uploadToSupabase(user.id, type, newData);
        setSuccessMsg(`SQL Sync Successful: ${count} records saved.`);
        await loadCloudData(); 
      } else {
        // For local storage, we also apply normalization to ensure keys match components
        const mapped = newData.map(item => {
           const row = {};
           Object.keys(item).forEach(k => row[k.toLowerCase().replace(/[\s_().-]/g, '')] = item[k]);
           return row;
        });
        localStorage.setItem(`dashboard_${type}Data`, JSON.stringify(mapped));
        if (type === 'opportunities') setOppData(mapped);
        else if (type === 'leads') setLeadData(mapped);
        else if (type === 'inventory') setInvData(mapped);
        else if (type === 'bookings') setBookingData(mapped);
        setSuccessMsg(`Saved Locally: ${mapped.length} records.`);
      }
      setTimeout(() => setSuccessMsg(''), 5000);
    } catch (e) {
      console.error("Sync Error:", e);
      alert("Sync Failure: " + e.message);
    } finally { setIsUploading(false); }
  };

  // --- FILTERING ---
  const getFilteredData = (data, dataType) => {
    return data.filter(item => {
      if (dataType === 'inventory') {
        const itemModel = getVal(item, ['modelline']).trim();
        return filters.model === 'All' || itemModel === filters.model;
      }
      const itemLocs = [getVal(item, ['dealercode']), getVal(item, ['branchname']), getVal(item, ['city'])].map(v => v.trim()).filter(Boolean);
      const matchLoc = filters.location === 'All' || itemLocs.includes(filters.location);
      const itemModel = getVal(item, ['modelline']).trim();
      const matchModel = filters.model === 'All' || itemModel === filters.model;
      const itemCons = getVal(item, ['assignedto']).trim();
      const matchCons = filters.consultant === 'All' || itemCons === filters.consultant;
      return matchLoc && matchCons && matchModel;
    });
  };

  const filteredOppData = useMemo(() => getFilteredData(oppData, 'opportunities'), [oppData, filters]);
  const filteredLeadData = useMemo(() => getFilteredData(leadData, 'leads'), [leadData, filters]);
  const filteredInvData = useMemo(() => getFilteredData(invData, 'inventory'), [invData, filters]);
  
  const locationOptions = useMemo(() => [...new Set([...oppData, ...leadData].map(d => getVal(d, ['dealercode', 'city'])))].filter(Boolean).sort(), [oppData, leadData]);
  const consultantOptions = useMemo(() => [...new Set(oppData.map(d => getVal(d, ['assignedto'])))].filter(Boolean).sort(), [oppData]);
  const modelOptions = useMemo(() => [...new Set([...oppData, ...invData].map(d => getVal(d, ['modelline'])))].filter(Boolean).sort(), [oppData, invData]);

  // --- METRICS ---
  const funnelStats = useMemo(() => {
    if (!timeLabels.currLabel) return [];
    const getMonthData = (label) => filteredOppData.filter(d => getMonthStr(getVal(d, ['createdon'])) === label);
    const currData = getMonthData(timeLabels.currLabel);
    const prevDataset = filteredOppData.filter(d => getMonthStr(getVal(d, ['createdon'])) === timeLabels.prevLabel);
    const getMetrics = (data) => ({
      inquiries: data.length,
      testDrives: data.filter(d => ['yes', 'completed', 'done'].includes((getVal(d, ['testdrivecompleted']) || '').toLowerCase())).length,
      hotLeads: data.filter(d => parseInt(getVal(d, ['opportunityofflinescore']) || '0') > 80).length,
      bookings: data.filter(d => (getVal(d, ['ordernumber']) || '').trim() !== '').length,
      retails: data.filter(d => (getVal(d, ['gstinvoiceno']) || '').trim() !== '').length,
    });
    const c = getMetrics(currData);
    const p = getMetrics(prevDataset);
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
    // Map engine numbers from bookings cross-reference
    const bookedEngineSet = new Set(bookingData.map(b => getVal(b, ['enginenumber']).trim().toUpperCase()).filter(Boolean));
    const checkIsBooked = (d) => {
      const eng = getVal(d, ['enginenumber']).trim().toUpperCase();
      const salesOrder = getVal(d, ['salesordernumber']).trim();
      const gstInvoice = getVal(d, ['gstinvoiceno']).trim();
      return !!salesOrder || !!gstInvoice || (eng && bookedEngineSet.has(eng));
    };
    const bookedCount = filteredInvData.filter(checkIsBooked).length;
    const openingStock = filteredInvData.filter(d => getMonthStr(getVal(d, ['grndate'])) !== timeLabels.currLabel && !checkIsBooked(d)).length;
    const ageing90 = filteredInvData.filter(d => parseInt(getVal(d, ['ageingdays']) || '0') > 90).length;
    return [
      { label: 'Total Inventory', v1: 0, v2: total },
      { label: 'Opening Stock', v1: 0, v2: openingStock, sub2: total ? Math.round((openingStock/total)*100)+'%' : '-' },
      { label: 'Available Stock', v1: 0, v2: total - bookedCount, sub2: total ? Math.round(((total - bookedCount)/total)*100)+'%' : '-' },
      { label: 'Customer Booked', v1: 0, v2: bookedCount, sub2: total ? Math.round((bookedCount/total)*100)+'%' : '-' },
      { label: 'Ageing (>90 Days)', v1: 0, v2: ageing90 },
    ];
  }, [filteredInvData, bookingData, timeLabels]);

  const sourceStats = useMemo(() => {
    const sourceDataset = filteredLeadData.length > 0 ? filteredLeadData : filteredOppData;
    const currData = sourceDataset.filter(d => getMonthStr(getVal(d, ['createddate', 'createdon'])) === timeLabels.currLabel);
    const counts = {};
    currData.forEach(d => { const s = getVal(d, ['source']) || 'Other'; counts[s] = (counts[s] || 0) + 1; });
    return Object.entries(counts).sort(([,a], [,b]) => b - a).slice(0, 5)
      .map(([label, val]) => ({ label, v1: 0, v2: val, sub2: currData.length ? Math.round((val/currData.length)*100)+'%' : '0%' }));
  }, [filteredLeadData, filteredOppData, timeLabels]);

  return (
    <div className="min-h-screen font-sans pb-8">
       <GlobalStyles />
       <ImportWizard isOpen={showImport} onClose={() => setShowImport(false)} onDataImported={handleDataImport} isUploading={isUploading} />

       <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-sm">
         <div className="max-w-[1400px] mx-auto px-3 h-10 flex items-center justify-between">
           <div className="flex items-center gap-2">
             <div className="w-6 h-6 bg-blue-600 rounded flex items-center justify-center text-white"><DatabaseBackup className="w-3.5 h-3.5" /></div>
             <div>
                <h1 className="text-[10px] font-black text-slate-900 leading-none uppercase tracking-tighter italic">Sales IQ SQL</h1>
                <div className="text-[6px] text-slate-400 uppercase font-bold tracking-widest leading-none mt-0.5">{timeLabels.currLabel} CLOUD SNAPSHOT</div>
             </div>
           </div>

           <div className="flex items-center gap-2">
              <div className="flex bg-slate-100 p-0.5 rounded border border-slate-200">
                <button onClick={() => setViewMode('dashboard')} className={`px-2 py-0.5 rounded text-[8px] font-extrabold ${viewMode === 'dashboard' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>DASHBOARD</button>
                <button onClick={() => setViewMode('table')} className={`px-2 py-0.5 rounded text-[8px] font-extrabold ${viewMode === 'table' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>RECORDS</button>
              </div>
              <button onClick={() => setShowImport(true)} className="bg-slate-900 text-white px-2.5 py-0.5 rounded text-[8px] font-bold hover:bg-slate-800 flex items-center gap-1"><Upload className="w-2.5 h-2.5" /> SYNC CSV</button>
              <button onClick={loadCloudData} className="p-0.5 text-slate-400 hover:text-blue-600 rounded transition-colors"><RefreshCw className={`w-3 h-3 ${isUploading ? 'animate-spin' : ''}`} /></button>
           </div>
         </div>
         
         <div className="border-t border-slate-100 bg-white px-3 py-1 flex items-center gap-2.5 overflow-x-auto no-scrollbar">
            <div className="flex items-center gap-2">
              <span className="text-[7px] font-black text-slate-400 uppercase flex items-center gap-1 min-w-max"><Filter className="w-2 h-2" /> FILTERS</span>
              <select className="bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-[8px] font-bold text-slate-700 outline-none h-5" value={filters.model} onChange={e => setFilters({...filters, model: e.target.value})}>
                 <option value="All">All Models</option>
                 {modelOptions.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <select className="bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-[8px] font-bold text-slate-700 outline-none h-5" value={filters.location} onChange={e => setFilters({...filters, location: e.target.value})}>
                 <option value="All">All Branches</option>
                 {locationOptions.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <div className="ml-auto flex items-center gap-1.5 min-w-max">
               <div className="comparison-toggle" onClick={() => setTimeView(timeView === 'CY' ? 'LY' : 'CY')}>
                  <div className={`comparison-toggle-item ${timeView === 'CY' ? 'comparison-toggle-active' : 'text-slate-500'}`}>MoM</div>
                  <div className={`comparison-toggle-item ${timeView === 'LY' ? 'comparison-toggle-active' : 'text-slate-500'}`}>YoY</div>
               </div>
            </div>
         </div>
       </header>

       <main className="max-w-[1400px] mx-auto px-3 py-2.5">
         {successMsg && <div className="bg-emerald-600 text-white rounded shadow-sm px-3 py-1 text-[9px] font-black mb-2 animate-fade-in flex items-center gap-2 uppercase tracking-wide"><CheckCircle className="w-2.5 h-2.5" /> {successMsg}</div>}
         
         {viewMode === 'dashboard' && (
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              <div className="bg-white rounded-lg card-shadow p-2 flex flex-col border border-transparent transition-all">
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
                  <h3 className="font-bold text-slate-800 text-[10px] uppercase tracking-tight">Lead Channels</h3>
                </div>
                <ComparisonTable rows={sourceStats.length ? sourceStats : [{label: 'No Data', v1:0, v2:0}]} headers={[timeLabels.prevLabel, timeLabels.currLabel]} updatedAt={timestamps.leads} />
              </div>
           </div>
         )}

         {viewMode === 'table' && (
           <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden animate-fade-in">
             <div className="overflow-x-auto">
               <table className="w-full text-left text-[10px] text-slate-600">
                 <thead className="bg-slate-50 text-slate-400 font-bold border-b border-slate-200 uppercase tracking-tighter">
                   <tr><th className="p-2">Engine #</th><th className="p-2">Model</th><th className="p-2">VIN</th><th className="p-2">Status</th><th className="p-2">Ageing</th></tr>
                 </thead>
                 <tbody className="divide-y divide-slate-100">
                   {invData.slice(0, 50).map((row, idx) => (
                     <tr key={idx} className="hover:bg-slate-50 transition-colors">
                       <td className="p-2 font-mono text-slate-900 font-bold">{getVal(row, ['enginenumber'])}</td>
                       <td className="p-2">{getVal(row, ['modelline'])}</td>
                       <td className="p-2 text-slate-400 text-[8px]">{getVal(row, ['vehicleidentificationnumber'])}</td>
                       <td className="p-2">
                          <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${getVal(row, ['salesordernumber']) ? 'bg-orange-100 text-orange-700' : 'bg-emerald-100 text-emerald-700'}`}>
                            {getVal(row, ['salesordernumber']) ? 'BOOKED' : 'OPEN'}
                          </span>
                       </td>
                       <td className="p-2 font-mono">{getVal(row, ['ageingdays'])}d</td>
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
