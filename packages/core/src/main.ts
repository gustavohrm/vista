import "./style.css";

const app = document.querySelector<HTMLDivElement>("#app");
if (app) {
  app.innerHTML = `
    <div class="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-6">
      <h1 class="text-4xl font-bold mb-2">Vista</h1>
      <p class="text-slate-400">Your second-brain notes and data management system.</p>
    </div>
  `;
}
