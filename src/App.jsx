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
/**
 * Advanced CSV Parser that correctly handles quoted strings and 
 * maps keys to lowercase normalized versions for Supabase compatibility.
 */
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
  // Detect header row
  for (let i = 0; i < Math.min(lines.length, 20); i++) {
    const rawLine = lines[i].toLowerCase();
    if (rawLine.includes('id') || rawLine.includes('lead') || rawLine.includes('vin') || rawLine.includes('dealer')) {
      headerIndex = i;
      break;
    }
  }

  const rawHeaders = parseLine(lines[headerIndex]);
  // Clean headers for DB columns: lowercase and no special characters
  const headers = rawHeaders.map(h => h.toLowerCase().trim().replace(/[\s_().-]/g, ''));
  
  const rows = lines.slice(headerIndex + 1).map((line) => {
    const values = parseLine(line);
    const row = {};
    // Only map known normalized headers to avoid payload bloating
    headers.forEach((h, i) => { 
      if (h) row[h] = values[i] || ''; 
    });
    return row;
  });

  return { rows, rawHeaders }; 
};

/**
 * Robust value getter that checks multiple possible keys/variants
 */
const getVal = (d, keys) => {
  if (!d) return '';
  for(let k of keys) {
    if (d[k] !== undefined && d[k] !== null && d[k] !== '') return String(d[k]);
    // Try normalized variant
    const normalized = k.toLowerCase().replace(/[\s_().-]/g, '');
    if (d[normalized] !== undefined && d[normalized] !== null && d[normalized] !== '') return String(d[normalized]);
  }
  return '';
};

// --- DATA HANDLERS ---
/**
 * Uploads data in chunks to prevent server-side errors on large files.
 * Provides granular progress tracking.
 */
