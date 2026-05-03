'use client';

import { useState } from 'react';
import { Tab, Tabs, TabList, TabPanel } from 'react-tabs';
import 'react-tabs/style/react-tabs.css';  // Default styles

type TabId = 'dashboard' | 'secondbrain' | 'mentalfitness' | 'dailylearning';

interface NavProps {
  onNavigate: (tab: TabId) => void;
}

function Dashboard({ onNavigate }: NavProps) {
  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <div className="grid grid-cols-2 gap-4">
        <button 
          onClick={() => onNavigate('secondbrain')}
          className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-lg transition"
        >
          Second Brain
        </button>
        <button 
          onClick={() => onNavigate('mentalfitness')}
          className="bg-green-500 hover:bg-green-600 text-white px-6 py-3 rounded-lg transition"
        >
          Mental Fitness
        </button>
        <button 
          onClick={() => onNavigate('dailylearning')}
          className="bg-purple-500 hover:bg-purple-600 text-white px-6 py-3 rounded-lg transition"
        >
          Daily Learning
        </button>
      </div>
    </div>
  );
}

function SecondBrain() {
  return <div className="p-6"><h1>Second Brain</h1><p>Your notes and ideas.</p></div>;
}

function MentalFitness() {
  return <div className="p-6"><h1>Mental Fitness</h1><p>Track your mindset.</p></div>;
}

function DailyLearning() {
  return <div className="p-6"><h1>Daily Learning</h1><p>What you learned today.</p></div>;
}

export default function Shell() {
  const [tab, setTab] = useState<TabId>('dashboard');

  // Map TabId to index (0-based for react-tabs)
  const tabIndex = {
    dashboard: 0,
    secondbrain: 1,
    mentalfitness: 2,
    dailylearning: 3
  }[tab] ?? 0;

  const handleTabChange = (index: number) => {
    const idMap = ['dashboard', 'secondbrain', 'mentalfitness', 'dailylearning'];
    setTab(idMap[index] as TabId);
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <Tabs selectedIndex={tabIndex} onSelect={handleTabChange}>
        <TabList className="flex bg-white border-b shadow-sm">
          <Tab className="px-6 py-4 cursor-pointer hover:bg-gray-100 font-medium" selectedClassName="border-b-2 border-blue-500 text-blue-600 bg-blue-50">
            Dashboard
          </Tab>
          <Tab className="px-6 py-4 cursor-pointer hover:bg-gray-100 font-medium" selectedClassName="border-b-2 border-blue-500 text-blue-600 bg-blue-50">
            Second Brain
          </Tab>
          <Tab className="px-6 py-4 cursor-pointer hover:bg-gray-100 font-medium" selectedClassName="border-b-2 border-blue-500 text-blue-600 bg-blue-50">
            Mental Fitness
          </Tab>
          <Tab className="px-6 py-4 cursor-pointer hover:bg-gray-100 font-medium" selectedClassName="border-b-2 border-blue-500 text-blue-600 bg-blue-50">
            Daily Learning
          </Tab>
        </TabList>

        <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <TabPanel>
            <Dashboard onNavigate={setTab} />
          </TabPanel>
          <TabPanel>
            <SecondBrain />
          </TabPanel>
          <TabPanel>
            <MentalFitness />
          </TabPanel>
          <TabPanel>
            <DailyLearning />
          </TabPanel>
        </div>
      </Tabs>
    </div>
  );
}
