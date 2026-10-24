import { useEffect, useState } from 'preact/hooks';
import { getMeta, loadProject, requestPersistence, setMeta } from './db';
import type { Project } from './model';
import { BoardScreen } from './ui/BoardScreen';
import { Home } from './ui/Home';
import { InstallBanner } from './ui/InstallBanner';

/** Opens the last board on launch; otherwise the world list. */
export function App() {
  const [project, setProject] = useState<Project | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void requestPersistence();
    (async () => {
      try {
        const id = await getMeta<string>('currentProjectId');
        const p = id ? await loadProject(id) : undefined;
        if (p) setProject(p);
      } catch (e) {
        console.error(e);
      }
      setReady(true);
    })();
  }, []);

  const open = (p: Project) => {
    void setMeta('currentProjectId', p.id);
    setProject(p);
  };
  const exit = () => {
    void setMeta('currentProjectId', null);
    setProject(null);
  };

  if (!ready) return <div class="splash" />;
  return (
    <>
      {project ? <BoardScreen key={project.id} project={project} onExit={exit} onOpen={open} /> : <Home onOpen={open} />}
      <InstallBanner />
    </>
  );
}
