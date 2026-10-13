import React from 'react';
import { useExportStore } from '../../stores/exportStore';
import { triggerBrowserDownload } from '../../utils/downloadHelper';
import { X, Download, Loader2, CheckCircle2, Clock, AlertCircle, Trash2, ArrowUpRight } from 'lucide-react';

interface ExportManagerDrawerProps {
  onOpenProject?: (projectId: string) => void;
}

export const ExportManagerDrawer: React.FC<ExportManagerDrawerProps> = ({ onOpenProject }) => {
  const { jobs, isDrawerOpen, setDrawerOpen, cancelExport } = useExportStore();
  const jobList = Object.values(jobs).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  if (!isDrawerOpen) return null;

  const activeCount = jobList.filter((j) => j.status === 'rendering' || j.status === 'queued' || j.status === 'pending').length;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm transition-opacity animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-[#161922] border-l border-[#2B3140] h-full flex flex-col shadow-2xl">
        {/* Header */}
        <div className="p-5 border-b border-[#252B3A] flex items-center justify-between bg-[#1A1E29]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Download size={16} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
                Export Manager
                {activeCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    {activeCount} active
                  </span>
                )}
              </h2>
              <p className="text-[11px] text-gray-400">Independent background exports across all projects</p>
            </div>
          </div>
          <button
            onClick={() => setDrawerOpen(false)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#252B3A] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {jobList.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-center p-6 text-gray-500">
              <Download size={32} className="mb-2 opacity-40 text-gray-400" />
              <p className="text-sm font-medium text-gray-300">No export jobs yet</p>
              <p className="text-xs text-gray-500 mt-1">
                When you export a project, it will run independently in the background here.
              </p>
            </div>
          ) : (
            jobList.map((job) => {
              const downloadUrl = job.download_url || `/api/render-jobs/${job.id}/download`;
              const cleanName = (job.project_name || 'AutoVideo_Export').replace(/[^a-zA-Z0-9_\-]/g, '_');
              const filename = `${cleanName}_${job.id.slice(0, 8)}.mp4`;

              return (
                <div
                  key={job.id}
                  className="bg-[#1C202C] border border-[#2B3140] rounded-xl p-4 flex flex-col gap-2.5 hover:border-[#3B4357] transition-all shadow-sm"
                >
                  {/* Top line: Project name & status badge */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="truncate flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold text-white truncate">
                          {job.project_name || 'Project Export'}
                        </span>
                        {onOpenProject && (
                          <button
                            onClick={() => {
                              setDrawerOpen(false);
                              onOpenProject(job.project_id);
                            }}
                            title="Open project editor"
                            className="text-gray-400 hover:text-indigo-400 p-0.5 rounded transition-colors"
                          >
                            <ArrowUpRight size={13} />
                          </button>
                        )}
                      </div>
                      <span className="text-[10px] text-gray-500 font-mono">ID: {job.id.slice(0, 10)}</span>
                    </div>

                    {/* Status Badge */}
                    {job.status === 'rendering' && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-indigo-500/15 border border-indigo-500/30 text-indigo-300">
                        <Loader2 size={12} className="animate-spin text-indigo-400" />
                        {job.progress.toFixed(0)}%
                      </span>
                    )}

                    {job.status === 'queued' && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-500/15 border border-amber-500/30 text-amber-300">
                        <Clock size={12} />
                        Queued #{job.queue_position || 1}
                      </span>
                    )}

                    {job.status === 'completed' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">
                        <CheckCircle2 size={11} />
                        Done
                      </span>
                    )}

                    {job.status === 'failed' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-500/15 border border-red-500/30 text-red-300">
                        <AlertCircle size={11} />
                        Failed
                      </span>
                    )}

                    {job.status === 'cancelled' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-500/15 border border-gray-500/30 text-gray-400">
                        Cancelled
                      </span>
                    )}
                  </div>

                  {/* Progress Bar for active jobs */}
                  {(job.status === 'rendering' || job.status === 'queued') && (
                    <div className="w-full bg-[#12151D] h-2 rounded-full overflow-hidden border border-[#2B3140]">
                      <div
                        className={`h-full transition-all duration-300 ${
                          job.status === 'queued' ? 'bg-amber-500/40 animate-pulse' : 'bg-gradient-to-r from-indigo-500 to-purple-500'
                        }`}
                        style={{ width: `${Math.max(4, job.progress)}%` }}
                      />
                    </div>
                  )}

                  {/* Error display */}
                  {job.status === 'failed' && job.error_message && (
                    <p className="text-[11px] text-red-300/80 bg-red-950/30 p-2 rounded border border-red-900/30 truncate">
                      {job.error_message}
                    </p>
                  )}

                  {/* Actions footer */}
                  <div className="flex items-center justify-between pt-1 border-t border-[#252B3A]">
                    <span className="text-[10px] text-gray-500">
                      {new Date(job.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>

                    <div className="flex items-center gap-2">
                      {(job.status === 'rendering' || job.status === 'queued') && (
                        <button
                          onClick={() => cancelExport(job.id)}
                          className="px-2.5 py-1 text-[11px] font-medium text-gray-400 hover:text-red-400 hover:bg-red-950/30 rounded border border-transparent hover:border-red-900/40 transition-colors"
                        >
                          Cancel
                        </button>
                      )}

                      {job.status === 'completed' && (
                        <button
                          onClick={() => triggerBrowserDownload(downloadUrl, filename)}
                          className="flex items-center gap-1.5 px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-md text-xs font-semibold shadow-sm transition-colors cursor-pointer"
                        >
                          <Download size={13} /> Download Video
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
