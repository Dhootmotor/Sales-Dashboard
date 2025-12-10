import React, { useState, useEffect, useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell 
} from 'recharts';
import { 
  LayoutDashboard, Upload, Filter, TrendingUp, TrendingDown, 
  Users, Car, DollarSign, ChevronDown, FileSpreadsheet, 
  ArrowUpRight, ArrowDownRight, 
  Clock, X, CheckCircle, Download
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
    // Check for known columns in either file type
    if (rawLine.includes('id') || rawLine.includes('lead id') || rawLine.includes('order number') || rawLine.includes('mobile')) {
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
    return row;
  });

  return { headers, rows, rawHeaders }; // Return rawHeaders for type detection
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
      } else if (headerString.includes('vin') || headerString.includes('stock')) {
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
             Upload <strong>"ListofOpportunities.csv"</strong> or <strong>"ListofLeadsCreatedinMarketing.csv"</strong>. <br/>
             <span className="text-xs mt-1 block text-slate-500">
               * The system will automatically detect the file type and update the corresponding dashboard section.
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
            {processing ? 'Processing...' : 'Update Dashboard'}
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
  const [showImport, setShowImport] = useState(false);
  const [viewMode, setViewMode] = useState('dashboard'); 
  const [detailedMetric, setDetailedMetric] = useState('Inquiries');
  const [timestamps, setTimestamps] = useState({ opportunities: null, leads: null, inventory: null });
  const [monthLabels, setMonthLabels] = useState(['Last Month', 'Current Month']);
  const [successMsg, setSuccessMsg] = useState(''); 
  
  // Filters
  const [filters, setFilters] = useState({ model: 'All', location: 'All', consultant: 'All' });

  // --- DATA PROCESSING HELPERS ---
  const getMonthStr = (dateStr) => {
    try {
      if(!dateStr) return 'Unknown';
      // Handle "11-26-2025 04:59 PM" format or ISO
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return 'Unknown';
      return d.toLocaleString('default', { month: 'short', year: '2-digit' });
    } catch { return 'Unknown'; }
  };

  const processData = (data, type) => {
    const now = new Date();
    const ts = `${now.getDate()}-${now.getMonth()+1}-${now.getFullYear()} ${now.getHours()}:${now.getMinutes()}`;
    
    // Auto-detect current month from data
    const months = {};
    data.forEach(row => {
      const d = row['createdon'] || row['createddate']; 
      if(d) {
        const m = getMonthStr(d);
        if(m !== 'Unknown') months[m] = (months[m]||0)+1;
      }
    });
    
    // Sort months and pick top 2
    const sortedMonths = Object.keys(months).sort((a,b) => new Date(a) - new Date(b)); 
    if (sortedMonths.length > 0) {
       const detectedCurrent = sortedMonths[sortedMonths.length - 1]; 
       setMonthLabels(['Prev', detectedCurrent]);
    }

    if (type === 'opportunities') {
      setOppData(data);
      setTimestamps(prev => ({ ...prev, opportunities: ts }));
      setSuccessMsg(`Uploaded ${data.length} Opportunities`);
    } else if (type === 'leads') {
      setLeadData(data);
      setTimestamps(prev => ({ ...prev, leads: ts }));
      setSuccessMsg(`Uploaded ${data.length} Leads`);
    } else if (type === 'inventory') {
      setTimestamps(prev => ({ ...prev, inventory: ts }));
      setSuccessMsg(`Uploaded Inventory Data`);
    }
    setTimeout(() => setSuccessMsg(''), 5000);
  };

  // --- DERIVED METRICS ---
  
  // 1. Sales Funnel (From Opportunities File)
  const funnelStats = useMemo(() => {
    const inquiries = oppData.length;
    
    const testDrives = oppData.filter(d => {
      const val = (d['testdrivecompleted'] || '').toLowerCase();
      return val === 'yes' || val === 'completed' || val === 'done';
    }).length;

    const hotLeads = oppData.filter(d => {
      const score = parseInt(d['opportunityofflinescore'] || '0');
      const status = (d['zqualificationlevel'] || d['status'] || '').toLowerCase();
      return score > 80 || status.includes('hot');
    }).length;

    const bookings = oppData.filter(d => (d['ordernumber'] || '').trim() !== '').length;
    const retails = oppData.filter(d => (d['invoicedatev'] || '').trim() !== '').length;

    return [
      { label: 'Inquiries', v1: 0, v2: inquiries },
      { label: 'Test-drives', v1: 0, v2: testDrives, sub2: inquiries ? Math.round((testDrives/inquiries)*100)+'%' : '-' },
      { label: 'Hot Leads', v1: 0, v2: hotLeads, sub2: inquiries ? Math.round((hotLeads/inquiries)*100)+'%' : '-' },
      { label: 'Booking Conversion', v1: 0, v2: bookings },
      { label: 'Retail Conversion', v1: 0, v2: retails },
    ];
  }, [oppData]);

  // 2. Lead Source (From Leads File preferentially, else Opps)
  const sourceStats = useMemo(() => {
    const dataset = leadData.length > 0 ? leadData : oppData;
    const counts = {};
    dataset.forEach(d => {
      const s = d['source'] || 'Unknown';
      counts[s] = (counts[s] || 0) + 1;
    });
    
    // Sort by count desc
    const sorted = Object.entries(counts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 6)
      .map(([label, val]) => ({
        label,
        v1: 0,
        v2: val,
        sub2: dataset.length ? Math.round((val/dataset.length)*100)+'%' : '0%'
      }));
      
    return sorted.length ? sorted : [{label: 'No Data', v1:0, v2:0}];
  }, [leadData, oppData]);

  // --- FILTERS & OPTIONS ---
  const locationOptions = useMemo(() => [...new Set([...oppData, ...leadData].map(d => d['dealercode'] || d['city']).filter(Boolean))].sort(), [oppData, leadData]);
  const consultantOptions = useMemo(() => [...new Set([...oppData, ...leadData].map(d => d['assignedto'] || d['owner']).filter(Boolean))].sort(), [oppData, leadData]);
  const modelOptions = useMemo(() => [...new Set([...oppData, ...leadData].map(d => d['modellinefe']).filter(Boolean))].sort(), [oppData, leadData]);

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
             rows={[
               { label: 'Total Inventory', v1: 0, v2: 0 },
               { label: 'Open Inventory', v1: 0, v2: 0 },
               { label: 'Booked Inventory', v1: 0, v2: 0 },
               { label: 'Wholesale', v1: 0, v2: 0 },
               { label: 'Ageing (>90D)', v1: 0, v2: 0 },
             ]} 
             headers={monthLabels} 
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
    // Simplified logic for detail view using oppData
    const consultantMix = useMemo(() => {
        const counts = {};
        oppData.forEach(d => { 
            const c = d['assignedto'];
            if(c) counts[c] = (counts[c] || 0) + 1; 
        });
        return Object.entries(counts).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value);
    }, [oppData]);

    const modelMix = useMemo(() => {
        const counts = {};
        oppData.forEach(d => { 
            const m = d['modellinefe'];
            if(m) counts[m] = (counts[m] || 0) + 1; 
        });
        return Object.entries(counts).map(([name, value]) => ({ name, value }));
    }, [oppData]);

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
            <p className="text-xs text-slate-400">Analysis based on uploaded data</p>
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
             {(oppData.length > 0 ? oppData : leadData).slice(0, 100).map((row, idx) => (
               <tr key={idx} className="hover:bg-blue-50/30">
                 <td className="p-3 font-mono text-slate-500">{row['id'] || row['leadid']}</td>
                 <td className="p-3">{row['customer'] || row['name']}</td>
                 <td className="p-3">{row['mobile no.'] || row['customer phone']}</td>
                 <td className="p-3"><span className="bg-slate-100 px-2 py-0.5 rounded border border-slate-200">{row['modellinefe']}</span></td>
                 <td className="p-3">{row['createdon'] || row['createddate']}</td>
                 <td className="p-3">{row['status'] || row['qualificationlevel']}</td>
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
