import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  // The development badge defaults to the bottom left, over the sidebar's Accesibilidad row.
  devIndicators: { position: "bottom-right" },
  // A week's tasks moved into the person page (?semana=); the query (recordId, estado, page, tarea)
  // passes through, so old links and bookmarks still open the same view.
  async redirects() {
    return [
      {
        source: "/employees/:employeeId/weeks/:periodStart",
        destination: "/employees/:employeeId?semana=:periodStart",
        permanent: false,
      },
    ];
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      // Tailwind only processes the global stylesheet; component styles are
      // CSS Modules and must keep their module type (a "*.css" rule with
      // `as: "*.css"` turns them into global CSS and empties their classes).
      "globals.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
