import React, { useState, useEffect, useCallback } from 'react';
import { 
  Upload, Users, Car, DollarSign, 
  FileSpreadsheet, ArrowUpRight, ArrowDownRight, 
  CheckCircle, AlertCircle, X, Activity, Package
} from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

// --- SUPABASE CONFIGURATION ---
const SUPABASE_URL = 'https://zfqjtpxetuliayhccnvw.supabase.co'; 
const SUPABASE_ANON_KEY = 'sb_publishable_ES3a2aPouopqEu_uV9Z-Og_uPsmoYNH'; 
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- GLOBAL STYLES ---
const GlobalStyles = () => (
  <style>{`
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: #f1f5f9; }
    ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
    .animate-fade-in { animation: fadeIn 0.5s ease-out forwards; }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  `}</style>
);

// --- HELPER: CSV PARSER ---
const parseCSV = (text, skipLines = 0) => {
  const allLines = text.split('\n');
  const lines = allLines.slice(skipLines).filter(l => l.trim());
  if (lines.length < 2) return [];

  // Parse header: split by comma, trim spaces, remove quotes, lowercase
  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, '').toLowerCase());
  
  // Parse rows
  return lines.slice(1).map(line => {
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
    // Push the last column
    if (headers[colIndex]) row[headers[colIndex]] = current.trim().replace(/"/g, '');
    return row;
  });
};

