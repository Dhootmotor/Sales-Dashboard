import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  LayoutDashboard, Upload, TrendingUp, TrendingDown, Minus,
  Car, DollarSign, FileSpreadsheet, Users, Package, 
  Loader2, Filter, Share2, Download, Calendar
} from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import { parse, isValid, format, subMonths, startOfMonth, endOfMonth } from 'date-fns';

// --- SUPABASE CONFIGURATION ---
const SUPABASE_URL = 'https://zfqjtpxetuliayhccnvw.supabase.co'; 
const SUPABASE_ANON_KEY = 'sb_publishable_ES3a2aPouopqEu_uV9Z-Og_uPsmoYNH'; 
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- STYLES & ANIMATIONS ---
const GlobalStyles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    body { font-family: 'Inter', sans-serif; background-color: #f0f4f8; }
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
    .animate-fade-in { animation: fadeIn 0.4s ease-out forwards; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
  `}</style>
);

// --- HELPER: ROBUST CSV PARSER ---
const parseCSVData = (allLines, headerIndex) => {
  if (allLines.length < headerIndex + 2) return [];
  const headerLine = allLines[headerIndex].replace(/^\uFEFF/, ''); 
  const headers = cleanHeaders(headerLine.split(','));

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
    if (headers[colIndex]) row[headers[colIndex]] = current.trim().replace(/"/g, '');
    return row;
  });
};

const cleanHeaders = (headers) => headers.map(h => h.trim().replace(/"/g, '').toLowerCase());

// --- HELPER: DATE UTILS ---
const safeParseDate = (dateStr) => {
  if (!dateStr) return null;
  const cleanStr = dateStr.split(' ')[0].trim();
  const formats = ['MM/dd/yyyy', 'dd/MM/yyyy', 'yyyy-MM-dd', 'd/M/yyyy', 'M/d/yyyy'];
  for (let fmt of formats) {
    const parsedDate = parse(cleanStr, fmt, new Date());
    if (isValid(parsedDate)) return format(parsedDate, 'yyyy-MM-dd');
  }
  return null; 
};

// --- COMPONENT: STAT ROW (Matches Screenshot Grid) ---
const StatRow = ({ icon, label, prevVal, prevPct, currVal, currPct, type = 'number', isCurrency = false }) => {
  // Determine Trend
  let TrendIcon = Minus;
  let trendColor = "text-blue-400"; // Default/Neutral
  
  // Logic: If current > prev = Green Up, Else Red Down (Simple logic, can be inverted for 'Bad' metrics)
  const v1 = parseFloat(String(prevVal).replace(/[^0-9.-]+/g,"")) || 0;
  const v2 = parseFloat(String(currVal).replace(/[^0-9.-]+/g,"")) || 0;

  if (v2 > v1) { TrendIcon = TrendingUp; trendColor = "text-emerald-500"; }
  else if (v2 < v1) { TrendIcon = TrendingDown; trendColor = "text-rose-500"; }

  const formatVal = (val) => {
    if (!val && val !== 0) return '-';
    if (isCurrency) return `₹ ${(val/100000).toFixed(2)} L`;
    return val.toLocaleString();
  }

  return (
    <div className="grid grid-cols-12 gap-2 py-3 border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors items-center">
      {/* Label Section */}
      <div className="col-span-4 flex items-center gap-2 pl-2">
        <TrendIcon className={`w-4 h-4 ${trendColor}`} />
        <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-tight">{label}</span>
      </div>

      {/* Prev Month Data */}
      <div className="col-span-4 flex items-center justify-end gap-2 pr-2 border-r border-slate-100">
        <span className="text-xs text-slate-500 font-medium">{formatVal(prevVal)}</span>
        {prevPct && <span className="text-[10px] text-slate-400 w-10 text-right">{prevPct}</span>}
      </div>

      {/* Curr Month Data */}
      <div className="col-span-4 flex items-center justify-end gap-2 pr-2">
        <span className="text-xs text-slate-800 font-bold">{formatVal(currVal)}</span>
        {currPct && <span className="text-[10px] text-blue-600 font-medium w-10 text-right bg-blue-50 rounded px-1">{currPct}</span>}
      </div>
    </div>
  );
};

// --- COMPONENT: DASHBOARD CARD ---
const DashboardCard = ({ title, icon: Icon, prevDate, currDate, children }) => (
  <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-full animate-fade-in">
    {/* Header */}
    <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-white">
      <div className="flex items-center gap-2">
        <div className="p-1.5 bg-blue-50 rounded text-blue-600">
          <Icon className="w-4 h-4" />
        </div>
        <h3 className="font-bold text-slate-700 text-sm">{title}</h3>
      </div>
    </div>
    
    {/* Column Headers */}
    <div className="grid grid-cols-12 gap-2 px-2 py-2 bg-slate-50/50 border-b border-slate-100 text-[10px] font-bold text-slate-500 uppercase">
      <div className="col-span-4 pl-2"></div>
      <div className="col-span-4 text-right pr-4">{prevDate}</div>
      <div className="col-span-4 text-right pr-4 text-blue-600">{currDate}</div>
    </div>

    {/* Content */}
    <div className="flex-1 p-1">
      {children}
    </div>

    {/* Footer actions (Visual only) */}
    <div className="px-3 py-2 border-t border-slate-50 flex justify-between items-center text-slate-300">
      <div className="flex gap-2">
        <Share2 className="w-3 h-3 cursor-pointer hover:text-blue-500" />
        <Download className="w-3 h-3 cursor-pointer hover:text-blue-500" />
      </div>
      <span className="text-[9px] italic">Updated just now</span>
    </div>
  </div>
);

// --- COMPONENT: IMPORT WIZARD (Same as before, abbreviated for brevity) ---
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
      const allLines = text.split(/\r\n|\n/); 
      try {
        let detectedType = null;
        let headerRowIndex = -1;

        // Smart Detection Logic
        for (let i = 0; i < Math.min(allLines.length, 10); i++) {
           const lineLower = allLines[i].toLowerCase();
           if (lineLower.includes("lead id") && (lineLower.includes("qualification") || lineLower.includes("score"))) {
             detectedType = 'LEADS'; headerRowIndex = i; break;
           }
           if ((lineLower.includes("opportunity") || lineLower.includes("test drive")) && lineLower.includes("customer")) {
             detectedType = 'OPPS'; headerRowIndex = i; break;
           }
           if (lineLower.includes("order number") || (lineLower.includes("vin") && lineLower.includes("delivery date"))) {
             detectedType = 'SALES'; headerRowIndex = i; break;
           }
           if (lineLower.includes("ageing") && lineLower.includes("vin")) {
             detectedType = 'INVENTORY'; headerRowIndex = i; break;
           }
        }

        if (!detectedType) throw new Error("Unknown file format.");
        setMessage(`Detected: ${detectedType}. Processing...`);
        
        const data = parseCSVData(allLines, headerRowIndex);
        let payload = [];
        let tableName = '';

        // Mapping Logic
        if (detectedType === 'LEADS') {
          tableName = 'leads_marketing';
          payload = data.map(r => ({
              lead_id: r['lead id'],
              name: r['name'] || r['customer name'],
              phone: r['customer phone'] || r['mobile'],
              city: r['city'],
              state: r['state'],
              status: r['status'],
              source: r['source'] || 'Unknown',
              created_on: safeParseDate(r['created on'] || r['created date']),
              month: safeParseDate(r['created on'] || r['created date'])?.slice(0, 7)
          })).filter(r => r.lead_id);
        } else if (detectedType === 'OPPS') {
            tableName = 'opportunities';
            payload = data.map(r => ({
                id: r['id'] || r['opportunity id'],
                test_drive_status: r['test drive completed'] || 'No',
                rating: r['zqualificationlevel'] || r['rating'],
                created_on: safeParseDate(r['created on']),
                month: safeParseDate(r['created on'])?.slice(0, 7)
            })).filter(r => r.id);
        } else if (detectedType === 'SALES') {
            tableName = 'sales_register';
            payload = data.map(r => {
                const dDate = safeParseDate(r['delivery date']);
                return {
                    order_id: r['order number'] || r['vehicle id no.'] || Math.random().toString(),
                    booking_date: safeParseDate(r['booking date']),
                    delivery_date: dDate,
                    finance_bank: r['financier name'],
                    insurance_co: r['insurance company name'],
                    month: dDate ? dDate.slice(0, 7) : null
                };
            }).filter(r => r.order_id);
        } else if (detectedType === 'INVENTORY') {
            tableName = 'inventory';
            payload = data.map(r => ({
                vin: r['vehicle identification number'] || r['vin'],
                model: r['model line'] || r['model'],
                ageing_days: parseInt(r['ageing days']) || 0,
                status: r['primary status']
            })).filter(r => r.vin);
        }

        if (payload.length === 0) throw new Error("No valid rows found.");
        const { error } = await supabase.from(tableName).upsert(payload, { onConflict: tableName === 'inventory' ? 'vin' : undefined });
        if (error) throw error;
        
        setStatus('success'); setMessage('Done!');
        setTimeout(() => { onUploadComplete(); onClose(); setStatus('idle'); setFile(null); }, 1000);

      } catch (err) { setStatus('error'); setMessage(err.message); }
    };
    reader.readAsText(file);
  };

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center backdrop-blur-sm">
      <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-2xl">
        <h2 className="text-lg font-bold mb-4">Upload CSV</h2>
        <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 flex flex-col items-center justify-center bg-slate-50 relative">
          <Upload className="w-8 h-8 text-slate-400 mb-2"/>
          <p className="text-xs text-slate-500">{file ? file.name : "Click to select file"}</p>
          <input type="file" accept=".csv" className="absolute inset-0 opacity-0 cursor-pointer" onChange={e => setFile(e.target.files[0])} />
        </div>
        {status !== 'idle' && <div className={`mt-3 text-xs text-center font-bold ${status === 'error' ? 'text-red-500' : 'text-blue-500'}`}>{message}</div>}
        <div className="mt-4 flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg bg-slate-100 text-xs font-bold text-slate-600">Cancel</button>
          <button onClick={handleFileUpload} disabled={!file || status === 'processing'} className="flex-1 py-2 rounded-lg bg-blue-600 text-white text-xs font-bold">Upload</button>
        </div>
      </div>
    </div>
  );
};

// --- MAIN APPLICATION ---
export default function App() {
  const [showImport, setShowImport] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [loading, setLoading] = useState(false);
  
  // Data State
  const [inquiries, setInquiries] = useState({ curr: [], prev: [] });
  const [opportunities, setOpportunities] = useState({ curr: [], prev: [] });
  const [sales, setSales] = useState({ curr: [], prev: [] });
  const [inventory, setInventory] = useState([]);

  // Fetch Data
  const fetchData = useCallback(async () => {
    setLoading(true);
    const d = new Date(selectedMonth + "-01");
    d.setMonth(d.getMonth() - 1);
    const prevMonth = d.toISOString().slice(0, 7);

    try {
      const [lC, lP, oC, oP, sC, sP, inv] = await Promise.all([
        supabase.from('leads_marketing').select('*').eq('month', selectedMonth),
        supabase.from('leads_marketing').select('*').eq('month', prevMonth),
        supabase.from('opportunities').select('*').eq('month', selectedMonth),
        supabase.from('opportunities').select('*').eq('month', prevMonth),
        supabase.from('sales_register').select('*').eq('month', selectedMonth),
        supabase.from('sales_register').select('*').eq('month', prevMonth),
        supabase.from('inventory').select('*')
      ]);

      setInquiries({ curr: lC.data || [], prev: lP.data || [] });
      setOpportunities({ curr: oC.data || [], prev: oP.data || [] });
      setSales({ curr: sC.data || [], prev: sP.data || [] });
      setInventory(inv.data || []);
    } catch (e) { console.error(e); } 
    finally { setLoading(false); }
  }, [selectedMonth]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // --- DASHBOARD LOGIC ---
  const headerCurr = format(new Date(selectedMonth + "-01"), 'MMM-yy');
  const headerPrev = format(subMonths(new Date(selectedMonth + "-01"), 1), 'MMM-yy');

  const stats = useMemo(() => {
    const calc = (c, p) => ({ v1: p?.length || 0, v2: c?.length || 0 });
    const percent = (part, total) => total ? ((part/total)*100).toFixed(2)+'%' : '-';

    // 1. SALES FUNNEL
    const inq = calc(inquiries.curr, inquiries.prev);
    
    // Test Drives
    const tdC = opportunities.curr.filter(o => o.test_drive_status?.toLowerCase().includes('yes')).length;
    const tdP = opportunities.prev.filter(o => o.test_drive_status?.toLowerCase().includes('yes')).length;
    
    // Hot Leads
    const hotC = opportunities.curr.filter(o => o.rating?.toLowerCase() === 'hot').length;
    const hotP = opportunities.prev.filter(o => o.rating?.toLowerCase() === 'hot').length;
    
    // Conversions
    const bookings = calc(sales.curr, sales.prev); // Assuming sales register has bookings
    const retail = calc(sales.curr.filter(s => s.delivery_date), sales.prev.filter(s => s.delivery_date));

    // 2. INVENTORY
    const totalStock = inventory.length;
    const openStock = inventory.filter(i => !i.status || i.status.toLowerCase().includes('free')).length;
    const bookedStock = inventory.filter(i => i.status?.toLowerCase().includes('blocked')).length;
    const ageing = inventory.filter(i => i.ageing_days > 90).length;

    // 3. LEAD SOURCES (Aggregation)
    // Helper to group and count
    const getSourceCounts = (data) => {
        const map = {};
        data.forEach(l => {
            const s = (l.source || 'Unknown').toUpperCase();
            map[s] = (map[s] || 0) + 1;
        });
        return map;
    };
    const srcC = getSourceCounts(inquiries.curr);
    const srcP = getSourceCounts(inquiries.prev);
    // Get top 5 keys from current month
    const topSources = Object.keys(srcC).sort((a,b) => srcC[b] - srcC[a]).slice(0, 5);
    // Add specific standard ones if missing for display consistency
    if (!topSources.includes("WALK-IN")) topSources.push("WALK-IN");
    if (!topSources.includes("TELE-IN")) topSources.push("TELE-IN");
    
    const leadSourceRows = topSources.slice(0, 5).map(key => ({
        label: key,
        v1: srcP[key] || 0,
        p1: percent(srcP[key], inq.v1),
        v2: srcC[key] || 0,
        p2: percent(srcC[key], inq.v2)
    }));

    // 4. CROSS SELL
    const fin = calc(sales.curr.filter(s => s.finance_bank), sales.prev.filter(s => s.finance_bank));
    const ins = calc(sales.curr.filter(s => s.insurance_co), sales.prev.filter(s => s.insurance_co));

    return {
        funnel: [
            { label: 'Inquiries', v1: inq.v1, p1: '-', v2: inq.v2, p2: '-' },
            { label: 'Test-drives', v1: tdP, p1: percent(tdP, inq.v1), v2: tdC, p2: percent(tdC, inq.v2) },
            { label: 'Hot Leads', v1: hotP, p1: percent(hotP, inq.v1), v2: hotC, p2: percent(hotC, inq.v2) },
            { label: 'Booking Conv', v1: bookings.v1, p1: percent(bookings.v1, inq.v1), v2: bookings.v2, p2: percent(bookings.v2, inq.v2) },
            { label: 'Retail Conv', v1: retail.v1, p1: percent(retail.v1, inq.v1), v2: retail.v2, p2: percent(retail.v2, inq.v2) },
        ],
        inventory: [
            { label: 'Total Stock', v1: totalStock, p1: '-', v2: totalStock, p2: '-' }, // Simplified for demo
            { label: 'Open Stock', v1: openStock, p1: percent(openStock, totalStock), v2: openStock, p2: percent(openStock, totalStock) },
            { label: 'Booked', v1: bookedStock, p1: percent(bookedStock, totalStock), v2: bookedStock, p2: percent(bookedStock, totalStock) },
            { label: 'Ageing >90d', v1: 0, p1: '-', v2: ageing, p2: '-' },
        ],
        sources: leadSourceRows,
        crossSell: [
            { label: 'Car Finance', v1: fin.v1, p1: percent(fin.v1, retail.v1), v2: fin.v2, p2: percent(fin.v2, retail.v2) },
            { label: 'Insurance', v1: ins.v1, p1: percent(ins.v1, retail.v1), v2: ins.v2, p2: percent(ins.v2, retail.v2) },
        ],
        mgmt: [
             { label: 'Bookings', ...bookings },
             { label: 'Retail', ...retail }
        ]
    };
  }, [inquiries, opportunities, sales, inventory]);

  return (
    <div className="min-h-screen pb-10">
       <GlobalStyles />
       <ImportWizard isOpen={showImport} onClose={() => setShowImport(false)} onUploadComplete={fetchData} />
       
       {/* HEADER */}
       <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
         <div className="max-w-[1600px] mx-auto px-6 h-16 flex items-center justify-between">
           <div className="flex items-center gap-3">
             <div className="w-9 h-9 bg-slate-900 rounded-lg flex items-center justify-center text-white shadow-sm">
               <Car className="w-5 h-5" />
             </div>
             <div>
                <h1 className="text-xl font-bold text-slate-800 leading-none tracking-tight">Sales Dashboard - {headerCurr} vs {headerPrev}</h1>
                <div className="flex items-center gap-2 text-[11px] font-medium text-slate-400 mt-1">
                   Model: All • Location: All • Sales Consultant: All
                </div>
             </div>
           </div>
           
           <div className="flex items-center gap-3">
              {loading && <Loader2 className="w-4 h-4 animate-spin text-blue-600" />}
              <div className="flex items-center bg-slate-100 rounded-lg p-1 border border-slate-200">
                <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} 
                       className="bg-transparent border-none text-xs font-bold text-slate-700 focus:ring-0 py-1" />
              </div>
              <button onClick={() => setShowImport(true)} className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-slate-800 transition-colors">
                <Upload className="w-3.5 h-3.5" /> Import Data
              </button>
           </div>
         </div>
       </header>

       {/* MAIN GRID */}
       <main className="max-w-[1600px] mx-auto px-6 py-8">
         <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            
            {/* 1. SALES FUNNEL */}
            <DashboardCard title="Sales Funnel" icon={LayoutDashboard} prevDate={headerPrev} currDate={headerCurr}>
                {stats.funnel.map((row, i) => (
                    <StatRow key={i} label={row.label} prevVal={row.v1} prevPct={row.p1} currVal={row.v2} currPct={row.p2} />
                ))}
            </DashboardCard>

            {/* 2. INVENTORY */}
            <DashboardCard title="Inventory" icon={Package} prevDate={headerPrev} currDate={headerCurr}>
                {stats.inventory.map((row, i) => (
                    <StatRow key={i} label={row.label} prevVal={row.v1} prevPct={row.p1} currVal={row.v2} currPct={row.p2} />
                ))}
            </DashboardCard>

            {/* 3. LEAD SOURCE */}
            <DashboardCard title="Lead Source" icon={TrendingUp} prevDate={headerPrev} currDate={headerCurr}>
                 {stats.sources.length === 0 ? <div className="p-4 text-xs text-center text-slate-400">No source data</div> : 
                    stats.sources.map((row, i) => (
                        <StatRow key={i} label={row.label} prevVal={row.v1} prevPct={row.p1} currVal={row.v2} currPct={row.p2} />
                    ))
                 }
            </DashboardCard>

            {/* 4. CROSS SELL */}
            <DashboardCard title="Cross-Sell" icon={FileSpreadsheet} prevDate={headerPrev} currDate={headerCurr}>
                 {stats.crossSell.map((row, i) => (
                    <StatRow key={i} label={row.label} prevVal={row.v1} prevPct={row.p1} currVal={row.v2} currPct={row.p2} />
                ))}
            </DashboardCard>

            {/* 5. SALES MANAGEMENT */}
            <DashboardCard title="Sales Management" icon={Users} prevDate={headerPrev} currDate={headerCurr}>
                {stats.mgmt.map((row, i) => (
                    <StatRow key={i} label={row.label} prevVal={row.v1} prevPct={row.p1} currVal={row.v2} currPct={row.p2} />
                ))}
            </DashboardCard>

            {/* 6. PROFIT & PRODUCTIVITY */}
            <DashboardCard title="Profit & Productivity" icon={DollarSign} prevDate={headerPrev} currDate={headerCurr}>
                 <StatRow label="New Car Margin" prevVal={1265000} isCurrency currVal={840000} />
                 <StatRow label="Used Car Margin" prevVal={130000} isCurrency currVal={0} />
            </DashboardCard>

         </div>
       </main>
    </div>
  );
}
