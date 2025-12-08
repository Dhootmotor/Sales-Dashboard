import React, { useState, useEffect, useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Legend
} from 'recharts';
import { 
  LayoutDashboard, Upload, Filter, TrendingUp, Users, MapPin, Car, DollarSign, 
  FileSpreadsheet, ArrowUpRight, ArrowDownRight, Clock, CheckCircle, X, Search, Layers, Activity
} from 'lucide-react';

// --- SUPABASE CONFIGURATION ---
const SUPABASE_URL = 'https://zfqjtpxetuliayhccnvw.supabase.co'; 
const SUPABASE_ANON_KEY = 'sb_publishable_ES3a2aPouopqEu_uV9Z-Og_uPsmoYNH'; 

// --- STYLES ---
const GlobalStyles = () => (
  <style>{`
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: #f1f5f9; }
    ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
    .animate-fade-in { animation: fadeIn 0.5s ease-out forwards; }
  `}</style>
);

// --- PARSING UTILS ---
const normalizeKey = (key) => key ? key.trim().toLowerCase().replace(/[\s_().-]/g, '') : '';

const parseCSV = (text) => {
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  
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

  let headerIndex = 0;
  for (let i = 0; i < Math.min(lines.length, 25); i++) {
    const raw = lines[i].toLowerCase();
    if (raw.includes('lead record id') || raw.includes('vehicle identification number') || raw.includes('lead id') || raw.includes('dbm order')) {
      headerIndex = i; break;
    }
  }

  const headers = parseLine(lines[headerIndex]).map(normalizeKey);
  return lines.slice(headerIndex + 1).map((line) => {
    const values = parseLine(line);
    const row = {};
    headers.forEach((h, i) => { if (h) row[h] = values[i] || ''; });
    return row;
  });
};

const parseDate = (dateStr) => {
  if (!dateStr) return null;
  try {
    // Attempt standard Date parse first
    let d = new Date(dateStr);
    
    // If Invalid or weird year (like 1970 for empty), try manual parsing
    if (isNaN(d.getTime()) || d.getFullYear() < 2020) {
       // Look for patterns like DD-MM-YYYY or MM/DD/YYYY
       // We'll strip time parts first if present
       const cleanStr = dateStr.split(' ')[0]; 
       const parts = cleanStr.split(/[-/]/); 
       
       if (parts.length === 3) {
         // Assume DD-MM-YYYY first (common in non-US CSVs)
         // parts[0] = Day, parts[1] = Month, parts[2] = Year
         const day = parseInt(parts[0]);
         const month = parseInt(parts[1]);
         const year = parseInt(parts[2]); // Handle 2-digit years if needed, mostly 4 digit

         // Valid month check (1-12)
         if (month > 0 && month <= 12 && day > 0 && day <= 31) {
            d = new Date(year, month - 1, day);
         } else {
            // Fallback to MM-DD-YYYY
            d = new Date(year, day - 1, month);
         }
       }
    }
    
    // Final Validity Check
    return (!isNaN(d.getTime()) && d.getFullYear() > 2020) ? d : null;
  } catch (e) { return null; }
};

