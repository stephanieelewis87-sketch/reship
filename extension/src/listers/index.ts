import type { Platform } from "../../../src/lib/types";
import { mercariLister } from "./mercari";
import type { Lister } from "./types";

export const LISTERS: Partial<Record<Platform, Lister>> = {
  Mercari: mercariLister,
};
