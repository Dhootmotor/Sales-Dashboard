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
import { initializeApp } from "firebase/app";
import { 
  getFirestore, collection, onSnapshot, writeBatch, doc, query, orderBy, limit, deleteDoc, getDocs 
} from "firebase/firestore";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "firebase/auth";

// --- CONFIGURATION & SETUP ---
let app, auth, db;
let isFirebaseInitialized = false;
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// 1. SAFELY INITIALIZE FIREBASE (PREVENTS CRASHES ON VERCEL)
try {
  let firebaseConfig = null;
  // Check Canvas Environment
  if (typeof __firebase_config !== 'undefined') {
    firebaseConfig = JSON.parse(__firebase_config);
  } 
  // Check Vercel Environment Variable (Optional for future)
  else if (import.meta.env?.VITE_FIREBASE_CONFIG) {
    firebaseConfig = JSON.parse(import.meta.env.VITE_FIREBASE_CONFIG);
  }

  if (firebaseConfig) {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    isFirebaseInitialized = true;
  } else {
    console.warn("Firebase config missing. Falling back to Local Storage mode.");
  }
} catch (e) {
  console.error("Firebase Init Error:", e);
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
    if (rawLine.includes('id') || rawLine.includes('lead id') || rawLine.includes('order number') || rawLine.includes('vehicle identification number') || rawLine.includes('vin') || rawLine.includes('company code')) {
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
    rawHeaders.forEach((h, i) => { const key = h.trim(); if (key) row[key] = values[i] || ''; });
    return row;
  });

  return { rows, rawHeaders }; 
};

// --- DATA HANDLERS (HYBRID) ---

// 1. CLOUD UPLOAD (Batching)
const batchUploadFirestore = async (userId, collectionName, data) => {
  if (!db) throw new Error("Database not connected");
  const batchSize = 400; 
  let totalUploaded = 0;
  const chunks = [];
  for (let i = 0; i < data.length; i += batchSize) chunks.push(data.slice(i, i + batchSize));
  
  for (const chunk of chunks) {
    const batch = writeBatch(db);
    const collectionRef = collection(db, 'artifacts', appId, 'users', userId, collectionName);
    chunk.forEach(item => {
      let docId = '';
      if (collectionName === 'opportunities') docId = item['id'] || item['opportunityid'];
      else if (collectionName === 'leads') docId = item['leadid'] || item['lead id'];
      else if (collectionName === 'inventory') docId = item['vehicleidentificationnumber'] || item['vin'];
      
      const docRef = docId ? doc(collectionRef, String(docId).replace(/\//g, '_')) : doc(collectionRef);
      batch.set(docRef, item, { merge: true });
    });
    await batch.commit();
    totalUploaded += chunk.length;
  }
  return totalUploaded;
};

// 2. LOCAL MERGE (From Previous File Logic)
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
    const mergedMap = new Map(currentData.map(item => [item['vehicleidentificationnumber'] || item['vin'], item]));
    newData.forEach(item => { 
        const id = item['vehicleidentificationnumber'] || item['vin'] || Math.random(); 
        mergedMap.set(id, item); 
    });
    merged = Array.from(mergedMap.values());
  }
  return merged;
};

