import React, { useEffect, useState } from 'react';
import {
  Plus,
  Film,
  Trash2,
  Check,
  Activity,
  X,
  Loader2,
  Globe,
  Layers,
} from 'lucide-react';
import { api } from '../services/api';
import { ProjectDetail } from '../types/timeline';
import { useExportStore } from '../stores/exportStore';
import { ExportManagerDrawer } from '../components/export/ExportManagerDrawer';


interface AspectRatioOption {
  id: '16:9' | '9:16' | '1:1';
  label: string;
  title: string;
  width: number;
  height: number;
  desc: string;
  iconRatio: string;
}

const ASPECT_RATIO_OPTIONS: AspectRatioOption[] = [
  {
    id: '16:9',
    label: '16:9',
    title: 'YouTube (Widescreen)',
    width: 1920,
    height: 1080,
    desc: '1920 × 1080 · YouTube, TV, Desktop',
    iconRatio: 'w-10 h-5.5',
  },
  {
    id: '9:16',
    label: '9:16',
    title: 'Shorts / Reels',
    width: 1080,
    height: 1920,
    desc: '1080 × 1920 · TikTok, Reels, Shorts',
    iconRatio: 'w-5.5 h-10',
  },
  {
    id: '1:1',
    label: '1:1',
    title: 'Square',
    width: 1080,
    height: 1080,
    desc: '1080 × 1080 · Instagram Feed, Square',
    iconRatio: 'w-7 h-7',
  },
];

