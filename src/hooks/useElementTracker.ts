import { useEffect, useCallback, useRef } from 'react';
import { TrackableElement, ELEMENT_PRIORITIES } from '../types/learning';
import { useLearning } from '../contexts/LearningContext';

interface UseElementTrackerOptions {
  component: string;
}

export function useElementTracker({ component }: UseElementTrackerOptions) {
  const { registerElement, unregisterElement, updateElementState } = useLearning();
  const registeredElements = useRef<Set<string>>(new Set());

  const registerTrackableElement = useCallback((
    elementId: keyof typeof ELEMENT_PRIORITIES,
    overrides: Partial<TrackableElement> = {}
  ) => {
    const config = ELEMENT_PRIORITIES[elementId];
    if (!config) {
      return;
    }

    const element: TrackableElement = {
      id: elementId,
      component,
      type: 'general', // Default, can be overridden
      complexity: config.base >= 80 ? 'high' : config.base >= 50 ? 'medium' : 'low',
      isDetailed: config.detailed,
      isInteractive: config.interactive,
      priority: config.base,
      lessonCategory: elementId,
      ...overrides
    };

    registerElement(element);
    registeredElements.current.add(elementId);
    return element;
  }, [component, registerElement]);

  const unregisterTrackableElement = useCallback((elementId: string) => {
    unregisterElement(elementId);
    registeredElements.current.delete(elementId);
  }, [unregisterElement]);

  const updateTrackableElement = useCallback((elementId: string, updates: Partial<TrackableElement>) => {
    updateElementState(elementId, updates);
  }, [updateElementState]);

  // Removed bulk helpers to avoid naming collisions and keep API minimal

  // Cleanup all registered elements when component unmounts
  useEffect(() => {
    const elements = registeredElements.current;
    return () => {
      // Clean up all elements registered by this component
      elements.forEach(elementId => {
        unregisterElement(elementId);
      });
      elements.clear();
    };
  }, [unregisterElement]);

  const { setHoveredElement } = useLearning();

  const onHoverStart = useCallback((elementId: string) => {
    registeredElements.current.add(elementId);
    setHoveredElement(elementId);
  }, [setHoveredElement]);

  const onHoverEnd = useCallback((elementId: string) => {
    if (registeredElements.current.has(elementId)) {
      setHoveredElement(null);
    }
  }, [setHoveredElement]);

  return {
    registerElement: registerTrackableElement,
    unregisterElement: unregisterTrackableElement,
    updateElement: updateTrackableElement,
    onHoverStart,
    onHoverEnd,
  };
}
