'use client';

import { useState } from 'react';

// Define TabId explicitly - add your exact tabs here
type TabId = 'dashboard' | 'secondbrain' | 'mentalfitness' | 'dailylearning';

interface DashboardProps {
  onNavigate: (tab: TabId) => void;  // Fixed: expects TabId only
}

function Dashboard({ onNavigate }: DashboardProps) {
  // Inside Dashboard, ALWAYS pass TabId literals (never variables that could be any string)
  const goToSecondBrain = () => onNavigate('secondbrain');
  const goToMentalFitness = () => onNavigate('mentalfitness');

  return (
    <div className="p-4">
      {/* Your existing Dashboard content */}
      <button 
        onClick={goToSecondBrain}
        className="bg-blue-500 text-white px-4 py-2 rounded"
      >
        Go to Second Brain
      </button>
      <button 
        onClick={goToMentalFitness}
        className="bg-green-500 text-white px-4 py-2 rounded ml-2"
      >
        Mental Fitness
      </button>
      {/* TypeScript now happy - no string inference issues */}
    </div>
  );
}

function SecondBrain() {
  return <div>Second Brain content</div>;
}

function MentalFitness() {
  return <div>Mental Fitness content</div>;
}

function DailyLearning() {
  return <div>Daily Learning content</div>;
}

export default function Shell() {
  const [tab, setTab] = useState<TabId>('dashboard');

  return (
    <div className="h-screen flex flex-col">
      {/* Your tabs component - assuming react-tabs or similar */}
      <div className="tabs-header p-4 bg-gray-100 border-b">
        <button 
          className={tab === 'dashboard' ? 'font-bold text-blue-600' : ''}
          onClick={() => setTab('dashboard')}
        >
          Dashboard
        </button>
        <button 
          className={tab === 'secondbrain' ? 'font-bold text-blue-600' : ''}
          onClick={() => setTab('secondbrain')}
        >
          Second Brain
        </button>
        {/* Add other tab buttons */}
      </div>

      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {tab === 'dashboard' && <Dashboard onNavigate={setTab} />}
        {tab === 'secondbrain' && <SecondBrain />}
        {tab === 'mentalfitness' && <MentalFitness />}
        {tab === 'dailylearning' && <DailyLearning />}
      </div>
    </div>
  );
}