// --- COMPONENT: IMPORT WIZARD ---
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
      else if (headerString.includes('vehicle identification number') || headerString.includes('vin')) type = 'inventory'; 

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
            <Upload className="w-5 h-5" /> Import Data ({mode === 'cloud' ? 'Cloud' : 'Local'})
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        
        <div className="p-6 space-y-6">
          <div className={`p-4 rounded-lg text-sm ${mode === 'cloud' ? 'bg-blue-50 text-blue-800 border-blue-100' : 'bg-orange-50 text-orange-800 border-orange-100'}`}>
             {mode === 'cloud' ? (
                <>Upload <strong>2024/2025 Data</strong>. Unlimited storage securely in the cloud.</>
             ) : (
                <>Upload Data. <strong>Warning:</strong> Browser storage is limited (~5MB). Large files might fail.</>
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

// --- COMPONENT: COMPARISON TABLE ---
const ComparisonTable = ({ rows, headers, timestamp }) => (
  <div className="flex flex-col h-full">
    <div className="overflow-x-auto flex-1">
      <table className="w-full text-sm text-left border-collapse">
        <thead className="text-[10px] uppercase text-slate-400 bg-white border-b border-slate-100 font-bold tracking-wider">
          <tr>
            <th className="py-2 pl-2 w-1/3">Metric</th>
            <th className="py-2 text-right w-[33%] px-2">{headers[0] || 'Prev'}</th>
            <th className="py-2 text-right w-[33%] px-2">{headers[1] || 'Curr'}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {rows.map((row, idx) => {
            const v1 = row.v1 || 0;
            const v2 = row.v2 || 0;
            const isUp = v2 >= v1;
            const format = (val, type) => type === 'currency' ? `₹ ${(val/100000).toFixed(2)} L` : val.toLocaleString();

            return (
              <tr key={idx} className="hover:bg-slate-50/80 transition-colors text-xs">
                <td className="py-2.5 pl-2 font-semibold text-slate-600 flex items-center gap-2">
                   {isUp ? <ArrowUpRight className="w-3.5 h-3.5 text-emerald-500" /> : <ArrowDownRight className="w-3.5 h-3.5 text-rose-500" />}
                   {row.label}
                </td>
                <td className="py-2.5 text-right text-slate-500 font-mono px-2">
                  <div className="flex flex-col items-end">
                    <span className="font-bold">{format(v1, row.type)}</span>
                    {row.sub1 && <span className="text-[10px] text-slate-400">({row.sub1})</span>}
                  </div>
                </td>
                <td className="py-2.5 text-right font-bold text-slate-800 font-mono px-2">
                   <div className="flex flex-col items-end">
                    <span className="font-bold">{format(v2, row.type)}</span>
                    {row.sub2 && <span className="text-[10px] text-blue-600 font-semibold">({row.sub2})</span>}
                  </div>
                </td>
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
  const [user, setUser] = useState(null);
  
  // Data State
  const [oppData, setOppData] = useState([]);
  const [leadData, setLeadData] = useState([]);
  const [invData, setInvData] = useState([]);
  
  // UI State
  const [showImport, setShowImport] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [viewMode, setViewMode] = useState('dashboard'); 
  const [detailedMetric, setDetailedMetric] = useState('Inquiries');
  const [successMsg, setSuccessMsg] = useState(''); 
  const [timeView, setTimeView] = useState('CY'); 
  const [filters, setFilters] = useState({ model: 'All', location: 'All', consultant: 'All' });

  // Mode: 'cloud' (Firebase) or 'local' (LocalStorage)
  const [storageMode, setStorageMode] = useState(isFirebaseInitialized ? 'cloud' : 'local');

  // --- 1. INITIALIZATION ---
  useEffect(() => {
    if (isFirebaseInitialized && auth) {
      const initAuth = async () => {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      };
      initAuth();
      return onAuthStateChanged(auth, setUser);
    } else {
      // If Firebase is missing, ensure we are in local mode
      setStorageMode('local');
    }
  }, []);

  // --- 2. DATA FETCHING (HYBRID) ---
  useEffect(() => {
    // CLOUD MODE
    if (storageMode === 'cloud' && user) {
       const qOpp = query(collection(db, 'artifacts', appId, 'users', user.uid, 'opportunities'));
       const unsubOpp = onSnapshot(qOpp, (snap) => setOppData(snap.docs.map(d => d.data())), e => console.log(e));
       
       const qLead = query(collection(db, 'artifacts', appId, 'users', user.uid, 'leads'));
       const unsubLead = onSnapshot(qLead, (snap) => setLeadData(snap.docs.map(d => d.data())), e => console.log(e));
       
       const qInv = query(collection(db, 'artifacts', appId, 'users', user.uid, 'inventory'));
       const unsubInv = onSnapshot(qInv, (snap) => setInvData(snap.docs.map(d => d.data())), e => console.log(e));
       
       return () => { unsubOpp(); unsubLead(); unsubInv(); };
    } 
    // LOCAL MODE
    else if (storageMode === 'local') {
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
  }, [user, storageMode]);

  // --- 3. ROBUST DATE HELPERS ---
  const getDateObj = (dateStr) => {
      if (!dateStr) return new Date(0);
      let d = new Date(dateStr);
      if (!isNaN(d.getTime())) return d;
      const parts = dateStr.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
      if (parts) {
         d = new Date(parts[3], parts[2] - 1, parts[1]);
         if (!isNaN(d.getTime())) return d;
      }
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

    if (timeView === 'CY') {
        prevMonth.setMonth(currMonth.getMonth() - 1);
    } else {
        prevMonth.setFullYear(currMonth.getFullYear() - 1);
    }

    const currLabel = currMonth.toLocaleString('default', { month: 'short', year: '2-digit' });
    const prevLabel = prevMonth.toLocaleString('default', { month: 'short', year: '2-digit' });

    return { prevLabel, currLabel };
  }, [oppData, timeView]);

  // --- 4. UPLOAD HANDLER (HYBRID) ---
  const handleDataImport = async (newData, type) => {
    setIsUploading(true);
    try {
      if (storageMode === 'cloud') {
         // Cloud Logic
         if (!user) throw new Error("Authentication missing");
         const count = await batchUploadFirestore(user.uid, type, newData);
         setSuccessMsg(`Synced ${count} records to Cloud`);
      } else {
         // Local Logic (Merge & Save)
         let current = [];
         if (type === 'opportunities') current = oppData;
         else if (type === 'leads') current = leadData;
         else if (type === 'inventory') current = invData;

         const merged = mergeLocalData(current, newData, type);
         
         // Save
         if (type === 'opportunities') {
             localStorage.setItem('dashboard_oppData', JSON.stringify(merged));
             setOppData(merged);
         } else if (type === 'leads') {
             localStorage.setItem('dashboard_leadData', JSON.stringify(merged));
             setLeadData(merged);
         } else if (type === 'inventory') {
             localStorage.setItem('dashboard_invData', JSON.stringify(merged));
             setInvData(merged);
         }
         setSuccessMsg(`Merged ${newData.length} records Locally`);
      }
      setTimeout(() => setSuccessMsg(''), 5000);
    } catch (e) {
      console.error("Upload failed", e);
      alert("Upload failed: " + e.message);
    } finally {
      setIsUploading(false);
    }
  };

  const clearData = async () => {
    if(window.confirm("Delete ALL data?")) {
       if (storageMode === 'cloud' && user) {
           const deleteColl = async (path) => {
              const q = query(collection(db, 'artifacts', appId, 'users', user.uid, path), limit(500));
              const snap = await getDocs(q);
              const batch = writeBatch(db);
              snap.docs.forEach(d => batch.delete(d.ref));
              await batch.commit();
           };
           await deleteColl('opportunities');
           await deleteColl('leads');
           await deleteColl('inventory');
       } else {
           localStorage.removeItem('dashboard_oppData');
           localStorage.removeItem('dashboard_leadData');
           localStorage.removeItem('dashboard_invData');
           setOppData([]); setLeadData([]); setInvData([]);
       }
       setSuccessMsg("Data Cleared");
       setTimeout(() => setSuccessMsg(''), 3000);
    }
  };

  // --- FILTERS & DERIVED DATA ---
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

  // --- METRICS ---
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
    const checkStatus = (item, keywords) => { const status = (item['Primary Status'] || item['primarystatus'] || item['Description of Primary Status'] || '').toLowerCase(); return keywords.some(k => status.includes(k)); };
    const open = filteredInvData.filter(d => { const status = (d['Primary Status'] || d['primarystatus'] || '').toLowerCase(); return !status.includes('book') && !status.includes('allot') && !status.includes('block') && !status.includes('invoice'); }).length;
    const booked = filteredInvData.filter(d => checkStatus(d, ['allotted', 'booked', 'blocked'])).length;
    const ageing = filteredInvData.filter(d => parseInt(d['Ageing Days'] || d['ageingdays'] || '0') > 90).length;
    return [
      { label: 'Total Inventory', v1: 0, v2: total },
      { label: 'Open Inventory', v1: 0, v2: open, sub2: total ? Math.round((open/total)*100)+'%' : '-' },
      { label: 'Booked Inventory', v1: 0, v2: booked, sub2: total ? Math.round((booked/total)*100)+'%' : '-' },
      { label: 'Wholesale', v1: 0, v2: 0 },
      { label: 'Ageing (>90D)', v1: 0, v2: ageing },
    ];
  }, [filteredInvData]);

  const sourceStats = useMemo(() => {
    const sourceDataset = filteredLeadData.length > 0 ? filteredLeadData : filteredOppData;
    const currData = sourceDataset.filter(d => getMonthStr(d['createdon'] || d['createddate']) === timeLabels.currLabel);
    const counts = {};
    currData.forEach(d => { const s = d['source'] || 'Unknown'; counts[s] = (counts[s] || 0) + 1; });
    const sorted = Object.entries(counts).sort(([,a], [,b]) => b - a).slice(0, 6)
      .map(([label, val]) => ({ label, v1: 0, v2: val, sub2: currData.length ? Math.round((val/currData.length)*100)+'%' : '0%' }));
    return sorted.length ? sorted : [{label: 'No Data', v1:0, v2:0}];
  }, [filteredLeadData, filteredOppData, timeLabels]);

  // --- VIEWS ---
  const DashboardView = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 animate-fade-in">
       {/* Card 1: Sales Funnel */}
       <div className={`rounded-lg shadow-sm border p-4 flex flex-col h-full hover:shadow-md transition-shadow cursor-pointer bg-white border-slate-200`} onClick={() => { setDetailedMetric('Inquiries'); setViewMode('detailed'); }}>
          <div className="flex items-center gap-2 mb-4 border-b border-slate-100 pb-2">
            <div className="bg-blue-50 p-1.5 rounded text-blue-600"><LayoutDashboard className="w-4 h-4" /></div>
            <h3 className="font-bold text-slate-700">Sales Funnel</h3>
          </div>
          <ComparisonTable rows={funnelStats} headers={[timeLabels.prevLabel, timeLabels.currLabel]} timestamp={true} />
       </div>
       {/* Card 2: Inventory */}
       <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4 flex flex-col h-full hover:shadow-md transition-shadow">
          <div className="flex items-center gap-2 mb-4 border-b border-slate-100 pb-2">
            <div className="bg-indigo-50 p-1.5 rounded text-indigo-600"><Car className="w-4 h-4" /></div>
            <h3 className="font-bold text-slate-700">Inventory</h3>
          </div>
          <ComparisonTable rows={inventoryStats} headers={['', 'Total']} timestamp={true} />
       </div>
       {/* Card 3: Lead Source */}
       <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4 flex flex-col h-full hover:shadow-md transition-shadow">
          <div className="flex items-center gap-2 mb-4 border-b border-slate-100 pb-2">
            <div className="bg-emerald-50 p-1.5 rounded text-emerald-600"><TrendingUp className="w-4 h-4" /></div>
            <h3 className="font-bold text-slate-700">Lead Source</h3>
          </div>
          <ComparisonTable rows={sourceStats} headers={[timeLabels.prevLabel, timeLabels.currLabel]} timestamp={true} />
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
           ]} headers={[timeLabels.prevLabel, timeLabels.currLabel]} timestamp={true} />
       </div>
    </div>
  );

  const DetailedView = () => {
    const consultantMix = useMemo(() => {
        const counts = {};
        filteredOppData.forEach(d => { const c = d['Assigned To'] || d['assignedto']; if(c) counts[c] = (counts[c] || 0) + 1; });
        return Object.entries(counts).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value);
    }, [filteredOppData]);
    const modelMix = useMemo(() => {
        const counts = {};
        filteredOppData.forEach(d => { const m = d['modellinefe']; if(m) counts[m] = (counts[m] || 0) + 1; });
        return Object.entries(counts).map(([name, value]) => ({ name, value }));
    }, [filteredOppData]);

    return (
      <div className="space-y-6 animate-fade-in">
        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 flex items-center gap-3">
          <button onClick={() => setViewMode('dashboard')} className="p-1 hover:bg-slate-100 rounded">
             <ArrowDownRight className="w-5 h-5 text-slate-500 rotate-135" />
          </button>
          <div>
            <h2 className="text-xl font-bold text-blue-700 flex items-center gap-2">{detailedMetric} Analysis</h2>
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
          <h3 className="font-bold text-slate-700">Raw Data View</h3>
       </div>
       <div className="overflow-x-auto">
         <table className="w-full text-left text-xs text-slate-600">
           <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
             <tr><th className="p-3">ID</th><th className="p-3">Customer</th><th className="p-3">Mobile</th><th className="p-3">Model</th><th className="p-3">Date</th><th className="p-3">Status</th></tr>
           </thead>
           <tbody className="divide-y divide-slate-100">
             {(filteredOppData.length > 0 ? filteredOppData : (filteredLeadData.length > 0 ? filteredLeadData : filteredInvData)).slice(0, 50).map((row, idx) => (
               <tr key={idx} className="hover:bg-blue-50/30">
                 <td className="p-3 font-mono text-slate-500">{row['id'] || row['leadid'] || row['vin']}</td>
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
              {/* Storage Mode Indicator */}
              <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border ${storageMode === 'cloud' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-orange-50 text-orange-700 border-orange-200'}`}>
                 {storageMode === 'cloud' ? <Database className="w-3 h-3" /> : <HardDrive className="w-3 h-3" />}
                 {storageMode === 'cloud' ? 'Cloud' : 'Local'}
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
