import Link from "next/link";
import { Button, ExternalLinkIcon } from '../../ui';
import { useLearning } from '@/contexts/LearningContext';
import type { Lesson } from '@/types/learning';

export default function LearnContent() {
    const { activeLessons, hoveredElementId } = useLearning();

    return (
        <div className="flex flex-col items-start justify-start h-full w-full gap-2">
            <h1 className="text-xl text-left text-[var(--foreground)]">Contextual Learning</h1>
            <p className="text-sm text-left text-[var(--foreground-secondary)]">First and foremost, we are here to help you learn. This learning portal is designed to adapt to what you are doing. Relevant lessons will show up depending on what you are doing.</p>
            <div className="w-full py-2 gap-2">
                <h2>Relevant Lessons</h2>
                <ul className="w-full py-2">
                    {activeLessons.map((lesson: Lesson) => {
                        const isActive = hoveredElementId && lesson.elementIds.includes(hoveredElementId);
                        return (
                        <li key={lesson.id} className="border-b border-[var(--border-subtle)] last:border-b-0 py-2">
                            <Link 
                                href={lesson.url} 
                                target="_blank" 
                                className={`text-sm ${isActive ? 'text-[var(--foreground)]' : 'text-[var(--foreground-secondary)]'} hover:text-[var(--foreground)] transition-colors`}
                            >
                                {lesson.title}
                            </Link>
                        </li>
                        );
                    })}
                </ul>
                <div className="flex justify-start">
                    <Button
                        variant="primary"
                        size="md"
                        icon={<ExternalLinkIcon size="sm" />}
                        iconPosition="right"
                        onClick={() => window.open('https://docs.muscadine.io/', '_blank', 'noopener,noreferrer')}
                    >
                        All Resources
                    </Button>
                </div>
            </div>
        </div>
    )
}