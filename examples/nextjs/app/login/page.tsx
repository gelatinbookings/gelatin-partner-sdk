export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  "1": "That password is not right.",
  limit: "Too many attempts. Wait ten minutes and try again.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const message = error ? ERRORS[error] : undefined;
  return (
    <main className="login">
      <section className="panel" aria-labelledby="login-title">
        <form className="panel-body" action="/api/login" method="post">
          <div>
            <h1 id="login-title" style={{ fontSize: 18 }}>Sign in to the demo</h1>
            <p className="subtle">This demo partner creates booking requests in Gelatin&apos;s sandbox. Use the DEMO_ACCESS_PASSWORD it was set up with, or ask the Gelatin team.</p>
          </div>
          {message && <p className="notice notice-error" role="alert">{message}</p>}
          <label className="field">
            Password
            <input name="password" type="password" autoComplete="current-password" required maxLength={200} autoFocus />
          </label>
          <button className="button button-wide" type="submit">Sign in</button>
        </form>
      </section>
    </main>
  );
}
