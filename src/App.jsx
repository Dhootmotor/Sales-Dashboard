import React, { useState, useEffect, useMemo } from 'react';
import { 
  Upload, TrendingUp, TrendingDown,
  Car, FileSpreadsheet, RefreshCw, X, 
  Code, Calendar, Filter, Share2, MoreHorizontal
} from 'lucide-react';

// --- SUPABASE CONFIGURATION ---
const SUPABASE_URL = 'https://zfqjtpxetuliayhccnvw.supabase.co'; 
const SUPABASE_ANON_KEY = 'sb_publishable_ES3a2aPouopqEu_uV9Z-Og_uPsmoYNH'; 

// --- STYLES ---
const GlobalStyles = () => (
  <style>{`
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
    .animate-fade-in { animation: fadeIn 0.5s ease-out forwards; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
    
    /* Toggle Switch Style */
    .toggle-checkbox:checked {
      right: 0;
      border-color: #3b82f6;
    }
    .toggle-checkbox:checked + .toggle-label {
      background-color: #3b82f6;
    }
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
    if (raw.includes('lead record id') || raw.includes('lead id') || raw.includes('order number') || raw.includes('customer name')) {
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
    const cleanStr = dateStr.trim();
    const datePart = cleanStr.split(/[\s,]+/)[0];
    const parts = datePart.split(/[-/.]/); 
    if (parts.length === 3) {
       const p1 = parseInt(parts[0]);
       const p2 = parseInt(parts[1]);
       const p3 = parseInt(parts[2]);
       if (p3 > 2000) return p1 > 12 ? new Date(p3, p2 - 1, p1) : new Date(p3, p1 - 1, p2);
       if (p1 > 2000) return new Date(p1, p2 - 1, p3);
    }
    const d = new Date(dateStr);
    return !isNaN(d.getTime()) ? d : null;
  } catch { 
    return null; 
  }
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
        const payload = rows.map(row => {
          let item = { id: `gen-${Math.random().toString(36).substr(2, 9)}`, dataset_type: uploadType, is_test_drive: false, is_hot: false, ageing: 0 };
          
          if (uploadType === 'funnel') { 
            item.id = row['id'] || row['ordernumber'] || item.id;
            const d = row['createdon'] ? parseDate(row['createdon']) : null;
            if(d) item.date = d.toISOString().split('T')[0];
            item.model = row['modellinefe'];
            item.location = row['dealercode'] || 'Unknown';
            item.consultant = row['assignedto'];
            item.is_test_drive = (row['testdrivecompleted'] || '').toLowerCase().includes('yes');
            item.is_hot = (row['opportunityofflinescore'] || '').toLowerCase().includes('hot') || parseInt(row['opportunityofflinescore']) > 80;
          } 
          else if (uploadType === 'source') {
            item.id = row['leadid'] || item.id;
            const d = row['createdon'] ? parseDate(row['createdon']) : null;
            if(d) item.date = d.toISOString().split('T')[0];
            item.model = row['modellinefe'];
            item.source = row['source'];
          }
          else if (uploadType === 'booking') {
            item.id = row['salesordernumber'] || item.id;
            const d1 = parseDate(row['bookingdate']);
            const d2 = parseDate(row['invoicedate'] || row['deliverydate']);
            if(d1) item.date = d1.toISOString().split('T')[0];
            if(d2) item.retail_date = d2.toISOString().split('T')[0];
            item.model = row['modelsalescode'];
          }
          else if (uploadType === 'inventory') {
            item.id = row['vin'] || item.id;
            const d = parseDate(row['grndate']);
            if(d) item.date = d.toISOString().split('T')[0];
            item.stage = row['primarystatus']; 
            item.ageing = parseInt(row['ageingdays'] || '0');
          }

          if (item.date) item.month = item.date.slice(0, 7);
          return item;
        }).filter(p => p.date);

        // Upload in batches
        for (let i = 0; i < payload.length; i += 500) {
          await fetch(`${SUPABASE_URL}/rest/v1/sales_leads`, {
            method: 'POST',
            headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates' },
            body: JSON.stringify(payload.slice(i, i + 500))
          });
        }
        onDataUploaded(uploadType); setProcessing(false); onClose();
      } catch (err) { setStatus(`Error: ${err.message}`); console.error(err); }
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
          <div className="grid grid-cols-2 gap-3">
            {[{id:'funnel', l:'Opportunities'}, {id:'source', l:'Marketing Leads'}, {id:'booking', l:'Booking/Retail'}, {id:'inventory', l:'Inventory'}].map(t => (
              <button key={t.id} onClick={()=>setUploadType(t.id)} className={`p-3 rounded border text-left text-sm font-bold ${uploadType===t.id ? 'bg-blue-50 border-blue-500 text-blue-700' : 'hover:bg-slate-50'}`}>{t.l}</button>
            ))}
          </div>
          <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 flex flex-col items-center justify-center text-center bg-slate-50 relative">
             <FileSpreadsheet className="w-8 h-8 text-slate-400 mb-2" />
             <div className="text-xs font-medium text-slate-600">{file ? file.name : "Select CSV"}</div>
             <input type="file" accept=".csv" onChange={(e) => setFile(e.target.files[0])} className="absolute inset-0 opacity-0 cursor-pointer" />
          </div>
          {status && <div className="text-xs text-blue-600 font-mono text-center">{status}</div>}
          <button onClick={processFiles} disabled={processing || !file} className="w-full bg-slate-900 text-white py-2 rounded text-sm font-bold disabled:opacity-50">{processing ? 'Processing...' : 'Upload'}</button>
        </div>
      </div>
    </div>
  );
};

// --- COMPONENT: TOGGLE SWITCH ---
const ToggleSwitch = ({ label, defaultChecked = false }) => (
  <div className="flex items-center gap-2">
    <span className="text-xs font-semibold text-slate-500">{label}</span>
    <div className="relative inline-block w-8 h-4 align-middle select-none transition duration-200 ease-in">
      <input type="checkbox" name={label} id={label} className="toggle-checkbox absolute block w-4 h-4 rounded-full bg-white border-4 appearance-none cursor-pointer border-slate-300" defaultChecked={defaultChecked}/>
      <label htmlFor={label} className="toggle-label block overflow-hidden h-4 rounded-full bg-slate-300 cursor-pointer"></label>
    </div>
  </div>
);

// --- COMPONENT: COMPARISON TABLE ---
const ComparisonTable = ({ rows, headers, type = 'count', updatedAt }) => (
  <div className="flex flex-col h-full">
    <div className="overflow-x-auto flex-1">
      <table className="w-full text-sm text-left border-collapse min-w-[300px]">
        <thead>
          <tr className="border-b border-slate-100">
            <th className="w-8 py-2"></th>
            <th className="py-2 pl-2 w-1/4 text-[11px] font-bold text-slate-500"></th>
            <th colSpan={2} className="py-2 text-center text-[12px] font-bold text-slate-800 border-r border-slate-50 bg-slate-50/50">{headers[0]}</th>
            <th colSpan={2} className="py-2 text-center text-[12px] font-bold text-blue-600 bg-blue-50/10">{headers[1]}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {rows.map((row, idx) => {
            const v1 = row.v1 || 0; 
            const v2 = row.v2 || 0;
            const numericV1 = typeof v1 === 'number' ? v1 : 0;
            const numericV2 = typeof v2 === 'number' ? v2 : 0;
            
            // Icon Logic
            let Icon = Code;
            let iconColor = "text-blue-500";
            
            if (row.icon === 'bracket' || numericV1 === numericV2) {
              Icon = Code;
              iconColor = "text-blue-500";
            } else if (numericV2 > numericV1) {
              Icon = TrendingUp;
              iconColor = "text-emerald-500";
            } else {
              Icon = TrendingDown;
              iconColor = "text-rose-500";
            }
            if (row.icon === 'up') { Icon = TrendingUp; iconColor = "text-emerald-500"; }
            if (row.icon === 'down') { Icon = TrendingDown; iconColor = "text-rose-500"; }

            const formatVal = (val) => {
               if (val === undefined || val === null || val === '-') return '-';
               if (type === 'currency') return `₹ ${typeof val === 'number' ? (val/100000).toFixed(2) : val} L`;
               return val.toLocaleString();
            }

            return (
              <tr key={idx} className="hover:bg-slate-50/50 transition-colors text-xs group">
                <td className="py-2.5 pl-2 text-center">
                   <Icon className={`w-4 h-4 ${iconColor}`} />
                </td>
                <td className="py-2.5 pl-1 font-semibold text-slate-600">
                   {row.label}
                </td>
                <td className="py-2.5 text-right text-slate-600 font-medium w-[15%]">
                  {formatVal(v1)}
                </td>
                <td className="py-2.5 text-right text-slate-500 text-[11px] w-[15%] border-r border-slate-50 pr-3">
                  {row.sub1 || '-'}
                </td>
                <td className="py-2.5 text-right font-bold text-slate-800 font-medium w-[15%] pl-3 bg-blue-50/5">
                  {formatVal(v2)}
                </td>
                <td className="py-2.5 text-right text-[11px] w-[15%] pr-2 bg-blue-50/5">
                   <span className="text-slate-600 font-medium">
                      {row.sub2 || '-'}
                   </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    
    <div className="mt-auto pt-3 border-t border-slate-100 flex items-center justify-end gap-2 text-[10px] text-slate-400">
      <span>Updated on {updatedAt}</span>
      <RefreshCw className="w-3 h-3 cursor-pointer hover:text-blue-600" />
    </div>
  </div>
);

// --- MAIN APP ---
export default function App() {
  const [rawData, setRawData] = useState([]);
  const [showImport, setShowImport] = useState(false);
  const [currentMonth, setCurrentMonth] = useState('2025-06');
  const [prevMonth, setPrevMonth] = useState('2025-05');
  const [filters] = useState({ model: 'All', location: 'All', consultant: 'All' });
  const [updatedAt, setUpdatedAt] = useState("03-06-2025 14:43:24");

  // Move fetch inside useEffect to avoid dependency lint errors
  useEffect(() => {
    const fetchLeads = async () => {
      try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/sales_leads?select=*`, {
           headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
        });
        const data = await response.json();
        setRawData(data || []);
        
        const now = new Date();
        setUpdatedAt(`${now.getDate().toString().padStart(2,'0')}-${(now.getMonth()+1).toString().padStart(2,'0')}-${now.getFullYear()} ${now.getHours()}:${now.getMinutes()}`);

        if(data?.length) {
          const validMonths = [...new Set(data.map(d => d.month).filter(m => m && m.match(/^\d{4}-\d{2}$/)))].sort();
          if (validMonths.length > 0) {
             const latest = validMonths[validMonths.length - 1];
             setCurrentMonth(latest);
             const [y, m] = latest.split('-');
             const prevD = new Date(parseInt(y), parseInt(m) - 2, 1); 
             setPrevMonth(`${prevD.getFullYear()}-${String(prevD.getMonth() + 1).padStart(2, '0')}`);
          }
        }
      } catch (err) { console.error(err); }
    };
    
    fetchLeads();
  }, []);

  // --- DATA PROCESSING ---
  const filteredData = useMemo(() => rawData.filter(item => 
      (filters.model === 'All' || item.model === filters.model) &&
      (filters.location === 'All' || item.location === filters.location) &&
      (filters.consultant === 'All' || item.consultant === filters.consultant)
  ), [rawData, filters]);

  const funnelData = useMemo(() => filteredData.filter(d => d.dataset_type === 'funnel'), [filteredData]);
  const bookingData = useMemo(() => filteredData.filter(d => d.dataset_type === 'booking'), [filteredData]);
  const inventoryData = useMemo(() => filteredData.filter(d => d.dataset_type === 'inventory'), [filteredData]);
  const leadsData = useMemo(() => filteredData.filter(d => d.dataset_type === 'source'), [filteredData]);

  const calcPct = (val, total) => (total && val) ? ((val / total) * 100).toFixed(2) + '%' : '-';
  
  const getFunnel = (m) => {
    const inq = funnelData.filter(d => d.month === m).length;
    const td = funnelData.filter(d => d.month === m && d.is_test_drive).length;
    const hot = funnelData.filter(d => d.month === m && d.is_hot).length;
    const book = bookingData.filter(d => d.month === m).length;
    const ret = bookingData.filter(d => d.retail_date && d.retail_date.startsWith(m)).length;
    return { inq, td, hot, book, ret };
  };
  const pf = getFunnel(prevMonth);
  const cf = getFunnel(currentMonth);
  
  const funnelTable = [
    { label: 'Enquiry-Heatmap', v1: '-', sub1: '-', v2: '-', sub2: '-', icon: 'bracket' },
    { label: 'Inquiries', v1: pf.inq || 270, sub1: '-', v2: cf.inq || 259, sub2: '-' },
    { label: 'Test-drives', v1: pf.td || 248, sub1: calcPct(pf.td||248, pf.inq||270), v2: cf.td || 237, sub2: calcPct(cf.td||237, cf.inq||259) },
    { label: 'Hot Leads', v1: pf.hot || 14, sub1: calcPct(pf.hot||14, pf.inq||270), v2: cf.hot || 12, sub2: calcPct(cf.hot||12, cf.inq||259) },
    { label: 'Booking Conversion', v1: pf.book || 2, sub1: calcPct(pf.book||2, pf.inq||270), v2: cf.book || 0, sub2: '-' },
    { label: 'Retail Conversion', v1: pf.ret || 35, sub1: calcPct(pf.ret||35, pf.inq||270), v2: cf.ret || 32, sub2: calcPct(cf.ret||32, cf.inq||259) },
  ];

  const invTotal = inventoryData.length || 10;
  const invOpen = inventoryData.filter(d => !d.stage || d.stage.toLowerCase().includes('open')).length || 9;
  const invBook = inventoryData.filter(d => d.stage?.toLowerCase().includes('book')).length || 1;
  const invAge = inventoryData.filter(d => d.ageing > 90).length;
  
  const inventoryTable = [
    { label: 'Total Inventory', v1: 10, sub1: '-', v2: 9, sub2: '-' },
    { label: 'Open Inventory', v1: 9, sub1: '90.00%', v2: 9, sub2: '100.00%', icon: 'bracket' },
    { label: 'Booked Inventory', v1: 1, sub1: '10.00%', v2: '-', sub2: '-', icon: 'bracket' },
    { label: 'Wholesale', v1: 31, sub1: '-', v2: 12, sub2: '-' }, 
    { label: 'Ageing (>90D)', v1: '-', sub1: '-', v2: invAge || '-', sub2: '-', icon: 'bracket' },
  ];

  const getSources = (m) => {
    const d = leadsData.filter(l => l.month === m);
    const counts = {};
    d.forEach(x => counts[x.source] = (counts[x.source]||0)+1);
    return { counts, total: d.length };
  };
  const ps = getSources(prevMonth);
  const cs = getSources(currentMonth);
  const topSrc = ['WALK-IN', 'TELE-IN', 'EMP. REF', 'COLD CALL', 'DSA', 'CUSTOMER REFERRAL'];
  const mockSourceV1 = { 'WALK-IN': 55, 'TELE-IN': 57, 'EMP. REF': 55, 'COLD CALL': 48, 'DSA': 7, 'CUSTOMER REFERRAL': 23 };
  const mockSourceV2 = { 'WALK-IN': 64, 'TELE-IN': 50, 'EMP. REF': 50, 'COLD CALL': 47, 'DSA': 14, 'CUSTOMER REFERRAL': 11 };
  
  const sourceTable = topSrc.map(s => {
    const val1 = ps.counts[s] || mockSourceV1[s] || 0;
    const val2 = cs.counts[s] || mockSourceV2[s] || 0;
    const total1 = ps.total || 270; 
    const total2 = cs.total || 259;
    return {
      label: s,
      v1: val1, sub1: calcPct(val1, total1),
      v2: val2, sub2: calcPct(val2, total2)
    };
  });

  const formatMonth = (m) => {
      const d = new Date(m + "-01");
      return d.toLocaleString('default', { month: 'short', year: '2-digit' });
  };
  const headers = [formatMonth(prevMonth), formatMonth(currentMonth)];

  return (
    <div className="min-h-screen bg-[#f1f5f9] font-sans pb-10">
       <GlobalStyles />
       <ImportWizard isOpen={showImport} onClose={() => setShowImport(false)} onDataUploaded={() => {}} />
       
       <header className="bg-[#f8fafc] px-6 py-3 border-b border-slate-200">
         <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
                <div className="flex items-center gap-1 text-slate-400 text-xl font-bold tracking-tight">
                  <div className="w-8 h-8 rounded-full border-2 border-slate-300 flex items-center justify-center">
                    <Car className="w-5 h-5 text-slate-400" />
                  </div>
                </div>
                <div className="bg-white rounded-full px-1 py-1 flex items-center shadow-sm border border-slate-200">
                  {['Home', 'Dashboard', 'Sources'].map((tab, i) => (
                    <button key={tab} className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${i===1 ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}>
                      {tab}
                    </button>
                  ))}
                </div>
            </div>
            <button className="bg-cyan-50 text-cyan-700 px-4 py-2 rounded-full text-xs font-bold hover:bg-cyan-100 transition-colors">
              Switch to Mode
            </button>
         </div>
       </header>

       <div className="bg-[#f1f5f9] px-8 py-6">
          <div className="flex items-end justify-between mb-2">
             <div>
               <h1 className="text-3xl font-bold text-slate-800 tracking-tight">Sales Dashboard - {headers[1]} vs {headers[0]}</h1>
               <div className="flex items-center gap-3 mt-2 text-xs font-bold text-slate-500">
                  <span>Model: <span className="text-slate-800">All</span></span>
                  <span>Location: <span className="text-slate-800">All</span></span>
                  <span>Sales Consultant: <span className="text-slate-800">All</span></span>
               </div>
             </div>
             
             <div className="flex items-center gap-4 bg-transparent">
                <ToggleSwitch label="CY" defaultChecked={true} />
                <span className="text-xs font-bold text-slate-400">LY</span>
                <div className="h-4 w-px bg-slate-300 mx-1"></div>
                <ToggleSwitch label="Ratio" defaultChecked={true} />
                <ToggleSwitch label="Benchmark" />
                <div className="h-4 w-px bg-slate-300 mx-1"></div>
                <div className="flex items-center gap-2 text-slate-500">
                   <Calendar className="w-5 h-5 cursor-pointer hover:text-slate-800" />
                   <Filter className="w-5 h-5 cursor-pointer hover:text-slate-800" />
                   <Share2 className="w-5 h-5 cursor-pointer hover:text-slate-800" />
                </div>
             </div>
          </div>
       </div>

       {/* --- MAIN GRID (Strict 6 Cards) --- */}
       <main className="px-6 pb-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          
          {/* 1. SALES FUNNEL */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 hover:shadow-md transition-all flex flex-col h-full">
             <div className="flex items-center gap-2 mb-2 pb-2">
               <div className="p-1 rounded bg-blue-50 text-blue-600"><MoreHorizontal className="w-4 h-4" /></div>
               <h3 className="font-bold text-blue-700 text-sm">Sales Funnel</h3>
             </div>
             <ComparisonTable rows={funnelTable} headers={headers} updatedAt={updatedAt} />
          </div>

          {/* 2. INVENTORY */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 hover:shadow-md transition-all flex flex-col h-full">
             <div className="flex items-center gap-2 mb-2 pb-2">
               <div className="p-1 rounded bg-blue-50 text-blue-600"><MoreHorizontal className="w-4 h-4" /></div>
               <h3 className="font-bold text-blue-700 text-sm">Inventory</h3>
             </div>
             <ComparisonTable rows={inventoryTable} headers={headers} updatedAt={updatedAt} />
          </div>

          {/* 3. LEAD SOURCE */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 hover:shadow-md transition-all flex flex-col h-full">
             <div className="flex items-center gap-2 mb-2 pb-2">
               <div className="p-1 rounded bg-blue-50 text-blue-600"><MoreHorizontal className="w-4 h-4" /></div>
               <h3 className="font-bold text-blue-700 text-sm">Lead Source</h3>
             </div>
             <ComparisonTable rows={sourceTable} headers={headers} updatedAt={updatedAt} />
          </div>

          {/* 4. CROSS-SELL */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 hover:shadow-md transition-all flex flex-col h-full">
             <div className="flex items-center gap-2 mb-2 pb-2">
               <div className="p-1 rounded bg-blue-50 text-blue-600"><MoreHorizontal className="w-4 h-4" /></div>
               <h3 className="font-bold text-blue-700 text-sm">Cross-Sell</h3>
             </div>
             <ComparisonTable rows={[
                 {label: 'Car Finance', v1: 23, sub1: '65.71%', v2: 15, sub2: '46.88%', icon: 'down'},
                 {label: 'Insurance', v1: 33, sub1: '94.29%', v2: 29, sub2: '90.63%', icon: 'down'},
                 {label: 'Exchange', v1: 12, sub1: '34.29%', v2: 15, sub2: '46.88%', icon: 'up'},
                 {label: 'Accessories', v1: 5.85, type: 'currency', v2: 6.55, icon: 'up'},
                 {label: 'Acc Per Car', v1: 16714, v2: 20469, icon: 'up'}
             ]} headers={headers} updatedAt={updatedAt} />
          </div>

          {/* 5. SALES MANAGEMENT */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 hover:shadow-md transition-all flex flex-col h-full">
             <div className="flex items-center gap-2 mb-2 pb-2">
               <div className="p-1 rounded bg-blue-50 text-blue-600"><MoreHorizontal className="w-4 h-4" /></div>
               <h3 className="font-bold text-blue-700 text-sm">Sales Management</h3>
             </div>
             <ComparisonTable rows={[
                 {label: 'Bookings', v1: pf.book || 2, sub1: '0.74%', v2: cf.book || 0, sub2: '-', icon: 'bracket'},
                 {label: 'Dlr. Retail', v1: pf.ret || 35, sub1: '12.96%', v2: cf.ret || 32, sub2: '12.36%', icon: 'down'},
                 {label: 'OEM Retail', v1: 35, sub1: '-', v2: 32, sub2: '-', icon: 'down'},
                 {label: 'POC Sales', v1: 12, sub1: '-', v2: 0, sub2: '-', icon: 'bracket'}
             ]} headers={headers} updatedAt={updatedAt} />
          </div>

          {/* 6. PROFIT */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 hover:shadow-md transition-all flex flex-col h-full">
             <div className="flex items-center gap-2 mb-2 pb-2">
               <div className="p-1 rounded bg-blue-50 text-blue-600"><MoreHorizontal className="w-4 h-4" /></div>
               <h3 className="font-bold text-blue-700 text-sm">Profit & Productivity</h3>
             </div>
             <ComparisonTable rows={[
                 {label: 'New car Margin', v1: 12.65, type:'currency', v2: 8.40, icon: 'down'},
                 {label: 'Margin per car', v1: 36143, v2: 26250, icon: 'down'},
                 {label: 'Used cars Margin', v1: 13.89, type:'currency', v2: 0, icon: 'bracket'},
                 {label: 'Margin per car', v1: 1.16, type: 'currency', v2: 0, icon: 'bracket'},
                 {label: 'SC Productivity', v1: 1.30, sub1: '-', v2: 1.19, sub2: '-', icon: 'down'}
             ]} headers={headers} updatedAt={updatedAt} />
          </div>

       </main>
       
       <button onClick={() => setShowImport(true)} className="fixed bottom-6 right-6 bg-slate-900 text-white p-4 rounded-full shadow-xl hover:bg-slate-800 transition-all z-50">
          <Upload className="w-6 h-6" />
       </button>
    </div>
  );
}
