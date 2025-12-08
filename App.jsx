import React, { useState, useEffect, useMemo } from 'react';
import { 
  LayoutDashboard, Upload, Filter, TrendingUp, Users, MapPin, Car, DollarSign, 
  FileSpreadsheet, ArrowUpRight, ArrowDownRight, Clock, CheckCircle, X
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
  // Robust Header Detection
  for (let i = 0; i < Math.min(lines.length, 25); i++) {
    const raw = lines[i].toLowerCase();
    if (raw.includes('lead record id') || 
        raw.includes('vehicle identification number') || 
        raw.includes('lead id') || 
        raw.includes('dbm order') ||
        raw.includes('order number') || 
        raw.includes('model line(fe)') ||
        raw.includes('customer name')
       ) {
      headerIndex = i; break;
    }
  }

  const headers = parseLine(lines[headerIndex]).map(normalizeKey);
  console.log("Detected Headers:", headers); 

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
    // Helper to check validity
    const isValid = (d) => !isNaN(d.getTime()) && d.getFullYear() > 2000;

    // 1. Try ISO first (YYYY-MM-DD)
    let d = new Date(cleanStr);
    if (isValid(d)) return d;

    // 2. Parse manually
    // Remove time part: "11-05-2025 15:21" -> "11-05-2025"
    const datePart = cleanStr.split(/[\s,]+/)[0];
    const parts = datePart.split(/[-/.]/); 

    if (parts.length === 3) {
       const p1 = parseInt(parts[0]);
       const p2 = parseInt(parts[1]);
       const p3 = parseInt(parts[2]);

       // Case A: DD-MM-YYYY or MM-DD-YYYY (Year last)
       if (p3 > 2000) { 
          // Heuristic: If p1 > 12, it MUST be Day -> DD-MM-YYYY
          if (p1 > 12) return new Date(p3, p2 - 1, p1);
          // Heuristic: If p2 > 12, it MUST be Day -> MM-DD-YYYY
          if (p2 > 12) return new Date(p3, p1 - 1, p2);
          
          // Ambiguous (e.g. 11-05-2025). 
          // Default to MM-DD-YYYY (US) as it matches "Opportunities" file.
          return new Date(p3, p1 - 1, p2);
       }
       // Case B: YYYY-MM-DD (Year first)
       if (p1 > 2000) {
          return new Date(p1, p2 - 1, p3);
       }
    }
    return null;
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
            is_test_drive: false, 
            is_hot: false,
            ageing: 0
          };

          // --- MAPPING LOGIC ---
          if (uploadType === 'funnel') { 
            // ListofOpportunities__EN.csv (MM-DD-YYYY)
            item.id = row['id'] || row['ordernumber'] || item.id;
            
            // Format: 11-05-2025 15:21 (MM-DD-YYYY)
            // Force MM-DD-YYYY for this file type
            const dateRaw = row['createdon'];
            if(dateRaw) {
               const parts = dateRaw.split(' ')[0].split('-');
               if(parts.length===3) item.date = new Date(parts[2], parts[0]-1, parts[1]).toISOString().split('T')[0];
            } else {
               // Fallback if missing
               item.date = parseDate(row['createdon'])?.toISOString().split('T')[0];
            }

            item.consultant = row['assignedto'];
            item.model = row['modellinefe'];
            item.location = row['dealercode'] || row['dealername'] || 'Unknown';
            
            const td = row['testdrivecompleted'] || '';
            item.is_test_drive = td.toLowerCase().includes('yes') || td.toLowerCase().includes('done');
            
            const score = row['opportunityofflinescore'] || row['zqualificationlevel'] || '';
            item.is_hot = score.toLowerCase().includes('hot') || parseInt(score) > 80;
            
            item.customer_name = row['customer'] || row['firstmiddlename']; 
          } 
          else if (uploadType === 'source') {
            // ListofLeadsCreatedinMarketing__EN.csv (MM-DD-YYYY)
            item.id = row['leadid'] || item.id;
            
            const dateRaw = row['createdon'];
            if(dateRaw) {
               // Assuming MM-DD-YYYY
               const parts = dateRaw.split(' ')[0].split('-');
               if(parts.length===3) item.date = new Date(parts[2], parts[0]-1, parts[1]).toISOString().split('T')[0];
            } else {
               item.date = parseDate(row['createdon'])?.toISOString().split('T')[0];
            }

            item.model = row['modellinefe'];
            item.location = row['city'];
            item.consultant = row['owner'];
            item.source = row['source'];
            item.stage = row['qualificationlevel'];
          }
          else if (uploadType === 'booking') {
            // EXPORT- Booking to delivery data.csv (DD-MM-YYYY)
            item.id = row['salesordernumber'] || row['dbmorder'] || item.id;
            
            const parseDDMM = (dStr) => {
                if(!dStr) return null;
                const parts = dStr.split('-'); // 22-11-2025
                if(parts.length===3) return new Date(parts[2], parts[1]-1, parts[0]).toISOString().split('T')[0];
                // Try parseDate as fallback
                const fallback = parseDate(dStr);
                return fallback ? fallback.toISOString().split('T')[0] : null;
            }
            
            // Prioritize Document Date for Booking
            item.date = parseDDMM(row['documentdate'] || row['bookingdate']);
            // Prioritize Invoice Date for Retail
            item.retail_date = parseDDMM(row['invoicedate'] || row['invoicedatev'] || row['billingdate']);
            
            item.model = row['modelsalescode'] || row['modelline'] || row['model'];
            item.location = row['dealercode'];
            item.consultant = row['employeename'] || row['salesconsultant']; 
            item.customer_name = row['customername']; 
            
            item.stage = item.retail_date ? 'Retail' : 'Booking';
          }
          else if (uploadType === 'inventory') {
            // EXPORT Inventory.csv (DD-MM-YYYY)
            item.id = row['vehicleidentificationnumber'] || row['vin'] || item.id;
            
            const parseDDMM = (dStr) => {
                if(!dStr) return null;
                const parts = dStr.split('-');
                if(parts.length===3) return new Date(parts[2], parts[1]-1, parts[0]).toISOString().split('T')[0];
                return null;
            }
            item.date = parseDDMM(row['grndate']);

            item.model = row['modelline'];
            item.location = row['dealercode'];
            item.stage = row['primarystatus']; 
            item.ageing = parseInt(row['ageingdays'] || '0');
          }

          if (item.date) item.month = item.date.slice(0, 7);
          return item;
        });

        const validPayload = payload.filter(p => p.date); 

        // Batch Upload
        const batchSize = 500;
        for (let i = 0; i < validPayload.length; i += batchSize) {
          const chunk = validPayload.slice(i, i + batchSize);
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
              { id: 'funnel', label: 'Opportunities', sub: 'ListofOpportunities.csv', icon: LayoutDashboard, color: 'blue' },
              { id: 'source', label: 'Marketing Leads', sub: 'ListofLeads.csv', icon: TrendingUp, color: 'emerald' },
              { id: 'booking', label: 'Booking/Retail', sub: 'Booking-Delivery.csv', icon: DollarSign, color: 'violet' },
              { id: 'inventory', label: 'Inventory', sub: 'EXPORT Inventory.csv', icon: Car, color: 'orange' }
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
        // Smart Date Detection
        const validMonths = [...new Set(data.map(d => d.month).filter(m => m && m.match(/^\d{4}-\d{2}$/)))].sort();
        if (validMonths.length > 0) {
           const latest = validMonths[validMonths.length - 1];
           setCurrentMonth(latest);
           const [y, m] = latest.split('-');
           const prevD = new Date(parseInt(y), parseInt(m) - 2, 1); 
           const py = prevD.getFullYear();
           const pm = String(prevD.getMonth() + 1).padStart(2, '0');
           setPrevMonth(`${py}-${pm}`);
        }
      }
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  useEffect(() => { fetchLeads(); }, []);

  // --- DERIVED DATA ---
  const filteredData = useMemo(() => {
    return rawData.filter(item => {
      const matchModel = filters.model === 'All' || !item.model || item.model === filters.model;
      const matchLoc = filters.location === 'All' || !item.location || item.location === filters.location;
      const matchCons = filters.consultant === 'All' || !item.consultant || item.consultant === filters.consultant;
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
    // Opportunities
    const inquiries = funnelData.filter(d => d.month === month).length;
    const testDrives = funnelData.filter(d => d.month === month && d.is_test_drive).length;
    const hotLeads = funnelData.filter(d => d.month === month && d.is_hot).length;
    
    // Booking & Retail Logic (Matching Customer Name/Model if needed, but aggregating by Consultant/Month is robust)
    // Booking Date Match
    const bookings = bookingData.filter(d => d.month === month).length;
    // Retail Date Match
    const retails = bookingData.filter(d => d.retail_date && d.retail_date.startsWith(month)).length;

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

  // 2. Inventory Stats
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

  // --- TABLES FOR OTHER TABS ---
  const crossSellTable = [
    { label: 'Car Finance', v1: 0, v2: 0, sub2: '0%' },
    { label: 'Insurance', v1: 0, v2: 0, sub2: '0%' },
    { label: 'Exchange', v1: 0, v2: 0, sub2: '0%' },
    { label: 'Accessories', v1: 0, v2: 0, type: 'currency' },
  ];

  const salesMgmtTable = [
    { label: 'Bookings', v1: prevF.bookings, v2: currF.bookings },
    { label: 'Dlr. Retail', v1: prevF.retails, v2: currF.retails },
    { label: 'OEM Retail', v1: 0, v2: 0 },
    { label: 'POC Sales', v1: 0, v2: 0 },
  ];

  const profitTable = [
    { label: 'New car Margin', v1: 0, v2: 0, type: 'currency' },
    { label: 'Margin per car', v1: 0, v2: 0 },
    { label: 'Used cars Margin', v1: 0, v2: 0, type: 'currency' },
    { label: 'SC Productivity', v1: 0, v2: 0 },
  ];

  return (
    <div className="min-h-screen bg-slate-50/50 font-sans pb-10">
       <GlobalStyles />
       <ImportWizard isOpen={showImport} onClose={() => setShowImport(false)} onDataUploaded={(t) => { fetchLeads(); setSuccessMsg(`Uploaded ${t} data!`); setTimeout(()=>setSuccessMsg(''),3000); }} />
       
       <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
         <div className="max-w-[1920px] mx-auto px-4 h-16 flex items-center justify-between">
           <div className="flex items-center gap-3">
             <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white"><Car className="w-5 h-5" /></div>
             <div><h1 className="text-lg font-bold text-slate-800">Sales Dashboard</h1>
                <div className="flex items-center gap-2 text-[10px] text-slate-400">
                  <span>Data Period: {currentMonth}</span>
                  <div className={`w-2 h-2 rounded-full ${loading ? 'bg-yellow-400 animate-pulse' : 'bg-green-500'}`}></div>
                </div>
             </div>
           </div>
           <button onClick={() => setShowImport(true)} className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-slate-800 shadow-sm"><Upload className="w-3.5 h-3.5" /> Import Data</button>
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

          {/* 4. CROSS-SELL */}
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
             <ComparisonTable rows={profitTable} headers={[prevMonth, currentMonth]} />
          </div>
       </main>
    </div>
  );
}
