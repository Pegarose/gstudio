export const failingFiles = [
  {
    path: "src/App.tsx",
    content: `
      import { Sparkles } from "lucide-react";

      export default function App() {
        return (
          <main>
            <h1 className="italic">Build faster</h1>
            <h1>Ship more</h1>
            <p style={{ color: "#ff0000", fontFamily: "Inter" }}>A workspace</p>
            <button className="primary">Start a project</button>
            <button className="primary">Start a project</button>
            <Sparkles />
          </main>
        );
      }
    `,
  },
  {
    path: "../.env",
    content: "SECRET=not-a-real-secret",
  },
  {
    path: "src/App.tsx",
    content: "export const duplicate = true;",
  },
];

export const failingBrief = {
  contentFacts: [],
  allowedPlaceholders: ["metric to confirm"],
};

export const failingPlan = {
  primaryCta: "Start a project",
  declaredPackages: [],
};
