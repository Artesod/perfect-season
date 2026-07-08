export function TraitTags({ traits }: { traits: readonly string[] }) {
  if (traits.length === 0) return <span className="muted">—</span>;
  return (
    <span className="trait-tags">
      {traits.map((trait) => (
        <span key={trait} className="trait-tag">
          {trait}
        </span>
      ))}
    </span>
  );
}
