export const passingFiles = [
  {
    path: "src/App.tsx",
    content: `
      export default function App() {
        return (
          <main>
            <h1>Plan better projects</h1>
            <p className="text-muted">A focused workspace for your team.</p>
            <button className="primary focus-visible:ring-2">Start a project</button>
          </main>
        );
      }
    `,
  },
];

export const passingBrief = {
  contentFacts: ["Used by the product team at Acme"],
  allowedPlaceholders: ["metric to confirm"],
};

export const passingPlan = {
  primaryCta: "Start a project",
  declaredPackages: [],
};