export const Dashboard: React.FC<{ onOpenProject: (id: string) => void }> = ({ onOpenProject }) => {
  const [projects, setProjects] = useState<ProjectDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [newProjectName, setNewProjectName] = useState('');
  const [selectedRatio, setSelectedRatio] = useState<AspectRatioOption>(ASPECT_RATIO_OPTIONS[0]);
  const [projectMode, setProjectMode] = useState<'single_language' | 'multi_language'>('single_language');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchProjects = async () => {
    setLoading(true);
    try {
      const data = await api.getProjects();
      if (Array.isArray(data)) {
        setProjects(data);
      } else {
        console.warn('api.getProjects returned non-array payload:', data);
        setProjects([]);
      }
    } catch (e: any) {
      setProjects([]);
    } finally {
      setLoading(false);
    }
  };

  const { jobs, setDrawerOpen, startPolling } = useExportStore();
  const activeExportsCount = Object.values(jobs).filter(
    (j) => j.status === 'rendering' || j.status === 'queued' || j.status === 'pending'
  ).length;

  useEffect(() => {
    fetchProjects();
    const stopPolling = startPolling();
    return () => {
      stopPolling();
    };
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    setIsSubmitting(true);
    setError(null);

    try {
      const proj = await api.createProject(newProjectName.trim(), {
        aspect_ratio: selectedRatio.id,
        width: selectedRatio.width,
        height: selectedRatio.height,
        project_mode: projectMode,
      });

      setNewProjectName('');
      setIsCreating(false);
      onOpenProject(proj.id);
    } catch (err: any) {
      const serverMessage = err.response?.data?.detail || err.message;
      if (err.response?.status === 404 || err.code === 'ERR_NETWORK') {
        setError('Unable to connect to the project server.');
      } else if (serverMessage) {
        setError(`Project creation failed: ${serverMessage}`);
      } else {
        setError('Project creation failed. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this project?')) {
      try {
        await api.deleteProject(id);
        fetchProjects();
      } catch (err) {
        alert('Failed to delete project');
      }
    }
  };

  const getAspectRatioBadge = (proj: ProjectDetail) => {
    const ratio = proj.settings?.aspect_ratio;
    if (ratio) return ratio;
    const w = proj.settings?.width || 1920;
    const h = proj.settings?.height || 1080;
    if (w === 1080 && h === 1920) return '9:16';
    if (w === h) return '1:1';
    return '16:9';
  };

  return (
    <div className="min-h-screen bg-[#0F1117] text-gray-200 flex flex-col">
      {/* Top Banner */}
      <header className="h-16 border-b border-[#2A2F3A] bg-[#181B24] px-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center shadow-lg">
            <Film size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white tracking-tight leading-none">AutoVideo Studio</h1>
            <span className="text-[11px] text-gray-400">AI-Powered Automated Video Editor</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Background Exports Activity Center */}
          <button
            onClick={() => setDrawerOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2 bg-[#202533] hover:bg-[#282f40] border border-[#343d52] rounded-lg text-xs font-semibold text-gray-200 transition-colors shadow-sm cursor-pointer"
            title="View background exports across all projects"
          >
            <Activity size={15} className={activeExportsCount > 0 ? 'animate-pulse text-indigo-400' : 'text-gray-400'} />
            <span>Exports</span>
            {activeExportsCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-600 text-white leading-none">
                {activeExportsCount}
              </span>
            )}
          </button>

          <button
            onClick={() => {
              setIsCreating(true);
              setError(null);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-semibold text-white shadow-md transition-colors cursor-pointer"
          >
            <Plus size={16} /> New Project
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-8">
        {error && (
          <div className="mb-6 p-4 bg-red-950/40 border border-red-800 rounded-lg text-red-300 text-sm flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-white">
              <X size={16} />
            </button>
          </div>
        )}

        {/* Project Creation Form with Clean Workflow */}
        {isCreating && (
          <form
            onSubmit={handleCreate}
            className="mb-8 p-6 bg-[#181B24] border border-[#2A2F3A] rounded-2xl shadow-2xl space-y-6 animate-in fade-in duration-200"
          >
            <div className="flex items-center justify-between border-b border-[#2A2F3A] pb-3">
              <div>
                <h2 className="text-base font-bold text-white">Create New Project</h2>
                <span className="text-xs text-gray-400">Configure canvas ratio and language mode</span>
              </div>
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="text-gray-400 hover:text-white p-1"
              >
                <X size={18} />
              </button>
            </div>

            {/* Project Name Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-300">Project Name</label>
              <input
                type="text"
                autoFocus
                placeholder="Enter project name (e.g. Science Documentary Series, Travel Vlog Episode 2)..."
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                className="w-full bg-[#11131a] border border-[#2e3343] rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                required
              />
            </div>

            {/* Video Aspect Ratio Selector */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-300">Video Canvas Aspect Ratio</label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {ASPECT_RATIO_OPTIONS.map((opt) => {
                  const isSelected = selectedRatio.id === opt.id;
                  return (
                    <div
                      key={opt.id}
                      onClick={() => setSelectedRatio(opt)}
                      className={`p-4 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                        isSelected
                          ? 'border-indigo-500 bg-indigo-950/40 shadow-lg shadow-indigo-950/30'
                          : 'border-[#2A2F3A] bg-[#11131a] hover:border-gray-600 hover:bg-[#141722]'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="h-12 w-12 rounded-lg bg-[#1e2230] flex items-center justify-center">
                          <div
                            className={`border-2 ${
                              isSelected ? 'border-indigo-400 bg-indigo-500/20' : 'border-gray-500 bg-gray-700/20'
                            } rounded-sm transition-all ${
                              opt.id === '16:9'
                                ? 'w-8 h-4.5'
                                : opt.id === '9:16'
                                ? 'w-4.5 h-8'
                                : 'w-6 h-6'
                            }`}
                          />
                        </div>
                        {isSelected && (
                          <div className="w-5 h-5 rounded-full bg-indigo-600 flex items-center justify-center text-white">
                            <Check size={12} />
                          </div>
                        )}
                      </div>

                      <div>
                        <div className="text-sm font-semibold text-white flex items-center gap-1.5">
                          {opt.label}
                          <span className="text-[11px] font-normal text-indigo-400">{opt.title}</span>
                        </div>
                        <p className="text-[11px] text-gray-400 mt-1 leading-relaxed">{opt.desc}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Project Mode Selector: Single-Language vs Multi-Language */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-300">Project Mode</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div
                  onClick={() => setProjectMode('single_language')}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                    projectMode === 'single_language'
                      ? 'border-indigo-500 bg-indigo-950/40 shadow-md'
                      : 'border-[#2A2F3A] bg-[#11131a] hover:border-gray-600'
                  }`}
                >
                  <div className="p-2 rounded-lg bg-[#1e2230] text-indigo-400 shrink-0">
                    <Layers size={18} />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white flex items-center gap-2">
                      Single-Language Mode
                      {projectMode === 'single_language' && (
                        <span className="text-[10px] bg-indigo-600 px-1.5 py-0.2 rounded-full text-white">Selected</span>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-400 mt-0.5 leading-snug">
                      Single primary voiceover narration track with synchronized visuals.
                    </p>
                  </div>
                </div>

                <div
                  onClick={() => setProjectMode('multi_language')}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                    projectMode === 'multi_language'
                      ? 'border-purple-500 bg-purple-950/40 shadow-md'
                      : 'border-[#2A2F3A] bg-[#11131a] hover:border-gray-600'
                  }`}
                >
                  <div className="p-2 rounded-lg bg-[#1e2230] text-purple-400 shrink-0">
                    <Globe size={18} />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white flex items-center gap-2">
                      Multi-Language Mode
                      {projectMode === 'multi_language' && (
                        <span className="text-[10px] bg-purple-600 px-1.5 py-0.2 rounded-full text-white">Selected</span>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-400 mt-0.5 leading-snug">
                      Multi-lingual project supporting multiple voiceover language tracks with track switching.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#2A2F3A]">
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                disabled={isSubmitting}
                className="px-4 py-2 bg-[#232733] hover:bg-[#2d3242] text-gray-400 hover:text-white rounded-lg text-sm font-medium transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-colors shadow-md flex items-center gap-2 cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" /> Creating Project...
                  </>
                ) : (
                  <>
                    <Plus size={16} /> Create Project
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* Existing Projects Header & List */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Your Projects</h2>
          <span className="text-xs text-gray-500">{Array.isArray(projects) ? projects.length : 0} Projects</span>
        </div>

        {loading ? (
          <div className="text-center py-20 text-gray-500 text-sm flex items-center justify-center gap-2">
            <Loader2 size={18} className="animate-spin text-indigo-400" /> Loading projects...
          </div>
        ) : !Array.isArray(projects) || projects.length === 0 ? (
          <div className="text-center py-24 bg-[#181B24]/40 border border-dashed border-[#2A2F3A] rounded-2xl p-8">
            <Film size={36} className="mx-auto text-gray-600 mb-3" />
            <div className="text-sm font-medium text-gray-300 mb-1">No Projects Yet</div>
            <p className="text-xs text-gray-500 mb-5 max-w-sm mx-auto">
              Create a new project to start transforming voiceovers, images, and video clips into professional videos.
            </p>
            <button
              onClick={() => setIsCreating(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-xs font-semibold text-white transition-colors cursor-pointer"
            >
              <Plus size={14} /> Create Your First Project
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {(Array.isArray(projects) ? projects : []).map((proj) => {
              const assetsList = Array.isArray(proj?.assets) ? proj.assets : [];
              const visualCount = assetsList.filter((a) => a.type === 'image' || a.type === 'video').length;
              const hasAudio = assetsList.some((a) => a.type === 'audio');
              const sceneCount = Array.isArray(proj.timeline?.scenes) ? proj.timeline.scenes.length : 0;
              const ratioBadge = getAspectRatioBadge(proj);
              const isMulti = proj.settings?.project_mode === 'multi_language';

              return (
                <div
                  key={proj.id}
                  onClick={() => onOpenProject(proj.id)}
                  className="group bg-[#181B24] border border-[#2A2F3A] hover:border-indigo-500/80 rounded-2xl p-5 cursor-pointer transition-all hover:shadow-xl hover:shadow-indigo-950/20 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex-1 truncate">
                        <h3 className="text-sm font-bold text-white group-hover:text-indigo-400 transition-colors truncate">
                          {proj.name}
                        </h3>
                        <span className="text-[11px] text-gray-500">
                          {new Date(proj.created_at).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#202533] border border-[#343d52] text-indigo-300">
                          {ratioBadge}
                        </span>
                        {isMulti && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-900/60 border border-purple-600/40 text-purple-300 flex items-center gap-0.5">
                            <Globe size={10} /> Multi
                          </span>
                        )}
                        <button
                          onClick={(e) => handleDelete(proj.id, e)}
                          className="text-gray-500 hover:text-red-400 p-1 rounded transition-colors"
                          title="Delete project"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 py-3 border-y border-[#242834] my-2 text-center">
                      <div>
                        <div className="text-[10px] text-gray-500 uppercase font-medium">Visuals</div>
                        <div className="text-xs font-bold text-gray-200 mt-0.5">{visualCount}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-gray-500 uppercase font-medium">Scenes</div>
                        <div className="text-xs font-bold text-gray-200 mt-0.5">{sceneCount}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-gray-500 uppercase font-medium">Voiceover</div>
                        <div className="text-xs font-bold text-gray-200 mt-0.5">
                          {hasAudio ? (
                            <span className="text-emerald-400">Ready</span>
                          ) : (
                            <span className="text-gray-500">None</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-2 pt-2 flex items-center justify-between text-xs text-gray-400 group-hover:text-indigo-400 font-semibold transition-colors">
                    <span>Open Editor</span>
                    <span>→</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Global Background Exports Drawer */}
      <ExportManagerDrawer />
    </div>
  );
};
