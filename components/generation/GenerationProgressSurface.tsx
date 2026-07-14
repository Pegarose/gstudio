/*
 * Hallmark · component: generation progress surface · genre: technical · theme: existing G Studio semantic utilities
 * pre-emit critique: P5 H5 E4 S5 R5 V4 · motion: mark pulse + active rail pulse (reduced motion disabled)
 */

import React from "react";

export type GenerationProgressPhase =
  | "workspace"
  | "understand"
  | "plan"
  | "build"
  | "apply"
  | "verify";

export interface GenerationProgressSurfaceProps {
  phase: GenerationProgressPhase;
  status: string;
  detail?: string;
  targetLabel?: string;
}

const GENERATION_STAGES: ReadonlyArray<{
  phase: GenerationProgressPhase;
  label: string;
  operation: string;
  progressLabel: string;
  targetLabel: string;
}> = [
  {
    phase: "workspace",
    label: "Workspace",
    operation: "Preparing your workspace",
    progressLabel: "Generation progress",
    targetLabel: "Target",
  },
  {
    phase: "understand",
    label: "Understand",
    operation: "Understanding your brief",
    progressLabel: "Generation progress",
    targetLabel: "Target",
  },
  {
    phase: "plan",
    label: "Plan",
    operation: "Planning the build",
    progressLabel: "Generation progress",
    targetLabel: "Target",
  },
  {
    phase: "build",
    label: "Build",
    operation: "Building the application",
    progressLabel: "Generation progress",
    targetLabel: "Target",
  },
  {
    phase: "apply",
    label: "Apply",
    operation: "Applying the candidate",
    progressLabel: "Generation progress",
    targetLabel: "Target",
  },
  {
    phase: "verify",
    label: "Verify",
    operation: "Verifying the result",
    progressLabel: "Generation progress",
    targetLabel: "Target",
  },
];

function getProgressValue(phase: GenerationProgressPhase) {
  const phaseIndex = GENERATION_STAGES.findIndex((stage) => stage.phase === phase);

  return Math.round((phaseIndex / (GENERATION_STAGES.length - 1)) * 100);
}

export function GenerationProgressSurface({
  phase,
  status,
  detail,
  targetLabel,
}: GenerationProgressSurfaceProps) {
  const activeIndex = GENERATION_STAGES.findIndex((stage) => stage.phase === phase);
  const activeStage = GENERATION_STAGES[activeIndex];
  const progressValue = getProgressValue(phase);

  return (
    <section
      aria-atomic="true"
      aria-live="polite"
      className="w-full max-w-3xl overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
      data-phase={phase}
      role="status"
    >
      <div className="grid min-w-0 gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(16rem,0.85fr)]">
        <div className="min-w-0">
          <div className="flex items-start gap-4">
            <div aria-hidden="true" className="relative mt-0.5 h-11 w-11 flex-none">
              <span className="absolute inset-1 rounded-2xl border-2 border-orange-500/80 bg-orange-50/80 animate-pulse motion-reduce:animate-none dark:bg-orange-950/20" />
              <span className="absolute inset-2.5 rotate-12 rounded-xl border-2 border-neutral-900/80 dark:border-neutral-100/80" />
              <span className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-orange-500 shadow-sm" />
            </div>

            <div className="min-w-0 space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-orange-600 dark:text-orange-400">
                {activeStage.operation}
              </p>
              <p className="break-words text-base font-semibold leading-6 text-neutral-900 dark:text-white">
                {status}
              </p>
            </div>
          </div>

          {(detail || targetLabel) && (
            <div className="mt-5 border-l-2 border-orange-200 pl-3 dark:border-orange-900/70">
              {detail && (
                <p className="break-words text-sm leading-5 text-neutral-600 dark:text-neutral-300">
                  {detail}
                </p>
              )}
              {targetLabel && (
                <p className="mt-1 break-all text-xs font-medium text-neutral-500 dark:text-neutral-400">
                  {activeStage.targetLabel}: {targetLabel}
                </p>
              )}
            </div>
          )}

          <div className="mt-6">
            <div className="mb-2 flex items-center justify-between text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
              <span>{activeStage.progressLabel}</span>
              <span>{activeStage.label}</span>
            </div>
            <div
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={progressValue}
              aria-valuetext={`${activeStage.label}: ${status}`}
              className="h-1.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800"
              role="progressbar"
            >
              <span
                className="block h-full rounded-full bg-orange-500 transition-[width] duration-500 ease-out"
                style={{ width: `${progressValue}%` }}
              />
            </div>
          </div>
        </div>

        <ol aria-label="Generation stages" className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2">
          {GENERATION_STAGES.map((stage, index) => {
            const isActive = stage.phase === phase;
            const isComplete = index < activeIndex;

            return (
              <li
                aria-current={isActive ? "step" : undefined}
                className={`relative min-w-0 rounded-xl border px-3 py-2.5 transition-colors ${
                  isActive
                    ? "border-orange-200 bg-orange-50 text-neutral-900 dark:border-orange-900/80 dark:bg-orange-950/20 dark:text-white"
                    : isComplete
                      ? "border-neutral-200 bg-neutral-50 text-neutral-700 dark:border-neutral-800 dark:bg-neutral-800/60 dark:text-neutral-200"
                      : "border-neutral-100 bg-white text-neutral-400 dark:border-neutral-800/70 dark:bg-neutral-900 dark:text-neutral-500"
                }`}
                data-stage={stage.phase}
                key={stage.phase}
              >
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-orange-500 animate-pulse motion-reduce:animate-none"
                  />
                )}
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className={`flex h-5 w-5 flex-none items-center justify-center rounded-full text-[10px] font-bold ${
                      isActive
                        ? "bg-orange-500 text-white"
                        : isComplete
                          ? "bg-neutral-800 text-white dark:bg-neutral-100 dark:text-neutral-900"
                          : "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400"
                    }`}
                  >
                    {isComplete ? "✓" : index + 1}
                  </span>
                  <span className="min-w-0 truncate text-xs font-semibold">{stage.label}</span>
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
