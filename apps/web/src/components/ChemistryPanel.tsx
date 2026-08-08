import type { ChemistryEffect } from '@perfect-season/shared';

export function ChemistryPanel({
  effects,
  delta,
  cohesion,
}: {
  effects: readonly ChemistryEffect[];
  delta: number;
  cohesion?: number;
}) {
  return (
    <section className="panel">
      <div className="panel-head">
        <h3>Chemistry</h3>
        <span className={`chem-total ${delta > 0 ? 'good' : delta < 0 ? 'bad' : 'muted'}`}>
          {delta > 0 ? '+' : ''}
          {delta.toFixed(1)}
        </span>
      </div>
      {cohesion !== undefined && (
        <p className="muted chem-cohesion">
          Cohesion {Math.round(cohesion * 100)}% — friction fades as the team gels
        </p>
      )}
      {effects.length === 0 ? (
        <p className="muted">No synergies yet — traits combine as the roster fills out.</p>
      ) : (
        <ul className="chem-list">
          {effects.map((effect) => (
            <li key={effect.id} className="chem-item">
              <span className={`chem-delta ${effect.strengthDelta >= 0 ? 'good' : 'bad'}`}>
                {effect.strengthDelta > 0 ? '+' : ''}
                {effect.strengthDelta}
              </span>
              <span>
                {effect.label}
                {effect.kind === 'friction' && effect.strengthDelta < 0 && (
                  <span className="muted"> · resolving with wins</span>
                )}
                {effect.kind === 'structural' && (
                  <span className="muted"> · fix via roster moves</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
