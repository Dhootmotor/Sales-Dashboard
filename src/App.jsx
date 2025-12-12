import React, { useState, useEffect, useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell 
} from 'recharts';
import { 
  LayoutDashboard, Upload, Filter, TrendingUp, TrendingDown, 
  Users, Car, DollarSign, ChevronDown, FileSpreadsheet, 
  ArrowUpRight, ArrowDownRight, 
  Clock, X, CheckCircle, Download, Trash2, Calendar, AlertTriangle, Database, HardDrive
} from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

// --- CONFIGURATION & SETUP ---
let supabase = null;
let isSupabaseInitialized = false;

try {
  // 1. Check for Environment Variables (Vercel/Local)
  const supabaseUrl = import.meta.env?.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env?.VITE_SUPABASE_ANON_KEY;

  if (supabaseUrl && supabaseKey) {
    supabase = createClient(supabaseUrl, supabaseKey);
    isSupabaseInitialized = true;
    console.log("Supabase initialized successfully.");
  } else {
    console.warn("Supabase credentials missing. App will default to Local Storage mode.");
  }
} catch (e) {
  console.error("Supabase Init Error:", e);
}

// --- STYLES ---
const GlobalStyles = () => (
  <style>{`
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: #f1f5f9; }
    ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
    .animate-fade-in { animation: fadeIn 0.5s ease-out forwards; }
    .animate-fade-in-up { animation: fadeInUp 0.5s ease-out forwards; }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes fadeInUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
  `}</style>
);

// --- CONSTANTS ---
const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658', '#8dd1e1'];

// --- HELPERS ---
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

  let headerIndex = 0;
  for (let i = 0; i < Math.min(lines.length, 20); i++) {
    const rawLine = lines[i].toLowerCase();
    // Robust detection including the specific Inventory headers you mentioned
    if (rawLine.includes('id') || rawLine.includes('lead id') || rawLine.includes('order number') || rawLine.includes('vehicle identification number') || rawLine.includes('vin') || rawLine.includes('company code') || rawLine.includes('vehicle id no.')) {
      headerIndex = i;
      break;
    }
  }

  const rawHeaders = parseLine(lines[headerIndex]);
  // Normalize headers to remove spaces, special chars, and lowercase
  const headers = rawHeaders.map(h => h.toLowerCase().trim().replace(/[\s_().-]/g, ''));
  
  const rows = lines.slice(headerIndex + 1).map((line) => {
    const values = parseLine(line);
    const row = {};
    headers.forEach((h, i) => { 
        if (!h) return;
        // Standardize VIN keys from different files to 'vin'
        if (h === 'vehicleidentificationnumber' || h === 'vehicleidno' || h === 'vin') {
            row['vin'] = values[i] || '';
        } else if (h === 'ageingdays' || h === 'agingdays') {
            row['ageingdays'] = values[i] || '0';
        } else if (h === 'primarystatus' || h === 'descriptionofprimarystatus') {
            row['primarystatus'] = values[i] || '';
        } else {
            row[h] = values[i] || ''; 
        }
    });
    // Keep original keys too just in case they are needed for display
    rawHeaders.forEach((h, i) => { const key = h.trim(); if (key) row[key] = values[i] || ''; });
    return row;
  });

  return { rows, rawHeaders }; 
};

