import { displayName, useAccountStore } from '../account';
import './AccountBar.css';

/**
 * Header account controls. Hidden entirely when Supabase isn't configured;
 * otherwise a Google sign-in button, or the signed-in identity + sync state.
 */
export function AccountBar() {
  const enabled = useAccountStore((s) => s.enabled);
  const user = useAccountStore((s) => s.user);
  const syncStatus = useAccountStore((s) => s.syncStatus);
  const signIn = useAccountStore((s) => s.signIn);
  const signOut = useAccountStore((s) => s.signOut);

  if (!enabled) return null;

  if (!user) {
    return (
      <button
        type="button"
        className="btn"
        title="Save progress to the cloud and appear on leaderboards"
        onClick={signIn}
      >
        Sign in with Google
      </button>
    );
  }

  return (
    <div className="account-bar">
      {syncStatus === 'syncing' && <span className="tag">Syncing…</span>}
      {syncStatus === 'synced' && <span className="tag account-synced">Synced</span>}
      {syncStatus === 'error' && (
        <span className="tag account-sync-error" title="Cloud sync failed — progress is still saved locally">
          Sync failed
        </span>
      )}
      <span className="account-name" title={user.email}>
        {displayName(user)}
      </span>
      <button type="button" className="btn btn-ghost btn-small" onClick={signOut}>
        Sign out
      </button>
    </div>
  );
}
