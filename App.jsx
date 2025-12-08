import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell 
} from 'recharts';
import { 
  LayoutDashboard, Upload, Filter, TrendingUp, TrendingDown, 
  Users, MapPin, Car, DollarSign, ChevronDown, FileSpreadsheet, 
  ArrowUpRight, ArrowDownRight, PieChart as PieChartIcon, Table as TableIcon, 
  Grid, Clock, RefreshCw, AlertCircle, X, CheckCircle, Search, Download, Layers
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
    .animate-fade-in-up { animation: fadeInUp 0.5s ease-out forwards; }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes fadeInUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
  `}</style>
);

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658', '#8dd1e1'];
const normalizeKey = (key) => key ? key.trim().toLowerCase().replace(/[\s_().-]/g, '') : '';

// --- MAPPINGS ---
const FIELD_MAPPINGS = {
  location: ['dealercode', 'dealername', 'dealerlocation', 'city', 'location', 'branch'],
  consultant: ['assignedto', 'qualifiedleadowner', 'salesconsultant', 'owner', 'executive'],
  model: ['modellinefe', 'model', 'modelgroupname', 'car'],
  date: ['createdon', 'date', 'createddate', 'enquirydate', 'bookingdate'],
  id: ['id', 'leadrecordid', 'enquirynumber', 'enquiryid', 'systemid'],
  mobile: ['mobile', 'mobileno', 'phone', 'contactnumber', 'customermobile'],
  source: ['source', 'leadsource', 'enquirysource'],
  test_drive: ['testdrivecompleted'],
  hot_lead: ['opportunityofflinescore', 'opportunityscore', 'zqualificationlevel']
};

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
  for (let i = 0; i < Math.min(lines.length, 20); i++) {
    const rawLine = lines[i].toLowerCase();
    if (rawLine.startsWith('id,') || rawLine.includes(',id,') || rawLine.includes('lead record id')) {
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

// --- IMPORT WIZARD (UPDATED FOR DATASET SELECTION) ---
const ImportWizard = ({ isOpen, onClose, onDataUploaded }) => {
  const [file, setFile] = useState(null);
  const [uploadType, setUploadType] = useState('funnel'); // 'funnel' or 'source'
  const [processing, setProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleFileChange = (e) => {
    if (e.target.files[0]) {
      setFile(e.target.files[0]);
      setErrorMsg('');
    }
  };

  const processFiles = async () => {
    setProcessing(true);
    setErrorMsg('');
    
    const readFile = (file) => new Promise((resolve) => {
      if (!file) return resolve([]);
      const reader = new FileReader();
      reader.onload = (e) => resolve(parseCSV(e.target.result));
      reader.readAsText(file);
    });

    try {
      const rows = await readFile(file);
      
      const getValue = (row, fieldType) => {
        const keys = FIELD_MAPPINGS[fieldType] || [];
        for (const key of keys) {
          if (row[key] !== undefined && row[key] !== '') return row[key];
        }
        return 'Unknown';
      };

      const payload = rows.map(row => {
        const id = getValue(row, 'id') !== 'Unknown' ? getValue(row, 'id') : `gen-${Math.random()}`;
        
        // Parse Logic
        const tdValue = row['testdrivecompleted'] || '';
        const isTestDrive = tdValue.toLowerCase().includes('yes') || tdValue.toLowerCase().includes('done');
        const hotValue = row['opportunityofflinescore'] || row['zqualificationlevel'] || '';
        const isHot = hotValue.toLowerCase().includes('hot') || hotValue.toLowerCase().includes('warm') || parseInt(hotValue) > 80;

        let dateVal = getValue(row, 'date');
        let monthStr = 'Unknown';
        try {
          let d = new Date(dateVal);
          // Quick date fix logic
          if (isNaN(d.getTime())) {
             const parts = dateVal.split(' ')[0].split(/[-/]/);
             if (parts.length === 3) d = new Date(`${parts[0]}-${parts[1]}-${parts[2]}`);
             if (isNaN(d.getTime())) d = new Date(`${parts[1]}-${parts[0]}-${parts[2]}`);
          }
          if (!isNaN(d.getTime())) {
            monthStr = d.toISOString().slice(0, 7); 
            dateVal = d.toISOString().split('T')[0];
          }
        } catch (e) { console.log(e) }

        return {
          id: id.toString(),
          date: dateVal,
          month: monthStr,
          model: getValue(row, 'model'),
          location: getValue(row, 'location'),
          consultant: getValue(row, 'consultant'),
          source: getValue(row, 'source'),
          stage: 'Enquiry',
          is_test_drive: isTestDrive,
          is_hot: isHot,
          dataset_type: uploadType // Saving the type (funnel vs source)
        };
      });

      const batchSize = 1000;
      for (let i = 0; i < payload.length; i += batchSize) {
        const chunk = payload.slice(i, i + batchSize);
        const response = await fetch(`${SUPABASE_URL}/rest/v1/sales_leads`, {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates'
          },
          body: JSON.stringify(chunk)
        });
        if (!response.ok) throw new Error('Supabase API Error');
      }

      onDataUploaded(uploadType);
      setProcessing(false);
      onClose();

    } catch (error) {
      console.error("Import failed", error);
      setErrorMsg(`Error: ${error.message || 'Check Console'}`);
      setProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl overflow-hidden animate-fade-in-up">
        <div className="bg-slate-800 px-6 py-4 flex justify-between items-center">
          <h2 className="text-white font-bold text-lg flex items-center gap-2">
            <Upload className="w-5 h-5" /> Import Data
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        
        <div className="p-6 space-y-6">
          {/* DATASET SELECTOR */}
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">Select Dataset Type</label>
            <div className="grid grid-cols-2 gap-4">
              <button 
                onClick={() => setUploadType('funnel')}
                className={`p-3 rounded-lg border text-sm font-medium flex items-center justify-center gap-2 transition-all
                  ${uploadType === 'funnel' ? 'bg-blue-50 border-blue-500 text-blue-700 ring-1 ring-blue-500' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
              >
                <LayoutDashboard className="w-4 h-4" /> Sales Funnel
              </button>
              <button 
                onClick={() => setUploadType('source')}
                className={`p-3 rounded-lg border text-sm font-medium flex items-center justify-center gap-2 transition-all
                  ${uploadType === 'source' ? 'bg-emerald-50 border-emerald-500 text-emerald-700 ring-1 ring-emerald-500' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
              >
                <TrendingUp className="w-4 h-4" /> Lead Source
              </button>
            </div>
          </div>

          <div className="border-2 border-dashed border-slate-200 rounded-lg p-8 hover:border-blue-400 transition-colors bg-slate-50 relative group flex flex-col items-center justify-center text-center">
                <FileSpreadsheet className="w-12 h-12 text-blue-600 mb-4" /> 
                <div className="text-slate-700 font-semibold text-lg mb-1">
                  {file ? file.name : "Click to Upload CSV"}
                </div>
                <p className="text-sm text-slate-400">
                  Target: <strong>{uploadType === 'funnel' ? 'Sales Funnel' : 'Lead Source'}</strong>
                </p>
                <input type="file" accept=".csv" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={handleFileChange} />
          </div>
          
          {errorMsg && (
            <div className="text-red-500 text-sm font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4" /> {errorMsg}
            </div>
          )}
        </div>

        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-lg">Cancel</button>
          <button 
            onClick={processFiles} 
            disabled={processing || !file}
            className={`px-4 py-2 text-sm font-bold text-white rounded-lg flex items-center gap-2 ${processing || !file ? 'bg-slate-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 shadow-md'}`}
          >
            {processing ? 'Uploading...' : 'Confirm Upload'}
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
  const [detailedMetric, setDetailedMetric] = useState('Inquiries');
  const [lastUpdated, setLastUpdated] = useState(null); 
  const [successMsg, setSuccessMsg] = useState(''); 
  const [currentMonth, setCurrentMonth] = useState('2025-11');
  const [prevMonth, setPrevMonth] = useState('2025-10');
  const [filters, setFilters] = useState({ model: 'All', location: 'All', consultant: 'All' });

  const fetchLeads = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/sales_leads?select=*`, {
         headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
      });
      if (!response.ok) throw new Error(`API Error: ${response.status}`);
      const data = await response.json();
      setRawData(data || []);
      if(data.length) setLastUpdated(new Date());
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  useEffect(() => { fetchLeads(); }, []);

  const handleDataUploaded = (type) => {
    fetchLeads();
    setSuccessMsg(`Success! ${type === 'funnel' ? 'Sales Funnel' : 'Lead Source'} data updated.`);
    setTimeout(() => setSuccessMsg(''), 5000); 
  };

  const locationOptions = useMemo(() => [...new Set(rawData.map(d => d.location).filter(Boolean))].sort(), [rawData]);
  const consultantOptions = useMemo(() => [...new Set(rawData.map(d => d.consultant).filter(Boolean))].sort(), [rawData]);
  const modelOptions = useMemo(() => [...new Set(rawData.map(d => d.model).filter(Boolean))].sort(), [rawData]);

  const filteredData = useMemo(() => {
    return rawData.filter(item => {
      const matchModel = filters.model === 'All' || item.model === filters.model;
      const matchLoc = filters.location === 'All' || item.location === filters.location;
      const matchCons = filters.consultant === 'All' || item.consultant === filters.consultant;
      return matchModel && matchLoc && matchCons;
    });
  }, [rawData, filters]);

  // SPLIT DATA BY TYPE
  const funnelDataRaw = useMemo(() => filteredData.filter(d => d.dataset_type === 'funnel' || !d.dataset_type), [filteredData]);
  const sourceDataRaw = useMemo(() => filteredData.filter(d => d.dataset_type === 'source'), [filteredData]);

  // Funnel Logic (Using ONLY Funnel Data)
  const getStats = (data, month) => {
    const monthData = data.filter(d => d.month === month);
    return {
      inquiries: monthData.length,
      testDrives: monthData.filter(d => d.is_test_drive).length,
      hotLeads: monthData.filter(d => d.is_hot).length,
      bookings: 0, retail: 0
    };
  };
  
  const prevFunnel = getStats(funnelDataRaw, prevMonth);
  const currFunnel = getStats(funnelDataRaw, currentMonth);

  const funnelTableData = [
    { label: 'Inquiries', v1: prevFunnel.inquiries, v2: currFunnel.inquiries },
    { label: 'Test-drives', v1: prevFunnel.testDrives, v2: currFunnel.testDrives },
    { label: 'Hot Leads', v1: prevFunnel.hotLeads, v2: currFunnel.hotLeads },
    { label: 'Booking Conversion', v1: prevFunnel.bookings, v2: currFunnel.bookings },
    { label: 'Retail Conversion', v1: prevFunnel.retail, v2: currFunnel.retail },
  ];

  // Source Logic (Using ONLY Source Data)
  // Since you haven't uploaded the source file yet, this will be empty, which is correct!
  const sourceStats = useMemo(() => {
    const currSourceData = sourceDataRaw.filter(d => d.month === currentMonth);
    const sources = {};
    currSourceData.forEach(d => { sources[d.source] = (sources[d.source] || 0) + 1; });
    const total = currSourceData.length || 1;
    return Object.entries(sources).map(([k, v]) => ({ label: k, v2: v, sub2: ((v/total)*100).toFixed(1) + '%' }));
  }, [sourceDataRaw, currentMonth]);

  // Placeholders for other tabs
  const placeholderData = [{ label: 'No Data', v1: 0, v2: 0 }];

  const DashboardView = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 animate-fade-in">
       {/* Card 1: Sales Funnel (Populated by 'funnel' type) */}
       <div className={`rounded-lg shadow-sm border p-4 flex flex-col h-full hover:shadow-md transition-shadow cursor-pointer bg-blue-50/50 border-blue-200`}>
          <div className="flex items-center gap-2 mb-4 border-b border-slate-100 pb-2">
            <div className="bg-blue-50 p-1.5 rounded text-blue-600"><LayoutDashboard className="w-4 h-4" /></div>
            <h3 className="font-bold text-slate-700">Sales Funnel</h3>
          </div>
          <ComparisonTable rows={funnelTableData} headers={[prevMonth, currentMonth]} />
       </div>

       {/* Card 2: Inventory */}
       <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4 flex flex-col h-full hover:shadow-md transition-shadow">
          <div className="flex items-center gap-2 mb-4 border-b border-slate-100 pb-2">
            <div className="bg-indigo-50 p-1.5 rounded text-indigo-600"><Car className="w-4 h-4" /></div>
            <h3 className="font-bold text-slate-700">Inventory</h3>
          </div>
          <ComparisonTable rows={placeholderData} headers={[prevMonth, currentMonth]} />
       </div>

       {/* Card 3: Lead Source (Populated by 'source' type - currently empty) */}
       <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4 flex flex-col h-full hover:shadow-md transition-shadow">
          <div className="flex items-center gap-2 mb-4 border-b border-slate-100 pb-2">
            <div className="bg-emerald-50 p-1.5 rounded text-emerald-600"><TrendingUp className="w-4 h-4" /></div>
            <h3 className="font-bold text-slate-700">Lead Source</h3>
          </div>
          <ComparisonTable rows={sourceStats.length ? sourceStats : placeholderData} headers={[prevMonth, currentMonth]} />
       </div>

       {/* Other Cards */}
       {[{ t: 'Cross-Sell', i: FileSpreadsheet, c: 'purple' }, { t: 'Sales Management', i: Users, c: 'orange' }, { t: 'Profit & Productivity', i: DollarSign, c: 'rose' }].map((x, i) => (
         <div key={i} className="bg-white rounded-lg shadow-sm border border-slate-200 p-4 flex flex-col h-full hover:shadow-md transition-shadow">
            <div className="flex items-center gap-2 mb-4 border-b border-slate-100 pb-2">
              <div className={`bg-${x.c}-50 p-1.5 rounded text-${x.c}-600`}><x.i className="w-4 h-4" /></div>
              <h3 className="font-bold text-slate-700">{x.t}</h3>
            </div>
            <ComparisonTable rows={placeholderData} headers={[prevMonth, currentMonth]} />
         </div>
       ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50/50 font-sans pb-10">
       <GlobalStyles />
       <ImportWizard isOpen={showImport} onClose={() => setShowImport(false)} onDataUploaded={handleDataUploaded} />
       <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
         <div className="max-w-[1920px] mx-auto px-4 h-16 flex items-center justify-between">
           <div className="flex items-center gap-3">
             <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-lg flex items-center justify-center text-white shadow-md"><Car className="w-5 h-5" /></div>
             <div><h1 className="text-lg font-bold text-slate-800 leading-tight">Sales Dashboard</h1>
                <div className="flex items-center gap-2 text-[10px] font-medium text-slate-400"><span>Supabase REST API</span><div className={`w-2 h-2 rounded-full ${loading ? 'bg-yellow-400 animate-pulse' : 'bg-green-500'}`}></div></div>
             </div>
           </div>
           <div className="flex items-center gap-4">
              <button onClick={() => setShowImport(true)} className="flex items-center gap-2 bg-slate-800 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-slate-700 transition-colors shadow-sm"><Upload className="w-3.5 h-3.5" /> Upload CSV</button>
           </div>
         </div>
         {successMsg && <div className="bg-emerald-50 border-b border-emerald-100 px-4 py-2 flex items-center justify-center gap-2 text-xs font-bold text-emerald-700 animate-fade-in"><CheckCircle className="w-4 h-4" /> {successMsg}</div>}
         <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-2">
           <div className="max-w-[1920px] mx-auto flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2 text-slate-500 text-xs font-bold uppercase tracking-wide"><Filter className="w-3.5 h-3.5" /> Filters:</div>
              {['model', 'location', 'consultant'].map(f => (
                <select key={f} className="bg-white border border-slate-200 px-3 py-1.5 rounded text-xs font-medium" value={filters[f]} onChange={e => setFilters({...filters, [f]: e.target.value})}>
                  <option value="All">All {f.charAt(0).toUpperCase() + f.slice(1)}s</option>
                  {(f === 'model' ? modelOptions : f === 'location' ? locationOptions : consultantOptions).map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              ))}
           </div>
         </div>
       </header>
       <main className="max-w-[1920px] mx-auto px-4 py-6"><DashboardView /></main>
    </div>
  );
}