// --- DATA HANDLERS (SUPABASE) ---
const batchUploadSupabase = async (collectionName, data) => {
  if (!supabase) throw new Error("Supabase not initialized");
  
  // Tables required in Supabase: 'opportunities', 'leads', 'inventory'
  // Columns required: id (text, PK), data (jsonb)

  const batchSize = 100; // Supabase handles smaller batches well
  let totalUploaded = 0;
  const chunks = [];
  for (let i = 0; i < data.length; i += batchSize) chunks.push(data.slice(i, i + batchSize));
  
  for (const chunk of chunks) {
    const formattedRows = chunk.map(item => {
      let docId = '';
      if (collectionName === 'opportunities') docId = item['id'] || item['opportunityid'];
      else if (collectionName === 'leads') docId = item['leadid'] || item['lead id'];
      else if (collectionName === 'inventory') docId = item['vin'] || item['vehicleidentificationnumber']; 
      
      // Fallback ID if missing
      if (!docId) docId = crypto.randomUUID();

      return {
        id: String(docId),
        data: item // Store the whole CSV row in a JSONB column
      };
    });

    const { error } = await supabase.from(collectionName).upsert(formattedRows, { onConflict: 'id' });
    
    if (error) {
      console.error("Supabase Upload Error:", error);
      throw error;
    }
    
    totalUploaded += chunk.length;
  }
  return totalUploaded;
};

// Fetch Helper that unwraps the JSONB 'data' column
const fetchSupabaseData = async (collectionName) => {
  if (!supabase) return [];
  const { data, error } = await supabase.from(collectionName).select('data');
  if (error) {
    console.error(`Error fetching ${collectionName}:`, error);
    return [];
  }
  return data.map(row => row.data);
};

// --- DATA HANDLERS (LOCAL) ---
const mergeLocalData = (currentData, newData, type) => {
  let merged = [];
  if (type === 'opportunities') {
    const mergedMap = new Map(currentData.map(item => [item['id'], item]));
    newData.forEach(item => { if (item['id']) mergedMap.set(item['id'], item); });
    merged = Array.from(mergedMap.values());
  } else if (type === 'leads') {
    const mergedMap = new Map(currentData.map(item => [item['leadid'] || item['lead id'], item]));
    newData.forEach(item => { 
        const id = item['leadid'] || item['lead id'] || Math.random(); 
        mergedMap.set(id, item); 
    });
    merged = Array.from(mergedMap.values());
  } else if (type === 'inventory') {
    const mergedMap = new Map(currentData.map(item => [item['vin'] || item['vehicleidentificationnumber'], item]));
    newData.forEach(item => { 
        const id = item['vin'] || item['vehicleidentificationnumber'] || Math.random(); 
        mergedMap.set(id, item); 
    });
    merged = Array.from(mergedMap.values());
  }
  return merged;
};

// --- IMPORT WIZARD ---
const ImportWizard = ({ isOpen, onClose, onDataImported, isUploading, mode }) => {
  const [file, setFile] = useState(null);
  const handleFileChange = (e) => { if (e.target.files[0]) setFile(e.target.files[0]); };

  const processFiles = async () => {
    if (!file) return;
    const readFile = (f) => new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(parseCSV(e.target.result));
      reader.readAsText(f);
    });

    try {
      const { rows, rawHeaders } = await readFile(file);
      const headerString = rawHeaders.join(',').toLowerCase();
      let type = 'unknown';
      
      if (headerString.includes('opportunity offline score') || headerString.includes('order number')) type = 'opportunities';
      else if (headerString.includes('lead id') || headerString.includes('qualification level')) type = 'leads';
      else if (headerString.includes('vehicle identification number') || headerString.includes('vin') || headerString.includes('model sales code') || headerString.includes('ageing days') || headerString.includes('vehicle id no.')) type = 'inventory'; 

      console.log("Detected File Type:", type);
      await onDataImported(rows, type);
      setFile(null);
      onClose();
    } catch (error) {
      alert("Error processing file: " + error.message);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl overflow-hidden animate-fade-in-up">
        <div className="bg-slate-800 px-6 py-4 flex justify-between items-center">
          <h2 className="text-white font-bold text-lg flex items-center gap-2">
            <Upload className="w-5 h-5" /> Import Data ({mode === 'cloud' ? 'Supabase' : 'Local'})
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-6">
          <div className={`p-4 rounded-lg text-sm ${mode === 'cloud' ? 'bg-green-50 text-green-800 border-green-100' : 'bg-orange-50 text-orange-800 border-orange-100'}`}>
             {mode === 'cloud' ? (
                <>
                  ✅ <strong>Supabase Connected.</strong><br/>
                  Upload unlimited 2024/2025 data. Ensure tables (opportunities, leads, inventory) exist in your project.
                </>
             ) : (
                <>
                  ⚠️ <strong>Local Storage Mode.</strong><br/>
                  Browser storage is limited (~5MB). Upload only <strong>one month</strong> at a time to prevent crashes.
                </>
             )}
          </div>
          <div className="border-2 border-dashed border-slate-200 rounded-lg p-8 hover:border-blue-400 transition-colors bg-slate-50 relative group flex flex-col items-center justify-center text-center">
                <FileSpreadsheet className="w-12 h-12 text-blue-600 mb-4" /> 
                <div className="text-slate-700 font-semibold text-lg mb-1">{file ? file.name : "Click to Upload CSV"}</div>
                <input type="file" accept=".csv" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={handleFileChange} />
          </div>
        </div>
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-lg">Cancel</button>
          <button onClick={processFiles} disabled={isUploading || !file} className={`px-4 py-2 text-sm font-bold text-white rounded-lg flex items-center gap-2 ${isUploading || !file ? 'bg-slate-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 shadow-md'}`}>
            {isUploading ? 'Processing...' : (mode === 'cloud' ? 'Upload & Sync' : 'Merge & Save')}
          </button>
        </div>
      </div>
    </div>
  );
};

