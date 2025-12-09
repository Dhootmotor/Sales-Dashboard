import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell 
} from 'recharts';
import { 
  LayoutDashboard, Upload, Filter, TrendingUp, TrendingDown, 
  Users, MapPin, Car, DollarSign, ChevronDown, FileSpreadsheet, 
  ArrowUpRight, ArrowDownRight, PieChart as PieChartIcon, Table as TableIcon, 
  Grid, Clock, RefreshCw, AlertCircle, X, CheckCircle, Search, Download
} from 'lucide-react';

// --- SUPABASE CONFIGURATION ---
// REPLACE THESE WITH YOUR ACTUAL SUPABASE PROJECT KEYS
const SUPABASE_URL = 'https://zfqjtpxetuliayhccnvw.supabase.co'; 
const SUPABASE_ANON_KEY = 'sb_publishable_ES3a2aPouopqEu_uV9Z-Og_uPsmoYNH'; // Updated with your publishable key

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

// Normalize keys to handle case variations in CSV headers
const normalizeKey = (key) => key ? key.trim().toLowerCase().replace(/[\s_().-]/g, '') : '';

// Mapping logic for critical fields
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

// --- HELPER: CSV PARSER ---
const parseCSV = (text) => {
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  
  const parseLine = (line) => {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  // Smart header detection
  let headerIndex = 0;
  for (let i = 0; i < Math.min(lines.length, 20); i++) {
    const rawLine = lines[i].toLowerCase();
    if (rawLine.startsWith('id,') || rawLine.includes(',id,') || rawLine.includes('lead record id') || rawLine.includes('mobile no.')) {
      headerIndex = i;
      break;
    }
  }

  const headers = parseLine(lines[headerIndex]).map(normalizeKey);
  
  return lines.slice(headerIndex + 1).map((line, idx) => {
    const values = parseLine(line);
    const row = {};
    headers.forEach((h, i) => {
      if (h) row[h] = values[i] || '';
    });
    return row;
  });
};

// --- COMPONENT: FILE UPLOAD WIZARD ---
const ImportWizard = ({ isOpen, onClose, onDataUploaded }) => {
  const [file, setFile] = useState(null);
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

      // Transform rows for Supabase
      const payload = rows.map(row => {
        const id = getValue(row, 'id') !== 'Unknown' ? getValue(row, 'id') : `gen-${Math.random()}`;
        
        // Parse Test Drive
        const tdValue = row['testdrivecompleted'] || '';
        const isTestDrive = tdValue.toLowerCase().includes('yes') || tdValue.toLowerCase().includes('done') || tdValue.toLowerCase().includes('completed');

        // Parse Hot Lead
        const hotValue = row['opportunityofflinescore'] || row['zqualificationlevel'] || '';
        const isHot = hotValue.toLowerCase().includes('hot') || hotValue.toLowerCase().includes('warm') || parseInt(hotValue) > 80;

        // Date Parsing
        let dateVal = getValue(row, 'date');
        let monthStr = 'Unknown';
        try {
          let d = new Date(dateVal);
          if (isNaN(d.getTime())) {
             const datePart = dateVal.split(' ')[0];
             const parts = datePart.split(/[-/]/);
             if (parts.length === 3) {
                 d = new Date(`${parts[0]}-${parts[1]}-${parts[2]}`);
                 if (isNaN(d.getTime()) || d.getMonth() !== parseInt(parts[0])-1) {
                     d = new Date(`${parts[1]}-${parts[0]}-${parts[2]}`);
                 }
             }
          }
          if (!isNaN(d.getTime())) {
            monthStr = d.toISOString().slice(0, 7); // YYYY-MM
            dateVal = d.toISOString().split('T')[0]; // Store normalized date
          }
        } catch (e) { console.log(e) }

        return {
          id: id.toString(), // Ensure ID is string
          date: dateVal,
          month: monthStr,
          model: getValue(row, 'model'),
          location: getValue(row, 'location'),
          consultant: getValue(row, 'consultant'),
          source: getValue(row, 'source'),
          stage: 'Enquiry',
          is_test_drive: isTestDrive,
          is_hot: isHot,
          raw_data: row // Store raw JSON if needed
        };
      });

      // BATCH UPSERT TO SUPABASE REST API
      const batchSize = 1000;
      for (let i = 0; i < payload.length; i += batchSize) {
        const chunk = payload.slice(i, i + batchSize);
        
        // Using fetch for REST Upsert
        // Header 'Prefer: resolution=merge-duplicates' handles the upsert logic
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

        if (!response.ok) {
           const errData = await response.json();
           throw new Error(errData.message || 'Supabase API Error');
        }
      }

      onDataUploaded();
      setProcessing(false);
      onClose();

    } catch (error) {
      console.error("Import failed", error);
      setErrorMsg(`Error: ${error.message || 'Import failed. Check Keys/Console.'}`);
      setProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl overflow-hidden animate-fade-in-up">
        <div className="bg-slate-800 px-6 py-4 flex justify-between items-center">
          <h2 className="text-white font-bold text-lg flex items-center gap-2">
            <Upload className="w-5 h-5" /> Import to Supabase
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        
        <div className="p-6 space-y-6">
          <div className="bg-blue-50 border border-blue-100 p-4 rounded-lg text-sm text-blue-800">
             Upload CSV to sync with <strong>Supabase DB</strong>. <br/>
             <span className="text-xs mt-1 block text-slate-500">
               * Matches records by 'ID'. Existing IDs will be updated.
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
            {processing ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Upload className="w-4 h-4" />}
            {processing ? 'Uploading...' : 'Upload to Cloud'}
          </button>
        </div>
      </div>
    </div>
  );
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
          let percentDiff = 0;
          const v1 = row.v1 || 0;
          const v2 = row.v2 || 0;
          if (v1 > 0) percentDiff = ((v2 - v1) / v1) * 100;
          else if (v2 > 0) percentDiff = 100;

          const isUp = percentDiff >= 0;

          return (
            <tr key={idx} className="hover:bg-slate-50/80 transition-colors text-xs">
              <td className="py-2 pl-2 font-semibold text-slate-600 flex items-center gap-1.5">
                 {isUp ? <ArrowUpRight className="w-3 h-3 text-emerald-500" /> : <ArrowDownRight className="w-3 h-3 text-rose-500" />}
                 {row.label}
              </td>
              <td className="py-2 text-right text-slate-400 font-mono">
                {type === 'currency' ? `₹ ${(v1/100000).toFixed(2)} L` : v1.toLocaleString()}
                {row.sub1 && <span className="ml-1 text-[9px] text-slate-300">({row.sub1})</span>}
              </td>
              <td className="py-2 text-right font-bold text-slate-800 font-mono pr-2">
                {type === 'currency' ? `₹ ${(v2/100000).toFixed(2)} L` : v2.toLocaleString()}
                {row.sub2 && <span className="ml-1 text-[9px] text-blue-500 font-normal">({row.sub2})</span>}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

// --- MAIN APPLICATION ---
export default function App() {
  const [rawData, setRawData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showImport, setShowImport] = useState(false);
  const [viewMode, setViewMode] = useState('dashboard'); 
  const [detailedMetric, setDetailedMetric] = useState('Inquiries');
  const [lastUpdated, setLastUpdated] = useState(null); 
  const [successMsg, setSuccessMsg] = useState(''); 
  
  // Date State
  const [currentMonth, setCurrentMonth] = useState('2025-11');
  const [prevMonth, setPrevMonth] = useState('2025-10');
  
  // Filters
  const [filters, setFilters] = useState({ model: 'All', location: 'All', consultant: 'All' });

  // --- FETCH DATA FROM SUPABASE (REST) ---
  const fetchLeads = async () => {
    setLoading(true);
    
    // Safety check for placeholders
    if (SUPABASE_URL.includes('YOUR_SUPABASE') || SUPABASE_ANON_KEY.includes('YOUR_SUPABASE')) {
       console.warn("Supabase Keys missing. Switching to Mock Data.");
       generateMock();
       setLoading(false);
       return;
    }

    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/sales_leads?select=*`, {
         headers: {
           'apikey': SUPABASE_ANON_KEY,
           'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
         }
      });

      if (!response.ok) {
        throw new Error(`Supabase API Error: ${response.status}`);
      }

      const data = await response.json();

      if (data && data.length > 0) {
        const formattedData = data.map(item => ({
          ...item,
          is_inquiry: true,
          isReal: true
        }));
        setRawData(formattedData);
        setLastUpdated(new Date());
      } else {
        setRawData([]);
      }
    } catch (err) {
      console.error('Fetch exception:', err);
      generateMock(); // Fallback so UI doesn't break
    } finally {
      setLoading(false);
    }
  };

  const generateMock = () => {
    const data = [];
    const models = ['Hector', 'Astor', 'Gloster', 'ZS EV', 'Comet EV'];
    const locs = ['Dlr-AHM-01', 'Dlr-SUR-02', 'Dlr-RJK-01'];
    const cons = ['Sales Consultant 01', 'Sales Consultant 02', 'Sales Consultant 03'];
    
    for(let i=0; i<500; i++) {
        const date = new Date('2025-01-01');
        date.setDate(date.getDate() + Math.floor(Math.random() * 365));
        const isBook = Math.random() > 0.8;
        const isRet = isBook && Math.random() > 0.5;
        
        data.push({
          id: i.toString(),
          model: models[Math.floor(Math.random()*models.length)],
          location: locs[Math.floor(Math.random()*locs.length)],
          consultant: cons[Math.floor(Math.random()*cons.length)],
          date: date.toISOString().split('T')[0],
          month: date.toISOString().slice(0, 7),
          stage: isRet ? 'Retail' : (isBook ? 'Booking' : 'Enquiry'),
          is_inquiry: true,
          is_test_drive: Math.random() > 0.6,
          is_hot: Math.random() > 0.7,
          is_booking: isBook,
          is_retail: isRet,
          finance: isRet && Math.random() > 0.4,
          insurance: isRet && Math.random() > 0.6,
          source: ['Walk-in', 'Digital', 'Referral'][Math.floor(Math.random()*3)],
          isReal: false
        });
    }
    setRawData(data);
  };

  useEffect(() => {
    fetchLeads();
  }, []);

  // --- DATA REFRESH HANDLER ---
  const handleDataUploaded = () => {
    fetchLeads(); // Re-fetch from DB
    setSuccessMsg('Data synced with Supabase successfully!');
    setTimeout(() => setSuccessMsg(''), 5000); 
  };

  // --- DERIVED DATA & FILTERS ---
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

  const currData = useMemo(() => filteredData.filter(d => d.month === currentMonth), [filteredData, currentMonth]);
  const prevData = useMemo(() => filteredData.filter(d => d.month === prevMonth), [filteredData, prevMonth]);

  // Aggregation Helper
  const calcStats = (data) => {
    const hasRealData = data.some(d => d.isReal);
    
    if (hasRealData) {
      return {
        count: data.length,
        inquiries: data.length, 
        testDrives: data.filter(d => d.is_test_drive).length,
        hotLeads: data.filter(d => d.is_hot).length,
        bookings: 0,
        retail: 0,
        finance: 0,
        insurance: 0,
        inventory: 0,
        wholesale: 0
      };
    }

    // Mock Mode Logic (richer data)
    return {
      count: data.length,
      inquiries: data.filter(d => d.is_inquiry).length,
      testDrives: data.filter(d => d.is_test_drive).length,
      hotLeads: data.filter(d => d.is_hot).length,
      bookings: data.filter(d => d.is_booking).length,
      retail: data.filter(d => d.is_retail).length,
      finance: data.filter(d => d.finance).length,
      insurance: data.filter(d => d.insurance).length,
      inventory: 45, 
      wholesale: 12
    };
  };

  const currStats = calcStats(currData);
  const prevStats = calcStats(prevData);

  // --- CARD CONFIGURATIONS ---
  const funnelData = [
    { label: 'Inquiries', v1: prevStats.inquiries, v2: currStats.inquiries },
    { label: 'Test-drives', v1: prevStats.testDrives, v2: currStats.testDrives, sub1: prevStats.inquiries ? ((prevStats.testDrives/prevStats.inquiries)*100).toFixed(0)+'%' : '0%', sub2: currStats.inquiries ? ((currStats.testDrives/currStats.inquiries)*100).toFixed(0)+'%' : '0%' },
    { label: 'Hot Leads', v1: prevStats.hotLeads, v2: currStats.hotLeads, sub1: prevStats.inquiries ? ((prevStats.hotLeads/prevStats.inquiries)*100).toFixed(0)+'%' : '0%', sub2: currStats.inquiries ? ((currStats.hotLeads/currStats.inquiries)*100).toFixed(0)+'%' : '0%' },
    { label: 'Booking Conversion', v1: prevStats.bookings, v2: currStats.bookings },
    { label: 'Retail Conversion', v1: prevStats.retail, v2: currStats.retail },
  ];

  const inventoryData = [
    { label: 'Total Inventory', v1: 0, v2: 0 },
    { label: 'Open Inventory', v1: 0, v2: 0 },
    { label: 'Booked Inventory', v1: 0, v2: 0 },
    { label: 'Wholesale', v1: 0, v2: 0 },
    { label: 'Ageing (>90D)', v1: 0, v2: 0 },
  ];

  const sourceStats = useMemo(() => {
    const sources = {};
    currData.forEach(d => { sources[d.source] = (sources[d.source] || 0) + 1; });
    const total = currData.length || 1;
    return Object.entries(sources).map(([k, v]) => ({ label: k, v2: v, sub2: ((v/total)*100).toFixed(1) + '%' }));
  }, [currData]);

  const crossSellData = [
    { label: 'Car Finance', v1: 0, v2: 0 },
    { label: 'Insurance', v1: 0, v2: 0 },
    { label: 'Exchange', v1: 0, v2: 0 },
    { label: 'Accessories', v1: 0, v2: 0, type: 'currency' },
  ];

  const salesMgmtData = [
    { label: 'Bookings', v1: 0, v2: 0 },
    { label: 'Dlr. Retail', v1: 0, v2: 0 },
    { label: 'OEM Retail', v1: 0, v2: 0 },
    { label: 'POC Sales', v1: 0, v2: 0 },
  ];

  const profitData = [
    { label: 'New car Margin', v1: 0, v2: 0, type: 'currency' },
    { label: 'Margin per car', v1: 0, v2: 0 },
    { label: 'Used cars Margin', v1: 0, v2: 0, type: 'currency' },
    { label: 'SC Productivity', v1: 0, v2: 0 },
  ];

  // --- HANDLERS ---
  const handleMetricClick = (metric) => {
    setDetailedMetric(metric);
    setViewMode('detailed');
  };

  // --- VIEW RENDERERS ---
  const DashboardView = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 animate-fade-in">
       {/* Card 1: Sales Funnel */}
       <div className={`rounded-lg shadow-sm border p-4 flex flex-col h-full hover:shadow-md transition-shadow cursor-pointer bg-blue-50/50 border-blue-200`} onClick={() => handleMetricClick('Inquiries')}>
          <div className="flex items-center gap-2 mb-4 border-b border-slate-100 pb-2">
            <div className="bg-blue-50 p-1.5 rounded text-blue-600"><LayoutDashboard className="w-4 h-4" /></div>
            <h3 className="font-bold text-slate-700">Sales Funnel <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded ml-2">REST API</span></h3>
          </div>
          <ComparisonTable rows={funnelData} headers={[prevMonth, currentMonth]} />
          
          {lastUpdated && (
            <div className="mt-4 pt-3 border-t border-blue-200 text-xs flex items-center justify-between text-blue-800">
              <span className="flex items-center gap-1 font-semibold">
                <Clock className="w-3 h-3" /> Last Synced:
              </span>
              <span>{lastUpdated.toLocaleTimeString()}</span>
            </div>
          )}
       </div>

       {/* Cards 2-6 */}
       {[
         { title: 'Inventory', icon: Car, color: 'indigo', data: inventoryData },
         { title: 'Lead Source', icon: TrendingUp, color: 'emerald', data: sourceStats },
         { title: 'Cross-Sell', icon: FileSpreadsheet, color: 'purple', data: crossSellData },
         { title: 'Sales Management', icon: Users, color: 'orange', data: salesMgmtData },
         { title: 'Profit & Productivity', icon: DollarSign, color: 'rose', data: profitData }
       ].map((card, idx) => (
         <div key={idx} className="bg-white rounded-lg shadow-sm border border-slate-200 p-4 flex flex-col h-full hover:shadow-md transition-shadow">
            <div className="flex items-center gap-2 mb-4 border-b border-slate-100 pb-2">
              <div className={`bg-${card.color}-50 p-1.5 rounded text-${card.color}-600`}>
                <card.icon className="w-4 h-4" />
              </div>
              <h3 className="font-bold text-slate-700">{card.title}</h3>
            </div>
            <ComparisonTable rows={card.data.length ? card.data : [{label:'No Data', v1:0, v2:0}]} headers={[prevMonth, currentMonth]} />
         </div>
       ))}
    </div>
  );

  const DetailedView = () => {
    const monthTrend = useMemo(() => {
      const counts = {};
      filteredData.forEach(d => { counts[d.month] = (counts[d.month] || 0) + 1; });
      return Object.entries(counts).map(([name, value]) => ({ name, value })).sort((a,b) => a.name.localeCompare(b.name));
    }, [filteredData]);

    const modelMix = useMemo(() => {
      const counts = {};
      currData.forEach(d => { counts[d.model] = (counts[d.model] || 0) + 1; });
      return Object.entries(counts).map(([name, value]) => ({ name, value }));
    }, [currData]);

    const locationMix = useMemo(() => {
      const counts = {};
      currData.forEach(d => { counts[d.location] = (counts[d.location] || 0) + 1; });
      return Object.entries(counts).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value);
    }, [currData]);

    const consultantMix = useMemo(() => {
      const counts = {};
      currData.forEach(d => { counts[d.consultant] = (counts[d.consultant] || 0) + 1; });
      return Object.entries(counts).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value);
    }, [currData]);

    return (
      <div className="space-y-6 animate-fade-in">
        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 flex items-center gap-3">
          <button onClick={() => setViewMode('dashboard')} className="p-1 hover:bg-slate-100 rounded">
             <ArrowDownRight className="w-5 h-5 text-slate-500 rotate-135" />
          </button>
          <div>
            <h2 className="text-xl font-bold text-blue-700 flex items-center gap-2">
              {detailedMetric} <span className="text-slate-400 font-light">|</span> {currData.length}
            </h2>
            <p className="text-xs text-slate-400">Analysis for {currentMonth}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
           <div className="lg:col-span-2 bg-white p-6 rounded-lg shadow-sm border border-slate-200">
             <h3 className="font-bold text-slate-700 mb-4">Month wise Trend</h3>
             <div className="h-64">
               <ResponsiveContainer width="100%" height="100%">
                 <LineChart data={monthTrend}>
                   <CartesianGrid strokeDasharray="3 3" vertical={false} />
                   <XAxis dataKey="name" />
                   <YAxis />
                   <RechartsTooltip />
                   <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={3} dot={{r: 4}} />
                 </LineChart>
               </ResponsiveContainer>
             </div>
           </div>

           <div className="row-span-2 bg-white p-6 rounded-lg shadow-sm border border-slate-200">
             <h3 className="font-bold text-slate-700 mb-4">Sales Consultant Performance</h3>
             <div className="h-[500px]">
               <ResponsiveContainer width="100%" height="100%">
                 <BarChart data={consultantMix} layout="vertical">
                   <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                   <XAxis type="number" hide />
                   <YAxis dataKey="name" type="category" width={110} tick={{fontSize: 10}} />
                   <RechartsTooltip />
                   <Bar dataKey="value" fill="#6366f1" radius={[0, 4, 4, 0]} barSize={18} />
                 </BarChart>
               </ResponsiveContainer>
             </div>
           </div>

           <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
             <h3 className="font-bold text-slate-700 mb-4">Model Mix</h3>
             <div className="h-64">
               <ResponsiveContainer width="100%" height="100%">
                 <PieChart>
                   <Pie data={modelMix} innerRadius={60} outerRadius={80} paddingAngle={2} dataKey="value">
                     {modelMix.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                   </Pie>
                   <RechartsTooltip />
                   <Legend />
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
          <h3 className="font-bold text-slate-700">Database Records</h3>
          <button className="flex items-center gap-2 bg-emerald-600 text-white px-3 py-1.5 rounded text-xs font-bold hover:bg-emerald-700">
            <Download className="w-3 h-3" /> Export
          </button>
       </div>
       <div className="overflow-x-auto">
         <table className="w-full text-left text-xs text-slate-600">
           <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
             <tr>
               <th className="p-3">ID</th>
               <th className="p-3">Location</th>
               <th className="p-3">Consultant</th>
               <th className="p-3">Model</th>
               <th className="p-3">Date</th>
               <th className="p-3">Stage</th>
             </tr>
           </thead>
           <tbody className="divide-y divide-slate-100">
             {currData.map((row, idx) => (
               <tr key={idx} className="hover:bg-blue-50/30">
                 <td className="p-3 font-mono text-slate-500">{row.id}</td>
                 <td className="p-3">{row.location}</td>
                 <td className="p-3">{row.consultant}</td>
                 <td className="p-3"><span className="bg-slate-100 px-2 py-0.5 rounded border border-slate-200">{row.model}</span></td>
                 <td className="p-3">{row.date}</td>
                 <td className="p-3">
                   <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700">
                     {row.stage}
                   </span>
                 </td>
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
       
       <ImportWizard 
         isOpen={showImport} 
         onClose={() => setShowImport(false)} 
         onDataUploaded={handleDataUploaded} 
       />

       <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
         <div className="max-w-[1920px] mx-auto px-4 h-16 flex items-center justify-between">
           <div className="flex items-center gap-3">
             <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-lg flex items-center justify-center text-white shadow-md">
               <Car className="w-5 h-5" />
             </div>
             <div>
                <h1 className="text-lg font-bold text-slate-800 leading-tight">Sales Dashboard</h1>
                <div className="flex items-center gap-2 text-[10px] font-medium text-slate-400">
                  <span>Supabase REST API</span>
                  <div className={`w-2 h-2 rounded-full ${loading ? 'bg-yellow-400 animate-pulse' : 'bg-green-500'}`}></div>
                </div>
             </div>
           </div>

           <div className="flex items-center gap-4">
              <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
                <button onClick={() => setViewMode('dashboard')} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${viewMode === 'dashboard' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>Dashboard</button>
                <button onClick={() => setViewMode('detailed')} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${viewMode === 'detailed' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>Analysis</button>
                <button onClick={() => setViewMode('table')} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${viewMode === 'table' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>Data</button>
              </div>

              <button 
                onClick={() => setShowImport(true)}
                className="flex items-center gap-2 bg-slate-800 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-slate-700 transition-colors shadow-sm"
              >
                <Upload className="w-3.5 h-3.5" /> Upload CSV
              </button>
           </div>
         </div>
         
         {successMsg && (
           <div className="bg-emerald-50 border-b border-emerald-100 px-4 py-2 flex items-center justify-center gap-2 text-xs font-bold text-emerald-700 animate-fade-in">
             <CheckCircle className="w-4 h-4" /> {successMsg}
           </div>
         )}
         
         <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-2">
           <div className="max-w-[1920px] mx-auto flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2 text-slate-500 text-xs font-bold uppercase tracking-wide">
                <Filter className="w-3.5 h-3.5" /> Filters:
              </div>
              <select className="bg-white border border-slate-200 px-3 py-1.5 rounded text-xs font-medium" value={filters.model} onChange={e => setFilters({...filters, model: e.target.value})}>
                  <option value="All">All Models</option>
                  {modelOptions.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <select className="bg-white border border-slate-200 px-3 py-1.5 rounded text-xs font-medium" value={filters.location} onChange={e => setFilters({...filters, location: e.target.value})}>
                  <option value="All">All Locations</option>
                  {locationOptions.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
              <select className="bg-white border border-slate-200 px-3 py-1.5 rounded text-xs font-medium" value={filters.consultant} onChange={e => setFilters({...filters, consultant: e.target.value})}>
                  <option value="All">All Consultants</option>
                  {consultantOptions.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
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
