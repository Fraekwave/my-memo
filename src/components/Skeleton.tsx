/**
 * Skeleton placeholders for initial loading state.
 * Renders instantly before auth/data resolves, replacing full-screen spinners.
 * Colors: stone-100/stone-200 pulse — matches the app's light stone theme.
 */

function SkeletonPulse({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-lg bg-stone-100 ${className ?? ''}`} />
  );
}

/** Mimics the TabBar with 3 pill-shaped tab placeholders */
export function SkeletonTabBar() {
  return (
    <div className="flex items-center gap-2 px-1 py-3">
      <SkeletonPulse className="h-8 w-16 rounded-full" />
      <SkeletonPulse className="h-8 w-20 rounded-full" />
      <SkeletonPulse className="h-8 w-18 rounded-full" />
      <SkeletonPulse className="h-8 w-14 rounded-full" />
    </div>
  );
}

/** Mimics the TaskForm input area */
export function SkeletonTaskForm() {
  return (
    <div className="bg-white border-x border-stone-200 shadow-lg shadow-stone-200/50">
      <div className="p-4">
        <SkeletonPulse className="h-10 w-full rounded-xl" />
      </div>
    </div>
  );
}

/** Mimics 5 task items in the list */
export function SkeletonTaskList() {
  return (
    <div className="flex flex-col gap-3 p-6 sm:p-8 min-h-[300px]">
      {[0.95, 0.85, 0.75, 0.6, 0.45].map((opacity, i) => (
        <div key={i} className="flex items-center gap-3" style={{ opacity }}>
          <SkeletonPulse className="h-5 w-5 rounded-full flex-shrink-0" />
          <SkeletonPulse className={`h-5 flex-1 ${i % 2 === 0 ? 'max-w-[75%]' : 'max-w-[55%]'}`} />
        </div>
      ))}
    </div>
  );
}

/** Full app-shell skeleton: tab bar + form + task list */
export function SkeletonAppContent() {
  return (
    <>
      <div className="sticky top-0 z-40 bg-stone-50 -mx-4 sm:-mx-8 px-4 sm:px-8">
        <SkeletonTabBar />
        <SkeletonTaskForm />
        <div className="h-0 border-x border-stone-200 shadow-[0_2px_4px_-1px_rgba(0,0,0,0.06)]" />
      </div>
      <div className="bg-white rounded-b-3xl shadow-lg shadow-stone-200/50 border border-stone-200 border-t-0">
        <SkeletonTaskList />
      </div>
    </>
  );
}
