import React, { useState } from 'react';
import { Dashboard } from './pages/Dashboard';
import { EditorPage } from './pages/Editor';

export const App: React.FC = () => {
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);

  if (activeProjectId) {
    return (
      <EditorPage
        projectId={activeProjectId}
        onBackToProjects={() => setActiveProjectId(null)}
      />
    );
  }

  return <Dashboard onOpenProject={(id) => setActiveProjectId(id)} />;
};

export default App;