// --- COMPONENT: IMPORT WIZARD ---
const ImportWizard = ({ isOpen, onClose, onUploadComplete }) => {
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState('idle'); // idle, processing, success, error
  const [message, setMessage] = useState('');

  const handleFileUpload = async () => {
    if (!file) return;
    setStatus('processing');
    setMessage('Reading file...');

    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target.result;
      
      try {
        // --- SMART DETECTION LOGIC ---
        
        // 1. MARKETING LEADS (ListofLeads...)
        if (text.includes("Lead ID") && text.includes("Qualification Level")) {
          setMessage('Detected: Marketing Leads Report');
          const data = parseCSV(text, 4); // Skip first 4 lines of metadata
          
          const payload = data.map(r => ({
            lead_id: r['lead id'],
            name: r['name'],
            phone: r['customer phone'],
            city: r['city'],
            status: r['status'],
            source: r['source'],
            model: r['model line(fe)'],
            owner: r['owner'],
            created_on: r['created on'] ? new Date(r['created on']).toISOString() : null,
            month: r['created on'] ? new Date(r['created on']).toISOString().slice(0, 7) : null
          })).filter(r => r.lead_id); 

          if (payload.length === 0) throw new Error("No valid rows found");
          const { error } = await supabase.from('leads_marketing').upsert(payload);
          if (error) throw error;
        }

        // 2. OPPORTUNITIES (ListofOpportunities...)
        else if (text.includes("Opportunity offline score") || (text.includes("Test Drive Completed") && text.includes("Order Number"))) {
          setMessage('Detected: Opportunities Report');
          const data = parseCSV(text, 4); // Skip first 4 lines
          
          const payload = data.map(r => ({
            id: r['id'],
            customer: r['customer'],
            phone: r['mobile no.'],
            status: r['status'],
            model: r['model line(fe)'],
            test_drive_status: r['test drive completed'],
            rating: r['zqualificationlevel'],
            created_on: r['created on'] ? new Date(r['created on']).toISOString() : null,
            assigned_to: r['assigned to'],
            month: r['created on'] ? new Date(r['created on']).toISOString().slice(0, 7) : null
          })).filter(r => r.id);

          if (payload.length === 0) throw new Error("No valid rows found");
          const { error } = await supabase.from('opportunities').upsert(payload);
          if (error) throw error;
        }

        // 3. BOOKING/SALES (EXPORT- Booking to delivery...)
        else if (text.includes("Dealer Code") && text.includes("Order Type")) {
          setMessage('Detected: Booking & Delivery Register');
          const data = parseCSV(text, 0); // No skip
          
          const payload = data.map(r => {
             // Parse dates dd-mm-yyyy to yyyy-mm-dd for database
             const parseDate = (d) => {
               if(!d) return null;
               const p = d.split('-'); // Looking for dd-mm-yyyy
               // If valid split and year is last part
               return (p.length === 3 && p[2].length === 4) ? `${p[2]}-${p[1]}-${p[0]}` : null;
             };

             return {
               order_id: r['order number'] || r['vehicle id no.'] || Math.random().toString(), 
               customer: r['customer name'],
               model: r['model sales code'],
               vin: r['vehicle id no.'],
               booking_date: parseDate(r['document date']), 
               invoice_date: parseDate(r['billing date']),
               delivery_date: parseDate(r['delivery date']),
               status: r['status'],
               finance_bank: r['financier name'],
               insurance_co: r['insurance company name'],
               month: parseDate(r['document date']) ? parseDate(r['document date']).slice(0, 7) : null
             };
          }).filter(r => r.vin || r.order_id);

          if (payload.length === 0) throw new Error("No valid rows found");
          const { error } = await supabase.from('sales_register').upsert(payload);
          if (error) throw error;
        }

        // 4. INVENTORY (EXPORT Inventory...)
        else if (text.includes("Ageing Days") && text.includes("Primary Status")) {
          setMessage('Detected: Inventory Report');
          const data = parseCSV(text, 0); // No skip
          
          const payload = data.map(r => ({
            vin: r['vehicle identification number'],
            model: r['model line'],
            variant: r['variant series'],
            color: r['color description'],
            ageing_days: parseInt(r['ageing days']) || 0,
            status: r['primary status'],
            location: r['storage location']
          })).filter(r => r.vin);

          if (payload.length === 0) throw new Error("No valid rows found");
          const { error } = await supabase.from('inventory').upsert(payload);
          if (error) throw error;
        }

        else {
           throw new Error("Unknown file format. Please check the CSV headers.");
        }

        setStatus('success');
        setMessage('Database updated successfully!');
        setTimeout(() => {
           onUploadComplete();
           onClose();
           setStatus('idle');
           setFile(null);
           setMessage('');
        }, 1500);

      } catch (err) {
        console.error(err);
        setStatus('error');
        setMessage(err.message || 'Upload failed');
      }
    };
    reader.readAsText(file);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 animate-fade-in">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-slate-800">Upload Report</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-slate-400" /></button>
        </div>
        
        <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 flex flex-col items-center justify-center bg-slate-50 relative">
          <Upload className="w-10 h-10 text-blue-500 mb-3" />
          <p className="text-sm text-slate-600 font-medium">{file ? file.name : "Select a CSV Report"}</p>
          <p className="text-xs text-slate-400 mt-1">Supports: Leads, Opportunities, Booking, Inventory</p>
          <input type="file" accept=".csv" className="absolute inset-0 opacity-0 cursor-pointer" onChange={e => setFile(e.target.files[0])} />
        </div>

        {status !== 'idle' && (
           <div className={`mt-4 p-3 rounded-lg text-sm flex items-center gap-2 ${status === 'error' ? 'bg-red-50 text-red-600' : status === 'success' ? 'bg-green-50 text-green-600' : 'bg-blue-50 text-blue-600'}`}>
              {status === 'processing' && <Activity className="w-4 h-4 animate-spin" />}
              {status === 'success' && <CheckCircle className="w-4 h-4" />}
              {status === 'error' && <AlertCircle className="w-4 h-4" />}
              {message}
           </div>
        )}

        <button 
          onClick={handleFileUpload} 
          disabled={!file || status === 'processing'}
          className="w-full mt-6 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-lg disabled:opacity-50 transition-colors"
        >
          Process & Upload
        </button>
      </div>
    </div>
  );
};