// --- COMPARISON TABLE ---
const ComparisonTable = ({ rows, headers, timestamp }) => (
  <div className="flex flex-col h-full">
    <div className="overflow-x-auto flex-1">
      <table className="w-full text-sm text-left border-collapse">
        <thead className="text-[10px] uppercase text-slate-400 bg-white border-b border-slate-100 font-bold tracking-wider">
          <tr>
            <th className="py-2 pl-2 w-[28%]">Metric</th>
            <th className="py-2 text-right w-[18%] px-1 border-l border-slate-50">{headers[0] || 'Prev'}</th>
            <th className="py-2 text-right w-[18%] px-1 text-slate-300">%</th>
            <th className="py-2 text-right w-[18%] px-1 border-l border-slate-50">{headers[1] || 'Curr'}</th>
            <th className="py-2 text-right w-[18%] px-1 text-slate-300">%</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {rows.map((row, idx) => {
            const v1 = row.v1 || 0;
            const v2 = row.v2 || 0;
            const isUp = v2 >= v1;
            const format = (val, type) => {
               if (type === 'currency') return `₹ ${(val/100000).toFixed(2)} L`;
               return val.toLocaleString();
            };
            return (
              <tr key={idx} className="hover:bg-slate-50/80 transition-colors text-xs">
                <td className="py-2 pl-2 font-semibold text-slate-600 flex items-center gap-1.5 overflow-hidden text-ellipsis whitespace-nowrap">
                   {isUp ? <ArrowUpRight className="w-3 h-3 text-emerald-500 shrink-0" /> : <ArrowDownRight className="w-3 h-3 text-rose-500 shrink-0" />}
                   <span className="truncate" title={row.label}>{row.label}</span>
                </td>
                <td className="py-2 text-right text-slate-500 font-mono px-1 border-l border-slate-50 border-dashed">{format(v1, row.type)}</td>
                <td className="py-2 text-right text-slate-400 text-[10px] px-1">{row.sub1 || '-'}</td>
                <td className="py-2 text-right font-bold text-slate-800 font-mono px-1 border-l border-slate-50 border-dashed">{format(v2, row.type)}</td>
                <td className="py-2 text-right text-blue-600 font-semibold text-[10px] px-1">{row.sub2 || '-'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    <div className="mt-auto pt-3 border-t border-slate-100 flex items-center justify-end gap-2 text-[10px] text-slate-400">
      <Clock className="w-3 h-3" />
      <span>Updated: {timestamp ? new Date().toLocaleTimeString() : 'Ready'}</span>
    </div>
  </div>
);

// --- MAIN APPLICATION ---
export default function App() {
  const [oppData, setOppData] = useState([]);
  const [leadData, setLeadData] = useState([]);
  const [invData, setInvData] = useState([]);
  
  const [showImport, setShowImport] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [viewMode, setViewMode] = useState('dashboard'); 
  const [detailedMetric, setDetailedMetric] = useState('Inquiries');
  const [successMsg, setSuccessMsg] = useState(''); 
  const [timeView, setTimeView] = useState('CY'); 
  const [filters, setFilters] = useState({ model: 'All', location: 'All', consultant: 'All' });
  const [storageMode, setStorageMode] = useState(isSupabaseInitialized ? 'cloud' : 'local');

  useEffect(() => {
    setStorageMode(isSupabaseInitialized ? 'cloud' : 'local');
  }, []);

  // DATA FETCHING
  useEffect(() => {
    const fetchData = async () => {
      if (storageMode === 'cloud') {
         const o = await fetchSupabaseData('opportunities');
         const l = await fetchSupabaseData('leads');
         const i = await fetchSupabaseData('inventory');
         setOppData(o); setLeadData(l); setInvData(i);
      } else {
         try {
           const savedOpp = localStorage.getItem('dashboard_oppData');
           const savedLead = localStorage.getItem('dashboard_leadData');
           const savedInv = localStorage.getItem('dashboard_invData');
           if (savedOpp) setOppData(JSON.parse(savedOpp));
           if (savedLead) setLeadData(JSON.parse(savedLead));
           if (savedInv) setInvData(JSON.parse(savedInv));
         } catch (e) {
           console.error("Local Storage Load Error", e);
         }
      }
    };
    fetchData();
  }, [storageMode]);

  // --- HELPERS ---
  const getDateObj = (dateStr) => {
      if (!dateStr) return new Date(0);
      let d = new Date(dateStr);
      if (!isNaN(d.getTime())) return d;
      const parts = dateStr.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
      if (parts) { d = new Date(parts[3], parts[2] - 1, parts[1]); if (!isNaN(d.getTime())) return d; }
      return new Date(0);
  };

  const getMonthStr = (dateStr) => {
    const d = getDateObj(dateStr);
    if (d.getTime() === 0) return 'Unknown';
    return d.toLocaleString('default', { month: 'short', year: '2-digit' });
  };

  const timeLabels = useMemo(() => {
    if (oppData.length === 0) return { prevLabel: 'Prev', currLabel: 'Curr' };
    let maxDate = new Date(0);
    oppData.forEach(d => {
        const date = getDateObj(d['createdon'] || d['createddate']);
        if (date > maxDate) maxDate = date;
    });
    if (maxDate.getTime() === 0) return { prevLabel: 'Prev', currLabel: 'Curr' };
    const currMonth = maxDate; 
    let prevMonth = new Date(currMonth);
    if (timeView === 'CY') { prevMonth.setMonth(currMonth.getMonth() - 1); } 
    else { prevMonth.setFullYear(currMonth.getFullYear() - 1); }
    return { prevLabel: prevMonth.toLocaleString('default', { month: 'short', year: '2-digit' }), currLabel: currMonth.toLocaleString('default', { month: 'short', year: '2-digit' }) };
  }, [oppData, timeView]);

  const handleDataImport = async (newData, type) => {
    setIsUploading(true);
    try {
      if (storageMode === 'cloud') {
         const count = await batchUploadSupabase(type, newData);
         setSuccessMsg(`Synced ${count} records to Supabase`);
         // Trigger refresh
         const data = await fetchSupabaseData(type);
         if(type === 'opportunities') setOppData(data);
         else if(type === 'leads') setLeadData(data);
         else if(type === 'inventory') setInvData(data);
      } else {
         let current = [];
         if (type === 'opportunities') current = oppData;
         else if (type === 'leads') current = leadData;
         else if (type === 'inventory') current = invData;
         const merged = mergeLocalData(current, newData, type);
         if (type === 'opportunities') { localStorage.setItem('dashboard_oppData', JSON.stringify(merged)); setOppData(merged); }
         else if (type === 'leads') { localStorage.setItem('dashboard_leadData', JSON.stringify(merged)); setLeadData(merged); }
         else if (type === 'inventory') { localStorage.setItem('dashboard_invData', JSON.stringify(merged)); setInvData(merged); }
         setSuccessMsg(`Merged ${newData.length} records Locally`);
      }
      setTimeout(() => setSuccessMsg(''), 5000);
    } catch (e) {
      alert("Upload failed: " + e.message);
    } finally {
      setIsUploading(false);
    }
  };

  const clearData = async () => {
    if(window.confirm("Delete ALL data?")) {
       if (storageMode === 'cloud') {
           // For Supabase, usually we don't allow wipe from client, but here is logic if needed (requires RLS policy)
           // await supabase.from('opportunities').delete().neq('id', 0);
           alert("Data clearing in Cloud mode is restricted to Admin console.");
       } else {
           localStorage.removeItem('dashboard_oppData'); localStorage.removeItem('dashboard_leadData'); localStorage.removeItem('dashboard_invData');
           setOppData([]); setLeadData([]); setInvData([]);
           setSuccessMsg("Local Data Cleared");
       }
       setTimeout(() => setSuccessMsg(''), 3000);
    }
  };

  // --- FILTER & DATA LOGIC ---
  const getFilteredData = (data) => {
    return data.filter(item => {
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
  
  const allDataForFilters = useMemo(() => [...oppData, ...leadData, ...invData], [oppData, leadData, invData]);
  const locationOptions = useMemo(() => [...new Set(allDataForFilters.map(d => d['Dealer Code'] || d['dealercode']).filter(Boolean))].sort(), [allDataForFilters]);
  const consultantOptions = useMemo(() => [...new Set(allDataForFilters.map(d => d['Assigned To'] || d['assignedto']).filter(Boolean))].sort(), [allDataForFilters]);
  const modelOptions = useMemo(() => [...new Set(allDataForFilters.map(d => d['modellinefe'] || d['Model Line']).filter(Boolean))].sort(), [allDataForFilters]);

  const funnelStats = useMemo(() => {
    if (!timeLabels.currLabel) return [];
    const getMonthData = (label) => filteredOppData.filter(d => getMonthStr(d['createdon'] || d['createddate']) === label);
    const currData = getMonthData(timeLabels.currLabel);
    const prevData = getMonthData(timeLabels.prevLabel);
    const getMetrics = (data) => {
      const inquiries = data.length;
      const testDrives = data.filter(d => { const val = (d['testdrivecompleted'] || '').toLowerCase(); return val === 'yes' || val === 'completed' || val === 'done'; }).length;
      const hotLeads = data.filter(d => { const score = parseInt(d['opportunityofflinescore'] || '0'); const status = (d['zqualificationlevel'] || d['status'] || '').toLowerCase(); return score > 80 || status.includes('hot'); }).length;
      const bookings = data.filter(d => (d['ordernumber'] || '').trim() !== '').length;
      const retails = data.filter(d => (d['invoicedatev'] || '').trim() !== '').length;
      return { inquiries, testDrives, hotLeads, bookings, retails };
    };
    const c = getMetrics(currData);
    const p = getMetrics(prevData);
    const calcPct = (num, den) => den > 0 ? Math.round((num / den) * 100) + '%' : '0%';
    return [
      { label: 'Inquiries', v1: p.inquiries, sub1: '100%', v2: c.inquiries, sub2: '100%' },
      { label: 'Test-drives', v1: p.testDrives, sub1: calcPct(p.testDrives, p.inquiries), v2: c.testDrives, sub2: calcPct(c.testDrives, c.inquiries) },
      { label: 'Hot Leads', v1: p.hotLeads, sub1: calcPct(p.hotLeads, p.inquiries), v2: c.hotLeads, sub2: calcPct(c.hotLeads, c.inquiries) },
      { label: 'Booking Conversion', v1: p.bookings, sub1: calcPct(p.bookings, p.inquiries), v2: c.bookings, sub2: calcPct(c.bookings, c.inquiries) },
      { label: 'Retail Conversion', v1: p.retails, sub1: calcPct(p.retails, p.inquiries), v2: c.retails, sub2: calcPct(c.retails, c.inquiries) },
    ];
  }, [filteredOppData, timeLabels]);

  const inventoryStats = useMemo(() => {
    const total = filteredInvData.length;
    const checkStatus = (item, keywords) => { 
       const status = (item['primarystatus'] || item['Primary Status'] || item['descriptionofprimarystatus'] || '').toLowerCase();
       return keywords.some(k => status.includes(k));
    };
    const open = filteredInvData.filter(d => { 
        const status = (d['primarystatus'] || d['Primary Status'] || '').toLowerCase();
        return status && !status.includes('book') && !status.includes('allot') && !status.includes('block') && !status.includes('invoice');
    }).length;
    const booked = filteredInvData.filter(d => checkStatus(d, ['allotted', 'booked', 'blocked'])).length;
    const ageing = filteredInvData.filter(d => parseInt(d['ageingdays'] || '0') > 90).length;
    
    return [
      { label: 'Total Inventory', v1: 0, v2: total },
      { label: 'Open Inventory', v1: 0, v2: open, sub2: total ? Math.round((open/total)*100)+'%' : '-' },
      { label: 'Booked Inventory', v1: 0, v2: booked, sub2: total ? Math.round((booked/total)*100)+'%' : '-' },
      { label: 'Wholesale', v1: 0, v2: 0 },
      { label: 'Ageing (>90D)', v1: 0, v2: ageing },
    ];
  }, [filteredInvData]);

  // FIX FOR LEAD SOURCE
  const sourceStats = useMemo(() => {
    const sourceDataset = filteredLeadData.length > 0 ? filteredLeadData : filteredOppData;
    const currData = sourceDataset.filter(d => getMonthStr(d['createdon'] || d['createddate']) === timeLabels.currLabel);
    const counts = {};
    currData.forEach(d => { 
        const s = d['source'] || d['Source'] || 'Unknown'; 
        counts[s] = (counts[s] || 0) + 1; 
    });
    const sorted = Object.entries(counts).sort(([,a], [,b]) => b - a).slice(0, 6)
      .map(([label, val]) => ({ 
          label, 
          v1: 0, 
          v2: val, 
          sub2: currData.length ? Math.round((val/currData.length)*100)+'%' : '0%' 
      }));
    return sorted.length ? sorted : [{label: 'No Data', v1:0, v2:0}];
  }, [filteredLeadData, filteredOppData, timeLabels]);

  return (
    <div className="min-h-screen bg-slate-50/50 font-sans pb-10">
       <GlobalStyles />
       <ImportWizard isOpen={showImport} onClose={() => setShowImport(false)} onDataImported={handleDataImport} isUploading={isUploading} mode={storageMode} />

       <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
         <div className="max-w-[1920px] mx-auto px-4 h-16 flex items-center justify-between">
           <div className="flex items-center gap-3">
             <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-lg flex items-center justify-center text-white shadow-md"><Car className="w-5 h-5" /></div>
             <div>
                <h1 className="text-lg font-bold text-slate-800 leading-tight">Sales Dashboard</h1>
                <div className="flex items-center gap-2 text-[10px] font-medium text-slate-400">
                   <Calendar className="w-3 h-3" />
                   <span>{timeLabels.currLabel} (vs {timeLabels.prevLabel})</span>
                </div>
             </div>
           </div>

           <div className="flex items-center gap-4">
              <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border ${storageMode === 'cloud' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-orange-50 text-orange-700 border-orange-200'}`}>
                 {storageMode === 'cloud' ? <Database className="w-3 h-3" /> : <HardDrive className="w-3 h-3" />}
                 {storageMode === 'cloud' ? 'Supabase' : 'Local'}
              </div>
              <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
                <button onClick={() => setViewMode('dashboard')} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${viewMode === 'dashboard' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Dashboard</button>
                <button onClick={() => setViewMode('detailed')} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${viewMode === 'detailed' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Analysis</button>
                <button onClick={() => setViewMode('table')} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${viewMode === 'table' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Data</button>
              </div>
              <div className="h-8 w-[1px] bg-slate-200"></div>
              <button onClick={() => setShowImport(true)} className="flex items-center gap-2 bg-slate-800 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-slate-700 transition-colors shadow-sm"><Upload className="w-3.5 h-3.5" /> Import</button>
              <button onClick={clearData} className="flex items-center gap-2 bg-red-100 text-red-700 px-3 py-2 rounded-lg text-xs font-bold hover:bg-red-200 transition-colors shadow-sm" title="Clear Database"><Trash2 className="w-3.5 h-3.5" /></button>
           </div>
         </div>

         {successMsg && (
           <div className="bg-emerald-50 border-b border-emerald-100 px-4 py-2 flex items-center justify-center gap-2 text-xs font-bold text-emerald-700 animate-fade-in"><CheckCircle className="w-4 h-4" /> {successMsg}</div>
         )}

         <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-2">
           <div className="max-w-[1920px] mx-auto flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2 text-slate-500 text-xs font-bold uppercase tracking-wide"><Filter className="w-3.5 h-3.5" /> Filters:</div>
              <div className="relative">
                <select className="appearance-none bg-white border border-slate-200 pl-3 pr-8 py-1.5 rounded text-xs font-medium text-slate-700 focus:outline-none focus:border-blue-400 shadow-sm min-w-[120px]" value={filters.model} onChange={e => setFilters({...filters, model: e.target.value})}>
                  <option value="All">All Models</option>
                  {modelOptions.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
                <ChevronDown className="w-3 h-3 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
              <div className="relative">
                <select className="appearance-none bg-white border border-slate-200 pl-3 pr-8 py-1.5 rounded text-xs font-medium text-slate-700 focus:outline-none focus:border-blue-400 shadow-sm min-w-[140px]" value={filters.location} onChange={e => setFilters({...filters, location: e.target.value})}>
                  <option value="All">All Locations</option>
                  {locationOptions.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
                <ChevronDown className="w-3 h-3 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
              <div className="relative">
                <select className="appearance-none bg-white border border-slate-200 pl-3 pr-8 py-1.5 rounded text-xs font-medium text-slate-700 focus:outline-none focus:border-blue-400 shadow-sm min-w-[160px]" value={filters.consultant} onChange={e => setFilters({...filters, consultant: e.target.value})}>
                  <option value="All">All Consultants</option>
                  {consultantOptions.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <ChevronDown className="w-3 h-3 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
              <div className="ml-auto flex items-center gap-3">
                 <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">View:</span>
                 <div className="flex items-center gap-2 bg-white rounded border border-slate-200 p-0.5">
                   <button onClick={() => setTimeView('CY')} className={`px-2 py-0.5 text-[10px] font-bold rounded transition-colors ${timeView === 'CY' ? 'bg-blue-50 text-blue-700' : 'text-slate-400 hover:text-slate-600'}`}>CY</button>
                   <button onClick={() => setTimeView('LY')} className={`px-2 py-0.5 text-[10px] font-bold rounded transition-colors ${timeView === 'LY' ? 'bg-blue-50 text-blue-700' : 'text-slate-400 hover:text-slate-600'}`}>LY</button>
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
