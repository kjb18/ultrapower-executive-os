'use client';

import { useState } from 'react';

type TabId = 'dashboard' | 'secondbrain' | 'mentalfitness' | 'dailylearning';

interface NavProps {
  onNavigate: (tab: TabId) => void;
}

function Dashboard({ onNavigate }: NavProps) {
  return (
    <div className="p-6 space-y-6">
      <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
      <p className="text-gray-600">Ultra Power Industrial Control Center</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <button 
          onClick={() => onNavigate('secondbrain')}
          className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white px-8 py-4 rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 font-medium"
        >
          → Second Brain
        </button>
        <button 
          onClick={() => onNavigate('mentalfitness')}
          className="bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white px-8 py-4 rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 font-medium"
        >
          → Mental Fitness
        </button>
        <button 
          onClick={() => onNavigate('dailylearning')}
          className="bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white px-8 py-4 rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 font-medium col-span-1 md:col-span-2"
        >
          → Daily Learning
        </button>
      </div>
    </div>
  );
}

function SecondBrain() {
  return <div className="p-8 bg-gradient-to-br from-indigo-50 to-purple-50 min-h-full"><h1 className="text-3xl font-bold mb-4">Second Brain</h1><p className="text-lg text-gray-700">Organize your knowledge base here.</p></div>;
}

function MentalFitness() {
  return <div className="p-8 bg-gradient-to-br from-green-50 to-emerald-50 min-h-full"><h1 className="text-3xl font-bold mb-4">Mental Fitness</h1><p className="text-lg text-gray-700">Track mood, focus, energy.</p></div>;
}

function DailyLearning() {
  return <div className="p-8 bg-gradient-to-br from-orange-50 to-yellow-50 min-h-full"><h1 className="text-3xl font-bold mb-4">Daily Learning</h1><p className="text-lg text-gray-700">What you learned today.</p></div>;
}

export default function Shell() {
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const tabs: Array<{ id: TabId; label: string; color: string }> = [
    { id: 'dashboard', label: 'Dashboard', color: 'from-blue-500' },
    { id: 'secondbrain', label: 'Second Brain', color: 'from-indigo-500' },
    { id: 'mentalfitness', label: 'Mental Fitness', color: 'from-emerald-500' },
    { id: 'dailylearning', label: 'Daily Learning', color: 'from-purple-500' },
  ];

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-gray-50 to-gray-100 overflow-hidden">
      <nav className="bg-white/80 backdrop-blur-md border-b border-gray-200 shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-1 py-4">
            {tabs.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`px-6 py-3 font-medium text-sm rounded-t-lg transition-all duration-200 ${
                  activeTab === id
                    ? 'bg-white text-gray-900 shadow-sm border-b-2 border-blue-500 -mb-px z-20'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      <div className="flex-1 overflow-hidden" style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {activeTab === 'dashboard' && <Dashboard onNavigate={setActiveTab} />}
        {activeTab === 'secondbrain' && <SecondBrain />}
        {activeTab === 'mentalfitness' && <MentalFitness />}
        {activeTab === 'dailylearning' && <DailyLearning />}
      </div>
    </div>
  );
}
