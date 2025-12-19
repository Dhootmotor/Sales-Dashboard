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
    
    .card-shadow {
      box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1);
    }
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

  let headerIndex = -1;
  // Robust header detection: scan for standard column names even if there are leading junk lines
  for (let i = 0; i < Math.min(lines.length, 50); i++) {
    const rawLine = lines[i].toLowerCase();
    if (
      (rawLine.startsWith('id,') || rawLine.includes(',customer,')) && 
      !rawLine.includes('updated on')
    ) {
      headerIndex = i;
      break;
    }
  }

  if (headerIndex === -1) headerIndex = 0; // Fallback

  const rawHeaders = parseLine(lines[headerIndex]);
  const headers = rawHeaders.map(h => h.toLowerCase().trim().replace(/[\s_().-]/g, ''));
  
  const rows = lines.slice(headerIndex + 1).map((line) => {
    const values = parseLine(line);
    const row = {};
    headers.forEach((h, i) => { if (h) row[h] = values[i] || ''; });
    // Save original casing just in case for specific logic
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
const uploadToSupabaseBatch = async (userId, tableName, data, onProgress) => {
  if (!supabase) throw new Error("Supabase client not initialized.");
  
  const conflictColumn = tableName === 'opportunities' ? 'id' : (tableName === 'leads' ? 'leadid' : 'vin');
  
  const records = data.map(item => ({
    ...item,
    user_id: userId,
    id: tableName === 'opportunities' ? (getVal(item, ['id', 'opportunityid'])) : undefined,
    leadid: tableName === 'leads' ? (getVal(item, ['leadid', 'lead id'])) : undefined,
    vin: (tableName === 'inventory' || tableName === 'bookings') ? (getVal(item, ['vin', 'Vehicle ID No.'])) : undefined
  }));

  const CHUNK_SIZE = 50; 
  for (let i = 0; i < records.length; i += CHUNK_SIZE) {
    const chunk = records.slice(i, i + CHUNK_SIZE);
    const { error } = await supabase
      .from(tableName)
      .upsert(chunk, { onConflict: conflictColumn });
      
    if (error) {
      console.error(`Error uploading chunk at row ${i}:`, error);
      throw error;
    }
    
    if (onProgress) {
      onProgress(Math.min(100, Math.round(((i + chunk.length) / records.length) * 100)));
    }
  }
  return data.length;
};

// --- MAIN APPLICATION ---
export default function App() {
  const [user, setUser] = useState(null);
  const [oppData, setOppData] = useState([]);
  const [leadData, setLeadData] = useState([]);
  const [invData, setInvData] = useState([]);
  
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(true);

  // Auth State
  useEffect(() => {
    if (supabase) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        setUser(session?.user || null);
        setLoading(false);
      });
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        setUser(session?.user || null);
      });
      return () => subscription.unsubscribe();
    } else {
      setLoading(false);
    }
  }, []);

  const loadData = useCallback(async () => {
    if (!user) return;
    try {
      const fetchT = async (n) => {
        const { data, error } = await supabase.from(n).select('*').eq('user_id', user.id);
        if (error) throw error;
        return data || [];
      };
      
      const [o, l, i] = await Promise.all([
        fetchT('opportunities'), 
        fetchT('leads'), 
        fetchT('inventory')
      ]);
      
      setOppData(o); 
      setLeadData(l); 
      setInvData(i);
    } catch (e) { 
      console.error("Data Load Error:", e);
    }
  }, [user]);

  // Load data as soon as user is authenticated
  useEffect(() => { 
    if (user) loadData(); 
  }, [user, loadData]);

  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file || !user) return;
    
    setIsUploading(true);
    setUploadProgress(1);

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const { rows, rawHeaders } = parseCSV(event.target.result);
        const headerString = rawHeaders.join(',').toLowerCase();
        
        let type = 'unknown';
        if (headerString.includes('opportunity')) type = 'opportunities';
        else if (headerString.includes('lead id')) type = 'leads';
        else if (headerString.includes('vin')) type = 'inventory';

        if (type === 'unknown') throw new Error("Could not identify CSV type. Please ensure headers match standard formats.");

        await uploadToSupabaseBatch(user.id, type, rows, (p) => setUploadProgress(p));
        
        await loadData();
        setSuccessMsg(`Synchronized ${rows.length} records to ${type.toUpperCase()}.`);
        setTimeout(() => setSuccessMsg(''), 5000);
      } catch (err) {
        alert("Sync Error: " + err.message);
      } finally {
        setIsUploading(false);
        setUploadProgress(0);
        e.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  const clearData = async (table) => {
    if (!window.confirm(`Clear all ${table} data?`)) return;
    try {
      await supabase.from(table).delete().eq('user_id', user.id);
      loadData();
    } catch (e) { alert(e.message); }
  };

  const stats = useMemo(() => {
    const totalOpps = oppData.length;
    const hotOpps = oppData.filter(d => 
      getVal(d, ['ZQualificationLevel', 'status', 'level']).toLowerCase().includes('hot')
    ).length;
    const totalLeads = leadData.length;
    const stock = invData.length;
    
    return { totalOpps, hotOpps, totalLeads, stock };
  }, [oppData, leadData, invData]);

  if (loading) return <div className="h-screen flex items-center justify-center text-slate-400 font-bold uppercase tracking-widest animate-pulse">Initializing Sales IQ...</div>;

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <GlobalStyles />
      
      {/* Navigation Header */}
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-50 px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="bg-blue-600 p-1.5 rounded-lg text-white shadow-sm">
            <TrendingUp className="w-5 h-5" />
          </div>
          <span className="font-black text-slate-900 tracking-tighter text-lg italic">SALES IQ</span>
        </div>
        
        <div className="flex items-center gap-4">
          {isUploading && (
            <div className="flex items-center gap-3 mr-4">
              <div className="text-[10px] font-bold text-blue-600 uppercase italic animate-pulse">
                Syncing: {uploadProgress}%
              </div>
              <div className="w-24 bg-slate-100 h-1.5 rounded-full overflow-hidden">
                <div 
                  className="bg-blue-600 h-full transition-all duration-300" 
                  style={{width: `${uploadProgress}%`}}
                ></div>
              </div>
            </div>
          )}
          
          <label className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-all shadow-sm ${isUploading || !user ? 'bg-slate-200 text-slate-500 cursor-not-allowed' : 'bg-slate-900 text-white cursor-pointer hover:bg-blue-600'}`}>
            <Upload className="w-4 h-4" /> 
            {isUploading ? 'SYNCING...' : 'SYNC CSV'}
            <input type="file" className="hidden" accept=".csv" onChange={handleImport} disabled={isUploading || !user} />
          </label>
        </div>
      </nav>

      {/* Main Dashboard Content */}
      <main className="max-w-7xl mx-auto p-6 space-y-6">
        {successMsg && (
          <div className="bg-emerald-500 text-white px-4 py-3 rounded-xl text-xs font-bold flex items-center gap-2 animate-fade-in shadow-lg shadow-emerald-500/20">
            <CheckCircle className="w-4 h-4" /> {successMsg}
          </div>
        )}

        {!user && (
          <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl flex items-center gap-3 text-amber-700 font-bold text-xs uppercase tracking-tight">
             <AlertTriangle className="w-4 h-4" /> Sign in required to sync cloud data. 
          </div>
        )}

        {/* Dashboard Tiles */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-100 card-shadow group hover:border-blue-200 transition-colors">
            <div className="flex justify-between items-start mb-4">
              <div className="p-2 bg-blue-50 text-blue-600 rounded-xl"><LayoutDashboard className="w-5 h-5" /></div>
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Inquiries</span>
            </div>
            <div className="text-3xl font-black text-slate-900">{stats.totalOpps.toLocaleString()}</div>
            <div className="text-[10px] font-bold text-slate-400 mt-1 uppercase">Total Pipeline</div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-100 card-shadow group hover:border-rose-200 transition-colors">
            <div className="flex justify-between items-start mb-4">
              <div className="p-2 bg-rose-50 text-rose-600 rounded-xl"><TrendingUp className="w-5 h-5" /></div>
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Hot Pool</span>
            </div>
            <div className="text-3xl font-black text-slate-900">{stats.hotOpps.toLocaleString()}</div>
            <div className="text-[10px] font-bold text-slate-400 mt-1 uppercase">High Intent</div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-100 card-shadow group hover:border-amber-200 transition-colors">
            <div className="flex justify-between items-start mb-4">
              <div className="p-2 bg-amber-50 text-amber-600 rounded-xl"><Users className="w-5 h-5" /></div>
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Leads</span>
            </div>
            <div className="text-3xl font-black text-slate-900">{stats.totalLeads.toLocaleString()}</div>
            <div className="text-[10px] font-bold text-slate-400 mt-1 uppercase">Digital Inflow</div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-100 card-shadow group hover:border-emerald-200 transition-colors">
            <div className="flex justify-between items-start mb-4">
              <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl"><Car className="w-5 h-5" /></div>
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Inventory</span>
            </div>
            <div className="text-3xl font-black text-slate-900">{stats.stock.toLocaleString()}</div>
            <div className="text-[10px] font-bold text-slate-400 mt-1 uppercase">Live Units</div>
          </div>
        </div>

        {/* Analytics Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-100 card-shadow h-[400px]">
             <h3 className="text-xs font-black text-slate-900 mb-6 uppercase tracking-wider flex items-center gap-2 italic">
               <TrendingUp className="w-4 h-4 text-blue-600" /> Intake Velocity
             </h3>
             <ResponsiveContainer width="100%" height="85%">
               <BarChart data={oppData.slice(-10).map((d, i) => ({ name: `Entry ${i+1}`, value: i + 1 }))}>
                 <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                 <XAxis dataKey="name" hide />
                 <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 700, fill: '#94a3b8'}} />
                 <RechartsTooltip contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}} />
                 <Bar dataKey="value" fill="#2563eb" radius={[6, 6, 0, 0]} barSize={35} />
               </BarChart>
             </ResponsiveContainer>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-100 card-shadow h-[400px]">
             <h3 className="text-xs font-black text-slate-900 mb-6 uppercase tracking-wider flex items-center gap-2 italic">
               <Database className="w-4 h-4 text-emerald-600" /> Portfolio Segmentation
             </h3>
             <ResponsiveContainer width="100%" height="85%">
               <PieChart>
                 <Pie 
                   data={[{name: 'Hector', value: 40}, {name: 'Astor', value: 30}, {name: 'ZS EV', value: 30}, {name: 'Windsor', value: 20}]} 
                   innerRadius={80} 
                   outerRadius={100} 
                   paddingAngle={8} 
                   dataKey="value"
                 >
                   {COLORS.map((color, index) => <Cell key={index} fill={color} />)}
                 </Pie>
                 <RechartsTooltip />
                 <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{fontSize: '11px', fontWeight: 800, textTransform: 'uppercase'}} />
               </PieChart>
             </ResponsiveContainer>
          </div>
        </div>

        {/* Activity Feed / Table */}
        <div className="bg-white rounded-2xl border border-slate-100 card-shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
             <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider italic">Stream Monitor</h3>
             <div className="flex gap-2">
               <button onClick={() => clearData('opportunities')} className="text-[10px] font-bold text-rose-500 flex items-center gap-1 hover:underline"><Trash2 className="w-3 h-3" /> CLEAR OPPS</button>
               <button onClick={() => clearData('inventory')} className="text-[10px] font-bold text-rose-500 flex items-center gap-1 hover:underline"><Trash2 className="w-3 h-3" /> CLEAR INV</button>
             </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="px-6 py-3">Customer</th>
                  <th className="px-6 py-3">Product</th>
                  <th className="px-6 py-3">Source</th>
                  <th className="px-6 py-3">Stage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {[...oppData].reverse().slice(0, 20).map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4 text-xs font-bold text-slate-900">{getVal(row, ['Customer', 'first_name']) || 'Anonymous'}</td>
                    <td className="px-6 py-4 text-xs text-slate-600 font-medium">{getVal(row, ['modellinefe', 'Model Line', 'Model'])}</td>
                    <td className="px-6 py-4 text-xs text-slate-500 font-medium italic">{getVal(row, ['Source'])}</td>
                    <td className="px-6 py-4">
                       <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-tighter shadow-sm border ${getVal(row, ['Status']).toLowerCase().includes('follow') ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-blue-50 text-blue-600 border-blue-100'}`}>
                         {getVal(row, ['Status']) || 'N/A'}
                       </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {oppData.length === 0 && (
              <div className="py-20 flex flex-col items-center justify-center">
                 <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                    <FileSpreadsheet className="w-8 h-8 text-slate-200" />
                 </div>
                 <p className="text-slate-400 font-bold text-xs uppercase tracking-widest italic">Awaiting Sync</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
