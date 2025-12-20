import React, { useState, useEffect, useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line 
} from 'recharts';
import { 
  LayoutDashboard, Upload, Filter, TrendingUp, Users, Car, DollarSign, 
  FileSpreadsheet, ArrowUpRight, ArrowDownRight, 
  Clock, X, CheckCircle, Trash2, UserCheck
} from 'lucide-react';

/**
 * Supabase Client Initialization
 * The environment provides credentials via window or import.meta
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';

const supabaseUrl = (typeof window !== 'undefined' ? window.VITE_SUPABASE_URL : '') || '';
const supabaseAnonKey = (typeof window !== 'undefined' ? window.VITE_SUPABASE_ANON_KEY : '') || '';

const supabase = (supabaseUrl && supabaseAnonKey) ? createClient(supabaseUrl, supabaseAnonKey) : null;

// --- STYLES ---
const GlobalStyles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
    body { font-family: 'Inter', sans-serif; background-color: #f8fafc; color: #0f172a; margin: 0; }
    .card-shadow { box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1); }
    .animate-fade-in { animation: fadeIn 0.3s ease-out forwards; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
    .no-scrollbar::-webkit-scrollbar { display: none; }
    .comparison-toggle { display: flex; background: #e2e8f0; padding: 2px; border-radius: 6px; cursor: pointer; }
    .comparison-toggle-item { padding: 4px 10px; font-size: 10px; font-weight: 800; border-radius: 4px; transition: all 0.2s; }
    .comparison-toggle-active { background: white; color: #2563eb; box-shadow: 0 1px 2px rgba(0,0,0,0.1); }
  `}</style>
);

const COLORS = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

// --- HELPERS ---
const parseCSV = (text) => {
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length < 2) return { rows: [], rawHeaders: [] };
  
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

  const rawHeaders = parseLine(lines[0]);
  const rows = lines.slice(1).map(line => {
    const values = parseLine(line);
    const row = {};
    rawHeaders.forEach((h, i) => { row[h.trim()] = values[i] || ''; });
    return row;
  });
  return { rows, rawHeaders };
};

const getVal = (item, keys) => {
  if (!item) return '';
  // Check if item is from Supabase (has .data property)
  const d = item.data || item;
  for (let k of keys) {
    if (d[k] !== undefined && d[k] !== null) return String(d[k]);
    // Try lowercase/normalized keys
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
  const parts = String(dateStr).match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (parts) return new Date(parts[3], parts[2] - 1, parts[1]);
  return new Date(0);
};

const getMonthStr = (dateStr) => {
  const d = getDateObj(dateStr);
  if (d.getTime() === 0) return 'Unknown';
  return d.toLocaleString('default', { month: 'short', year: '2-digit' });
};

// --- COMPONENTS ---
const ComparisonTable = ({ rows, headers, updatedAt }) => (
  <div className="flex flex-col h-full">
    <table className="w-full text-[11px] text-left border-separate border-spacing-0">
      <thead className="text-[9px] uppercase text-slate-400 bg-slate-50 font-bold tracking-wider">
        <tr>
          <th className="py-2 pl-2 border-b border-slate-100">Metric</th>
          <th className="py-2 text-right px-1 border-b border-slate-100">{headers[0] || 'Prv'}</th>
          <th className="py-2 text-right px-1 border-b border-slate-100">{headers[1] || 'Cur'}</th>
          <th className="py-2 text-right pr-2 border-b border-slate-100">Var</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-50">
        {rows.map((row, idx) => {
          const v1 = row.v1 || 0;
          const v2 = row.v2 || 0;
          const diff = v2 - v1;
          const format = (val) => row.type === 'currency' ? `₹${(val/100000).toFixed(1)}L` : val.toLocaleString();
          
          return (
            <tr key={idx} className="hover:bg-slate-50 transition-colors">
              <td className="py-2 pl-2 font-medium text-slate-700 truncate max-w-[120px]" title={row.label}>{row.label}</td>
              <td className="py-2 text-right text-slate-500 font-mono">{format(v1)}</td>
              <td className="py-2 text-right font-bold text-slate-900 font-mono">{format(v2)}</td>
              <td className="py-2 text-right pr-2 font-bold text-[9px]">
                <span className={diff >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                  {diff > 0 ? '+' : ''}{diff}
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
    <div className="mt-auto pt-2 border-t border-slate-100 flex items-center justify-between px-2 text-[8px] text-slate-400 font-bold uppercase">
       <span>Last Sync</span>
       <span className="flex items-center gap-1"><Clock className="w-2 h-2" /> {updatedAt || 'N/A'}</span>
    </div>
  </div>
);

const ImportWizard = ({ isOpen, onClose, onImport, isUploading }) => {
  const [file, setFile] = useState(null);
  
  if (!isOpen) return null;

  const handleProcess = async () => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      const { rows, rawHeaders } = parseCSV(e.target.result);
      const headerStr = rawHeaders.join(',').toLowerCase();
      
      let type = 'unknown';
      if (headerStr.includes('opportunity offline score')) type = 'opportunities';
      else if (headerStr.includes('booking to delivery') || headerStr.includes('model text 1')) type = 'bookings';
      else if (headerStr.includes('lead id') || headerStr.includes('qualification level')) type = 'leads';
      else if (headerStr.includes('vehicle identification number') || headerStr.includes('vin')) type = 'inventory';

      await onImport(rows, type);
      setFile(null);
      onClose();
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-fade-in">
        <div className="p-4 border-b flex justify-between items-center">
          <h3 className="font-bold text-slate-800 text-sm uppercase">Import Master Data</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6">
          <div className="border-2 border-dashed border-slate-200 rounded-lg p-10 text-center hover:border-blue-400 transition-colors relative">
            <Upload className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-xs font-bold text-slate-500">{file ? file.name : 'Select CSV File'}</p>
            <input type="file" accept=".csv" className="absolute inset-0 opacity-0 cursor-pointer" onChange={e => setFile(e.target.files[0])} />
          </div>
          <p className="mt-4 text-[10px] text-slate-400 italic">System detects data type (Inventory, Leads, etc.) automatically based on headers.</p>
        </div>
        <div className="p-4 bg-slate-50 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-xs font-bold text-slate-500">Cancel</button>
          <button 
            disabled={!file || isUploading} 
            onClick={handleProcess}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 disabled:bg-slate-300"
          >
            {isUploading ? 'Uploading...' : 'Sync Data'}
          </button>
        </div>
      </div>
    </div>
  );
};

// --- MAIN APP ---
export default function App() {
  const [user, setUser] = useState(null);
  const [data, setData] = useState({ opportunities: [], leads: [], inventory: [], bookings: [] });
  const [ts, setTs] = useState({});
  const [showImport, setShowImport] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [view, setView] = useState('dashboard');
  const [timeView, setTimeView] = useState('CY');
  const [filters, setFilters] = useState({ model: 'All', sc: 'All' });
  const [msg, setMsg] = useState('');

  // 1. Auth & Data Init
  useEffect(() => {
    if (!supabase) return;
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user || null);
    };
    init();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => setUser(session?.user || null));
    return () => subscription.unsubscribe();
  }, []);

  const fetchData = async () => {
    if (!supabase || !user) return;
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const tables = ['opportunities', 'leads', 'inventory', 'bookings'];
    const newData = { ...data };
    const newTs = { ...ts };

    for (const table of tables) {
      const { data: records } = await supabase.from(table).select('*').eq('user_id', user.id);
      if (records) {
        newData[table] = records;
        newTs[table] = now;
      }
    }
    setData(newData);
    setTs(newTs);
  };

  useEffect(() => { fetchData(); }, [user]);

  // 2. Data Upload Logic (ALIGN WITH YOUR SQL SCHEMA)
  const handleImport = async (rows, type) => {
    if (!supabase || !user) {
      alert("Please ensure Supabase is configured and you are logged in.");
      return;
    }
    setIsUploading(true);
    try {
      // Wrap CSV row into the 'data' JSONB column as per your schema
      const payload = rows.map(row => {
        const item = { user_id: user.id, data: row };
        // Map primary keys for upsert
        if (type === 'opportunities') item.id = getVal(row, ['opportunityid', 'id']);
        if (type === 'leads') item.leadid = getVal(row, ['lead id', 'leadid']);
        if (type === 'inventory') item.vin = getVal(row, ['vin', 'Vehicle Identification Number']);
        return item;
      });

      const { error } = await supabase.from(type).upsert(payload);
      if (error) throw error;
      
      setMsg(`Successfully synced ${rows.length} ${type} records.`);
      await fetchData();
      setTimeout(() => setMsg(''), 4000);
    } catch (err) {
      alert("Upload error: " + err.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleClear = async () => {
    if (!confirm("Clear all data from database?")) return;
    try {
      const tables = ['opportunities', 'leads', 'inventory', 'bookings'];
      for (const t of tables) await supabase.from(t).delete().eq('user_id', user.id);
      await fetchData();
      setMsg("Database cleared.");
    } catch (err) { alert(err.message); }
  };

  // 3. Analytics & Filtering
  const filteredData = useMemo(() => {
    const filterFn = (item) => {
      const m = getVal(item, ['Model Line', 'modellinefe', 'Model']);
      const sc = getVal(item, ['Assigned To', 'owner']);
      return (filters.model === 'All' || m === filters.model) &&
             (filters.sc === 'All' || sc === filters.sc);
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
      const date = getDateObj(getVal(d, ['createdon', 'createddate']));
      if (date > maxDate) maxDate = date;
    });
    if (maxDate.getTime() === 0) return { cur: 'Cur', prv: 'Prv' };
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
    const getStats = (list, label) => {
      const cur = list.filter(d => getMonthStr(getVal(d, ['createdon', 'createddate', 'GRN Date'])) === timeLabels.cur);
      const prv = list.filter(d => getMonthStr(getVal(d, ['createdon', 'createddate', 'GRN Date'])) === timeLabels.prv);
      
      const met = (arr) => ({
        count: arr.length,
        td: arr.filter(d => ['yes', 'done', 'completed'].includes(getVal(d, ['testdrivecompleted']).toLowerCase())).length,
        hot: arr.filter(d => getVal(d, ['status', 'qualificationlevel']).toLowerCase().includes('hot')).length,
        retails: arr.filter(d => getVal(d, ['ordernumber', 'GST Invoice No.']).trim() !== '').length
      });

      const c = met(cur);
      const p = met(prv);

      return [
        { label: 'Inquiries', v1: p.count, v2: c.count },
        { label: 'Test Drives', v1: p.td, v2: c.td },
        { label: 'Hot Leads', v1: p.hot, v2: c.hot },
        { label: 'Retails', v1: p.retails, v2: c.retails }
      ];
    };

    const inv = () => {
      const bookedVins = new Set(filteredData.bks.map(b => getVal(b, ['VIN', 'Vehicle ID No.']).trim()));
      const total = filteredData.inv.length;
      const booked = filteredData.inv.filter(v => bookedVins.has(getVal(v, ['vin', 'Vehicle Identification Number']).trim())).length;
      return [
        { label: 'Total Stock', v1: 0, v2: total },
        { label: 'Customer Booked', v1: 0, v2: booked },
        { label: 'Available Units', v1: 0, v2: total - booked },
        { label: 'Old Stock (>90d)', v1: 0, v2: filteredData.inv.filter(v => parseInt(getVal(v, ['Ageing Days'])) > 90).length }
      ];
    };

    return { funnel: getStats(filteredData.opps), inventory: inv() };
  }, [filteredData, timeLabels]);

  const modelOptions = useMemo(() => [...new Set(data.opportunities.map(d => getVal(d, ['Model Line', 'modellinefe'])))].filter(Boolean).sort(), [data]);

  return (
    <div className="min-h-screen">
      <GlobalStyles />
      <ImportWizard isOpen={showImport} onClose={() => setShowImport(false)} onImport={handleImport} isUploading={isUploading} />
      
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40 px-4 py-2 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-black italic">IQ</div>
            <h1 className="text-xs font-black uppercase tracking-tighter">Sales Performance <span className="text-blue-500">Live</span></h1>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowImport(true)} className="bg-slate-900 text-white px-4 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-2 hover:bg-slate-800"><Upload className="w-3 h-3" /> SYNC</button>
            <button onClick={handleClear} className="p-1.5 text-rose-400 hover:bg-rose-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
          </div>
        </div>

        <div className="flex items-center gap-4 overflow-x-auto no-scrollbar pb-1">
          <div className="flex items-center gap-1 bg-slate-50 border rounded-lg px-2 py-1">
            <Filter className="w-3 h-3 text-slate-400" />
            <select className="bg-transparent text-[10px] font-bold outline-none border-none" value={filters.model} onChange={e => setFilters({...filters, model: e.target.value})}>
              <option value="All">All Models</option>
              {modelOptions.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div className="ml-auto comparison-toggle" onClick={() => setTimeView(timeView === 'CY' ? 'LY' : 'CY')}>
            <div className={`comparison-toggle-item ${timeView === 'CY' ? 'comparison-toggle-active' : 'text-slate-500'}`}>MONTHLY (MoM)</div>
            <div className={`comparison-toggle-item ${timeView === 'LY' ? 'comparison-toggle-active' : 'text-slate-500'}`}>ANNUAL (YoY)</div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="p-4 max-w-7xl mx-auto space-y-4">
        {msg && <div className="bg-emerald-600 text-white p-2 rounded-lg text-xs font-bold animate-fade-in flex items-center gap-2"><CheckCircle className="w-4 h-4" /> {msg}</div>}
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Card: Funnel */}
          <div className="bg-white rounded-xl card-shadow border border-slate-100 p-4 animate-fade-in" style={{animationDelay: '0.1s'}}>
            <h3 className="text-[10px] font-black uppercase text-blue-600 mb-3 flex items-center gap-2"><TrendingUp className="w-4 h-4" /> Conversion Funnel</h3>
            <ComparisonTable rows={stats.funnel} headers={[timeLabels.prv, timeLabels.cur]} updatedAt={ts.opportunities} />
          </div>

          {/* Card: Inventory */}
          <div className="bg-white rounded-xl card-shadow border border-slate-100 p-4 animate-fade-in" style={{animationDelay: '0.2s'}}>
            <h3 className="text-[10px] font-black uppercase text-indigo-600 mb-3 flex items-center gap-2"><Car className="w-4 h-4" /> System Inventory</h3>
            <ComparisonTable rows={stats.inventory} headers={['-', 'Now']} updatedAt={ts.inventory} />
          </div>

          {/* Card: Top Sources */}
          <div className="bg-white rounded-xl card-shadow border border-slate-100 p-4 animate-fade-in" style={{animationDelay: '0.3s'}}>
            <h3 className="text-[10px] font-black uppercase text-emerald-600 mb-3 flex items-center gap-2"><Users className="w-4 h-4" /> Top SC Performance</h3>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.funnel}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="label" tick={{fontSize: 9, fontWeight: 700}} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <RechartsTooltip contentStyle={{fontSize: '10px', borderRadius: '8px'}} />
                  <Bar dataKey="v2" fill="#2563eb" radius={[4, 4, 0, 0]} barSize={30} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Analytics Section */}
        <div className="bg-white rounded-xl card-shadow p-6">
           <div className="flex items-center justify-between mb-6">
             <h2 className="text-sm font-bold uppercase tracking-tight">Performance Analytics</h2>
             <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Trend Data</div>
           </div>
           <div className="h-64">
             <ResponsiveContainer width="100%" height="100%">
                <LineChart data={stats.funnel}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="label" tick={{fontSize: 9}} />
                  <YAxis tick={{fontSize: 9}} />
                  <RechartsTooltip />
                  <Line type="monotone" dataKey="v2" stroke="#2563eb" strokeWidth={3} dot={{r: 4, fill: '#2563eb'}} />
                </LineChart>
             </ResponsiveContainer>
           </div>
        </div>
      </main>

      {/* Footer Info */}
      {!user && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-amber-50 border border-amber-200 px-4 py-2 rounded-full shadow-lg flex items-center gap-2 text-[10px] font-bold text-amber-800">
          <Database className="w-3 h-3" /> Supabase Connection Inactive - Login Required
        </div>
      )}
    </div>
  );
}
