/**
 * Download helper utility to trigger browser native file downloads.
 * Directly triggers the browser's download manager so the video is saved
 * into the user's local Downloads folder and available in the PC gallery.
 */
export const triggerBrowserDownload = (url: string, filename?: string) => {
  try {
    const link = document.createElement('a');
    link.href = url;
    if (filename) {
      link.download = filename;
    }
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      if (document.body.contains(link)) {
        document.body.removeChild(link);
      }
    }, 300);
  } catch (err) {
    console.error('Failed to trigger automatic browser download:', err);
  }
};
