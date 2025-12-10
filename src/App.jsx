import React, { useState, useEffect, useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell 
} from 'recharts';
import { 
  LayoutDashboard, Upload, Filter, TrendingUp, TrendingDown, 
  Users, Car, DollarSign, ChevronDown, FileSpreadsheet, 
  ArrowUpRight, ArrowDownRight, 
  Clock, X, CheckCircle, Download, Trash2
} from 'lucide-react';

// --- STYLES ---
const GlobalStyles = () => (
  <style>{`
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: #f1f5f9; }
    ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
    .animate-fade-in { animation: fadeIn 0.5s ease-out forwards; }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  `}</style>
);

// --- HELPER: CSV PARSER ---
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

  // Find header row (robust detection)
  let headerIndex = 0;
  for (let i = 0; i < Math.min(lines.length, 20); i++) {
    const rawLine = lines[i].toLowerCase();
    // Check for known columns in ANY file type (Opps, Leads, Inventory)
    if (rawLine.includes('id') || rawLine.includes('vin') || rawLine.includes('vehicle') || rawLine.includes('company')) {
      headerIndex = i;
      break;
    }
  }

  const rawHeaders = parseLine(lines[headerIndex]);
  // Normalize headers for code usage
  const headers = rawHeaders.map(h => h.toLowerCase().trim().replace(/[\s_().-]/g, ''));
  
  const rows = lines.slice(headerIndex + 1).map((line) => {
    const values = parseLine(line);
    const row = {};
    // Store using normalized keys (e.g., 'primarystatus')
    headers.forEach((h, i) => { if (h) row[h] = values[i] || ''; });
    // Store using ORIGINAL keys (e.g., 'Primary Status') for specific display logic
    rawHeaders.forEach((h, i) => {
        const key = h.trim(); 
        if (key) row[key] = values[i] || '';
    });
    return row;
  });

  return { headers, rows, rawHeaders }; 
};

