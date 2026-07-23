const USER_KEY = "campfire_user_id";
const PSEUDO_KEY = "campfire_pseudo";

export type LocalIdentity = { userId: string; pseudo: string };

export function getLocalIdentity(): LocalIdentity | null {
  if (typeof window === "undefined") return null;
  try {
    const userId = window.localStorage.getItem(USER_KEY);
    const pseudo = window.localStorage.getItem(PSEUDO_KEY);
    if (!userId || !pseudo) return null;
    return { userId, pseudo };
  } catch {
    return null;
  }
}

export function setLocalIdentity(identity: LocalIdentity) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(USER_KEY, identity.userId);
    window.localStorage.setItem(PSEUDO_KEY, identity.pseudo);
  } catch {
    /* ignore */
  }
}

export function clearLocalIdentity() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(USER_KEY);
    window.localStorage.removeItem(PSEUDO_KEY);
  } catch {
    /* ignore */
  }
}