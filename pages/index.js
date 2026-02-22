import Head from "next/head";

export default function Home() {
  const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
    databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL || "",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || "",
  };

  return (
    <>
      <Head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Bean&apos;s Coffee Shop</title>
      </Head>

      <div id="app" className="app">
        <main id="auth-view" className="split">
          <section className="panel">
            <h1>Bean&apos;s Coffee Shop</h1>
            <p className="subtitle">Create an account or log in to hang out at your coffee table.</p>

            <div className="card">
              <h2>Create account / Log in</h2>
              <label className="field">
                <span>Email</span>
                <input id="email" type="email" placeholder="you@school.edu" />
              </label>
              <label className="field">
                <span>Password</span>
                <input id="password" type="password" placeholder="••••••••" />
              </label>

              <div className="actions">
                <button id="email-signup" className="btn">
                  Create account
                </button>
                <button id="email-login" className="btn ghost">
                  Log in
                </button>
              </div>

              <div className="divider">or</div>
              <button id="google-login" className="btn">
                Continue with Google
              </button>
            </div>
          </section>
        </main>

        <main id="dashboard-view" className="dashboard hidden">
          <header className="dash-header">
            <img className="logo" src="assets/beans-logo.svg" alt="Bean's Coffee Shop logo" />
            <div className="user-actions">
              <div className="user-chip">
                <div id="user-name" className="user-name">
                  Student
                </div>
                <div id="user-email" className="user-email">
                  student@school.edu
                </div>
              </div>
              <button id="logout" className="btn ghost">
                Log out
              </button>
            </div>
          </header>

          <section className="dash-content">
            <div className="card">
              <h2>Create a table</h2>
              <p className="subtitle">Start a table and invite your friends.</p>
              <label className="field">
                <span>Table name</span>
                <input id="table-name" type="text" placeholder="e.g. Window Table" />
              </label>
              <button id="create-table" className="btn">
                Create table
              </button>
            </div>

            <div className="card">
              <h2>Join a table</h2>
              <p className="subtitle">Enter a code from a friend.</p>
              <label className="field">
                <span>Table code</span>
                <input id="member-table" type="text" placeholder="e.g. ABCDEF" />
              </label>
              <button id="member-join" className="btn">
                Join table
              </button>
            </div>
          </section>
        </main>

        <main id="table-view" className="table-view hidden">
          <header className="table-header">
            <div className="table-header-main">
              <img className="table-logo" src="assets/beans-logo.svg" alt="Bean's Coffee Shop logo" />
            </div>
            <div className="table-actions">
              <div id="table-timer" className="table-timer">
                00:00:00
              </div>
              <button id="leave-table" className="btn ghost">
                Leave table
              </button>
            </div>
          </header>

          <section className="table-body">
            <div className="table-main">
              <div className="table-center">
                <div className="table-stage">
                  <div id="table-stage-title" className="table-stage-title">
                    Table for 1 guest
                  </div>
                  <img id="table-image" className="table-image" src="assets/tables/table-1.png" alt="Coffee table" />
                  <div id="table-stage-note" className="table-stage-note">
                    1 person at this table
                  </div>
                </div>
              </div>

              <aside className="table-corner">
                <div className="mini-widget">
                  <div className="mini-title">Room</div>
                  <div id="table-title" className="table-title">
                    Coffee Table
                  </div>
                  <div className="room-code-row">
                    <div id="table-code" className="table-code">
                      Code: TABLE00
                    </div>
                    <button id="copy-table-code" className="btn ghost room-copy-btn" type="button">
                      Copy
                    </button>
                  </div>
                  <div id="table-created-at" className="table-created-at">
                    Started just now
                  </div>
                </div>

                <div className="mini-widget chat-widget">
                  <div className="mini-title">Table chat</div>
                  <div id="chat-empty" className="chat-empty">
                    No messages yet.
                  </div>
                  <div id="chat-log" className="chat-log"></div>
                  <form id="chat-form" className="chat-compose">
                    <input id="chat-input" type="text" maxLength="500" placeholder="Message this table" />
                    <button id="chat-send" className="btn" type="submit">
                      Send
                    </button>
                  </form>
                </div>

                <div className="mini-widget">
                  <div className="mini-title">Music</div>
                  <label className="field">
                    <span>Track URL</span>
                    <input id="music-url" type="url" placeholder="Paste an audio URL" />
                  </label>
                  <button id="ambient-music" className="btn ghost" type="button">
                    Play ambient cafe
                  </button>
                  <button id="set-music" className="btn" type="button">
                    Load my track
                  </button>
                  <audio id="music-player" controls></audio>
                </div>
              </aside>
            </div>
          </section>
        </main>
      </div>

      <div id="expiry-modal" className="modal-overlay hidden" role="dialog" aria-modal="true" aria-labelledby="expiry-title">
        <div className="modal-card">
          <h3 id="expiry-title">Coffee shop notice</h3>
          <p id="expiry-message" className="modal-message">
            You&apos;ve been cozy at this table for quite a while. The coffee shop is kindly asking you to move to a fresh table so others can sit
            too.
          </p>
          <p className="modal-tip">Tip: Go and walk around for a bit and come back in to a new table. They wont notice! 😉</p>
          <button id="expiry-ok" className="btn" type="button">
            Got it
          </button>
        </div>
      </div>

      <script
        dangerouslySetInnerHTML={{
          __html: `window.__FIREBASE_CONFIG=${JSON.stringify(firebaseConfig)};`,
        }}
      />
      <script type="module" src="/app.js"></script>
    </>
  );
}