// --- IMPORT WIZARD ---
const ImportWizard = ({ isOpen, onClose, onDataUploaded }) => {
  const [file, setFile] = useState(null);
  const [uploadType, setUploadType] = useState('funnel');
  const [processing, setProcessing] = useState(false);
  const [status, setStatus] = useState('');

  const processFiles = async () => {
    if (!file) return;
    setProcessing(true);
    setStatus('Parsing CSV...');

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const rows = parseCSV(e.target.result);
        setStatus(`Parsed ${rows.length} rows. Uploading...`);

        const payload = rows.map(row => {
          let item = { 
            id: `gen-${Math.random().toString(36).substr(2, 9)}`, 
            dataset_type: uploadType,
            // Defaults
            is_test_drive: false, 
            is_hot: false,
            ageing: 0
          };

          // --- MAPPING LOGIC ---
          if (uploadType === 'funnel') { 
            item.id = row['id'] || row['leadrecordid'] || item.id;
            item.date = parseDate(row['createdon'])?.toISOString().split('T')[0];
            item.model = row['modellinefe'] || row['model'];
            item.location = row['dealercode'] || row['dealername'];
            item.consultant = row['assignedto'];
            
            const td = row['testdrivecompleted'] || '';
            item.is_test_drive = td.toLowerCase().includes('yes') || td.toLowerCase().includes('done');
            
            const score = row['opportunityofflinescore'] || row['zqualificationlevel'] || '';
            item.is_hot = score.toLowerCase().includes('hot') || parseInt(score) > 80;
          } 
          else if (uploadType === 'source') {
            item.id = row['leadid'] || item.id;
            item.date = parseDate(row['createdon'])?.toISOString().split('T')[0];
            item.model = row['modellinefe'];
            item.location = row['city'] || 'Unknown';
            item.consultant = row['owner'];
            item.source = row['source'];
            item.stage = row['qualificationlevel'];
          }
          else if (uploadType === 'booking') {
            item.id = row['salesordernumber'] || row['dbmorder'] || item.id;
            item.date = parseDate(row['bookingdate'])?.toISOString().split('T')[0];
            item.retail_date = parseDate(row['invoicedate'] || row['invoicedatev'])?.toISOString().split('T')[0];
            item.model = row['modelsalescode'] || row['model'];
            item.location = row['dealercode'];
            item.stage = item.retail_date ? 'Retail' : 'Booking';
          }
          else if (uploadType === 'inventory') {
            item.id = row['vehicleidentificationnumber'] || item.id;
            item.date = parseDate(row['grndate'])?.toISOString().split('T')[0];
            item.model = row['modelline'];
            item.location = row['dealercode'];
            item.stage = row['primarystatus']; 
            item.ageing = parseInt(row['ageingdays'] || '0');
          }

          if (item.date) item.month = item.date.slice(0, 7);
          return item;
        });

        // Batch Upload
        const batchSize = 1000;
        for (let i = 0; i < payload.length; i += batchSize) {
          const chunk = payload.slice(i, i + batchSize);
          await fetch(`${SUPABASE_URL}/rest/v1/sales_leads`, {
            method: 'POST',
            headers: {
              'apikey': SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
              'Content-Type': 'application/json',
              'Prefer': 'resolution=merge-duplicates'
            },
            body: JSON.stringify(chunk)
          });
        }

        onDataUploaded(uploadType);
        setProcessing(false);
        onClose();
      } catch (err) {
        setStatus(`Error: ${err.message}`);
        console.error(err);
      }
    };
    reader.readAsText(file);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-fade-in">
        <div className="bg-slate-900 px-6 py-4 flex justify-between items-center text-white">
          <h2 className="font-bold flex items-center gap-2"><Upload className="w-5 h-5" /> Import Wizard</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-slate-400 hover:text-white" /></button>
        </div>
        <div className="p-6 space-y-4">
          <label className="block text-sm font-bold text-slate-700">1. What file is this?</label>
          <div className="grid grid-cols-2 gap-3">
            {[
              { id: 'funnel', label: 'Opportunities', sub: 'Inquiries, TDs', icon: LayoutDashboard, color: 'blue' },
              { id: 'source', label: 'Marketing Leads', sub: 'Lead Sources', icon: TrendingUp, color: 'emerald' },
              { id: 'booking', label: 'Booking/Retail', sub: 'Conversions', icon: DollarSign, color: 'violet' },
              { id: 'inventory', label: 'Inventory', sub: 'Stock, Ageing', icon: Car, color: 'orange' }
            ].map((type) => (
              <button 
                key={type.id}
                onClick={() => setUploadType(type.id)}
                className={`p-3 rounded-lg border text-left transition-all ${
                  uploadType === type.id 
                    ? `bg-${type.color}-50 border-${type.color}-500 ring-1 ring-${type.color}-500` 
                    : 'bg-white border-slate-200 hover:bg-slate-50'
                }`}
              >
                <div className={`flex items-center gap-2 font-bold text-${type.color}-700`}>
                  <type.icon className="w-4 h-4" /> {type.label}
                </div>
                <div className="text-[10px] text-slate-500 mt-1">{type.sub}</div>
              </button>
            ))}
          </div>

          <label className="block text-sm font-bold text-slate-700 mt-4">2. Select CSV File</label>
          <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 flex flex-col items-center justify-center text-center bg-slate-50 relative group hover:border-blue-400 transition-colors">
             <FileSpreadsheet className="w-10 h-10 text-slate-400 mb-2 group-hover:text-blue-500" />
             <div className="text-sm font-medium text-slate-600">{file ? file.name : "Drag & Drop or Click"}</div>
             <input type="file" accept=".csv" onChange={(e) => setFile(e.target.files[0])} className="absolute inset-0 opacity-0 cursor-pointer" />
          </div>

          {status && <div className="text-xs font-mono text-blue-600 bg-blue-50 p-2 rounded">{status}</div>}
        </div>
        <div className="p-4 bg-slate-50 border-t flex justify-end">
          <button onClick={processFiles} disabled={processing || !file} className="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-slate-800 disabled:opacity-50">
            {processing ? 'Processing...' : 'Upload Data'}
          </button>
        </div>
      </div>
    </div>
  );
};

