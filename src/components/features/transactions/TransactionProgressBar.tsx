'use client';

interface Step {
  label: string;
  completed: boolean;
  active: boolean;
}

interface TransactionProgressBarProps {
  steps: Step[];
  isSuccess: boolean;
}

export function TransactionProgressBar({ steps, isSuccess }: TransactionProgressBarProps) {
  if (steps.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        {steps.map((step, index) => (
          <div key={index} className="flex flex-col items-center flex-1">
            <span className={`text-xs font-medium ${
              step.active || step.completed
                ? 'text-[var(--foreground)]'
                : 'text-[var(--foreground-secondary)]'
            }`}>
              {step.label}
            </span>
          </div>
        ))}
      </div>
      
      <div className="relative h-2 bg-[var(--border-subtle)] rounded-full overflow-hidden">
        {steps.map((step, index) => {
          const segmentWidth = 100 / steps.length;
          const isSegmentCompleted = step.completed;
          const isSegmentActive = step.active && !step.completed;
          
          return (
            <div
              key={index}
              className="absolute h-full transition-all duration-300"
              style={{
                left: `${index * segmentWidth}%`,
                width: `${segmentWidth}%`,
                backgroundColor: isSegmentCompleted 
                  ? 'var(--primary)' 
                  : isSegmentActive 
                  ? 'var(--primary)' 
                  : 'transparent',
                zIndex: isSegmentCompleted ? 20 : (isSegmentActive ? 15 : 10),
              }}
            >
              {index < steps.length - 1 && (
                <div 
                  className="absolute right-0 top-0 w-px h-full bg-[var(--background)] z-10"
                  style={{ marginRight: '-1px' }}
                />
              )}
            </div>
          );
        })}
        
        {!isSuccess && steps.some(step => step.active && !step.completed) && (() => {
          const activeIndex = steps.findIndex(step => step.active && !step.completed);
          const completedCount = steps.filter((_, i) => i < activeIndex && steps[i].completed).length;
          const segmentWidth = 100 / steps.length;
          const pulseStart = completedCount * segmentWidth;
          const pulseWidth = (activeIndex - completedCount + 1) * segmentWidth;
          
          return (
            <div 
              className="absolute h-full bg-[var(--primary)] opacity-50 animate-pulse"
              style={{
                left: `${pulseStart}%`,
                width: `${pulseWidth}%`,
                zIndex: 5,
              }}
            />
          );
        })()}
      </div>
    </div>
  );
}

