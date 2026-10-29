import type { Platform } from "../../../src/lib/types";
import { mercariLister } from "./mercari";
import type { Lister } from "./types";
import { vintedLister } from "./vinted";

export const LISTERS: Partial<Record<Platform, Lister>> = {
  Mercari: mercariLister,
  Vinted: vintedLister,
};