const uploadToSupabaseBatch = async (userId, tableName, data, onProgress) => {
  if (!supabase) throw new Error("Supabase client not initialized.");
  
  const conflictColumn = tableName === 'opportunities' ? 'id' : (tableName === 'leads' ? 'leadid' : 'vin');
  
  // Transform and sanitize data before sending to Cloud
  const records = data.map(item => ({
    ...item,
    user_id: userId,
    // Ensure primary IDs are correctly mapped for the conflict resolution
    id: tableName === 'opportunities' ? (getVal(item, ['id', 'opportunityid'])) : undefined,
    leadid: tableName === 'leads' ? (getVal(item, ['leadid', 'lead id'])) : undefined,
    vin: (tableName === 'inventory' || tableName === 'bookings') ? (getVal(item, ['vin', 'Vehicle ID No.'])) : undefined
  }));

  // Chunk size reduced for high column-count files like Opportunities
  const CHUNK_SIZE = 50; 
  for (let i = 0; i < records.length; i += CHUNK_SIZE) {
    const chunk = records.slice(i, i + CHUNK_SIZE);
    
    // Using upsert with conflict column to prevent duplicate records
    const { error } = await supabase
      .from(tableName)
      .upsert(chunk, { onConflict: conflictColumn });
      
    if (error) {
      console.error(`Chunk Upload Error at row ${i}:`, error);
      throw new Error(`Cloud Sync Failed: ${error.message}`);
    }
    
    if (onProgress) {
      const currentProgress = Math.min(100, Math.round(((i + chunk.length) / records.length) * 100));
      onProgress(currentProgress);
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
  const [showImport, setShowImport] = useState(false);

  // Auth State Management
  useEffect(() => {
    if (supabase) {
      supabase.auth.getSession().then(({ data: { session } }) => setUser(session?.user || null));
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user || null));
      return () => subscription.unsubscribe();
    }
  }, []);

  /**
   * Loads user data from Supabase.
   */
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

  useEffect(() => { loadData(); }, [loadData]);

  /**
   * Entry point for CSV upload. Identifies data type and triggers batch sync.
   */
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

        // Clean UI notification during chunking
        await uploadToSupabaseBatch(user.id, type, rows, (p) => setUploadProgress(p));
        
        await loadData();
        setSuccessMsg(`Successfully synchronized ${rows.length} records to ${type}.`);
        setTimeout(() => setSuccessMsg(''), 5000);
      } catch (err) {
        alert("Upload Error: " + err.message);
      } finally {
        setIsUploading(false);
        setUploadProgress(0);
        // Clear input value so same file can be uploaded again if needed
        e.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  /**
   * Metrics calculation for Dashboard Tiles.
   */
  const stats = useMemo(() => {
    const totalOpps = oppData.length;
    // Map Hot leads based on multiple potential field names in CSV
    const hotOpps = oppData.filter(d => 
      getVal(d, ['ZQualificationLevel', 'status', 'level']).toLowerCase().includes('hot')
    ).length;
    const totalLeads = leadData.length;
    const stock = invData.length;
    
    return { totalOpps, hotOpps, totalLeads, stock };
  }, [oppData, leadData, invData]);

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
                Cloud Sync: {uploadProgress}%
              </div>
              <div className="w-24 bg-slate-100 h-1.5 rounded-full overflow-hidden">
                <div 
                  className="bg-blue-600 h-full transition-all duration-300 ease-out" 
                  style={{width: `${uploadProgress}%`}}
                ></div>
              </div>
            </div>
          )}
          
          <label className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-all shadow-sm ${isUploading ? 'bg-slate-200 text-slate-500 cursor-not-allowed' : 'bg-slate-900 text-white cursor-pointer hover:bg-blue-600'}`}>
            <Upload className="w-4 h-4" /> 
            {isUploading ? 'SYNCING...' : 'SYNC CSV'}
            <input type="file" className="hidden" accept=".csv" onChange={handleImport} disabled={isUploading} />
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

        {/* Dashboard Tiles */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-100 card-shadow group hover:border-blue-200 transition-colors">
            <div className="flex justify-between items-start mb-4">
              <div className="p-2 bg-blue-50 text-blue-600 rounded-xl"><LayoutDashboard className="w-5 h-5" /></div>
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest group-hover:text-blue-500 transition-colors">Inquiries</span>
            </div>
            <div className="text-3xl font-black text-slate-900">{stats.totalOpps.toLocaleString()}</div>
            <div className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-tighter">Total Pipeline Volume</div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-100 card-shadow group hover:border-rose-200 transition-colors">
            <div className="flex justify-between items-start mb-4">
              <div className="p-2 bg-rose-50 text-rose-600 rounded-xl"><TrendingUp className="w-5 h-5" /></div>
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest group-hover:text-rose-500 transition-colors">Hot Pool</span>
            </div>
            <div className="text-3xl font-black text-slate-900">{stats.hotOpps.toLocaleString()}</div>
            <div className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-tighter">High Intent Opportunities</div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-100 card-shadow group hover:border-amber-200 transition-colors">
            <div className="flex justify-between items-start mb-4">
              <div className="p-2 bg-amber-50 text-amber-600 rounded-xl"><Users className="w-5 h-5" /></div>
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest group-hover:text-amber-500 transition-colors">Leads</span>
            </div>
            <div className="text-3xl font-black text-slate-900">{stats.totalLeads.toLocaleString()}</div>
            <div className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-tighter">Raw Digital Traffic</div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-100 card-shadow group hover:border-emerald-200 transition-colors">
            <div className="flex justify-between items-start mb-4">
              <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl"><Car className="w-5 h-5" /></div>
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest group-hover:text-emerald-500 transition-colors">Inventory</span>
            </div>
            <div className="text-3xl font-black text-slate-900">{stats.stock.toLocaleString()}</div>
            <div className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-tighter">Available Stock Units</div>
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
             <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider italic">Inquiry Stream Monitor</h3>
             <button className="text-[10px] font-bold text-blue-600 hover:text-blue-800 transition-colors">FULL REPORT</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="px-6 py-3">Customer</th>
                  <th className="px-6 py-3">Product Line</th>
                  <th className="px-6 py-3">Source Channel</th>
                  <th className="px-6 py-3">Stage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {oppData.slice(-15).reverse().map((row, idx) => (
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
              <div className="py-20 flex flex-col items-center justify-center animate-fade-in">
                 <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                    <FileSpreadsheet className="w-8 h-8 text-slate-200" />
                 </div>
                 <p className="text-slate-400 font-bold text-xs uppercase tracking-widest italic">Awaiting Opportunity Inflow</p>
                 <p className="text-slate-300 text-[10px] mt-2">Upload your CSV file to populate the stream.</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
