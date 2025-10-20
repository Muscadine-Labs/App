'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';

interface ProgressItem {
    id: string;
    label: string;
    completed: boolean;
    url?: string;
}

interface ProgressBarProps {
    items: ProgressItem[];
    onUpdate?: (items: ProgressItem[]) => void;
}

export default function ProgressBar({ items, onUpdate }: ProgressBarProps) {
    const [progressItems, setProgressItems] = useState<ProgressItem[]>(() => {
        // Initialize state with localStorage data if available
        const saved = localStorage.getItem('progress-bar-state');
        if (saved) {
            try {
                const parsedItems = JSON.parse(saved);
                // Merge saved completion state with new items (preserving URLs)
                return items.map(item => {
                    const savedItem = parsedItems.find((saved: ProgressItem) => saved.id === item.id);
                    return {
                        ...item,
                        completed: savedItem?.completed || false
                    };
                });
            } catch (error) {
                console.error('Failed to parse saved progress:', error);
                return items;
            }
        }
        return items;
    });

    // Save to localStorage whenever progress changes
    useEffect(() => {
        localStorage.setItem('progress-bar-state', JSON.stringify(progressItems));
        onUpdate?.(progressItems);
    }, [progressItems, onUpdate]);

    const getFirstAvailableIndex = () => {
        // Find the first uncompleted item
        for (let i = 0; i < progressItems.length; i++) {
            if (!progressItems[i].completed) {
                return i;
            }
        }
        return -1; // All items completed
    };

    const toggleItem = (id: string) => {
        const itemIndex = progressItems.findIndex(item => item.id === id);
        if (itemIndex === -1) return;

        const firstAvailableIndex = getFirstAvailableIndex();
        
        // Only allow toggling the first available uncompleted item
        // OR allow unchecking the last completed item
        const canToggle = itemIndex === firstAvailableIndex || 
                         (progressItems[itemIndex].completed && itemIndex === firstAvailableIndex - 1) || (itemIndex === progressItems.length - 1 && progressItems[itemIndex].completed);
        
        if (!canToggle) return;

        setProgressItems(prev => 
            prev.map(item => 
                item.id === id 
                    ? { ...item, completed: !item.completed }
                    : item
            )
        );
    };

    const isItemClickable = (id: string) => {
        const itemIndex = progressItems.findIndex(item => item.id === id);
        if (itemIndex === -1) return false;
        
        const firstAvailableIndex = getFirstAvailableIndex();
        
        // Only the first uncompleted item is clickable
        // OR the last completed item (to allow unchecking)
        return itemIndex === firstAvailableIndex || 
               (progressItems[itemIndex].completed && itemIndex === firstAvailableIndex - 1) || (itemIndex === progressItems.length - 1 && progressItems[itemIndex].completed);
    };

    const getCompletedCount = () => {
        return progressItems.filter(item => item.completed).length;
    };

    const getLastCompletedIndex = () => {
        let lastIndex = -1;
        for (let i = 0; i < progressItems.length; i++) {
            if (progressItems[i].completed) {
                lastIndex = i;
            } else {
                break; // Stop at first uncompleted item for sequential progress
            }
        }
        return lastIndex;
    };

    const getProgressPercentage = () => {
        if (progressItems.length === 0) return 0;
        const lastCompletedIndex = getLastCompletedIndex();
        if (lastCompletedIndex === -1) return 0;
        // Progress fills up to the last completed checkpoint
        return ((lastCompletedIndex + 1) / progressItems.length) * 100;
    };

    const getBarHeight = () => {
        const itemCount = progressItems.length;
        if (itemCount === 0) return 200;
        // Calculate height to accommodate all items with proper spacing
        return Math.max(200, itemCount * 60);
    };

    return (
        <div className="flex flex-col w-full">
            <div className="flex items-start gap-6 w-full mb-6" style={{ minHeight: `${getBarHeight()}px` }}>
            {/* Vertical Progress Bar */}
            <div className="flex flex-col items-center relative" style={{ height: `${getBarHeight()}px` }}>
                {/* Progress Line */}
                <div 
                    className="w-1 bg-[var(--border-subtle)] relative"
                    style={{ height: `${getBarHeight()}px` }}
                >
                    {/* Filled portion */}
                    <div 
                        className="w-full bg-[var(--primary)] transition-all duration-500 ease-in-out"
                        style={{ 
                            height: `${getProgressPercentage()}%`,
                            minHeight: getCompletedCount() > 0 ? '4px' : '0px'
                        }}
                    />
                </div>
                
                {/* Checkpoints */}
                <div className="absolute flex flex-col justify-between w-6" style={{ height: `${getBarHeight()}px` }}>
                    {progressItems.map((item, index) => {
                        const clickable = isItemClickable(item.id);
                        const barHeight = getBarHeight();
                        const spacing = progressItems.length > 1 ? barHeight / (progressItems.length - 1) : 0;
                        
                        return (
                            <div
                                key={item.id}
                                onClick={() => toggleItem(item.id)}
                                className={`
                                    w-6 h-6 rounded-full border-2 transition-all duration-200 flex items-center justify-center flex-shrink-0
                                    ${item.completed 
                                        ? 'bg-[var(--primary)] border-[var(--primary)] text-white' 
                                        : clickable 
                                            ? 'bg-[var(--background)] border-[var(--border-subtle)]'
                                            : 'bg-[var(--background)] border-[var(--border-subtle)] border-opacity-50 cursor-not-allowed'
                                    }
                                `}
                                style={{ 
                                    position: 'absolute',
                                    top: `${index * spacing}px`,
                                    transform: 'translate(-50%, -50%)',
                                    left: '12px'
                                }}
                            >
                                {item.completed && (
                                    <svg 
                                        className="w-3 h-3" 
                                        fill="currentColor" 
                                        viewBox="0 0 20 20"
                                    >
                                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                    </svg>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Topics List */}
            <div className="flex-1 relative" style={{ height: `${getBarHeight()}px` }}>
                {progressItems.map((item, index) => {
                    const clickable = isItemClickable(item.id);
                    const barHeight = getBarHeight();
                    const spacing = progressItems.length > 1 ? barHeight / (progressItems.length - 1) : 0;
                    
                    return (
                        <div 
                            key={item.id}
                            onClick={() => {
                                if (clickable || item.completed) toggleItem(item.id);
                            }}
                            className={`
                                flex items-center gap-3 p-3 rounded-lg transition-all duration-200 absolute left-0 right-0
                                ${!clickable && !item.completed ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                                ${item.completed 
                                    ? 'bg-[var(--surface)] border border-[var(--primary)]' 
                                    : 'bg-[var(--surface)] border border-[var(--border-subtle)]'
                                }
                            `}
                            style={{
                                top: `${index * spacing}px`,
                                transform: 'translateY(-50%)'
                            }}
                        >
                            {/* Lesson label */}
                            <span className={`
                                flex-1 text-sm font-medium
                                ${item.completed 
                                    ? 'text-[var(--foreground-muted)]' 
                                    : 'text-[var(--foreground)]'
                                }
                            `}>
                                {item.label}
                            </span>
                            
                            {/* External link icon */}
                            {item.url && (
                                <Link 
                                    href={item.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="flex-shrink-0 p-1 hover:bg-[var(--surface-hover)] rounded transition-colors"
                                >
                                    <svg 
                                        xmlns="http://www.w3.org/2000/svg" 
                                        viewBox="0 0 24 24" 
                                        className="w-4 h-4 text-[var(--foreground-secondary)]" 
                                        fill="none" 
                                        stroke="currentColor" 
                                        strokeWidth="2" 
                                        strokeLinecap="round" 
                                        strokeLinejoin="round"
                                    >
                                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                                        <polyline points="15,3 21,3 21,9"/>
                                        <line x1="10" y1="14" x2="21" y2="3"/>
                                    </svg>
                                </Link>
                            )}
                        </div>
                    );
                })}
            </div>
            </div>
            
            {/* Progress Summary - positioned below the topics */}
            <div className="w-full p-2 pt-8">
                <div className="p-3 bg-[var(--surface)] rounded-lg border border-[var(--border-subtle)]">
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-sm text-[var(--foreground-secondary)]">Progress</span>
                        <span className="text-sm font-medium text-[var(--primary)]">
                            {getCompletedCount()}/{progressItems.length}
                        </span>
                    </div>
                    <div className="w-full bg-[var(--border-subtle)] rounded-full h-2">
                        <div 
                            className="bg-[var(--primary)] h-2 rounded-full transition-all duration-500 ease-in-out"
                            style={{ width: `${getProgressPercentage()}%` }}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
