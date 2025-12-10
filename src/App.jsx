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

// --- STYLES (Merged from index.css) ---
const GlobalStyles = () => (
  <style>{`
    ::-webkit-scrollbar {
      width: 6px;
      height: 6px;
    }
    ::-webkit-scrollbar-track {
      background: #f1f5f9; 
    }
    ::-webkit-scrollbar-thumb {
      background: #cbd5e1; 
      border-radius: 3px;
    }
    ::-webkit-scrollbar-thumb:hover {
      background: #94a3b8; 
    }
    .animate-fade-in {
      animation: fadeIn 0.5s ease-out forwards;
    }
    .animate-fade-in-up {
      animation: fadeInUp 0.5s ease-out forwards;
    }
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes fadeInUp {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `}</style>
);

// --- CONSTANTS & CONFIG ---
const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658', '#8dd1e1'];

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
    if (rawLine.includes('id') || rawLine.includes('lead id') || rawLine.includes('order number') || rawLine.includes('vehicle identification number') || rawLine.includes('company code')) {
      headerIndex = i;
      break;
    }
  }

  const rawHeaders = parseLine(lines[headerIndex]);
  // Normalized headers for easier access (lowercase, no spaces)
  const headers = rawHeaders.map(h => h.toLowerCase().trim().replace(/[\s_().-]/g, ''));
  
  const rows = lines.slice(headerIndex + 1).map((line) => {
    const values = parseLine(line);
    const row = {};
    
    // Store using normalized keys (e.g. 'vehicleidentificationnumber')
    headers.forEach((h, i) => { if (h) row[h] = values[i] || ''; });
    
    // Store using ORIGINAL keys (e.g. 'Vehicle Identification Number') for display/specific logic
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
      // Detection Logic based on specific columns in user's files
      if (headerString.includes('opportunity offline score') || headerString.includes('order number')) {
        type = 'opportunities';
      } else if (headerString.includes('lead id') || headerString.includes('qualification level')) {
        type = 'leads';
      } else if (headerString.includes('vehicle identification number') || headerString.includes('model sales code') || headerString.includes('company code')) {
        type = 'inventory'; 
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
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl overflow-hidden animate-fade-in-up">
        <div className="bg-slate-800 px-6 py-4 flex justify-between items-center">
          <h2 className="text-white font-bold text-lg flex items-center gap-2">
            <Upload className="w-5 h-5" /> Import Data
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        
        <div className="p-6 space-y-6">
          <div className="bg-blue-50 border border-blue-100 p-4 rounded-lg text-sm text-blue-800">
             Upload <strong>"ListofOpportunities.csv"</strong>, <strong>"ListofLeads..."</strong> or <strong>"Inventory.csv"</strong>. <br/>
             <span className="text-xs mt-1 block text-slate-500">
               * Data is automatically saved to your browser storage. New uploads are merged with existing data (updates existing IDs, adds new ones).
             </span>
          </div>

          <div className="border-2 border-dashed border-slate-200 rounded-lg p-8 hover:border-blue-400 transition-colors bg-slate-50 relative group flex flex-col items-center justify-center text-center">
                <FileSpreadsheet className="w-12 h-12 text-blue-600 mb-4" /> 
                <div className="text-slate-700 font-semibold text-lg mb-1">
                  {file ? file.name : "Click to Upload CSV"}
                </div>
                <p className="text-sm text-slate-400">Supported format: .csv</p>
                <input 
                  type="file" 
                  accept=".csv"
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  onChange={handleFileChange}
                />
          </div>
        </div>

        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-lg">Cancel</button>
          <button 
            onClick={processFiles} 
            disabled={processing || !file}
            className={`px-4 py-2 text-sm font-bold text-white rounded-lg flex items-center gap-2 ${processing || !file ? 'bg-slate-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 shadow-md'}`}
          >
            {processing ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Upload className="w-4 h-4" />}
            {processing ? 'Processing...' : 'Upload & Merge'}
          </button>
        </div>
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
  const [invData, setInvData] = useState([]); // State for Inventory
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
      const savedInv = localStorage.getItem('dashboard_invData'); // Load Inventory
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
    
    // Sort months simply by date object
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
        // ID for inventory is usually VIN. Check for lowercase 'vehicleidentificationnumber' because parser lowercases keys.
        const mergedMap = new Map(prev.map(item => [item['vehicleidentificationnumber'] || item['vin'], item]));
        newData.forEach(item => {
          const id = item['vehicleidentificationnumber'] || item['vin'] || Math.random();
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

  // --- DERIVED METRICS ---
  
  // 1. Sales Funnel
  const funnelStats = useMemo(() => {
    // Current Month Data
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

  // 2. Inventory Stats (Real Calculation)
  const inventoryStats = useMemo(() => {
    const total = filteredInvData.length;
    // Helper to check status safely - check both normalized and original keys
    const checkStatus = (item, keywords) => {
       const status = (item['Primary Status'] || item['primarystatus'] || '').toLowerCase();
       return keywords.some(k => status.includes(k));
    };

    const open = filteredInvData.filter(d => checkStatus(d, ['initial', 'created', 'transit'])).length;
    const booked = filteredInvData.filter(d => checkStatus(d, ['allotted', 'booked', 'blocked'])).length;
    const wholesale = filteredInvData.filter(d => checkStatus(d, ['wholesale', 'invoice'])).length;
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
    // Prefer Lead File, fallback to Opp File
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
        v1: 0, // Simplified for now (Prev month requires separate calc)
        v2: val,
        sub2: currData.length ? Math.round((val/currData.length)*100)+'%' : '0%'
      }));
      
    return sorted.length ? sorted : [{label: 'No Data', v1:0, v2:0}];
  }, [filteredLeadData, filteredOppData, monthLabels]);

  // --- FILTERS & OPTIONS (From Columns: Dealer Code & Assigned To) ---
  // Combine unique values from both datasets
  const allDataForFilters = useMemo(() => [...oppData, ...leadData, ...invData], [oppData, leadData, invData]);
  
  const locationOptions = useMemo(() => 
    [...new Set(allDataForFilters.map(d => d['Dealer Code'] || d['dealercode']).filter(Boolean))].sort(), 
  [allDataForFilters]);

  const consultantOptions = useMemo(() => 
    [...new Set(allDataForFilters.map(d => d['Assigned To'] || d['assignedto']).filter(Boolean))].sort(), 
  [allDataForFilters]);

  const modelOptions = useMemo(() => 
    [...new Set(allDataForFilters.map(d => d['modellinefe'] || d['Model Line']).filter(Boolean))].sort(), 
  [allDataForFilters]);

  // --- VIEW RENDERERS ---
  const DashboardView = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 animate-fade-in">
       {/* Card 1: Sales Funnel */}
       <div className={`rounded-lg shadow-sm border p-4 flex flex-col h-full hover:shadow-md transition-shadow cursor-pointer bg-white border-slate-200`} onClick={() => { setDetailedMetric('Inquiries'); setViewMode('detailed'); }}>
          <div className="flex items-center gap-2 mb-4 border-b border-slate-100 pb-2">
            <div className="bg-blue-50 p-1.5 rounded text-blue-600"><LayoutDashboard className="w-4 h-4" /></div>
            <h3 className="font-bold text-slate-700">Sales Funnel</h3>
          </div>
          <ComparisonTable rows={funnelStats} headers={monthLabels} timestamp={timestamps.opportunities} />
       </div>

       {/* Card 2: Inventory */}
       <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4 flex flex-col h-full hover:shadow-md transition-shadow">
          <div className="flex items-center gap-2 mb-4 border-b border-slate-100 pb-2">
            <div className="bg-indigo-50 p-1.5 rounded text-indigo-600"><Car className="w-4 h-4" /></div>
            <h3 className="font-bold text-slate-700">Inventory</h3>
          </div>
          <ComparisonTable 
             rows={inventoryStats} 
             headers={['', 'Total']} 
             timestamp={timestamps.inventory} 
           />
       </div>

       {/* Card 3: Lead Source */}
       <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4 flex flex-col h-full hover:shadow-md transition-shadow">
          <div className="flex items-center gap-2 mb-4 border-b border-slate-100 pb-2">
            <div className="bg-emerald-50 p-1.5 rounded text-emerald-600"><TrendingUp className="w-4 h-4" /></div>
            <h3 className="font-bold text-slate-700">Lead Source</h3>
          </div>
          <ComparisonTable rows={sourceStats} headers={monthLabels} timestamp={timestamps.leads} />
       </div>

       {/* Card 4: Cross Sell */}
       <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4 flex flex-col h-full hover:shadow-md transition-shadow">
          <div className="flex items-center gap-2 mb-4 border-b border-slate-100 pb-2">
            <div className="bg-purple-50 p-1.5 rounded text-purple-600"><FileSpreadsheet className="w-4 h-4" /></div>
            <h3 className="font-bold text-slate-700">Cross-Sell</h3>
          </div>
          <ComparisonTable rows={[
               {label: 'Car Finance', v1: 0, v2: 0},
               {label: 'Insurance', v1: 0, v2: 0},
               {label: 'Exchange', v1: 0, v2: 0},
               {label: 'Accessories', v1: 0, v2: 0, type: 'currency'}
           ]} headers={monthLabels} timestamp={timestamps.opportunities} />
       </div>

       {/* Card 5: Sales Management */}
       <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4 flex flex-col h-full hover:shadow-md transition-shadow">
          <div className="flex items-center gap-2 mb-4 border-b border-slate-100 pb-2">
            <div className="bg-orange-50 p-1.5 rounded text-orange-600"><Users className="w-4 h-4" /></div>
            <h3 className="font-bold text-slate-700">Sales Management</h3>
          </div>
          <ComparisonTable rows={[
               {label: 'Bookings', v1: 0, v2: funnelStats[3].v2},
               {label: 'Dlr. Retail', v1: 0, v2: funnelStats[4].v2},
               {label: 'OEM Retail', v1: 0, v2: 0},
               {label: 'POC Sales', v1: 0, v2: 0}
           ]} headers={monthLabels} timestamp={timestamps.opportunities} />
       </div>

       {/* Card 6: Profit */}
       <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4 flex flex-col h-full hover:shadow-md transition-shadow">
          <div className="flex items-center gap-2 mb-4 border-b border-slate-100 pb-2">
            <div className="bg-rose-50 p-1.5 rounded text-rose-600"><DollarSign className="w-4 h-4" /></div>
            <h3 className="font-bold text-slate-700">Profit & Productivity</h3>
          </div>
          <ComparisonTable rows={[
               {label: 'New car Margin', v1: 0, v2: 0, type: 'currency'},
               {label: 'Margin per car', v1: 0, v2: 0},
               {label: 'Used cars Margin', v1: 0, v2: 0, type: 'currency'},
               {label: 'SC Productivity', v1: 0, v2: 0},
           ]} headers={monthLabels} timestamp={timestamps.opportunities} />
       </div>
    </div>
  );

  const DetailedView = () => {
    // Simplified logic for detail view using filteredOppData
    const consultantMix = useMemo(() => {
        const counts = {};
        filteredOppData.forEach(d => { 
            const c = d['Assigned To'] || d['assignedto'];
            if(c) counts[c] = (counts[c] || 0) + 1; 
        });
        return Object.entries(counts).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value);
    }, [filteredOppData]);

    const modelMix = useMemo(() => {
        const counts = {};
        filteredOppData.forEach(d => { 
            const m = d['modellinefe'];
            if(m) counts[m] = (counts[m] || 0) + 1; 
        });
        return Object.entries(counts).map(([name, value]) => ({ name, value }));
    }, [filteredOppData]);

    return (
      <div className="space-y-6 animate-fade-in">
        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 flex items-center gap-3">
          <button onClick={() => setViewMode('dashboard')} className="p-1 hover:bg-slate-100 rounded">
             <ArrowDownRight className="w-5 h-5 text-slate-500 rotate-135" />
          </button>
          <div>
            <h2 className="text-xl font-bold text-blue-700 flex items-center gap-2">
              {detailedMetric} Analysis
            </h2>
            <p className="text-xs text-slate-400">Analysis based on filtered data</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
           <div className="lg:col-span-2 bg-white p-6 rounded-lg shadow-sm border border-slate-200">
             <h3 className="font-bold text-slate-700 mb-4">Consultant Performance</h3>
             <div className="h-64">
               <ResponsiveContainer width="100%" height="100%">
                 <BarChart data={consultantMix} layout="vertical" margin={{left: 40}}>
                   <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                   <XAxis type="number" hide />
                   <YAxis dataKey="name" type="category" width={110} tick={{fontSize: 10}} axisLine={false} tickLine={false} />
                   <RechartsTooltip cursor={{fill: '#f8fafc'}} />
                   <Bar dataKey="value" fill="#6366f1" radius={[0, 4, 4, 0]} barSize={18} />
                 </BarChart>
               </ResponsiveContainer>
             </div>
           </div>

           <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
             <h3 className="font-bold text-slate-700 mb-4">Model Split</h3>
             <div className="h-64">
               <ResponsiveContainer width="100%" height="100%">
                 <PieChart>
                   <Pie data={modelMix} innerRadius={60} outerRadius={80} paddingAngle={2} dataKey="value">
                     {modelMix.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                   </Pie>
                   <RechartsTooltip />
                   <Legend verticalAlign="bottom" height={36} iconType="circle" iconSize={8} />
                 </PieChart>
               </ResponsiveContainer>
             </div>
           </div>
        </div>
      </div>
    );
  };

  const TableView = () => (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden animate-fade-in">
       <div className="p-4 border-b border-slate-100 flex justify-between items-center">
          <h3 className="font-bold text-slate-700">Raw Data</h3>
          <button className="flex items-center gap-2 bg-emerald-600 text-white px-3 py-1.5 rounded text-xs font-bold hover:bg-emerald-700">
            <Download className="w-3 h-3" /> Excel
          </button>
       </div>
       <div className="overflow-x-auto">
         <table className="w-full text-left text-xs text-slate-600">
           <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
             <tr>
               <th className="p-3">ID</th>
               <th className="p-3">Customer</th>
               <th className="p-3">Mobile</th>
               <th className="p-3">Model</th>
               <th className="p-3">Date</th>
               <th className="p-3">Status</th>
             </tr>
           </thead>
           <tbody className="divide-y divide-slate-100">
             {(filteredOppData.length > 0 ? filteredOppData : (filteredLeadData.length > 0 ? filteredLeadData : filteredInvData)).slice(0, 100).map((row, idx) => (
               <tr key={idx} className="hover:bg-blue-50/30">
                 <td className="p-3 font-mono text-slate-500">{row['id'] || row['leadid'] || row['vehicleidentificationnumber'] || row['vin']}</td>
                 <td className="p-3">{row['customer'] || row['name'] || '-'}</td>
                 <td className="p-3">{row['mobile no.'] || row['customer phone'] || '-'}</td>
                 <td className="p-3"><span className="bg-slate-100 px-2 py-0.5 rounded border border-slate-200">{row['modellinefe'] || row['modelline']}</span></td>
                 <td className="p-3">{row['createdon'] || row['createddate'] || row['grndate']}</td>
                 <td className="p-3">{row['status'] || row['qualificationlevel'] || row['primarystatus']}</td>
               </tr>
             ))}
           </tbody>
         </table>
       </div>
    </div>
  );

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
