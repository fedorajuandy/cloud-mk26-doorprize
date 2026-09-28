import { HttpStatusCode } from "@solidjs/start";
import { A } from "@solidjs/router";
export default function NotFound() {
  return (
    <main class="login-page">
      <HttpStatusCode code={404} />
      <section class="login-card">
        <p class="eyebrow">404</p>
        <h1>Page not found</h1>
        <p class="muted">This page is not part of the admin CMS.</p>
        <A href="/">Back to participants</A>
      </section>
    </main>
  );
}
