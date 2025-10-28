'use client';

import React, { createContext, useContext, useState, useCallback, useMemo, ReactNode, useRef } from 'react';
import { TrackableElement, Lesson, LearningContextType, LESSONS_DATABASE } from '../types/learning';

const LearningContext = createContext<LearningContextType | undefined>(undefined);

interface LearningProviderProps {
  children: ReactNode;
}

export function LearningProvider({ children }: LearningProviderProps) {
  const [visibleElements, setVisibleElements] = useState<TrackableElement[]>([]);
  const [hoveredElementId, setHoveredElementId] = useState<string | null>(null);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  // Reference counts per element id to avoid unregister/register tug-of-war
  const refCounts = useRef<Map<string, number>>(new Map());

  const registerElement = useCallback((element: TrackableElement) => {
    // Increment refcount first
    const current = refCounts.current.get(element.id) || 0;
    refCounts.current.set(element.id, current + 1);

    setVisibleElements(prev => {
      const exists = prev.find(e => e.id === element.id);
      if (exists) {
        // shallow compare relevant fields to avoid loops
        const same =
          exists.component === element.component &&
          exists.type === element.type &&
          exists.complexity === element.complexity &&
          exists.isDetailed === element.isDetailed &&
          exists.isInteractive === element.isInteractive &&
          exists.priority === element.priority &&
          exists.lessonCategory === element.lessonCategory;
        if (same) return prev;
        return prev.map(e => (e.id === element.id ? { ...exists, ...element } : e));
      }
      return [...prev, element].sort((a, b) => b.priority - a.priority);
    });
  }, []);

  const unregisterElement = useCallback((elementId: string) => {
    // Decrement refcount; only remove when it reaches 0
    const current = refCounts.current.get(elementId) || 0;
    const nextCount = Math.max(0, current - 1);
    if (nextCount > 0) {
      refCounts.current.set(elementId, nextCount);
      return; // nothing to update in visibleElements
    }
    refCounts.current.delete(elementId);

    setVisibleElements(prev => {
      if (!prev.some(e => e.id === elementId)) return prev;
      const next = prev.filter(e => e.id !== elementId);
      return next.length === prev.length ? prev : next;
    });
  }, []);

  const updateElementState = useCallback((elementId: string, updates: Partial<TrackableElement>) => {
    setVisibleElements(prev => {
      let changed = false;
      const next = prev.map(e => {
        if (e.id !== elementId) return e;
        const merged = { ...e, ...updates } as TrackableElement;
        const same =
          e.component === merged.component &&
          e.type === merged.type &&
          e.complexity === merged.complexity &&
          e.isDetailed === merged.isDetailed &&
          e.isInteractive === merged.isInteractive &&
          e.priority === merged.priority &&
          e.lessonCategory === merged.lessonCategory;
        if (same) return e;
        changed = true;
        return merged;
      });
      if (!changed) return prev;
      return next.sort((a, b) => b.priority - a.priority);
    });
  }, []);

  const activeLessons = useMemo(() => {
    // Helper: map component to logical layer
    const getLayerForComponent = (component?: string) => {
      if (!component) return 0;
      if (component === 'VaultInteractionOverlay') return 2;
      if (component === 'VaultDetailed') return 1;
      // WalletOverview, VaultList, VaultListCard, Dashboard, etc. are top-level (0)
      return 0;
    };

    // Build id -> layer map from currently visible elements
    const idToLayer = new Map<string, number>();
    for (const el of visibleElements) {
      idToLayer.set(el.id, getLayerForComponent(el.component));
    }

    // Determine which two deepest layers are active
    const presentLayers = Array.from(new Set(visibleElements.map(el => getLayerForComponent(el.component))));
    const maxLayer = presentLayers.length ? Math.max(...presentLayers) : 0;
    const minLayer = Math.max(0, maxLayer - 1);
    // If nothing visible, show base
    if (visibleElements.length === 0) {
      const base = [
        LESSONS_DATABASE['general-defi'],
        LESSONS_DATABASE['morpho-protocol']
      ];
      // Promote hovered if any
      if (hoveredElementId) {
      const hovered = Object.values(LESSONS_DATABASE).filter(l => l.elementIds.includes(hoveredElementId));
      const dedup = [...hovered, ...base]
        .filter((l, i, arr) => l && arr.findIndex(x => x.id === l.id) === i)
        .sort((a, b) => a.priority - b.priority);
      return dedup;
      }
      return base;
    }

    // Collect lessons for elements in the last two layers only
    const lessonsForVisible: Lesson[] = [];
    for (const el of visibleElements) {
      const layer = getLayerForComponent(el.component);
      if (layer < minLayer || layer > maxLayer) continue;
      for (const lesson of Object.values(LESSONS_DATABASE)) {
        if (lesson.elementIds.includes(el.id) && !lessonsForVisible.find(l => l.id === lesson.id)) {
          lessonsForVisible.push(lesson);
        }
      }
    }

    // If hovering, ensure hovered lessons are first
    if (hoveredElementId) {
      // Always include hovered lessons (even if outside layer filter)
      const hovered = Object.values(LESSONS_DATABASE).filter(l => l.elementIds.includes(hoveredElementId));
      const dedup = [...hovered, ...lessonsForVisible]
        .filter((l, i, arr) => l && arr.findIndex(x => x.id === l.id) === i)
        .sort((a, b) => a.priority - b.priority);
      // Pin Wallets 101 to top if wallet overview is visible
      const walletVisible = visibleElements.some(e => e.id === 'wallet-overview-section');
      if (walletVisible) {
        const walletLesson = LESSONS_DATABASE['wallets-basics'];
        const without = dedup.filter(l => l.id !== walletLesson.id);
        return [walletLesson, ...without];
      }
      return dedup;
    }

    // Otherwise sort by increasing depth (lower priority = more basic)
    const sorted = lessonsForVisible.sort((a, b) => a.priority - b.priority);
    // Pin Wallets 101 to top if wallet overview is visible
    const walletVisible = visibleElements.some(e => e.id === 'wallet-overview-section');
    if (walletVisible) {
      const walletLesson = LESSONS_DATABASE['wallets-basics'];
      const without = sorted.filter(l => l.id !== walletLesson.id);
      return [walletLesson, ...without];
    }
    return sorted;
  }, [visibleElements, hoveredElementId]);

  const value: LearningContextType = {
    visibleElements,
    activeLessons,
    hoveredElementId,
    setHoveredElement: setHoveredElementId,
    selectedElementId,
    setSelectedElement: setSelectedElementId,
    registerElement,
    unregisterElement,
    updateElementState,
  };

  return (
    <LearningContext.Provider value={value}>
      {children}
    </LearningContext.Provider>
  );
}

export function useLearning() {
  const context = useContext(LearningContext);
  if (context === undefined) {
    throw new Error('useLearning must be used within a LearningProvider');
  }
  return context;
}



