"use client";
import { useState } from "react";
import Sidebar, { TabId } from "./Sidebar";
import Dashboard from "./tabs/Dashboard";
import SecondBrain from "./tabs/SecondBrain";
import MentalFitness from "./tabs/MentalFitness";
import DailyLearning from "./tabs/DailyLearning";
import CRM from "./tabs/CRM";
import SocialMedia from "./tabs/SocialMedia";
import Tools from "./tabs/Tools";

export default function Shell() {
  const [tab, setTab] = useState<TabId>("dashboard");

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: "#f0f2f5" }}>
      <Sidebar active={tab} onChange={setTab} />
      <main style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {tab === "dashboard" && <Dashboard onNavigate={(t) => setTab(t as TabId)} />}
        {tab === "brain"     && <SecondBrain />}
        {tab === "mental"    && <MentalFitness />}
        {tab === "learning"  && <DailyLearning />}
        {tab === "crm"       && <CRM />}
        {tab === "social"    && <SocialMedia />}
        {tab === "tools"     && <Tools />}
      </main>
    </div>
  );
}
