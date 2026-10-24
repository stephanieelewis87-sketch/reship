import type { Platform } from "../../../src/lib/types";
import { NotReadyError, type Connector } from "./types";
import { mercari } from "./mercari";
import { poshmark } from "./poshmark";

// Placeholder until a marketplace's sold-orders page and label download have been mapped
// against a real seller account. The popup shows these as "coming soon".
function pending(platform: Platform, loginUrl: string): Connector {
  return {
    platform,
    loginUrl,
    isLoggedIn: async () => {
      throw new NotReadyError(platform);
    },
    listOrdersToShip: async () => {
      throw new NotReadyError(platform);
    },
    downloadLabel: async () => {
      throw new NotReadyError(platform);
    },
  };
}

export const CONNECTORS: Connector[] = [
  poshmark,
  mercari,
  pending("Depop", "https://www.depop.com/login/"),
  pending("Vinted", "https://www.vinted.com/member/signup/select_type"),
  pending("WhatNot", "https://www.whatnot.com/login"),
];
