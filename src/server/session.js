export function getCookie(req, name) {
  const header = String(req.headers?.cookie || '');
  for (const pair of header.split(';')) {
    const idx = pair.indexOf('=');
    if (idx < 0) continue;
    if (pair.slice(0, idx).trim() !== name) continue;

    try {
      return decodeURIComponent(pair.slice(idx + 1).trim());
    } catch {
      return '';
    }
  }
  return '';
}

export function sessionForRequest(req, sessions, now = Date.now()) {
  const sid = getCookie(req, 'syxlor_sid');
  const session = sid ? sessions.get(sid) : null;

  // An expired access token can still be renewed while its refresh token is valid.
  if (session && session.expiresAt && session.expiresAt < now && !session.refreshToken) {
    sessions.delete(sid);
    return null;
  }

  return session || null;
}
