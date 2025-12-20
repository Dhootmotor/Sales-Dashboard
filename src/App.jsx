import React, { useState, useEffect, useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line 
} from 'recharts';
import { 
  LayoutDashboard, Upload, Filter, TrendingUp, TrendingDown, 
  Users, Car, DollarSign, ChevronDown, FileSpreadsheet, 
  ArrowUpRight, ArrowDownRight, 
  Clock, X, CheckCircle, Download, Trash2, Calendar, AlertTriangle, Database, HardDrive, UserCheck, RefreshCw, DatabaseBackup, ShieldCheck, ShieldAlert
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

  // Skip garbage headers often found in MG export files
  let headerIndex = 0;
  for (let i = 0; i < Math.min(lines.length, 20); i++) {
    const rawLine = lines[i].toLowerCase();
    const keywords = ['lead id', 'order number', 'vin', 'engine number', 'engine code', 'grn date', 'opportunity id', 'lead_id'];
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
    // Flexible keys
    rawHeaders.forEach((h, i) => {
        const key = h.trim().toLowerCase();
        if (key && !row[key]) row[key] = values[i] || '';
    });
    return row;
  });

  return { rows, rawHeaders }; 
};

const getVal = (d, keys) => {
  if (!d) return '';
  for(let k of keys) {
    if (d[k] !== undefined && d[k] !== null) return String(d[k]);
    const normalized = k.toLowerCase().replace(/[\s_().-]/g, '');
    if (d[normalized] !== undefined && d[normalized] !== null) return String(d[normalized]);
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
    
    // Explicit mapping for MG CSV structure
    if (tableName === 'inventory') {
      base.enginenumber = getVal(item, ['enginenumber', 'engine number', 'engine code']).trim().toUpperCase();
      base.modelline = getVal(item, ['modelline', 'model line', 'modellinefe', 'model line(fe)']);
      base.vehicleidentificationnumber = getVal(item, ['vehicleidentificationnumber', 'vin', 'vehicle identification number']);
      base.grndate = getVal(item, ['grndate', 'grn date']);
      base.ageingdays = getVal(item, ['ageingdays', 'ageing days']);
      base.salesordernumber = getVal(item, ['salesordernumber', 'sales order number']);
      base.gstinvoiceno = getVal(item, ['gstinvoiceno', 'gst invoice no', 'gst invoice number']);
    } else if (tableName === 'opportunities') {
      base.id = getVal(item, ['id', 'opportunityid', 'opportunity id']);
      base.customer = getVal(item, ['customer', 'customername', 'customer name']);
      base.modelline = getVal(item, ['modelline', 'model line', 'modellinefe', 'model line(fe)']);
      base.createdon = getVal(item, ['createdon', 'created date', 'created_on']);
      base.testdrivecompleted = getVal(item, ['testdrivecompleted', 'test drive completed']);
      base.ordernumber = getVal(item, ['ordernumber', 'order number']);
      base.assignedto = getVal(item, ['assignedto', 'owner', 'assigned to']);
    } else if (tableName === 'leads') {
      base.leadid = getVal(item, ['leadid', 'lead id', 'lead_id']);
      base.name = getVal(item, ['name', 'customer name', 'customer']);
      base.source = getVal(item, ['source', 'source description']);
      base.qualificationlevel = getVal(item, ['qualificationlevel', 'status']);
      base.createddate = getVal(item, ['createddate', 'created on', 'created_date']);
    } else if (tableName === 'bookings') {
      // Header in delivery file is 'Engine Code'
      base.enginenumber = getVal(item, ['enginecode', 'engine code', 'enginenumber', 'engine number']).trim().toUpperCase();
      base.modeltext1 = getVal(item, ['modeltext1', 'model text 1']);
      base.ordernumber = getVal(item, ['invoice number', 'invoicenumber', 'sales order number', 'order number']);
      base.vin = getVal(item, ['vehicleidno', 'vehicle id no', 'vin']);
    }
    
    return base;
  });

  const validRecords = records.filter(r => 
    tableName === 'opportunities' ? !!r.id : 
    tableName === 'leads' ? !!r.leadid : !!r.enginenumber
  );

  if (validRecords.length === 0) throw new Error(`Mapping failed: No valid records identified for ${tableName}. Check CSV headers.`);

  const conflictColumn = tableName === 'opportunities' ? 'id' : (tableName === 'leads' ? 'leadid' : 'enginenumber');

  const { error } = await supabase
    .from(tableName)
    .upsert(validRecords, { onConflict: conflictColumn });

  if (error) {
    console.error(`Supabase persistence failed for ${tableName}:`, error);
    throw new Error(`${tableName} Sync Failure: ${error.message}`);
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
      
      // Signatures for MG specific files
      if (headerString.includes('opportunity id') || headerString.includes('test drive completed')) type = 'opportunities';
      else if (headerString.includes('engine code') || headerString.includes('order type description')) type = 'bookings';
      else if (headerString.includes('lead id') || headerString.includes('lead_id')) type = 'leads';
      else if (headerString.includes('engine number') || headerString.includes('grn date')) type = 'inventory'; 

      if (type === 'unknown') throw new Error("CSV structure unrecognized. Please use original MG EXPORT files.");

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
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200">
        <div className="bg-slate-900 px-5 py-3 flex justify-between items-center">
          <h2 className="text-white font-bold text-sm flex items-center gap-2"><Upload className="w-4 h-4 text-blue-400" /> SQL Cloud Sync</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 hover:border-blue-500 bg-slate-50 relative flex flex-col items-center justify-center text-center cursor-pointer">
                <FileSpreadsheet className="w-8 h-8 text-blue-600 mb-2" /> 
                <div className="text-slate-900 font-bold text-sm">{file ? file.name : "Select MG CSV to Sync"}</div>
                <input type="file" accept=".csv" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={handleFileChange} />
          </div>
          <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-lg border border-slate-100">
             <input type="checkbox" id="overwrite" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} className="w-4 h-4 rounded text-blue-600" />
             <label htmlFor="overwrite" className="text-[11px] font-bold text-slate-600">Start fresh (Clear table before upload)</label>
          </div>
        </div>
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-200 rounded-lg">Cancel</button>
          <button onClick={processFiles} disabled={isUploading || !file} className={`px-5 py-1.5 text-[11px] font-bold text-white rounded-lg ${isUploading ? 'bg-slate-400' : 'bg-blue-600 hover:bg-blue-700'}`}>
            {isUploading ? 'Syncing to SQL...' : 'Sync Now'}
          </button>
        </div>
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
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  
  const [timestamps, setTimestamps] = useState({ opportunities: null, leads: null, inventory: null, bookings: null });
  const [showImport, setShowImport] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [viewMode, setViewMode] = useState('dashboard'); 
  const [successMsg, setSuccessMsg] = useState(''); 
  const [timeView, setTimeView] = useState('CY'); 
  const [filters, setFilters] = useState({ model: 'All', location: 'All', consultant: 'All' });
  const [storageMode, setStorageMode] = useState(supabase ? 'cloud' : 'local');

  // --- AUTO AUTHENTICATION ---
  useEffect(() => {
    if (supabase) {
      const initAuth = async () => {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user) {
            setUser(session.user);
          } else {
            // AUTOMATIC ANONYMOUS SIGN-IN
            // This prevents "vanishing data" by ensuring we always have a stable User ID
            const { data, error } = await supabase.auth.signInAnonymously();
            if (data?.user) setUser(data.user);
          }
        } catch (e) {
          console.error("Auth Init Error:", e);
        } finally {
          setIsAuthLoading(false);
        }
      };
      initAuth();
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        setUser(session?.user || null);
      });
      return () => subscription.unsubscribe();
    } else {
      setIsAuthLoading(false);
    }
  }, []);

  // --- DATA FETCHING ---
  const loadCloudData = async (targetTable = null) => {
    if (!user || isAuthLoading) return;
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    const fetchTable = async (table, setter, key) => {
      try {
        const { data, error } = await supabase.from(table).select('*').eq('user_id', user.id);
        if (error) throw error;
        if (data) {
          setter(data);
          setTimestamps(prev => ({ ...prev, [key]: now }));
          console.log(`[SQL Sync] Fetched ${data.length} records for ${table}`);
        }
      } catch (e) { console.error(`[SQL] Error loading ${table}:`, e); }
    };

    if (targetTable) {
        const mapping = { opportunities: setOppData, leads: setLeadData, inventory: setInvData, bookings: setBookingData };
        await fetchTable(targetTable, mapping[targetTable], targetTable);
    } else {
        await Promise.all([
          fetchTable('opportunities', setOppData, 'opportunities'),
          fetchTable('leads', setLeadData, 'leads'),
          fetchTable('inventory', setInvData, 'inventory'),
          fetchTable('bookings', setBookingData, 'bookings')
        ]);
    }
  };

  // Wait for user before loading
  useEffect(() => {
    if (!isAuthLoading) {
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
    }
  }, [user, storageMode, isAuthLoading]);

  // --- HANDLERS ---
  const handleDataImport = async (newData, type, overwrite) => {
    setIsUploading(true);
    try {
      if (storageMode === 'cloud' && user) {
        if (overwrite) await supabase.from(type).delete().eq('user_id', user.id);
        const count = await uploadToSupabase(user.id, type, newData);
        setSuccessMsg(`Cloud Success: ${count} records saved.`);
        await loadCloudData(type); 
      } else {
        localStorage.setItem(`dashboard_${type}Data`, JSON.stringify(newData));
        if (type === 'opportunities') setOppData(newData);
        else if (type === 'leads') setLeadData(newData);
        else if (type === 'inventory') setInvData(newData);
        else if (type === 'bookings') setBookingData(newData);
        setSuccessMsg(`Local Cache OK.`);
      }
      setTimeout(() => setSuccessMsg(''), 5000);
    } catch (e) {
      console.error("Sync Error:", e);
      alert("Sync Failure: " + e.message);
    } finally { setIsUploading(false); }
  };

  // --- DATE HELPERS ---
  const getMonthStr = (dateStr) => {
    if (!dateStr) return 'Unknown';
    let d = new Date(dateStr);
    if (isNaN(d.getTime())) {
        const parts = String(dateStr).match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
        if (parts) d = new Date(parts[3], parts[2] - 1, parts[1]);
    }
    return isNaN(d.getTime()) ? 'Unknown' : d.toLocaleString('default', { month: 'short', year: '2-digit' });
  };

  const timeLabels = useMemo(() => {
    if (oppData.length === 0) return { prevLabel: 'Prv', currLabel: 'Cur' };
    let maxDate = new Date(0);
    oppData.forEach(d => {
      const date = new Date(getVal(d, ['createdon', 'createddate', 'createddate']));
      if (date > maxDate) maxDate = date;
    });
    const currMonth = maxDate.getTime() === 0 ? new Date() : maxDate; 
    let prevMonth = new Date(currMonth);
    if (timeView === 'CY') prevMonth.setMonth(currMonth.getMonth() - 1);
    else prevMonth.setFullYear(currMonth.getFullYear() - 1);
    return { 
      currLabel: currMonth.toLocaleString('default', { month: 'short', year: '2-digit' }), 
      prevLabel: prevMonth.toLocaleString('default', { month: 'short', year: '2-digit' }) 
    };
  }, [oppData, timeView]);

  // --- FILTERING ---
  const getFilteredData = (data, dataType) => {
    return data.filter(item => {
      if (dataType === 'inventory') {
        const itemModel = getVal(item, ['modelline']).trim();
        return filters.model === 'All' || itemModel === filters.model;
      }
      const itemLocs = [getVal(item, ['dealercode']), getVal(item, ['city'])].map(v => v.trim()).filter(Boolean);
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
      testDrives: data.filter(d => ['yes', 'completed', 'done', 'y'].includes((getVal(d, ['testdrivecompleted']) || '').toLowerCase())).length,
      bookings: data.filter(d => (getVal(d, ['ordernumber']) || '').trim() !== '').length,
      retails: data.filter(d => (getVal(d, ['gstinvoiceno']) || '').trim() !== '').length,
    });
    const c = getMetrics(currData);
    const p = getMetrics(prevDataset);
    const calcPct = (num, den) => den > 0 ? Math.round((num / den) * 100) + '%' : '0%';
    return [
      { label: 'Total Inquiries', v1: p.inquiries, sub1: '100%', v2: c.inquiries, sub2: '100%' },
      { label: 'Test-drives Done', v1: p.testDrives, sub1: calcPct(p.testDrives, p.inquiries), v2: c.testDrives, sub2: calcPct(c.testDrives, c.inquiries) },
      { label: 'Booking Conv.', v1: p.bookings, sub1: calcPct(p.bookings, p.inquiries), v2: c.bookings, sub2: calcPct(c.bookings, c.inquiries) },
      { label: 'Retail Conv.', v1: p.retails, sub1: calcPct(p.retails, p.inquiries), v2: c.retails, sub2: calcPct(c.retails, c.inquiries) },
    ];
  }, [filteredOppData, timeLabels]);

  const inventoryStats = useMemo(() => {
    const total = filteredInvData.length;
    // Harmonized engine match using both Code and Number
    const bookedEngineSet = new Set(bookingData.map(b => getVal(b, ['enginenumber']).trim().toUpperCase()).filter(Boolean));
    const checkIsBooked = (d) => {
      const eng = getVal(d, ['enginenumber']).trim().toUpperCase();
      const salesOrder = getVal(d, ['salesordernumber']).trim();
      const gstInvoice = getVal(d, ['gstinvoiceno']).trim();
      return !!salesOrder || !!gstInvoice || (eng && bookedEngineSet.has(eng));
    };
    const bookedCount = filteredInvData.filter(checkIsBooked).length;
    const ageing90 = filteredInvData.filter(d => parseInt(getVal(d, ['ageingdays']) || '0') > 90).length;
    return [
      { label: 'Physical Inventory', v1: 0, v2: total },
      { label: 'Open Available', v1: 0, v2: total - bookedCount, sub2: total ? Math.round(((total - bookedCount)/total)*100)+'%' : '-' },
      { label: 'Booked/Retails', v1: 0, v2: bookedCount, sub2: total ? Math.round((bookedCount/total)*100)+'%' : '-' },
      { label: 'High Ageing (>90d)', v1: 0, v2: ageing90 },
    ];
  }, [filteredInvData, bookingData, timeLabels]);

  return (
    <div className="min-h-screen font-sans pb-8">
       <GlobalStyles />
       <ImportWizard isOpen={showImport} onClose={() => setShowImport(false)} onDataImported={handleDataImport} isUploading={isUploading} />

       <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-sm">
         <div className="max-w-[1400px] mx-auto px-3 h-10 flex items-center justify-between">
           <div className="flex items-center gap-2">
             <div className="w-6 h-6 bg-blue-600 rounded flex items-center justify-center text-white"><LayoutDashboard className="w-3.5 h-3.5" /></div>
             <div>
                <h1 className="text-[10px] font-black text-slate-900 leading-none uppercase tracking-tighter italic flex items-center gap-1.5">
                    Sales IQ
                    {storageMode === 'cloud' && user ? (
                        <span className="flex items-center gap-1 px-1 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-[2px] font-bold text-[7px]"><ShieldCheck className="w-2 h-2" /> CLOUD SYNC</span>
                    ) : (
                        <span className="flex items-center gap-1 px-1 bg-amber-50 text-amber-600 border border-amber-100 rounded-[2px] font-bold text-[7px]"><ShieldAlert className="w-2 h-2" /> {isAuthLoading ? 'CONNECTING...' : 'LOCAL CACHE'}</span>
                    )}
                </h1>
                <div className="text-[6px] text-slate-400 uppercase font-bold tracking-widest leading-none mt-0.5">{timeLabels.currLabel} Snapshot</div>
             </div>
           </div>

           <div className="flex items-center gap-2">
              <div className="flex bg-slate-100 p-0.5 rounded border border-slate-200">
                <button onClick={() => setViewMode('dashboard')} className={`px-2 py-0.5 rounded text-[8px] font-extrabold ${viewMode === 'dashboard' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>DASHBOARD</button>
                <button onClick={() => setViewMode('table')} className={`px-2 py-0.5 rounded text-[8px] font-extrabold ${viewMode === 'table' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>INVENTORY</button>
              </div>
              <button onClick={() => setShowImport(true)} className="bg-slate-900 text-white px-2.5 py-0.5 rounded text-[8px] font-bold hover:bg-slate-800 flex items-center gap-1"><Upload className="w-2.5 h-2.5" /> SYNC CSV</button>
              <button onClick={() => loadCloudData()} className="p-0.5 text-slate-400 hover:text-blue-600 transition-colors"><RefreshCw className={`w-3 h-3 ${isUploading ? 'animate-spin' : ''}`} /></button>
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
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 animate-fade-in">
              <div className="bg-white rounded-lg card-shadow p-2 border border-transparent">
                <h3 className="font-bold text-slate-800 text-[10px] uppercase tracking-tight mb-1 border-b border-slate-50">Retail Funnel</h3>
                <div className="h-48">
                    <ComparisonTable rows={funnelStats} headers={[timeLabels.prevLabel, timeLabels.currLabel]} updatedAt={timestamps.opportunities} />
                </div>
              </div>
              <div className="bg-white rounded-lg card-shadow p-2 border border-transparent">
                <h3 className="font-bold text-slate-800 text-[10px] uppercase tracking-tight mb-1 border-b border-slate-50">Stock Analysis</h3>
                <div className="h-48">
                    <ComparisonTable rows={inventoryStats} headers={['', 'Active']} updatedAt={timestamps.inventory} />
                </div>
              </div>
              <div className="bg-white rounded-lg card-shadow p-2 border border-transparent">
                <h3 className="font-bold text-slate-800 text-[10px] uppercase tracking-tight mb-1 border-b border-slate-50">Lead Feed</h3>
                <div className="h-48 flex items-center justify-center text-[10px] text-slate-400 italic">
                   {leadData.length > 0 ? "Leads data committed to SQL Cloud" : "No marketing leads synced"}
                </div>
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
                   {invData.length === 0 && <tr><td colSpan="5" className="p-8 text-center text-slate-400 font-bold italic">No data found. Ensure CLOUD SYNC is active.</td></tr>}
                 </tbody>
               </table>
             </div>
           </div>
         )}
       </main>
    </div>
  );
}