// --- COMPONENT: STAT CARD ---
const StatCard = ({ title, icon: Icon, value, prevValue, color = "blue", suffix = "" }) => {
  const isUp = value >= prevValue;
  const diff = prevValue > 0 ? (((value - prevValue) / prevValue) * 100).toFixed(1) : 0;
  
  const colorClasses = {
    blue: "bg-blue-50 text-blue-600 border-blue-100",
    green: "bg-emerald-50 text-emerald-600 border-emerald-100",
    purple: "bg-purple-50 text-purple-600 border-purple-100",
    orange: "bg-orange-50 text-orange-600 border-orange-100",
  };

  return (
    <div className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
       <div className="flex justify-between items-start mb-2">
          <div className={`p-2 rounded-lg ${colorClasses[color]}`}>
            <Icon className="w-5 h-5" />
          </div>
          {prevValue !== undefined && (
            <div className={`flex items-center gap-1 text-xs font-bold ${isUp ? 'text-emerald-600' : 'text-rose-600'} bg-slate-50 px-2 py-1 rounded`}>
               {isUp ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
               {diff}%
            </div>
          )}
       </div>
       <div className="text-slate-500 text-xs font-bold uppercase tracking-wide mb-1">{title}</div>
       <div className="text-2xl font-bold text-slate-800">{value.toLocaleString()}{suffix}</div>
       {prevValue !== undefined && <div className="text-xs text-slate-400 mt-1">vs {prevValue.toLocaleString()} last month</div>}
    </div>
  );
};

// --- MAIN APP ---
export default function App() {
  const [showImport, setShowImport] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  
  // Dashboard Metrics
  const [stats, setStats] = useState({
    inquiries: { curr: 0, prev: 0 },
    testDrives: { curr: 0, prev: 0 },
    bookings: { curr: 0, prev: 0 },
    retail: { curr: 0, prev: 0 },
    inventory: 0,
    hotLeads: 0
  });

  // Use useCallback to prevent the function from redefining on every render
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Calc prev month string
      const d = new Date(selectedMonth + "-01");
      d.setMonth(d.getMonth() - 1);
      const prevMonth = d.toISOString().slice(0, 7);

      // 1. INQUIRIES (from leads_marketing)
      const { count: inqCurr } = await supabase.from('leads_marketing').select('*', { count: 'exact', head: true }).eq('month', selectedMonth);
      const { count: inqPrev } = await supabase.from('leads_marketing').select('*', { count: 'exact', head: true }).eq('month', prevMonth);

      // 2. TEST DRIVES & HOT LEADS (from opportunities)
      const { count: tdCurr } = await supabase.from('opportunities').select('*', { count: 'exact', head: true }).eq('month', selectedMonth).eq('test_drive_status', 'Yes');
      const { count: tdPrev } = await supabase.from('opportunities').select('*', { count: 'exact', head: true }).eq('month', prevMonth).eq('test_drive_status', 'Yes');
      const { count: hot } = await supabase.from('opportunities').select('*', { count: 'exact', head: true }).eq('month', selectedMonth).eq('rating', 'Hot');

      // 3. BOOKINGS & RETAIL (from sales_register)
      const { count: bkCurr } = await supabase.from('sales_register').select('*', { count: 'exact', head: true }).eq('month', selectedMonth);
      const { count: bkPrev } = await supabase.from('sales_register').select('*', { count: 'exact', head: true }).eq('month', prevMonth);
      // For Retail, check delivery date presence
      const { count: rtCurr } = await supabase.from('sales_register').select('*', { count: 'exact', head: true }).eq('month', selectedMonth).not('delivery_date', 'is', null);
      const { count: rtPrev } = await supabase.from('sales_register').select('*', { count: 'exact', head: true }).eq('month', prevMonth).not('delivery_date', 'is', null);

      // 4. INVENTORY (Snapshot, not monthly)
      const { count: inv } = await supabase.from('inventory').select('*', { count: 'exact', head: true });

      setStats({
        inquiries: { curr: inqCurr || 0, prev: inqPrev || 0 },
        testDrives: { curr: tdCurr || 0, prev: tdPrev || 0 },
        bookings: { curr: bkCurr || 0, prev: bkPrev || 0 },
        retail: { curr: rtCurr || 0, prev: rtPrev || 0 },
        hotLeads: hot || 0,
        inventory: inv || 0
      });

    } catch (e) {
      console.error("Fetch error:", e);
    } finally {
      setLoading(false);
    }
  }, [selectedMonth]); // Dependencies for useCallback

  // useEffect now correctly depends on fetchData
  useEffect(() => { 
    fetchData(); 
  }, [fetchData]);

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      <GlobalStyles />
      <ImportWizard isOpen={showImport} onClose={() => setShowImport(false)} onUploadComplete={fetchData} />

      {/* HEADER */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-blue-600 text-white p-2 rounded-lg"><Car className="w-5 h-5"/></div>
            <h1 className="text-xl font-bold tracking-tight">AutoVerse <span className="text-slate-400 font-normal">Analytics</span></h1>
          </div>
          <div className="flex items-center gap-3">
             <div className="flex items-center bg-slate-100 rounded-lg p-1">
                <input 
                  type="month" 
                  value={selectedMonth} 
                  onChange={e => setSelectedMonth(e.target.value)}
                  className="bg-transparent border-none text-sm font-bold text-slate-600 focus:ring-0 px-2 outline-none"
                />
             </div>
             <button 
               onClick={() => setShowImport(true)} 
               className="bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors"
             >
               <Upload className="w-4 h-4" /> Upload Report
             </button>
          </div>
        </div>
      </header>

      {/* DASHBOARD CONTENT */}
      <main className="max-w-7xl mx-auto px-4 py-8 animate-fade-in">
        
        {loading ? (
          <div className="flex justify-center items-center h-64 text-slate-400">Loading data...</div>
        ) : (
          <>
            {/* TOP METRICS ROW */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <StatCard title="Inquiries" value={stats.inquiries.curr} prevValue={stats.inquiries.prev} icon={Users} color="blue" />
              <StatCard title="Test Drives" value={stats.testDrives.curr} prevValue={stats.testDrives.prev} icon={Car} color="purple" />
              <StatCard title="Bookings" value={stats.bookings.curr} prevValue={stats.bookings.prev} icon={FileSpreadsheet} color="orange" />
              <StatCard title="Retail Sales" value={stats.retail.curr} prevValue={stats.retail.prev} icon={DollarSign} color="green" />
            </div>

            {/* SECONDARY METRICS */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* INVENTORY CARD */}
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center justify-center text-center">
                  <div className="p-3 bg-indigo-50 text-indigo-600 rounded-full mb-3"><Package className="w-6 h-6" /></div>
                  <div className="text-3xl font-bold text-slate-800 mb-1">{stats.inventory}</div>
                  <div className="text-sm font-bold text-slate-500 uppercase tracking-wide">Current Stock</div>
                  <div className="mt-4 w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                    <div className="bg-indigo-500 h-full w-3/4"></div>
                  </div>
              </div>

              {/* HOT LEADS CARD */}
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center justify-center text-center">
                  <div className="p-3 bg-rose-50 text-rose-600 rounded-full mb-3"><Activity className="w-6 h-6" /></div>
                  <div className="text-3xl font-bold text-slate-800 mb-1">{stats.hotLeads}</div>
                  <div className="text-sm font-bold text-slate-500 uppercase tracking-wide">Hot Leads (Active)</div>
                  <div className="mt-4 w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                    <div className="bg-rose-500 h-full w-1/2"></div>
                  </div>
              </div>

              {/* CONVERSION RATE */}
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center justify-center text-center">
                  <div className="p-3 bg-emerald-50 text-emerald-600 rounded-full mb-3"><CheckCircle className="w-6 h-6" /></div>
                  <div className="text-3xl font-bold text-slate-800 mb-1">
                    {stats.inquiries.curr > 0 ? ((stats.retail.curr / stats.inquiries.curr) * 100).toFixed(1) : 0}%
                  </div>
                  <div className="text-sm font-bold text-slate-500 uppercase tracking-wide">Conversion Rate</div>
                  <div className="mt-4 w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                    <div className="bg-emerald-500 h-full" style={{width: `${stats.inquiries.curr > 0 ? (stats.retail.curr / stats.inquiries.curr) * 100 : 0}%`}}></div>
                  </div>
              </div>
            </div>

            {/* INSTRUCTIONS */}
            <div className="mt-8 p-4 bg-slate-100 rounded-lg text-sm text-slate-500 border border-slate-200">
              <strong>How to update:</strong> Click "Upload Report" and select one of your daily CSV files. 
              The system will automatically detect if it is a Marketing Lead list, an Opportunity list, a Booking register, or an Inventory report.
            </div>
          </>
        )}
      </main>
    </div>
  );
}