// --- COMPONENT: FILE UPLOAD WIZARD ---
const ImportWizard = ({ isOpen, onClose, onDataImported }) => {
  const [file, setFile] = useState(null);
  const [processing, setProcessing] = useState(false);

  const handleFileChange = (e) => {
    if (e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const processFiles = async () => {
    if (!file) return;
    setProcessing(true);
    const readFile = (f) => new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(parseCSV(e.target.result));
      reader.readAsText(f);
    });

    try {
      const { rows, rawHeaders } = await readFile(file);
      const headerString = rawHeaders.join(',').toLowerCase();
      
      let type = 'unknown';
      // Improved Detection Logic
      // 1. Check for Inventory specific columns first
      if (headerString.includes('vehicle identification number') || headerString.includes('vin') || headerString.includes('stock')) {
        type = 'inventory';
      } 
      // 2. Check for Leads
      else if (headerString.includes('qualification level') || headerString.includes('lead id')) {
        type = 'leads';
      } 
      // 3. Fallback to Opportunities
      else if (headerString.includes('opportunity offline score') || headerString.includes('order number')) {
        type = 'opportunities';
      }

      onDataImported(rows, type);
      setProcessing(false);
      setFile(null);
      onClose();
    } catch (error) {
      console.error(error);
      setProcessing(false);
      alert("Error parsing CSV");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6 animate-fade-in">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2"><Upload className="w-5 h-5" /> Import Data</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-slate-400" /></button>
        </div>
        
        <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 flex flex-col items-center justify-center text-center bg-slate-50 relative mb-6">
           <FileSpreadsheet className="w-10 h-10 text-blue-500 mb-2" />
           <p className="text-sm font-medium text-slate-600 mb-1">{file ? file.name : "Drag & Drop or Click to Select"}</p>
           <p className="text-xs text-slate-400">Supports: Opportunities, Leads, Inventory CSVs</p>
           <input type="file" accept=".csv" onChange={handleFileChange} className="absolute inset-0 opacity-0 cursor-pointer" />
        </div>

        <button 
          onClick={processFiles} 
          disabled={!file || processing}
          className="w-full bg-slate-900 text-white py-3 rounded-lg font-bold text-sm disabled:opacity-50 hover:bg-slate-800 transition-colors"
        >
          {processing ? 'Processing...' : 'Upload & Update Dashboard'}
        </button>
      </div>
    </div>
  );
};

// --- COMPONENT: COMPARISON TABLE ---
const ComparisonTable = ({ rows, headers, type = 'count', timestamp }) => (
  <div className="flex flex-col h-full">
    <div className="overflow-x-auto flex-1">
      <table className="w-full text-sm text-left border-collapse">
        <thead className="text-[10px] uppercase text-slate-400 bg-white border-b border-slate-100 font-bold tracking-wider">
          <tr>
            <th className="py-2 pl-2 w-1/3">Metric</th>
            <th className="py-2 text-right w-[25%]">{headers[0] || 'Prev'}</th>
            <th className="py-2 text-right w-[25%] pr-2">{headers[1] || 'Curr'}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {rows.map((row, idx) => {
            const v1 = row.v1 || 0;
            const v2 = row.v2 || 0;
            const isUp = v2 >= v1;
            
            const format = (val) => {
               if (type === 'currency') return `₹ ${(val/100000).toFixed(2)} L`;
               return val.toLocaleString();
            };

            return (
              <tr key={idx} className="hover:bg-slate-50/80 transition-colors text-xs">
                <td className="py-2.5 pl-2 font-semibold text-slate-600 flex items-center gap-2">
                   {isUp ? <ArrowUpRight className="w-3.5 h-3.5 text-emerald-500" /> : <ArrowDownRight className="w-3.5 h-3.5 text-rose-500" />}
                   {row.label}
                </td>
                <td className="py-2.5 text-right text-slate-400 font-mono">
                  {format(v1)}
                  {row.sub1 && <span className="ml-1 text-[9px] opacity-70">({row.sub1})</span>}
                </td>
                <td className="py-2.5 text-right font-bold text-slate-800 font-mono pr-2">
                  {format(v2)}
                  {row.sub2 && <span className="ml-1 text-[9px] text-blue-500 font-normal">({row.sub2})</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    <div className="mt-auto pt-3 border-t border-slate-100 flex items-center justify-end gap-2 text-[10px] text-slate-400">
      <Clock className="w-3 h-3" />
      <span>Updated: {timestamp || 'Pending Upload'}</span>
    </div>
  </div>
);

// --- MAIN APPLICATION ---
export default function App() {
  const [oppData, setOppData] = useState([]);
  const [leadData, setLeadData] = useState([]);
  const [invData, setInvData] = useState([]);
  const [showImport, setShowImport] = useState(false);
  const [viewMode, setViewMode] = useState('dashboard'); 
  const [detailedMetric, setDetailedMetric] = useState('Inquiries');
  
  // Data Persistence State
  const [timestamps, setTimestamps] = useState({ opportunities: null, leads: null, inventory: null });
  const [monthLabels, setMonthLabels] = useState(['Last Month', 'Current Month']);
  const [successMsg, setSuccessMsg] = useState(''); 
  
  // Filters
  const [filters, setFilters] = useState({ model: 'All', location: 'All', consultant: 'All' });

  // --- INITIAL DATA LOAD (FROM LOCAL STORAGE) ---
  useEffect(() => {
    try {
      const savedOpp = localStorage.getItem('dashboard_oppData');
      const savedLead = localStorage.getItem('dashboard_leadData');
      const savedInv = localStorage.getItem('dashboard_invData');
      const savedTimestamps = localStorage.getItem('dashboard_timestamps');
      
      if (savedOpp) {
        const parsedOpp = JSON.parse(savedOpp);
        setOppData(parsedOpp);
        updateMonthLabels(parsedOpp);
      }
      if (savedLead) setLeadData(JSON.parse(savedLead));
      if (savedInv) setInvData(JSON.parse(savedInv));
      if (savedTimestamps) setTimestamps(JSON.parse(savedTimestamps));
    } catch (e) {
      console.error("Failed to load saved data", e);
    }
  }, []);

  // --- HELPERS ---
  const updateMonthLabels = (data) => {
    if (!data || data.length === 0) return;
    const months = {};
    data.forEach(row => {
      const d = row['createdon'] || row['createddate']; 
      if(d) {
        const m = getMonthStr(d);
        if(m !== 'Unknown') months[m] = (months[m]||0)+1;
      }
    });
    
    const sortedMonths = Object.keys(months).sort((a,b) => new Date(a) - new Date(b)); 
    if (sortedMonths.length > 0) {
       const current = sortedMonths[sortedMonths.length - 1]; 
       const prev = sortedMonths.length > 1 ? sortedMonths[sortedMonths.length - 2] : 'Prev';
       setMonthLabels([prev, current]);
    }
  };

  const getMonthStr = (dateStr) => {
    try {
      if(!dateStr) return 'Unknown';
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return 'Unknown';
      return d.toLocaleString('default', { month: 'short', year: '2-digit' });
    } catch { return 'Unknown'; }
  };

  // --- MERGE & SAVE LOGIC ---
  const processData = (newData, type) => {
    const now = new Date();
    const ts = `${now.getDate()}-${(now.getMonth()+1).toString().padStart(2,'0')}-${now.getFullYear()} ${now.getHours()}:${now.getMinutes()}`;
    
    if (type === 'opportunities') {
      setOppData(prev => {
        const mergedMap = new Map(prev.map(item => [item['id'], item]));
        newData.forEach(item => {
          if (item['id']) mergedMap.set(item['id'], item); 
        });
        const finalData = Array.from(mergedMap.values());
        localStorage.setItem('dashboard_oppData', JSON.stringify(finalData));
        updateMonthLabels(finalData);
        return finalData;
      });
      setTimestamps(prev => {
        const newTs = { ...prev, opportunities: ts };
        localStorage.setItem('dashboard_timestamps', JSON.stringify(newTs));
        return newTs;
      });
      setSuccessMsg(`Merged ${newData.length} Opportunities`);

    } else if (type === 'leads') {
      setLeadData(prev => {
        const mergedMap = new Map(prev.map(item => [item['leadid'] || item['lead id'], item]));
        newData.forEach(item => {
          const id = item['leadid'] || item['lead id'] || Math.random(); 
          mergedMap.set(id, item);
        });
        const finalData = Array.from(mergedMap.values());
        localStorage.setItem('dashboard_leadData', JSON.stringify(finalData));
        return finalData;
      });
      setTimestamps(prev => {
        const newTs = { ...prev, leads: ts };
        localStorage.setItem('dashboard_timestamps', JSON.stringify(newTs));
        return newTs;
      });
      setSuccessMsg(`Merged ${newData.length} Leads`);

    } else if (type === 'inventory') {
      setInvData(prev => {
        // ID: 'Vehicle Identification Number' or 'vin' or 'vehicleidentificationnumber'
        // Normalize keys during merge logic to handle different casing from previous saves
        const mergedMap = new Map(prev.map(item => [item['Vehicle Identification Number'] || item['vehicleidentificationnumber'] || item['vin'], item]));
        newData.forEach(item => {
          const id = item['Vehicle Identification Number'] || item['vehicleidentificationnumber'] || item['vin'] || Math.random();
          mergedMap.set(id, item);
        });
        const finalData = Array.from(mergedMap.values());
        localStorage.setItem('dashboard_invData', JSON.stringify(finalData));
        return finalData;
      });
      setTimestamps(prev => {
        const newTs = { ...prev, inventory: ts };
        localStorage.setItem('dashboard_timestamps', JSON.stringify(newTs));
        return newTs;
      });
      setSuccessMsg(`Uploaded ${newData.length} Inventory Records`);
    } else {
        setSuccessMsg(`Unknown File Type`);
    }
    setTimeout(() => setSuccessMsg(''), 5000);
  };

  const clearData = () => {
    if(window.confirm("Are you sure you want to clear all dashboard data?")) {
      localStorage.removeItem('dashboard_oppData');
      localStorage.removeItem('dashboard_leadData');
      localStorage.removeItem('dashboard_invData');
      localStorage.removeItem('dashboard_timestamps');
      setOppData([]);
      setLeadData([]);
      setInvData([]);
      setTimestamps({ opportunities: null, leads: null, inventory: null });
      window.location.reload();
    }
  };

  // --- FILTERED DATASETS ---
  const getFilteredData = (data) => {
    return data.filter(item => {
      // Prioritize explicit keys from user request
      const itemLoc = (item['Dealer Code'] || item['dealercode'] || item['city'] || '').trim();
      const itemCons = (item['Assigned To'] || item['assignedto'] || item['owner'] || '').trim();
      const itemModel = (item['modellinefe'] || item['modelline'] || item['Model Line'] || item['modelline'] || '').trim();

      const matchLoc = filters.location === 'All' || itemLoc === filters.location;
      const matchCons = filters.consultant === 'All' || itemCons === filters.consultant;
      const matchModel = filters.model === 'All' || itemModel === filters.model;

      return matchLoc && matchCons && matchModel;
    });
  };

  const filteredOppData = useMemo(() => getFilteredData(oppData), [oppData, filters]);
  const filteredLeadData = useMemo(() => getFilteredData(leadData), [leadData, filters]);
  const filteredInvData = useMemo(() => getFilteredData(invData), [invData, filters]);

  // --- DERIVED METRICS ---
  
  // 1. Sales Funnel
  const funnelStats = useMemo(() => {
    const currOpps = filteredOppData.filter(d => getMonthStr(d['createdon']) === monthLabels[1]);
    const prevOpps = filteredOppData.filter(d => getMonthStr(d['createdon']) === monthLabels[0]);

    const getMetrics = (data) => {
      const inquiries = data.length;
      const testDrives = data.filter(d => {
        const val = (d['testdrivecompleted'] || '').toLowerCase();
        return val === 'yes' || val === 'completed' || val === 'done';
      }).length;
      const hotLeads = data.filter(d => {
        const score = parseInt(d['opportunityofflinescore'] || '0');
        const status = (d['zqualificationlevel'] || d['status'] || '').toLowerCase();
        return score > 80 || status.includes('hot');
      }).length;
      const bookings = data.filter(d => (d['ordernumber'] || '').trim() !== '').length;
      const retails = data.filter(d => (d['invoicedatev'] || '').trim() !== '').length;
      return { inquiries, testDrives, hotLeads, bookings, retails };
    };

    const curr = getMetrics(currOpps);
    const prev = getMetrics(prevOpps);

    return [
      { label: 'Inquiries', v1: prev.inquiries, v2: curr.inquiries },
      { label: 'Test-drives', v1: prev.testDrives, v2: curr.testDrives, sub2: curr.inquiries ? Math.round((curr.testDrives/curr.inquiries)*100)+'%' : '-' },
      { label: 'Hot Leads', v1: prev.hotLeads, v2: curr.hotLeads, sub2: curr.inquiries ? Math.round((curr.hotLeads/curr.inquiries)*100)+'%' : '-' },
      { label: 'Booking Conversion', v1: prev.bookings, v2: curr.bookings },
      { label: 'Retail Conversion', v1: prev.retails, v2: curr.retails },
    ];
  }, [filteredOppData, monthLabels]);

  // 2. Inventory Stats
  const inventoryStats = useMemo(() => {
    const total = filteredInvData.length;
    
    // Logic for Open vs Booked
    // Look for status keywords in both normalized and original keys
    const getStatus = (item) => (item['Primary Status'] || item['primarystatus'] || item['Description of Primary Status'] || '').toLowerCase();
    
    // Booked if status contains specific keywords
    const booked = filteredInvData.filter(d => {
        const s = getStatus(d);
        return s.includes('book') || s.includes('allot') || s.includes('block') || s.includes('sold') || s.includes('delivered');
    }).length;

    // Open is basically Total - Booked - Wholesale (if any)
    const open = total - booked; 

    const wholesale = 0; // Per request
    const ageing = filteredInvData.filter(d => parseInt(d['Ageing Days'] || d['ageingdays'] || '0') > 90).length;

    return [
      { label: 'Total Inventory', v1: 0, v2: total },
      { label: 'Open Inventory', v1: 0, v2: open, sub2: total ? Math.round((open/total)*100)+'%' : '-' },
      { label: 'Booked Inventory', v1: 0, v2: booked, sub2: total ? Math.round((booked/total)*100)+'%' : '-' },
      { label: 'Wholesale', v1: 0, v2: wholesale },
      { label: 'Ageing (>90D)', v1: 0, v2: ageing },
    ];
  }, [filteredInvData]);

  // 3. Lead Source
  const sourceStats = useMemo(() => {
    const sourceDataset = filteredLeadData.length > 0 ? filteredLeadData : filteredOppData;
    const currData = sourceDataset.filter(d => getMonthStr(d['createdon'] || d['createddate']) === monthLabels[1]);
    
    const counts = {};
    currData.forEach(d => {
      const s = d['source'] || 'Unknown';
      counts[s] = (counts[s] || 0) + 1;
    });
    
    const sorted = Object.entries(counts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 6)
      .map(([label, val]) => ({
        label,
        v1: 0, 
        v2: val,
        sub2: currData.length ? Math.round((val/currData.length)*100)+'%' : '0%'
      }));
      
    return sorted.length ? sorted : [{label: 'No Data', v1:0, v2:0}];
  }, [filteredLeadData, filteredOppData, monthLabels]);

  // --- FILTERS ---
  const allData = useMemo(() => [...oppData, ...leadData, ...invData], [oppData, leadData, invData]);
  
  const locationOptions = useMemo(() => 
    [...new Set(allData.map(d => d['Dealer Code'] || d['dealercode']).filter(Boolean))].sort(), 
  [allData]);

  const consultantOptions = useMemo(() => 
    [...new Set(allData.map(d => d['Assigned To'] || d['assignedto']).filter(Boolean))].sort(), 
  [allData]);

  const modelOptions = useMemo(() => 
    [...new Set(allData.map(d => d['modellinefe'] || d['Model Line']).filter(Boolean))].sort(), 
  [allData]);

  return (
    <div className="min-h-screen bg-slate-50/50 font-sans pb-10">
       <GlobalStyles />
       
       {/* IMPORTER MODAL */}
       <ImportWizard 
         isOpen={showImport} 
         onClose={() => setShowImport(false)} 
         onDataImported={processData} 
       />

       {/* HEADER */}
       <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
         <div className="max-w-[1920px] mx-auto px-4 h-16 flex items-center justify-between">
           <div className="flex items-center gap-3">
             <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-lg flex items-center justify-center text-white shadow-md">
               <Car className="w-5 h-5" />
             </div>
             <div>
                <h1 className="text-lg font-bold text-slate-800 leading-tight">Sales Dashboard</h1>
                <div className="flex items-center gap-2 text-[10px] font-medium text-slate-400">
                  <span>{monthLabels[1]} vs {monthLabels[0]}</span>
                </div>
             </div>
           </div>

           <div className="flex items-center gap-4">
              <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
                <button 
                  onClick={() => setViewMode('dashboard')}
                  className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${viewMode === 'dashboard' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  Dashboard
                </button>
                <button 
                  onClick={() => setViewMode('detailed')}
                  className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${viewMode === 'detailed' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  Analysis
                </button>
                <button 
                  onClick={() => setViewMode('table')}
                  className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${viewMode === 'table' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  Data
                </button>
              </div>

              <div className="h-8 w-[1px] bg-slate-200"></div>

              <button 
                onClick={() => setShowImport(true)}
                className="flex items-center gap-2 bg-slate-800 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-slate-700 transition-colors shadow-sm"
              >
                <Upload className="w-3.5 h-3.5" /> Import Data
              </button>
              
              <button 
                onClick={clearData}
                className="flex items-center gap-2 bg-red-100 text-red-700 px-3 py-2 rounded-lg text-xs font-bold hover:bg-red-200 transition-colors shadow-sm"
                title="Clear All Data"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
           </div>
         </div>

         {/* SUCCESS BANNER */}
         {successMsg && (
           <div className="bg-emerald-50 border-b border-emerald-100 px-4 py-2 flex items-center justify-center gap-2 text-xs font-bold text-emerald-700 animate-fade-in">
             <CheckCircle className="w-4 h-4" /> {successMsg}
           </div>
         )}

         {/* FILTER BAR */}
         <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-2">
           <div className="max-w-[1920px] mx-auto flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2 text-slate-500 text-xs font-bold uppercase tracking-wide">
                <Filter className="w-3.5 h-3.5" /> Filters:
              </div>
              
              {/* Filter 1: Model */}
              <div className="relative">
                <select 
                  className="appearance-none bg-white border border-slate-200 pl-3 pr-8 py-1.5 rounded text-xs font-medium text-slate-700 focus:outline-none focus:border-blue-400 shadow-sm min-w-[120px]"
                  value={filters.model}
                  onChange={e => setFilters({...filters, model: e.target.value})}
                >
                  <option value="All">All Models</option>
                  {modelOptions.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
                <ChevronDown className="w-3 h-3 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>

              {/* Filter 2: Location (Source: Dealer Code) */}
              <div className="relative">
                <select 
                  className="appearance-none bg-white border border-slate-200 pl-3 pr-8 py-1.5 rounded text-xs font-medium text-slate-700 focus:outline-none focus:border-blue-400 shadow-sm min-w-[140px]"
                  value={filters.location}
                  onChange={e => setFilters({...filters, location: e.target.value})}
                >
                  <option value="All">All Locations</option>
                  {locationOptions.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
                <ChevronDown className="w-3 h-3 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>

              {/* Filter 3: Consultant (Source: Assigned To) */}
              <div className="relative">
                <select 
                  className="appearance-none bg-white border border-slate-200 pl-3 pr-8 py-1.5 rounded text-xs font-medium text-slate-700 focus:outline-none focus:border-blue-400 shadow-sm min-w-[160px]"
                  value={filters.consultant}
                  onChange={e => setFilters({...filters, consultant: e.target.value})}
                >
                  <option value="All">All Consultants</option>
                  {consultantOptions.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <ChevronDown className="w-3 h-3 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>

              <div className="ml-auto flex items-center gap-3">
                 <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">View:</span>
                 <div className="flex items-center gap-2 bg-white rounded border border-slate-200 p-0.5">
                   <button className="px-2 py-0.5 text-[10px] font-bold text-blue-700 bg-blue-50 rounded">CY</button>
                   <button className="px-2 py-0.5 text-[10px] font-medium text-slate-400 hover:text-slate-600">LY</button>
                 </div>
                 <div className="flex items-center gap-2">
                    <label className="text-[10px] text-slate-500 font-medium flex items-center gap-1 cursor-pointer">
                      <input type="checkbox" className="rounded text-blue-600 focus:ring-0 w-3 h-3" defaultChecked /> Ratio
                    </label>
                    <label className="text-[10px] text-slate-500 font-medium flex items-center gap-1 cursor-pointer">
                      <input type="checkbox" className="rounded text-blue-600 focus:ring-0 w-3 h-3" /> Benchmark
                    </label>
                 </div>
              </div>
           </div>
         </div>
       </header>

       <main className="max-w-[1920px] mx-auto px-4 py-6">
         {viewMode === 'dashboard' && <DashboardView />}
         {viewMode === 'detailed' && <DetailedView />}
         {viewMode === 'table' && <TableView />}
       </main>

    </div>
  );
}
