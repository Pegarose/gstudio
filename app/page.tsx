"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { appConfig } from "@/config/app.config";

interface Project {
  id: string;
  name: string;
  targetUrl: string;
  style: string;
  planningModel: string;
  coderModel: string;
  status: "active" | "completed" | "progress";
  updatedAt: string;
  colorTheme: string; // CSS gradient class
}

export default function HomePage() {
  const router = useRouter();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  
  // New Project Form States
  const [modalTab, setModalTab] = useState<"clone" | "scratch">("clone");
  const [projectName, setProjectName] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [selectedStyle, setSelectedStyle] = useState("4"); // Minimalist default
  const [planningModel, setPlanningModel] = useState("gpt-5.5"); // default TR4 model
  const [coderModel, setCoderModel] = useState("kimi-k2.7-code"); // default coding model
  const [additionalInstructions, setAdditionalInstructions] = useState("");
  
  // Mock Workspace Projects
  const [projects, setProjects] = useState<Project[]>([
    {
      id: "1",
      name: "Linear Landing Page",
      targetUrl: "https://linear.app",
      style: "Minimalist",
      planningModel: "google/gemini-3-pro-preview",
      coderModel: "moonshotai/kimi-k2-instruct-0905",
      status: "completed",
      updatedAt: "2 hours ago",
      colorTheme: "from-indigo-600/30 to-purple-600/10"
    },
    {
      id: "2",
      name: "Stripe Billing Portal",
      targetUrl: "https://stripe.com/billing",
      style: "Glassmorphism",
      planningModel: "anthropic/claude-sonnet-4-20250514",
      coderModel: "openai/gpt-5",
      status: "active",
      updatedAt: "Yesterday",
      colorTheme: "from-emerald-600/30 to-teal-600/10"
    },
    {
      id: "3",
      name: "Vercel Analytics Dashboard",
      targetUrl: "https://vercel.com/analytics",
      style: "Dark Mode",
      planningModel: "google/gemini-3-pro-preview",
      coderModel: "moonshotai/kimi-k2-instruct-0905",
      status: "completed",
      updatedAt: "3 days ago",
      colorTheme: "from-zinc-700/40 to-neutral-900/20"
    },
    {
      id: "4",
      name: "Airbnb Search Flow",
      targetUrl: "https://airbnb.com",
      style: "Neumorphism",
      planningModel: "openai/gpt-5",
      coderModel: "openai/gpt-5",
      status: "progress",
      updatedAt: "Last week",
      colorTheme: "from-rose-500/30 to-orange-600/10"
    }
  ]);

  useEffect(() => {
    fetch('/api/projects')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.projects) {
          const dbProjects = data.projects.map((p: any) => ({
            id: String(p.id),
            name: p.name,
            targetUrl: p.target_url,
            style: p.style,
            planningModel: p.planning_model,
            coderModel: p.coder_model,
            status: p.status || 'active',
            updatedAt: new Date(p.created_at).toLocaleDateString(),
            colorTheme: "from-blue-600/30 to-indigo-600/10"
          }));
          setProjects(dbProjects);
        }
      })
      .catch(err => console.error("Error loading projects:", err));
  }, []);

  const styles = [
    { id: "1", name: "Glassmorphism", desc: "Frosted glass and gradients" },
    { id: "2", name: "Neumorphism", desc: "Soft shadows and 3D depth" },
    { id: "3", name: "Brutalism", desc: "Bold, raw and high contrast" },
    { id: "4", name: "Minimalist", desc: "Clean layout, elegant typography" },
    { id: "5", name: "Dark Mode", desc: "Sleek and aesthetic dark theme" },
    { id: "6", name: "Gradient Rich", desc: "Vibrant colors and animation" }
  ];

  const models = appConfig.ai.availableModels.map(m => ({
    id: m,
    name: appConfig.ai.modelDisplayNames[m] || m
  }));

  const validateUrl = (urlString: string) => {
    if (!urlString) return false;
    const urlPattern = /^(https?:\/\/)?([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(\/.*)?$/;
    return urlPattern.test(urlString.trim());
  };

  const handleLaunchProject = (e: React.FormEvent) => {
    e.preventDefault();

    if (!projectName.trim()) {
      toast.error("Please enter a project name");
      return;
    }

    const finalUrl = modalTab === "clone" ? targetUrl.trim() : "scratch://new-project";
    
    if (modalTab === "clone") {
      if (!finalUrl || !validateUrl(finalUrl)) {
        toast.error("Please enter a valid URL (e.g., https://example.com)");
        return;
      }
    } else {
      if (!additionalInstructions.trim()) {
        toast.error("Please describe what you would like to build");
        return;
      }
    }

    sessionStorage.removeItem("projectId"); // Clear any previous project ID for new creations
    sessionStorage.setItem("targetUrl", finalUrl);
    sessionStorage.setItem("selectedStyle", selectedStyle);
    sessionStorage.setItem("selectedModel", coderModel);
    sessionStorage.setItem("selectedPlanningModel", planningModel);
    sessionStorage.setItem("selectedCoderModel", coderModel);
    sessionStorage.setItem("projectName", projectName.trim());
    sessionStorage.setItem("additionalInstructions", additionalInstructions.trim());
    sessionStorage.setItem("autoStart", "true");

    toast.success(modalTab === "clone" ? "Initializing website clone..." : "Initializing blank project from scratch...");
    router.push("/generation");
  };

  const openExistingProject = (project: Project) => {
    sessionStorage.setItem("projectId", project.id);
    sessionStorage.setItem("targetUrl", project.targetUrl);
    sessionStorage.setItem("selectedStyle", project.style.toLowerCase());
    sessionStorage.setItem("selectedModel", project.coderModel);
    sessionStorage.setItem("selectedPlanningModel", project.planningModel);
    sessionStorage.setItem("selectedCoderModel", project.coderModel);
    sessionStorage.setItem("projectName", project.name);
    sessionStorage.setItem("autoStart", "true");
    
    toast.success(`Resuming project: ${project.name}`);
    router.push("/generation");
  };

  const filteredProjects = projects.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.targetUrl.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div 
      className="min-h-screen bg-neutral-950 text-neutral-100 font-sans antialiased"
      style={{ display: "flex", minHeight: "100vh" }}
    >
      {/* FIXED WIDTH SIDEBAR */}
      <aside 
        className="bg-neutral-900/60 border-r border-neutral-900 flex flex-col justify-between"
        style={{ width: "260px", minWidth: "260px", flexShrink: 0, height: "100vh", position: "sticky", top: 0 }}
      >
        <div>
          {/* Logo & Brand */}
          <div className="p-20 border-b border-neutral-800/80 flex items-center gap-12">
            <div className="w-8 h-8 rounded-lg bg-orange-600 flex items-center justify-center font-bold text-white shadow-lg shadow-orange-600/35 flex-shrink-0">
              G
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-bold tracking-tight text-white truncate">G Studio</h1>
              <span className="text-[9px] uppercase tracking-wider text-neutral-500 font-bold block">Enterprise Workspace</span>
            </div>
          </div>

          {/* Navigation Menu */}
          <nav className="p-12 space-y-4">
            <button className="w-full flex items-center gap-10 px-12 py-10 rounded-lg text-xs font-semibold bg-neutral-800/80 text-white transition-all">
              <svg className="w-4 h-4 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
              My Projects
            </button>
            <button className="w-full flex items-center gap-10 px-12 py-10 rounded-lg text-xs font-semibold text-neutral-500 transition-all cursor-not-allowed" disabled>
              <svg className="w-4 h-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              Team Collaborators
              <span className="text-[9px] bg-neutral-900 border border-neutral-800/80 text-neutral-600 px-6 py-1 rounded ml-auto font-bold">Mock</span>
            </button>
            <button className="w-full flex items-center gap-10 px-12 py-10 rounded-lg text-xs font-semibold text-neutral-500 transition-all cursor-not-allowed" disabled>
              <svg className="w-4 h-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              </svg>
              Workspace Settings
            </button>
          </nav>
        </div>

        {/* User Card at Footer */}
        <div className="p-12 border-t border-neutral-800/80">
          <div className="flex items-center gap-10 bg-neutral-900/80 p-8 rounded-lg border border-neutral-800/40">
            <div className="w-7 h-7 rounded-full bg-neutral-800 flex items-center justify-center font-bold text-neutral-400 text-xs">
              D
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold text-neutral-200 truncate">Developer</p>
              <p className="text-[9px] text-neutral-500 truncate">corp@company.internal</p>
            </div>
          </div>
        </div>
      </aside>

      {/* MAIN DASHBOARD */}
      <main 
        className="flex flex-col min-w-0" 
        style={{ flex: 1, minWidth: 0, height: "100vh", overflowY: "auto" }}
      >
        {/* Header bar */}
        <header className="h-16 border-b border-neutral-900 flex items-center justify-between px-24 bg-neutral-950/20 backdrop-blur sticky top-0 z-[10]">
          <div className="flex-1 max-w-xs">
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search projects..."
                className="w-full bg-neutral-900/60 border border-neutral-800/80 rounded-lg py-6 pl-28 pr-12 text-xs font-semibold placeholder:text-neutral-600 focus:outline-none focus:border-neutral-700 text-white transition-all"
              />
              <svg className="w-3.5 h-3.5 text-neutral-600 absolute left-8 top-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>

          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-6 bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs px-12 py-8 rounded-lg shadow-md shadow-orange-600/10 active:scale-[0.98] transition-all"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            New Project
          </button>
        </header>

        {/* Dashboard Content */}
        <div className="p-24 md:p-32 max-w-[1100px] w-full mx-auto">
          <div className="flex items-baseline justify-between mb-20">
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">Active Projects</h2>
              <p className="text-xs text-neutral-500 mt-2">Manage and iterate on company web applications built from scraped resources.</p>
            </div>
            <span className="text-[10px] bg-neutral-900 border border-neutral-800 text-neutral-400 px-8 py-3 rounded-full font-bold">
              {filteredProjects.length} Projects
            </span>
          </div>

          {filteredProjects.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-16">
              {filteredProjects.map(project => (
                <div
                  key={project.id}
                  onClick={() => openExistingProject(project)}
                  className="group bg-neutral-900/30 border border-neutral-900 hover:border-neutral-800 rounded-xl overflow-hidden cursor-pointer hover:shadow-lg hover:shadow-black/20 transition-all duration-300 flex flex-col"
                >
                  {/* CSS Browser Window Mockup (Replaces placehold.co images) */}
                  <div className="relative w-full h-[120px] bg-neutral-950 border-b border-neutral-900 flex flex-col">
                    {/* Browser Mock Top Bar */}
                    <div className="h-8 bg-neutral-900/70 border-b border-neutral-950 flex items-center px-12 justify-between flex-shrink-0">
                      {/* Window Controls */}
                      <div className="flex gap-4">
                        <span className="w-2.5 h-2.5 rounded-full bg-neutral-800 group-hover:bg-red-500/80 transition-colors" />
                        <span className="w-2.5 h-2.5 rounded-full bg-neutral-800 group-hover:bg-amber-500/80 transition-colors" />
                        <span className="w-2.5 h-2.5 rounded-full bg-neutral-800 group-hover:bg-emerald-500/80 transition-colors" />
                      </div>
                      
                      {/* Mock URL Path */}
                      <div className="bg-neutral-950 border border-neutral-800/40 rounded px-16 py-2 text-[9px] text-neutral-500 font-semibold tracking-wide w-44 truncate text-center">
                        {project.targetUrl.replace(/^https?:\/\//i, "")}
                      </div>

                      <div className="w-12" /> {/* spacer */}
                    </div>

                    {/* Stylized Mock Web Content */}
                    <div className={`flex-1 bg-gradient-to-br ${project.colorTheme} p-12 flex flex-col justify-between relative overflow-hidden`}>
                      <div className="space-y-4">
                        <div className="w-16 h-2 rounded bg-white/20" />
                        <div className="w-28 h-3 rounded bg-white/10" />
                      </div>
                      
                      <div className="flex gap-4 self-end">
                        <div className="w-10 h-4 rounded bg-white/5" />
                        <div className="w-8 h-4 rounded bg-white/10" />
                      </div>

                      {/* Status badge in preview */}
                      <div className="absolute top-8 right-8">
                        <span className={`inline-flex items-center gap-4 px-8 py-2 rounded-full text-[9px] font-bold tracking-wide uppercase border ${
                          project.status === "completed" 
                            ? "bg-emerald-950/70 border-emerald-900/60 text-emerald-400"
                            : project.status === "active"
                            ? "bg-blue-950/70 border-blue-900/60 text-blue-400"
                            : "bg-amber-950/70 border-amber-900/60 text-amber-400"
                        }`}>
                          <span className={`w-1 h-1 rounded-full ${
                            project.status === "completed" 
                              ? "bg-emerald-400 animate-pulse" 
                              : project.status === "active"
                              ? "bg-blue-400 animate-pulse"
                              : "bg-amber-400 animate-pulse"
                          }`} />
                          {project.status}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Card Details (Highly Compact & Beautiful) */}
                  <div className="p-16 flex-1 flex flex-col justify-between">
                    <div>
                      <h3 className="text-xs font-bold text-white group-hover:text-orange-500 transition-colors truncate">{project.name}</h3>
                      <p className="text-[10px] text-neutral-500 truncate mt-2">{project.targetUrl}</p>
                    </div>

                    <div className="mt-12 pt-12 border-t border-neutral-900 space-y-4">
                      <div className="flex justify-between text-[10px]">
                        <span className="text-neutral-500">Style:</span>
                        <span className="text-neutral-300 font-bold">{project.style}</span>
                      </div>
                      <div className="flex justify-between text-[10px]">
                        <span className="text-neutral-500">Models:</span>
                        <span className="text-neutral-300 font-bold truncate max-w-[120px]">
                          {appConfig.ai.modelDisplayNames[project.planningModel]?.replace(/\(.*\)/, "") || "Gemini"} / {appConfig.ai.modelDisplayNames[project.coderModel]?.replace(/\(.*\)/, "") || "Kimi"}
                        </span>
                      </div>
                      <div className="flex justify-between text-[9px] pt-2">
                        <span className="text-neutral-500">Last updated:</span>
                        <span className="text-neutral-400">{project.updatedAt}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-48 border border-dashed border-neutral-800 rounded-xl bg-neutral-900/10">
              <svg className="w-10 h-10 text-neutral-700 mx-auto mb-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <h3 className="text-xs font-bold text-white">No projects found</h3>
              <p className="text-[10px] text-neutral-500 mt-2">Create a new project with scraped source code to begin.</p>
              <button
                onClick={() => setIsModalOpen(true)}
                className="mt-16 inline-flex items-center gap-6 bg-neutral-900 hover:bg-neutral-805 border border-neutral-800 text-white px-12 py-8 rounded-lg text-[10px] font-semibold"
              >
                + New Project
              </button>
            </div>
          )}
        </div>
      </main>

      {/* CREATE NEW PROJECT MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[200] flex items-center justify-center p-16">
          <div className="bg-neutral-900 border border-neutral-800 w-full max-w-xl rounded-2xl shadow-2xl shadow-black overflow-hidden flex flex-col animate-scale-up">
            {/* Modal Header */}
            <div className="px-20 py-16 border-b border-neutral-800 flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">Initialize Enterprise Project</h3>
                <p className="text-[10px] text-neutral-400 mt-1">Configure models for architectural planning & component coding.</p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-neutral-500 hover:text-white p-6 hover:bg-neutral-850 rounded-lg transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleLaunchProject} className="p-20 space-y-16 flex-1 overflow-y-auto max-h-[500px]">
              {/* Segmented Control for Mode selection */}
              <div className="flex bg-neutral-950 p-4 rounded-lg border border-neutral-850">
                <button
                  type="button"
                  onClick={() => setModalTab("clone")}
                  className={`flex-1 text-center py-6 text-xs font-bold rounded-md transition-all ${
                    modalTab === "clone"
                      ? "bg-neutral-800 text-white"
                      : "text-neutral-500 hover:text-neutral-300"
                  }`}
                >
                  Clone Website
                </button>
                <button
                  type="button"
                  onClick={() => setModalTab("scratch")}
                  className={`flex-1 text-center py-6 text-xs font-bold rounded-md transition-all ${
                    modalTab === "scratch"
                      ? "bg-neutral-800 text-white"
                      : "text-neutral-500 hover:text-neutral-300"
                  }`}
                >
                  Build From Scratch
                </button>
              </div>

              {/* Project Name & Target URL */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                <div className="space-y-4">
                  <label className="text-[10px] font-bold tracking-wide uppercase text-neutral-500">Project Name</label>
                  <input
                    type="text"
                    required
                    value={projectName}
                    onChange={e => setProjectName(e.target.value)}
                    placeholder={modalTab === "clone" ? "Acme UI Portal" : "Acme Todo App"}
                    className="w-full bg-neutral-950 border border-neutral-805 rounded-lg px-10 py-8 text-xs font-medium placeholder:text-neutral-600 focus:outline-none focus:border-neutral-700 text-white"
                  />
                </div>
                {modalTab === "clone" ? (
                  <div className="space-y-4">
                    <label className="text-[10px] font-bold tracking-wide uppercase text-neutral-500">URL to Scrape & Clone</label>
                    <input
                      type="text"
                      required
                      value={targetUrl}
                      onChange={e => setTargetUrl(e.target.value)}
                      placeholder="https://example.com"
                      className="w-full bg-neutral-950 border border-neutral-850 rounded-lg px-10 py-8 text-xs font-medium placeholder:text-neutral-600 focus:outline-none focus:border-neutral-700 text-white"
                    />
                  </div>
                ) : (
                  <div className="space-y-4 flex flex-col justify-end">
                    <label className="text-[10px] font-bold tracking-wide uppercase text-neutral-500">Blank Canvas Mode</label>
                    <div className="bg-neutral-950 border border-neutral-850 rounded-lg px-10 py-8 text-xs font-semibold text-neutral-500 italic">
                      Bypassing scraper - creating a clean canvas
                    </div>
                  </div>
                )}
              </div>

              {/* TASK-SPECIFIC MODEL SELECTORS */}
              <div className="bg-neutral-950 p-12 rounded-xl border border-neutral-850 space-y-12">
                <div className="flex items-center gap-6 pb-6 border-b border-neutral-900">
                  <svg className="w-3.5 h-3.5 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  </svg>
                  <span className="text-[10px] font-bold text-neutral-300 uppercase tracking-wide">Custom Model Roles</span>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                  {/* Planning model */}
                  <div className="space-y-4">
                    <div className="flex justify-between items-baseline">
                      <label className="text-[9px] font-semibold text-neutral-400">1. Intent / Planning Model</label>
                      <span className="text-[8px] bg-neutral-900 text-neutral-500 px-4 py-1 rounded font-bold uppercase">Architect</span>
                    </div>
                    <select
                      value={planningModel}
                      onChange={e => setPlanningModel(e.target.value)}
                      className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-8 py-6 text-xs font-semibold focus:outline-none focus:border-neutral-700 text-white"
                    >
                      {models.map(m => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Coder model */}
                  <div className="space-y-4">
                    <div className="flex justify-between items-baseline">
                      <label className="text-[9px] font-semibold text-neutral-400">2. Coder / Worker Model</label>
                      <span className="text-[8px] bg-neutral-900 text-neutral-500 px-4 py-1 rounded font-bold uppercase">Developer</span>
                    </div>
                    <select
                      value={coderModel}
                      onChange={e => setCoderModel(e.target.value)}
                      className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-8 py-6 text-xs font-semibold focus:outline-none focus:border-neutral-700 text-white"
                    >
                      {models.map(m => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Design System Style Selector */}
              <div className="space-y-6">
                <label className="text-[10px] font-bold tracking-wide uppercase text-neutral-500">Core Design Style Preference</label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                  {styles.map(style => (
                    <div
                      key={style.id}
                      onClick={() => setSelectedStyle(style.id)}
                      className={`cursor-pointer p-8 border rounded-lg transition-all ${
                        selectedStyle === style.id
                          ? "bg-orange-950/20 border-orange-700 text-white"
                          : "bg-neutral-950 border-neutral-850 text-neutral-400 hover:border-neutral-800"
                      }`}
                    >
                      <div className="text-[11px] font-bold">{style.name}</div>
                      <div className="text-[9px] opacity-70 mt-2 leading-tight">{style.desc}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Additional Instructions */}
              <div className="space-y-4">
                <label className="text-[10px] font-bold tracking-wide uppercase text-neutral-500">
                  {modalTab === "clone" ? "Additional Specifications" : "What would you like to build? (Required)"}
                </label>
                <textarea
                  required={modalTab === "scratch"}
                  value={additionalInstructions}
                  onChange={e => setAdditionalInstructions(e.target.value)}
                  placeholder={
                    modalTab === "clone"
                      ? "e.g. Integrate responsive menu, add state management with Zustand, etc."
                      : "Describe your app, e.g. A crypto dashboard with 3 chart tabs, mock transactions history, and a modern layout."
                  }
                  className="w-full bg-neutral-950 border border-neutral-850 rounded-lg px-10 py-8 text-xs font-medium placeholder:text-neutral-600 focus:outline-none focus:border-neutral-700 text-white min-h-[80px] resize-none"
                />
              </div>

              {/* Modal Footer Actions */}
              <div className="pt-12 border-t border-neutral-800 flex justify-end gap-10">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-12 py-8 border border-neutral-800 bg-transparent hover:bg-neutral-800 text-neutral-300 hover:text-white rounded-lg text-xs font-medium transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-16 py-8 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-xs font-semibold shadow-md shadow-orange-600/10 active:scale-[0.98] transition-all"
                >
                  Launch Project
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}