import { Navigate } from "@solidjs/router";

export default function ProtectedRoute(props) {
  const user = localStorage.getItem('user');

  // If there's no user, OR if a previous error saved the string "undefined", redirect
  if (!user || user === 'undefined') {
    // Clear out the bad data just in case
    localStorage.removeItem('user');
    return <Navigate href={`/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`} />;
  }

  return props.children;
}
