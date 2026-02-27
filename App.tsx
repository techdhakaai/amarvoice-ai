import React, { useState } from 'react';
import { AppView, BusinessConfig, SentimentPoint } from './types';
import VoiceInterface from './components/VoiceInterface';

const SENTIMENT_DATA: SentimentPoint[] = [
  { day: 'Sat', positive: 70, negative: 30 },
  { day: 'Sun', positive: 85, negative: 15 },
  { day: 'Mon', positive: 65, negative: 35 },
  { day: 'Tue', positive: 90, negative: 10 },
  { day: 'Wed', positive: 88, negative: 12 },
  { day: 'Thu', positive: 72, negative: 28 },
  { day: 'Fri', positive: 95, negative: 5 }
];

const KEYWORDS = ["বিকাশ", "ডেলিভারি", "রিটার্ন", "অর্ডার", "দেরি", "ধন্যবাদ", "প্রাইস"];

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<AppView>(AppView.DASHBOARD);
  const [showVoiceInterface, setShowVoiceInterface] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  const [config, setConfig] = useState<BusinessConfig>({
    shopName: 'Deshi Bazar',
    deliveryInsideDhaka: 60,
    deliveryOutsideDhaka: 120,
    paymentMethods: ['bKash', 'Nagad', 'Cash on Delivery'],
    returnPolicy: '7-day return if the product is defective.',
    bkashNumber: '01700000000',
    personaTone: 'formal', // Set to formal as requested
    subscriptionStatus: 'trial',
    monthlyLimit: 100,
    usageCount: 24
  });

  const handleConfigChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setConfig(prev => ({ ...prev, [name]: value }));
  };

  return (
    <div className="min-h-screen flex bg-slate-50 font-sans">
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 text-white flex flex-col transform transition-transform duration-300 lg:relative lg:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-10">
          <h1 className="text-2xl font-black italic flex items-center gap-3">
            <span className="bg-indigo-500 w-8 h-8 rounded-lg flex items-center justify-center not-italic text-sm">AV</span> AMAR VOICE
          </h1>
        </div>
        <nav className="flex-1 px-6 space-y-2">
          {[
            { view: AppView.DASHBOARD, icon: 'fa-grid-2', label: 'Overview' },
            { view: AppView.VOICE_AGENT, icon: 'fa-microphone', label: 'Agent Control' },
            { view: AppView.MARKET_INSIGHTS, icon: 'fa-chart-line', label: 'Market Insights' },
            { view: AppView.SETUP, icon: 'fa-wand-magic-sparkles', label: 'How To Setup' },
            { view: AppView.SETTINGS, icon: 'fa-sliders', label: 'Knowledge Base' },
            { view: AppView.SUBSCRIPTION, icon: 'fa-credit-card', label: 'Billing' }
          ].map(item => (
            <button key={item.view} onClick={() => { setCurrentView(item.view); setIsSidebarOpen(false); }} className={`w-full text-left px-5 py-3.5 rounded-2xl flex items-center gap-4 transition-all ${currentView === item.view ? 'bg-white/10 text-white border border-white/10' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
              <i className={`fa-solid ${item.icon} text-xs`}></i> <span className="font-bold text-sm">{item.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setIsSidebarOpen(false)}></div>}

      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="h-20 bg-white border-b border-slate-200 flex items-center justify-between px-10 shrink-0">
          <div className="flex items-center gap-4">
            <button className="lg:hidden text-slate-600" onClick={() => setIsSidebarOpen(true)}>
              <i className="fa-solid fa-bars"></i>
            </button>
            <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest">{currentView.replace(/_/g, ' ')}</h2>
          </div>
          <button onClick={() => setShowVoiceInterface(true)} className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-bold text-sm shadow-xl shadow-indigo-600/20 active:scale-95 transition-all">Live Test Agent</button>
        </header>

        <div className="flex-1 overflow-y-auto p-10 scrollbar-hide">
          {currentView === AppView.DASHBOARD && (
            <div className="space-y-10 animate-in fade-in duration-700">
               <div className="bg-slate-900 rounded-[40px] p-12 text-white flex justify-between items-center relative overflow-hidden group">
                  <div className="relative z-10">
                    <h1 className="text-4xl font-black mb-4">Hello, {config.shopName}!</h1>
                    <p className="text-slate-400 font-medium max-w-lg leading-relaxed">Your AI Agent managed 24 calls today with a 98% satisfaction rate.</p>
                  </div>
                  <div className="hidden lg:flex w-24 h-24 bg-white/5 rounded-full items-center justify-center border border-white/10 hover:scale-110 transition-transform">
                     <i className="fa-solid fa-bolt-lightning text-3xl text-indigo-400"></i>
                  </div>
               </div>

               <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                  <div className="bg-white p-10 rounded-[40px] border border-slate-100 shadow-sm">
                    <h3 className="text-xl font-black mb-6">Integration Health</h3>
                    <div className="space-y-4">
                       <div className="flex items-center justify-between p-5 bg-green-50 rounded-3xl border border-green-100">
                          <span className="text-sm font-black text-green-700">LIVE SERVER ACTIVE</span>
                          <span className="text-[10px] font-bold text-green-600">9ms Latency</span>
                       </div>
                       <div className="bg-slate-950 p-6 rounded-3xl font-mono text-[10px] text-indigo-300 relative group overflow-hidden">
                          <code>{`<script src="https://api.amarvoice.com/v2/bot.js?id=deshibazar"></script>`}</code>
                       </div>
                    </div>
                  </div>
                  <div className="bg-white p-10 rounded-[40px] border border-slate-100 shadow-sm relative group cursor-pointer" onClick={() => setCurrentView(AppView.MARKET_INSIGHTS)}>
                     <h3 className="text-xl font-black mb-2">Sentiment Alert</h3>
                     <p className="text-slate-500 text-sm mb-6">"Customers are asking for faster delivery in Chittagong."</p>
                     <div className="flex items-end gap-2 h-24">
                        {SENTIMENT_DATA.slice(-5).map(d => (
                          <div key={d.day} className="flex-1 bg-indigo-500 rounded-t-lg transition-all hover:bg-orange-500" style={{ height: `${d.positive}%` }}></div>
                        ))}
                     </div>
                  </div>
               </div>
            </div>
          )}

          {currentView === AppView.MARKET_INSIGHTS && (
            <div className="space-y-10 animate-in fade-in duration-500">
               <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  <div className="lg:col-span-2 bg-white p-10 rounded-[40px] border border-slate-100 shadow-sm">
                    <h3 className="text-xl font-black mb-8">Voice Sentiment Analysis</h3>
                    <div className="h-64 flex items-end gap-4 border-b border-slate-100 pb-2">
                       {SENTIMENT_DATA.map(d => (
                         <div key={d.day} className="flex-1 flex flex-col justify-end group relative">
                            <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-2 py-1 rounded text-[10px] opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">{d.positive}% Positive</div>
                            <div className="w-full bg-slate-100 rounded-t-xl overflow-hidden flex flex-col-reverse" style={{ height: '100%' }}>
                               <div className="w-full bg-red-400" style={{ height: `${d.negative}%` }}></div>
                               <div className="w-full bg-indigo-500" style={{ height: `${d.positive}%` }}></div>
                            </div>
                            <p className="text-[10px] font-black text-slate-400 text-center mt-3 uppercase tracking-widest">{d.day}</p>
                         </div>
                       ))}
                    </div>
                    <div className="mt-8 flex gap-6">
                       <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-indigo-500"></div> <span className="text-xs font-bold text-slate-500">Positive</span></div>
                       <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-red-400"></div> <span className="text-xs font-bold text-slate-500">Negative</span></div>
                    </div>
                  </div>
                  
                  <div className="bg-white p-10 rounded-[40px] border border-slate-100 shadow-sm flex flex-col">
                    <h3 className="text-xl font-black mb-8">Popular Keywords</h3>
                    <div className="flex flex-wrap gap-2">
                       {KEYWORDS.map((k, i) => (
                         <span key={k} className={`px-4 py-2 rounded-2xl font-black transition-all hover:scale-110 cursor-default ${i === 0 ? 'bg-orange-100 text-orange-600 text-lg' : i === 1 ? 'bg-indigo-100 text-indigo-600 text-md' : 'bg-slate-100 text-slate-600 text-xs'}`}>{k}</span>
                       ))}
                    </div>
                    <div className="mt-auto pt-10">
                       <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">Trend Analysis</p>
                       <p className="text-sm font-bold text-slate-700 leading-relaxed">Payment inquiries increased by <span className="text-green-600">+12%</span> this week. Recommend adding "Nagad" support.</p>
                    </div>
                  </div>
               </div>
            </div>
          )}

          {currentView === AppView.SETTINGS && (
            <div className="bg-white p-10 rounded-[40px] border border-slate-100 shadow-sm max-w-4xl animate-in fade-in duration-500">
               <h3 className="text-2xl font-black mb-10">Business Configuration</h3>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                  <div className="space-y-6">
                    <div>
                      <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2 block">Shop Name</label>
                      <input name="shopName" value={config.shopName} onChange={handleConfigChange} className="w-full px-5 py-3 rounded-2xl border border-slate-200 focus:border-indigo-500 outline-none transition-all font-bold" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2 block">Delivery Dhaka</label>
                        <input name="deliveryInsideDhaka" type="number" value={config.deliveryInsideDhaka} onChange={handleConfigChange} className="w-full px-5 py-3 rounded-2xl border border-slate-200 focus:border-indigo-500 outline-none transition-all font-bold" />
                      </div>
                      <div>
                        <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2 block">Delivery Outside</label>
                        <input name="deliveryOutsideDhaka" type="number" value={config.deliveryOutsideDhaka} onChange={handleConfigChange} className="w-full px-5 py-3 rounded-2xl border border-slate-200 focus:border-indigo-500 outline-none transition-all font-bold" />
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2 block">bKash Merchant Number</label>
                      <input name="bkashNumber" value={config.bkashNumber} onChange={handleConfigChange} className="w-full px-5 py-3 rounded-2xl border border-slate-200 focus:border-indigo-500 outline-none transition-all font-bold" />
                    </div>
                  </div>
                  <div className="space-y-6">
                    <div>
                      <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2 block">Persona Tone</label>
                      <select name="personaTone" value={config.personaTone} onChange={handleConfigChange} className="w-full px-5 py-3 rounded-2xl border border-slate-200 focus:border-indigo-500 outline-none transition-all font-bold">
                        <option value="formal">Formal & Polite</option>
                        <option value="friendly">Friendly & Casual</option>
                        <option value="enthusiastic">High Energy</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2 block">Return Policy</label>
                      <textarea name="returnPolicy" value={config.returnPolicy} onChange={handleConfigChange} rows={4} className="w-full px-5 py-3 rounded-2xl border border-slate-200 focus:border-indigo-500 outline-none transition-all font-bold resize-none" />
                    </div>
                  </div>
               </div>
            </div>
          )}

          {/* Placeholder views for other types */}
          {(currentView === AppView.VOICE_AGENT || currentView === AppView.SUBSCRIPTION || currentView === AppView.SETUP) && (
             <div className="flex flex-col items-center justify-center h-full text-center space-y-6 opacity-60">
                <i className="fa-solid fa-screwdriver-wrench text-6xl text-slate-200"></i>
                <h3 className="text-xl font-black text-slate-400 uppercase tracking-widest">Section under development</h3>
                <button onClick={() => setCurrentView(AppView.DASHBOARD)} className="text-indigo-600 font-black uppercase text-xs">Back to Dashboard</button>
             </div>
          )}
        </div>
      </main>

      {showVoiceInterface && (
        <VoiceInterface 
          config={config} 
          onClose={() => setShowVoiceInterface(false)} 
        />
      )}
    </div>
  );
};

export default App;