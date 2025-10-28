'use client';

import LearnContent from './LearnContent';

export default function LearnSection() {
    return (
        <div className="flex flex-col h-full">
            <div className="flex-1 flex items-center justify-center p-8">
                <div className="flex flex-col items-center gap-4 p-8 bg-[var(--surface)] rounded-lg border border-[var(--border-subtle)] max-w-4xl w-full">
                    <LearnContent />
                </div>
            </div>
        </div>
    );
}
