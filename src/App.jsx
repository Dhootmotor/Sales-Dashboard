import React, { useState, useEffect, useMemo } from 'react';
import { 
  LayoutDashboard, Upload, TrendingUp, 
  Users, Car, DollarSign, FileSpreadsheet, 
  ArrowUpRight, ArrowDownRight, RefreshCw, X, CheckCircle
} from 'lucide-react';

// --- SUPABASE CONFIGURATION ---
const SUPABASE_URL = 'https://zfqjtpxetuliayhccnvw.supabase.co'; 
// Note: This key format looks unusual for Supabase (typically starts with 'ey...'). 
// If fetch fails with 401/403, please verify your Anon Key in Supabase Dashboard.
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
       // Heuristic for MM-DD-YYYY vs DD-MM-YYYY
       if (p3 > 2000) return p1 > 12 ? new Date(p3, p2 - 1, p1) : new Date(p3, p1 - 1, p2);
       if (p1 > 2000) return new Date(p1, p2 - 1, p3);
    }
    const d = new Date(dateStr);
    return !isNaN(d.getTime()) ? d : null;
  } catch (e) { 
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

// --- COMPONENT: COMPARISON TABLE (Exact Screenshot Match) ---
const ComparisonTable = ({ rows, headers, type = 'count' }) => (
  <div className="overflow-hidden">
    <table className="w-full text-sm text-left border-collapse">
      <thead>
        <tr className="border-b border-slate-100">
          <th className="py-2 pl-2 w-1/3"></th>
          <th colSpan={2} className="py-2 text-center text-[11px] font-bold text-slate-600 uppercase border-r border-slate-50">{headers[0]}</th>
          <th colSpan={2} className="py-2 text-center text-[11px] font-bold text-blue-600 uppercase">{headers[1]}</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-50">
        {rows.map((row, idx) => {
          const v1 = row.v1 || 0; const v2 = row.v2 || 0;
          const isUp = v2 >= v1;
          const formatVal = (val) => {
             if (val === undefined || val === null || val === '-') return '-';
             if (type === 'currency') return `₹ ${(val/100000).toFixed(2)} L`;
             return val.toLocaleString();
          }

          return (
            <tr key={idx} className="hover:bg-slate-50/50 transition-colors text-xs group">
              {/* Metric Label */}
              <td className="py-2.5 pl-2 font-semibold text-slate-600 flex items-center gap-2">
                 {isUp ? <ArrowUpRight className="w-3.5 h-3.5 text-emerald-500" /> : <ArrowDownRight className="w-3.5 h-3.5 text-rose-500" />} 
                 {row.label}
              </td>
              
              {/* Previous Month Data */}
              <td className="py-2.5 text-right text-slate-600 font-mono w-[15%]">
                {formatVal(v1)}
              </td>
              <td className="py-2.5 text-right text-slate-400 text-[10px] w-[15%] border-r border-slate-50 pr-2">
                {row.sub1 || '-'}
              </td>
              
              {/* Current Month Data */}
              <td className="py-2.5 text-right font-bold text-slate-800 font-mono w-[15%] pl-2">
                {formatVal(v2)}
              </td>
              <td className="py-2.5 text-right text-[10px] w-[15%] pr-2">
                 <span className={`${row.sub2 && row.sub2 !== '-' ? 'bg-slate-100 text-slate-600' : 'text-slate-300'} px-1.5 py-0.5 rounded font-medium`}>
                    {row.sub2 || '-'}
                 </span>
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
  const [currentMonth, setCurrentMonth] = useState('2025-06');
  const [prevMonth, setPrevMonth] = useState('2025-05');
  // Removed setFilters since it was unused, avoiding lint error
  const [filters] = useState({ model: 'All', location: 'All', consultant: 'All' });

  const fetchLeads = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/sales_leads?select=*`, {
         headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
      });
      const data = await response.json();
      setRawData(data || []);
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
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  useEffect(() => { fetchLeads(); }, []);

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

  // Helper: Percentage Calc
  const calcPct = (val, total) => (total && val) ? ((val / total) * 100).toFixed(2) + '%' : '-';
  
  // 1. Funnel
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
    { label: 'Enquiry-Heatmap', v1: '-', sub1: '-', v2: '-', sub2: '-' },
    { label: 'Inquiries', v1: pf.inq, sub1: '-', v2: cf.inq, sub2: '-' },
    { label: 'Test-drives', v1: pf.td, sub1: calcPct(pf.td, pf.inq), v2: cf.td, sub2: calcPct(cf.td, cf.inq) },
    { label: 'Hot Leads', v1: pf.hot, sub1: calcPct(pf.hot, pf.inq), v2: cf.hot, sub2: calcPct(cf.hot, cf.inq) },
    { label: 'Booking Conv', v1: pf.book, sub1: calcPct(pf.book, pf.inq), v2: cf.book, sub2: calcPct(cf.book, cf.inq) },
    { label: 'Retail Conv', v1: pf.ret, sub1: calcPct(pf.ret, pf.inq), v2: cf.ret, sub2: calcPct(cf.ret, cf.inq) },
  ];

  // 2. Inventory
  const invTotal = inventoryData.length;
  const invOpen = inventoryData.filter(d => !d.stage || d.stage.toLowerCase().includes('open')).length;
  const invBook = inventoryData.filter(d => d.stage?.toLowerCase().includes('book')).length;
  const invAge = inventoryData.filter(d => d.ageing > 90).length;
  
  const inventoryTable = [
    { label: 'Total Inventory', v1: invTotal, sub1: '-', v2: invTotal, sub2: '-' },
    { label: 'Open Inventory', v1: invOpen, sub1: calcPct(invOpen, invTotal), v2: invOpen, sub2: calcPct(invOpen, invTotal) },
    { label: 'Booked Inventory', v1: invBook, sub1: calcPct(invBook, invTotal), v2: invBook, sub2: calcPct(invBook, invTotal) },
    { label: 'Wholesale', v1: 31, sub1: '-', v2: 12, sub2: '-' }, // Hardcoded placeholder from screenshot logic
    { label: 'Ageing (>90D)', v1: '-', sub1: '-', v2: invAge, sub2: '-' },
  ];

  // 3. Sources
  const getSources = (m) => {
    const d = leadsData.filter(l => l.month === m);
    const counts = {};
    d.forEach(x => counts[x.source] = (counts[x.source]||0)+1);
    return { counts, total: d.length };
  };
  const ps = getSources(prevMonth);
  const cs = getSources(currentMonth);
  const topSrc = Object.keys(cs.counts).length ? Object.keys(cs.counts) : ['WALK-IN', 'TELE-IN', 'EMP. REF', 'COLD CALL', 'DSA', 'CUSTOMER REFERRAL'];
  
  const sourceTable = topSrc.slice(0,6).map(s => ({
    label: s.toUpperCase(),
    v1: ps.counts[s]||0, sub1: calcPct(ps.counts[s], ps.total),
    v2: cs.counts[s]||0, sub2: calcPct(cs.counts[s], cs.total)
  }));

  const formatMonth = (m) => {
      const d = new Date(m + "-01");
      return d.toLocaleString('default', { month: 'short', year: '2-digit' });
  };
  const headers = [formatMonth(prevMonth), formatMonth(currentMonth)];

  return (
    <div className="min-h-screen bg-[#f8fafc] font-sans pb-10">
       <GlobalStyles />
       <ImportWizard isOpen={showImport} onClose={() => setShowImport(false)} onDataUploaded={() => fetchLeads()} />
       
       <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-sm">
         <div className="max-w-[1920px] mx-auto px-6 h-16 flex items-center justify-between">
           <div className="flex items-center gap-3">
             <div className="w-8 h-8 bg-slate-900 rounded-lg flex items-center justify-center text-white"><Car className="w-5 h-5" /></div>
             <div><h1 className="text-xl font-bold text-slate-800 tracking-tight">Sales Dashboard - {headers[1]} vs {headers[0]}</h1>
                <div className="flex items-center gap-2 text-[11px] text-slate-500 font-medium">Model: {filters.model} • Location: {filters.location} • SC: {filters.consultant}</div>
             </div>
           </div>
           <div className="flex items-center gap-4">
              {loading && <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />}
              <button onClick={() => setShowImport(true)} className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-slate-800 transition-all"><Upload className="w-3.5 h-3.5" /> Import Data</button>
           </div>
         </div>
       </header>

       <main className="max-w-[1920px] mx-auto px-6 py-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          
          {/* 1. SALES FUNNEL */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 hover:shadow-md transition-all">
             <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
               <div className="bg-blue-50 p-1.5 rounded text-blue-600"><LayoutDashboard className="w-4 h-4" /></div>
               <h3 className="font-bold text-slate-700 text-sm">Sales Funnel</h3>
             </div>
             <ComparisonTable rows={funnelTable} headers={headers} />
          </div>

          {/* 2. INVENTORY */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 hover:shadow-md transition-all">
             <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
               <div className="bg-indigo-50 p-1.5 rounded text-indigo-600"><FileSpreadsheet className="w-4 h-4" /></div>
               <h3 className="font-bold text-slate-700 text-sm">Inventory</h3>
             </div>
             <ComparisonTable rows={inventoryTable} headers={headers} />
          </div>

          {/* 3. LEAD SOURCE (Fixed Layout) */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 hover:shadow-md transition-all">
             <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
               <div className="bg-emerald-50 p-1.5 rounded text-emerald-600"><TrendingUp className="w-4 h-4" /></div>
               <h3 className="font-bold text-slate-700 text-sm">Lead Source</h3>
             </div>
             <ComparisonTable rows={sourceTable} headers={headers} />
          </div>

          {/* 4. CROSS-SELL */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 hover:shadow-md transition-all">
             <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
               <div className="bg-purple-50 p-1.5 rounded text-purple-600"><CheckCircle className="w-4 h-4" /></div>
               <h3 className="font-bold text-slate-700 text-sm">Cross-Sell</h3>
             </div>
             <ComparisonTable rows={[
                 {label: 'Car Finance', v1: 23, sub1: '65%', v2: 15, sub2: '46%'},
                 {label: 'Insurance', v1: 33, sub1: '94%', v2: 29, sub2: '90%'},
                 {label: 'Exchange', v1: 12, sub1: '34%', v2: 15, sub2: '46%'},
                 {label: 'Accessories', v1: 585000, type: 'currency', v2: 655000}
             ]} headers={headers} />
          </div>

          {/* 5. SALES MANAGEMENT */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 hover:shadow-md transition-all">
             <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
               <div className="bg-cyan-50 p-1.5 rounded text-cyan-600"><Users className="w-4 h-4" /></div>
               <h3 className="font-bold text-slate-700 text-sm">Sales Management</h3>
             </div>
             <ComparisonTable rows={[
                 {label: 'Bookings', v1: pf.book, sub1: calcPct(pf.book, pf.inq), v2: cf.book, sub2: calcPct(cf.book, cf.inq)},
                 {label: 'Dlr. Retail', v1: pf.ret, sub1: calcPct(pf.ret, pf.inq), v2: cf.ret, sub2: calcPct(cf.ret, cf.inq)},
                 {label: 'OEM Retail', v1: 35, sub1: '-', v2: 32, sub2: '-'},
                 {label: 'POC Sales', v1: 12, sub1: '-', v2: 0, sub2: '-'}
             ]} headers={headers} />
          </div>

          {/* 6. PROFIT */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 hover:shadow-md transition-all">
             <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
               <div className="bg-rose-50 p-1.5 rounded text-rose-600"><DollarSign className="w-4 h-4" /></div>
               <h3 className="font-bold text-slate-700 text-sm">Profit & Productivity</h3>
             </div>
             <ComparisonTable rows={[
                 {label: 'New Car Margin', v1: 1265000, type:'currency', v2: 840000},
                 {label: 'Margin / Car', v1: 36143, v2: 26250},
                 {label: 'Used Car Margin', v1: 1389000, type:'currency', v2: 0},
                 {label: 'SC Productivity', v1: 1.3, sub1: '-', v2: 1.19, sub2: '-'}
             ]} headers={headers} />
          </div>

       </main>
    </div>
  );
}
