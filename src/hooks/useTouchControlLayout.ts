import { useCallback, useEffect, useMemo, useState } from "react";

export const ButtonCategories = ["dpad", "ab", "select-start"] as const;
export type CategoryId = (typeof ButtonCategories)[number];

export type LayoutOrientation = "portrait" | "landscape";

export interface CategoryCoordinates {
  x: number;
  y: number;
}

export type ButtonCoordinates = Partial<
  Record<CategoryId, CategoryCoordinates>
>;

export interface LayoutState {
  portrait: ButtonCoordinates;
  landscape: ButtonCoordinates;
}

interface LocalStorageMethods {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const STORAGE_KEY = "gbc-touch-control-layouts:v1";
const MIN_OFFSET = -100;
const MAX_OFFSET = 100;

const emptyLayouts = (): LayoutState => ({
  portrait: {},
  landscape: {},
});

const isPosition = (value: unknown): value is CategoryCoordinates => {
  if (!value || typeof value !== "object") return false;

  const { x, y } = value as Record<string, unknown>;
  return (
    typeof x === "number" &&
    Number.isFinite(x) &&
    typeof y === "number" &&
    Number.isFinite(y)
  );
};

export const clampControlPosition = (
  position: CategoryCoordinates,
): CategoryCoordinates => ({
  x: Math.min(MAX_OFFSET, Math.max(MIN_OFFSET, position.x)),
  y: Math.min(MAX_OFFSET, Math.max(MIN_OFFSET, position.y)),
});

const parseLayout = (value: unknown): ButtonCoordinates => {
  if (!value || typeof value !== "object") return {};

  const source = value as Record<string, unknown>;
  return Object.fromEntries(
    ButtonCategories.flatMap((id) => {
      const position = source[id];
      return isPosition(position) ? [[id, clampControlPosition(position)]] : [];
    }),
  ) as ButtonCoordinates;
};

export const parseControlLayouts = (serialized: string | null): LayoutState => {
  if (!serialized) return emptyLayouts();

  try {
    const value: unknown = JSON.parse(serialized);
    if (!value || typeof value !== "object") return emptyLayouts();

    const source = value as Record<string, unknown>;
    return {
      portrait: parseLayout(source.portrait),
      landscape: parseLayout(source.landscape),
    };
  } catch {
    return emptyLayouts();
  }
};

export const loadControlLayouts = (
  storage: Pick<LocalStorageMethods, "getItem">,
): LayoutState => parseControlLayouts(storage.getItem(STORAGE_KEY));

export const saveControlLayouts = (
  storage: Pick<LocalStorageMethods, "setItem">,
  layouts: LayoutState,
) => {
  storage.setItem(STORAGE_KEY, JSON.stringify(layouts));
};

export const resetTouchControlOrientation = (
  layouts: LayoutState,
  orientation: LayoutOrientation,
): LayoutState => ({
  ...layouts,
  [orientation]: {},
});

const getOrientation = (): LayoutOrientation =>
  window.matchMedia("(orientation: landscape)").matches
    ? "landscape"
    : "portrait";

export const useTouchControlLayout = () => {
  const [orientation, setOrientation] = useState<LayoutOrientation>(() =>
    typeof window === "undefined" ? "portrait" : getOrientation(),
  );
  const [layouts, setLayouts] = useState<LayoutState>(() => {
    if (typeof window === "undefined") return emptyLayouts();

    return loadControlLayouts(window.localStorage);
  });

  useEffect(() => {
    const query = window.matchMedia("(orientation: landscape)");
    const updateOrientation = () => setOrientation(getOrientation());

    updateOrientation();
    query.addEventListener("change", updateOrientation);
    window.addEventListener("resize", updateOrientation);

    return () => {
      query.removeEventListener("change", updateOrientation);
      window.removeEventListener("resize", updateOrientation);
    };
  }, []);

  const updatePosition = useCallback(
    (control: CategoryId, position: CategoryCoordinates) => {
      setLayouts((current) => {
        const next = {
          ...current,
          [orientation]: {
            ...current[orientation],
            [control]: clampControlPosition(position),
          },
        };
        saveControlLayouts(window.localStorage, next);
        return next;
      });
    },
    [orientation],
  );

  const resetCurrentOrientation = useCallback(() => {
    setLayouts((current) => {
      const next = resetTouchControlOrientation(current, orientation);
      saveControlLayouts(window.localStorage, next);
      return next;
    });
  }, [orientation]);

  return {
    orientation,
    positions: useMemo(() => layouts[orientation], [layouts, orientation]),
    updatePosition,
    resetCurrentOrientation,
  };
};
