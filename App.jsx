import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell 
} from 'recharts';
import { 
  LayoutDashboard, Upload, Filter, TrendingUp, TrendingDown, 
  Users, MapPin, Car, DollarSign, ChevronDown, FileSpreadsheet, 
  ArrowUpRight, ArrowDownRight, PieChart as PieChartIcon, Table as TableIcon, 
  Grid, Clock, RefreshCw, AlertCircle, X, CheckCircle, Search, Download, Layers, Package
} from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

// --- SUPABASE CONFIGURATION ---
const SUPABASE_URL = 'https://zfqjtpxetuliayhccnvw.supabase.co'; 
const SUPABASE_ANON_KEY = 'sb_publishable_ES3a2aPouopqEu_uV9Z-Og_uPsmoYNH'; 
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658', '#8dd1e1'];

// --- HELPER: ROBUST CSV PARSER ---
// Parses CSV text starting from a specific line index
const parseCSVData = (allLines, headerIndex) => {
  if (allLines.length < headerIndex + 2) return []; // Need header + at least 1 row

  // 1. Parse Headers
  const headerLine = allLines[headerIndex];
  const headers = headerLine.split(',').map(h => h.trim().replace(/"/g, '').toLowerCase());

  // 2. Parse Rows
  return allLines.slice(headerIndex + 1).filter(l => l.trim()).map(line => {
    const row = {};
    let current = '';
    let inQuotes = false;
    let colIndex = 0;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') inQuotes = !inQuotes;
      else if (char === ',' && !inQuotes) {
        if (headers[colIndex]) row[headers[colIndex]] = current.trim().replace(/"/g, '');
        current = '';
        colIndex++;
      } else current += char;
    }
    // Push last column
    if (headers[colIndex]) row[headers[colIndex]] = current.trim().replace(/"/g, '');
    return row;
  });
};

// --- COMPONENT: COMPARISON TABLE ---
const ComparisonTable = ({ rows, headers, type = 'count' }) => (
  <div className="overflow-hidden">
    <table className="w-full text-sm text-left">
      <thead className="text-[10px] uppercase text-slate-400 bg-white border-b border-slate-100 font-bold tracking-wider">
        <tr>
          <th className="py-2 pl-2">Metric</th>
          <th className="py-2 text-right">{headers[0]}</th>
          <th className="py-2 text-right pr-2">{headers[1]}</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-50">
        {rows.map((row, idx) => {
          const v1 = row.v1 || 0;
          const v2 = row.v2 || 0;
          const isUp = v2 >= v1;
          
          const fmt = (val) => {
             if (type === 'currency') return `₹ ${(val/100000).toFixed(2)} L`;
             return val.toLocaleString();
          }

          return (
            <tr key={idx} className="hover:bg-slate-50/80 transition-colors text-xs">
              <td className="py-2 pl-2 font-semibold text-slate-600 flex items-center gap-1.5">
                 {isUp ? <ArrowUpRight className="w-3 h-3 text-emerald-500" /> : <ArrowDownRight className="w-3 h-3 text-rose-500" />}
                 {row.label}
              </td>
              <td className="py-2 text-right text-slate-400 font-mono">
                {fmt(v1)}
                {row.sub1 && <span className="ml-1 text-[9px] text-slate-300">({row.sub1})</span>}
              </td>
              <td className="py-2 text-right font-bold text-slate-800 font-mono pr-2">
                {fmt(v2)}
                {row.sub2 && <span className="ml-1 text-[9px] text-blue-500 font-normal">({row.sub2})</span>}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

// --- COMPONENT: IMPORT WIZARD ---
const ImportWizard = ({ isOpen, onClose, onUploadComplete }) => {
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');

  const handleFileUpload = async () => {
    if (!file) return;
    setStatus('processing');
    setMessage('Reading file...');

    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target.result;
      // Handle Windows/Unix line endings
      const allLines = text.split(/\r\n|\n/); 

      try {
        let detectedType = null;
        let headerRowIndex = -1;

        // --- STEP 1: DETECT FILE TYPE BY SCANNING FIRST 10 LINES ---
        for (let i = 0; i < Math.min(allLines.length, 10); i++) {
           const lineLower = allLines[i].toLowerCase();
           
           // Marketing Leads Signature
           if (lineLower.includes("lead id") && lineLower.includes("qualification level")) {
             detectedType = 'LEADS';
             headerRowIndex = i;
             break;
           }
           // Opportunities Signature
           if (lineLower.includes("opportunity offline score") || (lineLower.includes("test drive completed") && lineLower.includes("order number"))) {
             detectedType = 'OPPS';
             headerRowIndex = i;
             break;
           }
           // Booking/Sales Signature
           if (lineLower.includes("dealer code") && lineLower.includes("order type")) {
             detectedType = 'SALES';
             headerRowIndex = i;
             break;
           }
           // Inventory Signature
           if (lineLower.includes("ageing days") && lineLower.includes("primary status")) {
             detectedType = 'INVENTORY';
             headerRowIndex = i;
             break;
           }
        }

        if (!detectedType) {
          throw new Error("Could not detect file type. Please check if the file is one of the supported 4 reports.");
        }

        // --- STEP 2: PARSE & UPLOAD ---
        setMessage(`Detected: ${detectedType}. Processing rows...`);
        const data = parseCSVData(allLines, headerRowIndex);
        let payload = [];
        let tableName = '';

        if (detectedType === 'LEADS') {
          tableName = 'leads_marketing';
          payload = data.map(r => ({
            lead_id: r['lead id'],
            source: r['source'] || 'Unknown',
            created_on: r['created on'] ? new Date(r['created on']).toISOString() : null,
            month: r['created on'] ? new Date(r['created on']).toISOString().slice(0, 7) : null
          })).filter(r => r.lead_id);
        }
        else if (detectedType === 'OPPS') {
          tableName = 'opportunities';
          payload = data.map(r => ({
            id: r['id'],
            test_drive_status: r['test drive completed'],
            rating: r['zqualificationlevel'],
            created_on: r['created on'] ? new Date(r['created on']).toISOString() : null,
            month: r['created on'] ? new Date(r['created on']).toISOString().slice(0, 7) : null
          })).filter(r => r.id);
        }
        else if (detectedType === 'SALES') {
          tableName = 'sales_register';
          payload = data.map(r => {
             // Parse DD-MM-YYYY
             const parseDate = (d) => {
               if(!d) return null;
               const p = d.split('-'); 
               return (p.length === 3 && p[2].length === 4) ? `${p[2]}-${p[1]}-${p[0]}` : null;
             };
             return {
               order_id: r['order number'] || r['vehicle id no.'] || Math.random().toString(), 
               vin: r['vehicle id no.'],
               booking_date: parseDate(r['document date']), 
               delivery_date: parseDate(r['delivery date']),
               finance_bank: r['financier name'],
               insurance_co: r['insurance company name'],
               month: parseDate(r['document date']) ? parseDate(r['document date']).slice(0, 7) : null
             };
          }).filter(r => r.vin || r.order_id);
        }
        else if (detectedType === 'INVENTORY') {
          tableName = 'inventory';
          payload = data.map(r => ({
            vin: r['vehicle identification number'],
            model: r['model line'],
            ageing_days: parseInt(r['ageing days']) || 0,
            status: r['primary status'],
          })).filter(r => r.vin);
        }

        if (payload.length === 0) throw new Error("File parsed but no valid rows found.");

        setMessage(`Uploading ${payload.length} records to ${tableName}...`);
        const { error } = await supabase.from(tableName).upsert(payload);
        
        if (error) throw error;

        setStatus('success');
        setMessage('Successfully Updated!');
        setTimeout(() => { onUploadComplete(); onClose(); setStatus('idle'); setFile(null); }, 1500);

      } catch (err) {
        console.error(err);
        setStatus('error');
        setMessage('Error: ' + (err.message || 'Unknown upload error'));
      }
    };
    reader.readAsText(file);
  };

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center backdrop-blur-sm">
      <div className="bg-white rounded-xl p-6 w-full max-w-md animate-fade-in">
        <h2 className="text-xl font-bold mb-4">Upload Report</h2>
        <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 flex flex-col items-center justify-center relative bg-slate-50 hover:bg-slate-100 transition-colors">
          <Upload className="w-10 h-10 text-blue-500 mb-2"/>
          <p className="text-sm text-slate-600 font-medium">{file ? file.name : "Select CSV File"}</p>
          <input type="file" accept=".csv" className="absolute inset-0 opacity-0 cursor-pointer" onChange={e => setFile(e.target.files[0])} />
        </div>
        {status !== 'idle' && (
           <div className={`mt-4 p-2 rounded text-sm text-center font-medium ${status === 'error' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
             {message}
           </div>
        )}
        <div className="mt-6 flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium transition-colors">Cancel</button>
          <button onClick={handleFileUpload} disabled={!file || status === 'processing'} className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium disabled:opacity-50 transition-colors">
             {status === 'processing' ? 'Uploading...' : 'Upload'}
          </button>
        </div>
      </div>
    </div>
  );
};

// --- MAIN APP ---
export default function App() {
  const [showImport, setShowImport] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState('dashboard');
  
  // Data State
  const [inquiries, setInquiries] = useState({ curr: [], prev: [] });
  const [opportunities, setOpportunities] = useState({ curr: [], prev: [] });
  const [sales, setSales] = useState({ curr: [], prev: [] });
  const [inventory, setInventory] = useState([]);

  // Fetch Data
  const fetchData = useCallback(async () => {
    setLoading(true);
    // Calc previous month
    const d = new Date(selectedMonth + "-01");
    d.setMonth(d.getMonth() - 1);
    const prevMonth = d.toISOString().slice(0, 7);

    try {
      // 1. Leads
      const { data: lC } = await supabase.from('leads_marketing').select('*').eq('month', selectedMonth);
      const { data: lP } = await supabase.from('leads_marketing').select('*').eq('month', prevMonth);
      setInquiries({ curr: lC || [], prev: lP || [] });

      // 2. Opps
      const { data: oC } = await supabase.from('opportunities').select('*').eq('month', selectedMonth);
      const { data: oP } = await supabase.from('opportunities').select('*').eq('month', prevMonth);
      setOpportunities({ curr: oC || [], prev: oP || [] });

      // 3. Sales
      const { data: sC } = await supabase.from('sales_register').select('*').eq('month', selectedMonth);
      const { data: sP } = await supabase.from('sales_register').select('*').eq('month', prevMonth);
      setSales({ curr: sC || [], prev: sP || [] });

      // 4. Inventory
      const { data: inv } = await supabase.from('inventory').select('*');
      setInventory(inv || []);

    } catch (e) { console.error(e); } 
    finally { setLoading(false); }
  }, [selectedMonth]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // --- CALCULATION LOGIC ---
  const currentMonth = selectedMonth;
  const prevMonth = new Date(new Date(selectedMonth + "-01").setMonth(new Date(selectedMonth + "-01").getMonth() - 1)).toISOString().slice(0, 7);

  const calcStats = (currArr, prevArr) => {
    const v1 = prevArr ? prevArr.length : 0;
    const v2 = currArr ? currArr.length : 0;
    return { v1, v2 };
  };

  const dashboardData = useMemo(() => {
    // 1. SALES FUNNEL
    const inq = calcStats(inquiries.curr, inquiries.prev);
    const tds = calcStats(opportunities.curr.filter(o => o.test_drive_status?.toLowerCase().includes('yes')), opportunities.prev.filter(o => o.test_drive_status?.toLowerCase().includes('yes')));
    const hot = calcStats(opportunities.curr.filter(o => o.rating?.toLowerCase() === 'hot'), opportunities.prev.filter(o => o.rating?.toLowerCase() === 'hot'));
    const booking = calcStats(sales.curr, sales.prev);
    const retail = calcStats(sales.curr.filter(s => s.delivery_date), sales.prev.filter(s => s.delivery_date));

    const salesFunnelTable = [
      { label: 'Inquiries', ...inq }, // Updates ONLY from leads_marketing (Leads File)
      { label: 'Test-drives', ...tds, sub2: inq.v2 ? Math.round((tds.v2/inq.v2)*100)+'%' : '0%' }, // Updates ONLY from opportunities (Opps File)
      { label: 'Hot Leads', ...hot, sub2: inq.v2 ? Math.round((hot.v2/inq.v2)*100)+'%' : '0%' }, // Updates ONLY from opportunities (Opps File)
      { label: 'Bookings', ...booking }, // Updates ONLY from sales_register (Sales File)
      { label: 'Retail', ...retail }, // Updates ONLY from sales_register (Sales File)
    ];

    // 2. LEAD SOURCE - Updates ONLY from leads_marketing (Leads File)
    const sourceMap = {};
    inquiries.curr.forEach(i => { const s = i.source || 'Unknown'; sourceMap[s] = (sourceMap[s] || 0) + 1; });
    const leadSourceTable = Object.entries(sourceMap).map(([k, v]) => ({ label: k, v1: 0, v2: v, sub2: inq.v2 ? (v/inq.v2*100).toFixed(1)+'%' : '' })).sort((a,b) => b.v2 - a.v2).slice(0, 5);

    // 3. INVENTORY OVERVIEW - Updates ONLY from inventory (Inventory File)
    const totalStock = inventory.length;
    const ageingStock = inventory.filter(i => i.ageing_days > 60).length;
    const inventoryTable = [
      { label: 'Total Stock', v1: 0, v2: totalStock },
      { label: 'Ageing > 60 Days', v1: 0, v2: ageingStock },
    ];

    // 4. CROSS SELL - Updates ONLY from sales_register (Sales File)
    const fin = calcStats(sales.curr.filter(s => s.finance_bank), sales.prev.filter(s => s.finance_bank));
    const ins = calcStats(sales.curr.filter(s => s.insurance_co), sales.prev.filter(s => s.insurance_co));
    const crossSellTable = [
      { label: 'Finance', ...fin, sub2: retail.v2 ? (fin.v2/retail.v2*100).toFixed(0)+'%' : '' },
      { label: 'Insurance', ...ins, sub2: retail.v2 ? (ins.v2/retail.v2*100).toFixed(0)+'%' : '' },
    ];

    // 5. SALES MANAGEMENT
    const salesMgmtTable = [
      { label: 'Avg Discount', v1: 0, v2: 0, type: 'currency' },
      { label: 'Cancellation', v1: 0, v2: 0 },
    ];

    return { salesFunnelTable, leadSourceTable, inventoryTable, crossSellTable, salesMgmtTable };
  }, [inquiries, opportunities, sales, inventory]);

  const { salesFunnelTable, leadSourceTable, inventoryTable, crossSellTable, salesMgmtTable } = dashboardData;

  return (
    <div className="min-h-screen bg-slate-50/50 font-sans pb-10">
       <GlobalStyles />
       <ImportWizard isOpen={showImport} onClose={() => setShowImport(false)} onUploadComplete={fetchData} />
       
       {/* HEADER */}
       <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-sm">
         <div className="max-w-[1920px] mx-auto px-4 h-16 flex items-center justify-between">
           <div className="flex items-center gap-3">
             <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-lg flex items-center justify-center text-white shadow-sm">
               <Car className="w-5 h-5" />
             </div>
             <div>
                <h1 className="text-lg font-bold text-slate-800 leading-tight">Sales Dashboard</h1>
                <div className="flex items-center gap-2 text-[10px] font-medium text-slate-400">
                   Showing: {currentMonth} (vs {prevMonth})
                </div>
             </div>
           </div>
           <div className="flex items-center gap-4">
              <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
                <button onClick={() => setViewMode('dashboard')} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${viewMode === 'dashboard' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>Dashboard</button>
                <button onClick={() => setViewMode('table')} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${viewMode === 'table' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>Data</button>
              </div>
              <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="bg-slate-100 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-100" />
              <button onClick={() => setShowImport(true)} className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-slate-700 transition-colors shadow-sm">
                <Upload className="w-3.5 h-3.5" /> Import
              </button>
           </div>
         </div>
       </header>

       <main className="max-w-[1920px] mx-auto px-4 py-6">
         {/* DASHBOARD GRID */}
         {viewMode === 'dashboard' && (
           <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 animate-fade-in">
              
              {/* 1. SALES FUNNEL */}
              <div className="rounded-lg shadow-sm border p-4 bg-white border-slate-200 hover:shadow-md transition-shadow">
                 <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-100">
                   <div className="bg-blue-50 p-1.5 rounded text-blue-600"><LayoutDashboard className="w-4 h-4" /></div>
                   <h3 className="font-bold text-slate-700">Sales Funnel</h3>
                 </div>
                 <ComparisonTable rows={salesFunnelTable} headers={[prevMonth, currentMonth]} />
              </div>

              {/* 2. LEAD SOURCE */}
              <div className="rounded-lg shadow-sm border p-4 bg-white border-slate-200 hover:shadow-md transition-shadow">
                 <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-100">
                   <div className="bg-emerald-50 p-1.5 rounded text-emerald-600"><TrendingUp className="w-4 h-4" /></div>
                   <h3 className="font-bold text-slate-700">Lead Source (Top 5)</h3>
                 </div>
                 <ComparisonTable rows={leadSourceTable} headers={["-", "Curr"]} />
              </div>

              {/* 3. INVENTORY OVERVIEW */}
              <div className="rounded-lg shadow-sm border p-4 bg-white border-slate-200 hover:shadow-md transition-shadow">
                 <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-100">
                   <div className="bg-indigo-50 p-1.5 rounded text-indigo-600"><Package className="w-4 h-4" /></div>
                   <h3 className="font-bold text-slate-700">Inventory Overview</h3>
                 </div>
                 <ComparisonTable rows={inventoryTable} headers={["-", "Total"]} />
              </div>

              {/* 4. CROSS SELL */}
              <div className="rounded-lg shadow-sm border p-4 bg-white border-slate-200 hover:shadow-md transition-shadow">
                 <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-100">
                   <div className="bg-purple-50 p-1.5 rounded text-purple-600"><FileSpreadsheet className="w-4 h-4" /></div>
                   <h3 className="font-bold text-slate-700">Cross-Sell</h3>
                 </div>
                 <ComparisonTable rows={crossSellTable} headers={[prevMonth, currentMonth]} />
              </div>

              {/* 5. SALES MANAGEMENT */}
              <div className="rounded-lg shadow-sm border p-4 bg-white border-slate-200 hover:shadow-md transition-shadow">
                 <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-100">
                   <div className="bg-cyan-50 p-1.5 rounded text-cyan-600"><Users className="w-4 h-4" /></div>
                   <h3 className="font-bold text-slate-700">Sales Management</h3>
                 </div>
                 <ComparisonTable rows={salesMgmtTable} headers={[prevMonth, currentMonth]} />
              </div>

              {/* 6. PROFIT & PRODUCTIVITY */}
              <div className="rounded-lg shadow-sm border p-4 bg-white border-slate-200 hover:shadow-md transition-shadow">
                 <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-100">
                   <div className="bg-rose-50 p-1.5 rounded text-rose-600"><DollarSign className="w-4 h-4" /></div>
                   <h3 className="font-bold text-slate-700">Profit & Productivity</h3>
                 </div>
                 <div className="h-40 flex items-center justify-center text-slate-400 text-xs italic bg-slate-50 rounded border border-dashed border-slate-200">
                    Metrics pending further data integration
                 </div>
              </div>

           </div>
         )}

         {/* TABLE VIEW (Placeholder) */}
         {viewMode === 'table' && (
           <div className="bg-white rounded-lg shadow border border-slate-200 p-8 text-center text-slate-500 animate-fade-in">
              <TableIcon className="w-12 h-12 mx-auto text-slate-300 mb-4" />
              <h3 className="text-lg font-bold text-slate-700">Raw Data View</h3>
              <p className="text-sm">Select a specific report to view raw rows.</p>
           </div>
         )}
       </main>
    </div>
  );
}
