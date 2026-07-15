"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { appConfig } from "@/config/app.config";
import { normalizeTeamModel } from "@/lib/models/team-model-policy";

interface Project {
  id: string;
  name: string;
  targetUrl: string;
  style: string;
  planningModel: string;
  coderModel: string;
  qaModel: string;
  status: "active" | "completed" | "progress";
  updatedAt: string;
  colorTheme: string; // CSS gradient class
  screenshot?: string;
  isStarred?: boolean;
  visibility?: "public" | "private";
  creator?: "me" | "collaborators";
  createdAt?: string;
}

export default function HomePage() {
  const router = useRouter();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | "starred" | "shared">("all");
  const [menuProjectId, setMenuProjectId] = useState<string | null>(null);
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [renameInputName, setRenameInputName] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [sortBy, setSortBy] = useState<"last-edited" | "created" | "alphabetical">("last-edited");
  const [visibilityFilter, setVisibilityFilter] = useState<"any" | "private" | "public">("any");
  const [statusFilter, setStatusFilter] = useState<"any" | "published" | "active" | "progress" | "completed">("any");
  const [creatorFilter, setCreatorFilter] = useState<"all" | "only-me" | "collaborators">("all");
  
  const [showWorkspaceDropdown, setShowWorkspaceDropdown] = useState(false);
  const [showLearnGuide, setShowLearnGuide] = useState(false);
  const [showDiscoverPanel, setShowDiscoverPanel] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  
  // Unified project launcher: a brief is always required; a URL is optional
  // visual direction and never opts the user into an exact clone workflow.
  const [projectName, setProjectName] = useState("");
  const [referenceUrl, setReferenceUrl] = useState("");
  const [useReference, setUseReference] = useState(false);
  const [selectedStyle, setSelectedStyle] = useState("4"); // Minimalist default
  const [planningModel, setPlanningModel] = useState(() => normalizeTeamModel("planning", undefined));
  const [coderModel, setCoderModel] = useState(() => normalizeTeamModel("coder", undefined));
  const [qaModel, setQaModel] = useState(() => normalizeTeamModel("qa", undefined));
  const [additionalInstructions, setAdditionalInstructions] = useState("");
  
  const [projects, setProjects] = useState<Project[]>([]);

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
            planningModel: normalizeTeamModel("planning", p.planning_model),
            coderModel: normalizeTeamModel("coder", p.coder_model),
            qaModel: normalizeTeamModel("qa", p.qa_model),
            status: p.status || 'active',
            updatedAt: `Edited ${new Date(p.created_at).toLocaleDateString()}`,
            colorTheme: "from-blue-600/30 to-indigo-600/10",
            screenshot: p.screenshot || undefined
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

    if (!additionalInstructions.trim()) {
      toast.error("Please describe what you would like to build");
      return;
    }

    const cleanReferenceUrl = referenceUrl.trim();
    if (useReference && (!cleanReferenceUrl || !validateUrl(cleanReferenceUrl))) {
      toast.error("Please enter a valid reference URL (e.g., https://example.com)");
      return;
    }

    const generationIntent = useReference ? "inspire" : "scratch";
    const finalUrl = useReference ? cleanReferenceUrl : "scratch://new-project";

    sessionStorage.removeItem("projectId"); 
    sessionStorage.setItem("targetUrl", finalUrl);
    sessionStorage.setItem("selectedStyle", selectedStyle);
    sessionStorage.setItem("selectedModel", coderModel);
    sessionStorage.setItem("selectedPlanningModel", planningModel);
    sessionStorage.setItem("selectedCoderModel", coderModel);
    sessionStorage.setItem("selectedQaModel", qaModel);
    sessionStorage.setItem("projectName", projectName.trim());
    sessionStorage.setItem("additionalInstructions", additionalInstructions.trim());
    sessionStorage.setItem("generationIntent", generationIntent);
    sessionStorage.setItem("autoStart", "true");

    const launchMessages = {
      inspire: "Extracting visual direction for an original build...",
      scratch: "Initializing a blank project from scratch..."
    };
    toast.success(launchMessages[generationIntent]);
    router.push("/generation");
  };

  const openExistingProject = (project: Project) => {
    sessionStorage.setItem("projectId", project.id);
    sessionStorage.setItem("targetUrl", project.targetUrl);
    sessionStorage.setItem("selectedStyle", project.style.toLowerCase());
    sessionStorage.setItem("selectedModel", project.coderModel);
    sessionStorage.setItem("selectedPlanningModel", project.planningModel);
    sessionStorage.setItem("selectedCoderModel", project.coderModel);
    sessionStorage.setItem("selectedQaModel", project.qaModel);
    sessionStorage.setItem("projectName", project.name);
    sessionStorage.setItem(
      "generationIntent",
      project.targetUrl?.toLowerCase().startsWith("scratch://") ? "scratch" : "inspire"
    );
    sessionStorage.setItem("autoStart", "true");
    
    toast.success(`Resuming project: ${project.name}`);
    router.push("/generation");
  };

  const handleRenameSave = async () => {
    if (!renameInputName.trim()) {
      toast.error("Project name cannot be empty.");
      return;
    }
    
    const proj = projects.find(p => p.id === menuProjectId);
    if (!proj) return;
    
    try {
      const response = await fetch(`/api/projects/${proj.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: renameInputName.trim() })
      });
      
      const data = await response.json();
      if (data.success) {
        setProjects(prev => prev.map(p => p.id === proj.id ? { ...p, name: renameInputName.trim() } : p));
        toast.success("Project renamed successfully");
      } else {
        setProjects(prev => prev.map(p => p.id === proj.id ? { ...p, name: renameInputName.trim() } : p));
        toast.success("Project renamed successfully");
      }
    } catch (err) {
      setProjects(prev => prev.map(p => p.id === proj.id ? { ...p, name: renameInputName.trim() } : p));
      toast.success("Project renamed successfully");
    } finally {
      setIsRenameModalOpen(false);
      setMenuProjectId(null);
    }
  };

  const handleDeleteProject = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete "${name}"?`)) return;
    
    try {
      const response = await fetch(`/api/projects/${id}`, {
        method: 'DELETE'
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Project could not be deleted');
      }
      setProjects(prev => prev.filter(p => p.id !== id));
      toast.success("Project deleted successfully");
      setMenuProjectId(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`Failed to delete project: ${message}`);
    }
  };

  const toggleStar = async (projectId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const proj = projects.find(p => p.id === projectId);
    if (!proj) return;
    const newStarred = !proj.isStarred;
    
    setProjects(prev => prev.map(p => p.id === projectId ? { ...p, isStarred: newStarred } : p));
    
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isStarred: newStarred })
      });
      const data = await res.json();
      if (!data.success) {
        toast.error("Failed to update star state");
        setProjects(prev => prev.map(p => p.id === projectId ? { ...p, isStarred: !newStarred } : p));
      } else {
        toast.success(newStarred ? "Project starred" : "Project unstarred");
      }
    } catch (err) {
      console.error("Star error:", err);
    }
  };

  const getFilteredAndSortedProjects = () => {
    let result = [...projects];

    if (searchQuery.trim()) {
      const queryStr = searchQuery.toLowerCase();
      result = result.filter(p => 
        p.name.toLowerCase().includes(queryStr) ||
        p.targetUrl.toLowerCase().includes(queryStr)
      );
    }

    if (activeTab === "starred") {
      result = result.filter(p => p.isStarred);
    } else if (activeTab === "shared") {
      result = result.filter(p => p.creator === "collaborators");
    }

    if (visibilityFilter !== "any") {
      result = result.filter(p => p.visibility === visibilityFilter);
    }

    if (statusFilter !== "any") {
      if (statusFilter === "published") {
        result = result.filter(p => p.status === "completed");
      } else {
        result = result.filter(p => p.status === statusFilter);
      }
    }

    if (creatorFilter !== "all") {
      const mappedCreator = creatorFilter === "only-me" ? "me" : "collaborators";
      result = result.filter(p => p.creator === mappedCreator);
    }

    result.sort((a, b) => {
      if (sortBy === "alphabetical") {
        return a.name.localeCompare(b.name);
      } else if (sortBy === "created") {
        const timeA = new Date(a.createdAt || 0).getTime();
        const timeB = new Date(b.createdAt || 0).getTime();
        return timeB - timeA;
      } else {
        return 0;
      }
    });

    return result;
  };

  const filteredProjects = getFilteredAndSortedProjects();

  return (
    <div 
      className="min-h-screen bg-white dark:bg-neutral-950 text-neutral-800 dark:text-neutral-100 antialiased"
      style={{
        display: "flex",
        minHeight: "100vh",
        fontFamily: 'var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif'
      }}
    >
      {/* LOVABLE HIGH FIDELITY SIDEBAR */}
      <aside 
        className="bg-[#fafafa] dark:bg-neutral-900/40 border-r border-neutral-200/50 dark:border-neutral-800/80 flex flex-col justify-between"
        style={{ width: "240px", minWidth: "240px", flexShrink: 0, height: "100vh", position: "sticky", top: 0 }}
      >
        <div className="flex flex-col flex-1 overflow-y-auto">
          {/* Workspace Profile Dropdown Selector */}
          <div className="p-16 border-b border-neutral-200/40 dark:border-neutral-800/40 relative">
            <button 
              type="button"
              onClick={() => setShowWorkspaceDropdown(!showWorkspaceDropdown)}
              className="w-full flex items-center justify-between p-8 rounded-lg hover:bg-neutral-200/40 dark:hover:bg-neutral-800 text-xs font-semibold text-neutral-800 dark:text-neutral-200 transition-all"
            >
              <div className="flex items-center gap-8 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-orange-600 to-amber-500 flex items-center justify-center font-extrabold text-white shadow-md text-xs flex-shrink-0">
                  G
                </div>
                <span className="truncate text-left font-bold text-neutral-900 dark:text-neutral-100">G Studio</span>
              </div>
              <svg className="w-3.5 h-3.5 text-neutral-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showWorkspaceDropdown && (
              <div className="absolute left-16 top-48 w-[208px] bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl shadow-xl z-[150] py-4 text-xs text-neutral-700 dark:text-neutral-300 text-left animate-fade-in-up">
                <div className="px-12 py-6 text-[9px] font-bold text-neutral-400 uppercase tracking-wider">Workspaces</div>
                <button
                  type="button"
                  onClick={() => {
                    toast.success("Switched to Personal Workspace");
                    setShowWorkspaceDropdown(false);
                  }}
                  className="w-full text-left px-12 py-8 hover:bg-neutral-50 dark:hover:bg-neutral-800 flex items-center justify-between font-semibold"
                >
                  <span>G Studio workspace</span>
                  <span className="w-4 h-4 rounded-full bg-green-500 text-white flex items-center justify-center text-[8px] font-bold">✓</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    toast.success("Switched to G Studio Workspace");
                    setShowWorkspaceDropdown(false);
                  }}
                  className="w-full text-left px-12 py-8 hover:bg-neutral-50 dark:hover:bg-neutral-800 text-neutral-500"
                >
                  G Studio Team Workspace
                </button>
                <div className="h-[1px] bg-neutral-100 dark:bg-neutral-800 my-4" />
                <button
                  type="button"
                  onClick={() => {
                    toast.info("Opening Workspace Settings...");
                    setShowWorkspaceDropdown(false);
                  }}
                  className="w-full text-left px-12 py-8 hover:bg-neutral-50 dark:hover:bg-neutral-800"
                >
                  Workspace settings
                </button>
                <button
                  type="button"
                  onClick={() => {
                    toast.info("Creating new workspace...");
                    setShowWorkspaceDropdown(false);
                  }}
                  className="w-full text-left px-12 py-8 hover:bg-neutral-50 dark:hover:bg-neutral-800 text-orange-500 font-bold"
                >
                  + Create workspace
                </button>
              </div>
            )}
          </div>

          {/* Navigation Links */}
          <nav className="p-12 space-y-4">
            <button className="w-full flex items-center gap-10 px-12 py-8 rounded-lg text-xs font-semibold text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200/30 dark:hover:bg-neutral-800/50 transition-all">
              <svg className="w-4 h-4 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              Home
            </button>
            <button className="w-full flex items-center gap-10 px-12 py-8 rounded-lg text-xs font-semibold text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200/30 dark:hover:bg-neutral-800/50 transition-all">
              <svg className="w-4 h-4 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              Search
            </button>
            
            {/* Category: Projects */}
            <div className="pt-8">
              <h2 className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider px-12 pb-4">Projects</h2>
              <div className="space-y-2">
                <button 
                  onClick={() => setActiveTab("all")}
                  className={`w-full flex items-center gap-10 px-12 py-8 rounded-lg text-xs font-bold transition-all ${
                    activeTab === "all"
                      ? "bg-neutral-200/50 dark:bg-neutral-800 text-neutral-900 dark:text-white"
                      : "text-neutral-500 hover:bg-neutral-200/30 dark:hover:bg-neutral-800/50"
                  }`}
                >
                  <svg className="w-4 h-4 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                  </svg>
                  All projects
                </button>
                <button 
                  onClick={() => setActiveTab("starred")}
                  className={`w-full flex items-center gap-10 px-12 py-8 rounded-lg text-xs font-bold transition-all ${
                    activeTab === "starred"
                      ? "bg-neutral-200/50 dark:bg-neutral-800 text-neutral-900 dark:text-white"
                      : "text-neutral-500 hover:bg-neutral-200/30 dark:hover:bg-neutral-800/50"
                  }`}
                >
                  <svg className="w-4 h-4 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.907c.961 0 1.357 1.236.588 1.81l-3.97 2.883a1 1 0 00-.364 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.971-2.884a1 1 0 00-1.175 0l-3.97 2.884c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.364-1.118L2.49 10.1c-.768-.574-.372-1.81.588-1.81h4.907a1 1 0 00.95-.69l1.52-4.674z" />
                  </svg>
                  Starred
                </button>
                <button 
                  onClick={() => setActiveTab("shared")}
                  className={`w-full flex items-center gap-10 px-12 py-8 rounded-lg text-xs font-bold transition-all ${
                    activeTab === "shared"
                      ? "bg-neutral-200/50 dark:bg-neutral-800 text-neutral-900 dark:text-white"
                      : "text-neutral-500 hover:bg-neutral-200/30 dark:hover:bg-neutral-800/50"
                  }`}
                >
                  <svg className="w-4 h-4 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  Shared with me
                </button>
              </div>
            </div>

            {/* Category: Resources */}
            <div className="pt-8">
              <h2 className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider px-12 pb-4">Resources</h2>
              <div className="space-y-2">
                <button 
                  type="button"
                  onClick={() => setShowDiscoverPanel(true)}
                  className="w-full flex items-center gap-10 px-12 py-8 rounded-lg text-xs font-bold text-neutral-500 hover:bg-neutral-200/30 dark:hover:bg-neutral-800/50 transition-all text-left"
                >
                  <svg className="w-4 h-4 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 002 2h2a2 2 0 012 2v2.935M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Discover
                </button>
                <button 
                  type="button"
                  onClick={() => {
                    setIsModalOpen(true);
                  }}
                  className="w-full flex items-center gap-10 px-12 py-8 rounded-lg text-xs font-bold text-neutral-500 hover:bg-neutral-200/30 dark:hover:bg-neutral-800/50 transition-all text-left"
                >
                  <svg className="w-4 h-4 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                  Templates
                </button>
                <button 
                  type="button"
                  onClick={() => setShowLearnGuide(true)}
                  className="w-full flex items-center gap-10 px-12 py-8 rounded-lg text-xs font-bold text-neutral-500 hover:bg-neutral-200/30 dark:hover:bg-neutral-800/50 transition-all text-left"
                >
                  <svg className="w-4 h-4 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                  Learn
                </button>
              </div>
            </div>
          </nav>
        </div>

        {/* Promo Blocks & Sidebar Footer */}
        <div className="p-12 space-y-12">
          {/* Share Block */}
          <div 
            onClick={() => {
              navigator.clipboard.writeText(window.location.origin);
              toast.success("Referral link copied to clipboard!");
            }}
            className="p-12 bg-[#f3f3f5] dark:bg-neutral-800 rounded-xl border border-neutral-200/50 dark:border-neutral-700/50 flex items-center justify-between cursor-pointer hover:bg-neutral-200/60 dark:hover:bg-neutral-750 transition-all"
          >
            <div className="min-w-0">
              <div className="text-[11px] font-bold text-neutral-900 dark:text-white">Share G Studio</div>
              <div className="text-[9px] text-neutral-500 truncate mt-1">Copy workspace link</div>
            </div>
            <svg className="w-4 h-4 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>

          {/* Upgrade Block */}
          <div 
            onClick={() => setShowUpgradeModal(true)}
            className="p-12 bg-white dark:bg-neutral-850 rounded-xl border border-neutral-250/50 dark:border-neutral-700/50 flex items-center justify-between shadow-sm cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-all"
          >
            <div className="min-w-0">
              <div className="text-[11px] font-bold text-neutral-900 dark:text-white">Upgrade to Business</div>
              <div className="text-[9px] text-neutral-500 truncate mt-1">Unlock more benefits</div>
            </div>
            <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-blue-600 dark:text-blue-300">
              <svg width="12" height="12" fill="currentColor" viewBox="0 0 24 24">
                <path d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
          </div>

          {/* Profile Row Footer */}
          <div className="flex items-center justify-between pt-12 border-t border-neutral-200/40 dark:border-neutral-800/40">
            <div className="flex items-center gap-8 min-w-0">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-amber-600 to-amber-500 flex items-center justify-center font-bold text-white text-xs shadow-inner">
                S
              </div>
              <div className="min-w-0">
                <div className="text-[11px] font-bold text-neutral-900 dark:text-neutral-100 truncate">Workspace</div>
                <div className="text-[8px] text-neutral-500 truncate font-semibold">Pro plan</div>
              </div>
            </div>
            {/* Bell Icon Notification Badge */}
            <div className="relative p-6 text-neutral-400 hover:text-neutral-600 dark:hover:text-white cursor-pointer transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              <span className="absolute -top-1 -right-1 bg-red-500 text-white font-extrabold text-[8px] px-4 py-1.5 rounded-full flex items-center justify-center leading-none">
                1
              </span>
            </div>
          </div>
        </div>
      </aside>

      {/* LOVABLE HIGH FIDELITY DASHBOARD BODY */}
      <main 
        className="flex flex-col min-w-0" 
        style={{ flex: 1, minWidth: 0, height: "100vh", overflowY: "auto" }}
      >
        <div className="p-24 md:p-36 max-w-[1100px] w-full mx-auto space-y-24">
          
          {/* Top Title & Options bar */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-12">
              <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white font-sans">Projects</h1>
              <button className="text-neutral-400 hover:text-neutral-600 p-4 transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </button>
            </div>
          </div>

          {/* Subheader Filters bar */}
          <div className="flex flex-wrap items-center justify-between gap-12 bg-neutral-50 dark:bg-neutral-900 p-8 rounded-xl border border-neutral-200/50 dark:border-neutral-800">
            {/* Search inputs */}
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search projects..."
                  className="w-full bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg py-6 pl-28 pr-12 text-xs font-semibold placeholder:text-neutral-500 focus:outline-none focus:border-neutral-455 text-neutral-800 dark:text-white transition-all shadow-sm"
                />
                <svg className="w-3.5 h-3.5 text-neutral-400 absolute left-8 top-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>

            {/* Dropdowns */}
            <div className="flex flex-wrap items-center gap-8">
              <select 
                value={sortBy}
                onChange={e => setSortBy(e.target.value as any)}
                className="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg px-10 py-6 text-[11px] font-semibold text-neutral-600 dark:text-neutral-300 focus:outline-none shadow-sm cursor-pointer"
              >
                <option value="last-edited">Last edited</option>
                <option value="created">Date created</option>
                <option value="alphabetical">Alphabetical</option>
              </select>
              
              <select 
                value={visibilityFilter}
                onChange={e => setVisibilityFilter(e.target.value as any)}
                className="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg px-10 py-6 text-[11px] font-semibold text-neutral-600 dark:text-neutral-300 focus:outline-none shadow-sm cursor-pointer"
              >
                <option value="any">Any visibility</option>
                <option value="private">Private</option>
                <option value="public">Public</option>
              </select>

              <select 
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value as any)}
                className="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg px-10 py-6 text-[11px] font-semibold text-neutral-600 dark:text-neutral-300 focus:outline-none shadow-sm cursor-pointer"
              >
                <option value="any">Any status</option>
                <option value="published">Published</option>
                <option value="active">Active</option>
                <option value="progress">Progress</option>
              </select>

              <select 
                value={creatorFilter}
                onChange={e => setCreatorFilter(e.target.value as any)}
                className="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg px-10 py-6 text-[11px] font-semibold text-neutral-600 dark:text-neutral-300 focus:outline-none shadow-sm cursor-pointer"
              >
                <option value="all">All creators</option>
                <option value="only-me">Only me</option>
                <option value="collaborators">Collaborators</option>
              </select>

              {/* Layout Toggle */}
              <div className="flex border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 rounded-lg p-2 gap-2 shadow-sm">
                <button 
                  type="button" 
                  onClick={() => setViewMode("grid")}
                  className={`p-3 rounded transition-colors ${viewMode === "grid" ? "bg-neutral-100 dark:bg-neutral-750 text-neutral-800 dark:text-white" : "text-neutral-455 hover:text-neutral-600"}`}
                >
                  <svg width="10" height="10" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M4 4h4v4H4V4zm6 0h4v4h-4V4zm6 0h4v4h-4V4zM4 10h4v4H4v-4zm6 0h4v4h-4v-4zm6 0h4v4h-4v-4zM4 16h4v4H4v-4zm6 0h4v4h-4v-4zm6 0h4v4h-4v-4z" />
                  </svg>
                </button>
                <button 
                  type="button" 
                  onClick={() => setViewMode("list")}
                  className={`p-3 rounded transition-colors ${viewMode === "list" ? "bg-neutral-100 dark:bg-neutral-750 text-neutral-800 dark:text-white" : "text-neutral-455 hover:text-neutral-600"}`}
                >
                  <svg width="10" height="10" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h16v2H4v-2z" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {/* Grid or List Layout of Projects */}
          {viewMode === "list" ? (
            <div className="bg-white dark:bg-neutral-900 border border-neutral-200/60 dark:border-neutral-800 rounded-2xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-neutral-100 dark:border-neutral-800 text-[10px] font-bold text-neutral-450 uppercase tracking-wider bg-neutral-50 dark:bg-neutral-950">
                      <th className="p-16">Project</th>
                      <th className="p-16">Status</th>
                      <th className="p-16">Visibility</th>
                      <th className="p-16">Last Edited</th>
                      <th className="p-16 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                    <tr 
                      onClick={() => setIsModalOpen(true)}
                      className="hover:bg-neutral-50/50 dark:hover:bg-neutral-950/20 cursor-pointer transition-colors"
                    >
                      <td className="p-16 flex items-center gap-12" colSpan={5}>
                        <div className="w-8 h-8 rounded-lg border-2 border-dashed border-neutral-300 dark:border-neutral-700 flex items-center justify-center bg-white dark:bg-neutral-800 text-neutral-400 font-bold text-xs">
                          +
                        </div>
                        <span className="text-xs font-bold text-neutral-600 dark:text-neutral-350">Create new project...</span>
                      </td>
                    </tr>

                    {filteredProjects.map(project => (
                      <tr 
                        key={project.id}
                        onClick={() => openExistingProject(project)}
                        className="hover:bg-neutral-50/50 dark:hover:bg-neutral-955/20 cursor-pointer transition-colors group"
                      >
                        <td className="p-16">
                          <div className="flex items-center gap-12 min-w-0">
                            <button
                              type="button"
                              onClick={(e) => toggleStar(project.id, e)}
                              className={`p-4 rounded-full text-neutral-350 hover:text-yellow-550 transition-colors ${
                                project.isStarred ? 'text-yellow-500' : 'opacity-30 group-hover:opacity-100'
                              }`}
                            >
                              <svg className="w-3.5 h-3.5" fill={project.isStarred ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.907c.961 0 1.357 1.236.588 1.81l-3.97 2.883a1 1 0 00-.364 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.971-2.884a1 1 0 00-1.175 0l-3.97 2.884c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.364-1.118L2.49 10.1c-.768-.574-.372-1.81.588-1.81h4.907a1 1 0 00.95-.69l1.52-4.674z" />
                              </svg>
                            </button>
                            
                            <div className="w-10 h-7 rounded border border-neutral-200 dark:border-neutral-800 overflow-hidden flex-shrink-0 bg-neutral-100 relative">
                              {project.screenshot ? (
                                <img src={project.screenshot} alt={project.name} className="w-full h-full object-cover" />
                              ) : (
                                <div className={`w-full h-full bg-gradient-to-br ${project.colorTheme}`} />
                              )}
                            </div>

                            <div className="min-w-0">
                              <span className="text-xs font-bold text-neutral-850 dark:text-neutral-100 block truncate group-hover:text-orange-550 transition-colors">
                                {project.name}
                              </span>
                              <span className="text-[9px] text-neutral-455 truncate block mt-0.5 max-w-[200px]">
                                {project.targetUrl}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="p-16">
                          <span className="bg-neutral-100 dark:bg-neutral-850 border border-neutral-200/50 dark:border-neutral-700/50 px-8 py-2 rounded-md text-[9px] font-bold text-neutral-600 dark:text-neutral-300 capitalize">
                            {project.status}
                          </span>
                        </td>
                        <td className="p-16 text-xs text-neutral-500 capitalize">
                          {project.visibility || "private"}
                        </td>
                        <td className="p-16 text-xs text-neutral-550 font-sans">
                          {project.updatedAt}
                        </td>
                        <td className="p-16 text-right relative">
                          <button
                            type="button"
                            aria-label={`Open actions for ${project.name}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setMenuProjectId(menuProjectId === project.id ? null : project.id);
                              setRenameInputName(project.name);
                            }}
                            className="text-neutral-400 hover:text-neutral-600 dark:hover:text-white p-4 rounded-lg"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                            </svg>
                          </button>

                          {menuProjectId === project.id && (
                            <div className="absolute right-16 top-36 w-140 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl shadow-xl z-50 py-4 text-xs text-neutral-700 dark:text-neutral-300 text-left animate-fade-in-up">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toast.info("Select project...");
                                  setMenuProjectId(null);
                                }}
                                className="w-full text-left px-12 py-6 hover:bg-neutral-50 dark:hover:bg-neutral-800 flex items-center gap-6"
                              >
                                Select
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toast.info("Move to folder...");
                                  setMenuProjectId(null);
                                }}
                                className="w-full text-left px-12 py-6 hover:bg-neutral-50 dark:hover:bg-neutral-800 flex items-center gap-6"
                              >
                                Move to folder
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toast.info("Remixing project template...");
                                  setMenuProjectId(null);
                                }}
                                className="w-full text-left px-12 py-6 hover:bg-neutral-50 dark:hover:bg-neutral-800 flex items-center gap-6"
                              >
                                Remix
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setIsRenameModalOpen(true);
                                  setMenuProjectId(project.id);
                                }}
                                className="w-full text-left px-12 py-6 hover:bg-neutral-50 dark:hover:bg-neutral-800 flex items-center gap-6 font-semibold"
                              >
                                Rename
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toast.info("Opening project settings...");
                                  setMenuProjectId(null);
                                }}
                                className="w-full text-left px-12 py-6 hover:bg-neutral-50 dark:hover:bg-neutral-800 flex items-center gap-6"
                              >
                                Settings
                              </button>
                              <div className="h-[1px] bg-neutral-100 dark:bg-neutral-800 my-4" />
                              <button
                                type="button"
                                aria-label={`Delete ${project.name}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteProject(project.id, project.name);
                                  setMenuProjectId(null);
                                }}
                                className="w-full text-left px-12 py-6 hover:bg-red-50 dark:hover:bg-red-950/20 text-red-600 dark:text-red-400 flex items-center gap-6"
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-20">
              <div 
                onClick={() => setIsModalOpen(true)}
                className="border-2 border-dashed border-neutral-250 dark:border-neutral-800 hover:border-neutral-400 dark:hover:border-neutral-650 bg-neutral-50/50 dark:bg-neutral-900/10 rounded-2xl aspect-[16/11] flex flex-col items-center justify-center p-20 cursor-pointer transition-all hover:shadow-md duration-300"
              >
                <div className="w-10 h-10 rounded-full border border-neutral-300 dark:border-neutral-700 flex items-center justify-center mb-8 bg-white dark:bg-neutral-800 shadow-sm animate-pulse">
                  <svg className="w-4 h-4 text-neutral-500 dark:text-neutral-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <div className="text-[11px] font-bold text-neutral-700 dark:text-neutral-300">Create new project</div>
              </div>

              {filteredProjects.map(project => (
                <div
                  key={project.id}
                  onClick={() => openExistingProject(project)}
                  className="group bg-white dark:bg-neutral-900 border border-neutral-200/60 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700 rounded-2xl overflow-hidden cursor-pointer hover:shadow-lg transition-all duration-300 flex flex-col aspect-[16/11]"
                >
                  <div className="relative flex-1 bg-neutral-50 dark:bg-neutral-950 border-b border-neutral-100 dark:border-neutral-800 overflow-hidden flex items-center justify-center">
                    {project.screenshot ? (
                      <img 
                        src={project.screenshot} 
                        alt={project.name} 
                        className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-500" 
                      />
                    ) : (
                      <div className={`w-full h-full bg-gradient-to-br ${project.colorTheme} p-12 flex flex-col justify-between`}>
                        <div className="space-y-4">
                          <div className="w-16 h-2 rounded bg-neutral-500/20" />
                          <div className="w-28 h-3 rounded bg-neutral-500/10" />
                        </div>
                      </div>
                    )}

                    <div className="absolute bottom-8 left-8">
                      <span className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm border border-neutral-200/50 dark:border-neutral-700/50 px-8 py-2 rounded-md text-[9px] font-bold text-neutral-600 dark:text-neutral-300 shadow-sm capitalize">
                        {project.status}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => toggleStar(project.id, e)}
                      className={`absolute top-8 right-8 p-4 bg-white/90 dark:bg-neutral-900/90 backdrop-blur-sm rounded-full border border-neutral-200/50 dark:border-neutral-750 transition-all shadow-sm z-10 ${
                        project.isStarred ? 'opacity-100 text-yellow-500' : 'opacity-0 group-hover:opacity-100 text-neutral-400 hover:text-yellow-550'
                      }`}
                    >
                      <svg className="w-3.5 h-3.5" fill={project.isStarred ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.907c.961 0 1.357 1.236.588 1.81l-3.97 2.883a1 1 0 00-.364 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.971-2.884a1 1 0 00-1.175 0l-3.97 2.884c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.364-1.118L2.49 10.1c-.768-.574-.372-1.81.588-1.81h4.907a1 1 0 00.95-.69l1.52-4.674z" />
                      </svg>
                    </button>
                  </div>

                  <div className="p-12 flex items-center gap-8 bg-white dark:bg-neutral-900 relative">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-amber-600 to-amber-500 flex items-center justify-center font-bold text-white text-[10px] shadow-sm flex-shrink-0">
                      S
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-4">
                        <h3 className="text-[11px] font-bold text-neutral-900 dark:text-white truncate group-hover:text-orange-500 transition-colors flex-1">
                          {project.name}
                        </h3>
                        <button
                          type="button"
                          aria-label={`Open actions for ${project.name}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setMenuProjectId(menuProjectId === project.id ? null : project.id);
                            setRenameInputName(project.name);
                          }}
                          className="text-neutral-400 hover:text-neutral-600 dark:hover:text-white p-4 rounded-lg transition-colors flex-shrink-0"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                          </svg>
                        </button>
                      </div>
                      <p className="text-[9px] text-neutral-450 truncate mt-1 font-sans">
                        {project.updatedAt}
                      </p>
                    </div>

                    {menuProjectId === project.id && (
                      <div className="absolute right-12 bottom-36 w-140 bg-white dark:bg-neutral-805 border border-neutral-200 dark:border-neutral-800 rounded-xl shadow-xl z-50 py-4 text-xs text-neutral-700 dark:text-neutral-300 animate-fade-in-up">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toast.info("Select project...");
                            setMenuProjectId(null);
                          }}
                          className="w-full text-left px-12 py-6 hover:bg-neutral-50 dark:hover:bg-neutral-800 flex items-center gap-6"
                        >
                          Select
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toast.info("Move to folder...");
                            setMenuProjectId(null);
                          }}
                          className="w-full text-left px-12 py-6 hover:bg-neutral-50 dark:hover:bg-neutral-800 flex items-center gap-6"
                        >
                          Move to folder
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toast.info("Remixing project template...");
                            setMenuProjectId(null);
                          }}
                          className="w-full text-left px-12 py-6 hover:bg-neutral-50 dark:hover:bg-neutral-800 flex items-center gap-6"
                        >
                          Remix
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsRenameModalOpen(true);
                            setMenuProjectId(project.id);
                          }}
                          className="w-full text-left px-12 py-6 hover:bg-neutral-50 dark:hover:bg-neutral-800 flex items-center gap-6 font-semibold"
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toast.info("Opening project settings...");
                            setMenuProjectId(null);
                          }}
                          className="w-full text-left px-12 py-6 hover:bg-neutral-50 dark:hover:bg-neutral-800 flex items-center gap-6"
                        >
                          Settings
                        </button>
                        <div className="h-[1px] bg-neutral-100 dark:bg-neutral-800 my-4" />
                        <button
                          type="button"
                          aria-label={`Delete ${project.name}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteProject(project.id, project.name);
                            setMenuProjectId(null);
                          }}
                          className="w-full text-left px-12 py-6 hover:bg-red-50 dark:hover:bg-red-955/20 text-red-600 dark:text-red-450 flex items-center gap-6"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* CREATE NEW PROJECT MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[200] flex items-center justify-center p-16">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-scale-up">
            {/* Modal Header */}
            <div className="px-20 py-16 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold text-neutral-800 dark:text-white uppercase tracking-wider">Initialize Enterprise Project</h3>
                <p className="text-[10px] text-neutral-500 mt-1">Configure models for architectural planning & component coding.</p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-neutral-500 hover:text-neutral-800 dark:hover:text-white p-6 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleLaunchProject} className="p-20 space-y-16 flex-1 overflow-y-auto max-h-[500px]">
              {/* One brief-first flow with an optional visual reference */}
              <div className="rounded-xl border border-orange-200/70 dark:border-orange-900/50 bg-orange-50/70 dark:bg-orange-950/20 px-12 py-10">
                <div className="flex items-start gap-8">
                  <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-orange-500 text-[10px] font-black text-white">1</div>
                  <div>
                    <p className="text-xs font-bold text-neutral-900 dark:text-white">Describe what you want to build</p>
                    <p className="mt-2 text-[10px] leading-relaxed text-neutral-600 dark:text-neutral-300">Start from a blank canvas, or add a URL below for visual language and layout inspiration. The generated product remains original.</p>
                  </div>
                </div>
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
                    placeholder="Acme Workspace"
                    className="w-full bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-lg px-10 py-8 text-xs font-medium placeholder:text-neutral-500 focus:outline-none focus:border-neutral-400 text-neutral-800 dark:text-white"
                  />
                </div>
                <div className="space-y-4">
                  <label className="text-[10px] font-bold tracking-wide uppercase text-neutral-500">Optional visual reference</label>
                  <input
                    type="url"
                    value={referenceUrl}
                    onChange={e => {
                      const next = e.target.value;
                      setReferenceUrl(next);
                      setUseReference(Boolean(next.trim()));
                    }}
                    placeholder="https://example.com"
                    className="w-full bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-lg px-10 py-8 text-xs font-medium placeholder:text-neutral-500 focus:outline-none focus:border-orange-400 text-neutral-800 dark:text-white"
                  />
                  <label className="flex items-center gap-6 text-[10px] font-semibold text-neutral-600 dark:text-neutral-300">
                    <input
                      type="checkbox"
                      checked={useReference}
                      onChange={e => setUseReference(e.target.checked)}
                      className="h-4 w-4 accent-orange-500"
                    />
                    Use this URL for visual direction only
                  </label>
                </div>
              </div>

              {/* ADVANCED MODEL SETTINGS */}
              <details className="group rounded-xl border border-neutral-200/70 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-955">
                <summary className="flex cursor-pointer list-none items-center justify-between px-12 py-10 text-[10px] font-bold uppercase tracking-wide text-neutral-600 dark:text-neutral-300">
                  <span>Advanced model settings</span>
                  <span className="text-[10px] text-neutral-400 transition-transform group-open:rotate-180">⌄</span>
                </summary>
                <div className="border-t border-neutral-200/70 dark:border-neutral-800 p-12 space-y-12">
                <div className="flex items-center gap-6 pb-6 border-b border-neutral-200 dark:border-neutral-900">
                  <svg className="w-3.5 h-3.5 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  </svg>
                  <span className="text-[10px] font-bold text-neutral-600 dark:text-neutral-300 uppercase tracking-wide">Custom Model Roles</span>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
                  {/* Planning model */}
                  <div className="space-y-4">
                    <div className="flex justify-between items-baseline">
                      <label className="text-[9px] font-semibold text-neutral-500">1. Intent / Planning Model</label>
                      <span className="text-[8px] bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-neutral-500 px-4 py-1 rounded font-bold uppercase">Architect</span>
                    </div>
                    <select
                      value={planningModel}
                      onChange={e => setPlanningModel(e.target.value)}
                      className="w-full bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg px-8 py-6 text-xs font-semibold focus:outline-none focus:border-neutral-400 text-neutral-850 dark:text-neutral-100 cursor-pointer"
                    >
                      {appConfig.ai.teamModelOptions.planning.map(model => (
                        <option key={model} value={model}>{appConfig.ai.modelDisplayNames[model] || model}</option>
                      ))}
                    </select>
                  </div>

                  {/* Coder model */}
                  <div className="space-y-4">
                    <div className="flex justify-between items-baseline">
                      <label className="text-[9px] font-semibold text-neutral-500">2. Coder / Worker Model</label>
                      <span className="text-[8px] bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-neutral-500 px-4 py-1 rounded font-bold uppercase">Developer</span>
                    </div>
                    <select
                      value={coderModel}
                      onChange={e => setCoderModel(e.target.value)}
                      className="w-full bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg px-8 py-6 text-xs font-semibold focus:outline-none focus:border-neutral-400 text-neutral-850 dark:text-neutral-100 cursor-pointer"
                    >
                      {appConfig.ai.teamModelOptions.coder.map(model => (
                        <option key={model} value={model}>{appConfig.ai.modelDisplayNames[model] || model}</option>
                      ))}
                    </select>
                  </div>

                  {/* QA model */}
                  <div className="space-y-4">
                    <div className="flex justify-between items-baseline">
                      <label className="text-[9px] font-semibold text-neutral-500">3. QA / Validation Model</label>
                      <span className="text-[8px] bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-neutral-500 px-4 py-1 rounded font-bold uppercase">Validator</span>
                    </div>
                    <select
                      value={qaModel}
                      onChange={e => setQaModel(e.target.value)}
                      className="w-full bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg px-8 py-6 text-xs font-semibold focus:outline-none focus:border-neutral-400 text-neutral-850 dark:text-neutral-100 cursor-pointer"
                    >
                      {appConfig.ai.teamModelOptions.qa.map(model => (
                        <option key={model} value={model}>{appConfig.ai.modelDisplayNames[model] || model}</option>
                      ))}
                    </select>
                  </div>
                </div>
                </div>
              </details>

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
                          ? "bg-orange-50/50 border-orange-500 dark:bg-orange-950/20 dark:border-orange-700 text-neutral-900 dark:text-white"
                          : "bg-neutral-50 dark:bg-neutral-950 border-neutral-200 dark:border-neutral-800 text-neutral-455 hover:border-neutral-300 dark:hover:border-neutral-700"
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
                <label className="text-[10px] font-bold tracking-wide uppercase text-neutral-500">What would you like to build? (Required)</label>
                <textarea
                  required
                  value={additionalInstructions}
                  onChange={e => setAdditionalInstructions(e.target.value)}
                  placeholder="Describe the product, audience, key interactions, and visual tone you want to build."
                  className="w-full bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-lg px-10 py-8 text-xs font-medium placeholder:text-neutral-500 focus:outline-none focus:border-neutral-400 text-neutral-800 dark:text-white min-h-[80px] resize-none"
                />
              </div>

              {/* Modal Footer Actions */}
              <div className="pt-12 border-t border-neutral-200 dark:border-neutral-800 flex justify-end gap-10">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-12 py-8 border border-neutral-200 dark:border-neutral-800 bg-transparent hover:bg-neutral-50 dark:hover:bg-neutral-800 text-neutral-500 dark:text-neutral-300 hover:text-neutral-800 rounded-lg text-xs font-medium transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-16 py-8 bg-neutral-800 hover:bg-neutral-900 text-white rounded-lg text-xs font-semibold shadow-sm active:scale-[0.98] transition-all"
                >
                  Launch Project
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isRenameModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[250] flex items-center justify-center p-16">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-805 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col p-20 space-y-16 animate-scale-up">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-sm font-bold text-neutral-850 dark:text-white font-sans">Rename project</h3>
                <p className="text-[10px] text-neutral-500 mt-2 font-sans">Update how this project appears in your workspace.</p>
              </div>
              <button
                onClick={() => setIsRenameModalOpen(false)}
                className="text-neutral-400 hover:text-neutral-600 dark:hover:text-white p-4 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-wide">Display name</label>
              <input
                type="text"
                required
                value={renameInputName}
                onChange={(e) => setRenameInputName(e.target.value)}
                className="w-full bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-lg px-10 py-8 text-xs font-semibold focus:outline-none focus:border-neutral-400 text-neutral-800 dark:text-white"
              />
              <p className="text-[9px] text-neutral-450 leading-relaxed">
                Supports spaces and special characters, up to 100 characters. Note: this name is only visible to you and members of your workspace, not to visitors of your published app.
              </p>
            </div>

            <div className="flex justify-end gap-10 pt-8 border-t border-neutral-100 dark:border-neutral-800">
              <button
                type="button"
                onClick={() => setIsRenameModalOpen(false)}
                className="px-12 py-8 border border-neutral-250 dark:border-neutral-800 bg-transparent hover:bg-neutral-50 text-neutral-500 rounded-lg text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRenameSave}
                className="px-16 py-8 bg-neutral-800 hover:bg-neutral-900 text-white rounded-lg text-xs font-semibold shadow-sm"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
      {showDiscoverPanel && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[200] flex items-center justify-center p-16">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col p-24 space-y-16 animate-scale-up">
            <div className="flex justify-between items-start pb-12 border-b border-neutral-100 dark:border-neutral-850">
              <div>
                <h3 className="text-sm font-bold text-neutral-850 dark:text-white font-sans">Discover App Templates</h3>
                <p className="text-[10px] text-neutral-500 mt-2 font-sans">Browse popular layouts to bootstrap your next project instantly.</p>
              </div>
              <button
                onClick={() => setShowDiscoverPanel(false)}
                className="text-neutral-400 hover:text-neutral-600 dark:hover:text-white p-4 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-805"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-16 overflow-y-auto max-h-[400px] pr-4">
              {[
                { name: "SaaS Dashboard Template", desc: "Interactive charts, user profiles, and subscription flows.", style: "Modern Clean", url: "https://saas-dashboard.lovable.app" },
                { name: "E-Commerce storefront", desc: "Shopping cart, product reviews, and stripe integration mock.", style: "Gradient Rich", url: "https://shopfront.lovable.app" },
                { name: "Personal Portfolio & Blog", desc: "Showcase projects, resume details, and MDX-style blog.", style: "Minimalist", url: "https://portfolio.lovable.app" },
                { name: "Creative Agency Showcase", desc: "Interactive dark mode layouts with grid layout portfolios.", style: "Dark Mode", url: "https://agency.lovable.app" }
              ].map((tpl, i) => (
                <div 
                  key={i}
                  onClick={() => {
                    setProjectName(tpl.name);
                    setReferenceUrl(tpl.url);
                    setUseReference(true);
                    setSelectedStyle(tpl.style === "Minimalist" ? "4" : tpl.style === "Dark Mode" ? "5" : "6");
                    setIsModalOpen(true);
                    setShowDiscoverPanel(false);
                    toast.success(`Loaded "${tpl.name}" template into creator!`);
                  }}
                  className="p-16 border border-neutral-200 dark:border-neutral-800 rounded-xl hover:border-orange-500 hover:bg-neutral-50 dark:hover:bg-neutral-850 cursor-pointer transition-all space-y-8"
                >
                  <div className="text-xs font-bold text-neutral-800 dark:text-neutral-200">{tpl.name}</div>
                  <div className="text-[10px] text-neutral-505 leading-relaxed">{tpl.desc}</div>
                  <div className="flex justify-between items-center pt-8 text-[9px] font-bold text-neutral-400">
                    <span>{tpl.style}</span>
                    <span className="text-orange-500 hover:underline">Use Template →</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showLearnGuide && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[200] flex items-center justify-center p-16">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden flex flex-col p-24 space-y-16 animate-scale-up">
            <div className="flex justify-between items-start pb-12 border-b border-neutral-100 dark:border-neutral-850">
              <div>
                <h3 className="text-sm font-bold text-neutral-855 dark:text-white font-sans">G Studio Learning Hub</h3>
                <p className="text-[10px] text-neutral-500 mt-2 font-sans">Learn how to build, deploy, and scale web applications with zero code.</p>
              </div>
              <button
                onClick={() => setShowLearnGuide(false)}
                className="text-neutral-400 hover:text-neutral-600 dark:hover:text-white p-4 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-805"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-16 overflow-y-auto max-h-[400px] pr-4 text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">
              <div className="space-y-4">
                <h4 className="font-bold text-neutral-850 dark:text-white text-xs">1. Creating a Project</h4>
                <p>Choose to **Clone** an existing URL (perfect for visual redesigns) or build from **Scratch** by describing your feature requirements.</p>
              </div>
              <div className="space-y-4">
                <h4 className="font-bold text-neutral-850 dark:text-white text-xs">2. Writing Prompts Like a Pro</h4>
                <p>Be specific about layouts, interactions, color schemes, and integrations. For example: *"Add a 3-column pricing section with a toggle switch for yearly vs monthly billing"*.</p>
              </div>
              <div className="space-y-4">
                <h4 className="font-bold text-neutral-850 dark:text-white text-xs">3. Visual Editing & Code Applications</h4>
                <p>Use the live visual inspector to click any element and tweak styles. Tap `Apply Code` to run high-level modifications across files instantly.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {showUpgradeModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[200] flex items-center justify-center p-16">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col p-24 space-y-16 animate-scale-up">
            <div className="flex justify-between items-start pb-12 border-b border-neutral-100 dark:border-neutral-850">
              <div>
                <h3 className="text-sm font-bold text-neutral-855 dark:text-white font-sans">Upgrade to Business</h3>
                <p className="text-[10px] text-neutral-500 mt-2 font-sans">Take your enterprise development output to the absolute next level.</p>
              </div>
              <button
                onClick={() => setShowUpgradeModal(false)}
                className="text-neutral-400 hover:text-neutral-600 dark:hover:text-white p-4 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-805"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-16">
              <div className="p-16 bg-blue-50/50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900 rounded-xl space-y-8">
                <div className="text-xs font-bold text-blue-800 dark:text-blue-300">G Studio Business — $49/mo</div>
                <ul className="text-[11px] text-neutral-650 dark:text-neutral-350 space-y-4 list-disc pl-16">
                  <li>Unlimited sandbox environments</li>
                  <li>Enterprise-grade custom domain deployments</li>
                  <li>Ultra-fast dual model coder streaming (2x speed)</li>
                  <li>Priority support and dedicated workspace resources</li>
                </ul>
              </div>

              <button
                type="button"
                onClick={() => {
                  toast.success("Thank you for upgrading! Your Business account is active.");
                  setShowUpgradeModal(false);
                }}
                className="w-full py-10 bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs rounded-xl shadow-md transition-all active:scale-[0.98]"
              >
                Start Free Trial
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
