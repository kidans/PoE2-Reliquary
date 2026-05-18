import "./styles.css";

const root = document.querySelector<HTMLDivElement>("#root");

if (!root) {
  throw new Error("Lumen-Scan root element was not found.");
}

root.innerHTML = `
  <main class="overlay-root">
    <section class="phase-card">
      <p class="eyebrow">Lumen-Scan</p>
      <h1>Phase 1 overlay shell online</h1>
      <p>
        Backend workers are initialized for clipboard scans and Client.txt log
        streaming. UI controls arrive in Phase 4.
      </p>
    </section>
  </main>
`;
