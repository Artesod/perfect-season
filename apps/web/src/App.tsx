import { useGameStore } from './store';
import { AccountBar } from './components/AccountBar';
import { GlossaryPanel } from './onboarding/GlossaryPanel';
import { HelpMenu } from './onboarding/HelpMenu';
import { tourForStatus } from './onboarding/tours';
import { DraftScreen } from './screens/DraftScreen';
import { HomeScreen } from './screens/HomeScreen';
import { RunSummaryScreen } from './screens/RunSummaryScreen';
import { SeasonScreen } from './screens/SeasonScreen';

function CurrentScreen() {
  const run = useGameStore((s) => s.run);
  if (!run) return <HomeScreen />;
  switch (run.status) {
    case 'drafting':
      return <DraftScreen />;
    case 'in-season':
    case 'playoffs':
      return <SeasonScreen />;
    case 'won':
    case 'lost':
      return <RunSummaryScreen />;
  }
}

function App() {
  const run = useGameStore((s) => s.run);
  const exitRun = useGameStore((s) => s.exitRun);

  const inProgress = run !== null && (run.status === 'drafting' || run.status === 'in-season');

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">
          Perfect <span className="accent">Season</span>
        </h1>
        <div className="app-header-run">
          {run && (
            <>
              <span className="tag">Seed {run.seed}</span>
              <span className="tag">Ascension {run.ascension}</span>
              {inProgress && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    if (window.confirm('Abandon this run? Progress will be lost.')) exitRun();
                  }}
                >
                  Abandon run
                </button>
              )}
            </>
          )}
          <HelpMenu tourId={tourForStatus(run?.status ?? null)} />
          <AccountBar />
        </div>
      </header>
      <main className="app-main">
        <CurrentScreen />
      </main>
      <GlossaryPanel />
    </div>
  );
}

export default App;
