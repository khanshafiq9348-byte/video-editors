import { create } from 'zustand';
import { RenderJob } from '../types/timeline';
import { api } from '../services/api';

interface ExportStoreState {
  jobs: Record<string, RenderJob>;
  projectLatestJobs: Record<string, RenderJob>;
  isDrawerOpen: boolean;
  isLoading: boolean;

  setDrawerOpen: (open: boolean) => void;
  refreshAllJobs: () => Promise<void>;
  cancelExport: (jobId: string) => Promise<void>;
  startPolling: () => () => void;
}

let pollingInterval: any = null;

export const useExportStore = create<ExportStoreState>((set, get) => ({
  jobs: {},
  projectLatestJobs: {},
  isDrawerOpen: false,
  isLoading: false,

  setDrawerOpen: (open: boolean) => set({ isDrawerOpen: open }),

  refreshAllJobs: async () => {
    try {
      const allJobs = await api.getAllRenderJobs();
      const jobsMap: Record<string, RenderJob> = {};
      const projMap: Record<string, RenderJob> = {};

      for (const job of allJobs) {
        jobsMap[job.id] = job;
        // Keep latest job per project (allJobs is sorted created_at desc)
        if (!projMap[job.project_id]) {
          projMap[job.project_id] = job;
        }

        // Track completed jobs without auto-downloading
        // Users can download anytime via explicit Download button
      }

      set({ jobs: jobsMap, projectLatestJobs: projMap });
    } catch (err) {
      console.warn('Failed to refresh export jobs', err);
    }
  },

  cancelExport: async (jobId: string) => {
    try {
      await api.cancelRenderJob(jobId);
      await get().refreshAllJobs();
    } catch (err) {
      console.error('Failed to cancel job', err);
    }
  },

  startPolling: () => {
    // Initial fetch
    get().refreshAllJobs();

    if (pollingInterval) {
      clearInterval(pollingInterval);
    }

    pollingInterval = setInterval(async () => {
      await get().refreshAllJobs();
    }, 2000);

    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
      }
    };
  },
}));