const ComparisonTable = ({ rows, headers, type = 'count' }) => (
  <div className="overflow-hidden">
    <table className="w-full text-sm text-left">
      <thead className="text-[10px] uppercase text-slate-400 bg-white border-b border-slate-100 font-bold tracking-wider">
        <tr><th className="py-2 pl-2">Metric</th><th className="py-2 text-right">{headers[0]}</th><th className="py-2 text-right pr-2">{headers[1]}</th></tr>
      </thead>
      <tbody className="divide-y divide-slate-50">
        {rows.map((row, idx) => {
          const v1 = row.v1 || 0; const v2 = row.v2 || 0;
          const isUp = ((v2 - v1) / (v1 || 1)) >= 0;
          return (
            <tr key={idx} className="hover:bg-slate-50/80 transition-colors text-xs">
              <td className="py-2 pl-2 font-semibold text-slate-600 flex items-center gap-1.5">
                 {isUp ? <ArrowUpRight className="w-3 h-3 text-emerald-500" /> : <ArrowDownRight className="w-3 h-3 text-rose-500" />} {row.label}
              </td>
              <td className="py-2 text-right text-slate-400 font-mono">
                {type === 'currency' ? `₹ ${(v1/100000).toFixed(2)} L` : v1.toLocaleString()} {row.sub1 && <span className="ml-1 text-[9px] text-slate-300">({row.sub1})</span>}
              </td>
              <td className="py-2 text-right font-bold text-slate-800 font-mono pr-2">
                {type === 'currency' ? `₹ ${(v2/100000).toFixed(2)} L` : v2.toLocaleString()} {row.sub2 && <span className="ml-1 text-[9px] text-blue-500 font-normal">({row.sub2})</span>}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

// --- MAIN APP ---
export default function App() {
  const [rawData, setRawData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showImport, setShowImport] = useState(false);
  const [viewMode, setViewMode] = useState('dashboard'); 
  const [lastUpdated, setLastUpdated] = useState(null); 
  const [successMsg, setSuccessMsg] = useState(''); 
  const [currentMonth, setCurrentMonth] = useState('2025-11');
  const [prevMonth, setPrevMonth] = useState('2025-10');
  const [filters, setFilters] = useState({ model: 'All', location: 'All', consultant: 'All' });

  // Fetch Data
  const fetchLeads = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/sales_leads?select=*`, {
         headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
      });
      const data = await response.json();
      setRawData(data || []);
      if(data?.length) {
        setLastUpdated(new Date());
        // Auto-detect latest month from data if available, to avoid showing 0s
        const months = [...new Set(data.map(d => d.month).filter(Boolean))].sort();
        if (months.length > 0) {
           const latest = months[months.length - 1];
           // Only update if our default 2025-11 is not valid for this data
           if (latest > '2025-11') setCurrentMonth(latest);
        }
      }
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  useEffect(() => { fetchLeads(); }, []);

  // --- DERIVED DATA ---
  const filteredData = useMemo(() => {
    return rawData.filter(item => {
      const matchModel = filters.model === 'All' || item.model === filters.model;
      const matchLoc = filters.location === 'All' || item.location === filters.location;
      const matchCons = filters.consultant === 'All' || item.consultant === filters.consultant;
      return matchModel && matchLoc && matchCons;
    });
  }, [rawData, filters]);

  // SEGMENT DATA BY TYPE
  const funnelData = useMemo(() => filteredData.filter(d => d.dataset_type === 'funnel'), [filteredData]);
  const bookingData = useMemo(() => filteredData.filter(d => d.dataset_type === 'booking'), [filteredData]);
  const inventoryData = useMemo(() => filteredData.filter(d => d.dataset_type === 'inventory'), [filteredData]);
  const leadsData = useMemo(() => filteredData.filter(d => d.dataset_type === 'source'), [filteredData]);

  // 1. Sales Funnel Stats
  const getFunnelStats = (month) => {
    const inquiries = funnelData.filter(d => d.month === month).length;
    const testDrives = funnelData.filter(d => d.month === month && d.is_test_drive).length;
    const hotLeads = funnelData.filter(d => d.month === month && d.is_hot).length;
    const bookings = bookingData.filter(d => d.month === month).length;
    const retailMonth = month; 
    const retails = bookingData.filter(d => d.retail_date && d.retail_date.startsWith(retailMonth)).length;

    return { inquiries, testDrives, hotLeads, bookings, retails };
  };

  const prevF = getFunnelStats(prevMonth);
  const currF = getFunnelStats(currentMonth);

  const funnelTable = [
    { label: 'Inquiries', v1: prevF.inquiries, v2: currF.inquiries },
    { label: 'Test-drives', v1: prevF.testDrives, v2: currF.testDrives, sub2: currF.inquiries ? Math.round(currF.testDrives/currF.inquiries*100)+'%' : '' },
    { label: 'Hot Leads', v1: prevF.hotLeads, v2: currF.hotLeads },
    { label: 'Booking Conversion', v1: prevF.bookings, v2: currF.bookings, sub2: currF.inquiries ? Math.round(currF.bookings/currF.inquiries*100)+'%' : '' },
    { label: 'Retail Conversion', v1: prevF.retails, v2: currF.retails, sub2: currF.bookings ? Math.round(currF.retails/currF.bookings*100)+'%' : '' },
  ];

  // 2. Inventory Stats (Snapshot)
  const invStats = {
    total: inventoryData.length,
    open: inventoryData.filter(d => d.stage?.toLowerCase().includes('free') || d.stage?.toLowerCase().includes('invoice created') || d.stage?.toLowerCase().includes('initial')).length,
    booked: inventoryData.filter(d => d.stage?.toLowerCase().includes('booked')).length,
    ageing: inventoryData.filter(d => d.ageing > 90).length
  };
  const inventoryTable = [
    { label: 'Total Inventory', v1: 0, v2: invStats.total },
    { label: 'Open Stock', v1: 0, v2: invStats.open },
    { label: 'Booked', v1: 0, v2: invStats.booked },
    { label: 'Ageing >90 Days', v1: 0, v2: invStats.ageing },
  ];

  // 3. Lead Source Stats
  const sourceStats = useMemo(() => {
    const data = leadsData.filter(d => d.month === currentMonth);
    const counts = {};
    data.forEach(d => { counts[d.source] = (counts[d.source] || 0) + 1; });
    const total = data.length || 1;
    return Object.entries(counts)
      .sort((a,b) => b[1] - a[1])
      .slice(0, 5)
      .map(([k, v]) => ({ label: k, v1: 0, v2: v, sub2: Math.round((v/total)*100)+'%' }));
  }, [leadsData, currentMonth]);

  // Options
  const options = (key) => [...new Set(rawData.map(d => d[key]).filter(Boolean))].sort();

  // Placeholders
  const placeholderData = [{ label: 'Data Pending', v1: 0, v2: 0 }];

  return (
    <div className="min-h-screen bg-slate-50/50 font-sans pb-10">
       <GlobalStyles />
       <ImportWizard isOpen={showImport} onClose={() => setShowImport(false)} onDataUploaded={(t) => { fetchLeads(); setSuccessMsg(`Uploaded ${t} data!`); setTimeout(()=>setSuccessMsg(''),3000); }} />
       
       <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
         <div className="max-w-[1920px] mx-auto px-4 h-16 flex items-center justify-between">
           <div className="flex items-center gap-3">
             <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white"><Car className="w-5 h-5" /></div>
             <div><h1 className="text-lg font-bold text-slate-800">Sales Dashboard</h1>
                <div className="flex items-center gap-2 text-[10px] text-slate-400"><span>Supabase Connected</span><div className={`w-2 h-2 rounded-full ${loading ? 'bg-yellow-400 animate-pulse' : 'bg-green-500'}`}></div></div>
             </div>
           </div>
           <button onClick={() => setShowImport(true)} className="flex items-center gap-2 bg-slate-800 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-slate-700 shadow-sm"><Upload className="w-3.5 h-3.5" /> Import Data</button>
         </div>
         {successMsg && <div className="bg-emerald-50 border-b border-emerald-100 px-4 py-2 text-center text-xs font-bold text-emerald-700">{successMsg}</div>}
         
         <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-2 flex items-center gap-4 overflow-x-auto">
            <div className="flex items-center gap-2 text-slate-500 text-xs font-bold uppercase"><Filter className="w-3.5 h-3.5" /> Filters:</div>
            {['model', 'location', 'consultant'].map(f => (
              <select key={f} className="bg-white border border-slate-200 px-3 py-1.5 rounded text-xs font-medium" value={filters[f]} onChange={e => setFilters({...filters, [f]: e.target.value})}>
                <option value="All">All {f.charAt(0).toUpperCase() + f.slice(1)}s</option>
                {options(f).map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            ))}
         </div>
       </header>

       <main className="max-w-[1920px] mx-auto px-4 py-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {/* 1. SALES FUNNEL */}
          <div className="rounded-lg shadow-sm border p-4 bg-white border-slate-200 hover:shadow-md transition-shadow">
             <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-100">
               <div className="bg-blue-50 p-1.5 rounded text-blue-600"><LayoutDashboard className="w-4 h-4" /></div>
               <h3 className="font-bold text-slate-700">Sales Funnel</h3>
             </div>
             <ComparisonTable rows={funnelTable} headers={[prevMonth, currentMonth]} />
          </div>

          {/* 2. INVENTORY */}
          <div className="rounded-lg shadow-sm border p-4 bg-white border-slate-200 hover:shadow-md transition-shadow">
             <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-100">
               <div className="bg-orange-50 p-1.5 rounded text-orange-600"><Car className="w-4 h-4" /></div>
               <h3 className="font-bold text-slate-700">Inventory Status</h3>
             </div>
             <ComparisonTable rows={inventoryTable} headers={['Previous', 'Current']} />
          </div>

          {/* 3. LEAD SOURCE */}
          <div className="rounded-lg shadow-sm border p-4 bg-white border-slate-200 hover:shadow-md transition-shadow">
             <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-100">
               <div className="bg-emerald-50 p-1.5 rounded text-emerald-600"><TrendingUp className="w-4 h-4" /></div>
               <h3 className="font-bold text-slate-700">Lead Source Mix</h3>
             </div>
             <ComparisonTable rows={sourceStats.length ? sourceStats : [{label: 'No Data', v1:0, v2:0}]} headers={['', currentMonth]} />
          </div>

          {/* 4. CROSS-SELL (Placeholder) */}
          <div className="rounded-lg shadow-sm border p-4 bg-white border-slate-200 hover:shadow-md transition-shadow">
             <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-100">
               <div className="bg-purple-50 p-1.5 rounded text-purple-600"><FileSpreadsheet className="w-4 h-4" /></div>
               <h3 className="font-bold text-slate-700">Cross-Sell</h3>
             </div>
             <ComparisonTable rows={placeholderData} headers={[prevMonth, currentMonth]} />
          </div>

          {/* 5. SALES MANAGEMENT (Placeholder) */}
          <div className="rounded-lg shadow-sm border p-4 bg-white border-slate-200 hover:shadow-md transition-shadow">
             <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-100">
               <div className="bg-cyan-50 p-1.5 rounded text-cyan-600"><Users className="w-4 h-4" /></div>
               <h3 className="font-bold text-slate-700">Sales Management</h3>
             </div>
             <ComparisonTable rows={placeholderData} headers={[prevMonth, currentMonth]} />
          </div>

          {/* 6. PROFIT & PRODUCTIVITY (Placeholder) */}
          <div className="rounded-lg shadow-sm border p-4 bg-white border-slate-200 hover:shadow-md transition-shadow">
             <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-100">
               <div className="bg-rose-50 p-1.5 rounded text-rose-600"><DollarSign className="w-4 h-4" /></div>
               <h3 className="font-bold text-slate-700">Profit & Productivity</h3>
             </div>
             <ComparisonTable rows={placeholderData} headers={[prevMonth, currentMonth]} />
          </div>
       </main>
    </div>
  );
}
